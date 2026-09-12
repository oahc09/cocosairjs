# Cocos Air V0.1 — 进展日志

> 基线：`cocos4 @ 4.0.0-alpha.33 (snapshot 2026-09-12)`
> 依据：《Cocos Air V0.1 — cocos4 Web-TS Engine Extraction 任务计划书》
> 详细验收证据见 `docs/acceptance-report.md`。

---

## 2026-09-12（二轮）：L13 蒙皮动画修复完成 → V0.1 验收矩阵 15/15 PASS

### 结论

**V0.1 全部 15 个验收等级（L0–L14）通过**，Definition of Done 16 项条件中仅剩
流程性收尾（首轮 git commit、License audit、README）。

### L13 三个叠加根因与修复

| # | 层面 | 根因 | 修复 |
|---|---|---|---|
| 1 | 着色器 | glsl4 fixture 的 `u32vec4 a_joints`（Vulkan GLSL 类型）在 Air 降写器剥除扩展后残留，ESSL 编译 `syntax error` → 蒙皮变体程序创建失败（即一轮报告的 "no valid shader program in use"） | `register.ts` 降写器将 `u32vecN → vecN`（匹配 RGBA32F float 属性通路） |
| 2 | 数据绑定 | `register.ts` 的 `LOCAL_BLOCK_BINDINGS` 缺 `CCSkinning` 键，fallback 到 binding 0 与 CCLocal 冲突，`cc_joints` 读到世界矩阵数据 | 映射 `CCSkinning: 3`（= `UBOSkinning.BINDING` = UBO_SKINNING_TEXTURE） |
| 3 | 示例资产 | `skeleton.joints` 需为相对 skinningRoot 的完整路径，示例写了平铺名 → bone1/bone2 未注册，关节矩阵为零 | `examples/skinned-animation/main.js` 改为 `bone0/bone1`、`bone0/bone1/bone2` |

### 附带修复：`npm run build` DebugInfos 解析失败

独立 src 树下 ccbuild（node-resolve）无法解析扩展名less 的 `../../../DebugInfos`
（同工具链对原始 cocos4-vulkan 树可解析）。修复：`debug.ts` import 显式 `.json`
扩展 + 根 tsconfig 增加 `resolveJsonModule`。已记录 upstream-file-map.json。

### 回归结果（全绿）

- `npm run typecheck` — 0 错误
- `npm run build` / `npm run build:min` — 成功（dev ~48s / min ~36s）
- `npm run verify:web-only` — PASSED
- `npm test` — 4 suites / 7 tests 全过
- 浏览器实测：蒙皮变体编译链接成功、3 关节注册、网格逐帧变形
  （4 帧 bbox w=142→176→252→234），证据 `docs/evidence/skinned-animation-pose1~3.png`

### 剩余已知事项（非阻塞）

1. 蒙皮材质 `setProperty('mainColor')` 未生效（外观级，属性名与 fixtures 对齐问题）
2. WebGL 每帧 `INVALID_ENUM: getParameter` 警告（能力查询路径，待查）
3. WebGL1 为当前设备主路径（API.WEBGL），WebGL2 源已备好未启用
4. AnimationClip 曲线资产仍需 Creator 管线（V0.1 以 Code First 骨骼驱动替代）

### 下一步（按计划书 §33）

1. **首轮 git commit**（当前仓库 0 commit，全部文件 untracked——版本锚点缺失）
2. Phase 18 第二轮源码裁剪（L 全通过后允许开始）
3. Phase 19 License / Third-Party audit
4. README → V0.1 RC

---

## 2026-09-12（一轮）：V0.1 主体完成

- Phase 0–3：基线记录（UPSTREAM.md / 00-upstream-baseline.md，上游 SHA 不可得记
  Deviation-01）、Web Feature Set 实测（01-web-feature-set.md）、依赖图
  （749/839 文件）、Extraction Manifest + upstream-file-map
- Phase 4–8：src/ 独立树（841 文件，闭包较上游 -40%）、native/editor/jsb 物理移除、
  typecheck / build / verify:web-only 全部通过
- Phase 9–14：Air Bootstrap、hello-cube、static-model、dev loop（23.8s 全链路）、
  baseline 对比（17-baseline-comparison.md）全部 PASS
- L13 蒙皮动画当时为部分通过（骨骼/蒙皮/动画数据链路 OK，蒙皮变体光栅化失败）——
  已于二轮修复（见上）
