import {
    createAirApp,
    createUICanvas,
    createStepClock,
    Scene,
    Node,
    Sprite,
    Mask,
    Graphics,
    UITransform,
    Color,
    Camera,
    Texture2D,
    Rect,
    Size,
    ParticleSystem2D,
    createAirDOMOverlay,
    createAirTextureSprite,
    createAirUIBlendScope,
    rasterizeAirGraphics,
    drawAirGraphics,
    airGraphicsCommandsToSvg,
    attachAirSpriteMask,
    type AirGraphicsCommand,
} from 'cocosair';
import { createAirHTMLSource, getAirHTMLSourceSupport } from '../../../build/cocosair.module.js';

const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });
const scene = new Scene('GraphicsAndDOM'),
    ui = createUICanvas(scene, 'UI', { designWidth: 256, designHeight: 256 });
const camera = ui.getComponentInChildren(Camera)!;
camera.clearColor = new Color(0, 0, 0, 255);
app.run(scene);
const clock = createStepClock();
clock.begin();
const gl = canvas.getContext('webgl2')!;
const rows: { name: string; actual: unknown }[] = [];
function check(condition: unknown, name: string, actual?: unknown): void {
    rows.push({ name, actual: actual ?? condition });
    if (!condition) throw new Error(`${name}: ${JSON.stringify(actual)}`);
}
function texture(width: number, height: number, bytes: number[]): Texture2D {
    const t = new Texture2D();
    t.reset({ width, height, mipmapLevel: 1 });
    t.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
    t.uploadData(new Uint8Array(bytes));
    return t;
}
function pixel(x: number, y = 0.5): number[] {
    const p = new Uint8Array(4);
    gl.readPixels(
        Math.floor(x * gl.drawingBufferWidth),
        Math.floor(y * gl.drawingBufferHeight),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        p,
    );
    return [...p];
}
const near = (v: number, target: number, tolerance = 6): boolean => Math.abs(v - target) <= tolerance;
function node(name: string): Node {
    const n = new Node(name);
    n.layer = ui.layer;
    n.addComponent(UITransform).setContentSize(256, 256);
    ui.addChild(n);
    return n;
}
async function run(): Promise<void> {
    const white = texture(1, 1, [255, 255, 255, 255]);
    const handle = createAirTextureSprite(ui, white, { size: [256, 256] });
    await clock.step();
    check(pixel(0.5)[0] > 245, 'native texture sprite visible');
    handle.node.setScale(0, 0, 1);
    await clock.step();
    check(pixel(0.5)[0] === 0, 'native zero scale');
    handle.node.setScale(1, 1, 1);
    const maskTexture = texture(4, 1, [255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 128, 255, 0, 0, 0]);
    for (const [channel, expected] of [
        ['alpha', [255, 255, 128, 0]],
        ['red', [255, 0, 0, 255]],
    ] as const) {
        const mask = attachAirSpriteMask(handle.sprite, maskTexture, { channel });
        await clock.step();
        const values = [0.125, 0.375, 0.625, 0.875].map((x) => pixel(x)[0]);
        check(
            values.every((v, i) => near(v, expected[i])),
            `soft ${channel} pixels`,
            values,
        );
        mask.dispose();
    }
    const threshold = attachAirSpriteMask(handle.sprite, maskTexture, {
        channel: 'alpha',
        mode: 'threshold',
        threshold: 0.6,
    });
    await clock.step();
    check(pixel(0.125)[0] > 245 && pixel(0.625)[0] === 0, 'threshold mask');
    threshold.dispose();
    const inverse = attachAirSpriteMask(handle.sprite, maskTexture, { channel: 'alpha', inverted: true });
    await clock.step();
    check(pixel(0.125)[0] === 0 && pixel(0.875)[0] > 245, 'inverted soft mask');
    inverse.dispose();
    const atlasTexture = texture(2, 2, Array(4).fill([255, 255, 255, 255]).flat());
    for (const rotated of [false, true]) {
        handle.frame.reset({
            texture: atlasTexture,
            rect: new Rect(1, 0, 1, 1),
            originalSize: new Size(1, 1),
            isRotate: rotated,
        });
        const atlasMask = attachAirSpriteMask(handle.sprite, maskTexture);
        await clock.step();
        const values = [0.125, 0.375, 0.625, 0.875].map((x) => pixel(x)[0]);
        check(
            values.every((v, i) => near(v, [255, 255, 128, 0][i])),
            `atlas UV mask rotated=${rotated}`,
            values,
        );
        atlasMask.dispose();
    }
    handle.dispose();
    atlasTexture.destroy();
    maskTexture.destroy();
    const maskNode = node('NativeMask'),
        nativeMask = maskNode.addComponent(Mask);
    nativeMask.type = Mask.Type.SPRITE_STENCIL;
    const nativeMaskTexture = texture(2, 1, [0, 0, 0, 255, 255, 0, 0, 0]);
    const nativeFrame = createAirTextureSprite(ui, nativeMaskTexture, { size: [256, 256] });
    nativeFrame.node.active = false;
    maskNode.getComponent(Sprite)!.sizeMode = Sprite.SizeMode.CUSTOM;
    maskNode.getComponent(Sprite)!.spriteFrame = nativeFrame.frame;
    maskNode.getComponent(UITransform)!.setContentSize(256, 256);
    nativeMask.alphaThreshold = 0.5;
    const masked = createAirTextureSprite(maskNode, white, { size: [256, 256] });
    await clock.step();
    check(pixel(0.25)[0] > 245 && pixel(0.75)[0] === 0, 'native alpha stencil', {
        left: pixel(0.25),
        right: pixel(0.75),
    });
    masked.dispose();
    maskNode.destroy();
    await clock.step();
    nativeFrame.dispose();
    nativeMaskTexture.destroy();
    const graphicsNode = node('NativeGraphics'),
        graphics = graphicsNode.addComponent(Graphics);
    const solid: AirGraphicsCommand[] = [
        { op: 'rect', args: [-90, -70, 180, 140] },
        { op: 'fill', paint: { color: '#ff0000' } },
    ];
    drawAirGraphics(graphics, solid);
    await clock.step();
    check(pixel(0.5)[0] > 245 && pixel(0.1)[0] === 0, 'native Graphics replay');
    graphicsNode.destroy();
    await clock.step();
    const rich: AirGraphicsCommand[] = [
        { op: 'rect', args: [0, 0, 128, 128] },
        { op: 'circle', args: [64, 64, 20] },
        {
            op: 'fill',
            rule: 'evenodd',
            paint: {
                kind: 'linear',
                from: [0, 0],
                to: [128, 0],
                stops: [
                    { offset: 0, color: '#ff0000' },
                    { offset: 1, color: '#0000ff' },
                ],
            },
        },
    ];
    const bounds = { x: 0, y: 0, width: 128, height: 128 },
        raster = rasterizeAirGraphics(rich, { bounds });
    const richSprite = createAirTextureSprite(ui, raster.texture, { size: [256, 256] });
    await clock.step();
    const left = pixel(0.1),
        right = pixel(0.9),
        hole = pixel(0.5);
    check(left[0] > 210 && right[2] > 210 && hole[0] === 0 && hole[2] === 0, 'gradient and evenodd hole GPU pixels', {
        left,
        right,
        hole,
    });
    const image = new Image();
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(airGraphicsCommandsToSvg(rich, bounds));
    await image.decode();
    const roundtrip = document.createElement('canvas');
    roundtrip.width = roundtrip.height = 128;
    const ctx = roundtrip.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const original = raster.canvas.getContext('2d')!.getImageData(0, 0, 128, 128).data,
        exported = ctx.getImageData(0, 0, 128, 128).data;
    let different = 0;
    for (let i = 0; i < original.length; i += 4)
        if ([0, 1, 2, 3].some((channel) => Math.abs(original[i + channel] - exported[i + channel]) > 8)) different++;
    check(different < 128 * 128 * 0.025, 'SVG raster roundtrip', { different, pixels: 16384 });
    raster.update([
        { op: 'rect', args: [0, 0, 128, 128] },
        { op: 'fill', paint: { color: '#00ff00' } },
    ]);
    await clock.step();
    check(pixel(0.5)[1] > 245 && pixel(0.1)[0] === 0, 'raster update GPU pixels');
    richSprite.dispose();
    raster.dispose();
    async function compareSvg(commands: AirGraphicsCommand[], name: string): Promise<void> {
        const result = rasterizeAirGraphics(commands, { bounds });
        try {
            const image = new Image();
            image.src =
                'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(airGraphicsCommandsToSvg(commands, bounds));
            await image.decode();
            ctx.clearRect(0, 0, 128, 128);
            ctx.drawImage(image, 0, 0);
            const a = result.canvas.getContext('2d')!.getImageData(0, 0, 128, 128).data,
                b = ctx.getImageData(0, 0, 128, 128).data;
            let different = 0;
            for (let i = 0; i < a.length; i += 4)
                if ([0, 1, 2, 3].some((c) => Math.abs(a[i + c] - b[i + c]) > 8)) different++;
            check(different < 16384 * 0.025, name, { different, pixels: 16384 });
        } finally {
            result.dispose();
        }
    }
    await compareSvg(
        [
            { op: 'roundRect', args: [4, 4, 120, 120, 24] },
            {
                op: 'fill',
                paint: {
                    kind: 'radial',
                    center: [64, 64],
                    radius: 64,
                    stops: [
                        { offset: 0, color: '#00ff00' },
                        { offset: 1, color: '#0000ff' },
                    ],
                },
            },
            { op: 'stroke', paint: { color: '#ffffff' }, width: 2 },
        ],
        'SVG rounded radial gradient roundtrip',
    );
    await compareSvg(
        [
            { op: 'moveTo', args: [10, 10] },
            { op: 'bezierCurveTo', args: [10, 120, 118, 120, 118, 10] },
            { op: 'quadraticCurveTo', args: [64, 40, 10, 10] },
            { op: 'fill', paint: { color: '#ff8800', opacity: 0.8 } },
            { op: 'arc', args: [64, 64, 24, 0, Math.PI / 2, true] },
            { op: 'stroke', paint: { color: '#ffffff' }, width: 4, cap: 'round' },
        ],
        'SVG curves and native arc direction roundtrip',
    );
    const tile = document.createElement('canvas');
    tile.width = tile.height = 16;
    const tileContext = tile.getContext('2d')!;
    tileContext.fillStyle = 'red';
    tileContext.fillRect(0, 0, 8, 16);
    tileContext.fillStyle = 'blue';
    tileContext.fillRect(8, 0, 8, 16);
    await compareSvg(
        [
            { op: 'rect', args: [0, 0, 128, 128] },
            {
                op: 'fill',
                paint: {
                    kind: 'pattern',
                    image: tile,
                    width: 16,
                    height: 8,
                    sourceURL: tile.toDataURL(),
                    transform: [1, 0, 0, 1, 3, 5],
                },
            },
        ],
        'SVG non-square transformed pattern roundtrip',
    );
    const patternCommands = (space: 'local' | 'global'): AirGraphicsCommand[] => [
        { op: 'rect', args: [0, 0, 64, 64] },
        { op: 'fill', paint: { kind: 'pattern', image: tile, width: 16, height: 16, textureSpace: space } },
    ];
    const globalA = rasterizeAirGraphics(patternCommands('global'), {
        bounds: { x: 0, y: 0, width: 64, height: 64 },
        worldTransform: [1, 0, 0, 1, 0, 0],
    });
    const globalB = rasterizeAirGraphics(patternCommands('global'), {
        bounds: { x: 0, y: 0, width: 64, height: 64 },
        worldTransform: [1, 0, 0, 1, 8, 0],
    });
    const colorA = [...globalA.canvas.getContext('2d')!.getImageData(2, 20, 1, 1).data],
        colorB = [...globalB.canvas.getContext('2d')!.getImageData(2, 20, 1, 1).data];
    check(colorA[0] === 255 && colorB[2] === 255, 'global pattern phase tracks world translation', { colorA, colorB });
    globalA.dispose();
    globalB.dispose();
    const fractional = rasterizeAirGraphics(
        [
            { op: 'rect', args: [0, 0, 64, 64] },
            { op: 'fill', paint: { kind: 'pattern', image: tile, width: 10.5, height: 13.25 } },
        ],
        { bounds: { x: 0, y: 0, width: 64, height: 64 } },
    );
    const fractionalContext = fractional.canvas.getContext('2d')!;
    const firstTile = [...fractionalContext.getImageData(2, 20, 1, 1).data],
        thirdTile = [...fractionalContext.getImageData(23, 20, 1, 1).data];
    check(
        firstTile[0] > 240 && thirdTile[0] > 240 && firstTile[2] < 10 && thirdTile[2] < 10,
        'fractional pattern retains exact logical period',
        { firstTile, thirdTile },
    );
    fractional.dispose();
    const blendTexture = texture(1, 1, [200, 0, 0, 128]),
        blended = createAirTextureSprite(ui, blendTexture, { size: [256, 256] });
    camera.clearColor = new Color(0, 0, 80, 255);
    const scope = createAirUIBlendScope(blended.node, 'add');
    await clock.step();
    const additive = pixel(0.5);
    scope.set(blended.node, 'normal');
    await clock.step();
    const normal = pixel(0.5);
    check(near(additive[0], 100) && near(additive[2], 80) && near(normal[2], 40), 'opt-in inherited blend GPU pixels', {
        additive,
        normal,
    });
    scope.dispose();
    blended.dispose();
    blendTexture.destroy();
    const particleNode = node('Particles'),
        particles = particleNode.addComponent(ParticleSystem2D);
    const particleOwner = createAirTextureSprite(ui, white),
        particleFrame = particleOwner.frame;
    particleOwner.node.active = false;
    particles.spriteFrame = particleFrame;
    particles.totalParticles = 1;
    particles.emissionRate = 60;
    particles.life = 10;
    particles.lifeVar = 0;
    particles.startSize = 100;
    particles.startSizeVar = 0;
    particles.endSize = 100;
    particles.endSizeVar = 0;
    particles.speed = particles.speedVar = 0;
    particles.gravity.set(0, 0);
    particles.posVar.set(0, 0);
    particles.tangentialAccel = particles.tangentialAccelVar = particles.radialAccel = particles.radialAccelVar = 0;
    particles.startColor = particles.endColor = new Color(200, 0, 0, 128);
    particles.startColorVar = particles.endColorVar = new Color(0, 0, 0, 0);
    const particleScope = createAirUIBlendScope(particleNode, 'add');
    particles.resetSystem();
    for (let i = 0; i < 3; i++) await clock.step();
    particleScope.update();
    await clock.step();
    const particleAdd = pixel(0.5),
        additiveState = {
            factors: [(particles as any)._srcBlendFactor, (particles as any)._dstBlendFactor],
            hash: particles.getRenderMaterial(0)?.hash,
            passHash: particles.getRenderMaterial(0)?.passes[0].hash,
            glBlend: [gl.getParameter(gl.BLEND_SRC_RGB), gl.getParameter(gl.BLEND_DST_RGB)],
            blend: { ...particles.getRenderMaterial(0)?.passes[0].blendState.targets[0] },
        };
    particleScope.set(particleNode, 'normal');
    await clock.step();
    const particleNormal = pixel(0.5);
    check(
        particleAdd[0] > 50 && near(particleAdd[2], 80) && particleNormal[2] < 60,
        'ParticleSystem2D inherited blend GPU pixels',
        { particleAdd, particleNormal, additiveState },
    );
    particleScope.dispose();
    particleNode.destroy();
    await clock.step();
    particleOwner.dispose();
    camera.clearColor = new Color(0, 0, 0, 255);
    white.destroy();
    check(gl.getError() === gl.NO_ERROR, 'no WebGL error');
}
const button = document.getElementById('overlay-button') as HTMLButtonElement;
let clicks = 0;
button.onclick = () => {
    clicks++;
    button.textContent = `${clicks}`;
};
let htmlClicks = 0;
let finishHTML: (() => Promise<unknown>) | null = null;
let flushHTML: (() => Promise<unknown>) | null = null;
const domNode = node('DOM');
domNode.getComponent(UITransform)!.setContentSize(100, 40);
const overlay = createAirDOMOverlay({ canvas });
let binding: ReturnType<typeof overlay.attach>;
const probe = {
    ready: false,
    rows,
    run,
    async overlay() {
        binding = overlay.attach(button, domNode, camera, { width: 100, height: 40 });
        await clock.step();
        overlay.update();
        return { rect: button.getBoundingClientRect().toJSON(), clicks };
    },
    moveOverlay() {
        domNode.setPosition(40, 20, 0);
        domNode.setScale(1.2, 1.2, 1);
        domNode.setRotationFromEuler(0, 0, 15);
        overlay.update();
        return button.getBoundingClientRect().toJSON();
    },
    detachOverlay() {
        binding.dispose();
        overlay.dispose();
        return {
            restored: document.getElementById('original')!.firstElementChild === button,
            width: button.style.width,
            clicks,
        };
    },
    async html() {
        const support = getAirHTMLSourceSupport(canvas);
        if (!support.supported) {
            let code = '';
            try {
                createAirHTMLSource({ canvas, element: button, texture: {} as any });
            } catch (e) {
                code = (e as { code: string }).code;
            }
            check(code === 'AIR_E_HTML_SOURCE_UNSUPPORTED', 'unsupported HTML texture explicit rejection');
            return { support, status: 'UNSUPPORTED', code };
        }
        const element = document.createElement('div');
        element.innerHTML =
            '<button id="html-button" style="width:32px;height:16px;padding:0;font-size:6px">HTML</button><input id="html-input" style="width:50px;height:12px;font-size:6px" value="editable">';
        element.querySelector('button')!.onclick = () => {
            htmlClicks++;
        };
        Object.assign(element.style, { width: '64px', height: '64px', background: 'rgb(255,0,0)', color: 'white' });
        canvas.appendChild(element);
        const t = new Texture2D(),
            placeholder = texture(1, 1, [0, 0, 0, 255]),
            h = createAirTextureSprite(ui, placeholder, { size: [256, 256] });
        const source = createAirHTMLSource({ canvas, element, texture: t, resolution: 1 });
        const untilReady = async (): Promise<void> => {
            const start = performance.now();
            while (source.status !== 'ready') {
                if (source.status === 'failed') throw source.error;
                if (performance.now() - start > 5000) throw new Error('HTML paint timeout');
                await new Promise((r) => requestAnimationFrame(r));
            }
        };
        await untilReady();
        h.frame.texture = t;
        await clock.step();
        const first = pixel(0.1, 0.1);
        check(first[0] > 240, 'live HTML texture upload', first);
        element.style.background = 'rgb(0,0,255)';
        source.update();
        await new Promise((r) => setTimeout(r, 100));
        if (source.status === 'failed') throw source.error;
        await clock.step();
        const second = pixel(0.1, 0.1);
        check(second[2] > 240, 'live HTML texture update', second);
        source.updateGeometry({ canvasTransform: { a: 4, d: 4, e: 0, f: 0 } });
        const beforeInput = new Uint8Array(256 * 64 * 4);
        gl.readPixels(0, 112, 256, 64, gl.RGBA, gl.UNSIGNED_BYTE, beforeInput);
        flushHTML = async () => {
            source.update();
            await untilReady();
            await clock.step();
            const afterInput = new Uint8Array(beforeInput.length);
            gl.readPixels(0, 112, 256, 64, gl.RGBA, gl.UNSIGNED_BYTE, afterInput);
            let changed = 0;
            for (let i = 0; i < beforeInput.length; i++) if (beforeInput[i] !== afterInput[i]) changed++;
            check(changed > 10, 'HTML editable form mirrored to GPU after real input', { changed });
            return { changed };
        };
        finishHTML = async () => {
            check(
                htmlClicks === 1 && (element.querySelector('input') as HTMLInputElement).value === 'AIR input',
                'HTML texture real click and editable input',
                { clicks: htmlClicks },
            );
            source.dispose();
            element.remove();
            const frozenElement = document.createElement('div');
            Object.assign(frozenElement.style, { width: '64px', height: '64px', background: 'rgb(0,255,0)' });
            canvas.appendChild(frozenElement);
            const snapshot = createAirHTMLSource({
                canvas,
                element: frozenElement,
                texture: t,
                resolution: 1,
                snapshot: true,
            });
            const wait = async (): Promise<void> => {
                const start = performance.now();
                while (snapshot.status !== 'ready') {
                    if (snapshot.status === 'failed') throw snapshot.error;
                    if (performance.now() - start > 5000) throw new Error('HTML snapshot timeout');
                    await new Promise((r) => requestAnimationFrame(r));
                }
            };
            await wait();
            await clock.step();
            const captured = pixel(0.1, 0.1);
            check(captured[1] > 240, 'HTML snapshot capture', captured);
            frozenElement.style.background = 'rgb(0,0,255)';
            snapshot.update();
            await wait();
            await clock.step();
            const unchanged = pixel(0.1, 0.1);
            check(unchanged[1] > 240 && unchanged[2] < 10, 'HTML snapshot remains immutable', unchanged);
            snapshot.dispose();
            frozenElement.remove();
            h.dispose();
            t.destroy();
            placeholder.destroy();
            check(!canvas.hasAttribute('content') && !canvas.hasAttribute('layoutsubtree'), 'HTML attributes restored');
            check(gl.getError() === gl.NO_ERROR, 'HTML no WebGL error');
            return { captured, unchanged, htmlClicks };
        };
        return { support, status: 'PASS', first, second };
    },
    finishHTML() {
        if (!finishHTML) throw new Error('no HTML source');
        return finishHTML();
    },
    flushHTML() {
        if (!flushHTML) throw new Error('no HTML source');
        return flushHTML();
    },
};
(window as any).__graphicsDOM = probe;
await clock.step();
probe.ready = true;
