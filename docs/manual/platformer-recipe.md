# 平台跳跃配方

PG-12 的限定配方已由 Lead 在当前默认运行包上验证：真实 TMX/TSX/PNG、Box2D 瓦片碰撞、单向平台、松键摩擦、空中惯性、定步与渲染解耦、真实键盘、暂停/restart 和清理。实现是[可运行夹具](../../test/fixtures/platformer-recipe/main.ts)，数值见[配方合同](../../test/fixtures/platformer-recipe/recipe-contract.ts)。旧报告中的失败保留，不用旧报告声明当前通过。

原作端口材料仍未提供；这里声明独立配方范围，不声称 1:1 复刻。斜坡、移动平台、敌人 AI 和完整业务关卡不在本配方内。

## 运行与采集

先运行 `npm run build` 和 `npm run dev`，再打开 `/test/fixtures/platformer-recipe/`。页面脚本会完成受控阶段，然后允许 A/D 或方向键移动、W/空格跳跃。采集器需要可解析的 Playwright 工具链和三个匹配浏览器，且输出路径必须为新文件：

```powershell
$env:NODE_PATH=(Resolve-Path output/playwright/tooling/node_modules).Path
node tools/verify/air-platformer-browser.cjs --browser=all --out=output/playwright/platformer-new.json
```

当前原始执行为 `output/playwright/air-platformer-s14-terminal.json` 和同名 `.log`，截图及逐浏览器日志在对应 `-artifacts/`。报告是 `subset=true`、`completed=false`，只覆盖本配方。GPU 内存不可测；资产引用和对象失效检查不等于所有 GPU 分配永久无泄漏。

## 单位和碰撞体初始化

`PhysicsSystem2D.gravity` 的 setter 接受像素/秒²并转换；`RigidBody2D.linearVelocity` 直接使用 Box2D 单位。目标 90 像素/秒必须除以公开的 `PHYSICS_2D_PTM_RATIO`（32），读取后再乘回。两者不能用同一规则重复转换。

```ts
import { PhysicsSystem2D, Vec2, PHYSICS_2D_PTM_RATIO, Size } from 'cocosair';

PhysicsSystem2D.instance.gravity = new Vec2(0, -640);
playerBody.linearVelocity = new Vec2(90 / PHYSICS_2D_PTM_RATIO, 0);
playerBody.linearDamping = 0;
playerBody.fixedRotation = true;
playerCollider.size = new Size(12, 14);
playerCollider.friction = 0.2;
playerCollider.apply();
```

Code First 中，已启用的 Box2D collider 修改 `size`、`friction` 等字段后要调用 `apply()`，重新生成底层 fixture。只改组件字段会留下旧形状。本配方玩家和每个 16×16 瓦片均在设置完毕后应用；Tiled 层为 20×12，底部一行实心，左右墙及三块单向平台由 TSX 属性决定，共 42 实心块、3 平台块。

## 官方瓦片查询与接地

使用 `tiledMap.getLayer('level')`、`layer.getTileGIDAt(col, row)` 和 `tiledMap.getPropertiesForGID(gid)`，按真实 `.tsx` 的 `solid`、`oneway`、`friction` 属性生成原生静态碰撞体。空 GID 不生成碰撞；未知 GID 属性不作为实体。出界查询的原生错误如实保留，不虚构 `AIR_E_*` 错误码。

地图、玩家视觉节点都放在同一 Canvas 子树，坐标以地图中心为原点。单纯把 UI Sprite 放在 Scene 顶层不会进入该 Canvas 的渲染遍历。

`BEGIN_CONTACT` 只表示相交，不能直接当作落地：墙面、平台下表面和已禁用的上升接触同样可能发出 BEGIN。本配方在 `PRE_SOLVE` 读取原生世界流形，按 `colliderA` 身份把 A→B 法线转为指向玩家的支撑法线；要求法线向上、接触区间覆盖脚底内部且接触未禁用。`END_CONTACT` 移除对应 collider 的支撑，restart 清除旧支撑。墙角擦边不授予地面跳跃。

## 单向平台

原生回调参数顺序为 `(self, other, contact)`：

```ts
playerCollider.on(Contact2DType.PRE_SOLVE, (self, other, contact) => {
    if (other.tag !== ONEWAY_TAG) return;
    const vyPX = playerBody.linearVelocity.y * PHYSICS_2D_PTM_RATIO;
    const platformTop = other.node.worldPosition.y + 8;
    if (vyPX > 1e-3 || previousFeet < platformTop - 1) {
        contact.disabledOnce = true;
    }
});
```

`previousFeet` 是该物理步开始前的脚底高度。上升或尚在板下时禁用本步，只有从板上下降才接受碰撞；`disabledOnce` 不会把接触永久关闭。微小正速度舍入误差不能触发“上升”，否则站立会反复穿落。正式夹具还在同一回调维护接地状态，避免禁用接触被算作支撑。

采集器独立检查从下穿过、越过板顶、下降的真实法线/冲量，以及最后连续十步站立的位置和速度；单纯累计 BEGIN 次数不作为落板证明。

## 摩擦与单时钟

玩家和地面的 µ 均为 0.2，采证读取原生接触的实际混合摩擦。松键后不写入衰减速度，不使用 linearDamping，50 步内由接地摩擦减速至零；空中阶段先松开所有移动键，再观测 12 步水平速度保持。按键仍按住时每步重设速度不能证明空中无阻力。

`physics.autoSimulation=false` 关闭 director 的自动物理推进。受控阶段用 `createStepClock.begin()` 暂停引擎 pacer，`clock.step(0)` 只渲染；物理由显式 `physics.step(1/60)` 及两次场景同步推进。实时阶段仍保持引擎 pacer 暂停，只运行一个自持 rAF，累加器补齐 0..N 个固定物理步，再 `director.tick(0)` 渲染。不要同时恢复引擎主循环并开启第二条物理时钟。

暂停清空输入、关闭准入并停止物理累加，渲染继续；restart 重置位置、线/角速度、支撑、输入和累加器。真实 Playwright 键盘经 PAL→引擎 input 验证，受控阶段直写同一玩法状态单列，不当作真实用户事件。

## 清理与负例

清理撤销唯一 rAF、对称移除 KEY_DOWN/KEY_UP、blur/visibilitychange 监听，清空输入并关闭 app。已加载资产各持一份引用，通过 session 清理回调归还；新建帧、纹理和地图资产由配方销毁。关闭后不调用 `clock.end()` 恢复主循环。清理幂等，退役实例不能 resume，复用需要重新加载页面。

当前三浏览器独立检查：墙接触不允许地面跳跃；出界/空/未知瓦片查询；暂停期间真实按键不准入且物理计数不变；清理后再按键，输入/渲染/物理计数均不增加；释放回执无失败/待处理项，八个配方资产失效，三份加载引用归零。真实隐藏标签页、实体设备和原作端口对比仍需独立证据。
