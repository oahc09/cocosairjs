# Remaining regression gates: read-only audit, 2026-10-23

**Overall BLOCKED. This is a classification of retained failures, not a new test campaign or an engine acceptance PASS.**

The authorized feature branch was read back at `8d7db3d4e17efd3a355fa73dad4b3956321ae25a`; main remains `b573be0741db9e2a13d38ce7e65870b97a1f5fbc`. Its transmission-only layout reconstructs the original candidate `e40a9cf779400c317abdc9350dbe984b37d2b5e4`, tree `5d28c75644a22ec700d931e867d79a6e3e691dc9`. See [transport instructions](transport/README.md) before reading the two split archives. No original evidence, status, promotion, assertion, gate or runtime source was changed by this audit.

## Exact eight retained failures

The complete historical CPU campaign remains **221 suites, 3,702 tests, 3,694 passed, 8 failed, zero skipped**. All eight failures are in `output/upstream-update/m4-cpu-final-type-repaired/batch-024.json` inside `m4-final-attempts.tar.gz`; that batch has 8 failed and 87 passed tests.

1. `test/smoke/smoke-29-examples-spec.test.ts:76-79`: **§11/§12 证据链符合性零 fail（spec-compliance-audit）**. Its retained report has 196 examples, 684 failures and two warnings; the evidence and existing metadata conflicts are classified below.
2. `test/smoke/smoke-30-v12-regression.test.ts:318-330`: **F-3 簿记完整性：upstream-file-map / extraction-manifest 与磁盘事实一致**. `verify-file-map.cjs` exited 2 because the original upstream source directory was unavailable. The real source comparison did not execute.
3. `smoke-30-v12-regression.test.ts:511-516`: **证据在案且已完成：completed=true（缺标记即 NOT_RUN）**. The required matrix JSON did not exist.
4. `smoke-30-v12-regression.test.ts:519-523`: **产物绑定：矩阵记录的 bundle 与 d.ts 哈希就是当期构建产物**. Reading the missing matrix JSON failed with ENOENT.
5. `smoke-30-v12-regression.test.ts:526-528`: **契约绑定：矩阵断言自采证后未被放松**. Same missing matrix input.
6. `smoke-30-v12-regression.test.ts:531-557`: **每张截图仍在盘且与记录逐字节一致；断言全部为真**. Same missing matrix input.
7. `smoke-30-v12-regression.test.ts:560-574`: **覆盖率：契约里每个示例 × 每个声明引擎都有 PASS 记录（不许静默漏跑）**. Same missing matrix input.
8. `smoke-30-v12-regression.test.ts:577-590`: **证据目录对账：每个目录要么被矩阵记录引用，要么在册豁免**. Same missing matrix input; neither orphan captures nor stale exemptions may be silently discarded.

Items 3–8 all require `docs/evidence/browser-matrix/browser-matrix.json`. The unchanged contract declares **26 examples × Chromium/Firefox/WebKit = 78 combinations**. These are six missing-evidence assertions, not six observed browser feature failures. Closing them requires a complete current matrix with matching bundle/declaration/contract hashes, actual screenshots, full assertions and directory accounting. A successful Chromium-only probe or cloud-browser screenshot cannot substitute.

## Gallery evidence and existing metadata conflicts

The retained compliance report gives this exact failure distribution:

| Rule                 | Failures | Meaning                                                                                 |
| -------------------- | -------: | --------------------------------------------------------------------------------------- |
| S11-NO-EVIDENCE      |      184 | Stable examples lack accepted current runtime rows.                                     |
| S11-PROMOTION-DRIFT  |      184 | No current runtime row can substantiate the promotion tuple.                            |
| S23-MANIFEST         |      187 | 184 promotion mismatches and three status mismatches between specification and Gallery. |
| S15-ASSET-BIND       |      125 | Current evidence lacks content hashes for declared/sidecar assets.                      |
| S22-GALLERY          |        2 | Gallery entries for point-cloud-basics and video-basic lack promotion tuples.           |
| S11-EVIDENCE-NOT-RUN |        2 | Whole-file prerequisites examples-verified.json and devtools-examples.json are missing. |
| **Total**            |  **684** | Two additional warnings are not counted as failures.                                    |

The warnings concern gltf-draco's decoder-blocked positive lifecycle path and starfield-galaxy's short visual description. They are not rewritten or counted as passes.

An independent comparison of actual `git show` bytes from fixed main and the candidate confirms that **all 184 promotion mismatches and all three status mismatches already exist in main**. None of the original 188 manifest entries changed status or promotion in the candidate. The exact status conflicts are:

| Example            | Gallery status | Specification status |
| ------------------ | -------------- | -------------------- |
| point-cloud-basics | draft          | stable               |
| video-basic        | draft          | stable               |
| spark-splats       | draft          | experimental         |

The existing constrained publisher is not a repair-by-copy tool. `tools/verify/publish-example-evidence.cjs:161-228` requires a complete valid campaign and original custody/log/screenshot closure, then refreshes only already-existing stable promotions. Both sides must already be stable and have promotion fields. `example-evidence-campaign.cjs:416-420` also requires status agreement. Thus **a full browser run alone cannot publish through these three pre-existing status conflicts**. Their disposition must be explicitly reviewed within the project's authority, followed by a new freeze; this task does not promote, demote, restamp old evidence or relax the publisher.

The current ordinary campaign scope is 191 examples; five DevTools examples have a separate complete-run contract. The ordinary publisher does not produce `devtools-examples.json`. Keep the separate `tools/verify/devtools-examples.cjs --preserve-metadata` route and its complete-evidence consumer requirements.

## Original-source and license prerequisites

`tools/verify/verify-file-map.cjs:27,61-64` already supports `COCOS_UPSTREAM`; changing its default path cannot supply the missing input. It needs the exact original snapshot at `557b06f7e636572a15a426eb8c2387f40b92798a`, including its source and provenance, not a reconstructed extracted subset or another upstream ref.

The retained original-source recovery attempt found that the documented official repository redirects to the same canonical repository identity, but the pinned commit returned Git API 404 / REST commit API 422. That is a historical observation, not a new network check today.

The separate retained license audit has five unavailable original-source comparisons: `licenses/LICENSE_glslang.txt`, `licenses/LICENSE_spine.txt`, `licenses/LICENSE_DragonBones.txt`, `licenses/LICENSE_zlibjs.txt`, and `licenses/LICENSE_notepack.io.txt`. Existing distributed license text is not proof of its original source. Do not fill these gaps with unrelated license copies. The prior spark-rs pending disposition remains an independent ATTENTION item.

Real provider/model identity, raw paired generation observations and Agent admission remain separate blockers; they are **not** among these eight Jest failures. The later Three declaration preparation correction in [SDK-PREPARATION-REVISION-RESULT.md](SDK-PREPARATION-REVISION-RESULT.md) remains valid as preparation, not model execution.

## Baseline proof and limits

These files have identical main and candidate Git blob identities:

| File                                       | Git blob SHA-1                           |
| ------------------------------------------ | ---------------------------------------- |
| test/smoke/smoke-29-examples-spec.test.ts  | 7890683cde6f3a1be62d345d056e1a3dc78cb75b |
| test/smoke/smoke-30-v12-regression.test.ts | 86c0bbbdfe9ed9891dc3c861680bb7da7572b2c4 |
| tools/examples/spec-compliance-audit.cjs   | 1b71d84d9369a1ef234a69b95ade124dc1e2359d |
| tools/verify/verify-file-map.cjs           | 1a30e5cff48f4916d5eb88cc0d8b510b6465f67c |
| tools/verify/verify-licenses.cjs           | 3f0c73253036bc92375cb4ac66b540b94e02d356 |
| tools/verify/browser-matrix.cjs            | 0d8628ab23ae10e9153d84603075b3dffded5d7e |
| tools/verify/browser-matrix-contract.json  | 62d9b484a02f4989c57d269e5f5d0ac5d260a128 |
| tools/verify/publish-example-evidence.cjs  | 533cac01d0fc075076aa2726c2d3661e855be370 |

The three historical evidence JSON files have tree entries but unavailable blobs in this intentionally partial recovery. Consequently this audit **does not prove that fixed main itself executed with the same eight failures**. It proves the old metadata conflicts and byte-identical test/tool contracts, and classifies the actual retained candidate failures.

Archive SHA-256: `0d22c547bcf17dfdd9dc9b60d7f736b9d3a7ec80c906b7c52f9c09fb35f43d5e`.

Rehashed archive members:

| Member under output/upstream-update/                    |  Bytes | SHA-256                                                          |
| ------------------------------------------------------- | -----: | ---------------------------------------------------------------- |
| m4-cpu-final-type-repaired/batch-024.json               | 380615 | b5ffe845d43ef71dd63216a4a0a36c6606fef23f12d6967e1d669c2a5cec8b73 |
| m4-cpu-final-type-repaired/batch-024.log                | 158293 | 1596eb80463ed265cfde39be4e5f7b72e4fc32a4ff0a7258d4d4cf148f12d082 |
| m4-admission-final/current-spec-compliance-failure.json | 429899 | a63785cdf1ee1a1ece6fcfef26d356870897ab81cb8c64162f39a0b5d0a77334 |
| m4-admission-final/cpu-failure-classification.json      | 190226 | 733f9b24c52183c4211f4a3f77d4267e19206f32416c6a0481c86ebde14eedf3 |

## Next bounded step

No independently repairable candidate runtime defect was established by these eight failures. The next step is current-environment browser/dependency preflight, then a minimal real fixture only if a supported route is usable. Old environment failures are not proof of today's availability. Do not retry a denied route, change security/GPU switches to bypass a restriction, turn a viewport into a physical-device result, or replace the three-browser contract with a cloud-Chrome observation. No new full campaign, PR, merge, release or deployment is claimed here.
