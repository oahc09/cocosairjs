# Firefox resizable WASM-memory identity decoding

## Observed failure retained

On 2026-10-23, the original EX01 static preview60 and diagnostic-only preview61 failed before wall creation in official cloud Firefox 158.0.1. Static HTTP loading succeeded. The reported exception was:

`TypeError: TextDecoder.decode: ArrayBufferView branch of (ArrayBufferView or ArrayBuffer) can't be a resizable ArrayBuffer or ArrayBufferView`.

The diagnostic-only source61 preserved the original Error without suppressing it. The real browser console reported `text` at `build/cocosair.module.js:171371`, `createBox3DBinding` at line 171379, loader promise at line 173328, and the console caller at `main.ts:147:13`. This establishes the failing call as our binding facade native-identity decoder, not an inferred Emscripten print decoder failure. Preview60/61 artifacts and RED results remain unchanged.

## Narrow correction

The facade now copies the zero-terminated native identity bytes into a fresh, fixed-length Uint8Array before calling TextDecoder. It does not alter Emscripten, WASM memory policy, native values, identity comparisons, ABI/schema/variant checks, thread restrictions, or browser settings. No fallback backend or substitute animation is introduced.

The focused test is an identity-initialization source control, not a physics test or browser qualification. Its strict decoder deliberately rejects RAB-backed inputs to exercise the observed boundary; actual Firefox rerun and freshly generated normal runtime are separately required.

## Status at source freeze

Focused regression, fresh matching WASM receipt, normal production ESM, and actual Firefox rerun: pending. Formal 2128 cells and nine Gates remain NOT_RUN. Earlier close 7/8 RED and retained engine-global caches remain unchanged. Hull remains unimplemented publicly.

## New limited evidence before browser rerun

The same 34-case strict-decoder identity control produced 23 PASS / 11 FAIL against exact old facade eef6f4db bytes and 34 PASS / 0 FAIL against fixed source38a00916 on official Node22.16.0. These are mocked identity-only controls. A fresh single-mode Release WASM build completed with all 25 commands. At the original native archive freeze the separate artifact audit had not yet run. Its original inputs, raw output, original Firefox RED screenshot and build receipts are in Library libfile_12b4d4da0e008191b668984f31ed4623, ZIP SHA256 ebb6084de183b8fc576c03c392943e5605a64f28b791ca28fdcad813eb2d4ed1. All 496 downloaded members were individually checked. Native WASM code is unchanged; copied facade and build receipt are new. This does not rerun or upgrade prior public component, formal Gate or browser results.

## Audit timing correction and complete recovery references

The first production ESM attempt correctly stopped before compilation because artifact-audit.raw.json was absent. The earlier source63 wording overstated completion of the standalone artifact gate. This failure is retained, not replaced. The actual audit and full verifySTBuild then passed; their raw outputs, original failed ESM invocation, and exact source-control RED/GREEN bytes are in libfile_e57444b18800819181efe2302fccb37b (266653 bytes, SHA256 12a6f7523f83a1be9aeb594bcaa8374a9661deb2eb916c9a9ff7307c90197d5a; 50 downloaded members verified). Read this supplement together with native archive libfile_12b4d4da0e008191b668984f31ed4623; the original archive is unchanged and does not contain the later audit.

The second normal production ESM build completed with build number208. Its 1618 frozen source files were read and hashed from the independently Library-restored Git objects. The generated sourcemap contains the exact fixed facade source; no test-only registration entry was used. Runtime and original build raw are in libfile_10d819f6d7e88191836300ec178def6f (7755078 bytes, SHA256 9f3836190ccee53b7bb5fbde3f2f9f756120c59db720e4876a0f9183c1a69576; 42 downloaded members verified). Declarations did not change and were not rebuilt in this decoder-only iteration; source60 DTS remains the earlier actual evidence.

Source increments after source60 are libfile_3dad73cbceb88191bd35a1c43128e9ce (61, diagnostic), libfile_cb42604c3ec0819184cbaac34e7c4354 (62, fixed decoder), and libfile_2c9ed9211b608191ab229f5998f945e7 (63, tests and matching identity). Each includes its exact Git bundle, parent/base chain, bytes and hashes. Restore the listed predecessor chain before importing each increment, verify archive SHA256 and all manifest members, run git bundle verify, then check the expected commit/tree and changed blob SHA256. The actual restore used the previously independently restored baseline, not a claimed new empty-directory restore.

Original source63: 20af8ec2ea38a61b9cabc5ef2d12ea3dfa914d4d. Runtime producer has this exact identity. Browser rerun on its new independent static preview is pending at this document update. Earlier browser RED and 7/8 close RED are unchanged. This source/technical-doc Git delivery does not contain all raw; the explicit Library references above are necessary to restore that evidence.
