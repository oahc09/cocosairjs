/**
 * Cocos AIR — ui-components（LV12-09）
 *
 * Code First（无 .scene/.prefab）组合代表性 UI 组件：
 * Canvas + UI 相机、Label、Sprite（运行时生成纹理，零第三方资源）、
 * Button（真实鼠标点击改状态）、Toggle/ToggleContainer、Slider、
 * Layout（VERTICAL 自动排布 + GRID 自动排布）、ScrollView（程序化滚动）、
 * EditBox（DOM input，headless 行为按引擎如实记录）。
 *
 * 交互断言：三浏览器矩阵（tools/v12/browser-matrix-contract.json）按 480x360 视口
 * 向 Button 发一次真实鼠标点击；页面在布局完成后把该按钮的实测页面坐标写进
 * clickTargets 供核对，window.__observed 记录真实输入前后的观察值。
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
    Button,
    Toggle,
    ToggleContainer,
    Slider,
    ProgressBar,
    Layout,
    ScrollView,
    Mask,
    MaskType,
    EditBox,
    Size,
    SpriteFrame,
    Texture2D,
    ImageAsset,
    view,
    visibleRect,
    ResolutionPolicy,
} from 'cocosair';
import { installAssetLifecycle } from '../shared/asset-lifecycle.js';

const UI_LAYER = Layers.Enum.UI_3D;

// ---------------------------------------------------------------- helpers

const observed = {
    buttonRealClicks: 0,
    buttonLabelBefore: null,
    buttonLabelAfter: null,
    buttonColorBefore: null,
    buttonColorAfter: null,
    toggleEvents: [],
    toggleExclusiveCheck: null,
    sliderBefore: null,
    sliderAfter: null,
    scrollViewOffsetBefore: null,
    scrollViewOffsetAfter: null,
    scrollViewEvents: [],
    editBoxEvents: [],
    editBoxStringBefore: null,
    editBoxStringAfter: null,
    layoutApplied: false,
    clickTargets: {},
};
window.__observed = observed;

function makeUINode(name, parent, width, height, x = 0, y = 0, anchorX = 0.5, anchorY = 0.5) {
    const node = new Node(name);
    node.layer = UI_LAYER;
    let transform = node.getComponent(UITransform);
    if (!transform) transform = node.addComponent(UITransform);
    transform.width = width;
    transform.height = height;
    transform.anchorX = anchorX;
    transform.anchorY = anchorY;
    node.setPosition(new Vec3(x, y, 0));
    if (parent) parent.addChild(node);
    return node;
}

function addUITransform(node) {
    return node.getComponent(UITransform) || node.addComponent(UITransform);
}

// 零第三方资源：运行时 canvas → ImageAsset → Texture2D → SpriteFrame。
// 注：builtinResMgr.get('default-spriteframe') 的内存图源在本 AIR 构建里 GPU 上传会抛
//     "TypeError: Failed to execute 'texSubImage2D' ... Overload resolution failed"（每帧刷屏），
//     因此改用运行时生成的 SpriteFrame（已实测可用）。
const frameCache = new Map();
const spriteSlots = [];
function makeSpriteFrame(cssColor, w = 16, h = 16, radius = 0) {
    const key = `${cssColor}|${w}|${h}|${radius}`;
    if (frameCache.has(key)) return frameCache.get(key).spriteFrame;
    const cvs = document.createElement('canvas');
    cvs.width = w;
    cvs.height = h;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = cssColor;
    if (radius > 0) {
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, radius);
        ctx.fill();
    } else {
        ctx.fillRect(0, 0, w, h);
    }
    const tex = new Texture2D();
    const image = new ImageAsset(cvs);
    tex.image = image;
    const sf = new SpriteFrame();
    sf.texture = tex;
    frameCache.set(key, { spriteFrame: sf, texture: tex, image });
    return sf;
}

function addSprite(node, cssColor, w = 16, h = 16, radius = 0) {
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM; // 必须在赋 spriteFrame 之前，否则节点被裁到纹理尺寸
    const slot = { name: node.name, sprite, args: [cssColor || '#ffffff', w, h, radius] };
    spriteSlots.push(slot);
    assignFrame(slot);
    return sprite;
}

// 一个槽位的取用与挂接：首次构建与 Lifecycle Contract 的「重新获取」共用同一条路径，
// 所以「拆得掉」与「建得回、画面复原」由同一份实现承担，而不是两条各说各话。
function assignFrame(slot) {
    slot.sprite.spriteFrame = makeSpriteFrame(...slot.args);
}

function addLabel(node, text, fontSize, color) {
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.25);
    label.color = color || Color.WHITE;
    label.overflow = Label.Overflow.NONE;
    return label;
}

function uiToWorldCenter(node) {
    const t = node.getComponent(UITransform);
    const p = t.convertToWorldSpaceAR(new Vec3(0, 0, 0), new Vec3());
    return { x: p.x, y: p.y };
}

// 页面（Playwright --click）坐标：viewport 左上角原点、y 向下；UI 世界坐标 y 向上。
function pageClickFor(node) {
    const w = uiToWorldCenter(node);
    return { x: Math.round(w.x), y: Math.round(window.innerHeight - w.y) };
}

// ---------------------------------------------------------------- app + scene

const canvasEl = document.querySelector('#GameCanvas');
const app = await createAirApp({ canvas: canvasEl });

// 设计分辨率 = 当前窗口 CSS 尺寸，EXACT_FIT → 1 UI point = 1 CSS px，点击映射为恒等。
view.setDesignResolutionSize(window.innerWidth, window.innerHeight, ResolutionPolicy.EXACT_FIT);

const scene = new Scene('v12-ui-components');

// Canvas（含 UITransform + Widget 全对齐，尺寸自动跟随视口）
const canvasNode = makeUINode('Canvas', null, 480, 360, 240, 180);
const canvas = canvasNode.addComponent(Canvas);
const canvasWidget = canvasNode.addComponent(Widget);
canvasWidget.isAlignLeft = canvasWidget.isAlignRight = true;
canvasWidget.isAlignTop = canvasWidget.isAlignBottom = true;
canvasWidget.left = canvasWidget.right = canvasWidget.top = canvasWidget.bottom = 0;
canvasWidget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
scene.addChild(canvasNode);

// UI 相机：visibility 必须含 Layers.Enum.UI_3D
const cameraNode = makeUINode('UICamera', canvasNode, 1, 1, 0, 0);
const uiCamera = cameraNode.addComponent(Camera);
uiCamera.projection = Camera.ProjectionType.ORTHO;
uiCamera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
uiCamera.clearColor = new Color(24, 30, 44, 255);
uiCamera.visibility = UI_LAYER;
uiCamera.near = 1;
uiCamera.far = 2000;
canvas.cameraComponent = uiCamera;

// ---------------------------------------------------------------- Label

const titleNode = makeUINode('Title', canvasNode, 220, 24, -130, 150);
const titleLabel = addLabel(titleNode, 'Cocos AIR UI', 20, new Color(255, 236, 160, 255));
titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;

// ---------------------------------------------------------------- 左侧 VERTICAL Layout：Button / Toggles / Slider / EditBox

const stackNode = makeUINode('Stack', canvasNode, 220, 300, -130, -20, 0.5, 0.5);
const stack = stackNode.addComponent(Layout);
stack.type = Layout.Type.VERTICAL;
stack.resizeMode = Layout.ResizeMode.NONE;
stack.spacingY = 14;
stack.verticalDirection = Layout.VerticalDirection.TOP_TO_BOTTOM;

// --- Button（Sprite 底 + Label 文本，COLOR transition）
const buttonNode = makeUINode('Button', stackNode, 150, 36);
const buttonSprite = addSprite(buttonNode, '#ffffff', 150, 36, 10);
buttonSprite.color = new Color(52, 120, 246, 255);
const buttonLabelNode = makeUINode('Label', buttonNode, 140, 28);
const buttonLabel = addLabel(buttonLabelNode, 'Press me', 16);
const button = buttonNode.addComponent(Button);
button.transition = Button.Transition.COLOR;
button.normalColor = new Color(52, 120, 246, 255);
button.pressedColor = new Color(246, 96, 60, 255);
button.hoverColor = new Color(82, 150, 255, 255);
button.targetColor = buttonSprite.color.clone();

observed.buttonLabelBefore = buttonLabel.string;
observed.buttonColorBefore = buttonSprite.color.toString();
buttonNode.on('click', () => {
    observed.buttonRealClicks += 1;
    buttonLabel.string = `Clicked x${observed.buttonRealClicks}`;
    observed.buttonLabelAfter = buttonLabel.string;
    observed.buttonColorAfter = buttonSprite.color.toString();
});

// --- ToggleContainer + 2 Toggle（背景方块 + checkMark 方块 + 文本）
const togglesNode = makeUINode('Toggles', stackNode, 200, 24);
const toggleContainer = togglesNode.addComponent(ToggleContainer);
function buildToggle(name, parent, text, checked) {
    const row = makeUINode(name, parent, 120, 22, 0, 0);
    row.layer = UI_LAYER;
    const bg = addSprite(row, '#ffffff', 120, 22, 4);
    bg.color = new Color(70, 80, 100, 255);
    const checkNode = makeUINode('Check', row, 12, 12, -48, 0);
    const check = addSprite(checkNode, '#ffffff', 12, 12, 2);
    check.color = new Color(90, 230, 140, 255);
    const labelNode = makeUINode('TLabel', row, 90, 18, 18, 0);
    addLabel(labelNode, text, 14);
    const toggle = row.addComponent(Toggle);
    toggle.checkMark = check;
    toggle.isChecked = checked;
    row.on('toggle', (t) => observed.toggleEvents.push({ name, isChecked: t.isChecked }));
    return toggle;
}
const toggleA = buildToggle('ToggleA', togglesNode, 'option A', true);
const toggleB = buildToggle('ToggleB', togglesNode, 'option B', false);
togglesNode.addComponent(Layout);
togglesNode.getComponent(Layout).type = Layout.Type.HORIZONTAL;
togglesNode.getComponent(Layout).resizeMode = Layout.ResizeMode.NONE;
togglesNode.getComponent(Layout).spacingX = 8;

// --- Slider（bar 用 ProgressBar + handle 方块）
const sliderNode = makeUINode('Slider', stackNode, 170, 20);
const sliderBarNode = makeUINode('Bar', sliderNode, 170, 8, 0, 0);
const sliderBarSprite = addSprite(sliderBarNode, '#ffffff', 170, 8, 4);
sliderBarSprite.color = new Color(90, 100, 120, 255);
const sliderBar = sliderBarNode.addComponent(ProgressBar);
sliderBar.sprite = sliderBarSprite;
const sliderHandleNode = makeUINode('Handle', sliderNode, 18, 18, -60, 0);
const sliderHandleSprite = addSprite(sliderHandleNode, '#ffffff', 18, 18, 9);
sliderHandleSprite.color = new Color(255, 210, 90, 255);
const slider = sliderNode.addComponent(Slider);
slider.handle = sliderHandleSprite;
slider.progress = 0.2;

// 本引擎版本的 Slider 无公开 bar 属性（仅 handle），用组件把 slider.progress 同步给 ProgressBar（同时演示 ProgressBar）。
class SliderBarSync extends Component {
    update() {
        if (this.pb && this.sl) this.pb.progress = this.sl.progress;
    }
}
const syncComp = sliderNode.addComponent(SliderBarSync);
syncComp.sl = slider;
syncComp.pb = sliderBar;

// --- EditBox（背景 Sprite + textLabel + placeholderLabel）
const editBoxNode = makeUINode('EditBox', stackNode, 170, 30);
const ebBgSprite = addSprite(editBoxNode, '#ffffff', 170, 30, 6);
ebBgSprite.color = new Color(38, 46, 66, 255);
const ebText = addLabel(makeUINode('EBText', editBoxNode, 160, 20), '', 14);
const ebPlaceholder = addLabel(
    makeUINode('EBPlaceholder', editBoxNode, 160, 20),
    'type here',
    14,
    new Color(150, 160, 180, 255),
);
const editBox = editBoxNode.addComponent(EditBox);
editBox.textLabel = ebText;
editBox.placeholderLabel = ebPlaceholder;
editBox.placeholder = 'type here';
editBoxNode.on('editing-did-began', () => observed.editBoxEvents.push('began'));
editBoxNode.on('editing-did-ended', () => observed.editBoxEvents.push('ended'));
editBoxNode.on('editing-return', () => observed.editBoxEvents.push('return'));

// 持续脉动小圆点：证明 UI 每帧真实重绘（probe frameChanged 断言用）。
class Pulse extends Component {
    update(dt) {
        this._t = (this._t || 0) + dt;
        const s = 1 + 0.35 * Math.sin(this._t * 4);
        this.node.setScale(s, s, 1);
    }
}
const pulseNode = makeUINode('Pulse', canvasNode, 14, 14, -22, 150);
addSprite(pulseNode, '#ffffff', 14, 14, 7).color = new Color(240, 100, 100, 255);
pulseNode.addComponent(Pulse);

// ---------------------------------------------------------------- 右上 GRID Layout：2x2 色块

const gridNode = makeUINode('Grid', canvasNode, 110, 110, 155, 95);
const grid = gridNode.addComponent(Layout);
grid.type = Layout.Type.GRID;
grid.resizeMode = Layout.ResizeMode.NONE;
grid.startAxis = Layout.AxisDirection.HORIZONTAL;
grid.constraint = Layout.Constraint.FIXED_COL;
grid.constraintNum = 2;
grid.cellSize = new Size(46, 46);
grid.spacingX = 8;
grid.spacingY = 8;
const gridPalette = ['#e06060', '#60b0e0', '#80e080', '#e0c060'];
for (let i = 0; i < 4; i++) {
    const cell = makeUINode(`Cell${i}`, gridNode, 40, 40);
    addSprite(cell, gridPalette[i], 40, 40, 6);
}

// ---------------------------------------------------------------- 右下 ScrollView（Mask 裁切 + 程序化滚动）

const scrollViewNode = makeUINode('ScrollView', canvasNode, 130, 150, 155, -85);
const scrollViewMask = scrollViewNode.addComponent(Mask);
scrollViewMask.type = MaskType.GRAPHICS_RECT;
const svContentNode = makeUINode('Content', scrollViewNode, 130, 420, 0, 75, 0.5, 1);
const scrollView = scrollViewNode.addComponent(ScrollView);
scrollView.content = svContentNode;
scrollView.inertia = false;
scrollView.elastic = false;
for (let i = 0; i < 6; i++) {
    const item = makeUINode(`Item${i}`, svContentNode, 110, 44, 0, -(22 + i * 70));
    const itemSprite = addSprite(item, '#ffffff', 110, 44, 6);
    itemSprite.color = new Color(60, 68, 92, 255);
    addLabel(makeUINode('ILabel', item, 100, 20), `row ${i + 1}`, 14);
}
scrollViewNode.on('scroll-to-bottom', () => observed.scrollViewEvents.push('scroll-to-bottom'));
scrollViewNode.on('scroll-ended', () => observed.scrollViewEvents.push('scroll-ended'));

// ---------------------------------------------------------------- run + 后处理（布局完成后取实测坐标 / 程序化改状态）

window.__airApp = app;
app.run(scene);

// §25 资源 Lifecycle Contract：持有物即本示例运行期真实创建的 SpriteFrame/Texture2D/ImageAsset。
// 释放必须先把组件引用断开，再销毁本体，否则 Sprite 会指向已销毁资源。
function ownedAssets() {
    return [...frameCache.entries()].flatMap(([name, entry]) => [
        { name: `SpriteFrame:${name}`, ref: entry.spriteFrame },
        { name: `Texture2D:${name}`, ref: entry.texture },
        { name: `ImageAsset:${name}`, ref: entry.image },
    ]);
}

installAssetLifecycle({
    label: 'ui-components',
    hold: ownedAssets,
    release: () => {
        for (const slot of spriteSlots) {
            slot.sprite.spriteFrame = null;
        }
        for (const asset of ownedAssets()) {
            asset.ref.destroy();
        }
        frameCache.clear();
    },
    reacquire: () => {
        for (const slot of spriteSlots) {
            assignFrame(slot);
        }
        return ownedAssets();
    },
});

async function nextFrames(n) {
    for (let i = 0; i < n; i++) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
}

await nextFrames(10);

observed.layoutApplied =
    gridNode.children.length === 4 && gridNode.children.every((c) => c.position.x !== 0 || c.position.y !== 0);

// Slider：程序化改变 progress（value changes）
observed.sliderBefore = slider.progress;
slider.progress = 0.75;
await nextFrames(3);
observed.sliderAfter = slider.progress;

// ScrollView：程序化滚到底（content offset changes）
const offBefore = scrollView.getScrollOffset(new Vec3());
observed.scrollViewOffsetBefore = { x: Number(offBefore.x.toFixed(2)), y: Number(offBefore.y.toFixed(2)) };
scrollView.scrollToBottom(0);
await nextFrames(10);
const offAfter = scrollView.getScrollOffset(new Vec3());
observed.scrollViewOffsetAfter = { x: Number(offAfter.x.toFixed(2)), y: Number(offAfter.y.toFixed(2)) };
observed.scrollViewOffsetAfterLive = null;

// Toggle：容器互斥验证（程序化改变 B → A 应被取消；Toggle 无公开 toggle() 方法，用 isChecked setter）
toggleB.isChecked = true;
await nextFrames(2);
observed.toggleExclusiveCheck = {
    a: toggleA.isChecked,
    b: toggleB.isChecked,
    allowSwitchOff: toggleContainer.allowSwitchOff,
};

// EditBox：DOM input 可用性 + 程序化 focus（headless 引擎差异如实记录在 probe）
observed.editBoxStringBefore = editBox.string;
let editBoxDom = { found: false, tag: null, value: null, parent: null };
try {
    editBox.focus();
    await nextFrames(3);
    const inputs = document.querySelectorAll('input, textarea');
    const input = inputs.length ? inputs[inputs.length - 1] : null;
    if (input) {
        editBoxDom = {
            found: true,
            tag: input.tagName,
            value: input.value === '' ? '(empty)' : input.value,
            parent: input.parentElement
                ? input.parentElement.id || input.parentElement.className || input.parentElement.tagName
                : null,
        };
        input.value = 'air';
        input.dispatchEvent(new Event('input'));
        await nextFrames(3);
    }
    observed.editBoxStringAfter = editBox.string;
} catch (e) {
    editBoxDom = { found: false, tag: 'error', value: String(e).slice(0, 120), parent: null };
}
observed.editBoxDom = editBoxDom;
observed.editBoxFocused = editBox.isFocused ? editBox.isFocused() : null;

// Button 真实点击坐标（实测世界坐标换算，供 probe --click 使用）
observed.clickTargets.button = pageClickFor(buttonNode);

function positionsOf(parent) {
    return parent.children.map((c) => [Math.round(c.position.x), Math.round(c.position.y)]);
}
observed.stackChildPositions = positionsOf(stackNode);
observed.gridChildPositions = positionsOf(gridNode);

window.__probe = async () => {
    const canvasTransform = canvasNode.getComponent(UITransform);
    const vis = uiCamera.visibility;
    return {
        canvas: { width: Math.round(canvasTransform.width), height: Math.round(canvasTransform.height) },
        viewVisible: { width: Math.round(visibleRect.width), height: Math.round(visibleRect.height) },
        uiCameraFound: !!canvas.cameraComponent,
        cameraVisibilityHasUI3D: (vis & UI_LAYER) !== 0,
        label: { string: titleLabel.string, fontSize: titleLabel.fontSize },
        sprite: {
            hasFrame: !!(
                buttonSprite.spriteFrame &&
                buttonSprite.spriteFrame.texture &&
                buttonSprite.spriteFrame.texture.width
            ),
            frameSource: 'runtime canvas -> ImageAsset -> Texture2D -> SpriteFrame',
        },
        button: {
            interactable: button.interactable,
            transition: button.transition,
            realClicks: observed.buttonRealClicks,
            labelBefore: observed.buttonLabelBefore,
            labelAfterLive: buttonLabel.string,
        },
        toggle: {
            a: toggleA.isChecked,
            b: toggleB.isChecked,
            events: observed.toggleEvents,
            exclusive: observed.toggleExclusiveCheck,
        },
        slider: { before: observed.sliderBefore, after: slider.progress, handleMoved: sliderHandleNode.position.x },
        layout: {
            applied: observed.layoutApplied,
            stackChildren: stackNode.children.length,
            stackChildPositions: observed.stackChildPositions,
            gridChildren: gridNode.children.length,
            gridChildPositions: observed.gridChildPositions,
        },
        scrollView: {
            offsetBefore: observed.scrollViewOffsetBefore,
            offsetAfter: observed.scrollViewOffsetAfter,
            offsetLive: ((v) => ({ x: Number(v.x.toFixed(2)), y: Number(v.y.toFixed(2)) }))(
                scrollView.getScrollOffset(new Vec3()),
            ),
            events: observed.scrollViewEvents,
            contentHeight: svContentNode.getComponent(UITransform).height,
        },
        editBox: {
            enabled: editBox.enabled,
            placeholder: editBox.placeholder,
            string: editBox.string,
            dom: observed.editBoxDom,
            focused: observed.editBoxFocused,
            events: observed.editBoxEvents,
        },
        clickTargets: observed.clickTargets,
    };
};
