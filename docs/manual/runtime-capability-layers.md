# 原生能力、配置与验证范围

PG-32 将四个字段分开记录：`exported` 是公开声明/导出可用，`bundled` 是实际加载产物包含实现，`configured` 是本应用选择了后端、资源和部署路径，`verified` 是当前候选在指定用例中执行通过。一个字段不能推出另一个字段；默认构建与 `AIR_FEATURES` 变体也不是同一个候选。

下面十类参考范围复用现有原生 API。源码说明和历史报告用于找到入口；当前验证以[实施台账](../../ai/ledgers/port-gap-remediation.md)记录的命令、加载字节和限定scope为准。默认产物已统一刷新，完整候选冻结与gate聚合仍待完成；[规范化报告](../evidence/port-gap/README.md)保留子集与完整gate的区别。

| ID | exported / bundled 的入口 | configured 的应用责任 | verified 的证据及边界 |
| --- | --- | --- | --- |
| NP01 纹理 | `ImageAsset`、`Texture2D`、`SpriteFrame`；默认Web纹理链 | 资源URL/类型、行顺序、UV、颜色空间、压缩纹理provider | 三浏览器多源方向、当前Sprite/plane与glTF外部PNG/嵌入图片、实际sampler及交错后原纹理复用，见[当前UV验证](../reference/texture-uv-verification.md)与[方向手册](texture-source-orientation.md)。不推广到所有压缩纹理/颜色空间 |
| NP02 标准材质/光照 | 原生`Material`、`EffectAsset`、灯光和内置effect | 实际camera/layer、绑定、宏、灯光及阴影配置 | S7两阶段UBO/双纹理、S8标准材质反射法线、S9过滤与实际像素；[Effect手册](custom-shaders.md)。历史阴影范围不是本轮所有灯光的PASS |
| NP03 clip/骨骼 | `AnimationClip`、`SkeletalAnimation`、`SkinnedMeshRenderer` | 真实joint/weight/bindpose/root、clip及模式选择 | S8首帧、96组合、clip/pause/resume及公开模式往返、容量和活动重绑；[蒙皮合同](skinning-code-first.md)。多关节非均匀骨混合未认证 |
| NP04 2D粒子 | 默认构建含原生2D粒子入口；[particle-2d-basic](../../examples/particle-2d-basic/main.js) | 纹理、粒子配置与组件启用 | S11默认统一产物三浏览器复跑当前原生2D粒子矩阵，粒子解析/发射/坐标/真实帧合同通过；不以3D粒子/Billboard代替原生2D粒子 |
| NP05 后处理 | 默认feature含`custom-pipeline-post-process`及原生`postProcess`设置 | camera、post-process组件、effect布局数据与原生effect资源实际接线 | Lead S30在owner #6(b)隔离变体完成原生Bloom/FXAA/ColorGrading三浏览器9项A/B、恢复及自有资源归还；[限定范围与复现证据](../notes/post-process-notes.md#13-s30-原生三效果像素子集完成2026-10-04lead实际执行)。实验依赖独立资源库/布局/注册包装，不表示默认SDK开箱可用或完整EG4通过 |
| NP06 builtin碰撞 | 默认3D builtin框架/实现；[碰撞示例](../../examples/physics-3d-collision/main.js) | PhysicsGroup/mask、collider、事件订阅 | S11默认统一产物三浏览器碰撞示例矩阵通过；**不模拟刚体重力积分**，不借Cannon结果证明builtin刚体模拟 |
| NP07 Cannon刚体 | 默认bundle包含Cannon及builtin两个后端 | `createAirApp({physics:'cannon'})`在game.init前选择；不能在初始化后补选 | S11三浏览器[3D物理示例](../../examples/physics-3d-basic/main.js)当前矩阵通过，配置见[后端合同](physics-2d-and-3d.md)。2D Box2D平台配方由Lead S14独立验证通过，见[平台配方](platformer-recipe.md)，不由Cannon结果代替 |
| NP08 音频 | `AudioSource`、`AudioService`，默认Web音频 | URL/用户手势、加载完成、可选音频是否阻Start | 三浏览器BGM连续播放头、pause/resume/stop归零/统一音量；[音频手册](audio-video-webview.md)。WebKit可能需要重复手势和异步加载，不承诺单次手势即时播放 |
| NP09 glTF/生命周期 | `GLTFLoader`、实例与AssetBank/session | decoder provider/URL/CSP、signal、共享owner及实例dispose | AssetBank订阅取消与真实HTTP/CORS/CSP/404，glTF子请求真实abort与顶层不可取消分别采集；100次及10分钟释放见台账。GPU分配量unavailable |
| NP10 实例化 | 原生实例化路径与`EXT_mesh_gpu_instancing`handler | 材质支持、实例属性、组件与实际draw提交 | S11三浏览器neon-night-city矩阵通过，实际drawCalls=8及实例属性合同见原报告；[批处理配方](batching-recipes.md)及CB-11/20是各自范围。不是全部glTF实例化认证，节点数量、宏存在、截图字节量不能替代draw计数 |

## 取消的实际层级

AssetBank的signal取消一个订阅者，不取消原生`loadRemote`底层下载；其他订阅者继续，撤销的迟到资产不会挂回旧场景，见[AssetBank所有权](asset-bank-loading.md)。

公开`GLTFLoader.parseAsync()`使用`GLTFParserContext`；其buffer/image子资源`request()`把signal传入`fetch`。已取消时在解析前拒绝，子请求传输可中止；独立解析器的同URL请求互不取消。旧`context.ts`中的`GLTFContext`不在当前公开loader执行链内，不能用它没有signal推断当前公开子请求无法abort。

`GLTFLoader.loadAsync()`顶层容器使用原生注册downloader，此处fetch没有signal：取消后容器网络仍完成，随后parse拒绝。不能宣称整个glTF链传输取消；共享原生缓存、并发工厂与压缩解码器也不能套用独立parse的结果。三浏览器真实本地HTTP已验证这一区分，当前候选记录见台账。

decoder导出和handler注册不表示provider已配置，更不表示独立JS/WASM资源可从部署路径获取。[decoder部署合同](../gltf/gltf-decoder-deployment.md)规定路径、类型与CSP；不以TypeScript泛型猜测资源解析类型或已下载字节。
