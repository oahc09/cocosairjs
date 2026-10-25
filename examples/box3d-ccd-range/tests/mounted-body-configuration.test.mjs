import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mountAndConfigureBodies } from '../src/mounted-body-configuration.mjs';
// These doubles assert lifecycle call order only; no collision, motion or CCD result is simulated.
function fixture(target = 'wall') {
    const calls = [];
    let mounted = false;
    const body = (name) => {
        let bullet = false;
        return {
            set useCCD(value) {
                assert.equal(mounted, true, 'useCCD must follow synchronous onLoad');
                calls.push(`${name}.ccd=${value}`);
                bullet = value;
            },
            get useCCD() {
                assert.equal(mounted, true);
                calls.push(`${name}.readCCD`);
                return bullet;
            },
            setLinearVelocity(value) {
                assert.equal(mounted, true);
                calls.push(`${name}.velocity=${value.x}`);
            },
        };
    };
    return {
        calls,
        input: {
            app: {
                run() {
                    calls.push('run/onLoad');
                    mounted = true;
                },
            },
            scene: {},
            system: {
                set enable(value) {
                    assert.equal(mounted, true);
                    calls.push(`enable=${value}`);
                },
            },
            projectile: { body: body('projectile') },
            target: { body: body('target') },
            config: { target, bullet: true, speed: 80 },
            vector: (x, y, z) => ({ x, y, z }),
        },
    };
}
test('body CCD and velocity are configured only after synchronous scene mount/onLoad', () => {
    const f = fixture();
    mountAndConfigureBodies(f.input);
    assert.deepEqual(f.calls, [
        'run/onLoad',
        'enable=true',
        'target.ccd=false',
        'projectile.ccd=true',
        'target.readCCD',
        'projectile.readCCD',
        'projectile.velocity=80',
    ]);
});
test('moving bullet target is configured and read back before either velocity', () => {
    const f = fixture('bullet-target');
    mountAndConfigureBodies(f.input);
    assert.deepEqual(f.calls, [
        'run/onLoad',
        'enable=true',
        'target.ccd=true',
        'projectile.ccd=true',
        'target.readCCD',
        'projectile.readCCD',
        'projectile.velocity=80',
        'target.velocity=-1',
    ]);
});
test('failed mount or mismatched CCD readback never issues velocity', () => {
    const f = fixture();
    f.input.app.run = () => {
        throw new Error('mount failed');
    };
    assert.throws(() => mountAndConfigureBodies(f.input), /mount failed/);
    assert.deepEqual(f.calls, []);
    const mismatch = fixture();
    Object.defineProperty(mismatch.input.projectile.body, 'useCCD', { get: () => false, set: () => {} });
    assert.throws(() => mountAndConfigureBodies(mismatch.input), /readback/);
    assert.equal(
        mismatch.calls.some((row) => row.includes('velocity')),
        false,
    );
});
test('live scene builder delegates non-cached public body operations to mount boundary', () => {
    const source = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    assert.ok(source.includes('mountAndConfigureBodies({'));
    assert.doesNotMatch(source, /\.useCCD\s*=|\.setLinearVelocity\(/);
});

test('pre-onLoad useCCD setter/getter and velocity attempts explicitly reject', () => {
    const f = fixture();
    assert.throws(() => {
        f.input.projectile.body.useCCD = true;
    }, /useCCD must follow/);
    assert.throws(() => f.input.target.body.useCCD);
    assert.throws(() => f.input.projectile.body.setLinearVelocity({ x: 80, y: 0, z: 0 }));
    assert.deepEqual(f.calls, []);
});
