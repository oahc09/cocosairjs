"""Convert a known embedded PNG ICC profile to sRGB without changing geometry.

The raw input is immutable. Unknown/invalid ICC profiles are rejected. A PNG
without iCCP is copied byte for byte. All output paths must be new files.
"""

import argparse
import base64
import binascii
import hashlib
import io
import json
from pathlib import Path
import struct
import sys
import zlib

import PIL
from PIL import Image, ImageCms


KNOWN_PROFILES = {
    # Fingerprint of the phone's actual 520-byte Skia profile; never a fitted matrix.
    "6e72ac49fd45d1275f29daca1038a0b9af5befd0e891af9267f47ab066a5dffb":
        "Display P3 Gamut with sRGB Transfer",
}
MAX_ICC_BYTES = 16 * 1024 * 1024


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def require(value, message):
    if not value:
        raise ValueError(message)


def inspect_png(data):
    require(data[:8] == b"\x89PNG\r\n\x1a\n", "Input must be a PNG")
    offset = 8
    dimensions = None
    icc = None
    ended = False
    while offset < len(data):
        require(offset + 12 <= len(data), "Truncated PNG chunk header")
        length = struct.unpack_from(">I", data, offset)[0]
        end = offset + 12 + length
        require(end <= len(data), "Truncated PNG chunk data")
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:end - 4]
        crc = struct.unpack_from(">I", data, end - 4)[0]
        require(binascii.crc32(kind + payload) & 0xffffffff == crc,
                "PNG chunk CRC mismatch: " + kind.decode("ascii", errors="replace"))
        if kind == b"IHDR":
            require(dimensions is None and offset == 8 and length == 13, "Invalid PNG IHDR")
            width, height, depth, color_type = struct.unpack_from(">IIBB", payload)
            require(width > 0 and height > 0, "Invalid PNG dimensions")
            dimensions = (width, height, depth, color_type)
        elif kind == b"iCCP":
            require(icc is None, "Duplicate PNG iCCP")
            zero = payload.find(b"\0")
            require(1 <= zero <= 79 and zero + 2 <= len(payload), "Invalid PNG iCCP name")
            require(payload[zero + 1] == 0, "Unsupported PNG iCCP compression method")
            decompressor = zlib.decompressobj()
            profile = decompressor.decompress(payload[zero + 2:], MAX_ICC_BYTES + 1)
            require(len(profile) <= MAX_ICC_BYTES and not decompressor.unconsumed_tail,
                    "PNG ICC profile exceeds the bounded limit")
            require(decompressor.eof and not decompressor.unused_data, "Invalid PNG ICC zlib stream")
            require(len(profile) >= 128, "Truncated ICC profile")
            require(struct.unpack_from(">I", profile)[0] == len(profile) and profile[36:40] == b"acsp",
                    "Invalid ICC header")
            icc = {"name": payload[:zero].decode("latin-1"), "data": profile}
        elif kind == b"IEND":
            require(length == 0 and end == len(data), "Unexpected data after PNG IEND")
            ended = True
            break
        offset = end
    require(dimensions is not None and ended, "Incomplete PNG")
    return dimensions, icc


def file_record(file, data, image):
    return {
        "file": str(file), "sha256": sha256(data), "bytes": len(data),
        "width": image.width, "height": image.height, "mode": image.mode,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--metadata", required=True)
    args = parser.parse_args()
    source, output, metadata = [Path(value).resolve() for value in
                                (args.input, args.output, args.metadata)]
    require(len({source, output, metadata}) == 3, "Input and output paths must be distinct")
    require(not output.exists() and not metadata.exists(), "Output and metadata must be new files")
    require(output.parent.is_dir() and metadata.parent.is_dir(), "Output parent directories must exist")
    raw = source.read_bytes()
    dimensions, embedded = inspect_png(raw)
    with Image.open(io.BytesIO(raw)) as source_image:
        source_image.load()
        require(source_image.size == dimensions[:2], "PNG decoder dimensions differ from IHDR")
        image = source_image.copy()
    profile_info = {"present": embedded is not None}
    transform = None
    if embedded is None:
        converted = image
        encoded = raw
        action = "no-icc-byte-preserving-copy"
    else:
        profile_bytes = embedded["data"]
        fingerprint = sha256(profile_bytes)
        require(fingerprint in KNOWN_PROFILES, "Unknown ICC profile fingerprint: " + fingerprint)
        require(dimensions[2] == 8 and image.mode in ("RGB", "RGBA"),
                "ICC conversion requires an RGB or RGBA 8-bit PNG")
        source_profile = ImageCms.ImageCmsProfile(io.BytesIO(profile_bytes))
        description = ImageCms.getProfileDescription(source_profile).strip()
        require(description == KNOWN_PROFILES[fingerprint], "ICC profile description differs from the known profile")
        require(source_profile.profile.xcolor_space.strip() == "RGB", "Unsupported ICC input color space")
        target_profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB"))
        target_profile_bytes = target_profile.tobytes()
        original_alpha = image.convert("RGBA").getchannel("A").tobytes()
        converted = ImageCms.profileToProfile(
            image.convert("RGBA"), source_profile, target_profile,
            renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC,
            outputMode="RGBA", inPlace=False, flags=ImageCms.Flags.NONE,
        )
        require(converted.size == image.size and converted.mode == "RGBA", "ICC conversion changed geometry or mode")
        require(converted.getchannel("A").tobytes() == original_alpha, "ICC conversion changed alpha")
        buffer = io.BytesIO()
        converted.save(buffer, format="PNG", icc_profile=target_profile_bytes)
        encoded = buffer.getvalue()
        output_dimensions, output_icc = inspect_png(encoded)
        require(output_dimensions[:2] == dimensions[:2] and output_dimensions[2:] == (8, 6),
                "Normalized PNG is not same-size RGBA8")
        require(output_icc is not None and output_icc["data"] == target_profile_bytes,
                "Normalized PNG did not preserve the actual sRGB output profile")
        profile_info.update({
            "name": embedded["name"], "bytes": len(profile_bytes), "sha256": fingerprint,
            "base64": base64.b64encode(profile_bytes).decode("ascii"),
            "description": description, "colorSpace": source_profile.profile.xcolor_space.strip(),
            "connectionSpace": source_profile.profile.connection_space.strip(),
            "deviceClass": source_profile.profile.device_class.strip(),
            "iccVersion": source_profile.profile.icc_version,
            "outputProfileSha256": sha256(target_profile_bytes),
            "outputProfileDescription": ImageCms.getProfileDescription(target_profile).strip(),
        })
        transform = {
            "engine": "Pillow.ImageCms/LittleCMS", "renderingIntent": 1,
            "renderingIntentName": "RELATIVE_COLORIMETRIC", "flags": 0,
            "inputProfile": "actual embedded ICC bytes", "outputProfile": "ImageCms.createProfile('sRGB')",
            "outputMode": "RGBA", "bitsPerChannel": 8, "resize": False, "alphaPreserved": True,
            "fittedFromExpectedPixels": False,
        }
        action = "icc-to-srgb"
    modules = {}
    for name, module in (("PIL", PIL), ("PIL.Image", Image), ("PIL.ImageCms", ImageCms),
                         ("PIL._imaging", Image.core), ("PIL._imagingcms", ImageCms.core)):
        file = Path(module.__file__).resolve()
        modules[name] = {"file": str(file), "sha256": sha256(file.read_bytes())}
    producer = Path(__file__).resolve()
    report = {
        "schema": "air-android-png-icc-normalization-v1", "completed": True, "pass": True,
        "action": action, "input": file_record(source, raw, image),
        "output": file_record(output, encoded, converted),
        "producer": {"file": str(producer), "sha256": sha256(producer.read_bytes())},
        "icc": profile_info, "transform": transform,
        "versions": {"python": sys.version, "pillow": PIL.__version__,
                     "littlecms": ImageCms.core.littlecms_version},
        "modules": modules,
        "scope": "Standard whole-image ICC conversion only; no resize, crop, pixel fitting, or oracle adjustment.",
        "noIccPolicy": "Preserve the original PNG bytes exactly; this does not infer a missing color profile.",
    }
    require(source.read_bytes() == raw, "Input changed during conversion")
    with output.open("xb") as stream:
        stream.write(encoded)
    with metadata.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    print(json.dumps({"completed": True, "pass": True, "action": action,
                      "metadata": str(metadata), "outputSha256": report["output"]["sha256"]}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(type(error).__name__ + ": " + str(error), file=sys.stderr)
        sys.exit(1)
