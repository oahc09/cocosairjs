# 端口集成合同与症状速查

先定位加载、类型、模式、坐标或所有权，再改业务。下表覆盖端口子系统报告的28项；ID沿用[计划§8](../../ai/plans/port-gap-remediation.md#8-新增子系统报告评估2026-10-03仅静态核对)，便于回查原判定。外部工程与截图尚未提供，本页不确认它们的具体根因。

“已验证”只适用于[本轮台账](../../ai/ledgers/port-gap-remediation.md)列出的范围；待验项目也有明确检查入口。源码存在、类型可编译、headless与浏览器像素分别记录，不能互相代替。

## 蒙皮与动画（A1…A8）

| ID / 症状 | 先检查与合同 | 去向 / 当前边界 |
| --- | --- | --- |
| A1 关节少、bounds退化、模型不可见 | 只统计非零权重关节；检查joint整数索引、权重、bindpose、相对root路径和有限顶点。未使用关节允许null bound | [蒙皮数据合同](skinning-code-first.md#合法网格与绑定)，PG-18。索引/路径/矩阵等已有真实负例；不是所有渲染失败的统一诊断 |
| A2 scale无效、用yaw代替镜像 | 模型transform为skinningRoot；分别检查SMR节点、root和祖先。yaw旋转与负scale反射的绕序/法线不同 | [变换作用层](skinning-code-first.md#变换作用在哪一层)，PG-20。两模式TRS、绕序及builtin-standard根/祖先反射/非均匀缩放与逆转置光照参考三浏览器通过；不认证所有骨混合或shader |
| A3 spawn后首帧没有姿态 | 绑定不是一次绘制；真实渲染更新当前关节TRS×bindpose并上传。暂停测试可用director.tick(0)，不推进动画时间 | [暂停首帧](skinning-code-first.md#手动关节与暂停首帧)，PG-19。两模式首帧、真实剪辑pause/resume/定位与每浏览器96排列已验 |
| A4 请求实时却变回烘焙 | 查root上的enabled SkeletalAnimation与useBakedAnimation；internal force是一次重建，不能锁住后续生命周期关联 | 同上，PG-19。公开偏好往返已验；先烘焙后实时补建曲线求值器。可选工具分列请求与有效模式 |
| A5 addComponent后赋mesh没有bounds | 查层级active、renderer.enabled、mesh min/max、有效模型类型。setter已有模型更新路径，不要无证据重复创建bounds | 同上，PG-19。已验原生赋值排列和暂停渲染；外部复现仍待材料 |
| A6 同Mesh换数据仍用旧bounds | 使用reset/updateSubMesh/merge失效入口；Skeleton bindpose变化重算。不要直接改mesh.data字节后期待全部渲染池重绑 | [缓存合同](skinning-code-first.md#修改资产后的缓存)，PG-21。缓存回归通过；活动renderer/烘焙池另有显式重绑定边界 |
| A7 找不到手动骨骼播放器 | 实时模式可直接写真实关节Node TRS；无需新建骨骼系统，也不能拿bindpose当当前姿态 | [手动关节](skinning-code-first.md#手动关节与暂停首帧)，PG-22。单关节合法浮点网格TRS/非单位逆绑定与刚性GPU参考及非法数据负例通过 |
| A8 超过UBO容量自动切texture | 区分实时UBO、实时关节纹理和Baked；容量取当前设备/模型配置，不能把自动选择当模式错误 | [容量与观察](skinning-code-first.md#容量与只读观察)，PG-18/19。真实256槽边界、300关节小palette与实时传输往返通过；越界AIR_E_SKINNING_CAPACITY，RGBA8设备分支未测 |

## Effect、材质与纹理（B1…B5、C1）

| ID / 症状 | 先检查与合同 | 去向 / 当前边界 |
| --- | --- | --- |
| B1 手写Effect编译失败 | 先用现有受限Effect生成器；VERT/FRAG各自预处理，宏不会自动跨阶段共享。builtin转换函数不是通用编译器 | [自定义Shader](custom-shaders.md)，PG-23。本轮双贴图/两阶段UBO、宏隔离及原生编译/链接诊断三浏览器通过；不是完整GLSL编译器 |
| B2 sampler撞UBO binding | 按descriptor set检查binding、count、类型及shader声明；用可选注册前布局预检明确拒绝冲突 | 同上，PG-23。生成器与预检按UBO布局分配，重复/不匹配/错误类型等正负例已验；条件资源与一般编译布局明确不支持 |
| B3 new Material报localSetLayout | 确认await初始化、EffectAsset已注册及name/asset一致；初始化前AIR_E_MATERIAL_NOT_READY是明确时序错误 | [材质](materials.md)、[安全启动](safe-startup-and-release.md)，PG-23。初始化后新Material按effectName/effectAsset在MR/SMR已验，并与现有builtin材质比较；实时SMR需更新它创建的实例 |
| B4 纹理变白、换效果才恢复 | 逐项核对宏、属性名、UV、采样器和源方向。builtin-unlit使用USE_TEXTURE/mainTexture；USE_ALBEDO_MAP不是其替代宏 | [Shader纹理合同](custom-shaders.md)、[方向记录](texture-source-orientation.md)，PG-23/24。图案必须进入真实像素验证 |
| B5 setProperty无异常也没变化 | 未写入任何pass时原生warn；默认errors不显示所有warning，不能仅用try/catch判断。诊断模式另验 | [诊断配置](safe-startup-and-release.md)、PG-18。已有未知属性/default/warnings/工具捕获回归 |
| C1 DOM/内存纹理上下不同 | 查源类型、行序、SpriteFrame UV与glTF材质链。uploadData保留字节行序；Sprite视觉顶边v=0，而旋转+90X的原生plane视觉顶边v=1，需要相反行序 | [纹理源方向](texture-source-orientation.md)，PG-24。Lead三浏览器真实Sprite/plane/helper像素与交错复用已验；glTF完整范围仍待Worker补齐。不要用全局pixelStore修正UV差异 |

## Mesh、相机与组件（D1…D3、E1…E4、F1…F3）

| ID / 症状 | 先检查与合同 | 去向 / 当前边界 |
| --- | --- | --- |
| D1 只能访问_struct/找不到uvs | 使用公开struct/data/readAttribute/readAttributeFormat；缺属性可能为null，不能拿字节长度当顶点数 | [原生API行为](api-behavior-contracts.md)，下方只读示例；PG-26 |
| D2 primitive不能赋给renderer.mesh | primitive输出geometry；utils.createMesh返回Mesh。保留原生返回类型 | [descriptor](primitive-descriptors.md)、[签名检查](porting-input-and-inspection.md#编程前检查签名)，PG-31已验 |
| D3 没有createSkinnedMesh | 原生customAttributes/createMesh可构造蒙皮；本轮WebGL2配方joints/weights为RGBA32F、每顶点4分量 | [蒙皮布局](skinning-code-first.md#合法网格与绑定)，PG-22。不能把整数格式与浮点shader未经验证混配 |
| E1 不设visibility就不画 | 默认相机mask包含DEFAULT；原生Node.layer完整包含或model标签交集满足任一即通过层过滤，再查视锥及组件启用。UI层有独立相机 | [相机](cameras.md)、[只读可见性观察](porting-input-and-inspection.md#复用现有检查工具)，PG-18/26。三浏览器8种状态有实际像素对照，不添加“必须手设DEFAULT”的虚假前提 |
| E2 找不到Billboard | 已按用户决议公开原生Billboard，完整bundle/d.ts/安装消费及三浏览器相机/尺寸/释放范围已验 | [Billboard](billboard.md)，PG-25。不等于公开整个3D粒子系统 |
| E3 pitch正负与预期不同 | Y-up、相机局部-Z、Euler用度；父姿态和组合旋转会改变世界投影。优先用明确世界目标lookAt | [控制方向](design-viewport-and-controls.md#三种控制方向)、[相机朝向](cameras.md)，PG-35。地面控制不推广为自由三维飞行 |
| E4 没有model.visible | Node.active控制子树；renderer.enabled控制组件；visibility是位掩码标签，不是布尔隐藏别名 | 下方隐藏示例、[场景](creating-a-scene.md)，PG-26 |
| F1 addComponent(new Foo())失败 | 参数为Component构造器或已注册名；用node.addComponent(Foo)，不是实例。Scene.addComponent是兼容stub | [组件流程](script-component-workflow.md)、[签名检查](porting-input-and-inspection.md#编程前检查签名)，PG-31 |
| F2 canvas必须#、init/headless混淆 | CSS selector或HTMLCanvasElement均可；安全bootstrap在引擎导入前设置canvas/DPR。physics/renderMode在game.init前确定 | [安全入口](safe-startup-and-release.md)、[设计视口](design-viewport-and-controls.md)，PG-29/35。headless成功不证明GPU像素 |
| F3 screenToWorld参数颠倒 | 公开Camera组件screenToWorld(input,out?)；camera.camera底层screenToWorld(out,input)。输入为原生物理屏幕坐标 | [两层相机接口](cameras.md#code-first-相机接口补充2026-09-26)、[设计坐标](design-viewport-and-controls.md)，PG-08/31/35。透视depth口径另见原页 |

## 诊断、文档与消费身份（G1…G4）

| ID / 症状 | 先检查与合同 | 去向 / 当前边界 |
| --- | --- | --- |
| G1 渲染失败没有统一反馈 | shader编译/链接已有错误；未知材质属性是warn；非法蒙皮数据可抛结构化AIR_E_*。这三层分别验收 | [可选检查工具](porting-input-and-inspection.md#复用现有检查工具)、PG-18/23。正常剔除不是错误，勿在业务帧随意getError消耗队列 |
| G2 只有d.ts找不到语义 | 从本页转到生命周期/坐标/资产专题；以当前已验行为为准，不读取打包bundle猜合同 | [手册目录](index.md)、PG-19/20/21/22/26。未验范围明确列出 |
| G3 同版本重建后行为不同 | 比较source/config/runner/contracts/artifacts及AIR_FEATURES/AIR_OUT_DIR和实际load URL；版本号不是字节身份 | [证据合同](../reference/port-gap-evidence-schema.md)、PG-27。前后漂移则该次结论不可继承，不靠自动改版本消除漂移 |
| G4 隐性坑分散 | 症状→本表ID→合法示例/源码合同→台账证据；外部INTEGRATION-NOTES尚不可读 | 本页与PG-26/34。不能把端口绕行、用户确认或旧报告变成新候选实测 |

## 最小合法代码

以下片段与[类型检查源文件](../../test/fixtures/integration-contracts/snippets.ts)对应；构造材质与渲染组件前先完成初始化。仓库示例的`cocosair`是importmap名称；npm包名是`cocosair.js`，消费者若使用别名需自己配置。

```ts
const node = new Node('Primitive');
scene.addChild(node); // 返回void，保留node变量
const renderer = node.addComponent(MeshRenderer);
const mesh = utils.createMesh(primitives.box());
const material = new Material();
material.initialize({ effectName: 'builtin-unlit' });
material.setProperty('mainColor', new Color(230, 30, 20, 255));
renderer.mesh = mesh;
renderer.setSharedMaterial(material, 0);
```

```ts
const bytes = mesh.data.byteLength;
const uv = mesh.readAttribute(0, gfx.AttributeName.ATTR_TEX_COORD);
if (uv === null) console.log('This primitive has no UV attribute.');
// 使用struct做只读检查，更新走reset/updateSubMesh等公开入口。

const screen = new Vec3(x, y, 0);
const world = camera.screenToWorld(screen);
const same = camera.camera.screenToWorld(new Vec3(), screen);
renderer.enabled = false;
node.active = false;
```

清理时先解除场景使用，再归还自己持有的mesh/material/texture引用；共享资产由最后owner释放。使用[session与releaseScene](safe-startup-and-release.md)配对管理，不能把节点失效当资产/GPU内存已释放。
