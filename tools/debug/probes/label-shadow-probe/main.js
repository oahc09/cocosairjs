import * as engine from 'cocosair';
const {
    createAirApp,
    Scene,
    Node,
    Camera,
    Canvas,
    Widget,
    UITransform,
    Label,
    RichText,
    Color,
    Layers,
    view,
    ResolutionPolicy,
    director,
    Director,
} = engine;

const result = { ready: false, ok: true, cases: [], errors: [] };
window.__labelShadowProbe = result;
const frames = async () => {
    for (let i = 0; i < 2; i++) await new Promise((resolve) => director.once(Director.EVENT_AFTER_DRAW, resolve));
};
function uiNode(name, parent, x = 0, y = 0) {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(150, 70);
    node.setPosition(x, y, 0);
    if (parent) parent.addChild(node);
    return node;
}
function sample() {
    const canvas = document.getElementById('GameCanvas');
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    const context = copy.getContext('2d', { willReadFrequently: true });
    context.drawImage(canvas, 0, 0);
    const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
    let left = copy.width,
        right = -1,
        top = copy.height,
        bottom = -1,
        count = 0,
        blue = 0;
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] > 235 && pixels[i + 1] > 235 && pixels[i + 2] > 235) {
            const x = (i / 4) % copy.width,
                y = Math.floor(i / 4 / copy.width);
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
            count++;
        }
        if (pixels[i] < 30 && pixels[i + 1] < 30 && pixels[i + 2] > 30) blue++;
    }
    return { left, right, top, bottom, width: right - left + 1, height: bottom - top + 1, count, blue };
}
function compare(plain, shaded) {
    return (
        plain.count > 0 &&
        shaded.count > 0 &&
        Math.abs(plain.width - shaded.width) <= 1 &&
        Math.abs(plain.height - shaded.height) <= 1 &&
        Math.abs(plain.left - shaded.left) <= 1 &&
        Math.abs(plain.top - shaded.top) <= 1 &&
        Math.abs(plain.count - shaded.count) / plain.count < 0.06
    );
}
function check(name, ok, detail) {
    result.cases.push({ name, ok, detail });
    if (!ok) result.ok = false;
}

try {
    const app = await createAirApp({ canvas: '#GameCanvas' });
    view.setDesignResolutionSize(800, 600, ResolutionPolicy.FIXED_WIDTH);
    const scene = new Scene('label-shadow');
    const canvasNode = uiNode('Canvas', scene);
    const canvasComponent = canvasNode.addComponent(Canvas);
    const widget = canvasNode.addComponent(Widget);
    widget.isAlignLeft = widget.isAlignRight = widget.isAlignTop = widget.isAlignBottom = true;
    widget.left = widget.right = widget.top = widget.bottom = 0;
    widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    const cameraNode = uiNode('UICamera', canvasNode);
    cameraNode.setPosition(0, 0, 1000);
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = Color.BLACK;
    camera.visibility = Layers.Enum.UI_2D;
    camera.near = 1;
    camera.far = 2000;
    canvasComponent.cameraComponent = camera;
    const node = uiNode('Label', canvasNode, -100, 80);
    const label = node.addComponent(Label);
    label.fontSize = 23;
    label.lineHeight = 28;
    label.color = Color.WHITE;
    label.shadowColor = new Color(0, 0, 200, 255);
    label.outlineColor = new Color(180, 0, 0, 255);
    label.outlineWidth = 2;
    app.run(scene);
    await frames();
    for (const cacheMode of [Label.CacheMode.NONE, Label.CacheMode.BITMAP]) {
        for (const overflow of [Label.Overflow.NONE, Label.Overflow.RESIZE_HEIGHT]) {
            for (const align of [0, 1, 2]) {
                for (const [offsetX, offsetY, blur, outline, italic] of [
                    [2, -3, 4, false, false],
                    [-8, 7, 4, false, false],
                    [8, -7, 4, true, true],
                    [3, -3, 0, true, false],
                ]) {
                    label.cacheMode = cacheMode;
                    label.overflow = overflow;
                    label.horizontalAlign = align;
                    label.verticalAlign = align;
                    label.enableOutline = outline;
                    label.isItalic = italic;
                    label.string = overflow === Label.Overflow.NONE ? 'SHADOW 23' : 'SHADOW 23 repeats across lines';
                    node.getComponent(UITransform).setContentSize(150, 70);
                    node.getComponent(UITransform).setAnchorPoint(align * 0.5, align * 0.5);
                    label.enableShadow = false;
                    label.updateRenderData(true);
                    await frames();
                    const plain = sample();
                    const logical = {
                        width: node.getComponent(UITransform).width,
                        height: node.getComponent(UITransform).height,
                    };
                    label.shadowBlur = blur;
                    label.shadowOffset.set(offsetX, offsetY);
                    label.enableShadow = true;
                    label.updateRenderData(true);
                    await frames();
                    const shaded = sample();
                    const trans = node.getComponent(UITransform);
                    check(
                        `pixels:${cacheMode}:${overflow}:${align}:${offsetX}:${offsetY}:${outline}:${italic}`,
                        compare(plain, shaded) &&
                            shaded.blue > 0 &&
                            logical.width === trans.width &&
                            logical.height === trans.height,
                        { plain, shaded, logical },
                    );
                    trans.setAnchorPoint(0.3, 0.8);
                    label._assembler.updateVertexData(label);
                    const vertices = label.renderData.data;
                    const scale = label.textStyle.actualFontSize / label.fontSize;
                    check(
                        'anchor-update',
                        Math.abs((vertices[1].x - vertices[0].x) * scale - label.assemblerData.canvas.width) < 1e-5 &&
                            Math.abs((vertices[2].y - vertices[0].y) * scale - label.assemblerData.canvas.height) <
                                1e-5,
                        { scale },
                    );
                }
            }
        }
    }
    node.active = false;
    result.richTextAvailable = !!RichText;
    if (RichText) {
        const richNode = uiNode('RichText', canvasNode, -100, 0);
        const rich = richNode.addComponent(RichText);
        rich.fontSize = 23;
        rich.lineHeight = 28;
        rich.maxWidth = 130;
        const markup = '<color=#FFFFFF>AB</color><b>CD</b> EF GH IJ KL';
        rich.string = markup;
        await frames();
        const segmentLayout = () =>
            richNode.children
                .filter((child) => child.getComponent(Label))
                .map((child) => ({
                    text: child.getComponent(Label).string,
                    x: child.position.x,
                    y: child.position.y,
                    width: child.getComponent(UITransform).width,
                }));
        const baseLayout = segmentLayout();
        const richPlain = sample();
        for (let i = 0; i < 3; i++) {
            for (const child of richNode.children) {
                const segment = child.getComponent(Label);
                if (!segment) continue;
                segment.shadowColor = new Color(0, 0, 200, 255);
                segment.shadowBlur = 4;
                segment.shadowOffset.set(-8, 7);
                segment.enableShadow = true;
                segment.updateRenderData(true);
            }
            rich.string = markup + ' ';
            rich.string = markup;
            await frames();
            check(
                'RichText-rebuild-layout',
                JSON.stringify(segmentLayout()) === JSON.stringify(baseLayout),
                segmentLayout(),
            );
        }
        check('RichText-glyph-pixels', compare(richPlain, sample()), { plain: richPlain, shaded: sample() });
    }
    result.dpr = window.devicePixelRatio;
    result.canvas = {
        width: document.getElementById('GameCanvas').width,
        height: document.getElementById('GameCanvas').height,
    };
    result.ready = true;
} catch (error) {
    result.ok = false;
    result.errors.push(error.stack || String(error));
    result.ready = true;
}
