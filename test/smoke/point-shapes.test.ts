import { sampleAirImageShape, sampleAirTriangleShape } from '../../src/air/rendering/point-shapes';
import { packMorphShapes } from '../../src/air/rendering/morph-data';

test('GPU atlas retains ordered HDR colors and an envelope covering every shape and billboard offset', () => {
    const targets = [
        { positions: new Float32Array([-2, 0, 1, 0, 1, 0]), colors: new Float32Array([4, 1, 0.25, 0, 1, 0]) },
        { positions: new Float32Array([2, 2, 3, 0, -1, 0]), colors: new Float32Array([0, 0, 1, 1, 0, 0]) },
    ];
    const before = targets.map((t) => t.positions.slice());
    const packed = packMorphShapes(targets, 0.2, true, 4, 4096);
    expect([packed.width, packed.height, packed.count]).toEqual([4, 1, 2]);
    expect(Array.from(packed.colors.slice(0, 4))).toEqual([4, 1, 0.25, 0]); // alpha lane stores oct normal Y
    for (let shape = 0; shape < 2; shape++)
        for (let point = 0; point < 2; point++)
            for (let axis = 0; axis < 3; axis++) {
                const center = packed.envelopes[point * 6 + axis],
                    extent = packed.envelopes[point * 6 + axis + 3];
                const position = targets[shape].positions[point * 3 + axis];
                expect(center + packed.positions[(shape * 2 + point) * 4 + axis] * extent).toBeCloseTo(position, 5);
                expect(center - extent / 2).toBeLessThan(position - 0.19);
                expect(center + extent / 2).toBeGreaterThan(position + 0.19);
            }
    targets.forEach((t, i) => expect(t.positions).toEqual(before[i]));
});

test('shape mismatches, float overflow, texture limits and allocation budget fail before GPU creation', () => {
    const a = { positions: new Float32Array([0, 0, 0]), colors: new Float32Array([1, 1, 1]) };
    expect(() => packMorphShapes([a, { ...a, colors: new Float32Array(0) }], 1, false, 16, 4096)).toThrow(/target 1/);
    expect(() => packMorphShapes([a], 1, false, 16, 32)).toThrow(/maxGpuBytes/);
    expect(() => packMorphShapes([a, a], 1, false, 1, 4096)).toThrow(/texture limit/);
    expect(() =>
        packMorphShapes([{ ...a, positions: new Float32Array([Infinity, 0, 0]) }], 1, false, 16, 4096),
    ).toThrow(/finite/);
});

test('surface normals use the spare atlas lanes without adding a texture or accepting zero normals', () => {
    const a = {
        positions: new Float32Array([0, 0, 0]),
        colors: new Float32Array([0.5, 0.5, 0.5]),
        normals: new Float32Array([0, 0, -1]),
    };
    const packed = packMorphShapes([a], 0.1, true, 16, 1024);
    expect(packed.textureBytes).toBe(32);
    expect(packed.positions[3]).toBe(1);
    expect(packed.colors[3]).toBe(1);
    expect(() => packMorphShapes([{ ...a, normals: new Float32Array(3) }], 0.1, true, 16, 1024)).toThrow(/zero normal/);
});

test('image sampling respects alpha, aspect, Y direction, linear color and seed without mutating pixels', () => {
    const rgba = new Uint8Array([128, 255, 0, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const before = rgba.slice();
    const options = { rgba, width: 2, height: 2, count: 32, size: 2, seed: 123 };
    const shape = sampleAirImageShape(options);
    expect(sampleAirImageShape(options)).toEqual(shape);
    expect(rgba).toEqual(before);
    for (let i = 0; i < 32; i++) {
        expect(shape.positions[i * 3]).toBeGreaterThanOrEqual(-1);
        expect(shape.positions[i * 3]).toBeLessThan(0);
        expect(shape.positions[i * 3 + 1]).toBeGreaterThan(0);
        expect(shape.positions[i * 3 + 1]).toBeLessThanOrEqual(1);
        expect(shape.colors[i * 3]).toBeCloseTo(0.2158605, 6);
        expect(shape.colors[i * 3 + 1]).toBe(1);
    }
});

test('mesh sampling uses surface area and barycentric colors, not equal face counts', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 12, 0, 0, 10, 2, 0]);
    const colors = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const result = sampleAirTriangleShape({
        positions,
        colors,
        indices: new Uint16Array([0, 1, 2, 3, 4, 5]),
        count: 2000,
        seed: 45,
    });
    let largeFace = 0;
    for (let i = 0; i < 2000; i++) {
        if (result.positions[i * 3] >= 10) largeFace++;
        expect(result.positions[i * 3 + 2]).toBe(0);
        expect(result.normals![i * 3 + 2]).toBeCloseTo(1, 6);
        expect(result.colors[i * 3] + result.colors[i * 3 + 1] + result.colors[i * 3 + 2]).toBeCloseTo(1, 6);
    }
    // Areas are 0.5 and 2; an equally weighted face picker lands near 1000 and fails.
    expect(largeFace).toBeGreaterThan(1500);
    expect(largeFace).toBeLessThan(1700);
});

test('empty images, bad indices and wholly degenerate meshes fail explicitly', () => {
    expect(() => sampleAirImageShape({ rgba: new Uint8Array(4), width: 1, height: 1, count: 1 })).toThrow(
        /eligible pixels/,
    );
    expect(() => sampleAirTriangleShape({ positions: new Float32Array(9), count: 1 })).toThrow(/non-degenerate/);
    expect(() =>
        sampleAirTriangleShape({ positions: new Float32Array(9), indices: new Uint16Array([0, 1, 3]), count: 1 }),
    ).toThrow(/index out of range/);
});
