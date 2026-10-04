# Code First 场景切换与复入

完整关卡替换推荐 `await app.releaseScene()` 后 `app.run(new Scene(...))`；菜单返回需要保留状态时，在同一Scene里使用现有 `SceneStack`。两者的节点、订阅和资产生命周期不同。

| 方式 | 适用范围 | 旧状态和所有权 |
| --- | --- | --- |
| `app.run(newScene)` | 当前session没有cleanup责任的简单Code First场景 | 销毁旧Scene/节点，持久节点迁入；不承诺归还所有手工资产或全局业务监听。已有cleanup时抛 `AIR_E_SCENE_RELEASE_REQUIRED` |
| `await app.releaseScene(); app.run(newScene)` | 持有资产、请求、timer或业务订阅的关卡 | 先撤销旧token、销毁节点、执行显式cleanup；成功后建新session，保留runtime与共享cache |
| `SceneStack` 的push/pop | 同一Scene内的菜单/页面导航 | 隐藏页active=false保活，返回恢复状态；pop销毁页，LRU超限页销毁，不是引擎Scene堆栈 |
| 整页reload | 重建已关闭/初始化失败的runtime，或应用主动全重置 | 新文档重新加载并启动引擎；应用另行恢复存档，不作为普通关卡切换默认方法 |
| `director.loadScene(name)` | 已加载bundle中登记的SceneAsset | API存在不代表外部Creator场景/工程已部署；任意Code First字符串不能生成Scene |

`run`对同一个当前Scene是空操作，保留当前session/token；主循环的 `game.run()` 只启动一次，后续从释放状态恢复时使用已有循环。复入新的Scene创建新的节点/组件状态。

## 清理责任先登记，再替换

```ts
const scene = new Scene('Level');
app.run(scene);
const scope = app.session!;
const token = scope.token();
const onResize = () => { /* 更新本关卡布局 */ };
window.addEventListener('resize', onResize);
scope.own(() => window.removeEventListener('resize', onResize), 'layout');
// 独占mesh/material登记destroy；共享纹理只归还本关卡的一份addRef。
const receipt = await app.releaseScene!();
if (receipt.status !== 'released') throw new Error(JSON.stringify(receipt));
// token.isCurrent()现在为false；迟到结果归还自己的所有权，不挂到下一关卡。
app.run(new Scene('NextLevel'));
```

Node销毁清理它自己的事件和组件；`window`、全局input、业务服务订阅及timer应配对退订。如果没有登记cleanup，直接切Scene后全局业务订阅仍会响应。

`director.addPersistRootNode(node)` 显式保活：release时脱离父级，下一run接入；移除持久登记后才随正常场景释放或显式销毁。共享资产由每个owner持引用，释放自己的引用后外部owner仍可使用。

## 页面导航与缓存

```ts
const stack = new SceneStack(scene, { canvas: app.canvas, maxCachedPages: 1 });
app.session!.own(() => stack.dispose(), 'pages');
await stack.push(() => new Node('Menu'), 'menu');
await stack.push(() => new Node('Options'), 'options');
await stack.pop(); // Menu原节点重新active，状态仍在；Options销毁
```

显式传入app.canvas。隐藏页不是销毁页；组件在onDisable暂停业务订阅/timer、onEnable恢复，避免保活页继续处理当前游戏输入。`SceneStack.dispose()`清理自己的转场timer、捕获监听及页节点，其他责任仍由应用owner管理。它没有第二渲染循环。

## 启动信号与本轮证据

分别测量安全入口import、`await createAirApp`的设备/引擎初始化、建场景至首次真实GPU像素。材质/资源异步加载另列阶段；等待Gallery探针字段、固定睡眠或“没有pageerror”不能证明画面完成。图形缓冲与浏览器呈现也须区分。

本轮三浏览器各100次GPU绘制/释放：旧节点及独占Mesh/Material失效、共享引用回到外部一份、旧token失效、业务监听/timer不再执行；持久节点保持状态并在最终撤销后销毁。直接替换、同Scene空操作、页面保活/返回/LRU和真实page.reload均有断言。两轮首次可绘制缓冲实测约0.50–0.73秒，仅代表本机最小夹具，不保证所有资产场景启动时间。

`loadScene`缺少bundle登记的负例返回false并保留原生1209；未提供外部Creator SceneAsset，不称成功加载这类场景。GPU完整内存量不可用，100次短循环不等于10分钟稳定性门禁。[执行台账](../../ai/ledgers/port-gap-remediation.md)保存报告和边界，[安全启动与释放](safe-startup-and-release.md)给出完整回执合同。
