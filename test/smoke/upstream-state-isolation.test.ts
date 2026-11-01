import { createAirApp, Material, MeshRenderer, Node, Scene, Color, Texture2D } from '../../src';
import { BlendFactor, CullMode, ComparisonFunc, Format, LoadOp, Rect } from '../../src/cocos/gfx';
import { PipelineStateManager } from '../../src/cocos/rendering/pipeline-state-manager';
import { WebGLConstants as GL } from '../../src/cocos/gfx/gl-constants';
import { WebGL2StateCache } from '../../src/cocos/gfx/webgl2/webgl2-state-cache';
import { WebGL2CmdFuncBeginRenderPass } from '../../src/cocos/gfx/webgl2/webgl2-commands';
import { AirTransmissionCapture } from '../../src/air/rendering/transmission-capture';

// EmptyDevice / recorded WebGL calls prove CPU state selection only, never pixels.
describe('upstream cache categories and state isolation (CPU)', () => {
    beforeAll(async () => {
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    afterEach(() => {
        (PipelineStateManager as any)._PSOHashMap.clear();
    });
    function materials() {
        const template = new Material();
        template.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: false } });
        const nodes = [new Node('a'), new Node('b')];
        const instances = nodes.map((node) => {
            const renderer = node.addComponent(MeshRenderer);
            renderer.setSharedMaterial(template, 0);
            return renderer.getMaterialInstance(0)!;
        });
        return { template, nodes, a: instances[0], b: instances[1] };
    }
    test('uniform mutation preserves the shader/PSO key and does not pollute template or sibling', () => {
        const { template, nodes, a, b } = materials();
        const before = {
            hash: a.passes[0].hash,
            pass: a.passes[0],
            template: template.getProperty('mainColor'),
            sibling: b.getProperty('mainColor'),
        };
        const tint = new Color(30, 100, 200, 128);
        a.setProperty('mainColor', tint);
        expect(a.passes[0].hash).toBe(before.hash);
        expect(a.passes[0]).toBe(before.pass);
        expect(a.getProperty('mainColor')).toEqual(tint);
        expect(template.getProperty('mainColor')).toEqual(before.template);
        expect(b.getProperty('mainColor')).toEqual(before.sibling);
        for (const node of nodes) node.destroy();
        template.destroy();
    });
    test.each([false, true])(
        'blend/depth/cull keys differ independently of first construction order (%s)',
        (reverse) => {
            const { template, nodes, a, b } = materials();
            const original = a.passes[0].hash;
            a.overridePipelineStates({
                blendState: {
                    targets: [
                        { blend: true, blendSrc: BlendFactor.SRC_ALPHA, blendDst: BlendFactor.ONE_MINUS_SRC_ALPHA },
                    ],
                },
            });
            const blended = a.passes[0].hash;
            expect(blended).not.toBe(original);
            expect(b.passes[0].hash).toBe(original);
            a.overridePipelineStates({
                depthStencilState: { depthWrite: false, depthFunc: ComparisonFunc.LESS_EQUAL },
            });
            const depth = a.passes[0].hash;
            expect(depth).not.toBe(blended);
            a.overridePipelineStates({ rasterizerState: { cullMode: CullMode.NONE } });
            expect(a.passes[0].hash).not.toBe(depth);
            expect(template.passes[0].hash).toBe(original);
            const device = { createPipelineState: jest.fn((info) => ({ info })) } as any;
            const shader = { typedID: 1234 } as any,
                renderPass = { hash: 5678 } as any;
            const ia = { attributesHash: 9012, attributes: [] } as any;
            const get = (material: Material) =>
                PipelineStateManager.getOrCreatePipelineState(device, material.passes[0], shader, renderPass, ia);
            const ordered = reverse ? [b, a] : [a, b];
            const first = get(ordered[0]),
                second = get(ordered[1]);
            expect(first).not.toBe(second);
            expect(get(ordered[0])).toBe(first);
            expect(get(ordered[1])).toBe(second);
            a.setProperty('mainColor', new Color(255, 0, 0, 64));
            expect(get(a)).toBe(reverse ? second : first);
            expect(device.createPipelineState).toHaveBeenCalledTimes(2);
            for (const node of nodes) node.destroy();
            template.destroy();
        },
    );
    test('macro selection changes the variant key while texture binding alone does not', () => {
        const { template, nodes, a, b } = materials();
        const original = a.passes[0].hash;
        a.recompileShaders({ USE_TEXTURE: true });
        expect(a.passes[0].hash).not.toBe(original);
        expect(b.passes[0].hash).toBe(original);
        const textured = a.passes[0].hash;
        const t1 = new Texture2D(),
            t2 = new Texture2D();
        t1.reset({ width: 2, height: 2 });
        t2.reset({ width: 2, height: 2 });
        a.setProperty('mainTexture', t1);
        a.setProperty('mainTexture', t2);
        expect(a.passes[0].hash).toBe(textured);
        expect(a.getProperty('mainTexture')).toBe(t2);
        expect(b.getProperty('mainTexture')).not.toBe(t2);
        for (const node of nodes) node.destroy();
        template.destroy();
        t1.destroy();
        t2.destroy();
    });
    test('equal-size/equal-format A → B → A binds distinct FBOs and clears, restores write masks', () => {
        const calls: Record<string, jest.Mock> = {};
        const gl = new Proxy(GL, {
            get: (target, key: string) => target[key] ?? calls[key] ?? (calls[key] = jest.fn()),
        }) as any;
        const cache = new WebGL2StateCache();
        cache.initialize(8, 8, 16);
        cache.dss.depthWrite = false;
        const device = { gl, getStateCache: () => cache } as any;
        const pass = {
            colorAttachments: [{ format: Format.RGBA8, loadOp: LoadOp.CLEAR }],
            depthStencilAttachment: {
                format: Format.DEPTH_STENCIL,
                depthLoadOp: LoadOp.CLEAR,
                stencilLoadOp: LoadOp.LOAD,
            },
        } as any;
        const a = { glFramebuffer: { name: 'a' }, gpuColorViews: [], gpuDepthStencilView: null } as any;
        const b = { glFramebuffer: { name: 'b' }, gpuColorViews: [], gpuDepthStencilView: null } as any;
        const colors = [
            { x: 1, y: 0, z: 0, w: 1 },
            { x: 0, y: 0, z: 1, w: 1 },
        ];
        for (const [target, color, depth] of [
            [a, colors[0], 1],
            [b, colors[1], 0.25],
            [a, colors[0], 1],
        ] as const)
            WebGL2CmdFuncBeginRenderPass(device, pass, target, new Rect(0, 0, 64, 32), [color] as any, depth, 0);
        expect(gl.bindFramebuffer.mock.calls).toEqual([
            [GL.DRAW_FRAMEBUFFER, a.glFramebuffer],
            [GL.DRAW_FRAMEBUFFER, b.glFramebuffer],
            [GL.DRAW_FRAMEBUFFER, a.glFramebuffer],
        ]);
        expect(gl.clearColor.mock.calls).toEqual([
            [1, 0, 0, 1],
            [0, 0, 1, 1],
            [1, 0, 0, 1],
        ]);
        expect(gl.clearDepth.mock.calls).toEqual([[1], [0.25], [1]]);
        expect(gl.depthMask.mock.calls).toEqual([[true], [false], [true], [false], [true], [false]]);
        expect(cache.dss.depthWrite).toBe(false);
        expect(gl.viewport).toHaveBeenCalledTimes(1); // Same size is legal; FBO identity must still change.
        WebGL2CmdFuncBeginRenderPass(device, pass, a, new Rect(2, 3, 128, 64), [colors[0]] as any, 1, 0);
        expect(gl.viewport).toHaveBeenLastCalledWith(2, 3, 128, 64);
        expect(gl.scissor).toHaveBeenLastCalledWith(2, 3, 128, 64);
    });
    test('single-capture guard survives rejection, disable/re-enable and disposal for 30 cycles', () => {
        const scene = new Scene('capture ownership');
        const na = new Node('capture a'),
            nb = new Node('capture b');
        scene.addChild(na);
        scene.addChild(nb);
        const a = na.addComponent(AirTransmissionCapture),
            b = nb.addComponent(AirTransmissionCapture);
        try {
            for (let cycle = 0; cycle < 30; ++cycle) {
                a.onEnable();
                expect(() => b.onEnable()).toThrow(/only one capture per scene/);
                expect(() => a.onEnable()).not.toThrow();
                a.onDisable();
                b.onEnable();
                expect(() => a.onEnable()).toThrow(/only one capture per scene/);
                b.onDisable();
            }
        } finally {
            a.onDestroy();
            b.onDestroy();
            scene.destroy();
        }
        // No main camera/GL capture was created; this is ownership logic, not rendering evidence.
    });
});
