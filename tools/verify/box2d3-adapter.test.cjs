/* Adapter lifecycle regressions against the pinned WASM; only Cocos components are stubbed.
 * node --test tools/verify/box2d3-adapter.test.cjs */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');

async function fixture() {
    const runtime = path.join(root, 'vendor/box2d/runtime');
    const { default: factory } = await import(pathToFileURL(path.join(runtime, 'air-box2d.mjs')));
    const native = await factory({ wasmBinary: fs.readFileSync(path.join(runtime, 'air-box2d.wasm')) });
    class Vec2 {
        constructor(x = 0, y = 0) {
            this.x = x;
            this.y = y;
        }
    }
    class Quat {
        static toEulerInYXZOrder(out) {
            out.z = 0;
        }
    }
    class RigidBody2D {}
    class Collider2D {}
    class BoxCollider2D extends Collider2D {}
    class CircleCollider2D extends Collider2D {}
    class PolygonCollider2D extends Collider2D {}
    const physics = { collisionMatrix: { 1: 0xffffffff }, emit() {} };
    const selector = {};
    const modules = {
        '../../cocos/core': { Vec2, Vec3: Vec2, Rect: class {}, Quat, Color: {} },
        '../../cocos/physics-2d/framework': {
            PhysicsSystem2D: { instance: physics },
            RigidBody2D,
            Collider2D,
            BoxCollider2D,
            CircleCollider2D,
            PolygonCollider2D,
            ERigidBody2DType: { Static: 0, Kinematic: 1, Dynamic: 2, Animated: 3 },
            Contact2DType: { BEGIN_CONTACT: 'begin', END_CONTACT: 'end', PRE_SOLVE: 'pre', POST_SOLVE: 'post' },
            PHYSICS_2D_PTM_RATIO: 32,
        },
        '../../cocos/physics-2d/framework/physics-selector': { selector },
        '../../cocos/physics-2d/framework/utils/polygon-partition': { ConvexPartition: (points) => [points] },
        '../../cocos/2d/components/graphics': { Graphics: class {} },
        '../../cocos/scene-graph': { Node: class {} },
        '../../cocos/2d/framework/canvas': { Canvas: class {} },
        '../../cocos/2d/framework/ui-transform': { UITransform: class {} },
        '../../cocos/game': { director: { getScene: () => null } },
        '../../cocos/input': { input: {}, Input: { EventType: {} } },
    };
    const source = fs.readFileSync(path.join(root, 'src/air/physics-2d/box2d3.ts'), 'utf8');
    const exports = {};
    vm.runInNewContext(
        ts.transpileModule(
            `${source}\nexport const testAdapter = { Box2D3World, Box2D3Body, Box2D3Shape,
                setNative: (value: Box2D3Module) => native = value };`,
            { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
        ).outputText,
        {
            exports,
            require(name) {
                assert(Object.hasOwn(modules, name), `unexpected adapter dependency: ${name}`);
                return modules[name];
            },
            URL,
        },
    );
    const { testAdapter } = exports;
    testAdapter.setNative(native);
    const world = new testAdapter.Box2D3World();
    selector.physicsWorld = physics.physicsWorld = world;
    const shape = (body = null, scale = 1) => {
        const collider = new BoxCollider2D();
        Object.assign(collider, {
            isValid: true,
            enabledInHierarchy: true,
            group: 1,
            density: 1,
            friction: 0.2,
            restitution: 0,
            sensor: false,
            offset: new Vec2(),
            size: { width: 32, height: 32 },
            body,
            getComponent: () => body,
            node: { worldPosition: { x: 0, y: 0 }, worldRotation: {}, worldScale: { x: scale, y: scale } },
            emit() {},
        });
        const wrapper = new testAdapter.Box2D3Shape();
        wrapper.initialize(collider);
        wrapper.onEnable();
        return { collider, wrapper };
    };
    return { world, shape, native, testAdapter };
}

test('bodyless colliders recover after zero scale, including initially zero scale', async () => {
    const { world, shape } = await fixture();
    try {
        for (const initialScale of [1, 0]) {
            const { collider, wrapper } = shape(null, initialScale);
            collider.node.worldScale = { x: 0, y: 0 };
            world.syncSceneToPhysics();
            assert.equal(world.stats().shapes, 0);
            collider.node.worldScale = { x: 1, y: 1 };
            world.syncSceneToPhysics();
            assert.equal(world.stats().shapes, 1, `restored collider from initial scale ${initialScale}`);
            assert(world.testPoint({ x: 0, y: 0 }).includes(collider));
            collider.enabledInHierarchy = false;
            wrapper.onDisable();
            world.syncSceneToPhysics();
            assert.equal(world.stats().shapes, 0);
            assert.equal(world.stats().bodies, 1, 'only the world ground body remains');
        }
    } finally {
        world.destroy();
    }
});

for (const duringStep of [false, true]) {
    test(`END callback rebuilding a collider releases every old shape (${duringStep ? 'deferred' : 'direct'})`, async () => {
        const { world, shape, native, testAdapter } = await fixture();
        try {
            const body = new testAdapter.Box2D3Body();
            body.impl = native.createBody(world.impl, { type: 2, y: 0.5 });
            world.bodies.add(body);
            const { collider, wrapper } = shape({ impl: body, enabledContactListener: true, group: 1 });
            shape();
            let begins = 0;
            let ends = 0;
            let requested = false;
            collider.emit = (type) => {
                if (type === 'begin') begins++;
                if (duringStep && type === 'pre' && !requested) {
                    requested = true;
                    wrapper.apply();
                }
                if (type === 'end' && ends++ === 0) wrapper.apply();
            };
            world.step(1 / 60);
            assert.equal(begins, 1, 'the real native contact must dispatch BEGIN');
            if (!duringStep) wrapper.apply();
            assert.equal(ends, 1);
            assert.equal(world.stats().shapes, 2);
            assert.equal(world.shapes.size, 2);
            assert.equal(wrapper.impl.length, 1);
            collider.enabledInHierarchy = false;
            wrapper.onDisable();
            assert.equal(world.stats().shapes, 1, 'only the other collider remains');
            assert.equal(world.shapes.size, 1);
            assert(!world.testPoint({ x: 0, y: 0 }).includes(collider));
        } finally {
            world.destroy();
        }
    });
}
