# Box3D recovery boundaries

Checked at 2026-10-22 01:00 UTC, after the execution environment reset. This is a recovery inventory, not a new implementation or acceptance report. No commit, push, deploy, large rebuild, or test rerun was performed.

## Exactly recovered and persisted

`C14-recovered-from-context.patch` contains the complete previously printed production patch touching three files. It does not contain those three complete source files.

- Library ID: `libfile_35e1840193a081918c4ec5d21337a8a6`
- File ID: `file_000000006da081f5a15d47f2e471c68c`
- Length: 1905 bytes.
- Newly computed SHA-256: `4d8acea1fc9eccc4f22bb1724dab85487fb696d609890814d8cb696493eba41f`.
- The newly computed digest exactly matches the historical digest retained with the original patch. The patch itself is byte-identical by that comparison. Library creation succeeded and a full Library read returned its 51 lines.
- Provenance: already visible tool output retained in current task context, not filesystem or transcript recovery.
- The patch relies on surrounding Box3D implementation, including existing shape rollback logic. It cannot independently restore a working runtime. No post-reset execution validation has occurred.

## Other persistent Box3D artifacts confirmed

- `Box3D-runtime226-validation-summary.md`: `libfile_c3516a203c408191a86bf2fb93b24fbe`, 2560 bytes. Full 25-line text successfully read after the reset. It is a historical summary written before the reset, not the underlying evidence or current reproducibility proof. Its claim that older evidence was retained described the pre-reset state and does not establish present availability.
- `Box3D-礼物工坊-三单完整实测.webm`: `libfile_317f528694d88191b42a6409fc0aa02e`, 8,327,578 bytes, confirmed by Library metadata. A representative layout-4 recording; not a substitute for source, continuous machine-readable streams, or five-layout independent replay inputs.
- `CocosAirJS-Box3D-Development-Plan-v1.2.md`: `libfile_335495eb4e208191bf8025631fdd1b33`, 153,689 bytes.
- Historical v1.1 plan: `libfile_625e553a54b8819195fee9e8ef6486b8`.
- Historical v1.1 review: `libfile_8cba251a80d08191bdc15e7b43902bea`.

## Search result and limits

The recursive Library listing inspected the latest 200 items, spanning 2026-10-02 through the reset date. An additional recent-only listing and title searches for Box3D, box3d-implementation, and runtime226 found no earlier Box3D source/build/complete-evidence archive. The pre-recovery title search returned the five artifacts listed above. This is not a claim that every file's archive contents were inspected or that no backup exists outside the permitted sources.

Known older Library candidates are metadata-only leads, not verified Box3D recovery sources:

- `pr8-box2d-fixes-6296baad.zip`: `libfile_67d50178392c8191b448022aab1c452d`, 11,936,434 bytes, 2026-10-21.
- `engineering-checkpoint-969b7c-r2-depth-fix.zip`: `libfile_329a104f6b8481918289d7b78342fec4`, 17,256,590 bytes, 2026-10-20.
- `engineering-checkpoint-coupled-886165a.zip`: `libfile_e9e6e8bf82188191b9106ff637a89a79`, 13,149,568 bytes, 2026-10-20.
- `cocosair-audit-reproduce-20261019.zip`: `libfile_77c4a755f5b88191b081c1d22a8ef2ef`, 4,305,360 bytes.
- `cocosair-engine-ea2b507-20261003.zip`: `libfile_64f2f3aa85648191a12f53ce871212be`, 23,466,692 bytes.

Their names and dates cannot establish the lost reconstructed base or the Box3D changes. An older base must not be silently relabeled as runtime 226 or reconstruction base `02261afc53caac4cbfae483feff2948da426681a`.

## Not recovered

- Complete reconstructed repository and Box3D adapter/build integration.
- Runtime 225/226 build outputs, source maps, declarations, native module outputs, source identity manifests, or reproducible build closure.
- Final C16 candidate-5 native patch and regression harnesses. Retained descriptions or an earlier candidate-3 patch are not the final patch.
- EX09 production 1.2.5 implementation, ordinary-input recovery adapter, exact scenario configuration/inputs, independent validators and test harnesses.
- C14 complete final formatted CPU test file and physical reports; the recovered patch is not those tests.
- C14, C16 and five-layout continuous evidence bundles, negative controls, inventory files and prior failure records. The 87,715,840-byte five-layout closure was only local and is not a surviving service artifact.
- The unfinished recovery run has no complete sealed five-round result. Four observed round completions plus an interrupted fifth do not qualify a five-round shard or the requested 15 abnormal/20 lifecycle campaign.

## Before claiming reproducible delivery again

Establish the actual available baseline; reconstruct missing changes under a new explicit identity; recover or recreate executable harnesses; rerun the affected evidence and independent checks; retain original historical limitations; and persist source, build inputs, manifests, evidence and failure records before proceeding. Real devices, required browser hosts and human testing remain external requirements. This document does not authorize or report that reconstruction as completed.
