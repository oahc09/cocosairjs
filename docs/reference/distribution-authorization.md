# 分发授权与依赖安全状态

核验日期：2026-11-01。当前结论为 **BLOCKED**，不是侵权认定。仓库风险接受记录不能替代第三方授权。

## PAL 历史

当前运行时采用冻结 MIT PAL 来源，但不能据此推断旧 `@cocos/engine-pal` 字节的历史分发授权。
`docs/license-decisions.json` 的 `historyAuthorization` 保存了一处实际历史提交、路径和 SHA-256，作为调查入口；没有声称穷尽历史大文件、二进制、标签或其他引用。

闭环需要将旧代码及包含它的历史产物对应到可核验的适用许可或书面授权。当前没有这些授权证据，状态保持 pending。仓库可见性、历史重写、对外联系和已下载副本的处置需要单独决定，本轮没有执行。

## Spark WASM

原始 WASM、glue、内嵌生成源码、source map 和已跟踪的变体 bundle 都属于公开仓库分发核验范围。默认 npm SDK 不包含 Spark，不能解除这些范围的授权阻塞。

已复用原 Spark 移植项目中的许可材料，并逐文件核对原有清单的字节长度和 SHA-256：

- [材料绑定清单](../licenses/spark-materials.json)：257 个文件，与本仓 WASM 和 Cargo.lock 哈希绑定。
- [候选依赖](../licenses/wasm-crates.json)：84 个闭包节点，包括 2 个本地包和 82 个 registry crate；逐项核对 registry archive checksum 与本仓锁表一致。
- [许可原文索引](../licenses/WASM-CRATE-LICENSE-LIST-ZH.md)、[feature/cfg 静态分类](../licenses/wasm-feature-classification.json)及 Rust 标准库的完整 `COPYRIGHT-library.html` 随材料保留。

本次未重新下载 crate 原包、运行 Rust 构建或声称独立重现原构建。上述材料保守覆盖候选依赖，包括部分主机构建和未激活节点；它不是最终链接后的二进制 SBOM。Rust 标准库材料与编译器全树元数据须区分，不能把元数据中的全部组件误称为 WASM 运行时依赖。

仍需补齐实际构建的依赖选择、特性、目标、工具链和二进制来源关联，并复核各项许可证、版权及必要 NOTICE 的适用义务。若采用重建产物，须生成新的完整来源与产物记录，不能沿用旧二进制指纹。

状态继续 pending。未来接受记录必须保留经审阅的 `authorizationEvidence` 文件路径及 SHA-256；仅修改状态或增加 `riskAccepted` 不能通过门禁。

## 门禁范围

```bash
npm run verify:licenses
npm run verify:licenses -- --scope=default
npm run verify:licenses -- --scope=spark
```

默认 `repository` 范围覆盖已知 PAL 历史和 Spark 分发问题，目前应失败。`default` 仅核验默认 SDK；它的 PASS 不代表公开仓库或历史已获授权。`spark` 在许可缺口闭环前失败；Spark 构建器在写任何新产物之前拒绝 pending 状态。发布就绪门禁使用默认 repository 范围。

## 开发依赖与 Actions

兼容范围更新后，固定 Babel 7 修补版本和 serialize-javascript 7 修补版本，保留现有 TypeScript/Jest 主版本及 Cocos 依赖边界，没有使用 `npm audit fix --force`。

本轮末次 audit：26 个受影响包分组、29 个安装节点；节点中 25 moderate、4 low，high/critical 均为 0。排除 dev 后为 0。剩余公告涉及 deepmerge、glob、minimatch；不以跨主版本强制覆盖掩盖 API 兼容性问题。不能把该结果扩张为所有预编译、vendored 或浏览器代码的完整安全证明。

第三方 Actions 已固定到解析得到的完整 v4 提交 SHA，保留手动/可复用工作流入口、只读权限和 checkout 不持久化凭据的约束。未加入公开 PR 自动构建入口。

本轮未重新进行全历史密钥扫描，未访问 GitHub 安全告警设置。原始浏览器证据、日志、失败记录和冻结许可原文不作清理改写。未提交、推送或发布。
