# Strict staged SSE2 alignment patch

The default foundation build now uses the reviewed patch from `lock.json`. It does
not edit `vendor/box3d/core`. `patch-intake.mjs` copies the complete verified core
closure into a fresh build-local `staged-core`, matches the patch SHA and every
before/after SHA, and applies exact unified-diff hunk positions and context. No
fuzz, offsets, renames, symlinks, extra files or missing files are accepted.
CMake independently checks staging before configuring, and the build checks it
again after compilation. These checks detect drift, not malicious compiler tools.

The chain identity is SHA-256 of UTF-8 compact JSON in this precise key order:
`{schemaVersion,baseCoreCommit,patches:[{id,sha256,files:[{path,beforeSha256,afterSha256}]}]}`.
Array order is significant. `canonicalPatchChain` defines the serialization.
Patch source paths are recorded in the lock, but not part of this content identity.
The version lock separately anchors the complete patch-lock bytes.

Current `patchChainSha256`:
`20dd450a4313774e1d934df9fa9ec3458df35d9ee314beffa9d846404cdb86bf`.
It is compiled into `air_b3_patch_chain_sha`, checked by the static facade, and
recorded in the manifest and receipts. Wire ABI version remains 1: its layouts
have not changed. Old unpatched and qualification-only artifacts lack the formal
export and are rejected even if a manifest is rewritten to claim the new chain.
A trusted loader must additionally authenticate artifact hashes; exported identity
strings alone do not prove that arbitrary WASM executes the listed source.

The original core `b3LoadV` casts a float pointer to `const double*` for
`_mm_load_sd`, but a valid three-float input need only have four-byte alignment.
The patch uses `_mm_setr_ps` to read those three floats and zero the fourth lane.
It changes only `src/simd_sse2.h`; SIMD and float32 remain enabled.

The earlier `sse2-loadv-alignment.candidate.patch` and all prior raw failures stay
unchanged. Isolated d qualification ran the complete native fixture: original
UBSan-only FAIL, candidate UBSan-only PASS. The full candidate ASan/UBSan attempt
remains `BLOCKED_LSAN_PTRACE`, with leak detection enabled. d also compared real
candidate/control WASM physics and finite ownership fixtures successfully. Those
results are candidate qualification, not a claim that a new build already ran.

Formal staged build results belong to their own e receipts. Neither this intake
nor finite fixtures establish full sanitizer, performance, browser/CSP or G1
acceptance. Never suppress LSan, rewrite earlier failures, or replace the upstream
vendor bytes to make a gate green.
