import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { releaseOwned, attemptStops } from '../src/cleanup.mjs';
// Ownership/order fixtures only; no body, geometry, motion or contact simulation.
function fixture({ mounted = true, orphan = false } = {}) {
    const calls = [],
        pending = new Set(),
        records = [];
    const owned = (name, parent = null) => ({
        name,
        parent,
        isValid: true,
        destroy() {
            calls.push(`destroy:${name}`);
            pending.add(this);
            return true;
        },
    });
    const scene = owned('scene');
    const node = owned('node', orphan ? null : scene);
    const asset = owned('asset');
    let current = mounted ? scene : null;
    const app = {
        getScene: () => current,
        async releaseScene() {
            calls.push('release');
            if (current) {
                pending.add(current);
                current = null;
            }
            if (pending.has(scene)) pending.add(node);
            for (const value of pending) value.isValid = false;
            pending.clear();
            return { status: 'released' };
        },
    };
    return {
        calls,
        records,
        scene,
        node,
        asset,
        input: { app, scene, nodes: [node], assets: [asset], record: (r) => records.push(r) },
    };
}
test('release scene then destroy assets then empty-scene public flush; clear after invalidity', async () => {
    const f = fixture();
    await releaseOwned(f.input);
    assert.deepEqual(f.calls, ['release', 'destroy:asset', 'release']);
    assert.equal(f.asset.isValid, false);
    assert.deepEqual(f.input.assets, []);
    assert.deepEqual(f.input.nodes, []);
    assert.deepEqual(
        f.records.filter((r) => r.kind === 'releaseScene').map((r) => r.phase),
        ['scene-and-unmounted-flush', 'owned-assets-flush'],
    );
});
test('unmounted failed candidate and detached construction node are publicly destroyed', async () => {
    const f = fixture({ mounted: false, orphan: true });
    await releaseOwned(f.input);
    assert.deepEqual(f.calls, ['destroy:scene', 'destroy:node', 'release', 'destroy:asset', 'release']);
    assert.equal(f.scene.isValid, false);
    assert.equal(f.node.isValid, false);
});
test('failed first release retains asset identities and never destroys referenced assets', async () => {
    const f = fixture();
    f.input.app.releaseScene = async () => ({ status: 'failed' });
    await assert.rejects(releaseOwned(f.input), /Scene\/node cleanup/);
    assert.deepEqual(f.input.assets, [f.asset]);
    assert.equal(f.asset.isValid, true);
    assert.deepEqual(f.calls, []);
});
test('destroy exception retains identity but still flushes other assets', async () => {
    const f = fixture();
    const bad = {
        isValid: true,
        destroy() {
            throw new Error('destroy failed');
        },
    };
    f.input.assets.push(bad);
    await assert.rejects(releaseOwned(f.input), /asset cleanup/);
    assert.deepEqual(f.calls, ['release', 'destroy:asset', 'release']);
    assert.deepEqual(f.input.assets, [bad]);
    assert.equal(f.records.at(-1).destroyErrors.length, 1);
});
test('failed or ineffective second flush never claims cleanup or forgets valid assets', async () => {
    for (const status of ['failed', 'released']) {
        const f = fixture();
        const original = f.input.app.releaseScene;
        let calls = 0;
        f.input.app.releaseScene = async () => (++calls === 1 ? original() : { status });
        await assert.rejects(releaseOwned(f.input), /asset cleanup/);
        assert.deepEqual(f.input.assets, [f.asset]);
    }
});
test('throwing orphan destruction still attempts public release and retains failing node', async () => {
    const f = fixture({ orphan: true });
    f.node.destroy = () => {
        throw new Error('node failed');
    };
    // This detached node is not owned by the mounted scene.
    f.input.app.releaseScene = async () => {
        f.calls.push('release');
        f.scene.isValid = false;
        return { status: 'released' };
    };
    await assert.rejects(releaseOwned(f.input), /Scene\/node cleanup/);
    assert.deepEqual(f.calls, ['release']);
    assert.deepEqual(f.input.nodes, [f.node]);
    assert.deepEqual(f.input.assets, [f.asset]);
});
test('all stop attempts execute despite refusal', () => {
    const calls = [];
    const errors = attemptStops([
        () => {
            calls.push(1);
            throw Error('pause');
        },
        () => calls.push(2),
    ]);
    assert.deepEqual(calls, [1, 2]);
    assert.deepEqual(errors, ['Error: pause']);
});
test('live construction tracks immediately and close cleans before terminal SDK call', () => {
    const source = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    assert.match(source, /new Material\(\);\s*assets.push\(m\);\s*m.initialize/);
    assert.match(source, /new PhysicsMaterial\(\);\s*assets.push\(surface\);/);
    assert.match(source, /new Node\(name\);\s*nodes.push\(n\);/);
    assert.match(
        source,
        /await release\(true\);\s*lifecycle.startSdkClose\(\);[^\n]*\n\s*const receipt = await app.close\(\)/,
    );
    assert.match(source, /await releaseOwned\(\{\s*app,\s*scene,\s*nodes,\s*assets,/);
    assert.doesNotMatch(source, /_deferredDestroy|_flushAirReleaseQueue|el\('close'\).disabled = false/);
});
