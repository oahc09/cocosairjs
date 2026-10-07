/** Lead regression cases: production pure helpers, no browser or output/ dependency. */
import { validateGeometryUpdate, planeFromRays } from '../../examples/interactive-geometry/src/geometry-contract';

const capacity = { maxSubMeshVertices: 4, maxSubMeshIndices: 6 };
const valid = () => ({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices16: [0, 1, 2] });

describe('IER-04 independent geometry review', () => {
    test('accepts legal geometry before testing rejected updates', () => {
        expect(validateGeometryUpdate(valid(), capacity)).toEqual({ ok: true, errors: [] });
    });

    test.each([-1, 0.5, NaN, Infinity])('rejects invalid index %s before an SDK call', (index) => {
        expect(validateGeometryUpdate({ ...valid(), indices16: [0, 1, index] }, capacity).ok).toBe(false);
    });

    test('rejects non-finite UV coordinates', () => {
        expect(validateGeometryUpdate({ ...valid(), uvs: [0, 0, 1, NaN, 0, 1] }, capacity).ok).toBe(false);
    });

    test('rejects simultaneous 16-bit and 32-bit indices', () => {
        expect(validateGeometryUpdate({ ...valid(), indices32: [0, 1, 2] }, capacity).ok).toBe(false);
    });

    test.each([NaN, Infinity, -1, 1.5])('rejects invalid capacity %s', (maxSubMeshVertices) => {
        expect(validateGeometryUpdate(valid(), { ...capacity, maxSubMeshVertices }).ok).toBe(false);
    });

    test('invalid geometry returns a structured rejection without throwing', () => {
        for (const value of [null, undefined, {}, { normals: [0, 0, 1] }]) {
            let result: ReturnType<typeof validateGeometryUpdate> | undefined;
            expect(() => { result = validateGeometryUpdate(value as never, capacity); }).not.toThrow();
            expect(result?.ok).toBe(false);
        }
    });

    test('collinear rays cannot determine a unique cut plane', () => {
        const plane = planeFromRays(
            { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } },
            { origin: { x: 0, y: 0, z: 1 }, direction: { x: 0, y: 0, z: 1 } },
        );
        expect('error' in plane).toBe(true);
    });
});

describe('IER-04 raw projection evidence', () => {
    const { recomputeErrors } = require('../../tools/verify/interactive-geometry-browser.cjs');
    const record = () => {
        const positions = [-0.1, 0, 0, 0.1, 0, 0, -0.1, 0, 0, 0.1, 0, 0];
        const upload = () => ({ positions: [...positions], indices16: [0, 1, 2, 1, 3, 2], nodeTranslation: [0, 0, 0] });
        return { modelState: { raw: {
            camera: { viewProjection: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
                viewport: { x: 0, y: 0, width: 1, height: 1 }, backing: { width: 640, height: 400 }, cssSize: { width: 640, height: 400 } },
            uploads: { stroke: upload(), cut: upload(), blade: upload() },
            cssLine: [{ x: 288, y: 200 }, { x: 352, y: 200 }],
            worldHits: [{ x: -0.1, y: 0, z: 0 }, { x: 0.1, y: 0, z: 0 }],
        } } };
    };

    test('finite aligned uploads are accepted before malformed inputs', () => {
        const v = recomputeErrors(record());
        expect(v.ok).toBe(true);
        expect(v.cut).toEqual([0, 0]);
    });

    test.each([NaN, Infinity])('rejects non-finite uploaded vertex %s', (value) => {
        const r = record();
        r.modelState.raw.uploads.cut.positions[0] = value;
        expect(recomputeErrors(r).ok).toBe(false);
    });

    test('rejects a non-finite camera matrix', () => {
        const r = record();
        r.modelState.raw.camera.viewProjection[0] = NaN;
        expect(recomputeErrors(r).ok).toBe(false);
    });

    test('a broad cut quad must not substitute its centerline for cut vertices', () => {
        const r = record();
        r.modelState.raw.uploads.cut.positions = [-0.1, -0.1, 0, 0.1, -0.1, 0, -0.1, 0.1, 0, 0.1, 0.1, 0];
        const v = recomputeErrors(r);
        expect(v.ok === false || Math.max(...v.cut) > 0.15).toBe(true);
    });
});
