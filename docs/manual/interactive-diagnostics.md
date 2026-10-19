# 版本匹配的误用诊断

本轮固定SDK见[执行记录](../../ai/ledgers/interactive-engine-improvements.md)。诊断为可选开发工具，不进入默认SDK；不创建第二套Scene/Node或公共诊断框架。[三浏览器实际报告](../evidence/examples/interactive-engine-improvements/misuse-s3.json)各五条消费负例/正确调用通过。

| 误用                        | 当前实际结果与正确入口                                                                                   | 最早安全阶段                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `Mesh.createMesh`           | 不存在的静态工厂，JS TypeError；`utils.createMesh(IGeometry)`返回真实三顶点/三索引                       | TS声明或调用入口             |
| `Scene.addChild(Component)` | JS TypeError；先创建Node，再`node.addComponent`并`scene.addChild(node)`                                  | TS参数类型                   |
| base材质运行期override      | 当前构建无可观察状态变化，不能靠通用console告警认定；base初始化states或MaterialInstance override正确读回 | 读取原生pass状态与消费侧断言 |
| sampler/UBO槽位碰撞         | 现有`prepareEffectForRegistration`抛`AIR_E_EFFECT_LAYOUT`，issue `BINDING_COLLISION`定位shader/resource  | 可选注册前preflight          |
| callable资源JSON克隆        | 原工具会静默删函数；现在在克隆前抛同一错误码，issue `NON_JSON_FUNCTION`定位`$.factory`；纯编译JSON通过   | 可选工具入口                 |

Scene继承Node，`Scene.addComponent`不能一概称错误。本例负例是将Component当Node传给addChild。base消费断言`CONSUMER_BASE_OVERRIDE_NOOP`是报告中的局部诊断标识，不是新发布SDK错误码。函数是显式消费字段，未声称SDK builtin effect含该字段；编译JSON和活EffectAsset必须分开。闭环输入也有`NON_JSON_CYCLE`位置错误；不用原生stringify异常掩盖字段问题。

```ts
const mesh = utils.createMesh(geometry);
const node = new Node('model');
scene.addChild(node);
const renderer = node.addComponent(MeshRenderer);
renderer.mesh = mesh;
const base = new Material();
base.initialize({ effectName: 'builtin-unlit', states: { depthStencilState: { depthWrite: false } } });
renderer.setSharedMaterial(base, 0);
renderer.getMaterialInstance(0)!.overridePipelineStates({ blendState: { targets: [{ blend: true }] } });
```

现有inspectAirMaterial/inspectAirMeshMaterial/inspectAirGeometry连续读取20轮；资产引用、mesh字节、pass状态和帧数前后完全相同。报告保留material set/采样拓扑/实际reflection范围。没有画面验收，healthy或空issues不升级像素PASS；没有全shader或所有binding反射保证。

console原始消息全保留，报告consoleGroups仅按类型+完整文本汇总次数。生产bundle可能不输出base override警告，Firefox的WebGL lazy-initialization warning也不能冒充该警告。未使用Spine不等于主动使用缺失能力成功；上述历史报告的可选模块缺失请求路径仍为NOT_RUN。

## 默认安装包的可选入口边界

`node tools/verify/consumer-acceptance.cjs` 现在从真实 `npm pack` 产物安装独立消费者，
用消费者自身的 ESM `import('cocosair')` 验证合法入口，再主动请求默认包未发布的
`import('cocosair/spark')`，要求 Node 返回 `ERR_PACKAGE_PATH_NOT_EXPORTED` 并定位 `./spark`。
这是包导出边界，不是 Spine 资产缺失或所有可选特性编译变体的保证；不启用或发布 Spark 新入口。

同一检查另向本地 HTTP 服务请求不存在的资产，保存实际 404 状态和响应体。
该传输负控与包入口错误分别记录在 `entryBoundaries`，不能拿 404 冒充模块缺失错误。
合法入口的模块求值使用既有 JSDOM 浏览器全局，仅证明安装包解析/导出，不证明 GPU 画面。
同候选 CI 的 `consumer.log` 保留原生错误、真实入口和传输结果；旧浏览器报告不因此升级。

命令：`node tools/verify/interactive-misuse-browser.cjs --out=<new.json>`采集三浏览器，临时生成既有effect fixture并清理；`--verify=<report.json>`只读重算身份/原生状态与范围，不启动浏览器。运行需既有Playwright环境。原误用首轮console归因失败及工具函数丢失的失败日志均保留。

## 浏览器网络观察合同（2026-10-19）

`sdk-recipes-browser.cjs` 启动前核对 16 个静态输入，包括动态 import 的 shared helper、effect-layout 与 fetch 的 effect JSON，并记录逐文件 hash。缺失输入在启动浏览器前明确拒绝。浏览器 `response` 与 `requestfailed` 分别保留 pathname、真实 HTTP status 或原生 failure、resourceType；URL query、fragment、凭据不进入这份网络记录。原生失败的 status 为 null，不能冒充 HTTP 0、404 或 502。

每次执行包含本地 200、真实 HTTP 404 和断开 socket 的 fetch 负控；仅两个精确控制路径允许失败，其余网络错误令整批失败。初次本地还原漏失 effect-layout 或 effect JSON 时，新记录已准确定位实际 404，并保留失败收据。修复完整还原后，本地 WebKit 的网络控制和原七组 recipes 8/8 通过；新 head 的同源 CI 验收另行记录。MI-ENV-011 历史未记录的 502 URL 仍为 UNKNOWN，本次工具不能补回历史请求。
