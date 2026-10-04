# 安全启动与场景释放

`cocosair.js/bootstrap` 是无 eager engine import 的小入口。它先解析canvas、验证配置并绑定全局canvas/DPR，再动态导入旁边的同一runtime。可以先导入该入口，再创建自定义ID的canvas：

```ts
import { createAirApp } from 'cocosair.js/bootstrap';

const canvas = document.createElement('canvas');
canvas.id = 'game';
document.body.appendChild(canvas);
const app = await createAirApp({
    canvas,
    pixelRatioCap: 1.5,
    designResolution: { width: 640, height: 480, policy: 0 },
    diagnostics: 'warnings',
});
const { Scene } = await import('cocosair.js');
app.run(new Scene('Main'));
```

引擎主入口保留 eager import。通过主入口使用自定义canvas时，仍须在import之前设置 `globalThis.__CC_CANVAS__`；DPR上限通过import前的 `__CCDPR_CAP__` 配置，或使用安全入口。安全入口本身不创建body/CSS，不抢焦点；页面负责canvas布局。引擎给可交互canvas补默认tabIndex，真实点击才聚焦。

`pixelRatioCap` 是有限正数，默认2并保留旧全局上限。首次缓冲和resize都采用 `min(devicePixelRatio, cap)`，物理尺寸按Math.round取整。`designResolution.policy` 使用原生枚举0…4（EXACT_FIT、NO_BORDER、SHOW_ALL、FIXED_HEIGHT、FIXED_WIDTH）；初始化后、场景运行前调用原生view，不添加第二套坐标换算。EXACT_FIT的独立正交半宽、原生命中及三种控制方向见[设计视口手册](./design-viewport-and-controls.md)。

同canvas、同规范化配置的并发调用共享初始化Promise和app。默认值与显式默认值相同；context回调比较函数身份。不同canvas/配置报 `AIR_E_APP_CONFLICT`，已有 `#GameCanvas` 与目标canvas冲突报 `AIR_E_CANVAS_CONFLICT`。校验失败不导入引擎；开始导入/初始化后失败则 `AIR_E_APP_RELOAD_REQUIRED` 要求重载，不能假定单例可以原地回滚。底层 `WEBGL2_REQUIRED` 原错误码保留。

## 资源与会话所有权

新app暴露 `session`。它持有cleanup回调、active/generation及token；旧generation的异步完成必须检查token，再决定是否挂到场景。把具体资产、订阅或timer的清理注册到scope，避免在销毁后从component字段找回资产：

```ts
const scope = app.session!; // AirApp兼容旧自定义handle，因此新成员在接口中为可选。
const token = scope.token();
const unsubscribe = inputService.subscribe(handleInput);
scope.own(unsubscribe, 'input');
scope.own(() => clearInterval(timer), 'timer');

const result = await loadSomething();
if (token.isCurrent()) attachResult(result);
else releaseOurOwnership(result);
```

`own`返回的函数只取消该scope的清理责任，适合显式转移所有权；它不执行cleanup。`onChange`返回独立退订函数，`offChange`用于已有输入gate合同；观察者异常不改变会话状态。`dispose`终态，新的会话使用新scope。

共享资产使用引用计数或AssetBank所有权，cleanup只归还自己的引用。手工创建且独占的Mesh/Material才直接destroy。节点销毁、最后资产引用释放和GPU内存是不同证据。

## 释放、替换与关闭

直接替换、显式释放、Node页面栈、整页重载及bundle loadScene的比较与实测见[场景切换与复入](scene-switching.md)。

首次 `app.run(scene)` 接管初始化session中的清理责任，不会提前释放准备中的资源。
第一次运行前取得的session会成为首场景session；release后的新场景使用新scope。

```ts
const receipt = await app.releaseScene!();
if (receipt.status !== 'released') throw new Error(JSON.stringify(receipt));
app.run(new Scene('Next'));
```

释放立即撤销会话并暂停循环；在途重复调用共享Promise，期间run报 `AIR_E_SCENE_RELEASING`。成功后app和director的getScene均为null；无需AFTER_DRAW，未run、暂停或context lost也执行CPU清理。cleanup是协作式5秒上限，超时或异常返回failed、pending和failures；不能抢占阻塞JavaScript线程的同步回调。失败后run拒绝，不把超时当完成。

receipt明列保留runtime、scheduler、builtin、共享cache和持久节点。持久节点在空场景期间脱离父级，下一run仍按原生流程接回。scope cleanup后的已请求资产释放会排空，其他拥有者仍保留其引用。浏览器不能提供完整、可移植的GPU分配量，receipt明确unavailable，不能以销毁节点推断GPU零泄漏。

原有 `run(newScene)` 仍支持没有scope清理责任的直接替换；相同当前Scene重复run为空操作。如果已注册cleanup，先await releaseScene再替换，防止旧业务监听遗留。`close()` 幂等终止app并移除context/diagnostic观察，之后同文档create/run报 `AIR_E_APP_CLOSED`，重建底层runtime要求reload；不承诺context恢复或同文档重建。

本页描述实现合同，完整验证状态见[台账](../../ai/ledgers/port-gap-remediation.md)，不能代替最终包消费者或长期稳定性门禁。

当前源码隔离候选已有三浏览器实测：未run、暂停、真实`WEBGL_lose_context`丢失、恢复后failed以及未结算cleanup。丢失后业务update与GL draw调用停止；release只做CPU清理，不恢复失效上下文。恢复事件仍走restoring→failed并要求受控reload，不承诺重建GPU资源。未结算cleanup约5秒返回failed/pending，后续run拒绝；这个预期负例不是清理成功。

三浏览器各100次绘制/释放，以及独立十分钟运行期间各20次释放已有实际记录。重复release共享Promise，自有Mesh/Material失效、业务监听退订、保留的共享Texture仍有owner，最终引用归零。浏览器可用时另记JS heap；GPU分配量持续unavailable。十分钟观测不证明永久无泄漏，也不替代最终安装包候选的相同检查。
