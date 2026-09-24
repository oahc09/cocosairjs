# LV12-01 · mesh-sphere 两格重采批次 r45m（非正典）

采集窗口 2026-09-24T00:01:16Z → 00:05:18Z。内容：`mesh-sphere` × {firefox, webkit} 各 1 例，
补的是 r45j 那两格「归因前提已失效」的账（见下）。

## 为什么重采（先读这段再引用结论）

r45j 把 `firefox/mesh-sphere`、`webkit/mesh-sphere` 两格记为**并行会话在工作树
`examples/mesh-sphere/example.json` 注入的假 validator**，并在该批次 README 里写明这条归因带
「活体前提＝每轮现读该文件是否仍含 `not-a-real-validator`」。r45k 提交（`f2acf3e`）把干净的声明面固化进 HEAD
⇒ 前提不再成立。**现读证据不是本目录自己宣布的，是 r45j 判据自报的**：

```
node docs/audits/.../raw/gates/r45j-reconcile-k.cjs   # 原件 raw/gates/r45m-r45j-judge-rerun.log
hardCount: 0 / staleCount: 2 / threeEnginePass: 49
"firefox/mesh-sphere 活体前提不成立：…/examples/mesh-sphere/example.json 已无 not-a-real-validator ⇒ 归因过期"
"webkit/mesh-sphere  同上"
EXIT=1   # 该判据把 STALE 当失败退出，这是设计（归因过期不许静默通过）
```

**归因过期 ≠ 结论翻绿**：r45j 那两条 FAIL 记录是当时在盘的假声明面下捕获的，重采才知道这两格现在是什么。

## 口径与边界

- **链路口径**：V1.1 规格驱动链（`tools/verify/v11-examples-verify.cjs`），**不是** V1.2 三引擎 Browser Matrix 正典链。
- **非正典 / 零回写**：全部经 `--out=` 落到本目录，每腿打印一行 `[skip-promote]`（见 `r45m-*-mesh-sphere.log`）。
  判据前置「写后锁」复核四份正典/声明面文件字节+sha16 逐字节未动：`docs/evidence/v11-examples-verified.json`
  631,722 B `49c81e5a1e4054e9`、`docs/evidence/examples/mesh-sphere.png` 11,503 B `ee4484d24e073e5d`、
  `examples/mesh-sphere/example.json` 7,332 B `850069498848e625`、`examples/files.json` 252,932 B `25df4eb37b607351`。
- **单例子集，不是整批**：两份批次 JSON 的 `runTotal: 1`、`subset: ["mesh-sphere"]`、`partial: true`
  ⇒ 任何人不得把本目录读成「52 例三引擎」的一部分；合并后的三引擎总账仍在 r45j 那份判据里。
- **证据货币**：两条记录 `candidateFingerprint` 均为当期 `9fa85f88b968d5f1`。
- **playwright 前置**：`NODE_PATH` 必须注入外部工作区，缺失时每例秒判 FAIL 会产出「0/1 PASS」垃圾捕获。

## 命令原件

```bash
# 原件：raw/gates/r45m-firefox-mesh-sphere.log 与 r45m-webkit-mesh-sphere.log（wrapper 在仓库外 scratch）
NODE_PATH=<playwright 所在 node_modules> node tools/verify/v11-examples-verify.cjs \
  --ids=mesh-sphere --browser=firefox \
  --out=docs/evidence/v12/mesh-sphere-r45m/v11-chain-firefox-mesh-sphere.json \
  --artifact-dir=docs/evidence/v12/mesh-sphere-r45m/firefox-mesh-sphere      # webkit 同构
```

## 结果

| 格 | result | specFp | srcFp | apiProof | 盘上 PNG |
|---|---|---|---|---|---|
| `firefox/mesh-sphere` | PASS | `c0d64a28c555` | `cb85b55b88591609` | 与正典逐字段等（units 18） | 5,903 B `9f4282940651516f` |
| `webkit/mesh-sphere` | PASS | `c0d64a28c555` | `cb85b55b88591609` | 与正典逐字段等（units 18） | 5,702 B `fd7876d36e265dd3` |
| `chromium/mesh-sphere`（正典，参照） | PASS | `c0d64a28c555` | `cb85b55b88591609` | 同 | 11,503 B `ee4484d24e073e5d` |
| r45j 那两条 FAIL（参照，已过期） | FAIL | `6a2bfacb3483` | `2a9939885f405ae4` | — | — |

⇒ **两格确认为「非引擎差异」**：干净声明面下 firefox/webkit 与 chromium 逐字段一致，三引擎截图字节账互不相同
（反「捕获没换引擎」）。**Δ 自证**由判据完成：注入态 `specFp 6a2bfacb3483` ≠ 干净态 `c0d64a28c555`，
若两者相同则「差异来自注入」这句判红。

### 三引擎总账的读法（不在本目录翻绿，只在 owner 处结案）

r45j 的 `threeEnginePass 49/52` 是按**当时在册的 4 个红格**算的。本目录证明其中 2 格（mesh-sphere × 2）系注入伪影，
⇒ 「若以干净声明面重算」口径下是 **50/52**，余 `webkit/audio-basic`（F-100 在册、STRUCTURAL）与
`webkit/video-basic`（F-135、INTERMITTENT）。**但晋升口径不变**：本批次仍是非正典捕获，
LV12-01 第三格是否翻绿属待批 **#21**，本目录只提供事实，不代签。

## 成本口径订正（勿再用 14.1 s 套单例腿）

四数字现读自本轮 wrapper：firefox 腿 125 s、webkit 腿 120 s ⇒ **单例腿 ≈120–125 s 墙钟**，几乎全是每腿一次性开销
（起服务 + 构建 traced bundle + 装浏览器）。r45j 的 **≈14.1 s/例/引擎** 是 21/19 例摊薄后的**批量口径**，
两者都对，但不能互相套用。

## 判据与负控

- 判据：`docs/audits/global-quality-audit-2026-09-19/raw/gates/r45m-recapture-reconcile.cjs`
  （机读输出同目录 `r45m-recapture-reconcile.json`，当期 `ok:true / hardCount:0 / cellsCount:2`）。
- 负控 5 臂 + 1 阳性臂：同目录 `r45m-negctl.log`。**每臂都按「命中的那一层」判定，不看 `EXIT≠0`**：
  首版四臂全部在同一处「写后锁」提前抛出（锁值被我误给成篡改值），`EXIT=1` 看着齐全却是假阳性，已作废重跑
  —— 教训登记为陷阱 48。
