import { createPrimitiveGeometry, utils, Mesh, primitives as primitive } from '../../src';
import type { AirPrimitiveDescriptor } from '../../src/air/primitive-geometry';

describe('named primitive descriptors preserve native geometry', () => {
    test.each(['box', 'sphere', 'cylinder', 'cone'] as const)('%s default geometry is byte-for-byte native data', (type) => {
        const geometry = createPrimitiveGeometry({ type });
        expect(geometry).toEqual(primitive[type]());
        const mesh = utils.createMesh(geometry);
        expect(mesh).toBeInstanceOf(Mesh);
        mesh.destroy();
    });
    test('custom box channels and segments preserve native data and caller options', () => {
        const options = Object.freeze({ width: 2, height: 3, length: 4, widthSegments: 2, heightSegments: 3, lengthSegments: 4, includeUV: false });
        expect(createPrimitiveGeometry({ type: 'box', ...options })).toEqual(primitive.box({ ...options }));
    });
    test('custom sphere, cylinder and cone match each native positional signature', () => {
        expect(createPrimitiveGeometry({ type: 'sphere', radius: 2, segments: 7 })).toEqual(primitive.sphere(2, { segments: 7 }));
        const options = { radialSegments: 7, heightSegments: 3, capped: false, arc: Math.PI };
        expect(createPrimitiveGeometry({ type: 'cylinder', radiusTop: 0, radiusBottom: 2, height: 3, ...options }))
            .toEqual(primitive.cylinder(0, 2, 3, options));
        expect(createPrimitiveGeometry({ type: 'cone', radius: 2, height: 3, ...options })).toEqual(primitive.cone(2, 3, options));
    });
    test.each([
        null, { type: 'pyramid' }, { type: 'box', radius: 1 }, { type: 'box', width: 0 },
        { type: 'sphere', radius: NaN }, { type: 'sphere', segments: 2 }, { type: 'sphere', segments: 3.5 },
        { type: 'cone', height: Infinity }, { type: 'cylinder', radiusTop: -1 },
        { type: 'cylinder', radiusTop: 0, radiusBottom: 0 }, { type: 'cone', capped: 'false' },
        { type: 'cone', arc: 0 }, { type: 'cone', arc: 7 }, { type: 'box', widthSegments: 1025 },
        { type: 'sphere', segments: 1024 }, { type: 'box', widthSegments: 1024, heightSegments: 1024 },
    ])('invalid descriptor %j fails before allocating native geometry', (descriptor) => {
        try { createPrimitiveGeometry(descriptor as AirPrimitiveDescriptor); throw new Error('unexpected success'); }
        catch (error) { expect(error).toMatchObject({ code: 'AIR_E_PRIMITIVE_DESCRIPTOR' }); }
    });
});
