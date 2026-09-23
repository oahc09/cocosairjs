/**
 * Cocos AIR — ui-layout（LV12-09 响应式附例）
 *
 * Widget + Layout 响应式：顶栏（LEFT+TOP+RIGHT 三边对齐）、左下/右下贴角徽章
 * （bottom 对齐）、中央 HORIZONTAL Layout（RIGHT_TO_LEFT 起排 + Widget 左右各留 30 拉伸），
 * 视口变化后单元几何与单元格排布都必须重算。顶栏标题实时显示当前视口，视口变化即重采集几何写入
 * window.__geom（页面自身持续行为，不靠探针触发）。
 * 由三浏览器矩阵（tools/v12/browser-matrix-contract.json 的 resize 步骤）真实改变浏览器视口（setViewportSize
 * → window resize → 引擎 screenAdapter/widgetManager 全链路），probe 两次采集几何。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Canvas,
    UITransform,
    Widget,
    Layers,
    Color,
    Vec3,
    Component,
    Label,
    Sprite,
    SpriteFrame,
    Texture2D,
    ImageAsset,
    Layout,
    view,
    visibleRect,
    ResolutionPolicy,
} from 'cocosair';
import { installAssetLifecycle } from '../shared/asset-lifecycle.js';

const UI_LAYER = Layers.Enum.UI_3D;

// 本示例运行期真实创建的资源（SpriteFrame ← Texture2D ← ImageAsset←canvas）。
// 以 key 去重：同一配色/尺寸只建一份，也是释放与重新获取的核对单位。
const frameCache = new Map();
const spriteSlots = [];

function createFrame (key, cssColor, w, h, radius) {
    if (frameCache.has(key)) { return frameCache.get(key); }
    const cvs = document.createElement('canvas');
    cvs.width = w; cvs.height = h;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = cssColor;
    if (radius > 0) { ctx.beginPath(); ctx.roundRect(0, 0, w, h, radius); ctx.fill(); } else { ctx.fillRect(0, 0, w, h); }
    const image = new ImageAsset(cvs);
    const texture = new Texture2D();
    texture.image = image;
    const spriteFrame = new SpriteFrame();
    spriteFrame.texture = texture;
    const entry = { spriteFrame, texture, image };
    frameCache.set(key, entry);
    return entry;
}

function makeUINode (name, parent, width, height) {
    const node = new Node(name);
    node.layer = UI_LAYER;
    const t = node.getComponent(UITransform) || node.addComponent(UITransform);
    t.width = width;
    t.height = height;
    if (parent) parent.addChild(node);
    return node;
}

function addSprite (node, cssColor, w, h, r) {
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    const slot = { name: node.name, sprite, color: cssColor, w, h, r };
    spriteSlots.push(slot);
    assignFrame(slot);
    return sprite;
}

// 一个槽位的取用与挂接：首次构建与生命周期合同「重新获取」共用同一条路径，
// 因此 reloaded 与画面复原是同一件事，不是两个各自成立的说法。
function assignFrame (slot) {
    slot.sprite.spriteFrame = createFrame(slot.name, slot.color, slot.w, slot.h, slot.r).spriteFrame;
}

function addLabel (node, text, fontSize) {
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.25);
    label.color = Color.WHITE;
    return label;
}

const canvasEl = document.querySelector('#GameCanvas');
const app = await createAirApp({ canvas: canvasEl });
view.setDesignResolutionSize(window.innerWidth, window.innerHeight, ResolutionPolicy.EXACT_FIT);

// "match window" 适配策略：视口变化时重设设计分辨率（EXACT_FIT 下 visibleRect 才会跟随视口，
// 触发 view 'design-resolution-changed' → widgetManager 重排所有 Widget）。
window.addEventListener('resize', () => {
    view.setDesignResolutionSize(window.innerWidth, window.innerHeight, ResolutionPolicy.EXACT_FIT);
});

const scene = new Scene('v12-ui-layout');

const canvasNode = makeUINode('Canvas', null, 480, 360);
const canvas = canvasNode.addComponent(Canvas);
const cw = canvasNode.addComponent(Widget);
cw.isAlignLeft = cw.isAlignRight = cw.isAlignTop = cw.isAlignBottom = true;
cw.left = cw.right = cw.top = cw.bottom = 0;
cw.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
scene.addChild(canvasNode);

const cameraNode = makeUINode('UICamera', canvasNode, 1, 1);
const cam = cameraNode.addComponent(Camera);
cam.projection = Camera.ProjectionType.ORTHO;
cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
cam.clearColor = new Color(24, 30, 44, 255);
cam.visibility = UI_LAYER;
canvas.cameraComponent = cam;

// 顶栏：LEFT+TOP+RIGHT 对齐，高 40 → 宽度恒等于视口宽
const topBar = makeUINode('TopBar', canvasNode, 480, 40);
addSprite(topBar, '#ffffff', 480, 40, 0).color = new Color(52, 120, 246, 255);
const topLabel = addLabel(makeUINode('TopLabel', topBar, 200, 24), 'TOP BAR', 18);
const tw = topBar.addComponent(Widget);
tw.isAlignLeft = tw.isAlignRight = tw.isAlignTop = true;
tw.left = tw.right = 0;
tw.top = 0;
tw.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;

// 左下/右下贴角徽章：LEFT/RIGHT + BOTTOM 对齐
const badgeL = makeUINode('BadgeL', canvasNode, 60, 24);
addSprite(badgeL, '#ffffff', 60, 24, 6).color = new Color(90, 200, 120, 255);
addLabel(makeUINode('BL', badgeL, 50, 16), 'L', 12);
const bl = badgeL.addComponent(Widget);
bl.isAlignLeft = bl.isAlignBottom = true;
bl.left = bl.bottom = 10;
bl.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;

const badgeR = makeUINode('BadgeR', canvasNode, 60, 24);
addSprite(badgeR, '#ffffff', 60, 24, 6).color = new Color(220, 120, 60, 255);
addLabel(makeUINode('BR', badgeR, 50, 16), 'R', 12);
const br = badgeR.addComponent(Widget);
br.isAlignRight = br.isAlignBottom = true;
br.right = br.bottom = 10;
br.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;

// 中央：HORIZONTAL Layout（ResizeMode.NONE，容器不随子节点缩放）+ Widget 左右各留 30 拉伸
// → 视口变化时容器宽度变化，Layout 重算全部子节点位置（可测的 reflow）。
const rowNode = makeUINode('Row', canvasNode, 300, 60);
rowNode.getComponent(UITransform).anchorX = 0.5;
const rowLayout = rowNode.addComponent(Layout);
rowLayout.type = Layout.Type.HORIZONTAL;
rowLayout.resizeMode = Layout.ResizeMode.NONE;
rowLayout.spacingX = 10;
// RIGHT_TO_LEFT：子节点从容器右缘起排 → 位置随视口宽度变化，Layout 重排可被机器断言
rowLayout.horizontalDirection = Layout.HorizontalDirection.RIGHT_TO_LEFT;
for (let i = 0; i < 3; i++) {
    const cell = makeUINode(`Cell${i}`, rowNode, 90, 60);
    addSprite(cell, ['#e06060', '#60b0e0', '#e0c060'][i], 90, 60, 8);
}
const rw = rowNode.addComponent(Widget);
rw.isAlignLeft = rw.isAlignRight = true;
rw.left = rw.right = 30;
rw.isAlignVerticalCenter = true;
rw.verticalCenter = 20;
rw.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;

function geom (node) {
    const t = node.getComponent(UITransform);
    const p = t.convertToWorldSpaceAR(new Vec3(0, 0, 0), new Vec3());
    return { w: Math.round(t.width), h: Math.round(t.height), x: Math.round(p.x), y: Math.round(p.y) };
}

function collectGeom () {
    return {
        viewport: { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
        visible: { width: Math.round(visibleRect.width), height: Math.round(visibleRect.height) },
        canvas: geom(canvasNode),
        topBar: geom(topBar),
        badgeLeft: geom(badgeL),
        badgeRight: geom(badgeR),
        row: geom(rowNode),
        rowCells: rowNode.children.map((c) => geom(c)),
    };
}

// 顶栏标题实时跟随视口；几何每帧回读写入 window.__geom：自适应是页面自己的持续行为，
// 不等页面外的探针来触发。（Widget 对齐发生在组件 update 之后，所以这里天然滞后一帧，稳态即正确。）
class LayoutReadout extends Component {
    update () {
        const title = `TOP BAR ${window.innerWidth}x${window.innerHeight}`;
        if (title !== this._title) {
            this._title = title;
            this.label.string = title;
        }
        window.__geom = collectGeom();
    }
}

const readout = canvasNode.addComponent(LayoutReadout);
readout.label = topLabel;

window.__airApp = app;
app.run(scene);

// §25 资源 Lifecycle Contract：持有物即本示例运行期真实创建的 SpriteFrame/Texture2D/ImageAsset。
// 释放先断开组件引用再销毁本体；重新获取复用与首帧同一条 assignFrame 路径，
// 因此「拆得掉」与「建得回、画面复原」由同一份实现承担，不是两条各自成立的说法。
function ownedAssets () {
    return [...frameCache.entries()].flatMap(([name, entry]) => [
        { name: `SpriteFrame:${name}`, ref: entry.spriteFrame },
        { name: `Texture2D:${name}`, ref: entry.texture },
        { name: `ImageAsset:${name}`, ref: entry.image },
    ]);
}

installAssetLifecycle({
    label: 'ui-layout',
    hold: ownedAssets,
    release: () => {
        for (const slot of spriteSlots) { slot.sprite.spriteFrame = null; }
        for (const asset of ownedAssets()) { asset.ref.destroy(); }
        frameCache.clear();
    },
    reacquire: () => {
        for (const slot of spriteSlots) { assignFrame(slot); }
        return ownedAssets();
    },
});

window.__probe = async () => collectGeom();
