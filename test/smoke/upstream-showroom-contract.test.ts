import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { validateControls, uvRows } from '../../examples/material-inspection-showroom/src/controls';
import { canvasToClientPoint, clientToCanvasPoint } from '../../examples/shared/canvas-coordinates';
const defaults = { uvScale: 1, uvRotation: 0, iridescence: 0.7, ior: 1.3, thicknessMin: 100, thicknessMax: 400 };

describe('U09 CPU input/source contracts, not browser acceptance', () => {
    test('film IOR accepts all specification boundary values without an invented ceiling', () => {
        for (const ior of [1, 1.2, 1.3, 2.33334, 2.5, 9])
            expect(() => validateControls({ ...defaults, ior })).not.toThrow();
    });
    test.each(['uvScale', 'uvRotation', 'iridescence', 'ior', 'thicknessMin', 'thicknessMax'])(
        'rejects nonfinite %s',
        (key) => {
            for (const value of [NaN, Infinity, -Infinity])
                expect(() => validateControls({ ...defaults, [key]: value })).toThrow();
        },
    );
    test('rejects wrong ranges without mutating the preceding good state', () => {
        const copy = { ...defaults };
        for (const delta of [
            { ior: 0.99 },
            { uvScale: 0 },
            { iridescence: -1 },
            { iridescence: 2 },
            { thicknessMin: -1 },
            { thicknessMin: 401 },
        ])
            expect(() => validateControls({ ...copy, ...delta })).toThrow();
        expect(copy).toEqual(defaults);
    });
    test('UV rows agree with independent trigonometric transform at quarter turn', () => {
        expect(uvRows(defaults)).toEqual([
            [1, 0, 0, 0],
            [-0, 1, 0, 0],
        ]);
        const [u, v] = uvRows({ ...defaults, uvRotation: Math.PI / 2, uvScale: 2 });
        expect(u[0]).toBeCloseTo(0, 12);
        expect(u[1]).toBe(2);
        expect(v[0]).toBe(-2);
        expect(v[1]).toBeCloseTo(0, 12);
    });
    test.each([1, 2])('pointer coordinates round-trip actual CSS/drawing-buffer ratio at DPR %s', (dpr) => {
        const canvas = {
            width: 640 * dpr,
            height: 320 * dpr,
            getBoundingClientRect: () => ({ left: 100, top: 80, bottom: 240, width: 320, height: 160 }),
        } as HTMLCanvasElement;
        const pixel = clientToCanvasPoint(canvas, 180, 120)!;
        expect(pixel).toEqual({ x: 160 * dpr, y: 240 * dpr });
        expect(canvasToClientPoint(canvas, pixel.x, pixel.y)).toEqual({ x: 180, y: 120 });
    });
    test('all fixed local assets match their byte manifest and retain twelve material definitions', () => {
        const folder = join(__dirname, '../../examples/material-inspection-showroom/assets');
        const manifest = JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8'));
        expect(manifest.license).toBe('MIT');
        expect(manifest.externalRequests).toBe(false);
        for (const item of manifest.assets) {
            const bytes = readFileSync(join(folder, item.path));
            expect(bytes.length).toBe(item.bytes);
            expect(createHash('sha256').update(bytes).digest('hex')).toBe(item.sha256);
        }
        const gltf = JSON.parse(readFileSync(join(folder, 'inspection-rig.gltf'), 'utf8'));
        expect(gltf.materials).toHaveLength(12);
        expect(gltf.skins).toHaveLength(1);
        expect(gltf.animations[0].name).toBe('move');
        expect(gltf.images.map((image: { uri: string }) => image.uri)).toEqual(['checker.png']);
        expect(gltf.meshes[0].primitives).toHaveLength(1);
        for (const material of gltf.materials)
            expect(material.extensions.KHR_materials_iridescence.iridescenceIor).toBe(1.3);
    });
});
