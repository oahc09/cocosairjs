# SDK230：同一 APP / world 的 100 轮释放有限验收（2026-10-27）

## 结论

**PASS_LIMITED_C20APP_OBSERVABLE_SUBSET：100 / 100 轮严格通过。** 这是当前 SDK230 的一次真实 Node/headless JSDOM 执行，不是全 C20、I05、I06 或项目完成。

- Runtime/native producer：`80be38bce03528d4ba7f445481ce35a6da78de83`；fixture 与发布 parent：`0d176a9778683f6477d5682b85dc21c91b635d98`。
- 同一个 APP / clock / world：100 轮、5800 次 step、10800 次回调。每轮 50 native bodies、50 shapes、1 joint、3 Terrain users。
- 所有 100 次释放均回到第一轮之前的原始 ledger **36096 B**，四项 native live counts 均 0，resources 为空；scene/material 失效、旧 token 失效、事件副本保持。无 warmup、重设基线、替换 world 或 release 额外 step。
- 一次正常 `app.close`：released；physicsPreparation closed；module/world cleanup released；cleanupErrors 为空。

## 201 次真实诊断（v2 / 89 rows / 756 words）

| 阶段       | 快照数 | world capacity ledger | module core requested | world bridge / global bridge | 各 bridge allocations |
| ---------- | -----: | --------------------: | --------------------: | ---------------------------: | --------------------: |
| 原始初始   |      1 |               36096 B |              167320 B |                  48 B / 48 B |                     1 |
| 非空场景   |    100 |              108764 B |              239624 B |                224 B / 224 B |                     5 |
| 每轮释放后 |    100 |               36096 B |              167320 B |                  48 B / 48 B |                     1 |

这些是分别读取的不同计量，不把 world ledger 当 module bytes、WASM 容量或 JS heap。最后 mesh 累计 400 cooks / 400 destroys、live resource snapshots 为空，但不是全局 handle census。**关闭之后未调用 getter，post-close bytes 仍 UNAVAILABLE。** 固定 identity 36 B / creation-capacity 20 B 从本次 world 创建起计账，不重写旧版本的 baseline。

## 监督、输入与预算

- 正常退出 0；`ALL_CHILDREN_-1 / ECHILD`，无 remaining descendants 或 process-group members。
- 主过程 212.190561347 s；关闭 0.001783982 s；采样后代树峰值 RSS 639295488 B。这不是内核硬限额。
- 1886 受保护记录 / 1875 唯一路径逐项重核，0 drift；共享依赖 12989 files / 56 links / 2418 directories 前后 UNCHANGED；原 ST 与执行副本分别 973 files 逐 hash 对照。
- 最终 main output **34290509 B / 58720256 B**；external preparation **2694182 B**；combined preparation **3548947 B / 8388608 B**；combined output **37842790 B / 67108864 B**。已包含 postcheck 本身及 wrapper stdout/stderr，不含随后撰写的本报告；未更改原预算。

## 严格边界与历史

全 C20、I05、I06 仍 **NOT_QUALIFIED**；global world/all-handle census、完整 resource leak freedom、post-close native bytes 未建立；本次 C20LOWLEVEL / full Gates / 浏览器均 NOT_RUN，也不是真机或性能验收。

APP228 历史 FAIL0/100 保留，旧 raw 已失落；APP229 NOT_RUN；SDK229 原 ST/ESM/DTS raw 与未发布 v4 候选仍 UNAVAILABLE。SDK225 历史 replay 未恢复。本次新 producer/fixture 的成功不回填任何旧失败或丢失证据，不宣称找回旧字节。

后续应保存本次同版有限结果，补全真实 native census / post-close 测量边界，并继续原 capability/matrix/examples/mobile/performance/独立 Agent gates；不能用 JS 对象计数替代 native 计量。

## 原件索引

本报告不是 self-contained raw bundle。配套 JSON 记录每个原件的相对路径、绝对路径、大小与 SHA256；临时环境失落后只有报告不等于原件仍可复核。

- `c20-app230-attempt-1/result.json` — 3301 B；SHA256 `64cb32e05160e4b38bca6c41cd39d9522d4a50069f0977a1d92da63154bf55ac`
- `c20-app230-attempt-1/main/closure.json` — 1860 B；SHA256 `bd28b0764e83f08e8b1fffea6a1cf7f8ce8fd6883f973156e867aa0857dfc61c`
- `c20-app230-attempt-1/main/run/process.raw.json` — 5364 B；SHA256 `46d269f7e7a2ff7ea9b213af25d33aacbc67d55ca3dc3120f4952141fcc96320`
- `c20-app230-attempt-1/main/run/result/consumer.raw.json` — 17655405 B；SHA256 `b6a65c20859bb85af149f1b560c9a0a1cf0f9fcb744cdc54bbaa69451fef0cff`
- `c20-app230-attempt-1/main/run/result/observations.raw.jsonl` — 10334812 B；SHA256 `2cd83a7f1133911d40be0c5d09892d2dc96f9566a708acf51d5e4e1e97375741`
- `c20-app230-attempt-1/main/run/result/memory-diagnostics.raw.jsonl` — 5657227 B；SHA256 `02f5a2c6ed566ebe2c67deda93f4dfdaa9a2fa0efe7578eb8d6f9aa8c562a2f5`
- `c20-app230-attempt-1/preparation/input-lock.json` — 333625 B；SHA256 `755752d2203b2f430b6248bb2f61b32d14e47c5c1ea7e35134325559fed115ec`
- `c20-app230-attempt-1/preparation/protected-inputs.json` — 516330 B；SHA256 `6ba099e802908ce5865c11cc070fe2dff9bcbee69ead2ffc912a7a38cec1de08`
- `c20-app230-preflight-0d176a9/dependencies.before.json` — 2530107 B；SHA256 `8964749c37bf9464718d039c6aa406af9c72279ac1a6edc3acd903424d5c59a7`
- `c20-app230-preflight-0d176a9/dependencies.after.json` — 283 B；SHA256 `fae8d87f853353b002f8bf41e762b8ea5e4a3d0b068b6d33e6f49baa57d72c95`
- `c20-app230-preflight-0d176a9/preflight-lock.json` — 3046 B；SHA256 `3ca2ef13527838de4a5f92ab8ae7f9cacca76b3e4d8de5ec3163f527e126cf30`
- `c20-app230-preflight-0d176a9/st-copy-receipt.json` — 139067 B；SHA256 `87b134a42898e1114d37be6efbe61017b5c2d7edb68f5e994917044506f5114c`
- `c20-app230-preflight-0d176a9/postcheck.json` — 5185 B；SHA256 `d97eba97989af3b53e5a959f09d1fd5fcffb206ff46257fa05483903ef8e9a62`
- `c20-app230-preflight-0d176a9/postcheck.py` — 8199 B；SHA256 `f7de971a060e61ab14b1c8f16b46e96b8ee249abaab2f1431bc6bf79bdb6e581`
- `c20-app230-preflight-0d176a9/provenance.json` — 1204 B；SHA256 `e6088e82baa6d8123baef8ba0af6ffd8b685d1b587f57731d703800618f12fcb`
- `c20-app230-preflight-0d176a9/dependency-inventory.py` — 3134 B；SHA256 `069d19242fb10b84d13e6adb324ee75a8c4c4b0e9f811daf8e7a899d277d69d4`
- `c20-app230-preflight-0d176a9/dependencies.before-launch.json` — 283 B；SHA256 `fae8d87f853353b002f8bf41e762b8ea5e4a3d0b068b6d33e6f49baa57d72c95`
- `c20-app230-preflight-0d176a9/dependency-before-summary.json` — 260 B；SHA256 `7e23b061ebac808d81726bb457e22a77ce8f7ef5b986e47a51bd91e593a84f78`
- `c20-app230-preflight-0d176a9/dependency-cpu.json` — 68 B；SHA256 `1dce673d5b02eb63bfcf1186a015c131250008c85290dfed10bbed25afb59b9c`
- `c20-app230-attempt-1/preparation/freeze/closure.json` — 1767 B；SHA256 `99e4ea7e8d2fd7c72fd2507aee2461c0cf5d94253dd81897c192568b3a0588fb`
- `sdk230-esm-evidence/result.json` — 11140 B；SHA256 `d4edc9120771a330e31c666ee19b3fd3c3787e4c60d54067906bb13bbf52f452`
- `sdk230-dts-evidence/result.json` — 11305 B；SHA256 `bb1119d7495f217e9d8f8be31d6bd665beba1b4c237721099292bac8e0b6fc91`
- `sdk230-dts-evidence/seven-gates.json` — 2586 B；SHA256 `4f7a0c6607197b3c7646e64d123f2225d61b8f1e182695c73c1574cbc513042c`
- `sdk230-dts-supervision/driver.json` — 1766 B；SHA256 `0b876b37c5e76eb357aea7c4010023d2923d058165d099d25b364217a566c4c9`
- `st230-attempt2-evidence/result.json` — 16520 B；SHA256 `63b218e77d03bc0606c564538798b8d2386af254403627644349bb5c197ed1b5`
