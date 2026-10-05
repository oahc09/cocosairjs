# 本轮渲染定向证据

[index.json](index.json) 记录当前 bundle/dts 指纹、原始报告与源码/截图的完整 SHA256、来源路径和收纳路径。`target/`、`water/`、`hdr/`、`native-queue/` 是专属真实浏览器结果；`formal-*.json` 是仅两个新例的正式 collector 结果。raw JSON 按字节保留，内部原始 capture 路径不改写，可用索引的 `origin` → `stored` 映射定位收纳后的文件。

三浏览器最终目标合同通过，水例各 39 项、HDR 各 15 项通过；实际 legacy queue 6 项通过。正式 collector 各 2/2 `scopePassed=true`，生产者的 `subset` 和 `completed:false` 原样保留；它们不表示旧全 Gallery 161 例或发布门禁已重新通过。

`sources/` 保存本轮实现、验证器与示例/共享源码副本；`logs/` 保留实际命令输出。`history/` 保存首轮目标和规格失败；首轮正式 Chromium FAIL 及其原始截图也保留，没有改成成功。全局手册一致性中既有 module-only 配方失败单独披露，不以本轮 scope PASS 覆盖。

硬件未在本机实际触发采样数降低，显式降级合同由标明模拟范围的 CPU 测试覆盖。Firefox/WebKit GPU timer 为 `null`，CPU 提交、截图和 present 不是同一指标。边界、失败原因及命令见[七项台账](../../../../ai/ledgers/rendering-contracts.md)。
