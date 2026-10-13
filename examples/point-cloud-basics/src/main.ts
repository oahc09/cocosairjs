import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Color,
    MeshRenderer,
    Material,
    EffectAsset,
    Mesh,
    Vec4,
    gfx,
    utils,
    director,
    Director,
    Layers,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

const probe = {
    id: 'point-cloud-basics',
    ready: false,
    ok: false,
    checks: [] as { name: string; ok: boolean; detail: string }[],
    state: {} as Record<string, unknown>,
};
(window as any).__trialProbe = probe;
function check(name: string, ok: boolean, detail: string): void {
    probe.checks.push({ name, ok, detail });
    if (!ok) throw new Error(`[point-cloud-basics] ${name}: ${detail}`);
}

// The generated JSON is a checked-in runtime asset. Regenerate it with:
// node tools/build/effect-json.mjs examples/point-cloud-basics/point.effect-spec.json examples/point-cloud-basics/point.effect.json
async function main(): Promise<void> {
    const response = await fetch(new URL('point.effect.json', document.baseURI));
    if (!response.ok) throw new Error(`effect JSON: HTTP ${response.status}`);
    const effectJson = await response.json();
    const app = await createAirApp({ canvas: '#GameCanvas' });
    (window as any).__airApp = app;
    const scene = new Scene('Points and lines');
    const cameraNode = new Node('Main Camera');
    cameraNode.setPosition(0, 0, 5);
    scene.addChild(cameraNode);
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 1.8;
    camera.visibility = Layers.Enum.DEFAULT;
    camera.clearColor = new Color(16, 18, 25, 255);
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.near = 0.1;
    camera.far = 20;

    let effects: EffectAsset[] = [];
    let meshes: Mesh[] = [];
    let materials: Material[] = [];
    let nodes: Node[] = [];
    function build(): void {
        const points: number[] = [];
        for (let row = 0; row < 4; row++)
            for (let col = 0; col < 12; col++) points.push(-1.5 + col * (3 / 11), 0.35 + row * 0.24, 0);
        const lines: number[] = [];
        const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
        const worldPerPixel = (2 * camera.orthoHeight) / canvas.height;
        for (let row = 0; row < 4; row++) {
            const y = -0.35 - row * 0.24;
            // A one-pixel line on a sample boundary can resolve to half coverage
            // under MSAA. Align it to pixel centers without changing the oracle.
            const screenY = canvas.height / 2 - y / worldPerPixel;
            const alignedY = (canvas.height / 2 - (Math.floor(screenY) + 0.5)) * worldPerPixel;
            lines.push(-1.5, alignedY, 0, 1.5, alignedY, 0);
        }
        for (const [name, positions, primitiveMode, tint] of [
            ['PointCloud', points, gfx.PrimitiveMode.POINT_LIST, new Vec4(0.1, 0.8, 1, 1)],
            ['LineGrid', lines, gfx.PrimitiveMode.LINE_LIST, new Vec4(1, 0.35, 0.05, 1)],
        ] as const) {
            const json = JSON.parse(JSON.stringify(effectJson));
            // PSO topology comes from the pass. A mesh topology alone is insufficient.
            json.name += name;
            json.techniques[0].passes[0].primitive = primitiveMode;
            json.techniques[0].passes[0].program += name;
            json.shaders[0].name = json.techniques[0].passes[0].program;
            json.shaders[0].hash += primitiveMode;
            const effect = Object.assign(new EffectAsset(), json);
            effect.onLoaded();
            const material = new Material();
            material.initialize({ effectAsset: effect });
            material.setProperty('tint', tint);
            const mesh = utils.createMesh({ positions: [...positions], primitiveMode }, undefined, {
                calculateBounds: true,
            });
            const node = new Node(name);
            scene.addChild(node);
            const renderer = node.addComponent(MeshRenderer);
            renderer.mesh = mesh;
            renderer.setSharedMaterial(material, 0);
            check(
                `topology-${name}`,
                mesh.struct.primitives[0].primitiveMode === primitiveMode &&
                    material.passes[0].primitive === primitiveMode,
                `mesh and pass = ${primitiveMode}`,
            );
            effects.push(effect);
            meshes.push(mesh);
            materials.push(material);
            nodes.push(node);
        }
    }
    function release(): void {
        for (const node of nodes) node.destroy();
        for (const material of materials) material.destroy();
        for (const mesh of meshes) mesh.destroy();
        for (const effect of effects) {
            EffectAsset.remove(effect);
            effect.destroy();
        }
        nodes = [];
        materials = [];
        meshes = [];
        effects = [];
    }
    const held = (): { name: string; ref: object }[] => [
        ...effects.map((ref, i) => ({ name: `effect-${i}`, ref })),
        ...meshes.map((ref, i) => ({ name: `mesh-${i}`, ref })),
        ...materials.map((ref, i) => ({ name: `material-${i}`, ref })),
    ];
    build();
    app.run(scene);
    function pixels(): Promise<{ cyan: number; orange: number }> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                director.off(Director.EVENT_AFTER_DRAW, sample);
                reject(new Error('no rendered frame'));
            }, 8000);
            function sample(): void {
                director.off(Director.EVENT_AFTER_DRAW, sample);
                clearTimeout(timer);
                try {
                    const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
                    const copy = document.createElement('canvas');
                    copy.width = canvas.width;
                    copy.height = canvas.height;
                    const ctx = copy.getContext('2d')!;
                    ctx.drawImage(canvas, 0, 0);
                    const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
                    let cyan = 0;
                    let orange = 0;
                    for (let y = 0; y < copy.height; y++)
                        for (let x = 0; x < copy.width; x++) {
                            const i = (y * copy.width + x) * 4;
                            if (y < copy.height / 2 && data[i + 2] > 180 && data[i + 1] > 140 && data[i] < 80) cyan++;
                            if (y >= copy.height / 2 && data[i] > 180 && data[i + 1] > 50 && data[i + 2] < 80) orange++;
                        }
                    resolve({ cyan, orange });
                } catch (error) {
                    reject(error);
                }
            }
            director.on(Director.EVENT_AFTER_DRAW, sample);
        });
    }
    const initial = await pixels();
    probe.state.initial = initial;
    check('points-visible', initial.cyan > 300, JSON.stringify(initial));
    check('lines-visible', initial.orange > 100, JSON.stringify(initial));
    materials[0].setProperty('params', new Vec4(16, 0, 0, 0));
    const larger = await pixels();
    probe.state.larger = larger;
    check('point-size-pixel-change', larger.cyan > initial.cyan * 2, JSON.stringify({ initial, larger }));
    materials[0].setProperty('params', new Vec4(8, 0, 0, 0));
    installAssetLifecycle({
        label: 'point-cloud-basics',
        hold: held,
        release,
        reacquire: async () => {
            build();
            await pixels();
            return held();
        },
    });
    (window as any).__pointCloudProbe = { pixels, release, rebuild: build };
    (window as any).__probe = async () => {
        const live = await pixels();
        return {
            meshPrimitive: meshes.map((m) => m.struct.primitives[0].primitiveMode),
            passPrimitive: materials.map((m) => m.passes[0].primitive),
            livePixels: live,
            initialPixels: probe.state.initial,
            largerPixels: probe.state.larger,
            canvas: { width: app.canvas.width, height: app.canvas.height },
        };
    };
    probe.ready = true;
    probe.ok = true;
}
main().catch((error) => {
    probe.ready = true;
    probe.ok = false;
    probe.state.fatal = String(error);
    throw error;
});
