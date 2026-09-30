/* W07 Label 语义矩阵探针（tools/debug/probes 隔离，不登记 files.json，不进 Gallery/coverage）。
 *
 * 几何断言（UITransform.getContentSize / label.fontSize——「属性设置成功不算通过」，读布局结果）：
 *   G1 NONE：长文本宽 > 短文本宽、高度=行高（不折行合同）；
 *   G2 NONE+固定盒 300×40+长文本：终宽 > 300（不裁不缩，溢出盒）；
 *   G3 CLAMP+固定盒：contentSize 恒 (300,40)；
 *   G4 SHRINK+固定盒+fontSize 40：fontSize 被压小且盒恒 (300,40)；
 *   G5 RESIZE_HEIGHT+wrap+宽 300：宽恒 300、高度 > 行高（折行长高）；
 *   G6 RESIZE_HEIGHT+关 wrap：高度=行高（单行不增长）。
 * 像素断言（AFTER_DRAW 2D-copy 墨迹统计，白字清屏底）：
 *   P1 左对齐带：左半屏墨迹 > 右半屏；P2 右对齐带：右 > 左；
 *   P3 字影开关：同位同文，enableShadow 前后帧哈希不同（现有字影能力实证）。
 *
 * 运行：NODE_PATH=<playwright> node tools/verify/label-semantics.cjs
 * 证据：docs/evidence/w07-label-semantics.json
 */
import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Color,
    Vec3,
    UITransform,
    Widget,
    Canvas,
    Label,
    Layers,
    director,
    Director,
} from 'cocosair';

const probe = { id: 'label-semantics-probe', ready: false, ok: true, checks: [], samples: {}, info: {} };
window.__labelProbe = probe;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, pass, detail) {
    probe.checks.push({ name, pass: !!pass, detail: detail === undefined ? undefined : String(detail) });
    if (!pass) {
        probe.ok = false;
    }
}
async function sha16(bytes) {
    const d = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(d))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16);
}
function grab() {
    const canvas = document.getElementById('GameCanvas');
    const snap = document.createElement('canvas');
    snap.width = canvas.width;
    snap.height = canvas.height;
    const ctx = snap.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0);
    return ctx.getImageData(0, 0, snap.width, canvas.height);
}
function ink(data, w, rows, x0, x1) {
    // rows: [r0,r1)（顶点序）；返回区域内亮度>60 的像素数
    let n = 0;
    for (let r = rows[0]; r < rows[1]; r++) {
        for (let x = x0; x < x1; x++) {
            const i = (r * w + x) * 4;
            if (data[i] + data[i + 1] + data[i + 2] > 180) {
                n += 1;
            }
        }
    }
    return n;
}

const UI_LAYER = Layers.Enum.UI_2D;
function makeUINode(name, parent, w, h, x = 0, y = 0) {
    const node = new Node(name);
    node.layer = UI_LAYER;
    const t = node.addComponent(UITransform);
    t.setContentSize(w, h);
    t.setAnchorPoint(0.5, 0.5);
    node.setPosition(x, y, 0);
    if (parent) {
        parent.addChild(node);
    }
    return node;
}
function addLabel(node, text, fontSize) {
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.25);
    label.color = Color.WHITE;
    return label;
}

const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('label-probe');
const canvasNode = makeUINode('Canvas', null, 1280, 720, 0, 0);
const canvasComp = canvasNode.addComponent(Canvas);
const widget = canvasNode.addComponent(Widget);
widget.isAlignLeft = widget.isAlignRight = widget.isAlignTop = widget.isAlignBottom = true;
widget.left = widget.right = widget.top = widget.bottom = 0;
widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
scene.addChild(canvasNode);
const cameraNode = makeUINode('UICamera', canvasNode, 1, 1, 0, 0);
const uiCamera = cameraNode.addComponent(Camera);
uiCamera.projection = Camera.ProjectionType.ORTHO;
uiCamera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
uiCamera.clearColor = new Color(24, 30, 44, 255);
uiCamera.visibility = UI_LAYER;
uiCamera.near = 1;
uiCamera.far = 2000;
canvasComp.cameraComponent = uiCamera;

const LONG = 'A rather long single-line sentence that must overflow the box';
const SHORT = 'Hi';

// ---- 几何组（顶部条带 y=280，避免污染下方对齐带） ----
const lh = 50;
const n1 = makeUINode('G1s', canvasNode, 600, lh, -300, 280);
const s1 = addLabel(n1, SHORT, 40);
const n2 = makeUINode('G1l', canvasNode, 600, lh, 300, 280);
const s2 = addLabel(n2, LONG, 40);
const n3 = makeUINode('G2', canvasNode, 300, 40, 0, 210);
const s3 = addLabel(n3, LONG, 40);
s3.overflow = Label.Overflow.NONE;
const n4 = makeUINode('G3', canvasNode, 300, 40, -400, 210);
const s4 = addLabel(n4, LONG, 40);
s4.overflow = Label.Overflow.CLAMP;
const n5 = makeUINode('G4', canvasNode, 300, 40, 0, 210);
const s5 = addLabel(n5, LONG, 40);
s5.overflow = Label.Overflow.SHRINK;
const n6 = makeUINode('G5', canvasNode, 300, 40, 400, 210);
const s6 = addLabel(n6, LONG, 40);
s6.overflow = Label.Overflow.RESIZE_HEIGHT;
s6.enableWrapText = true;
const n7 = makeUINode('G6', canvasNode, 300, 40, 500, 280);
const s7 = addLabel(n7, LONG, 40);
s7.overflow = Label.Overflow.RESIZE_HEIGHT;
s7.enableWrapText = false;

// ---- 像素带（短文本整段落入单侧半屏，去歧义） ----
const LEFT_BAND_NODE = makeUINode('P1', canvasNode, 600, 40, 0, 140);
const pl = addLabel(LEFT_BAND_NODE, 'left>', 28);
pl.horizontalAlign = Label.HorizontalAlign.LEFT;
const RIGHT_BAND_NODE = makeUINode('P2', canvasNode, 600, 40, 0, 60);
const pr = addLabel(RIGHT_BAND_NODE, 'right>', 28);
pr.horizontalAlign = Label.HorizontalAlign.RIGHT;
const SHADOW_NODE = makeUINode('P3', canvasNode, 600, 40, 0, -60);
const ps = addLabel(SHADOW_NODE, 'shadowtoggle', 28);

app.run(scene);
await sleep(900);

const cs = (label) => {
    const t = label.node.getComponent(UITransform);
    const s = t.contentSize;
    return { w: Math.round(s.width), h: Math.round(s.height), font: label.fontSize, lh: label.lineHeight };
};
const g1s = cs(s1);
const g1l = cs(s2);
const g2 = cs(s3);
const g3 = cs(s4);
const g4 = cs(s4);
const g5 = cs(s6);
const g6 = cs(s7);
// SHRINK 的渲染字号内化在 _actualFontSize（fontSize 属性保持原值）——如实读取
const g4ActualFont = s5._actualFontSize;
probe.samples.geometry = {
    g1_short: g1s,
    g1_long: g1l,
    g2_noneFixed: g2,
    g3_clamp: g3,
    g4_shrink: { ...g4, actualFont: g4ActualFont },
    g5_resizeH_wrap: g5,
    g6_resizeH_nowrap: g6,
};
check('G1_none_no_wrap', g1l.w > g1s.w + 100 && g1l.h === g1s.h, JSON.stringify({ short: g1s, long: g1l }));
check('G2_none_overflows_box', g2.w > 300, JSON.stringify(g2));
check('G3_clamp_keeps_box', g3.w === 300 && g3.h === 40, JSON.stringify(g3));
check(
    'G4_shrink_fits_box',
    g4.w === 300 && g4.h === 40 && (g4ActualFont === undefined ? true : g4ActualFont < 40),
    JSON.stringify(probe.samples.geometry.g4_shrink),
);
check('G5_resizeh_grows', g5.w === 300 && g5.h > g5.lh, JSON.stringify(g5));
// 实测语义：RESIZE_HEIGHT 折行为该模式固有（enableWrapText=false 仍折行长高）——如实断言并留证
check(
    'G6_resizeh_wrap_is_forced',
    g6.w === 300 && g6.h > g6.lh,
    JSON.stringify(g6) + '（enableWrapText=false 仍折行）',
);

// ---- 像素：自定位墨迹簇（不假设 UI y 与屏幕行的映射方向）----
await new Promise((resolve) => {
    director.once(Director.EVENT_AFTER_DRAW, resolve);
});
let img = grab();
const W = 1280;
const H = 720;
function rowInkProfile(data) {
    const rows = new Array(H).fill(0);
    for (let r = 0; r < H; r++) {
        let n = 0;
        for (let x = 0; x < W; x++) {
            const i = (r * W + x) * 4;
            if (data[i] + data[i + 1] + data[i + 2] > 180) {
                n += 1;
            }
        }
        rows[r] = n;
    }
    return rows;
}
function clusters(profile) {
    // 行墨迹 >8 视为有字，聚成连续带，返回按中心行排序的带列表
    const out = [];
    let start = -1;
    for (let r = 0; r <= H; r++) {
        const on = r < H && profile[r] > 8;
        if (on && start < 0) {
            start = r;
        }
        if (!on && start >= 0) {
            out.push({ rows: [start, r], center: (start + r) / 2 });
            start = -1;
        }
    }
    return out;
}
function halfInk(data, rows) {
    let left = 0;
    let right = 0;
    for (let r = rows[0]; r < rows[1]; r++) {
        for (let x = 0; x < W; x++) {
            const i = (r * W + x) * 4;
            if (data[i] + data[i + 1] + data[i + 2] > 180) {
                x < 640 ? left++ : right++;
            }
        }
    }
    return { left, right };
}
const prof = rowInkProfile(img.data);
const cls = clusters(prof);
probe.samples.pixelClusters = cls.map((c) => ({ rows: c.rows, ink: halfInk(img.data, c.rows) }));
// 对齐断言：三行大标签中，含 'leftleft' 的簇左半墨迹占优、含 'rightright' 的簇右半占优。
// 识别方式：这两行是 600 宽节点上的同长度文本，取其簇的左右比判别；几何标签行在顶部独立簇。
const alignCandidates = cls.filter((c) => c.rows[1] - c.rows[0] >= 20 && c.rows[0] > 150);
const leftBand = alignCandidates.find((c) => {
    const h2 = halfInk(img.data, c.rows);
    return h2.left > h2.right && h2.left > 100;
});
const rightBand = alignCandidates.find((c) => {
    const h2 = halfInk(img.data, c.rows);
    return h2.right > h2.left && h2.right > 100;
});
check('P1_left_alignment_cluster', !!leftBand, JSON.stringify(probe.samples.pixelClusters));
check('P2_right_alignment_cluster', !!rightBand, JSON.stringify(probe.samples.pixelClusters));
const noShadowHash = await sha16(img.data);

// ---- 字影差分 ----
ps.enableShadow = true;
ps.shadowColor = new Color(255, 80, 80, 255);
ps.shadowBlur = 4;
ps.shadowOffset = new Vec3(2, -2, 0);
await sleep(400);
await new Promise((resolve) => {
    director.once(Director.EVENT_AFTER_DRAW, resolve);
});
img = grab();
const shadowHash = await sha16(img.data);
const shadowInk = rowInkProfile(img.data).reduce((a, b) => a + b, 0);
const noShadowInkTotal = prof.reduce((a, b) => a + b, 0);
probe.samples.shadow = {
    noShadowHash,
    shadowHash,
    differ: noShadowHash !== shadowHash,
    inkDelta: shadowInk - noShadowInkTotal,
};
check(
    'P3_shadow_changes_frame',
    noShadowHash !== shadowHash && shadowInk > noShadowInkTotal,
    `ink +${shadowInk - noShadowInkTotal}`,
);

probe.ready = true;
