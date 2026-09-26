# How to Draw Transparent Objects（绘制透明对象）

> 本篇讲半透明对象的混合、排序与"挖洞"技巧。配套可运行示例：[`examples/manual-transparent/`](examples/manual-transparent/)
> （三个 alpha 递减的"玻璃球"摆动遮挡后排三颗不透明色块——零外部资产）。

在 Cocos AIR 里，透明不是一个布尔开关，而是一条**管线状态**（`blendState`），必须在材质初始化时显式声明。要点：

| AIR                                                                | 实测                                  |
| ------------------------------------------------------------------ | ------------------------------------- |
| `material.initialize({ states: { blendState: ... } })`（开启混合） | ✓（本示例核心，见 §2）                |
| `mainColor` 的 `a` 分量控透明度（0–255 字节域，0.5≈128）           | ✓ 但**单独设 a 不混合**，见 §3 踩坑 1 |
| `states.depthStencilState`（同一 `IPassStates` 槽位控深度写入）    | 契约在（d.ts 23589），本篇未取证      |
| `model.priority`（透明队列排序优先级，d.ts 5407–5411）             | 契约在，页面内未取证                  |
| "挖洞"双 pass：两私有材质 + 两 renderer 叠加，`states` 各自给      | 路线可行，本篇未取证                  |

## 1. 透明相关 API 面（实测锚点）

| 入口                                                                                 | 锚点                     | 语义（实测）                                                                                         |
| ------------------------------------------------------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `Material.initialize` 的 `states?: renderer.PassOverrides \| PassOverrides[]`        | d.ts 23773               | 覆盖 effect 声明的管线状态；`PassOverrides = RecursivePartial<EffectAsset.IPassStates>`（d.ts 7321） |
| `IPassStates`：`priority / rasterizerState / depthStencilState / blendState / phase` | d.ts 23585–23596         | 可覆盖的 pass 状态全集                                                                               |
| `gfx.BlendState` 构造器 `(blend?, blendSrc?, blendDst?, blendEq?, ...)`              | d.ts 3973 / 4005         | 每 target 一组混合参数                                                                               |
| `gfx.BlendFactor`：`ZERO=0, ONE=1, SRC_ALPHA=2, ONE_MINUS_SRC_ALPHA=4`               | d.ts 2664–2680           | 标准 alpha 混合即 `src=2, dst=4`                                                                     |
| `material.passes[0].blendState.targets[0]`                                           | d.ts 23830 / 7552 / 3998 | 读回当前 pass 混合状态（覆盖层的证据来源）                                                           |
| `material.overridePipelineStates(overrides, passIdx?)`                               | d.ts 23885               | 运行时改管线状态——**实测对本构建的 builtin-standard 不生效**，见 §3 踩坑 3                           |
| `model.priority`（Model 在透明队列中的排序优先级）                                   | d.ts 5407–5411           | 透明队列按此值排序；取 model 的公开路径未取证                                                        |

## 2. 示例拆解

三个"玻璃球"各持**私有** `Material`（改共享材质会串色，手册多篇同一告诫），
alpha 64/128/192 递减，混合状态在 `initialize` 里一次给齐：

```js
[64, 128, 192].forEach((alpha, i) => {
    const n = new Node(`Glass-${i}`);
    n.layer = Layers.Enum.DEFAULT;
    n.setPosition(new Vec3((i - 1) * 1.1, 0, 0));
    rig.addChild(n);
    const r = n.addComponent(MeshRenderer);
    r.mesh = sphereMesh;
    const m = new Material();
    m.initialize({
        effectName: 'builtin-standard',
        states: {
            blendState: {
                targets: [{ blend: true, blendSrc: 2, blendDst: 4 }],
            },
        },
    });
    m.setProperty('mainColor', new Color(245, 245, 250, alpha));
    r.material = m;
    glassMats.push(m);
});
```

覆盖层把 `pass[0]` 的混合状态读回成文字，承诺肉眼可读、探针可取：

```ts
    try {
        const t = m.passes[0].blendState.targets[0];
        return `blend=${t.blend} src=${t.blendSrc} dst=${t.blendDst}`;
    } catch (e) {
        return `readout failed: ${e.name}`;
    }
}
```

rig 用 `sin` 往复摆动（±35°）而不是匀速旋转：摆动既保证 frame-diff，
又让球与球、球与立方体的重叠次序反复变化——透明排序问题会自然暴露。

## 3. 实测读数与三条踩坑

验证器 4/4：`app-contract / visible-frame / no-runtime-error / frame-diff` 全 PASS（3.8s，
子集运行 partial；本例在 `ANIMATED` 集合）。截图 `docs/evidence/examples/manual-transparent.png`：
三球透明度梯度肉眼可读，后排红/绿/蓝立方体**透过球体可见**。探针 dump（运行时刻）：

```
transparency: mainColor.a = 64/128/192 + initialize({states.blendState}) (per-sphere private Material)
pass[0].blendState.targets[0]: blend=true src=2 dst=4 (2=SRC_ALPHA, 4=ONE_MINUS_SRC_ALPHA)
rig yaw: 26.0° (swings to reveal overlap order)
```

开发期实测（浏览器内逐条验证，证据截图 `.tmp-tr-{A,B,C}.png` 为过程件已清理）：

1. **`mainColor.a < 255` 不会自动开启混合**。默认 `builtin-standard` 的三条 pass 读回为：

   | pass | phase | blend | src / dst  | 判读                          |
   | ---- | ----- | ----- | ---------- | ----------------------------- |
   | 0    | 16    | false | ONE / ZERO | 主 pass：直接替换，**不透明** |
   | 1    | 2     | true  | ONE / ONE  | 附加光 forward-add 累加 pass  |
   | 2    | 8     | false | ONE / ZERO | 收尾 pass                     |

   只设 alpha 时球体画得严严实实（首版示例截图实锤：立方体只在球边缘露出，并非透视）。
   与 cocos 编辑器文档印象不同的地方在此。

2. **直接改 `pass.blendState.targets[0]` 的字段：读回变了、画面不变**
   （`t.blend = true; t.blendSrc = 2; t.blendDst = 4` 后读回 `blend=true src=2 dst=4`，截图仍不透明）——
   管线状态被设备层缓存，事后改对象不触发重建。别用。
3. **`material.overridePipelineStates({...}, 0)`：不抛错、读回仍 `blend=false`、画面不变**——
   d.ts 契约在（23885），但本构建对已 `initialize` 的 `builtin-standard` 实测未见效果。别依赖。

**生效的唯一路线是 `initialize` 时给 `states`**（上表 pass 0 随即变 `blend=true src=2 dst=4`，画面即透明）。
推论：混合状态要**在材质创建时定死**，运行时切换透明/不透明请备两个材质实例换 `renderer.material`。

## 4. 机制要点备忘

- **状态而非开关**：AIR 的透明没有"一个开关同时管混合与排序"这回事——混合要手写 `blendState` 的 `src/dst` 因子（在 `initialize` 的 `states` 里给），队列与排序则由引擎按 pass 的 `phase/priority` 决定——
  本示例球-球、球-立方体重叠在摆动下未见错序，但**排序细节本篇未做受控取证**，密集透明场景请自行验证。
- **alpha 值域**：AIR `Color` 的 a 分量是 0–255 字节域（`128 ≈ 0.5`）。
- **渲染统计**：AIR 无内建的 `info`/统计读数可查，混合是否生效只能靠读回 + 截图两条证据链（本篇即如此做）。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-transparent        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-transparent/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-transparent
```

示例目录：`docs/manual/examples/manual-transparent/`。
验证器 4/4 全 PASS（3.8s，子集运行 partial）；截图 `docs/evidence/examples/manual-transparent.png`；
覆盖层与 pass 读回探针 dump 见 §3。`manual-doc-consistency` 结果见台账行。

## 附：示例源码（逐字）

`examples/manual-transparent/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>How to Draw Transparent Objects — 绘制透明对象（docs/manual/transparency.md）</title>
        <style>
            html,
            body {
                margin: 0;
                padding: 0;
                width: 100%;
                height: 100%;
                overflow: hidden;
                background: #fff;
            }
            #GameDiv {
                width: 100%;
                height: 100%;
            }
            #Cocos3dGameContainer {
                width: 100%;
                height: 100%;
            }
            #GameCanvas {
                width: 100%;
                display: block;
                height: 100%;
            }
            #info {
                position: absolute;
                left: 8px;
                top: 8px;
                z-index: 10;
                font:
                    12px/1.6 ui-monospace,
                    Consolas,
                    monospace;
                color: #e8eef7;
                background: rgba(10, 16, 26, 0.78);
                padding: 6px 10px;
                border-radius: 4px;
                white-space: pre;
            }
        </style>
        <script type="importmap">
            { "imports": { "cocosair": "/build/cocosair.module.js" } }
        </script>
    </head>
    <body>
        <!-- 官方模板 DOM 结构：pal/screen-adapter 依赖这些 id 做全屏适配 -->
        <div id="GameDiv">
            <div id="Cocos3dGameContainer">
                <!-- #GameCanvas 必须在引擎 import 前存在（pal/screen-adapter 为模块顶层单例） -->
                <canvas id="GameCanvas"></canvas>
            </div>
        </div>
        <div id="info">loading…</div>
        <script type="module" src="./main.ts"></script>
    </body>
</html>
```

`examples/manual-transparent/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — How to Draw Transparent Objects（绘制透明对象）
 * 配套文章：docs/manual/transparency.md
 *
 * 三个 alpha 递减（64/128/192）的半透明球挂在 rig 上往复摆动，遮挡后排三颗不透明色块——
 * 混合效果肉眼可读、摆动保证 frame-diff。关键踩坑：builtin-standard 里 mainColor.a<255
 * 并不会自动开启混合（pass[0] 读回 blend=false，实测球体仍不透明），
 * 须在 material.initialize 的 states 里显式给 blendState（SRC_ALPHA/ONE_MINUS_SRC_ALPHA）。
 * 每个半透明球私有一个 Material 实例（改共享材质会串色，见手册多篇的同一告诫）。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    Component,
    Layers,
    Vec3,
    Color,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('transparent');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.8, 8.5));
cameraNode.lookAt(new Vec3(0, 1.2, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 22, 30, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一盏方向光 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-40, -25, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2;

// ---- 后排：三颗不透明色块（被遮挡物） ----
const opaqueColors = [new Color(220, 60, 60, 255), new Color(60, 200, 90, 255), new Color(70, 120, 235, 255)];
const sharedBox = utils.createMesh(primitives.box({ width: 1.1, height: 1.1, length: 1.1 }));
opaqueColors.forEach((col, i) => {
    const n = new Node(`Opaque-${i}`);
    n.layer = Layers.Enum.DEFAULT;
    n.setPosition(new Vec3((i - 1) * 1.6, 1.2, -0.6));
    scene.addChild(n);
    const r = n.addComponent(MeshRenderer);
    r.mesh = sharedBox;
    const m = new Material();
    m.initialize({ effectName: 'builtin-standard' });
    m.setProperty('mainColor', col);
    r.material = m;
});

// ---- 前排：三个半透明球（alpha 64/128/192），挂 rig 下整体旋转 ----
const rig = new Node('Rig');
rig.setPosition(new Vec3(0, 1.2, 0.9));
scene.addChild(rig);

const sphereMesh = utils.createMesh(primitives.sphere(0.75, 24, 16));
const glassMats: Material[] = [];
[64, 128, 192].forEach((alpha, i) => {
    const n = new Node(`Glass-${i}`);
    n.layer = Layers.Enum.DEFAULT;
    n.setPosition(new Vec3((i - 1) * 1.1, 0, 0));
    rig.addChild(n);
    const r = n.addComponent(MeshRenderer);
    r.mesh = sphereMesh;
    const m = new Material();
    m.initialize({
        effectName: 'builtin-standard',
        states: {
            blendState: {
                targets: [{ blend: true, blendSrc: 2, blendDst: 4 }],
            },
        },
    });
    m.setProperty('mainColor', new Color(245, 245, 250, alpha));
    r.material = m;
    glassMats.push(m);
});

// ---- 覆盖层：读回 pass 混合状态 ----
const info = document.querySelector('#info') as HTMLElement;
function blendReadout(m: Material): string {
    try {
        const t = m.passes[0].blendState.targets[0];
        return `blend=${t.blend} src=${t.blendSrc} dst=${t.blendDst}`;
    } catch (e) {
        return `readout failed: ${e.name}`;
    }
}
class Spinner extends Component {
    private _a = 0;
    private _readout = '';
    constructor() {
        super();
        this._a = 0;
        this._readout = blendReadout(glassMats[1]);
    }
    update(dt: number): void {
        this._a += dt * 30;
        rig.setRotationFromEuler(0, Math.sin((this._a * Math.PI) / 180) * 35, 0);
        info.textContent = [
            'transparency: mainColor.a = 64/128/192 + initialize({states.blendState}) (per-sphere private Material)',
            `pass[0].blendState.targets[0]: ${this._readout} (2=SRC_ALPHA, 4=ONE_MINUS_SRC_ALPHA)`,
            `rig yaw: ${(Math.sin((this._a * Math.PI) / 180) * 35).toFixed(1)}° (swings to reveal overlap order)`,
            'opaque row behind: red/green/blue cubes; glass spheres in front',
        ].join('\n');
    }
}
cameraNode.addComponent(Spinner);

window.__airApp = app;
window.__inspect = { glassMats, rig };
app.run(scene);

console.log('[manual/transparent] running on cocosair');
```

---

上一篇：[背景与天空盒（Add a Background or Skybox）](backgrounds.md) ｜ 下一篇：[多个场景（Multiple Scenes）](multiple-scenes.md)
