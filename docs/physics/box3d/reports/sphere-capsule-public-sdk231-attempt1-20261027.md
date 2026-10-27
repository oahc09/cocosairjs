# SDK231 Sphere–Capsule public 尝试 1：失败留证（2026-10-27）

## 结论

**FAIL，0 / 4 public cases qualified，0 callbacks。** 不以 native 18-case oracle 或 SDK231 构建通过代替 public 验收。

- Fixture / 发布 parent：`1a33238f65363cbe16492507bf2dd2cb2d571b0e`。
- Runtime/native producer：`f7f780bba52d97cb4c6b7c396fb159758dc698f1`；SDK231。
- 首场景只完成 **1 个 public frame**：2 native bodies、2 shapes、0 contacts，ledger41324 B；尚无 public contact geometry。
- raw `totalSteps=2` 是 fixture 在 await 前递增的**尝试计数**，不是两次完成的 native step。第二次尝试被 `AIR_E_BOX3D_CONFIG` 拒绝：`External Node pose/parent/scale synchronization is not enabled.` 原 fixture 在首帧之后调用 `Node.setPosition`；本报告不预写修复或绕过 guard。
- 当前只进入首个 `sphere-created-first` case，raw 状态 RUNNING；其余三场景未到达。完整矩阵不能按已进入场景数算通过。

## 关闭与监督

Fixture 自己的一次 close 为 released，physicsSceneRelease RESTORED；physicsPreparation closed、module/world cleanup released、cleanupErrors 空。fallbackCloseCalls=0。**正常资源关闭不改变验收失败。**

主 supervisor 状态 FAIL / exit1，但已 `ALL_CHILDREN_-1 / ECHILD`，remaining descendants/process group 均空。主过程3.624396504 s，关闭0.001820846 s，采样后代树峰值RSS504176640 B（不是内核硬上限）。postverify PASS，3009 protected inputs、0 drift。

## 不扩张结论

SDK231 ST43/120/85/60、native18 samples、ESM/DTS 有限 PASS 单独保留；APP230100轮同world有限验收里程碑不受回填或重算。本次不是 full T15/C21、C20、I05、I06、浏览器、真机或关闭后内存验收。旧失败/缺失原件保留；没有自动重试或已修复结论。

下一步是对照当前支持的 public 写回契约审查 fixture 的移动路径，保留本次失败，然后以独立审查和新身份决定后续验证；不得让 silent fallback、跳断言或重复旧运行掩盖失败。

## 预算与原件

最终外部准备/完整输出预算以随附 JSON 的 `postcheck` 原件逐项记录，包含其自身；不将后写的报告算作运行产物。原件预算未放宽。

这是报告索引，**不是 self-contained raw bundle**。JSON 含每项路径、字节数与SHA256；旧临时路径消失不等于原件仍可复核。

最终预算（含 postcheck 本身）：main **3340283 B / 58720256 B**；external preparation **1104379 B**；combined preparation **4886148 B / 8388608 B**；combined all **8230744 B / 67108864 B**。独立 postcheck 的初次属性错误脚本/日志保留，不是 APP 重跑。

- `sphere-capsule-public-attempt-1/result.json` — 4280 B；SHA256 `65bb47df5090571fac5ad28ef912e20e30e1afe9d3dc420f6eaff20e9f293696`
- `sphere-capsule-public-attempt-1/preparation/protected-inputs.json` — 809032 B；SHA256 `2a6247492678f780e82f9c224b2dee9bc8227e5f491951ae447e42f78fbe378e`
- `sphere-capsule-public-attempt-1/preparation/postverify/stdout.raw` — 62 B；SHA256 `d41c40a99a142028f714304e2d9e77bf7e2481749fa7001e0d012aceeff3f7bd`
- `sphere-capsule-public-attempt-1/preparation/freeze/closure.json` — 1850 B；SHA256 `7cfb34fab039d9887249404c4305088c2b98ef3a3ab1f1549abd6701f3288e24`
- `sphere-capsule-public-attempt-1/preparation/input-lock.json` — 2964532 B；SHA256 `52e491af3d10e1152dd06241234f7fdfac56b0bbdbb38baae14f175bcbea2ae9`
- `sphere-capsule-public-attempt-1/main/closure.json` — 1957 B；SHA256 `a41713238e1e7ae10aa61756e0c180baca97c58113fb7b63770f996ccaf2b8c9`
- `sphere-capsule-public-attempt-1/main/run/process.raw.json` — 4779 B；SHA256 `a67a29bd5388d1aae3ec394bedf4c23bb27a7da31145b1b27f17ad8a2136b4a5`
- `sphere-capsule-public-attempt-1/main/run/result/consumer.raw.json` — 8923 B；SHA256 `1314bee22d76e48b728ddf1c40e9130c3ef2104ae7ca1df4fcc848e45e5f9a35`
- `sphere-capsule-public-attempt-1/main/run/result/observations.raw.jsonl` — 13205 B；SHA256 `dbde4624ba131aa80d905313907000ea887de7530cdb77861e47833d9bfc60cd`
- `sphere-capsule-public-attempt-1/preparation/postverify/closure.json` — 1829 B；SHA256 `d83f3f49f0b0124f322fcda60840c145c41a453ebaece9fc83ea0c2eb81de3c6`
- `sphere-capsule-public-preflight-1a33238/postcheck.json` — 4425 B；SHA256 `5398734dce2afd385c15f5d7a0f6ee430a07c9df466d3b656fbfa65a85e59ce2`
- `sphere-capsule-public-preflight-1a33238/postcheck.py` — 8921 B；SHA256 `02933d3bf7dc4fc567aeb23aa9aada2f55f97ff729d49ded4d7846b75f4f5a2e`
- `sphere-capsule-public-preflight-1a33238/postcheck-initial-attribute-error.py` — 8909 B；SHA256 `670dc62ae77d65c43bde3e1fb54d7dbc79aaa4de2b486b7bb860c3f55a361b2c`
- `sphere-capsule-public-preflight-1a33238/postcheck-initial-error.txt` — 231 B；SHA256 `024cdc581aa3d694d059f4c3aae5d0fda6a519a18c7f91d5771d43d15a2967d7`
- `sphere-capsule-public-preflight-1a33238/publication-binding.json` — 1699 B；SHA256 `3c4d7f8bead635ce8a462ceec6c01fea88cddffdf1fdac1c060377f402f666ea`
- `sphere-capsule-public-preflight-1a33238/publication-receipt.json` — 355 B；SHA256 `19f323a335b63e1722351a9665860f21bba7f0eec736ef49c400fff6ea69a896`
- `sphere-capsule-public-preflight-1a33238/preparation-result.json` — 3379 B；SHA256 `c60493d24ebfcc4dde945e5e3659750d5857d325b0973b4b13c616549cc4df30`
- `sphere-capsule-public-preflight-1a33238/source-before.json` — 866293 B；SHA256 `d805ec55ea2b3ff25e3a0edf220ed85c25b4b34eb94a39d8139ead6db32a502f`
- `sphere-capsule-public-preflight-1a33238/st-copy.json` — 153407 B；SHA256 `ebec53a56c7310d8c0588d8957073e1c40fbb51a2e819d65aaffc584c04fb9de`
- `sphere-capsule-public-preflight-1a33238/evidence/provenance.json` — 1197 B；SHA256 `5725dc9ec216134bfcd3651e6866cd517d85371ff38a6c519d7962505b64fe07`
- `st231-attempt2-evidence/result.json` — 17967 B；SHA256 `39c1f423184140e1f96f0d1fecb7dfac5cd5cd6728456dc105632815dba4fac5`
- `sdk231-esm-evidence/result.json` — 11400 B；SHA256 `6cf3bfc599489d4f8e1d7eee9da173d2ad11dfe0a230d3a96d8bc1beb62ff538`
- `sdk231-dts-evidence/result.json` — 11310 B；SHA256 `034057e950bab0850fafd8dbcd9809df21849afdb4ada763766c7827a823cc4a`
- `sdk231-dts-evidence/seven-gates.json` — 2586 B；SHA256 `7d5eeb36a4e9eee53d2811612402623b87b45d8743bb4059af11942c9c76940b`
- `sdk231-dts-supervision/driver.json` — 1766 B；SHA256 `c544a2544786281af1d6f8f684b987a378a06e38e86969a9c4efdd31f3b3a977`
- `sphere-capsule-public-source-1a33238-attempt-1/tools/physics/box3d/sphere-capsule/public-contract.mjs` — 18332 B；SHA256 `f52d86f914740677c1f474583c63ca823acdfefa2b58c6969c3e7bbf9cc773cb`
