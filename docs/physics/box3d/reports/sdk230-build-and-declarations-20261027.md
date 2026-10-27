# SDK230：恢复后的 ST、ESM 与声明限定验证

- 生产输入：`80be38bce03528d4ba7f445481ce35a6da78de83`；发布基线：`8db14b33122d46e357a873f02be03a833fa353eb`。
- 结论：**VERIFIED_LIMITED_BUILD_AND_DECLARATIONS**。真实成功的单次 ESM 将计数 **229→230**；最终 **25 文件、43,796,288 B**。这不是 APP/C20 或 Box3D 全部验收通过。
- 机器摘要：`sdk230-build-and-declarations-20261027.json`，SHA256 `e9e95db3080b637bc1e9ad765fe3e68fa2af4a5aadd1f45827255e0ce584d33b`。

## 恢复与身份

当前恢复的 3,805 个构建投影文件逐 Git blob 核对；不是完整 Git 历史。SDK222 归档仅提供与目标 blob 完全一致的源码/固定解码资产，不转移历史 PASS。原 SDK229、旧 ST/ESM/DTS 原件仍 **UNAVAILABLE**；本次是新的真实构建，不是恢复旧报告或重用编号229。

使用当前 Node24.22.1、官方任务目录 Emscripten6.0.2、CMake4.4.4、Ninja1.13.2。Emscripten 包的锁定实测 SHA256 与当前官方 MD5 匹配，CMake 匹配官方 SHA256。Ninja 来自官方 HTTPS release，包实算 SHA 与历史 executable SHA 核对；元数据 API403 原因未能判定，不称已取得上游 digest 验证，未重试该拒绝路径。

官方 registry 按原版本/integrity、`ignore-scripts` 恢复848包；44个可选平台项未安装。127处 origin 规范化仅在安装副本进行，生产 lock 未改。未全局安装或换 Node，未使用 preload。

## 两次 ST 窗口，分别保留

1. **Attempt1：FAIL_OR_PARTIAL**。本体41命令全 exit0，进程已 ECHILD；官方 Python 编译器目录新增49个 pyc 违反冻结保护，整体不改判。源码/依赖没有漂移。原件及失败结果完整保留。
2. 独立核对49个 pyc（542,805 B）：当前 Python3.12 magic、源文件时间/大小、官方源 SHA 与896个递归 code 对象一致。官方 `config.py` 会将 `EMSDK_PYTHON` 置为 `sys.executable`，使子入口失去 wrapper 的 `-B`；这是静态根因解释，不是逐进程跟踪。这些是编译器缓存，不是生产 runtime 输入。未删除旧缓存、未修改官方代码、未扩大保护排除。
3. **Fresh attempt2：PASS_LIMITED_ST_BUILD_AND_STORAGE_QUALIFICATION**。新独立源/OUT，精确纳入已验证缓存后，完整 **41 命令 / 111 输入 / 85 编译单元 / 58 审计证据**及原 consumer 门禁通过；83.183221秒，exit0、ECHILD、输入漂移0。峰值采样树 RSS259,461,120 B。

新增 storage 检查区分 **受控 C fixture51** 与 **生产 ST WASM12**；前者的故障注入不能冒充生产观察。该链仍不是 APP 100-scene fixture，也不证明全局零泄漏或关闭后的内存可观测性。

## 新 ESM 与新声明

- **ESM230**：全28 features，裸 Node、heap4096，单次成功；64.447776秒，exit0，完整本次子树 ECHILD，保护输入漂移0。23文件 **40,420,432 B**，包括成功后独占写入的18 B `package.json`；995个 map sources，5个关键 runtime 源逐字对照。owner 修复的 CPU 测试文件不进 runtime map，另由 ST111 输入绑定。
- **DTS230**：独立物理源副本，无 hardlink；fresh emit＋3个 fixture＋3个 strict consumer，**7/7 exit0**，66.069347秒，本次子树 ECHILD，保护输入漂移0。strict/noEmit、skipLibCheck=false，引用本轮新声明。两个声明在全部验证后独占晋升，现代3,375,489 B，legacy严格匹配生成器367 B模板及相对 modern 引用；不套旧任意大小门槛。原23 ESM文件与计数230不变。
- ESM终态的 `commands` 数组为空，真实命令在 `budget.command`；DTS门禁原件是 `index/command/cwd/exitCode` 数组。摘要如实引用，不伪造旧版 receipt 结构。

ST预算900秒、870秒安全停、4 GiB RSS、128 MiB输出＋8 MiB诊断；ESM600/570秒、6 GiB、100＋8 MiB；DTS300/270秒、3 GiB、100＋8 MiB。均有阶段互斥、内存余量、180秒无输出保护、动态临时文件 ENOENT 专项容错及严格最终核验。RSS为采样保护，不声称不可见 cgroup 硬限保证。终件计量单独区分：ST2 OUT53,030,547 B、含终件诊断36,420 B；ESM/DTS含终件诊断37,328 / 449,998 B。编译及类型弃用/循环依赖警告保留，不称日志全清。

## 验收边界与原件

截至本报告构建窗口，**APP230 NOT_RUN**，待独立 runner/input lock 与实测；APP229未运行、APP228历史 FAIL0/100及更早失败不改写。完整 C20、I05/I06、G0–G8、浏览器/设备矩阵和全项目验收不由本报告授信；owned仍PARTIAL，历史76940字节差额未在此归因。

机器摘要列出真实命令、25文件哈希和原件相对路径/大小/SHA256。原件路径以本次 retained evidence root 为基准，不是仓库内已经发布的完整附件；只提交摘要/状态/真实计数，不上传大型SDK或raw，**不是自含可重放bundle**。后续 APP 结果应另行记录，不回填本构建原件。
