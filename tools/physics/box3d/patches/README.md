# Unapplied SSE2 alignment candidate

`sse2-loadv-alignment.candidate.patch` targets the pinned core only. It is NOT
applied to `vendor/box3d/core`, is not used by the default build, and is not listed
as an applied patch in the version lock.

The full real-native ASan/UBSan diagnostic fails in `b3LoadV` at
`src/simd_sse2.h:261`: `_mm_load_sd((const double*)src)` dereferences a double whose
address can legally have only four-byte alignment for a three-float input. The
observed call stack is closest-ray query → dynamic-tree ray cast → `b3LoadV`.
The upstream GCC 14 intrinsic implementation dereferences `const double*`.

`native/sse2_alignment_repro.c` reproduces this independently with an explicitly
8-byte-aligned float array and an input beginning one float into it. The unmodified
header exits 1 under UBSan. The isolated candidate keeps SIMD and reads exactly the
three float objects with `_mm_setr_ps`; the same UBSan-only diagnostic exits 0 with
lanes `[1,2,3,0]`. This is only a narrow candidate check, not full core acceptance,
performance proof, compiler matrix coverage or WASM proof.

The ASan+UBSan candidate attempt also encounters a LeakSanitizer environment error
at exit: LSan does not work under ptrace. That failure is retained, not suppressed
or relabelled PASS. A preceding linker attempt used the existing candidate source
directory as its executable name; its error is also retained before the corrected
executable-name retry.

Before applying the patch, review it explicitly, bind its hash and input blob to
the build identity, then rerun the complete native diagnostic and both real WASM
variants. Do not change original vendored bytes or mark the prior failed build as
passing. The reconstruction's initial sanitizer status remains FAIL.
