# SDK235 public 正常关闭：同 module 终态 receipt 有限通过（2026-10-27）

## 结论与身份

**PASS_PUBLIC_MODULE_RELEASE_SUBSET。** 一次真实 Node/headless JSDOM 原 loader/factory 执行：1 app、1 scene、2 个完成 public frames，唯一正常 app.close，fallback close 0。

- Fixture：`04f793a74cae1ccb1d1f19172c09006918a5ca95`。
- Runtime/native producer：`a00306f391c595e292bbcaedd0f757bc99ca4ead`；SDK235。
- 生产 SDK235 的 ST/ESM/DTS 是单独证据。本报告只评本次 public 正常关闭路径。

## 实际观察

场景含4 native bodies、4 shapes、1 fixed joint（connected），2 Terrain users共享1 native mesh resource：cache lease1、shape borrows2；实际读取72条primitive的非空debug copied snapshot，完成2帧。active world容量ledger49460 B。

一次scene release为released/RESTORED：body/shape/contact/joint全部0，world容量ledger36096 B，resources[]；scene/material失效，旧token非current，currentScene为空。

唯一正常app.close为released/RESTORED，physicsPreparation closed，module/world cleanup均released，cleanupErrors[]。`close.physicsPreparation.moduleRelease` 为 **VERIFIED**、errors[]：原factory baseline和terminal均为core worlds0、core trackedRequestedBytes0，registered bridge及mesh各计数字段全部0，terminal与原baseline一致。关闭返回后读回的是该复制receipt与已复制debug数据。

**终态native采样发生在正常loader清理内部、原module仍可访问时；app.close返回后没有再调用native probe，也没有创建第二module。** world容量ledger、core tracked requested bytes、bridge/mesh字段属于不同计量域，不能求和，更不等于全部malloc、WASM heap、全部handles或GC已回收。不可变复制/不保留module强引用的CPU与源码结构检查也不构成GC实测。

## 监督与后验

主进程exit0；ALL_CHILDREN_-1/ECHILD，剩余后代和进程组为空，无budget violation。3072 protected records全量0drift；依赖/source/ST双份及SDK后验精确数据见下方postcheck。

## 未扩大验收

仅本次一场景正常关闭的registered native终态子集。完整C20/I05/I06/T15、全部native handles/malloc/heap/GC、pre-mount失败清理、浏览器/Android/iOS/性能及原完整矩阵/Gates均未因此完成。SDK230100轮与SDK233四场景里程碑各自保留独立身份；SDK234 DTS FAIL及其他历史失败/失落原件不回填、不改判。

## 原件与预算

精简证据包保存以下原件，不含SDK、依赖体、全源码或凭据，不是可独立重跑工程。

终局postcheck预算（含其自身及window日志，不含后写报告）：

```json
{
  "mainBytes": 3510135,
  "wrapperOutputBytes": 7322635,
  "wrapperPreparationBytes": 3809605,
  "externalPreparationBytesIncludingThisSummary": 1114945,
  "combinedPreparationBytes": 4924550,
  "combinedAllBytes": 8437580,
  "limits": {
    "mainBytes": 58720256,
    "preparationBytes": 8388608,
    "combinedBytes": 67108864
  }
}
```

主过程 8.269858392999595 s；关闭 0.0021833669998159166 s；采样后代树峰值RSS 940208128 B（不是内核硬上限）。

- `module-terminal-public-attempt-1/result.json` — 2862 B；SHA256 `0a0f57a58677aef67333b2b6f352fd8cfb7f8e9fbfc65fabcd15ca488865474b`
- `module-terminal-public-attempt-1/preparation/protected-inputs.json` — 828049 B；SHA256 `ffaa9ba95444125b8d54312a70fe6ff6ce1b147ce69dd07ba9a66f9fce7e2fa3`
- `module-terminal-public-attempt-1/preparation/postverify/stdout.raw` — 62 B；SHA256 `d41c40a99a142028f714304e2d9e77bf7e2481749fa7001e0d012aceeff3f7bd`
- `module-terminal-public-attempt-1/preparation/freeze/closure.json` — 1857 B；SHA256 `efdac698c4ecfa2d75421cea10b02a271b89040505eec92bbf676e1da798e4e7`
- `module-terminal-public-attempt-1/preparation/input-lock.json` — 2973318 B；SHA256 `aec640bbbc0a43567c21f0a3c3cfc870ce17a644529989b200b466ab2cb200d8`
- `module-terminal-public-attempt-1/main/closure.json` — 1973 B；SHA256 `a745c96d85abebc6d974be3be9ba59be6c2b158aefd2bb77b54f97a871555856`
- `module-terminal-public-attempt-1/main/run/process.raw.json` — 3843 B；SHA256 `46fb0166178c2172278d1ea279fdc804357069836b8cd783a49ee18bbc059794`
- `module-terminal-public-attempt-1/main/run/result/consumer.raw.json` — 27353 B；SHA256 `e85b80dd4869fc64407fe55664f1103f59666d4042a7784ed0a29413e4cf7cce`
- `module-terminal-public-attempt-1/main/run/result/observations.raw.jsonl` — 26910 B；SHA256 `02b0c9f9b1284db099d960f573665c40059aae0c62857583bf90f453aeb6e7d1`
- `module-terminal-public-attempt-1/preparation/postverify/closure.json` — 1835 B；SHA256 `a3cc0ca049726cc321fc666caae672f985d8eb15d3bc9e5784c30ecba370b4a0`
- `module-terminal-public-preflight-04f793a/postcheck.json` — 6870 B；SHA256 `8dea58a5d312dd5325c8f6e8cb139109757b9cc4b24da5b3927af7ce4afe9d89`
- `module-terminal-public-preflight-04f793a/postcheck.py` — 11617 B；SHA256 `2ac95f5b55bfa9df7ca191956e7f6be869ba4180961c5c3c030f72c233d5c532`
- `module-terminal-public-preflight-04f793a/publication-binding.json` — 1708 B；SHA256 `f9def85d7b2c06d38923e7e612c828347bea4327f8f6f9aa3b15a101ac6cc51d`
- `module-terminal-public-preflight-04f793a/publication-receipt.json` — 355 B；SHA256 `50381101760d2972bb811bab7f2320ed80042722bcd1db9dba67f3356416b885`
- `module-terminal-public-preflight-04f793a/preparation-result.json` — 3366 B；SHA256 `0ddf2cea91ea245c54d48b979bbf4dbeb6add8b524ca3336f53c52c10d0aa4cd`
- `module-terminal-public-preflight-04f793a/source-before.json` — 875322 B；SHA256 `b04e0aafec1fdffbf8ad067cfce494cc881139a0e648b10a8f172b5f89a0da57`
- `module-terminal-public-preflight-04f793a/st-copy.json` — 157786 B；SHA256 `d713b2a2e31fdbc4dc776f9a8876e9c82d784292df13095064a89a82616d49c4`
- `module-terminal-public-preflight-04f793a/actual-receipts.json` — 773 B；SHA256 `2a274982cc7d16e889656477c949a7163afee9ed232074f6a84aef96c5e4421d`
- `module-terminal-public-preflight-04f793a/evidence/provenance.json` — 1197 B；SHA256 `77f93d1372586bd358d61a3567a5efe0a698d46a7ceb1604850f7710e34defda`
- `module-terminal-public-source-04f793a-attempt-1/tools/physics/box3d/module-release/public-contract.mjs` — 10813 B；SHA256 `e527ac0f19ebf2d29933add6d2842f66bdd868e40ea418a146aeaa5fbb5c5d5e`
- `st235-evidence/result.json` — 19306 B；SHA256 `d44e534bc98c8e2ab40ec1b69877aa3e1787e5cd72d825c3208b8db56493e190`
- `sdk235-esm-evidence/result.json` — 12226 B；SHA256 `0c66df3c1e42cfd2507653809073fba815d75afe34a1661d63e0c5e7588291b1`
- `sdk235-dts-evidence/result.json` — 11328 B；SHA256 `abb21b778389021adf9a73735392c66a52bd4020281d39fc528c15f2f601e4d6`
- `sdk235-dts-evidence/seven-gates.json` — 2586 B；SHA256 `e9c8d7f7faee83b0c4c2c812947597f854a6b417000541d1714d87114f1e9b46`
- `sdk235-dts-supervision/driver.json` — 1766 B；SHA256 `30dd1e68502c303418c94282664946389a6228c54c2e3d025d445e03e9322c13`
- `module-terminal-public-preflight-04f793a/result-validation-cpu.json` — 249 B；SHA256 `ff44923d396f094de1b52b85e61882a3f2c7cbf6ca6ca2786ef4ab163052d715`

精简原件包：[module-terminal-public-sdk235-attempt1-evidence-20261027.tar.gz](artifacts/module-terminal-public-sdk235-attempt1-evidence-20261027.tar.gz) — 1215578 B；SHA256 `32802c120f49e4cd4d447de13212801f7829a0e72fbf95b3a126e2663e403063`。
