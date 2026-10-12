# W5 Effect Driver Pilot

Effect Driver 将声明式输入绑定映射到真实消费者 Material uniform 更新。

两个原生消费者为完整 E03 Holographic 和 E04 Neon。通过 `?consumer=holographic` 或 `?consumer=neon` 选择单个消费者，页面只有一个 AIR canvas。

**绑定**：pointer-position / pointer-x / pointer-y / time / auto-animate / map-range。参数批量原子校验。

UV 向量驱动真实节点位置；两个母顶点变体使用原生世界矩阵，母片段算法完整保留。标量覆盖对应母 uniform 分量，其余母默认值和颜色均完整上传。Driver 原始输出与消费者范围饱和分开记录。

验证：[独立 CPU oracle](../../tools/verify/shaders-driver-pilot-oracle.cjs)、[真实采集器](../../tools/verify/shaders-driver-pilot-browser.cjs)、[只读 Gate](../../tools/verify/shaders-driver-pilot-gate.cjs)。三浏览器冻结候选功能通过；性能以正式 Gate 为准。Agent 与独立 Gallery 仍为 NOT_RUN。

使用仓库既有依赖，不安装额外 runtime。先冻结输入；性能需要 Lead 的串行窗口授权：

```sh
node tools/verify/shaders-driver-pilot-browser.cjs --phase=functional --browser=all --out=<new.json>
node tools/verify/shaders-driver-pilot-browser.cjs --phase=performance --browser=all --authorization=<token> --out=<new.json>
node tools/verify/shaders-driver-pilot-browser.cjs --verify=<report.json>
```

并行 SDK 构建会使当前工作区报告拒收。冻结副本的通过只证明其记录的候选字节；不能自动升级为当前 SDK、Wave5 整体或发布验收。参考和许可证见 [UPSTREAM.md](UPSTREAM.md)。
