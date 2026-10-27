# SDK228：真实构建与声明有限资格

## 结论与身份

**新 ESM 构建及新声明 7 项检查通过；这不是 APP/C20 或 Box3D 整体验收通过。**

- runtime/native producer：`fb825da65c8cd259ee8912adb24b7caaa0a64b6a`。
- 报告基线：`ec67b404179167098290b534e000aae178bff047`；后续报告/runner 提交不改变本次构建 producer。
- 唯一新 ESM 实际成功将计数 **227→228**；DTS 不增号。本批 ESM、DTS 各执行一次，没有重试。
- 当前实际 Node **24.22.1**，不是旧环境的 Node22；ccbuild2.3.21、TypeScript4.9.5、Rollup4.29.1，裸官方入口，无 preload。

## 输入恢复与保护

固定提交的 `src/`、`vendor/`、`tools/build/`、`licenses/` 和根文本共 **2329 个 Git blob** 逐字核验。历史 SDK222 材料仅作为源码候选，只有与目标 blob 完全一致的字节才复用，未挪用旧 runtime 或 PASS。此目录是完整构建输入投影，**不是全仓库历史/示例/文档恢复**。

官方 registry 按原 package/version/integrity 安装 **848 包**；44 项平台可选包未装。`--ignore-scripts` 保持；仅安装副本把127项镜像URL改为官方 registry 同一包路径，生产 lock 原字节未改。实际模块加载、esbuild 小转换及 jsdom 关闭检查通过。Spark WASM 从已核的生成源码内联 base64 解出，Git blob、1554721B 和 SHA256 全匹配；没有重建 Spark 或删减 feature。

复用此前真实 ST3：41命令/111输入/85编译单元/58证据、受控 native51 与 production-WASM12。其973个原件按同仓库相对路径复制并全字节核验，原 producer 根保留用于 provenance；完整原门禁再次通过，**未重编 ST**。参见[独立 ST 报告](empty-storage-st-qualification-20261027.md)。

## 本次实测

| 项目              | ESM228                               | DTS228                          |
| ----------------- | ------------------------------------ | ------------------------------- |
| 结果              | `PASS_FRESH_ESM228_BUILD`            | `PASS_FRESH_DTS228_SEVEN_GATES` |
| 记录耗时          | 70.742707s                           | 67.104820s                      |
| 采样树 RSS 峰值   | 3355480064 B                         | 1405825024 B                    |
| 退出 / 中止       | 0 / null                             | 0 / null                        |
| 物理关闭          | ECHILD_AND_NO_GROUP_MEMBERS          | ECHILD_AND_NO_GROUP_MEMBERS     |
| 受保护条目 / 漂移 | 20901 / 0                            | 23543 / 0                       |
| 输出              | 23文件，40408442B，995条 map sources | 2份新声明，7/7检查              |

ESM 命令为 `node --max-old-space-size=4096 tools/build/build.cjs --format esm`，固定全28个 feature（含 `physics-box3d`）、独立新输出。总600s/570s安全停、树RSS6144MiB、启动8192MiB/保留1024MiB、输出100MiB/诊断8MiB；没有无界重试或更改门槛。18B `package.json` 模块标记在成功后独占新建，已计入23文件；terminal前监测的40421441B还含本次日志等，不能误当SDK文件总数。

DTS 使用2274文件的独立物理副本，无源硬链接；heap2048MiB、300s/270s安全停、树RSS3072MiB、同100+8MiB输出界。检查依次是 fresh emit、原 declaration-inputs/external-types/symbols 三fixture，以及 app/mesh/terrain 三strict消费者。消费者只指向本次新现代声明，`strict=true`、`skipLibCheck=false`、`noEmit=true`、`types=[]`。

两份声明先完整验证再以独占 `xb/wx` 晋升；legacy **367B** 必须等于已提交 generator 的规范字面量，且相对引用 `./cocosair.module.js`，没有任意大小下限。现代声明3375669B；原23个ESM文件和counter228在DTS前后均不变。最终SDK为 **25文件 / 43784478B**，DTS不计入ESM原23项。

## 可复核摘要

- ESM result：`sdk228-esm-evidence/result.json`，SHA256 `6cb455aacde44cefb6b9042184b05272d04ae24d7f4422ddf011e808bb96a908`。
- DTS result：`sdk228-dts-evidence/result.json`，SHA256 `f59b32ea4bf5e45e87260b6bcf2baaef29a391c5bec3223aa8f74ddad103910c`。
- 七检查原件：`sdk228-dts-evidence/seven-gates.json`，SHA256 `5e89a418187130389129b2ab12d87138161845ccfecaff79e067b3a163acbcef`。
- JS：`9830404ef59792dbeffe429414cda75171a9eda68cdb99d95945133359956522`；map：`ed29a3840de573de161b1b3f6a62e8076a76e351ab5061d24544ebb48f06a98d`。
- 机器摘要：[同名 JSON](sdk228-build-and-declarations-20261027.json)，SHA256 `2a9a6c25f07499d1e3f0f5b265d1537727f15601d75fdbd16bfcdf0937b778d9`，含25产物及49个留存原件的相对路径/bytes/hash。

上述相对证据路径以独立留存证据根为基准；本报告不嵌入大包、原始SDK或全部依赖，**不是自含重放bundle**。

## 仍保留的边界

ESM 大型生成源的 Babel 样式降级提示、DTS deprecated factory 与 template-literal 处理告警均保留；不称日志全清。ST1源失败、ST2监督失败、ST3通过分别保留，旧host attempt1仍UNKNOWN；本批物理关闭不证明旧未知窗口关闭。

先前APP严格结果0/100及76940B未归因差额不因这次构建改写。新89-row/756-word诊断、owned metadata仍是PARTIAL账本，不代表完整malloc/free或after-close可观测。**本证据不证明APP/C20/I05/I06/G5、浏览器/真机、全局无泄漏或完整Box3D通过**；实际APP执行由后续独立证据处理，不用此构建记录代替。
