/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual engine public entries, scheduler/NodeActivator, EventTarget and deferred destruction.
 * Shape/physics-world delegates are explicit call-count mocks, NOT native physics evidence.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { relative } from 'node:path';
import { Node } from '../../../src/cocos/scene-graph/node';
import { Component } from '../../../src/cocos/scene-graph/component';
import { CCObject, isValid } from '../../../src/cocos/core/data/object';
import { director } from '../../../src/cocos/game/director';
import { Vec3 } from '../../../src/cocos/core/math/vec3';
import * as js from '../../../src/cocos/core/utils/js';
import { PhysicsSystem } from '../../../src/cocos/physics/framework/physics-system';
import { PhysicsMaterial } from '../../../src/cocos/physics/framework/assets/physics-material';
import { BoxCollider } from '../../../src/cocos/physics/framework/components/colliders/box-collider';
import { RigidBody } from '../../../src/cocos/physics/framework/components/rigid-body';
import { RigidBody2D } from '../../../src/cocos/physics-2d/framework/components/rigid-body-2d';
import { UITransform } from '../../../src/cocos/2d/framework/ui-transform';
import { selector } from '../../../src/cocos/physics/framework/physics-selector';
import { registerMutationGuard, MutationGuardLease } from '../../../src/cocos/core/data/mutation-guard';

const code = 'AIR_E_TEST_MUTATION';
const originalId = selector.id;
const originalWorld = selector.physicsWorld;
const selection = selector as any;
const rows: any[] = [];
let current: any;
let leases: MutationGuardLease[] = [];
let nodes: Node[] = [];
let materialBaseline = new Set<PhysicsMaterial>();
let colliders: any[] = [];
const guard = (...targets: object[]) => {
    const lease = registerMutationGuard(targets, { code, message: 'Explicit actual-engine fixture fence' });
    leases.push(lease);
    return lease;
};
const node = (name = 'fixture') => {
    const n = new Node(name);
    nodes.push(n);
    return n;
};
const record = (name: string, actual: unknown, expected: unknown) => {
    const passed = JSON.stringify(actual) === JSON.stringify(expected);
    current.checks.push({ name, passed, actual, expected });
};
const attempt = (fn: () => unknown) => {
    let error: any;
    try {
        fn();
    } catch (e) {
        error = e;
    }
    const result = { rejected: error?.code === code, error: error ? String(error) : null, code: error?.code ?? null };
    current.attempts.push(result);
    return result;
};
const refused = (fn: () => unknown) => {
    const a = attempt(fn);
    record('entry rejects with fixture guard code', a.rejected, true);
};
const control = (name: string, run: () => void) =>
    test(name, () => {
        current = { name, checks: [], attempts: [] };
        rows.push(current);
        try {
            run();
        } catch (e) {
            current.fixtureFailure = String(e);
            throw e;
        }
        current.status = current.checks.every((x: any) => x.passed)
            ? 'PASS_ACTUAL_ENGINE_SOURCE'
            : 'RED_ACTUAL_ENGINE_SOURCE';
        expect(current.checks.filter((x: any) => !x.passed)).toEqual([]);
    });
beforeEach(() => {
    materialBaseline = new Set(PhysicsMaterial.allMaterials);
});
afterEach(() => {
    for (const lease of leases) lease.dispose();
    leases = [];
    jest.restoreAllMocks();
    selection.id = originalId;
    selection.physicsWorld = originalWorld;
    for (const collider of colliders) collider.sharedMaterial?.targetOff(collider);
    colliders = [];
    for (const n of nodes)
        if (isValid(n, true)) {
            director._nodeActivator.activateNode(n, false);
            n.destroy();
        }
    nodes = [];
    for (const m of [...PhysicsMaterial.allMaterials]) if (!materialBaseline.has(m) && isValid(m, true)) m.destroy();
    CCObject._deferredDestroy();
});
afterAll(() => {
    const output = process.env.BOX3D_MUTATION_FENCE_RAW;
    if (output)
        writeFileSync(
            output,
            JSON.stringify(
                {
                    scope: 'Actual engine source and real scheduler/EventTarget/deferred destroy. Mock delegates count invocations only; no WASM, no actual World lease registration.',
                    rows,
                    loadedEngineSources: Object.keys(require.cache)
                        .map((path) => ({ path, relative: relative(process.cwd(), path) }))
                        .filter(({ relative: p }) => p.startsWith('src/') || p.startsWith('test/'))
                        .sort((a, b) => a.relative.localeCompare(b.relative))
                        .map(({ path, relative: p }) => ({
                            path: p,
                            sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
                        })),
                },
                null,
                2,
            ) + '\n',
        );
});
function componentFixture(active = true) {
    const counts = { enable: 0, disable: 0, destroy: 0 };
    class Probe extends Component {
        protected onEnable() {
            counts.enable++;
        }
        protected onDisable() {
            counts.disable++;
        }
        protected onDestroy() {
            counts.destroy++;
        }
    }
    const root = node('root'),
        child = node('child');
    root.addChild(child);
    const component = child.addComponent(Probe);
    if (active) director._nodeActivator.activateNode(root, true);
    counts.enable = counts.disable = counts.destroy = 0;
    return { root, child, component, counts };
}
for (const active of [false, true])
    control(`Component.enabled earliest cache/scheduler refusal active=${active}`, () => {
        const { component, counts } = componentFixture(active);
        guard(component);
        refused(() => {
            component.enabled = false;
        });
        record('public enabled unchanged', component.enabled, true);
        record('real callbacks untouched', counts, { enable: 0, disable: 0, destroy: 0 });
    });
control('Component enabled same-value business assignment is fenced', () => {
    const { component } = componentFixture(false);
    guard(component);
    refused(() => {
        component.enabled = true;
    });
});
control('Component.destroy refusal precedes ToDestroy and actual deferred destruction', () => {
    const { component, counts } = componentFixture(true);
    const flags = (component as any)._objFlags;
    guard(component);
    refused(() => component.destroy());
    record('flags unchanged', (component as any)._objFlags, flags);
    record('strict valid before flush', isValid(component, true), true);
    CCObject._deferredDestroy();
    record('valid after actual deferred flush', isValid(component), true);
    record('real lifecycle callbacks untouched', counts, { enable: 0, disable: 0, destroy: 0 });
});
control('Node.active refusal precedes hierarchy and child lifecycle changes', () => {
    const { child, component, counts } = componentFixture(true);
    guard(child);
    refused(() => {
        child.active = false;
    });
    record('active unchanged', child.active, true);
    record('hierarchy unchanged', child.activeInHierarchy, true);
    record('component enabled', component.enabled, true);
    record('callbacks unchanged', counts, { enable: 0, disable: 0, destroy: 0 });
});
control('Node.destroy refusal precedes super scheduling and active=false', () => {
    const { child, counts } = componentFixture(true);
    const flags = (child as any)._objFlags;
    guard(child);
    refused(() => child.destroy());
    record('node flags unchanged', (child as any)._objFlags, flags);
    record('node active unchanged', child.active, true);
    CCObject._deferredDestroy();
    record('valid after deferred flush', isValid(child), true);
    record('callbacks untouched', counts, { enable: 0, disable: 0, destroy: 0 });
});
control('destroyAllChildren prechecks protected later child before scheduling first', () => {
    const parent = node('batch-parent'),
        first = node('first'),
        second = node('protected-later');
    parent.addChild(first);
    parent.addChild(second);
    const before = [first.uuid, second.uuid];
    guard(second);
    refused(() => parent.destroyAllChildren());
    record('first strictly valid', isValid(first, true), true);
    record('later strictly valid', isValid(second, true), true);
    record(
        'children unchanged before flush',
        parent.children.map((n) => n.uuid),
        before,
    );
    CCObject._deferredDestroy();
    record('first survives actual deferred flush', isValid(first), true);
    record('later survives actual deferred flush', isValid(second), true);
    record(
        'children unchanged after flush',
        parent.children.map((n) => n.uuid),
        before,
    );
});
control('destroyAllChildren refuses a guarded receiver before touching unrelated children', () => {
    const parent = node('guarded-parent'),
        child = node('unrelated-child');
    parent.addChild(child);
    guard(parent);
    refused(() => parent.destroyAllChildren());
    record('child remains strictly valid', isValid(child, true), true);
    CCObject._deferredDestroy();
    record('child survives actual deferred flush', isValid(child), true);
});
control('nested controlled descendant is protected by explicit ancestor membership', () => {
    const root = node('root'),
        first = node('first'),
        branch = node('branch'),
        leaf = node('leaf');
    root.addChild(first);
    root.addChild(branch);
    branch.addChild(leaf);
    guard(branch, leaf); // Future owner must register ancestry, not infer it in this neutral registry.
    refused(() => root.destroyAllChildren());
    record(
        'all objects remain strictly valid',
        [first, branch, leaf].map((n) => isValid(n, true)),
        [true, true, true],
    );
    CCObject._deferredDestroy();
    record(
        'all objects survive deferred flush',
        [first, branch, leaf].map((n) => isValid(n)),
        [true, true, true],
    );
});
control('Node category guard refuses custom constructor and requirement getter before either runs', () => {
    let constructors = 0,
        requirements = 0;
    class Probe extends Component {
        constructor() {
            super();
            constructors++;
        }
    }
    Object.defineProperty(Probe, '_requireComponent', {
        get() {
            requirements++;
            return Component;
        },
    });
    const orphan = node('orphan');
    guard(Node.prototype);
    refused(() => orphan.addComponent(Probe));
    record('constructor count', constructors, 0);
    record('requirement getter count', requirements, 0);
    record('component array unchanged', orphan.components.length, 0);
});
for (const [name, Type] of [
    ['3d', RigidBody],
    ['2d', RigidBody2D],
    ['ui', UITransform],
    ['plain', Component],
] as const)
    control(`Node category blocks original addComponent for orphan ${name}`, () => {
        const orphan = node(`orphan-${name}`);
        guard(Node.prototype);
        refused(() => orphan.addComponent(Type as typeof Component));
        record('no attached component', orphan.components.length, 0);
    });
control('Node category refuses before class-name resolution', () => {
    const n = node();
    let reads = 0;
    const name = 'mutation-fence-fixture-class';
    Object.defineProperty(js._nameToClass, name, {
        configurable: true,
        get() {
            reads++;
            return Component;
        },
    });
    try {
        guard(Node.prototype);
        refused(() => n.addComponent(name));
        record('actual class registry read count', reads, 0);
        record('components unchanged', n.components.length, 0);
    } finally {
        delete js._nameToClass[name];
    }
});
control('Node category multi-owner release cannot bypass remaining owner', () => {
    const n = node();
    const a = guard(Node.prototype),
        b = guard(Node.prototype);
    a.dispose();
    refused(() => n.addComponent(Component));
    record('components still absent', n.components.length, 0);
    b.dispose();
    n.addComponent(Component);
    record('unfenced original construction resumes', n.components.length, 1);
});
for (const field of ['friction', 'rollingFriction', 'spinningFriction', 'restitution'] as const)
    control(`PhysicsMaterial ${field} rejects before field or event`, () => {
        const m = new PhysicsMaterial();
        let updates = 0;
        m.on(PhysicsMaterial.EVENT_UPDATE, () => updates++);
        const before = m[field];
        guard(m);
        refused(() => {
            m[field] = 0.25;
        });
        record('coefficient unchanged', m[field], before);
        record('actual event callback count', updates, 0);
    });
control('PhysicsMaterial same-value assignment still refuses while fenced', () => {
    const m = new PhysicsMaterial();
    guard(m);
    refused(() => {
        m.friction = m.friction;
    });
});
control('PhysicsMaterial input coercion is not invoked before guard', () => {
    const m = new PhysicsMaterial();
    let coercions = 0;
    const before = m.friction;
    guard(m);
    refused(() => {
        m.friction = {
            valueOf() {
                coercions++;
                return 0.2;
            },
        } as any;
    });
    record('coercion count', coercions, 0);
    record('material unchanged', m.friction, before);
});
control('PhysicsMaterial.setValues rejects before all four fields/events', () => {
    const m = new PhysicsMaterial();
    const before = [m.friction, m.rollingFriction, m.spinningFriction, m.restitution];
    let updates = 0;
    m.on(PhysicsMaterial.EVENT_UPDATE, () => updates++);
    guard(m);
    refused(() => m.setValues(0.1, 0.2, 0.3, 0.4));
    record('all fields unchanged', [m.friction, m.rollingFriction, m.spinningFriction, m.restitution], before);
    record('update count', updates, 0);
});
control('PhysicsMaterial.destroy refuses before schedule and allMaterials removal', () => {
    const m = new PhysicsMaterial();
    const before = (m as any)._objFlags,
        count = PhysicsMaterial.allMaterials.length;
    guard(m);
    refused(() => m.destroy());
    record('flags unchanged', (m as any)._objFlags, before);
    record('material remains registered', PhysicsMaterial.allMaterials.includes(m), true);
    record('list length', PhysicsMaterial.allMaterials.length, count);
    CCObject._deferredDestroy();
    record('material valid after actual flush', isValid(m), true);
});
control('shared PhysicsMaterial honors two owners and actual listeners across release', () => {
    const m = new PhysicsMaterial();
    let aCalls = 0,
        bCalls = 0;
    m.on(PhysicsMaterial.EVENT_UPDATE, () => aCalls++);
    m.on(PhysicsMaterial.EVENT_UPDATE, () => bCalls++);
    const a = guard(m),
        b = guard(m),
        before = m.friction;
    a.dispose();
    refused(() => {
        m.friction = 0.2;
    });
    record('field unchanged', m.friction, before);
    record('both listeners untouched', [aCalls, bCalls], [0, 0]);
    b.dispose();
    m.friction = 0.3;
    record('both original listeners resume', [aCalls, bCalls], [1, 1]);
});
function colliderFixture() {
    const c = new BoxCollider() as any,
        old = new PhysicsMaterial(),
        next = new PhysicsMaterial();
    colliders.push(c);
    let delegates = 0;
    c._shape = {
        setMaterial() {
            delegates++;
        },
    };
    selection.id = 'box3d';
    c.material = old;
    c._isSharedMaterial = true;
    delegates = 0;
    return { c, old, next, count: () => delegates };
}
control('Collider.material clone getter refuses before off/clone/on/id/cache changes', () => {
    const { c, old, count } = colliderFixture();
    const initial = PhysicsMaterial.allMaterials.length;
    const off = jest.spyOn(old, 'off'),
        clone = jest.spyOn(old, 'clone');
    guard(c);
    refused(() => c.material);
    record('material identity unchanged', c.sharedMaterial === old, true);
    record('shared flag unchanged', c._isSharedMaterial, true);
    record('off calls', off.mock.calls.length, 0);
    record('clone calls', clone.mock.calls.length, 0);
    record('new assets', PhysicsMaterial.allMaterials.length - initial, 0);
    old.friction = 0.21;
    record('old listener still wired to actual EventTarget', count(), 1);
});
control('Collider already-unshared material getter remains a pure read while fenced', () => {
    const { c, old } = colliderFixture();
    c._isSharedMaterial = false;
    guard(c);
    record('unshared getter unchanged', c.material === old, true);
});
control('Collider.material setter refuses before delegate/listener/cache change', () => {
    const { c, old, next, count } = colliderFixture();
    const off = jest.spyOn(old, 'off'),
        on = jest.spyOn(next, 'on');
    guard(c);
    refused(() => {
        c.material = next;
    });
    record('material identity unchanged', c.sharedMaterial === old, true);
    record('delegate count', count(), 0);
    record('old listener off', off.mock.calls.length, 0);
    record('new listener on', on.mock.calls.length, 0);
    old.friction = 0.21;
    next.friction = 0.31;
    record('only old event still reaches delegate', count(), 1);
});
control('Collider.material without shape rejects earliest cache branch', () => {
    const c = new BoxCollider(),
        m = new PhysicsMaterial();
    colliders.push(c);
    guard(c);
    refused(() => {
        c.material = m;
    });
    record('uninitialized cache remains null', c.sharedMaterial, null);
});
function systemFixture() {
    const system = new (PhysicsSystem as any)() as PhysicsSystem;
    let calls = 0;
    const world: any = {
        setAllowSleep() {
            calls++;
        },
        setGravity() {
            calls++;
        },
        setDefaultMaterial() {
            calls++;
        },
    };
    Object.defineProperty(world, 'debugDrawFlags', {
        get: () => 0,
        set: () => {
            calls++;
        },
    });
    Object.defineProperty(world, 'debugDrawConstraintSize', {
        get: () => 1,
        set: () => {
            calls++;
        },
    });
    selection.id = 'box3d';
    selection.physicsWorld = world;
    return { system, count: () => calls };
}
for (const [field, value] of [
    ['enable', false],
    ['maxSubSteps', 9],
    ['fixedTimeStep', 0.02],
    ['sleepThreshold', 0.8],
    ['autoSimulation', false],
    ['allowSleep', false],
    ['gravity', new Vec3(4, 5, 6)],
    ['debugDrawFlags', 1],
    ['debugDrawConstraintSize', 2],
] as const)
    control(`PhysicsSystem ${field} refuses before cache or delegate`, () => {
        const { system, count } = systemFixture();
        const before = field === 'gravity' ? [system.gravity.x, system.gravity.y, system.gravity.z] : system[field];
        guard(system);
        refused(() => {
            (system as any)[field] = value;
        });
        const after = field === 'gravity' ? [system.gravity.x, system.gravity.y, system.gravity.z] : system[field];
        record('public cache unchanged', after, before);
        record('world delegate calls', count(), 0);
    });
control('PhysicsSystem.setDefaultPhysicsMaterial refuses before native/listener/cache work', () => {
    const { system, count } = systemFixture();
    const m = new PhysicsMaterial(),
        old = system.defaultMaterial;
    const on = jest.spyOn(m, 'on');
    guard(system);
    refused(() => system.setDefaultPhysicsMaterial(m));
    record('default identity unchanged', system.defaultMaterial === old, true);
    record('world delegate count', count(), 0);
    record('listener registration count', on.mock.calls.length, 0);
});
control('PhysicsSystem.gravity guard is earlier than candidate vector getters', () => {
    const { system, count } = systemFixture();
    let reads = 0;
    const input = {
        get x() {
            reads++;
            return 1;
        },
        y: 2,
        z: 3,
    };
    guard(system);
    refused(() => {
        system.gravity = input as Vec3;
    });
    record('candidate getter reads', reads, 0);
    record('world delegate calls', count(), 0);
});
control('PhysicsSystem.resetConfiguration guard is before candidate getters and cumulative writes', () => {
    const { system, count } = systemFixture();
    const before = [
        system.allowSleep,
        system.fixedTimeStep,
        system.maxSubSteps,
        system.sleepThreshold,
        system.autoSimulation,
        system.gravity.x,
        system.gravity.y,
    ];
    let reads = 0;
    const config = {
        get allowSleep() {
            reads++;
            return false;
        },
        fixedTimeStep: 0.02,
        maxSubSteps: 9,
        sleepThreshold: 0.8,
        autoSimulation: false,
        gravity: { x: 4, y: 5, z: 6 },
    };
    guard(system);
    refused(() => system.resetConfiguration(config));
    record('config getter count', reads, 0);
    record(
        'all caches unchanged',
        [
            system.allowSleep,
            system.fixedTimeStep,
            system.maxSubSteps,
            system.sleepThreshold,
            system.autoSimulation,
            system.gravity.x,
            system.gravity.y,
        ],
        before,
    );
    record('world delegate count', count(), 0);
});
control('PhysicsSystem.resetAccumulator is fenced before changing the single clock', () => {
    const { system } = systemFixture();
    system.resetAccumulator(0.125);
    guard(system);
    refused(() => system.resetAccumulator(8));
    record('accumulator unchanged', (system as any)._accumulator, 0.125);
});
for (const backend of ['builtin', 'cannon.js', 'box3d'])
    control(`no lease preserves original cache/material/component behavior for ${backend}`, () => {
        const { system, count } = systemFixture();
        selection.id = backend;
        system.enable = false;
        system.maxSubSteps = 3;
        system.fixedTimeStep = 0.03;
        system.sleepThreshold = 0.7;
        system.autoSimulation = false;
        system.resetAccumulator(0.2);
        record(
            'cache assignments retain original behavior',
            [
                system.enable,
                system.maxSubSteps,
                system.fixedTimeStep,
                system.sleepThreshold,
                system.autoSimulation,
                (system as any)._accumulator,
            ],
            [false, 3, 0.03, 0.7, false, 0.2],
        );
        record('cache-only setters never call delegate', count(), 0);
        system.allowSleep = false;
        system.gravity = new Vec3(1, 2, 3);
        system.debugDrawFlags = 1;
        system.debugDrawConstraintSize = 2;
        const defaultMaterial = new PhysicsMaterial();
        system.setDefaultPhysicsMaterial(defaultMaterial);
        record('original world delegates still called', count(), 5);
        record(
            'original cache/identity commits',
            [
                system.allowSleep,
                system.gravity.x,
                system.gravity.y,
                system.gravity.z,
                system.defaultMaterial === defaultMaterial,
            ],
            [false, 1, 2, 3, true],
        );
        defaultMaterial.friction = 0.24;
        record('original default material listener still works', count(), 6);
        const n = node(),
            component = n.addComponent(Component);
        component.enabled = false;
        record('plain component original behavior', [n.components.length, component.enabled], [1, false]);
        const m = new PhysicsMaterial();
        let updates = 0;
        m.on(PhysicsMaterial.EVENT_UPDATE, () => updates++);
        m.friction = 0.2;
        record('original material event', [m.friction, updates], [0.2, 1]);
    });

control('no lease preserves clone getter, lifecycle callbacks and actual deferred destruction', () => {
    const { c, old } = colliderFixture();
    const clone = c.material;
    record('original getter creates new material', clone !== old && clone instanceof PhysicsMaterial, true);
    record('clone is now unshared', c._isSharedMaterial, false);
    const { child, component, counts } = componentFixture(true);
    component.enabled = false;
    component.enabled = true;
    record('scheduler callbacks run normally', counts, { enable: 1, disable: 1, destroy: 0 });
    child.destroy();
    record('normal destruction schedules immediately', isValid(child, true), false);
    CCObject._deferredDestroy();
    record('normal actual destruction completes', [isValid(child), counts.destroy], [false, 1]);
});
