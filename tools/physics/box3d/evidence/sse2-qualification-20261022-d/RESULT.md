# Isolated SSE2 candidate qualification

This directory is diagnostic output only. No default product, original vendor
source, version lock, facade, old raw evidence, or frozen 320-file inventory was
modified. The candidate is not approved or promoted to the default build.

## Actual outcomes

1. Unchanged core, complete real native fixture, GCC 14.2, UBSan-only:
   FAIL, exit 1. The original `b3LoadV` misaligned `const double` load reproduces
   during closest-ray traversal. Full original stdout/stderr and stack are kept.
2. Isolated candidate core, same complete fixture, GCC 14.2, UBSan-only:
   PASS, exit 0. This runs the real 60-tick freefall/impulse/raycast, box mass and
   inertia, damping, 600-tick sphere-floor contact, and 16 native lifecycle tests.
   Ray fraction is 0.375, settled height 0.499929637, contact count 1, and core
   live bytes return from 0 to 0. This is not an ASan/LSan pass or a full test suite.
3. Isolated candidate core, complete ASan+UBSan build:
   BLOCKED_LSAN_PTRACE, exit 1. LeakSanitizer reports its ptrace runtime limitation.
   Leak detection remains explicitly enabled. No sanitizer is disabled, suppressed,
   or relabelled as passed to conceal that outcome.
4. Real candidate ST SIMD WASM Release:
   PASS for the finite physics/ownership diagnostic. The current unmodified-core
   Release artifact is hash-verified and executed anew as a control, not replaced
   with a mock or treated as passing merely from an old receipt. All 60 tick
   samples, 122 invalid-operation before/after states, 128 slot-reuse cycles and
   128 world-lifetime cycles match exactly. Both memories are unshared, initially
   264 pages, with a maximum of 32768 pages.

The candidate removes the observed real-core UBSan error in this GCC fixture and
preserves the tested WASM behavior. This evidence does not prove all-code UB
absence, complete sanitizer acceptance, browser/CSP qualification, cross-compiler
behavior, performance, perpetual-ID safety, or full G1 completion.

## Source and identity binding

- Upstream base: `efca0c184d40fd6a82016983f1601c4d23965867`.
- All 130 original imported files were verified before staging. All 111 core files
  were independently copied and hash-verified. Exactly one staged header changes.
- Patch SHA256: `e5c4e5f2ae7f015cf62dfc2de5a36af73cc15d9b0ca0118fc0259c7d1f0b1403`.
- Original `src/simd_sse2.h` SHA256:
  `cc18b1f4f90fdceebb84b57f77e04c03009851a3a4c66439169318aa22a02719`.
- Candidate header SHA256:
  `2295eae13388e656dc71396530ea928ecc575c8a86009182d76a9ef69333e8f6`.
- The original header uses `_mm_load_sd((const double*)src)`. The existing candidate
  reads the three float objects using `_mm_setr_ps(src[0], src[1], src[2], 0)`.
  SIMD remains enabled; no scalar-engine substitute or broader patch is applied.
- The copied WASM host preserves the original build flags and redirects only its
  core source directory. It adds two qualification-only identity exports from a
  separate translation unit; the physics shim and facade remain byte-identical.
  Runtime patch/header SHA values are verified against the staged files and
  candidate manifest. The manifest explicitly says `qualificationOnly: true`
  and defines `coreSha` as the upstream base plus the listed candidate patch.
- Candidate WASM SHA256:
  `2468d5d6e2bdde17ef4198dfd21f0f6f960ebe03884fe85cc1385e2b2151297c`.

## Commands and evidence

From the frozen repository checkout, the actual commands were:

```sh
node tools/physics/box3d/output/sse2-qualification-20261022-d/run-native.mjs
source /workspace/scratch/62d43a81bbde/box3d-toolchain-20261022/use-toolchain.sh
node tools/physics/box3d/output/sse2-qualification-20261022-d/run-wasm.mjs
```

All compilation is sequential. `native-qualification.json` records 171 commands
with exact flags, child-process sanitizer settings and individual log paths.
`wasm-qualification.json` records the copied host inputs, actual compile/import/
memory audit, runtime patch identity, fresh executions and exact comparison.
The scripts reject existing receipts. To reproduce, use a new sibling output
directory and the corresponding frozen input snapshot, not an overwritten run.

## Recommendation, not an applied change

The candidate merits a separately reviewed patch-intake increment. If approved,
retain original vendor bytes, stage a strict hash-verified patched build tree,
and bind base revision, patch hash, before/after header hash and resulting artifact
hashes to both build manifest and runtime identity. Default facade verification
must not treat a patched build as indistinguishable from its upstream base.

Do not promote full sanitizer or G1 status. ASan/LSan needs a supported execution
environment; browser/CSP remains infrastructure-blocked. Compiler coverage and
performance remain unmeasured. The native historical sanitizer FAIL stays intact.
