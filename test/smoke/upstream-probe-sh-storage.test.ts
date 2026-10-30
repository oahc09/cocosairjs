import { SH } from '../../src/cocos/gi/light-probe/sh';
import { Vec3, Quat } from '../../src/cocos/core';
import { UBOSHEnum } from '../../src/cocos/rendering/define';
const reference = require('../../tools/verify/upstream-probe-sh-reference.js');
const epsilon = 1e-5;
const close = (a: number, b: number): void => {
    expect(Math.abs(a - b)).toBeLessThanOrEqual(epsilon);
};
const vectors = (coefficients: number[][]): Vec3[] => coefficients.map((rgb) => new Vec3(rgb[0], rgb[1], rgb[2]));

describe('U08-C independent canonical SH to actual Cocos storage (CPU, not browser evidence)', () => {
    test('all nine terms agree with engine UBO packing and evaluation before HDR exposure/ringing', () => {
        const radiance = Array.from({ length: 9 }, (_, i) => [0.13 * (i + 1), -0.07 * i, 0.19 - 0.01 * i]);
        const coefficients = reference.toCocosCoefficients(radiance);
        const actual = new Float32Array(UBOSHEnum.COUNT);
        SH.updateUBOData(actual, UBOSHEnum.SH_LINEAR_CONST_R_OFFSET, vectors(coefficients));
        const expected = reference.packCocosUBO(coefficients);
        expect(Array.from(actual)).toEqual(Array.from(expected));
        expect(actual.length).toBe(28);
        const irradiance = reference.convolveCosine(radiance);
        for (const ray of [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
            [2, -3, 4],
        ]) {
            const n = reference.unit(ray);
            const evaluated = SH.shaderEvaluate(new Vec3(n[0], n[1], n[2]), vectors(coefficients));
            const analytical = reference.evaluate(irradiance, n).map((v: number) => v / Math.PI);
            [evaluated.x, evaluated.y, evaluated.z].forEach((v, c) => close(v, analytical[c]));
        }
    });
    test('native cosine convolution band multipliers match π, 2π/3, π/4 within frozen CPU tolerance', () => {
        const input = Array.from({ length: 9 }, () => [1, 0.5, 2]);
        const actual = SH.convolveCosine(vectors(input));
        const expected = reference.convolveCosine(input);
        actual.forEach((v, i) => [v.x, v.y, v.z].forEach((value, c) => close(value, expected[i][c])));
    });
    test('native basis order matches canonical y,z,x and quadratic order, allowing rounded constants', () => {
        const ray = reference.unit([1, 2, -3]);
        reference
            .basis(ray)
            .forEach((v: number, i: number) => close(SH.evaluateBasis(i, new Vec3(ray[0], ray[1], ray[2])), v));
    });
    test('Cocos camera Euler table maps local -Z rays differently from GL cube face upload +Z', () => {
        const eulers = [
            [0, -90, 0],
            [0, 90, 0],
            [90, 0, 0],
            [-90, 0, 0],
            [0, 0, 0],
            [0, 180, 0],
        ];
        const fs = require('node:fs');
        const path = require('node:path');
        const source = fs.readFileSync(
            path.join(__dirname, '../../src/cocos/render-scene/scene/reflection-probe.ts'),
            'utf8',
        );
        const table = source.match(/const cameraDir: Vec3\[\] = \[([\s\S]*?)\];/)![1];
        const actualTable = [...table.matchAll(/v3\(([-\d]+), ([-\d]+), ([-\d]+)\)/g)].map((row) =>
            row.slice(1).map(Number),
        );
        expect(actualTable).toEqual(eulers);
        eulers.forEach((euler, face) => {
            const quaternion = new Quat();
            Quat.fromEuler(quaternion, euler[0], euler[1], euler[2]);
            const ray = new Vec3(0.3, -0.2, -1);
            Vec3.normalize(ray, ray);
            Vec3.transformQuat(ray, ray, quaternion);
            const expected = reference.faceDirection(face, 0.3, -0.2, 'cocos-camera');
            [ray.x, ray.y, ray.z].forEach((v, c) => close(v, expected[c]));
        });
    });
});
