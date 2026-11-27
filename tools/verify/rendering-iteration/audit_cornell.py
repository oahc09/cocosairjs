"""Independent sanity checks for the E12 static diffuse transport diagnostic."""

import argparse
import hashlib
import json
import math
from pathlib import Path
import struct

SIZE = 160
ROI = {"leftNeutralBackWall": (30, 68), "rightNeutralBackWall": (130, 68)}


def read(path):
    with path.open("rb") as handle:
        tag, dims, scale = (handle.readline().strip() for _ in range(3))
        if tag != b"PF" or dims != b"160 160" or scale not in (b"-1.0", b"1.0"):
            raise ValueError(f"Unexpected float image header: {path.name}")
        data = handle.read()
    if len(data) != SIZE * SIZE * 12:
        raise ValueError(f"Unexpected float image size: {path.name}")
    pixels = list(struct.iter_unpack("<fff" if scale == b"-1.0" else ">fff", data))
    if any(not math.isfinite(value) or value < 0 for pixel in pixels for value in pixel):
        raise ValueError(f"Non-finite or negative radiance: {path.name}")
    return pixels


def mean_roi(pixels, center):
    x, y = center
    area = [pixels[(SIZE - 1 - py) * SIZE + px]
            for py in range(y - 2, y + 3) for px in range(x - 2, x + 3)]
    return [sum(pixel[c] for pixel in area) / len(area) for c in range(3)]


def rms(a, b):
    return math.sqrt(sum((x - y) ** 2 for p, q in zip(a, b) for x, y in zip(p, q)) / (len(a) * 3))


def audit(directory):
    spp = (1, 16, 64, 256)
    paths = [directory / f"cornell-{n}spp.pfm" for n in spp]
    control_path = directory / "cornell-direct-256spp.pfm"
    images = [read(path) for path in paths]
    control = read(control_path)
    full = images[-1]
    errors = [rms(image, full) for image in images[:-1]]
    if not errors[0] > errors[1] > errors[2] > 0:
        raise ValueError("Nested checkpoints do not converge towards 256 spp")
    regions = {}
    for index, (name, xy) in enumerate(ROI.items()):
        baseline = mean_roi(control, xy)
        if min(baseline) < 0.025 or max(baseline) - min(baseline) > 1e-5:
            raise ValueError(f"Direct-only neutral-region control failed: {name}")
        delta = [a - b for a, b in zip(mean_roi(full, xy), baseline)]
        if delta[index] - delta[1 - index] < 0.015:
            raise ValueError(f"Expected bounce color dominance missing: {name}")
        regions[name] = {"center": xy, "width": 5, "direct": baseline, "bounce": delta}
    return {
        "scope": "derived CPU diffuse transport reference, not runtime or visual acceptance",
        "seed": 20261127,
        "size": [SIZE, SIZE],
        "samples": spp,
        "rmsToNested256Spp": dict(zip(spp[:-1], errors)),
        "rois": regions,
        "linearImageSha256": {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                              for path in [*paths, control_path]},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    try:
        result = audit(args.directory)
        with args.out.open("x", encoding="utf-8") as handle:
            json.dump(result, handle, indent=2)
            handle.write("\n")
    except (OSError, ValueError) as exc:
        parser.exit(1, f"cornell-audit: {exc}\n")


if __name__ == "__main__":
    main()
