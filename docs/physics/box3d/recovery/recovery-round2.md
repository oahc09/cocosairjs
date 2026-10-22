# Box3D 定向恢复核查：第二轮

核查日期：2026-10-22。范围是恢复材料核查与重建交接，不是已丢失功能的重新实现、运行或验收。上游更新工作树未被本轮修改。

## 有价值的找回结果

PR8 的已有 Library 包中，开发版 sourcemap 保留了 939 份完整 sourcesContent。按逻辑路径逐份计算 Git blob 后，939/939 与固定 main `b573be0741db9e2a13d38ce7e65870b97a1f5fbc` 的 tree 一致，零不同、零未映射。这些基础源码已按原始字节提取并再次核验，共 14,560,757 bytes。

这是可复用的基础引擎/Box2D 源码，不是本次丢失的 Box3D 新实现，也不是完整仓库。只包含构建依赖图进入 sourcemap 的文件；被编译擦除的接口、未被引用的工具和其他仓库文件不在此集合。

来源：
- Library `libfile_67d50178392c8191b448022aab1c452d`，`pr8-box2d-fixes-6296baad.zip`。
- 包 SHA-256：`1b058c44964daca900b09792c40b5abaaeeb5b1486ca62c09f2ce8519bd0ddcb`。
- 内部开发版 map SHA-256：`fa4c37cd573c4a3a0da1e2b4fed2e7965cff263d6e684f14e394f44d99b99309`。
- 固定 main tree：`13626c455aaadfea31bab1d9e634e0692045bc18`。
- 每份源码的路径、大小、SHA-256、Git blob 与主线 blob 对照均保存在配套 manifest。

PR8 包的全部 18 个 payload 文件也逐一通过其历史 manifest 的大小、SHA-256、Git blob 校验。其中 15/18 与固定 main 一致，包括 Box2D adapter、原生 C++ bridge、native/integration 测试、WASM/MJS、JS/minJS/d.ts 等；不同的是 CI workflow 和两份 sourcemap。因此不能直接用旧包覆盖主线，更不能将旧 maps 伪称为主线原 bytes。

## 实际检查的旧包

以下五包的全部文件均已读取并计算每个成员的 SHA-256，同时扫描本次 Box3D 特征标记；合计 5156 个文件、288,947,012 bytes。未发现 Box3DNativeWorld、AIR_E_BOX3D、gift-workshop、production125、continuousSurfacePolicy 或最终连续面策略标记。

1. PR8 Box2D 修复包，23 个文件。内容是 Box2D 修复和产物，非 Box3D。
2. `engineering-checkpoint-969b7c-r2-depth-fix.zip`，799 个文件，是 Lumen 工程。
3. `engineering-checkpoint-coupled-886165a.zip`，774 个文件，是更早的 Lumen 工程。
4. `cocosair-audit-reproduce-20261019.zip`，547 个文件，是引擎审计资料与部分基线源码。
5. `cocosair-engine-ea2b507-20261003.zip`，3013 个文件，是更早引擎基线，含 875-source maps，不含本次实现。

包 ID、包 SHA-256 和逐成员哈希在交接清单中。旧包本身已经持久化在 Library，新的交接包不重复收录全部旧 ZIP。

另检查了正常工作区已有的三个根目录 tar.gz 文件路径清单：interactive-replication-checkpoint、soft-lab-deploy、soft-lab-knife-fix，均没有目标路径命中。未检查被禁止的会话目录或尝试绕过先前的访问拒绝。

## 远端核查边界

实际读取了当前 7 个分支的固定 head 递归 tree，所有响应均 `truncated=false`，没有本次 Box3D / gift-workshop / convex-contracts 等目标路径；同时保留 9 个 PR 的元数据和正文、最近 30 个主线提交，以及 Box3D 提交检索的空结果。

主线仍是 `b573be0741db9e2a13d38ce7e65870b97a1f5fbc`。上游更新分支核查的是固定 `496ed900a64e498fca663e254f3dcda73fa7ba90`。没有变更任何远端分支，也没有将其他分支或旧源包改标为丢失的重建基线 `02261afc53caac4cbfae483feff2948da426681a`。

此结果不等于检查了不可见/已删除分支、所有历史对象、PR 评论或外部设备备份。当前检查范围没有发现额外的 Box3D 实现备份。

## 交给重建工程的材料

可直接复用：v1.2 设计计划、C14 位级恢复补丁、已标明版本边界的最初 CPU 测试输入，以及本轮提取的 939 份精确基础源码。Box2D 的 adapter/bridge/验证工具可作为已有架构参考，不是 Box3D 生成器。

仍需重建并重新验证：Box3D 原生桥和构建集成、适配器、最终 C16 candidate 5、EX09 生产脚本/配置/普通输入恢复器、消费者与独立验证器、完整原始物理流和发布验收。C14 测试输入缺依赖且不是最终历史文件；没有恢复任何 PASS。旧录像/报告只能作为历史结果展示，不能替代连续证据。
