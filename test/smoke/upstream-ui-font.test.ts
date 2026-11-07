import { MeshBuffer } from '../../src/cocos/2d/renderer/mesh-buffer';
import { vfmtPosUvColor4B } from '../../src/cocos/2d/renderer/vertex-format';
import { createAirApp, Scene, Node, UIMesh, Texture2D, game, director, Color } from '../../src';
import { Button } from '../../src/cocos/ui/button';
import { Graphics } from '../../src/exports/graphics';
import { CCObject } from '../../src/cocos/core/data/object';
import { MeshRenderData } from '../../src/cocos/2d/renderer/render-data';
import { buildFontDesc, getCanvasFontFamily, quoteFontFamily } from '../../src/cocos/2d/utils/font-family';
import { getFontFamily, loadFont } from '../../src/cocos/2d/utils/font-loader';

function triangle(stride = 24) {
    const vertexData = new Uint8Array(3 * stride);
    const floats = new Float32Array(vertexData.buffer);
    for (let i = 0; i < 3; i++) {
        floats[(i * stride) / 4] = i;
        vertexData.fill(200, i * stride + 20, (i + 1) * stride);
    }
    return {
        vertexCount: 3,
        vertexStride: stride,
        vertexData,
        indexCount: 3,
        indexData: new Uint8Array(new Uint16Array([0, 1, 2]).buffer),
        segments: [] as any[],
    };
}

describe('upstream UI code-first lifecycle', () => {
    let app: Awaited<ReturnType<typeof createAirApp>>;
    let scene: Scene;
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    beforeEach(() => {
        scene = new Scene('upstream-ui');
        app.run(scene);
        game.pause();
    });
    afterEach(() => {
        scene.destroy();
        CCObject._deferredDestroy();
        jest.restoreAllMocks();
    });
    function mesh() {
        const n = new Node();
        scene.addChild(n);
        return n.addComponent(UIMesh);
    }
    test('public UIMesh copies vertices, transforms all axes, fades and resubmits unchanged indices', () => {
        const a = mesh(),
            b = mesh(),
            data = triangle();
        a.setMeshData(data);
        b.setMeshData(triangle());
        a.enableBatch = true;
        a.node.setPosition(10, 20, 30);
        a.color = new Color(255, 255, 255, 128);
        a.updateRenderer();
        b.updateRenderer();
        const submit = { commitMiddleware: jest.fn() } as any;
        a.fillBuffers(submit);
        b.fillBuffers(submit);
        const rd = a.renderData!,
            buffer = rd.getMeshBuffer()!;
        expect(Array.from(rd.chunk.vb.slice(0, 3))).toEqual([10, 20, 30]);
        expect(new Uint8Array(rd.chunk.vb.buffer, rd.chunk.vb.byteOffset, 24)[23]).toBe(100);
        expect(data.vertexData[23]).toBe(200);
        buffer.indexOffset = 0;
        b.fillBuffers(submit);
        a.fillBuffers(submit);
        expect(Array.from(buffer.iData.slice(3, 6))).toEqual([
            rd.chunk.vertexOffset,
            rd.chunk.vertexOffset + 1,
            rd.chunk.vertexOffset + 2,
        ]);
    });
    test('disable/re-enable, tint replacement and destroy release chunks but not shared material or buffers', () => {
        const a = mesh(),
            b = mesh();
        a.setMeshData(triangle());
        b.setMeshData(triangle());
        a.updateRenderer();
        b.updateRenderer();
        a.fillBuffers({} as any);
        b.fillBuffers({} as any);
        const material = a.getSharedMaterial(0)!;
        const destroyMaterial = jest.spyOn(material, 'destroy');
        const buffer = b.renderData!.getMeshBuffer()!;
        const destroyBuffer = jest.spyOn(buffer, 'destroy');
        a.enabled = false;
        expect(a.renderData).toBeNull();
        a.enabled = true;
        a.setMeshData(triangle(28));
        a.updateRenderer();
        a.fillBuffers({} as any);
        expect(a.renderData!.chunk.vb.byteLength).toBeGreaterThanOrEqual(84);
        a.node.destroy();
        CCObject._deferredDestroy();
        expect(destroyMaterial).not.toHaveBeenCalled();
        expect(destroyBuffer).not.toHaveBeenCalled();
        b.fillBuffers({} as any);
        expect(b.renderData!.chunk).toBeTruthy();
    });
    test('two-color PMA opacity fades copied light RGBA and dark RGB, retaining the dark sentinel', () => {
        const a = mesh(),
            data = triangle(28);
        a.premultipliedAlpha = true;
        a.color = new Color(255, 255, 255, 128);
        a.setMeshData(data);
        a.updateRenderer();
        a.fillBuffers({} as any);
        const chunk = a.renderData!.chunk;
        expect(Array.from(new Uint8Array(chunk.vb.buffer, chunk.vb.byteOffset + 20, 8))).toEqual([
            100, 100, 100, 100, 100, 100, 100, 200,
        ]);
        expect(Array.from(data.vertexData.slice(20, 28))).toEqual(new Array(8).fill(200));
    });
    test('segments submit fallback and borrowed materials without taking asset ownership', () => {
        const a = mesh(),
            data = triangle(),
            texture = new Texture2D();
        texture.reset({ width: 1, height: 1 });
        const material = a.getMaterialInstance(0)!;
        const destroyTexture = jest.spyOn(texture, 'destroy');
        const other = mesh();
        const borrowed = other.getMaterialInstance(0)!;
        const destroyBorrowed = jest.spyOn(borrowed, 'destroy');
        data.segments = [
            { indexOffset: 0, indexCount: 3, texture, material: null },
            { indexOffset: 0, indexCount: 3, texture, material: borrowed },
        ];
        a.setMeshData(data);
        a.updateRenderer();
        const batcher = { commitMiddleware: jest.fn() } as any;
        a.fillBuffers(batcher);
        expect(batcher.commitMiddleware.mock.calls.map((args: any[]) => args[5])).toEqual([material, borrowed]);
        expect(batcher.commitMiddleware.mock.calls.map((args: any[]) => args[3])).toEqual([3, 3]);
        a.node.destroy();
        CCObject._deferredDestroy();
        expect(destroyBorrowed).not.toHaveBeenCalled();
        expect(destroyTexture).not.toHaveBeenCalled();
        expect((a as any)._meshData).toBeNull();
        texture.destroy();
    });
    test('invalid replacement preserves accepted geometry', () => {
        const a = mesh(),
            good = triangle();
        a.setMeshData(good);
        a.setMeshData({ ...triangle(), indexData: new Uint8Array(new Uint16Array([0, 1, 99]).buffer) });
        expect((a as any)._meshData).toBe(good);
        for (const vertexCount of [NaN, Infinity, 1.5, -1]) {
            a.setMeshData({ ...triangle(), vertexCount });
            expect((a as any)._meshData).toBe(good);
        }
        a.setMeshData({
            ...triangle(),
            segments: [{ indexOffset: NaN, indexCount: 3, texture: null, material: null }],
        });
        expect((a as any)._meshData).toBe(good);
    });
    test('Button component and node share listener registry and original touch event', () => {
        const node = new Node();
        scene.addChild(node);
        const button = node.addComponent(Button),
            target = {},
            listener = jest.fn();
        button.on(Button.EventType.CLICK, listener, target);
        const event = { propagationStopped: false };
        (button as any)._pressed = true;
        (button as any)._onTouchEnded(event);
        expect(listener.mock.calls[0].slice(0, 2)).toEqual([button, event]);
        button.off(Button.EventType.CLICK, listener, target);
        node.emit(Button.EventType.CLICK, button);
        expect(listener).toHaveBeenCalledTimes(1);
        button.on(Button.EventType.CLICK, listener, target);
        button.targetOff(target);
        node.emit(Button.EventType.CLICK, button);
        expect(listener).toHaveBeenCalledTimes(1);
        node.destroy();
    });
    test('MeshRenderData.clear destroys both owned buffers and can allocate again', () => {
        const rd = new MeshRenderData();
        rd.request(3, 3);
        rd.requestIA(director.root!.device);
        const vb = (rd as any)._vertexBuffers[0],
            ib = (rd as any)._indexBuffer;
        const dv = jest.spyOn(vb, 'destroy'),
            di = jest.spyOn(ib, 'destroy');
        rd.clear();
        rd.clear();
        expect(dv).toHaveBeenCalledTimes(1);
        expect(di).toHaveBeenCalledTimes(1);
        rd.request(3, 3);
        rd.requestIA(director.root!.device);
        expect((rd as any)._indexBuffer).not.toBe(ib);
        rd.clear();
    });
    test('MeshBuffer refuses uploads after failed capacity growth and retries dirty data', () => {
        const buffer = new MeshBuffer();
        buffer.initialize(director.root!.device, vfmtPosUvColor4B.slice(), 18, 3);
        buffer.byteOffset = 72;
        buffer.indexOffset = 3;
        buffer.iData.set([0, 1, 2]);
        buffer.setDirty();
        const ia = buffer.requireFreeIA(director.root!.device);
        ia.indexCount = 3;
        const resize = jest.spyOn(ia.vertexBuffers[0], 'resize').mockImplementation(() => {});
        const update = jest.spyOn(ia.vertexBuffers[0], 'update');
        buffer.uploadBuffers();
        expect(update).not.toHaveBeenCalled();
        expect(ia.indexCount).toBe(0);
        expect(buffer.dirty).toBe(true);
        resize.mockRestore();
        buffer.uploadBuffers();
        expect(update).toHaveBeenCalledTimes(1);
        expect(buffer.dirty).toBe(false);
        buffer.destroy();
    });
    test('Graphics allocates small buffers then grows and retains capacity after clear', () => {
        const node = new Node();
        scene.addChild(node);
        const g = node.addComponent(Graphics);
        g.rect(0, 0, 10, 10);
        g.fill();
        g.updateRenderer();
        g.fillBuffers({ commitModel: jest.fn() } as any);
        const ia = g.model!.subModels[0].inputAssembler;
        expect(ia.vertexBuffers[0].size).toBeLessThan(65536 * ia.vertexBuffers[0].stride);
        g.clear();
        for (let i = 0; i < 50; i++) g.rect(i, i, 10, 10);
        g.fill();
        g.fillBuffers({ commitModel: jest.fn() } as any);
        expect(ia.vertexBuffers[0].size).toBeGreaterThanOrEqual(ia.vertexCount * ia.vertexBuffers[0].stride);
        expect(ia.indexBuffer!.size).toBeGreaterThanOrEqual(ia.indexCount * 2);
        const size = ia.vertexBuffers[0].size;
        g.clear();
        g.rect(0, 0, 1, 1);
        g.fill();
        g.fillBuffers({ commitModel: jest.fn() } as any);
        expect(ia.vertexBuffers[0].size).toBe(size);
    });
});

describe('font family serialization', () => {
    test('fallback font polling remeasures rather than reusing cached widths', () => {
        jest.useFakeTimers();
        const context = {
            font: '',
            measureText: jest.fn().mockReturnValueOnce({ width: 10 }).mockReturnValue({ width: 20 }),
        };
        const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as any);
        const done = jest.fn();
        try {
            loadFont('/fonts/Polling Font.ttf', {}, done);
            expect(context.font).toBe('40px "Polling Font_LABEL"');
            jest.advanceTimersByTime(100);
            expect(context.measureText).toHaveBeenCalledTimes(2);
            expect(done).toHaveBeenCalledWith(null, 'Polling Font_LABEL');
        } finally {
            getContext.mockRestore();
            jest.useRealTimers();
        }
    });
    test('raw asset names quote once, while CSS system fallback lists remain expressions', () => {
        const name = '12px My "Font", A\\B';
        const family = getCanvasFontFamily({ useSystemFont: false, fontFamily: '', font: { _nativeAsset: name } });
        expect(family).toBe('"12px My \\"Font\\", A\\\\B"');
        expect(buildFontDesc(24, family, true, true)).toBe(`italic bold 24px ${family}`);
        expect(getCanvasFontFamily({ useSystemFont: true, fontFamily: 'Arial, sans-serif', font: null })).toBe(
            'Arial, sans-serif',
        );
        expect(quoteFontFamily('\n\0')).toBe('"\\a �"');
        expect(getFontFamily('/fonts/My Font.ttf')).toBe('My Font_LABEL');
    });
});
