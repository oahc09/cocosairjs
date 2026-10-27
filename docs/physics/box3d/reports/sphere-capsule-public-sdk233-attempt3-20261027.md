# SDK233 Sphere–Capsule public 尝试 3：有限通过（2026-10-27）

## 结论

**PASS_PUBLIC_SPHERE_CAPSULE_SUBSET，4 / 4 声明场景通过。** 一次真实 Node/headless JSDOM 执行完成25个public frames、31次callbacks。不是浏览器、真机或完整T15/C21/C20验收。

- Fixture：`bfb170a04f5c79c0209ede51b7675048b8d06ed1`。
- Runtime/native producer：`3f7cf0fdc0148c3829f5e1c854d667ec2417e0fc`；SDK233。
- 四项为 sphere-created-first、capsule-created-first、zero-capsule-positive-capsule、callback-destroys-peer；回调分别10/10/10/1，原对应validator均PASS。

## 回调内销毁：两个实际采样时点

第四场景step24请求销毁后保留即时观察：Node仍valid=true，native2 bodies/1 shape/0 contacts；剩余peer receiver跳过，仅1次Enter。原有下一完成帧step25再次实际读取：Nodeinvalid=true，native1 body/1 shape/0 contacts。即时与下一帧两个record都保留，后者不是由native数量推断Node状态。

这验证的是本次固定fixture的延迟销毁观察契约；没有把旧attempt2未采集的下一帧Node状态回填，也没有删除旧即时观察。旧attempt1/2仍是各自原断言下的FAIL。

## 释放与监督

四次scene release均RESTORED：native body/shape/contact/joint=0，worldledger36096 B，resources为空，释放期间额外step0。一次正常app.close released；physicsPreparation closed、module/world cleanup released、cleanupErrors为空，fallbackCloseCalls0。

主进程exit0，ALL_CHILDREN_-1/ECHILD完整闭合，无剩余后代/进程组成员；3014protected records0drift。更精确的uniquepaths、依赖/source/ST双份校验与预算见配套postcheck记录。

## 验收边界

SDK233 ST/native18case/ESM/DTS是独立生产证据，不替代public验收；APP230100轮同world里程碑仍属于SDK230。此次4-case有限通过不等于fullT15/C21、C20、I05、I06、全局world/handle census、关闭后native bytes、浏览器/真机或性能完成。历史失败和失落证据均保持原状，无自动重试、无原件改写。

## 原件与预算

报告索引列出完整路径、bytes/SHA256；单独证据包可保存这些原件，但不是包含SDK/依赖/全源码的可重跑工程。

终局 postcheck 预算（包含其自身及窗口日志，不含后写报告）：

```json
{
  "mainBytes": 3978975,
  "wrapperOutputBytes": 7764357,
  "wrapperPreparationBytes": 3782565,
  "externalPreparationBytesIncludingThisSummary": 1096584,
  "combinedPreparationBytes": 4879149,
  "combinedAllBytes": 8860941,
  "limits": {
    "mainBytes": 58720256,
    "preparationBytes": 8388608,
    "combinedBytes": 67108864
  }
}
```

主过程4.6187765519989625 s；关闭0.0020846629995503463 s；采样后代树峰值RSS 537419776 B，不是内核硬上限。

- `sphere-capsule-public-attempt-3/result.json` — 2784 B；SHA256 `80da461979f4226002f35b7c8a0919b32d51eb11c5c60c0ab0ee9df21b4c81bd`
- `sphere-capsule-public-attempt-3/preparation/protected-inputs.json` — 809167 B；SHA256 `8cc7dd1bcb3e538eb935c1f41a5aeafd09063d865514c1eb5254ec47bd3cce14`
- `sphere-capsule-public-attempt-3/preparation/postverify/stdout.raw` — 62 B；SHA256 `d41c40a99a142028f714304e2d9e77bf7e2481749fa7001e0d012aceeff3f7bd`
- `sphere-capsule-public-attempt-3/preparation/freeze/closure.json` — 1851 B；SHA256 `50fd221b9774296ea40bae7f41557344c330c8e224c52a5bfbd4a388f3229510`
- `sphere-capsule-public-attempt-3/preparation/input-lock.json` — 2965189 B；SHA256 `2804d9498cba62249f8901069594825b4453b489fdf2e35963491e4557cd3c32`
- `sphere-capsule-public-attempt-3/main/closure.json` — 1968 B；SHA256 `943b4cdf689cebc0407994aa1c2234b4428e350802df534a63f8ff6cef9d45aa`
- `sphere-capsule-public-attempt-3/main/run/process.raw.json` — 3474 B；SHA256 `8d5c36a011c154eb342a3473958d815a3f5cfb55ff893005b15b1d029f6b5203`
- `sphere-capsule-public-attempt-3/main/run/result/consumer.raw.json` — 256514 B；SHA256 `b3bb442ddae3bd7b9833f59dec1646633ac0e70f244c038e2e59af672f4e5f95`
- `sphere-capsule-public-attempt-3/main/run/result/observations.raw.jsonl` — 226394 B；SHA256 `b532071061413b9aaacab5d70244908088956b4ad39cd4e47dee21ce9413694b`
- `sphere-capsule-public-attempt-3/preparation/postverify/closure.json` — 1829 B；SHA256 `c8187692d526914adffade0e9eb9440eb22cdf0d8ddc8963928748c599f772f4`
- `sphere-capsule-public-preflight-bfb170a/postcheck.json` — 5310 B；SHA256 `ee9170dfa0ba4ff08e2cea92885951f8a315bd5f2247a5935c2df4303f93de91`
- `sphere-capsule-public-preflight-bfb170a/postcheck.py` — 10887 B；SHA256 `27568bdb59f566532216e97b82ffe0996fbea75f9cde5c494ad417f52db0faa6`
- `sphere-capsule-public-preflight-bfb170a/case-validation-cpu.json` — 357 B；SHA256 `14f29f319a04c429711ea437a5e22897b3cc8c750a2a8b99e9cf732d9351b48b`
- `sphere-capsule-public-preflight-bfb170a/publication-binding.json` — 1040 B；SHA256 `7d9409914ec4146b98a3a36cda649a1fbd9484aa5d47792eae3d82288a5d7642`
- `sphere-capsule-public-preflight-bfb170a/publication-receipt.json` — 355 B；SHA256 `fa4bbbc5b3b4fd284d7770234998e1c81d31eb33140d15d59d890f6c98bb75a5`
- `sphere-capsule-public-preflight-bfb170a/preparation-result.json` — 2694 B；SHA256 `9b589f45457fb9cac9409ddf6f9f2649b12b62aac9e483269e4114823b3a3589`
- `sphere-capsule-public-preflight-bfb170a/source-before.json` — 867362 B；SHA256 `258eee788a8135871e666d0d05c8bf6f468e03fdc74a66b6d1cf268c9d085e38`
- `sphere-capsule-public-preflight-bfb170a/st-copy.json` — 153397 B；SHA256 `b6aa225367a475e9a9611bab1bb4f8e0e9cbbfa3a8ce462b7cd3f74fc5ffd08b`
- `sphere-capsule-public-preflight-bfb170a/actual-receipts.json` — 834 B；SHA256 `887923a5f416da8723c913e5196418d8c04d9398e3f4caf9b127b0f2fc497524`
- `sphere-capsule-public-preflight-bfb170a/evidence/provenance.json` — 1197 B；SHA256 `214519ba7c36ab54f0e9ec817c9642f315a06c090b54b14bf406f4d0b9d71ad5`
- `sphere-capsule-public-source-bfb170a-attempt-3/tools/physics/box3d/sphere-capsule/public-contract.mjs` — 19674 B；SHA256 `2f591da973405f286e571cbb65577b93d56471d1d9cc6310eacbe4c517acbd63`
- `st233-evidence/result.json` — 17849 B；SHA256 `b72f5cae510d156f0b35702d6e1cc0e5f6099711ef7386e84b92d564640360fc`
- `sdk233-esm-evidence/result.json` — 11221 B；SHA256 `c37bc4f4e7b688521ea383a4436ca62b4a960374fb98c1ade66ab74fabed9e3e`
- `sdk233-dts-evidence/result.json` — 11292 B；SHA256 `6126f8ee712875e38f99768e94cbb44b600b575f8d8a49461a88cb52d9f81b42`
- `sdk233-dts-evidence/seven-gates.json` — 2586 B；SHA256 `58ada2a037b05b44a244ae222237d21bb19de19154fcd8976ee6d5efd056b490`
- `sdk233-dts-supervision/driver.json` — 1766 B；SHA256 `8050c656ed7392583bc9c780cfa8eb8a5d17e77ed492d5a423bfbd17425c7f15`

配套[关键原始证据包](artifacts/sphere-capsule-public-sdk233-attempt3-evidence-20261027.tar.gz)：1219359 B，SHA256 `59d052a406b40a08c051ed0d3c48700b1dc5b6ce2326ba6cc54b8946f78861c3`；包含26项索引原件及必要监督日志，非SDK重跑包。
