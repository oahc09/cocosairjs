/* Source/CPU geometry checks only. No engine, native physics, browser or acceptance PASS is implied. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
// Isolated staging may read its pinned engine source without editing/building that checkout.
const engineRoot = process.env.BOX3D_EX01_ENGINE_ROOT || root;
const example = path.join(root, 'examples/box3d-rigidbody-playground');
const read = (name) => fs.readFileSync(path.join(example, name), 'utf8');
const main = read('src/main.ts');
const drag = read('src/spring-drag.ts');
const html = read('index.html');
function loadPure(name) {
    const filename = path.join(example, 'src', name);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        fileName: filename,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        reportDiagnostics: true,
    });
    assert.equal(compiled.diagnostics.length, 0);
    const scope = { exports: {} };
    vm.runInNewContext(compiled.outputText, { module: scope, exports: scope.exports, Object, Math, Number, Error });
    return scope.exports;
}
const { CAPSULE_DIMENSIONS: dimensions, capsuleVerticalExtent: extent } = loadPure('capsule-geometry.ts');
let checks = 0;
function check(name, fn) {
    fn();
    checks++;
    console.log(`PASS (source/CPU only): ${name}`);
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
check('capsule dimensions keep cylinder and total height distinct', () => {
    assert.ok(Object.isFrozen(dimensions));
    assert.equal(dimensions.radius, 0.42);
    assert.equal(dimensions.cylinderHeight, 1);
    near(dimensions.totalHeight, 1.84);
    near(dimensions.totalHeight, dimensions.cylinderHeight + 2 * dimensions.radius);
});
check('capsule support extent covers vertical, horizontal, upside-down and oblique poses', () => {
    near(extent({ x: 0, z: 0 }), 0.92);
    near(extent({ x: Math.SQRT1_2, z: 0 }), 0.42);
    near(extent({ x: 0, z: Math.SQRT1_2 }), 0.42);
    near(extent({ x: 1, z: 0 }), 0.92);
    near(extent({ x: 0.5, z: 0 }), 0.67);
    for (let i = 0; i <= 180; i++) {
        const angle = (i * Math.PI) / 180;
        const q = { x: Math.sin(angle / 2), z: 0 };
        const support = extent(q);
        near(support, dimensions.radius + (dimensions.cylinderHeight / 2) * Math.abs(Math.cos(angle)));
        assert.ok(support >= dimensions.radius - 1e-12 && support <= dimensions.totalHeight / 2 + 1e-12);
    }
});
check('local primitive and collider source define the same total-height convention', () => {
    const primitive = fs.readFileSync(path.join(engineRoot, 'src/cocos/primitive/capsule.ts'), 'utf8');
    const collider = fs.readFileSync(
        path.join(engineRoot, 'src/cocos/physics/framework/components/colliders/capsule-collider.ts'),
        'utf8',
    );
    assert.match(primitive, /function capsule \(radiusTop = 0\.5, radiusBottom = 0\.5, height = 2/);
    assert.match(primitive, /const torsoHeight = height - radiusTop - radiusBottom;/);
    assert.match(collider, /return this\._radius \* 2 \+ this\._cylinderHeight;/);
});
check('scene uses the real CapsuleCollider and matching centered Y-axis mesh dimensions', () => {
    assert.match(main, /node\.addComponent\(CapsuleCollider\)/);
    assert.match(main, /collider\.radius = CONFIG\.capsule\.radius;/);
    assert.match(main, /collider\.cylinderHeight = CONFIG\.capsule\.cylinderHeight;/);
    assert.match(main, /collider\.direction = EAxisDirection\.Y_AXIS;/);
    assert.match(
        main,
        /primitives\.capsule\(CONFIG\.capsule\.radius, CONFIG\.capsule\.radius, CONFIG\.capsule\.totalHeight\)/,
    );
    assert.match(main, /entry\.kind === 'capsule'\) return position\.y - capsuleVerticalExtent\(q\)/);
    assert.match(main, /capsules: projectiles\.filter\(\(entry\) => entry\.kind === 'capsule'\)\.length/);
    assert.match(main, /projectileOrder: \['sphere', 'capsule'\] as const/);
    assert.doesNotMatch(main, /setWorldPosition|setWorldRotation|setScale|setLinearVelocity|setAngularVelocity/);
});
check('capsule drag keeps same-Node, single centered collider guards and canonical fixed-tick force', () => {
    for (const expected of [
        'collider instanceof CapsuleCollider',
        'collider.node !== body.node',
        'body.node.getComponentsInChildren(Collider).length !== 1',
        'collider.isTrigger',
        'collider.center.x !== 0',
        'collider.center.y !== 0',
        'collider.center.z !== 0',
        '!Vec3.strictEquals(drag.collider.center, drag.center)',
        'system.raycastClosest(ray, 0xffffffff, 100, false)',
        'hook = registerBox3DBeforeStep',
        'drag.body.applyForce(',
        'previousHook?.dispose()',
    ])
        assert.ok(drag.includes(expected), expected);
    assert.doesNotMatch(
        drag,
        /setPosition|setRotation|setWorldPosition|setWorldRotation|setLinearVelocity|setAngularVelocity/,
    );
});
check('shared force clamp remains finite and bounded for capsule drag', () => {
    const { springForce } = loadPure('drag-spring-math.ts');
    const zero = { x: 0, y: 0, z: 0 };
    const result = springForce({
        target: { x: 10000, y: 10000, z: -10000 },
        point: zero,
        worldCOM: zero,
        linearVelocity: zero,
        angularVelocity: zero,
        mass: 12,
        parameters: { stiffness: 180, dampingRatio: 0.85, maxForce: 600, maxStretch: 3 },
    });
    assert.ok(Object.values(result.force).every(Number.isFinite));
    assert.ok(Math.hypot(result.force.x, result.force.y, result.force.z) <= 600 + 1e-10);
    assert.match(main, /drag: \{ stiffness: 180, dampingRatio: 0\.85, maxForce: 600, maxStretch: 3 \}/);
});
check('capsule follows retained projectile cap, mass changes, impulse submission, reset and close paths', () => {
    for (const expected of [
        'projectiles.length >= CONFIG.ball.maximum',
        'projectiles.push(entry)',
        'pendingImpulses.push({ entry, frame })',
        'pending.entry.body.applyImpulse(',
        'for (const entry of projectiles)',
        'retired = [...bricks, ...projectiles]',
        'for (const node of retired) node.destroy()',
        'springDrag?.dispose()',
        'closeReceipt = await app.close()',
    ])
        assert.ok(main.includes(expected), expected);
    assert.match(main, /maximum: 12/);
    assert.match(main, /bricks\.length !== 100/);
    assert.match(main, /if \(kind !== 'sphere' && kind !== 'capsule' && kind !== 'hull'\)\s*throw new Error/);
});
check('Hull drag and full EX01 acceptance remain explicitly unfinished/unverified', () => {
    const requirements = JSON.parse(read('original-requirements.json'));
    assert.equal(requirements.status, 'IN_PROGRESS');
    assert.ok(requirements.checks.every((item) => item.acceptance === 'NOT_RUN'));
    assert.match(
        requirements.checks.find((item) => item.requirement === 'Hull').source,
        /Hull dragging still unfinished/,
    );
    assert.match(html, /<option value="capsule">Capsule/);
    assert.match(html, /<option value="hull">Hull/);
    assert.match(main, /acceptancePassed: false/);
    const reference = fs.readFileSync(path.join(engineRoot, 'ai/plans/box3d-v1.2-reference.md'), 'utf8');
    for (const key of [
        'exactOriginalGlobalRequirement',
        'exactOriginalContents',
        'exactOriginalAcceptance',
        'exactOriginalVisualRequirement',
    ]) {
        assert.ok(reference.includes(requirements[key]), key);
    }
});
console.log(
    JSON.stringify({ checks, sourceControls: 'PASS', browserAcceptance: 'NOT_RUN', formalEX01Acceptance: 'NOT_RUN' }),
);
