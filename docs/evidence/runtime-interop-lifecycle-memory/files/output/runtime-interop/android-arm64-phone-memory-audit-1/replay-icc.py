"""Independent whole-image LittleCMS replay from retained raw PNG ICC bytes."""
import base64
import hashlib
import io
import json
from pathlib import Path
import sys

import PIL
from PIL import Image, ImageCms

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
PLAN = OUT / "icc-inputs.json"
RESULT = OUT / "icc-replay.json"
assert not RESULT.exists(), "Preserve the prior replay; choose a new audit attempt"
sha = lambda data: hashlib.sha256(data).hexdigest()
plan = json.loads(PLAN.read_text())
records = []
for entry in plan:
    raw_file = ROOT / entry["raw"]
    srgb_file = ROOT / entry["srgb"]
    metadata = json.loads((ROOT / entry["metadata"]).read_text())
    raw = Image.open(raw_file)
    raw.load()
    icc = raw.info.get("icc_profile")
    assert icc and sha(icc) == metadata["icc"]["sha256"]
    assert icc == base64.b64decode(metadata["icc"]["base64"], validate=True)
    assert icc == (ROOT / entry["icc"]).read_bytes()
    source_profile = ImageCms.ImageCmsProfile(io.BytesIO(icc))
    target_profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB"))
    replayed = ImageCms.profileToProfile(raw.convert("RGBA"), source_profile, target_profile,
                                        renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC,
                                        outputMode="RGBA", inPlace=False, flags=ImageCms.Flags.NONE)
    retained = Image.open(srgb_file)
    retained.load()
    assert retained.mode == "RGBA" and replayed.size == raw.size == retained.size
    full_pixels_equal = replayed.tobytes() == retained.tobytes()
    assert full_pixels_equal, "Whole-image RGBA replay differs: " + entry["id"]
    assert replayed.getchannel("A").tobytes() == raw.convert("RGBA").getchannel("A").tobytes()
    target_icc = retained.info["icc_profile"]
    assert sha(target_icc) == metadata["icc"]["outputProfileSha256"]
    assert ImageCms.getProfileDescription(ImageCms.ImageCmsProfile(io.BytesIO(target_icc))).strip() == "sRGB built-in"
    b = entry["bounds"]
    rectangle = (b["x"], b["y"], b["x"] + b["width"], b["y"] + b["height"])
    raw_crop = Image.open(ROOT / entry["rawCrop"])
    srgb_crop = Image.open(ROOT / entry["srgbCrop"])
    assert raw.crop(rectangle).convert("RGBA").tobytes() == raw_crop.convert("RGBA").tobytes()
    assert replayed.crop(rectangle).tobytes() == srgb_crop.convert("RGBA").tobytes()
    output = OUT / (entry["id"] + ".replayed-srgb.png")
    assert not output.exists()
    with output.open("xb") as stream:
        replayed.save(stream, format="PNG", icc_profile=target_profile.tobytes())
    records.append({
        "id": entry["id"], "pass": True, "rawSha256": sha(raw_file.read_bytes()),
        "storedSrgbSha256": sha(srgb_file.read_bytes()), "sourceIccSha256": sha(icc),
        "sourceProfileDescription": ImageCms.getProfileDescription(source_profile).strip(),
        "width": raw.width, "height": raw.height, "mode": replayed.mode,
        "wholeImageRgbaSha256": sha(replayed.tobytes()), "wholeImagePixelsExact": full_pixels_equal,
        "rawCropPixelsExact": True, "srgbCropPixelsExact": True,
        "renderingIntent": 1, "flags": 0, "alphaPreserved": True, "resize": False,
        "replayedFile": output.name, "replayedFileSha256": sha(output.read_bytes()),
    })
    raw.close()
    retained.close()
    raw_crop.close()
    srgb_crop.close()
modules = {}
for name, module in (("PIL", PIL), ("PIL.Image", Image), ("PIL.ImageCms", ImageCms),
                     ("PIL._imaging", Image.core), ("PIL._imagingcms", ImageCms.core)):
    file = Path(module.__file__).resolve()
    modules[name] = {"file": str(file), "sha256": sha(file.read_bytes())}
report = {"schema": "air-android-independent-icc-replay-v1", "completed": True, "pass": True,
          "records": records, "planSha256": sha(PLAN.read_bytes()),
          "producerSha256": sha(Path(__file__).read_bytes()),
          "versions": {"pillow": PIL.__version__, "littlecms": ImageCms.core.littlecms_version},
          "modules": modules,
          "encodingNote": "New sRGB profile creation dates may change encoded PNG hashes; every full-image RGBA byte must still match exactly."}
with RESULT.open("x", encoding="utf-8", newline="\n") as stream:
    json.dump(report, stream, indent=2)
    stream.write("\n")
print(json.dumps({"pass": True, "captures": len(records), "report": str(RESULT)}))
