# 公开 PAL 来源、许可与重现

2026-10-01，Cocos AIR 停止使用 `@cocos/engine-pal@1.0.4` 的预编译 JS 和声明，改由公开、带 MIT 授权的 cocos4 PAL 源码生成运行时。项目版本仍为 `1.0.0`，引擎核心 alpha.34 基线不变。

## 可核验来源

- 来源提交：[`9f0e30acb31f6d670f2c0bf818d61039846a2860`](https://github.com/cocos/cocos4/tree/9f0e30acb31f6d670f2c0bf818d61039846a2860/pal)。
- 后续提交 [`db546260…`](https://github.com/cocos/cocos4/commit/db5462603e20d5fa56814380274ad475bf388fb2) 将 PAL 移入私有仓库；本项目固定使用其公开父提交。
- 授权原文：[该提交的 MIT LICENSE](https://github.com/cocos/cocos4/blob/9f0e30acb31f6d670f2c0bf818d61039846a2860/LICENSE)，以及所选源码文件中的版权与许可声明。
- 冻结副本：`vendor/pal-source/`。manifest 记录 38 个输入的 SHA-256、Git blob ID、固定来源提交和编译器版本；已逐项与该提交的 Git tree 核对一致。

原 npm 包仍标为 UNLICENSED；本次没有取得或宣称取得它的新授权。解决方式是停止分发其字节，换用许可明确的公开源码及本项目的明确适配。

## 生成与分发

```bash
node tools/build/pal-source.cjs --check
node tools/build/pal-source.cjs --write
```

默认及 `--check` 都只读。`--write` 才会重建 38 个 JS 文件、`audio/type.d.ts` 和随包版权 notice。生成使用已锁定的 TypeScript 4.9.5、ES2020、LF 换行，不下载源码或执行 npm 包的脚本。

原始来源保持原样，AIR 适配位于生成器中：

| 源码 | 适配 |
|---|---|
| `pal/env/web/env.ts` | `findCanvas()` 优先返回宿主 `__CC_CANVAS__`，让游戏设备使用真实目标画布。 |
| 三个 Web keyboard/mouse/touch 输入源 | 使用同一画布绑定。 |
| Web screen adapter | 使用宿主绑定、保留 DPR cap，以及未绑定时的显式错误。 |

`licenses/LICENSE_pal.txt` 原样保留 MIT 原文，`licenses/NOTICE_pal.txt` 汇总所选源码的原始版权/许可头；二者通过 `licenses/` 文件清单随 npm 包发布。JS 保留原始声明，声明产物也携带其来源头。

## 防回归检查

- `verify:file-map` 对账 39 个 PAL 生成产物的出处和改动登记，并执行生成器的字节复核。
- `verify:licenses` 复核来源、许可、全部产物和 notice；开发及 min bundle 如仍带退役包的 PAL 私有字段指纹，检查失败。
- `smoke-30` 检查固定来源、五个宿主适配的登记、输出数量及可复现性。
- `canvas-binding.cjs` 的四种模式覆盖经典 ID、自定义 ID/触摸、冲突和缺少绑定；渲染通过实际 framebuffer 像素判定，已去掉旧的无条件通过项。

PAL 替换改变 bundle/声明指纹，必须重新采集运行证据后再判断发布就绪。当前结果见 [发布复核记录](release-review.md)。
