import { TextDecoder, TextEncoder } from 'util';
import { createAirApp, GLTFLoader, DirectionalLight, PointLight, SpotLight, Vec3 } from '../../src';
import { INFINITE_RANGE } from '../../src/air/assets/gltf/extensions/scene/lights';
import { CCObject } from '../../src/cocos/core/data/object';
import { fixture, toGLB } from '../fixtures/gltf/fixture';
import type { GLTFDocument } from '../../src/air/assets/gltf/schema';

declare const require: (id: string) => any;
declare const __dirname: string;

Object.assign(globalThis, { TextDecoder, TextEncoder });
const loader = new GLTFLoader();

function fileGLB (name: string): ArrayBuffer {
    const fs = require('fs');
    const file = fs.readFileSync(require('path').join(__dirname, '..', '..', 'examples', 'gltf-viewer', 'assets', name));
    return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}
/** Base fixture with KHR_lights_punctual payload; refs[0] on 'sceneHost', extras as 'lightRefN'. */
function lightsGLB (defs: object[], refs: number[]): { glb: ArrayBuffer } {
    const f = fixture();
    const json = f.json;
    json.extensionsUsed = ['KHR_lights_punctual'];
    json.extensions = { KHR_lights_punctual: { lights: defs } };
    const index = json.nodes!.length;
    json.nodes!.push({ name: 'sceneHost', extensions: { KHR_lights_punctual: { light: refs[0] } } });
    json.scenes![0].nodes!.push(index);
    for (const extra of refs.slice(1)) {
        const more = json.nodes!.length;
        json.nodes!.push({ name: `lightRef${extra}`, extensions: { KHR_lights_punctual: { light: extra } } });
        json.scenes![0].nodes!.push(more);
    }
    return { glb: toGLB(json, f.bin) };
}

afterEach(() => { CCObject._deferredDestroy(); });

describe('glTF scene extensions', () => {
    let app: Awaited<ReturnType<typeof createAirApp>>;
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
        void app;
    });

    test('KHR_lights_punctual registers as supported and maps units per spec', async () => {
        const support = loader.getExtensionSupport().find((entry) => entry.name === 'KHR_lights_punctual');
        expect(support?.status).toBe('supported');

        const { glb } = lightsGLB([
            { name: 'key', type: 'directional', intensity: 3.2 },
            { name: 'bulb', type: 'point', color: [0.3, 0.6, 1], intensity: 17, range: 2.5 },
            { name: 'torch', type: 'spot', intensity: 40, range: 6, innerConeAngle: 0.1, outerConeAngle: 0.5 },
        ], [0, 1]);
        const asset = await loader.parseAsync(glb);
        const instance = asset.instantiate();
        const directional = findDeep(instance.root, 'sceneHost').getComponent(DirectionalLight);
        expect(directional).toBeTruthy();
        expect(directional!.illuminance).toBeCloseTo(3.2, 4);

        const point = findDeep(instance.root, 'lightRef1').getComponent(PointLight);
        expect(point).toBeTruthy();
        expect(point!.luminousFlux).toBeCloseTo(4 * Math.PI * 17, 2);
        expect(point!.range).toBeCloseTo(2.5, 4);
        expect(point!.color.g).toBeCloseTo(0.6 * 255, 0);
        instance.dispose(); asset.destroy();
    });

    test('two nodes referencing one light definition get independent components', async () => {
        const { glb } = lightsGLB([{ type: 'point', intensity: 10 }], [0, 0]);
        const asset = await loader.parseAsync(glb);
        const instance = asset.instantiate();
        const first = findDeep(instance.root, 'sceneHost').getComponent(PointLight);
        const second = findDeep(instance.root, 'lightRef0').getComponent(PointLight);
        expect(first && second && first !== second).toBe(true);
        expect(second!.luminousFlux).toBeCloseTo(first!.luminousFlux, 4);
        instance.dispose(); asset.destroy();
    });

    test('spot maps full cone angle, uniform-cone flux, and warns about innerConeAngle', async () => {
        const { glb } = lightsGLB([
            { type: 'spot', intensity: 40, range: 6, innerConeAngle: 0.1, outerConeAngle: 0.5 },
        ], [0]);
        const asset = await loader.parseAsync(glb);
        const instance = asset.instantiate();
        expect(asset.warnings.some((w) => w.includes('innerConeAngle'))).toBe(true);
        const spot = findDeep(instance.root, 'sceneHost').getComponent(SpotLight);
        expect(spot).toBeTruthy();
        expect(spot!.spotAngle).toBeCloseTo((0.5 * 2) * 180 / Math.PI, 4);
        expect(spot!.luminousFlux).toBeCloseTo(2 * Math.PI * (1 - Math.cos(0.5)) * 40, 2);
        instance.dispose(); asset.destroy();
    });

    test('point without range uses a large finite stand-in, never a short distance', async () => {
        const { glb } = lightsGLB([{ type: 'point', intensity: 5 }], [0]);
        const asset = await loader.parseAsync(glb);
        const instance = asset.instantiate();
        const host = findDeep(instance.root, 'sceneHost');
        const point = host.getComponent(PointLight);
        expect(point!.range).toBe(INFINITE_RANGE);
        instance.dispose(); asset.destroy();
    });

    test('invalid light definitions fail with GLTF_EXTENSION_INVALID', async () => {
        const cases: object[][] = [
            [{ type: 'omni', intensity: 1 }],
            [{ type: 'point', intensity: -1 }],
            [{ type: 'point', color: [2, 0, 0] }],
            // outerConeAngle = PI/2 is legal per spec; only values strictly beyond it are invalid.
            [{ type: 'spot', outerConeAngle: Math.PI / 2 + 0.01 }],
            [{ type: 'spot', innerConeAngle: 0.9, outerConeAngle: 0.5 }],
            [{ type: 'point', range: 0 }],
        ];
        for (const defs of cases) {
            await expect(loader.parseAsync(lightsGLB(defs, [0]).glb)).rejects
                .toMatchObject({ code: 'GLTF_EXTENSION_INVALID' });
        }
        // Spec boundary: a 90-degree outer cone (PI/2) must load; spotAngle is the full cone (180).
        const edge = lightsGLB([{ type: 'spot', intensity: 1, outerConeAngle: Math.PI / 2 }], [0]).glb;
        const asset = await loader.parseAsync(edge);
        const instance = asset.instantiate();
        expect(findDeep(instance.root, 'sceneHost').getComponent(SpotLight)!.spotAngle).toBeCloseTo(180, 3);
        instance.dispose(); asset.destroy();
    });

    test('EXT_mesh_gpu_instancing expands to shared-mesh instances and reports fast-path status', async () => {
        const support = loader.getExtensionSupport().find((entry) => entry.name === 'EXT_mesh_gpu_instancing');
        expect(support?.status).toBe('supported');
        expect(support?.reason).toContain('expansion');

        const f = fixture();
        const json = f.json;
        json.extensionsUsed = ['EXT_mesh_gpu_instancing'];
        const t = addAccessor(json, f, [-0.4, 0.2, 0.1, 0.8, -0.3, 0.5, 1.2, 0.1, -0.4], 'VEC3');
        const r = addAccessor(json, f, [0, 0, 0, 1, 0, 0.38, 0, 0.92, 0, -0.7, 0, 0.71], 'VEC4');
        const s = addAccessor(json, f, [1, 1, 1, -1, 1, 1, 2, 2, 2], 'VEC3');
        const hostIndex = json.nodes!.length;
        json.nodes!.push({ name: 'instHost', mesh: 0,
            extensions: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: t, ROTATION: r, SCALE: s } } } });
        json.scenes![0].nodes!.push(hostIndex);
        const asset = await loader.parseAsync(toGLB(json, f.bin));
        const instance = asset.instantiate();
        const host = findDeep(instance.root, 'instHost');
        // Anchor keeps the node transform; three instances hang below it and carry all renderers.
        const instances = host.children.filter((child) => child.name.includes('__inst_'));
        expect(instances.length).toBe(3);
        const renderers = instances.map((node) => node.getComponent('cc.MeshRenderer') as import('../../src').MeshRenderer);
        expect(renderers.every((renderer) => renderer && renderer.mesh === asset.meshes[0])).toBe(true);
        expect(host.getComponent('cc.MeshRenderer')).toBeNull();
        const first = instances[0].position;
        expect(new Vec3(first.x, first.y, first.z).equals(new Vec3(-0.4, 0.2, 0.1))).toBe(true);
        // Negative-scale instance keeps its transform; winding correction runs in GLTFWinding.
        expect(instances[1].scale.x).toBeLessThan(0);
        instance.dispose(); asset.destroy();
    });

    test('instancing validation rejects count mismatches and bad accessor types', async () => {
        // count mismatch: TRANSLATION 3 instances vs ROTATION 2
        const mismatch = addChannelsToFixture({ TRANSLATION: { values: [0, 0, 0, 1, 1, 1, 2, 2, 2] },
            ROTATION: { values: [0, 0, 0, 1, 0, 0, 0, 1] } });
        await expect(loader.parseAsync(mismatch.glb)).rejects.toMatchObject({ code: 'GLTF_EXTENSION_INVALID' });
        // ROTATION declared as VEC3 (wrong vector type)
        const wrongType = addChannelsToFixture({ TRANSLATION: { values: [0, 0, 0] }, ROTATION: { values: [0, 0, 0], type: 'VEC3' } });
        await expect(loader.parseAsync(wrongType.glb)).rejects.toMatchObject({ code: 'GLTF_EXTENSION_INVALID' });
        // zero quaternion fails at the resolveData snapshot during parse
        const zeroQuat = addChannelsToFixture({ ROTATION: { values: [0, 0, 0, 0] } });
        await expect(loader.parseAsync(zeroQuat.glb)).rejects.toMatchObject({ code: 'GLTF_EXTENSION_INVALID' });
    });
});

function findDeep (root: import('../../src').Node, name: string): import('../../src').Node {
    const results: import('../../src').Node[] = [];
    const walk = (node: import('../../src').Node): void => {
        if (node.name.startsWith(name)) { results.push(node); }
        node.children.forEach(walk);
    };
    walk(root);
    if (!results.length) { throw new Error(`node ${name} not found`); }
    return results[0];
}

/** Appends a float accessor (with 4-byte-aligned view) to a fixture's binary payload. */
function addAccessor (json: GLTFDocument, f: ReturnType<typeof fixture>, values: number[], type: 'VEC3' | 'VEC4'): number {
    const width = type === 'VEC3' ? 3 : 4;
    const bytes = new Uint8Array(new Float32Array(values).buffer);
    const pad = (4 - (f.bin.byteLength % 4)) % 4;
    const merged = new Uint8Array(f.bin.byteLength + pad + bytes.byteLength);
    merged.set(new Uint8Array(f.bin), 0);
    merged.set(bytes, f.bin.byteLength + pad);
    const view = json.bufferViews!.length;
    json.bufferViews!.push({ buffer: 0, byteOffset: f.bin.byteLength + pad, byteLength: bytes.byteLength });
    json.buffers![0].byteLength = merged.byteLength;
    (f as { bin: ArrayBuffer }).bin = merged.buffer;
    const index = json.accessors!.length;
    json.accessors!.push({ bufferView: view, componentType: 5126, count: values.length / width, type });
    return index;
}

function addChannelsToFixture (channels: Record<string, { values: number[]; type?: 'VEC3' | 'VEC4' }>): { glb: ArrayBuffer } {
    const f = fixture();
    const json = f.json;
    json.extensionsUsed = ['EXT_mesh_gpu_instancing'];
    const attributes: Record<string, number> = {};
    for (const [channel, spec] of Object.entries(channels)) {
        const type = spec.type ?? (channel === 'ROTATION' ? 'VEC4' : 'VEC3');
        attributes[channel] = addAccessor(json, f, spec.values, type);
    }
    const hostIndex = json.nodes!.length;
    json.nodes!.push({ name: 'instHost', mesh: 0, extensions: { EXT_mesh_gpu_instancing: { attributes } } });
    json.scenes![0].nodes!.push(hostIndex);
    return { glb: toGLB(json, f.bin) };
}
