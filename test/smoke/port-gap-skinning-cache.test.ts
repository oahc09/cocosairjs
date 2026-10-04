import { skinnedTriangle, triangleSkeleton } from '../fixtures/skinning/geometry';
import { Mat4, Vec3, gfx } from '../../src';

describe('port skinning bounds: same native asset reuse and mutation', () => {
    test('reset different geometry on the same mesh invalidates the cached bone bounds', () => {
        const mesh = skinnedTriangle();
        const skeleton = triangleSkeleton();
        const original = mesh.getBoneSpaceBounds(skeleton);
        expect(mesh.getBoneSpaceBounds(skeleton)).toBe(original);
        expect(original[0]!.center.x).toBe(0.5);
        expect(original[1]).toBeNull();
        const moved = skinnedTriangle(10);
        mesh.reset({ struct: moved.struct, data: moved.data });
        const updated = mesh.getBoneSpaceBounds(skeleton);
        expect(updated).not.toBe(original);
        expect(updated[0]!.center.x).toBe(10.5);
        expect(updated[0]!.halfExtents.x).toBe(1.5);
        expect(mesh.getBoneSpaceBounds(skeleton)).toBe(updated);
        mesh.destroy(); moved.destroy(); skeleton.destroy();
    });

    test('changing bindpose data behind a cached skeleton hash recomputes actual bounds', () => {
        const mesh = skinnedTriangle();
        const skeleton = triangleSkeleton();
        const original = mesh.getBoneSpaceBounds(skeleton);
        const oldHash = skeleton.hash;
        Mat4.fromTranslation(skeleton.bindposes[0], new Vec3(0.0001, 0, 0));
        // Native skeleton.hash is cached; bounds must not trust it as a data generation.
        expect(skeleton.hash).toBe(oldHash);
        const updated = mesh.getBoneSpaceBounds(skeleton);
        expect(updated).not.toBe(original);
        expect(updated[0]!.center.x).toBeCloseTo(0.5001, 5);
        mesh.destroy(); skeleton.destroy();
    });

    test.each([9, -1, 0.5, NaN])('weighted invalid joint %s fails with an actionable native boundary diagnostic', (joint) => {
        const mesh = skinnedTriangle(0, joint);
        const skeleton = triangleSkeleton();
        expect(() => mesh.getBoneSpaceBounds(skeleton)).toThrow('AIR_E_SKINNING_JOINT_INDEX');
        // A rejected calculation must not poison the next lookup with a partial cached array.
        expect(() => mesh.getBoneSpaceBounds(skeleton)).toThrow('AIR_E_SKINNING_JOINT_INDEX');
        mesh.destroy(); skeleton.destroy();
    });

    test.each([-1, NaN, Infinity])('weighted invalid value %s reports weight rather than a bound failure', (weight) => {
        const mesh = skinnedTriangle(0, 0, weight), skeleton = triangleSkeleton();
        expect(() => mesh.getBoneSpaceBounds(skeleton)).toThrow('AIR_E_SKINNING_WEIGHT');
        mesh.destroy(); skeleton.destroy();
    });

    test('nonfinite used bindpose rejects, while an unused bindpose remains irrelevant', () => {
        const mesh = skinnedTriangle(), skeleton = triangleSkeleton();
        skeleton.bindposes[1].m00 = Infinity;
        expect(mesh.getBoneSpaceBounds(skeleton)[1]).toBeNull();
        skeleton.bindposes[0].m00 = Infinity;
        expect(() => mesh.getBoneSpaceBounds(skeleton)).toThrow('AIR_E_SKINNING_BINDPOSE');
        mesh.destroy(); skeleton.destroy();
    });

    test('partial skin attributes produce a layout diagnostic with resource context', () => {
        const mesh = skinnedTriangle(), skeleton = triangleSkeleton();
        const struct = { ...mesh.struct, vertexBundles: mesh.struct.vertexBundles.map((bundle) => ({
            ...bundle, attributes: bundle.attributes.filter((attribute) => attribute.name !== gfx.AttributeName.ATTR_WEIGHTS),
        })) };
        mesh.reset({ struct, data: mesh.data });
        try { mesh.getBoneSpaceBounds(skeleton); throw new Error('expected validation failure'); }
        catch (error) {
            expect(error.code).toBe('AIR_E_SKINNING_ATTRIBUTE_LAYOUT');
            expect(error.resource).toBe(mesh.name || mesh.uuid);
            expect(error.location).toContain('primitive 0');
        }
        mesh.destroy(); skeleton.destroy();
    });
});
