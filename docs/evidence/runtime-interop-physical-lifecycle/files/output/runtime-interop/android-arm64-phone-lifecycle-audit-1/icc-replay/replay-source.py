"""Independent full-image ICC replay for closed physical lifecycle captures.

Reads a retained evidence plan and writes only a new audit directory. It does
not import the collector's normalization implementation or operate a device.
"""

import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import sys
import traceback

import PIL
from PIL import Image, ImageCms


KNOWN_P3_SHA = "6e72ac49fd45d1275f29daca1038a0b9af5befd0e891af9267f47ab066a5dffb"
KNOWN_P3_DESCRIPTION = "Display P3 Gamut with sRGB Transfer"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    root = Path.cwd().resolve()
    plan_file = Path(args.plan).resolve()
    output = Path(args.out).resolve()
    output.mkdir(parents=False, exist_ok=False)
    inputs = {}

    def read(file):
        absolute = Path(file).resolve()
        data = absolute.read_bytes()
        record = {"bytes": len(data), "sha256": sha(data)}
        key = str(absolute)
        if key in inputs:
            require(inputs[key] == record, "Input changed during replay: " + key)
        else:
            inputs[key] = record
        return data

    def file(name):
        return (root / name).resolve()

    def rgba(data):
        image = Image.open(io.BytesIO(data))
        image.load()
        return image

    modules = {}
    versions = {"python": sys.version, "pillow": PIL.__version__, "littlecms": ImageCms.core.littlecms_version}
    result = {"schema": "air-android-phone-lifecycle-independent-icc-v1", "pass": False,
              "completed": False, "deviceOperations": False, "inputMutations": False,
              "records": [], "versions": versions}
    try:
        producer = Path(__file__).resolve()
        result["producer"] = {"file": str(producer), "sha256": sha(read(producer))}
        for name, module in (("PIL", PIL), ("PIL.Image", Image), ("PIL.ImageCms", ImageCms),
                             ("PIL._imaging", Image.core), ("PIL._imagingcms", ImageCms.core)):
            module_file = Path(module.__file__).resolve()
            modules[name] = {"file": str(module_file), "sha256": sha(read(module_file))}
        read(sys.executable)
        plan = json.loads(read(plan_file))
        require(isinstance(plan, list) and len(plan) > 0, "ICC replay plan is empty")
        identifiers = set()
        for entry in plan:
            identifier = entry["id"]
            require(isinstance(identifier, str) and identifier not in identifiers and
                    all(character.isalnum() or character in "-_." for character in identifier),
                    "Invalid or duplicate replay ID")
            identifiers.add(identifier)
            raw_bytes = read(file(entry["raw"]))
            srgb_bytes = read(file(entry["srgb"]))
            metadata = json.loads(read(file(entry["metadata"])))
            original = rgba(raw_bytes)
            retained = rgba(srgb_bytes)
            require(metadata["schema"] == "air-android-png-icc-normalization-v1" and
                    metadata["completed"] is True and metadata["pass"] is True,
                    "Normalization receipt is incomplete")
            require(metadata["input"]["sha256"] == sha(raw_bytes) and
                    metadata["output"]["sha256"] == sha(srgb_bytes), "Original/retained PNG hash differs")
            require(metadata["modules"] == modules and metadata["versions"] == versions,
                    "Pillow/LittleCMS runtime differs from retained normalization")
            require(original.size == retained.size and original.width == metadata["input"]["width"] and
                    original.height == metadata["input"]["height"] and retained.width == metadata["output"]["width"] and
                    retained.height == metadata["output"]["height"], "Whole-image geometry changed")
            source_icc = original.info.get("icc_profile")
            if source_icc is None:
                require(metadata["icc"]["present"] is False and metadata["action"] == "no-icc-byte-preserving-copy" and
                        metadata["transform"] is None and raw_bytes == srgb_bytes,
                        "PNG without ICC was altered")
                replayed = original.convert("RGBA")
                source_sha = None
                output_icc = None
            else:
                require(sha(source_icc) == KNOWN_P3_SHA and sha(source_icc) == metadata["icc"]["sha256"],
                        "Unknown or changed original ICC profile")
                require(source_icc == base64.b64decode(metadata["icc"]["base64"], validate=True) and
                        source_icc == read(file(entry["icc"])), "Retained original ICC bytes differ")
                source_profile = ImageCms.ImageCmsProfile(io.BytesIO(source_icc))
                require(ImageCms.getProfileDescription(source_profile).strip() == KNOWN_P3_DESCRIPTION and
                        source_profile.profile.xcolor_space.strip() == "RGB", "Original profile identity differs")
                require(metadata["action"] == "icc-to-srgb" and metadata["transform"]["renderingIntent"] == 1 and
                        metadata["transform"]["flags"] == 0 and metadata["transform"]["resize"] is False and
                        metadata["transform"]["alphaPreserved"] is True and
                        metadata["transform"]["fittedFromExpectedPixels"] is False,
                        "Retained ICC transform policy differs")
                target_profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB"))
                replayed = ImageCms.profileToProfile(original.convert("RGBA"), source_profile, target_profile,
                                                     renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC,
                                                     outputMode="RGBA", inPlace=False, flags=ImageCms.Flags.NONE)
                output_icc = retained.info.get("icc_profile")
                require(output_icc and sha(output_icc) == metadata["icc"]["outputProfileSha256"] and
                        ImageCms.getProfileDescription(ImageCms.ImageCmsProfile(io.BytesIO(output_icc))).strip() ==
                        "sRGB built-in", "Retained target sRGB profile differs")
                source_sha = sha(source_icc)
            require(replayed.mode == "RGBA" and replayed.size == original.size and
                    replayed.tobytes() == retained.convert("RGBA").tobytes(), "Independent whole-image RGBA replay differs")
            require(replayed.getchannel("A").tobytes() == original.convert("RGBA").getchannel("A").tobytes(),
                    "Independent replay changed alpha")
            bounds = entry["bounds"]
            coordinates = [bounds[name] for name in ("x", "y", "width", "height")]
            require(all(isinstance(number, int) and not isinstance(number, bool) for number in coordinates),
                    "Crop geometry is not integral")
            x, y, width, height = coordinates
            require(x >= 0 and y >= 0 and width == 320 and height == 240 and
                    x + width <= original.width and y + height <= original.height, "Physical crop is out of bounds")
            rectangle = (x, y, x + width, y + height)
            raw_crop = rgba(read(file(entry["rawCrop"])))
            srgb_crop = rgba(read(file(entry["srgbCrop"])))
            require(raw_crop.size == srgb_crop.size == (width, height) and
                    original.crop(rectangle).convert("RGBA").tobytes() == raw_crop.convert("RGBA").tobytes() and
                    replayed.crop(rectangle).tobytes() == srgb_crop.convert("RGBA").tobytes(),
                    "Independent original/interpreted crop pixels differ")
            saved = output / (identifier + ".replayed-srgb.png")
            with saved.open("xb") as stream:
                replayed.save(stream, format="PNG", **({"icc_profile": output_icc} if output_icc else {}))
            result["records"].append({"id": identifier, "pass": True, "sourceIccSha256": source_sha,
                                      "rawSha256": sha(raw_bytes), "retainedSrgbSha256": sha(srgb_bytes),
                                      "wholeImageRgbaSha256": sha(replayed.tobytes()), "wholeImagePixelsExact": True,
                                      "alphaPreserved": True, "resize": False, "rawCropPixelsExact": True,
                                      "srgbCropPixelsExact": True, "width": original.width, "height": original.height,
                                      "renderingIntent": 1 if source_sha else None, "flags": 0 if source_sha else None,
                                      "replayedFile": saved.name, "replayedFileSha256": sha(saved.read_bytes())})
            for image in (original, retained, replayed, raw_crop, srgb_crop):
                image.close()
        result["completed"] = True
    except Exception:
        result["error"] = traceback.format_exc()
    finally:
        try:
            for name, record in inputs.items():
                require(sha(Path(name).read_bytes()) == record["sha256"], "Replay input changed before closure: " + name)
            result["inputsUnchanged"] = True
        except Exception:
            result["inputStabilityError"] = traceback.format_exc()
            result["inputsUnchanged"] = False
        result["inputs"] = inputs
        result["modules"] = modules
        result["pass"] = result["completed"] and result["inputsUnchanged"] and "error" not in result
        with (output / "report.json").open("x", encoding="utf-8", newline="\n") as stream:
            json.dump(result, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        print(json.dumps({"pass": result["pass"], "images": len(result["records"]), "report": str(output / "report.json")}))
    return 0 if result["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
