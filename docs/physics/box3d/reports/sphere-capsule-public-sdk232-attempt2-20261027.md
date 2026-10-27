# SDK232 Sphere–Capsule public 尝试 2：失败留证（2026-10-27）

## 结论

**整体 FAIL；前三个 case 经原 validator 通过，第四个未 qualified，不能写成 4/4 PASS。** 本次完成 25 个 public frames、31 次 callbacks（前三各10，第四1）；raw attempt counter也是25，与尝试1的“counter2但完成1帧”不同。

- Fixture：`6a69500aa846342f2ed0fd4650c7ef6485537243`；runtime/native producer：`fe69c0e366f663ba4aeae7be390eb3065b7805c5`；SDK232。
- 发布 parent：`338aa89abfb9fe67674738c429a27cbe6cb1c2fe`，保留同版构建报告。
- `sphere-created-first`、`capsule-created-first`、`zero-capsule-positive-capsule` 三项 raw均PASS，已用原导出 validator 对复制原件做只读 CPU 复核；这不是重跑APP。

## 第四项的实际时序

`callback-destroys-peer` raw状态仍 RUNNING：step24只有1次 onCollisionEnter，剩余peer receiver被跳过；destroyRequested=true。该帧即时保存 `destroyedPeerInvalid=false`、native2 bodies/1 shape/0 contacts。下一完成帧 step25 的 native snapshot已为1 body/1 shape/0 contacts。

首错是 `public-contract.mjs:128`：validator仍检查先前保存的即时布尔 `destroyedPeerInvalid`，得到 **false !== true**。随后line129的 `afterCallback.bodies==1` 并非首个已执行失败断言。step25未重新记录 Node.isValid，不能从native body数量推成“下一帧Node已失效”的实测。

本报告仅记录这段可验证的时序与断言，不预写修复，不把第四项改判PASS，不宣称整体引擎销毁时序已合格。

## 释放、关闭与完整性

四次scene release均released：body/shape/contact/joint=0、worldledger36096 B、resources为空、release额外step0。一次正常app.close released/RESTORED；module/world cleanup released、cleanupErrors空、fallback0。正常关闭不改变public整体FAIL。

主进程exit1，`ALL_CHILDREN_-1 / ECHILD`完整闭合，无剩余后代或进程组成员。3012保护记录/2999唯一路径0drift；依赖12989files/56links/2418dirs保持；原/副ST每端979files、53083918 B逐hash一致。主过程4.628668997 s，关闭0.002036611 s，采样RSS峰值523243520 B，不是内核硬限制。

最终main3915473 B /58720256 B；external preparation1096775 B；combined preparation4878606 B /8388608 B；combined all8797555 B /67108864 B。包含终局postcheck自身，不含后写的报告，未放宽预算。

## 不扩张结论

尝试1 SDK231 FAIL0/4永不回写。SDK232 ST/ESM/DTS与native18case PASS仍单列，不能替代public结果；APP230100轮有限里程碑不重算。full T15/C21/C20/I05/I06、浏览器/真机/关闭后内存仍未由本次证明。

后续应对照实际契约审查销毁观测时点与断言，保留该FAIL，任何修改都需独立审查和新验证身份；不得通过跳断言、改原件或假定下一帧Node状态来制造通过。

## 原件索引

这是报告索引，不是 self-contained raw bundle。JSON记录路径、字节数及SHA256；原始临时文件缺失时不得宣称仍可重验。

- `sphere-capsule-public-attempt-2/result.json` — 3443 B；SHA256 `1298d4fbb4c25b7003bcb553dd59a9c2f8402444b02744aae3d953d308cecce7`
- `sphere-capsule-public-attempt-2/preparation/protected-inputs.json` — 808692 B；SHA256 `de38366bcc404cdcc110818ac63740f8ef6100eebb0f7335a12663c8f254a1f6`
- `sphere-capsule-public-attempt-2/preparation/postverify/stdout.raw` — 62 B；SHA256 `d41c40a99a142028f714304e2d9e77bf7e2481749fa7001e0d012aceeff3f7bd`
- `sphere-capsule-public-attempt-2/preparation/freeze/closure.json` — 1851 B；SHA256 `b7d793768027f68246a1b10fcac42d8ced1a72bc6493852d7be6eb7e571a1569`
- `sphere-capsule-public-attempt-2/preparation/input-lock.json` — 2964930 B；SHA256 `811ece14855b292f6dad2e29001d57d1404f0e540adfd4465abf17f4ac22d792`
- `sphere-capsule-public-attempt-2/main/closure.json` — 1956 B；SHA256 `64d300eb9bab3f18c19bd034596acea8d9f89e969dd402a2edccc65e5d85cec3`
- `sphere-capsule-public-attempt-2/main/run/process.raw.json` — 3940 B；SHA256 `ea21b7769ab29abd28f933388491680e09f751749891b3343b24fd3b3d091b29`
- `sphere-capsule-public-attempt-2/main/run/result/consumer.raw.json` — 256944 B；SHA256 `40388f152e47baf4501514765f28d0b1a8a23ec931f34a93fbbdaa5c3bbf813f`
- `sphere-capsule-public-attempt-2/main/run/result/observations.raw.jsonl` — 230874 B；SHA256 `a940f213dc4c5e796d5ecf8f0b53bbf0ff8489dc434e82de22d55728ed4bf277`
- `sphere-capsule-public-attempt-2/preparation/postverify/closure.json` — 1829 B；SHA256 `f959512a1d4c0acdaac7a1a7f279fb35d3002f22cb258659934a01e6b52f37bc`
- `sphere-capsule-public-preflight-6a69500/postcheck.json` — 5234 B；SHA256 `17f7956e46187e82dbf3942cf616eb1ba6c4b44b74a57412acb40b48c57f75a9`
- `sphere-capsule-public-preflight-6a69500/postcheck.py` — 10496 B；SHA256 `976aa84e46e3fae9e0b06f6a0d4d9ef45ad5b039d62edc06acbda149dcc22d5d`
- `sphere-capsule-public-preflight-6a69500/case-validation-cpu.json` — 352 B；SHA256 `d60cf4e75057abc6eab828bac4ec69489d4e3af701d61a1dcb052be04edd8893`
- `sphere-capsule-public-preflight-6a69500/publication-binding.json` — 1040 B；SHA256 `0de7b57faf484e4e6a910a044dbbb1958b6518c8cfae3ab3345c48b6cb809838`
- `sphere-capsule-public-preflight-6a69500/publication-receipt.json` — 355 B；SHA256 `35f388a6e407f247f85d8844c92c64178d68a12f14f401e41638859eb0c61484`
- `sphere-capsule-public-preflight-6a69500/preparation-result.json` — 2694 B；SHA256 `65a32e4578ec2568f6c76322e410507fc6d4f5f15577416e87fa01ed7cdad88b`
- `sphere-capsule-public-preflight-6a69500/source-before.json` — 867362 B；SHA256 `b074d5cbf335ff4b052dce1419fad5a1e64a4122c260744fbc8bb1cc2d4c7e00`
- `sphere-capsule-public-preflight-6a69500/st-copy.json` — 153397 B；SHA256 `5584d886530c9e7018ff9c1ea75aab0de4657e5135399eae96e2ed6a187abe9a`
- `sphere-capsule-public-preflight-6a69500/actual-receipts.json` — 834 B；SHA256 `774e59c4a80d5fb6f052c74fcb20a3d230865dfe03357adff3cc6cbbd34421a1`
- `sphere-capsule-public-preflight-6a69500/evidence/provenance.json` — 1197 B；SHA256 `2f8be68783076ff625935473c5b1c75f70c4fcd220b8f2f14c06001044cea980`
- `sphere-capsule-public-source-6a69500-attempt-2/tools/physics/box3d/sphere-capsule/public-contract.mjs` — 18467 B；SHA256 `208fb87eb055dc27d5a64b49bb124d63d805c66639735311ba4bb088b527241e`
- `st232-evidence/result.json` — 17850 B；SHA256 `3e64f1f2d059a7daf5ccd41ffa0f6031a018b9c4822cbca9473d667d1da9f5d6`
- `sdk232-esm-evidence/result.json` — 11221 B；SHA256 `8d3eb718d1b104631d55c2a2f28950f05e443e3df65438bcdc2ea189cbe070ab`
- `sdk232-dts-evidence/result.json` — 11293 B；SHA256 `dfa38314d0e1fa492ef767ae4d454743568a863e6b0e8e9e299230091aafec5f`
- `sdk232-dts-evidence/seven-gates.json` — 2586 B；SHA256 `cdd7f02cd8e4d1cdcd10d1598bf98d25c75f9830bc5ca0f354ae12a11570066a`
- `sdk232-dts-supervision/driver.json` — 1766 B；SHA256 `962d2592a578fe63ae90e4ae8eb854d34b3885de4e1a4416d05246bd49b9e161`
