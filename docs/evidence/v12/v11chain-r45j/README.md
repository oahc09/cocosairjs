# LV12-01 · V1.1 规格驱动链三引擎铺开批次 r45j（非正典）

采集窗口 2026-09-23T04:58 → 2026-09-23T05:46 UTC。内容：V1.1 规格驱动链余下 **41 例 × firefox/webkit**（chunk-A 21 + chunk-B 19 + mesh-torus 1），
与 `pilot12-r45i`（11 例）合并后构成 **52 例全量**三引擎对账。

## 口径与边界（引用任何数字前先读这段）

- **链路口径**：V1.1 规格驱动链（`tools/verify/v11-examples-verify.cjs`），**不是** V1.2 三引擎 Browser Matrix 正典链。
- **非正典 / 零回写**：全部经 `--out=` 落到本目录。runner 的 `WRITES_CANONICAL` 分支因此为假 ⇒ 整段跳过「证据驱动晋级 + `generate-manifest.cjs`」，并在收尾打印一行 `[skip-promote]`（`v11-examples-verify.cjs:809-815`，**每轮一行而非每例一行**，与本目录批次日志里 `skip-promote_lines_*=1` 相符）；`examples/example.json`、`examples/files.json`、`docs/evidence/v11-examples-verified.json` 无任何写回。
- **证据货币**：本目录 14 份 JSON、90 条记录的 `candidateFingerprint` 全部为 `9fa85f88b968d5f1`，与当期交付 bundle 一致。
- **未动任何判定**：runner 的阈值、契约、源码均未改；红格走「在册归因 + 活体前提每轮现读」，本批次不新增红门禁（F-133/134/135 均 `blocking:false`）。
- **playwright 前置**：本仓库依赖内没有 playwright，必须 `NODE_PATH` 注入。缺注入时每例秒判 FAIL，会产出一份「0/N PASS」的垃圾捕获——首跑原件仍保留在 `docs/audits/global-quality-audit-2026-09-19/raw/gates/r45j-firefox-chunkA-garbage.log`，**勿当结果引用**。

## 命令原件

```bash
export NODE_PATH=<playwright 所在 node_modules>   # 缺失即 exit 8（脚本内有前置守卫）；真实机器路径不入发布面
# ① 40 例 × 2 引擎，串行四腿。脚本原件：raw/gates/r45j-batch.sh
node tools/verify/v11-examples-verify.cjs --ids="$CHUNK_A_OR_B" --browser=firefox \
  --out=docs/evidence/v12/v11chain-r45j/v11-chain-firefox-chunkA.json \
  --artifact-dir=docs/evidence/v12/v11chain-r45j/firefox-chunkA      # webkit 同构、chunkB 同构

# ② 第 41 例单独补腿。首版分区 21+19=40 把 mesh-torus 漏在批外——不补，
#    判据「每引擎 52 个 id」会静默少一格。原件 raw/gates/r45j-mesh-torus-{firefox,webkit}.log
node tools/verify/v11-examples-verify.cjs --ids=mesh-torus --browser=firefox \
  --out=docs/evidence/v12/v11chain-r45j/v11-chain-firefox-mesh-torus.json \
  --artifact-dir=docs/evidence/v12/v11chain-r45j/firefox-mesh-torus

# ③ webkit 两个红格的确定性复跑。原件 raw/gates/r45j-webkit-determinism.sh
for id in audio-basic video-basic; do for n in 1 2 3; do
  node tools/verify/v11-examples-verify.cjs --ids=$id --browser=webkit \
    --out=docs/evidence/v12/v11chain-r45j/diag-$id-wk-d$n.json \
    --artifact-dir=docs/evidence/v12/v11chain-r45j/diag-$id-wk-d$n
done; done
```

## 四腿退出码与实测成本（现读自 wrapper 原件，串行故相邻 start 即上腿 end）

| 腿 | 例数 | 墙钟 | s/例 | EXIT |
|---|---:|---:|---:|---:|
| firefox chunk-A | 21 | 269 s | 12.8 | 0 |
| firefox chunk-B | 19 | 256 s | 13.5 | 1 |
| webkit chunk-A | 21 | 325 s | 15.5 | 1 |
| webkit chunk-B | 19 | 280 s | 14.7 | 1 |

- 合计 80 例·引擎 / 1130 s ⇒ **≈14.1 s/例/引擎**（含每腿一次性开销）。它替换两个旧口径：r45i 的 ≈19 s 是同数量级；「≈63 s/例/引擎」是 2 例摊不开一次性开销的**上限**，勿再引用。
- **EXIT 语义**（`v11-examples-verify.cjs:820`）：`process.exitCode = pass === results.length ? 0 : 1` ⇒ 三腿 `EXIT=1` 是「本腿有 FAIL 记录」，不是崩溃、也不是判据失效；每腿仍走完并写 `completed:true`。红格逐个归因见下节。
- ⚠️ **日志完整性照实登记（成因未钉死）**：wrapper 尾部在 "all legs done" **之后**多出两行错位碎片，内容是 shell 的括号 token 语法报错被截断后的残段（一行以 `cted token` 开头，一行是 `r45j-batch.sh: line 21:` 后跟同样的残段）。已排除的一种解释：「脚本在运行中被编辑」——`r45j-batch.sh` 的 mtime 为 04:56:12Z，早于首腿 start 04:56:21Z 九秒。剩下的候选（未验证，不下结论）：同一路径被第二次调用并发写、或那次无 `NODE_PATH` 的中止跑与本跑共用过 stdout 目标。可核实的部分：上表 4 条 start + 4 条 EXIT + 4 条 skip-promote 共 12 行齐全且与四腿一致，判据读的是 14 份 JSON 而非这份 stdout ⇒ 批次结论不受该行影响。另：`raw/gates/r45j-exits.txt` 是**跨 3 次运行累积**的 12 行（含中止跑），不是单轮记录，引用前先数一遍。
  另一处簿记：`raw/gates/r45j-exits.txt` 是**跨 3 次运行累积**的 12 行（含无 `NODE_PATH` 的中止跑），不是单轮记录；四腿的权威单轮记录即上表所在的 `r45j-batch.out`。

## 结果账（52 例 × 三引擎，判据现读）

| 引擎 | 记录 | PASS | FAIL | apiProof verified/attested/unproven | 来源 |
|---|---:|---:|---:|---|---|
| chromium | 52 | 52 | 0 | 1004 / 129 / 0 | 正典 `docs/evidence/v11-examples-verified.json` |
| firefox | 52 | 51 | 1 | 1004 / 129 / 0 | `pilot12-r45i` + 本目录 3 份 |
| webkit | 52 | 49 | 3 | 999 / 130 / 4 | `pilot12-r45i` + 本目录 3 份 |

- **三引擎同时 PASS 的例数：49 / 52。** **UPDATE-r45m**：49 是「按 r45j 当时在册 4 格红」算出的轮次快照，其中 2 格（mesh-sphere × firefox/webkit）经重采确认为注入伪影 ⇒ 「以干净声明面重算」口径为 **50 / 52**（余 `webkit/audio-basic`＝F-100、`webkit/video-basic`＝F-135）。引用 49 时须同时说明口径，原文保留不删。
- firefox 的 apiProof 合计与 chromium **逐字段相等**（1004/129/0）：firefox 侧唯一的红来自工作树被并行会话注入的假 validator，不是引擎差异。
- 判据机读输出（`hardCount:0 staleCount:0 attributedCount:4`）与源码：`docs/audits/global-quality-audit-2026-09-19/raw/gates/r45j-reconcile-k.{json,cjs}`。

## 红格归因（每格都带「活体前提」，判据每轮现读；前提失效即判 STALE，不会静默豁免）

| 格 | 在册依据 | 归因与现读前提 |
|---|---|---|
| `firefox/mesh-sphere`、`webkit/mesh-sphere` | 并行会话在工作树 `examples/mesh-sphere/example.json` 注入的假 validator（F-132 写盘语义的连带） | 非引擎差异。判据每轮现读该文件是否仍含 `not-a-real-validator`，并比对 `specFp`/`srcFp` 与正典**确实不同**（相同即判归因过期）。本仓库不代他人撤除该注入。 **UPDATE-r45m（2026-09-24）：该活体前提已失效 ⇒ 本行归因过期，两格已重采结案（原文保留不删）。** r45k 提交（`f2acf3e`）把干净声明面固化进 HEAD，本批次判据现读自报 `hardCount:0 staleCount:2 / EXIT=1`（`docs/audits/global-quality-audit-2026-09-19/raw/gates/r45m-r45j-judge-rerun.log`）；重采结果与判据见 `docs/evidence/v12/mesh-sphere-r45m/README.md`。 |
| `webkit/audio-basic` | 在册 **F-100** | 跨链显现。3 次独立复跑 **0 PASS / 3 FAIL**、去重失败签名 **1 种** ⇒ STRUCTURAL，据此排除「释放竞态」解释；`unproven` 集合精确等于 `AudioPCMDataView` / `AudioPCMDataView.getData` / `AudioSource.playOneShot`。 |
| `webkit/video-basic` | **F-135** | 间歇：5 次复跑 **2 PASS / 3 FAIL**、失败签名恒定 1 种。P3 播控段调用计数现算显示序列确实停在 `pause()` 之后、`resume()` 之前；firefox 同例同链全绿、chromium 正典全绿 ⇒ 只在 webkit。 |

> 豁免只覆盖**在册那一形态**。白格内出现任何其它偏差（API 集合漂移、意外翻绿、未在册字段跨引擎漂移）一律硬失败——负控 N5/N6/N7/N8 四臂专证此事。

## 本批次在册缺陷（`docs/audits/global-quality-audit-2026-09-19/findings.jsonl`）

- **F-133** — runner 的整例重试与 `saveArtifact` 固定同名互相打架：`result=FAIL ∧ attempts=2` 的记录里 `artifact.bytes/hash` 指向已被第二次运行原地覆盖的 PNG（`v11-examples-verify.cjs:794-801` × `:193-197`）。本目录失真全部落在该形态、**PASS 格零失真**，即模型成立的正证。
- **F-134** — `resource-released` 的错误窗口只做列表长度差分、消息截 80 字符：示例自身异步序列内抛出的异常被贴标为「during release/reload」，同记录 `no-runtime-error` 却为 PASS。红格归因不得照抄该措辞。
- **F-135** — webkit 上 `video-basic` P3 播控段间歇抛断（见上表）。

## 文件清单（现盘计算）

| 文件 | 引擎 | 字节 | sha256/16 | 记录 | P/F | 带截图记录 | attempts=2 |
|---|---|---:|---|---:|---|---:|---:|
| `diag-audio-basic-wk-d1.json` | webkit | 15,516 | `b66369335f758ee9` | 1 | 0/1 | 1 | 1 |
| `diag-audio-basic-wk-d2.json` | webkit | 15,516 | `ae69c2840bb56bd7` | 1 | 0/1 | 1 | 1 |
| `diag-audio-basic-wk-d3.json` | webkit | 15,516 | `a23fbeeae6dd9d87` | 1 | 0/1 | 1 | 1 |
| `diag-video-basic-wk-1.json` | webkit | 19,739 | `4296cd4d43fb80ff` | 1 | 1/0 | 1 | 1 |
| `diag-video-basic-wk-2.json` | webkit | 20,204 | `e813c1dec3a550c8` | 1 | 0/1 | 1 | 1 |
| `diag-video-basic-wk-d1.json` | webkit | 20,205 | `34648d42ccbda77e` | 1 | 0/1 | 1 | 1 |
| `diag-video-basic-wk-d2.json` | webkit | 20,205 | `72363828cc997983` | 1 | 0/1 | 1 | 1 |
| `diag-video-basic-wk-d3.json` | webkit | 19,740 | `56c4b414936c0b8a` | 1 | 1/0 | 1 | 1 |
| `v11-chain-firefox-chunkA.json` | firefox | 238,237 | `cac56325addd393f` | 21 | 21/0 | 21 | 0 |
| `v11-chain-firefox-chunkB.json` | firefox | 286,798 | `2619fd2b567d7e13` | 19 | 18/1 | 19 | 1 |
| `v11-chain-firefox-mesh-torus.json` | firefox | 10,536 | `2a459a05683732ec` | 1 | 1/0 | 1 | 0 |
| `v11-chain-webkit-chunkA.json` | webkit | 238,733 | `6ac9b733f1277dad` | 21 | 20/1 | 21 | 1 |
| `v11-chain-webkit-chunkB.json` | webkit | 287,260 | `dc4f57ab20849d30` | 19 | 17/2 | 19 | 2 |
| `v11-chain-webkit-mesh-torus.json` | webkit | 10,534 | `0690ecf1cdbc18e1` | 1 | 1/0 | 1 | 0 |
| **合计 14 份** | — | **1,218,739** | — | **90** | **80/10** | **90** | **12** |

截图目录 14 个、PNG 90 张：diag-audio-basic-wk-d1/(1)，diag-audio-basic-wk-d2/(1)，diag-audio-basic-wk-d3/(1)，diag-video-basic-wk-1/(1)，diag-video-basic-wk-2/(1)，diag-video-basic-wk-d1/(1)，diag-video-basic-wk-d2/(1)，diag-video-basic-wk-d3/(1)，firefox-chunkA/(21)，firefox-chunkB/(19)，firefox-mesh-torus/(1)，webkit-chunkA/(21)，webkit-chunkB/(19)，webkit-mesh-torus/(1)。
其中 FAIL 格的 PNG 受 F-133 影响为第二次 attempt 的产物（与记录元数据不同源）；逐格名单见判据输出的 `attributed`。

## 只读复核配方

```bash
node docs/audits/global-quality-audit-2026-09-19/raw/gates/r45j-reconcile-k.cjs      # 判据：EXIT=0 ⇒ hard/stale 皆空
node docs/audits/global-quality-audit-2026-09-19/raw/gates/r45j-negctl.cjs           # 10 臂负控（含阳性对照 + 注入自证）
node docs/audits/global-quality-audit-2026-09-19/raw/gates/r45j-verify-findings.cjs   # 台账纯追加复核
```

判据留了两个注入面供负控使用（正常运行不设置）：`R45J_FILES`（仓库相对路径 → 替换文件）、`R45J_LIVE_MESHSPHERE`（假 validator 现读来源）。
判据在输出的 `judgeInject` 与 `sources[].readFrom` 中自报实际读取层，负控据此自证「改的就是被读的那一层」（陷阱 40）。

## 本批次未做（避免被当成已完成）

- 未回写任何正典证据（`example.json` / `files.json` / `v11-examples-verified.json`）；**正式正典批次仍待 owner 待批 #15/#21**。
- 未做 V1.2 Browser Matrix 口径的三引擎铺开（本目录仅 V1.1 链）；未改 `waitMs`/契约/判定阈值去「让 webkit 变绿」。
- 未复现 `build-dts`；未触碰并行会话的 mesh-sphere 注入。

