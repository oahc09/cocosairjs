"""E12 deterministic temporal micro-reference and fail-closed assessor.

This project-owned CPU fixture is deliberately separate from AIR and the static
Cornell transport reference. It exercises depth ordering, fences thinner than a
pixel, object motion, newly visible background and a discontinuous camera cut.
"""

import argparse
from array import array
from fractions import Fraction
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import sys

WIDTH, HEIGHT = 160, 96
SUPERSAMPLES = 4
CAMERA_CUT = 8
FRAME_COUNT = 16
FORMAT = "e12-temporal-linear-f32/v1"
ERROR_BUDGET = 0.035


def digest(data):
    return hashlib.sha256(data).hexdigest()


def render(frame):
    """Return coverage-resolved linear RGB and visible foreground object mask."""
    camera = (Fraction(frame, 3) if frame < CAMERA_CUT else Fraction(42) + Fraction(frame - CAMERA_CUT, 3))
    object_x = Fraction(28 + 5 * frame)
    camera_x, object_x = float(camera), float(object_x)
    pixels = array("f")
    object_pixels = set()
    inv = 1 / SUPERSAMPLES**2
    for y in range(HEIGHT):
        for x in range(WIDTH):
            red = green = blue = 0.0
            coverage = 0
            for sy in range(SUPERSAMPLES):
                py = y + (sy + 0.5) / SUPERSAMPLES
                for sx in range(SUPERSAMPLES):
                    px = x + (sx + 0.5) / SUPERSAMPLES
                    # Three orthographic depth layers with independent camera parallax.
                    fence_x = px + camera_x
                    ball_x = px + camera_x * 0.8
                    wall_x = px + camera_x * 0.55
                    if 18 < py < 80 and (fence_x % 5.5) < 0.73:
                        r, g, b = 0.14, 0.15, 0.18
                    elif ((ball_x - object_x) / 12) ** 2 + ((py - 49) / 12) ** 2 < 1:
                        r, g, b = 1.0, 0.32, 0.05
                        coverage += 1
                    else:
                        tile = (math.floor(wall_x / 13) + math.floor(py / 11)) % 2
                        if wall_x < 80:
                            r, g, b = 0.48 + 0.16 * tile, 0.23 + 0.12 * tile, 0.22
                        else:
                            r, g, b = 0.21 + 0.12 * tile, 0.43 + 0.16 * tile, 0.21
                    red += r
                    green += g
                    blue += b
            pixels.extend((red * inv, green * inv, blue * inv))
            if coverage >= SUPERSAMPLES**2 // 2:
                object_pixels.add(y * WIDTH + x)
    return pixels, object_pixels


def encode(pixels):
    if sys.byteorder == "little":
        return pixels.tobytes()
    copy = array("f", pixels)
    copy.byteswap()
    return copy.tobytes()


def read_frame(file):
    data = file.read_bytes()
    if len(data) != WIDTH * HEIGHT * 3 * 4:
        raise ValueError(f"Bad frame byte length: {file.name}")
    result = array("f")
    result.frombytes(data)
    if sys.byteorder != "little":
        result.byteswap()
    if any(not math.isfinite(value) or value < 0 or value > 1 for value in result):
        raise ValueError(f"Nonfinite or out-of-range SDR linear RGB: {file.name}")
    return result


def write_new_json(path, value):
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")


def frame_path(directory, index):
    return directory / f"frame-{index:03d}.rgb32f"


def generate(out):
    out.mkdir()
    frames = []
    for index in range(FRAME_COUNT):
        pixels, mask = render(index)
        data = encode(pixels)
        with frame_path(out, index).open("xb") as stream:
            stream.write(data)
        frames.append({"index": index, "sha256": digest(data), "visibleObjectPixels": len(mask)})
    write_new_json(out / "manifest.json", {
        "format": FORMAT, "width": WIDTH, "height": HEIGHT, "frames": frames,
        "color": "linear SDR RGB32F little-endian, top-to-bottom", "cameraCutIndex": CAMERA_CUT,
        "supersampleLattice": [SUPERSAMPLES, SUPERSAMPLES],
    })


def masked_error(a, b, mask):
    if not mask:
        raise ValueError("Unexpected empty temporal region")
    return sum(abs(a[i * 3 + c] - b[i * 3 + c]) for i in mask for c in range(3)) / (len(mask) * 3)


def audit(candidate):
    names = {file.name for file in candidate.glob("*.rgb32f")}
    expected_names = {frame_path(candidate, index).name for index in range(FRAME_COUNT)}
    if names != expected_names:
        raise ValueError("Wrong frame set; missing and surplus temporal frames are not allowed")
    previous_mask = set()
    rows = []
    for index in range(FRAME_COUNT):
        truth, visible = render(index)
        path = frame_path(candidate, index)
        frame = read_frame(path)
        disoccluded = previous_mask - visible
        row = {
            "index": index,
            "candidateSha256": digest(path.read_bytes()),
            "referenceSha256": digest(encode(truth)),
            "meanError": masked_error(frame, truth, range(WIDTH * HEIGHT)),
            "disocclusionPixels": len(disoccluded),
            "disocclusionError": masked_error(frame, truth, disoccluded) if index else None,
        }
        if index == CAMERA_CUT:
            # The synthetic camera cut must reset history even outside the mover ROI.
            frame_errors = sorted(abs(a - b) for a, b in zip(frame, truth))
            row["cutP95ChannelError"] = frame_errors[math.ceil(0.95 * len(frame_errors)) - 1]
        rows.append(row)
        previous_mask = visible
    failures = [
        {"index": row["index"], "metric": key, "error": row[key]}
        for row in rows for key in ("meanError", "disocclusionError", "cutP95ChannelError")
        if row.get(key) is not None and row[key] > ERROR_BUDGET
    ]
    return {
        "scope": "synthetic temporal micro-reference; not AIR runtime or E12 scene acceptance",
        "format": FORMAT,
        "errorBudget": ERROR_BUDGET,
        "passed": not failures,
        "failures": failures,
        "frames": rows,
    }


def main():
    if array("f").itemsize != 4 or struct.calcsize("f") != 4:
        raise RuntimeError("Float32 is required")
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    gen = commands.add_parser("generate")
    gen.add_argument("--out", type=Path, required=True)
    verify = commands.add_parser("audit")
    verify.add_argument("--candidate", type=Path, required=True)
    verify.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.action == "generate":
            generate(args.out)
        else:
            if os.path.lexists(args.out):
                raise FileExistsError(args.out)
            receipt = audit(args.candidate)
            write_new_json(args.out, receipt)
            if not receipt["passed"]:
                raise SystemExit(1)
    except (OSError, ValueError) as error:
        parser.exit(1, f"temporal-reference: {error}\n")


if __name__ == "__main__":
    main()
