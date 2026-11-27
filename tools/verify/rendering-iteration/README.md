# AI First rendering iteration v1.3: W0 verification

This is a W0 preparation slice, not G0-E approval, a rendering API change, or
12 accepted scenes. The fixed baseline is
`9ea3ea951b5b452f2809864ce76b7fca71f37fd6`. The worktree started clean.
The SDK baseline at that exact revision built and passed the two-bundle package
marker check. Twelve selected existing Jest suites passed 92 tests (HDR,
screen-pass, multipass, attachments, depth, colors, rendering queue and glTF
transmission). These are targeted source tests, not hardware HDR evidence.

## Verify input

Use the v1.3 implementation ZIP supplied separately. Reference images and
assets are not published by this tool. It never extracts the archive or
executes a packaged script.

```sh
python3 tools/verify/rendering-iteration/intake.py --pack <v1.3-zip> --out <new-receipt.json>
(cd tools/verify/rendering-iteration && PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v)
```

The actual ZIP (`a4afe721a849ca2dcad3986057ce8edd10aa7d800f654c9e7e87acd1e4173bce`)
matched 97 file identities and the R00–R17, AF00–AF07 and E01–E12 inventories.
There were 12 guides and 10 PNG candidates. E01 is pending art review, E09 is
a procedural draft, E02–E08 and E10 are blockouts in the ZIP, and E11/E12
have no per-scene image or asset directory in this package. Alternate concept art
must be pinned individually before target-specific tuning. No input becomes a
frozen target from a filename, color probe or successful hash verification.

## E12 independent static CPU reference

```sh
g++ -O3 -std=c++20 -Wall -Wextra -Werror \
  tools/verify/rendering-iteration/cornell-reference.cpp -o /tmp/e12-cornell
/tmp/e12-cornell <new-output-dir>
python3 tools/verify/rendering-iteration/audit_cornell.py <output-dir> --out <new-audit.json>
```

The finite-depth diffuse path tracer uses a fixed open-front Cornell box,
rectangular area light, neutral sphere and box, cosine-weighted continuation
and an explicit light visibility test. Linear RGB32F PFM files are the numeric
reference, not the clipped sRGB PPM previews. Same seed produces nested
1/16/64/256-spp checkpoints, plus a direct-only control with the same primary
samples. The independent auditor checks finite nonnegative radiance, decreasing
nested-checkpoint error and red/green bleed into two neutral back-wall regions.
It rejects the direct-only image substituted as the full result. These checks
do not constitute an independent noise estimate, temporal reference, art
approval, or proof of AIR global illumination.

Two attempts on the same compiler/host produced identical audited PFM hashes.
RMS to nested 256 spp was 0.22723, 0.04518, and 0.02173 respectively.
The 256-spp linear reference SHA-256 was
`b737feee4e4e0aec765fec599e2f9323389c7f43677d74bacbc0820311fb29fe`.
The left neutral patch gained 0.09144 red versus 0.04159 green; the right
gained 0.07797 green versus 0.04246 red. Cross-compiler bit identity is not
assumed.

## Remaining gates

- W0/G0-E is partial. WA-07 exact hardware HDR remains open; the software-only
  host cannot close it. U25 evidence is scoped and is not a replacement.
- Retain the existing API and reuse current Effect, render targets and timing
  capabilities before proposing new interfaces. Do not start dependent HDR
  feature work without its evidence.
- Real Agent baseline runs and per-scene VA approval remain outstanding.
  E12 needs the frozen art target, approved scene parameters, and a separate
  temporal reference. The CPU diagnostic does not release them.
- No default engine, package, historical evidence, Gallery catalog or hosted
  deployment changed.
