/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual extracted RigidBody source with an explicitly injected rejecting adapter.
 * This isolates component-cache transaction order; it is not a native/WASM fixture.
 */
import { RigidBody } from '../../../src/cocos/physics/framework/components/rigid-body';
import { selector } from '../../../src/cocos/physics/framework/physics-selector';
import { Vec3 } from '../../../src/cocos/core/math/vec3';

const rejection = Object.assign(new Error('fixture native-side validation rejection'), {
    code: 'AIR_E_BOX3D_ARGUMENT',
});
const scalarCases = [
    ['type', 'setType', 999],
    ['mass', 'setMass', NaN],
    ['allowSleep', 'setAllowSleep', 0],
    ['linearDamping', 'setLinearDamping', Infinity],
    ['angularDamping', 'setAngularDamping', NaN],
    ['useGravity', 'useGravity', 'false'],
    ['group', 'setGroup', NaN],
] as const;

function select(id: string) {
    (selector as unknown as { id: string }).id = id;
}
const originalId = selector.id;
afterAll(() => select(originalId));

describe('actual Box3D component cache rejection transaction, injected adapter only', () => {
    test.each(scalarCases)('%s retains its last valid value after delegate rejection', (key, method, value) => {
        select('box3d');
        const body = new RigidBody() as any;
        const before = body[key];
        const calls: unknown[] = [];
        body._body = {
            getGroup: () => 1,
            [method]: (arg: unknown) => {
                calls.push(arg);
                throw rejection;
            },
        };
        expect(() => {
            body[key] = value;
        }).toThrow(rejection);
        expect(calls).toHaveLength(1);
        expect(body[key]).toBe(before);
    });
    test.each(['linearFactor', 'angularFactor'])('%s preserves its cached vector and identity on rejection', (key) => {
        select('box3d');
        const body = new RigidBody() as any;
        const reference = body[key];
        const before = [reference.x, reference.y, reference.z];
        const method = key === 'linearFactor' ? 'setLinearFactor' : 'setAngularFactor';
        body._body = {
            [method]: () => {
                throw rejection;
            },
        };
        expect(() => {
            body[key] = new Vec3(1, 0.5, 1);
        }).toThrow(rejection);
        expect(body[key]).toBe(reference);
        expect([reference.x, reference.y, reference.z]).toEqual(before);
    });
});

test('unmodified non-Box3D setter order remains an explicit compatibility control', () => {
    select('cannon.js');
    const body = new RigidBody() as any;
    let observed: number | undefined;
    body._body = {
        setMass: (arg: number) => {
            observed = body.mass;
            expect(arg).toBe(2);
        },
    };
    body.mass = 2;
    expect(observed).toBe(2);
    expect(body.mass).toBe(2);
});

test('existing public nonpositive mass normalization is retained without a live adapter', () => {
    select('box3d');
    const body = new RigidBody();
    body.mass = 0;
    expect(body.mass).toBe(0.0001);
});

const acceptedCases = [
    ['type', 'setType', 2],
    ['mass', 'setMass', 2],
    ['allowSleep', 'setAllowSleep', false],
    ['linearDamping', 'setLinearDamping', 0.25],
    ['angularDamping', 'setAngularDamping', 0.5],
    ['useGravity', 'useGravity', false],
    ['group', 'setGroup', 2],
] as const;

describe.each(['box3d', 'builtin', 'cannon.js', 'bullet', 'physx'])('%s setter commit compatibility', (backend) => {
    test.each(acceptedCases)('%s passes its argument and preserves the intended cache order', (key, method, value) => {
        select(backend);
        const body = new RigidBody() as any;
        const before = body[key];
        let observed: unknown;
        let calls = 0;
        body._body = {
            getGroup: () => 1,
            [method]: (arg: unknown) => {
                ++calls;
                observed = body[key];
                expect(arg).toBe(value);
            },
        };
        body[key] = value;
        expect(calls).toBe(1);
        expect(observed).toBe(backend === 'box3d' ? before : value);
        expect(body[key]).toBe(value);
    });
    test.each(['linearFactor', 'angularFactor'])('%s preserves vector identity and intended order', (key) => {
        select(backend);
        const body = new RigidBody() as any;
        const reference = body[key];
        const method = key === 'linearFactor' ? 'setLinearFactor' : 'setAngularFactor';
        let observed: number[] = [];
        body._body = {
            [method]: (arg: Vec3) => {
                observed = [reference.x, reference.y, reference.z];
                expect([arg.x, arg.y, arg.z]).toEqual([0, 1, 0]);
            },
        };
        body[key] = new Vec3(0, 1, 0);
        expect(observed).toEqual(backend === 'box3d' ? [1, 1, 1] : [0, 1, 0]);
        expect(body[key]).toBe(reference);
        expect([reference.x, reference.y, reference.z]).toEqual([0, 1, 0]);
    });
});
