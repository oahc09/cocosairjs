/** Focused CPU checks. Does not create or inherit browser evidence. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const cache = new Map();
function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const localRequire = (name) =>
        name.startsWith('.')
            ? load(path.relative(root, path.resolve(path.dirname(filename), name + (path.extname(name) ? '' : '.ts'))))
            : require(name);
    new Function('module', 'exports', 'require', code)(module, module.exports, localRequire);
    return module.exports;
}
const { createSessionScope } = load('src/air/session-scope.ts');
const { createAsyncAppLifecycle } = load('examples/shared/async-app-lifecycle.ts');
const { createSpriteContentReplacement } = load('examples/shared/replace-owned-sprite-frame.ts');
const { createTwoSidedPage, uploadTwoSidedPage } = load('examples/interactive-geometry/src/two-sided-page.ts');
function deferred() {
    let resolve, reject;
    const promise = new Promise((a, b) => {
        resolve = a;
        reject = b;
    });
    return { promise, resolve, reject };
}
const ticks = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
};
function lifecycle(overrides = {}) {
    const events = [],
        listeners = new Set();
    const app = {
        close: async () => {
            events.push('gpu');
            return { status: 'released' };
        },
        contextHealth: {
            onChange(callback) {
                listeners.add(callback);
                return () => listeners.delete(callback);
            },
            requestReload() {
                events.push('reload');
                return true;
            },
        },
    };
    const recipe = createAsyncAppLifecycle({
        session: createSessionScope(),
        createApp: async () => app,
        load: async () => 'resource',
        mount: () => events.push('mount'),
        releaseResource: () => events.push('resource'),
        releaseAudio: () => events.push('audio'),
        disableInput: () => events.push('input-off'),
        removeListeners: () => events.push('listeners-off'),
        ...overrides,
    });
    return { ...recipe, events, app, listeners };
}
test('audio and GPU cleanup start concurrently; close returns one Promise and awaits both', async () => {
    const audio = deferred(),
        gpu = deferred(),
        starts = [];
    const r = lifecycle({
        releaseAudio: () => {
            starts.push('audio');
            return audio.promise;
        },
        createApp: async () => ({
            close: () => {
                starts.push('gpu');
                return gpu.promise;
            },
            contextHealth: { onChange: () => () => {} },
        }),
    });
    await r.ready;
    const close = r.close();
    assert.equal(close, r.close());
    await ticks();
    assert.deepEqual(starts.sort(), ['audio', 'gpu']);
    let settled = false;
    close.then(() => {
        settled = true;
    });
    audio.resolve();
    await ticks();
    assert.equal(settled, false);
    assert.equal(r.events.includes('resource'), false);
    gpu.resolve({ status: 'released' });
    assert.equal((await close).status, 'released');
    assert.ok(r.events.includes('resource'));
});
test('construction cancellation skips load/mount and closes a late app', async () => {
    const app = deferred();
    let loads = 0,
        closes = 0;
    const r = lifecycle({
        createApp: () => app.promise,
        load: async () => {
            loads++;
        },
    });
    const closing = r.close();
    app.resolve({
        close: async () => {
            closes++;
            return { status: 'released' };
        },
    });
    assert.equal(await r.ready, false);
    assert.equal((await closing).status, 'released');
    assert.equal(loads, 0);
    assert.equal(closes, 1);
});
test('late resource is released once and never mounted', async () => {
    const value = deferred(),
        r = lifecycle({ load: () => value.promise });
    await ticks();
    const closing = r.close();
    value.resolve('late');
    assert.equal(await r.ready, false);
    await closing;
    assert.equal(r.events.filter((v) => v === 'resource').length, 1);
    assert.equal(r.events.includes('mount'), false);
});
test('load failure preserves its error and starts complete cleanup', async () => {
    const error = new Error('load failed'),
        r = lifecycle({
            load: async () => {
                throw error;
            },
        });
    await assert.rejects(r.ready, (e) => e === error);
    assert.equal((await r.close()).status, 'released');
    assert.ok(r.events.includes('audio') && r.events.includes('gpu'));
});
test('context loss disables input; failed restoration performs full reload after cleanup', async () => {
    const r = lifecycle();
    await r.ready;
    for (const cb of r.listeners) cb({ state: 'lost' });
    assert.ok(r.events.includes('input-off'));
    assert.equal(r.events.includes('reload'), false);
    for (const cb of [...r.listeners]) cb({ state: 'failed' });
    await r.close();
    await ticks();
    assert.equal(r.events.at(-1), 'reload');
    assert.equal(r.listeners.size, 0);
});
test('audio failure and app failed receipts are not reported as released', async () => {
    for (const overrides of [
        {
            releaseAudio: () => {
                throw new Error('audio failed');
            },
        },
        {
            createApp: async () => ({
                close: async () => ({ status: 'failed' }),
                contextHealth: { onChange: () => () => {} },
            }),
        },
    ]) {
        const r = lifecycle(overrides);
        await r.ready;
        assert.equal((await r.close()).status, 'failed');
    }
});
function content(id) {
    const part = (kind) => ({
        id: `${id}:${kind}`,
        destroyed: 0,
        destroy() {
            this.destroyed++;
        },
    });
    return { frame: part('frame'), texture: part('texture'), image: part('image') };
}
function textureFixture() {
    const scope = createSessionScope();
    scope.activate();
    const sprite = { spriteFrame: null };
    return { scope, sprite, replacement: createSpriteContentReplacement(scope, sprite) };
}
test('100 replacements bind before release and retain exactly one asset cleanup owner', async () => {
    const f = textureFixture();
    let previous;
    for (let i = 0; i < 100; i++) {
        const next = content(String(i));
        if (previous) {
            const old = previous;
            old.frame.destroy = () => {
                assert.equal(f.sprite.spriteFrame, next.frame);
                old.frame.destroyed++;
            };
        }
        await f.replacement.replace('paper', async () => next);
        assert.equal(f.scope.ownedCount, 2);
        previous = next;
    }
    await f.scope.dispose();
    assert.equal(f.sprite.spriteFrame, null);
    assert.equal(previous.frame.destroyed, 1);
});
test('failed load preserves the committed content', async () => {
    const f = textureFixture(),
        old = content('old');
    await f.replacement.replace('paper', async () => old);
    await assert.rejects(
        f.replacement.replace('import', async () => {
            throw new Error('decode');
        }),
    );
    assert.equal(f.sprite.spriteFrame, old.frame);
    assert.equal(old.frame.destroyed, 0);
    await f.scope.dispose();
});
test('failed assignment restores old content and destroys every new allocation', async () => {
    const scope = createSessionScope();
    scope.activate();
    const old = content('old'),
        next = content('new');
    let bound = null;
    const sprite = {
        get spriteFrame() {
            return bound;
        },
        set spriteFrame(v) {
            if (v === next.frame) throw new Error('bind');
            bound = v;
        },
    };
    const r = createSpriteContentReplacement(scope, sprite);
    await r.replace('paper', async () => old);
    await assert.rejects(r.replace('paper', async () => next));
    assert.equal(bound, old.frame);
    for (const value of Object.values(next)) assert.equal(value.destroyed, 1);
    await scope.dispose();
});
test('out-of-order and post-disposal successes cannot replace current content', async () => {
    const f = textureFixture(),
        a = deferred(),
        b = deferred(),
        first = content('a'),
        second = content('b');
    const p1 = f.replacement.replace('import', () => a.promise),
        p2 = f.replacement.replace('import', () => b.promise);
    b.resolve(second);
    assert.equal(await p2, 'replaced');
    a.resolve(first);
    assert.equal(await p1, 'stale');
    assert.equal(f.sprite.spriteFrame, second.frame);
    assert.equal(first.texture.destroyed, 1);
    const late = deferred(),
        value = content('late'),
        p3 = f.replacement.replace('import', () => late.promise);
    await f.scope.dispose();
    late.resolve(value);
    assert.equal(await p3, 'stale');
    assert.equal(value.image.destroyed, 1);
});
test('paper edits preserve pending and committed imports', async () => {
    const f = textureFixture(),
        pending = deferred();
    let loads = 0;
    const imported = f.replacement.replace('import', () => pending.promise);
    const edit = () =>
        f.replacement.replace('paper', async () => {
            loads++;
            return content('paper');
        });
    assert.equal(await edit(), 'preserved-import');
    pending.resolve(content('user'));
    await imported;
    assert.equal(await edit(), 'preserved-import');
    assert.equal(loads, 0);
    await f.scope.dispose();
});
test('failed or retired import clears the pending-import preference', async () => {
    const f = textureFixture(),
        pending = deferred();
    const imported = f.replacement.replace('import', () => pending.promise);
    f.scope.deactivate();
    pending.resolve(content('retired'));
    assert.equal(await imported, 'stale');
    f.scope.activate();
    assert.equal(await f.replacement.replace('paper', async () => content('new paper')), 'replaced');
    await f.scope.dispose();
});
function verifyPage(page) {
    for (const side of ['front', 'back']) {
        const g = page[side];
        for (const values of Object.values(g)) assert.ok([...values].every(Number.isFinite));
        for (let i = 0; i < g.indices16.length; i += 3) {
            const p = [...g.indices16.slice(i, i + 3)].map((v) => [...g.positions.slice(v * 3, v * 3 + 3)]);
            const a = p[1].map((v, k) => v - p[0][k]),
                b = p[2].map((v, k) => v - p[0][k]);
            const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
            const n = [...g.normals.slice(g.indices16[i] * 3, g.indices16[i] * 3 + 3)];
            assert.ok(cross.reduce((sum, v, k) => sum + v * n[k], 0) > 0);
            assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-6);
        }
    }
    assert.deepEqual(page.front.positions, page.back.positions);
    for (let i = 0; i < page.front.normals.length; i++)
        assert.ok(Math.abs(page.front.normals[i] + page.back.normals[i]) < 1e-7);
    assert.equal(page.front.uvs[0], 0);
    assert.equal(page.back.uvs[0], 1);
}
test('both turn directions preserve normals, winding and identity at 66 angles', () => {
    for (const direction of [1, -1])
        for (let i = 0; i <= 32; i++) verifyPage(createTwoSidedPage(((direction > 0 ? i : 32 - i) / 32) * Math.PI));
});
test('native endpoint wiring receives the same checked arrays and notifies both renderers', () => {
    const calls = [],
        notices = [];
    const side = (name) => ({
        mesh: { updateSubMesh: (index, geometry) => calls.push({ name, index, geometry }) },
        renderer: { onGeometryChanged: () => notices.push(name) },
    });
    const page = uploadTwoSidedPage(Math.PI / 2, side('front'), side('back'));
    assert.equal(calls[0].geometry, page.front);
    assert.equal(calls[1].geometry, page.back);
    assert.deepEqual(notices, ['front', 'back']);
    verifyPage(page);
});
test('invalid geometry inputs are rejected', () => {
    for (const angle of [NaN, Infinity, -0.1, Math.PI + 0.1])
        assert.throws(() => createTwoSidedPage(angle), RangeError);
    for (const n of [0, 1.5, 65536]) assert.throws(() => createTwoSidedPage(0, n), RangeError);
});
const { prepareEffectForRegistration, AirEffectLayoutError } = load('tools/debug/effect-layout.ts');
function effect() {
    const glsl4 =
        'precision highp float;\nlayout(set=1,binding=0) uniform Constants { vec4 color; };\nlayout(set=1,binding=1) uniform sampler2D image;\nvoid main() {}';
    return {
        name: 'fixture',
        techniques: [{ passes: [{ program: 'one' }, { program: 'two' }] }],
        shaders: ['one', 'two'].map((name) => ({
            name,
            blocks: [
                { name: 'Constants', binding: 0, stageFlags: 16, members: [{ name: 'color', type: 16, count: 1 }] },
            ],
            samplerTextures: [{ name: 'image', binding: 1, count: 1, type: 28, stageFlags: 16 }],
            glsl4: { vert: 'void main(){}', frag: glsl4 },
            glsl3: { vert: 'void main(){}', frag: glsl4.replace(/layout\([^)]*\) /g, '') },
        })),
    };
}
test('multiple shader programs retain independent bindings without mutating input', () => {
    const input = effect(),
        original = JSON.stringify(input),
        result = prepareEffectForRegistration(input);
    assert.equal(result.bindings.length, 4);
    assert.equal(JSON.stringify(input), original);
});
for (const target of ['glsl4', 'glsl3'])
    for (const [name, from, to] of [
        ['comma sampler', 'sampler2D image;', 'sampler2D image, second;'],
        ['macro array', 'sampler2D image;', 'sampler2D image[COUNT];'],
        [
            'conditional',
            'uniform sampler2D image;',
            'uniform sampler2D image;\n#if USE_EXTRA\nuniform sampler2D extra;\n#endif',
        ],
        ['comma block', 'vec4 color;', 'vec4 color, other;'],
        ['block array', 'vec4 color;', 'vec4 color[COUNT];'],
    ])
        test(`${target} ${name}: source-positioned rejection`, () => {
            const input = effect();
            input.shaders[0][target].frag = input.shaders[0][target].frag.replace(from, to);
            assert.throws(
                () => prepareEffectForRegistration(input),
                (e) =>
                    e instanceof AirEffectLayoutError &&
                    e.issues.some((i) => i.target === target && i.stage === 'frag' && i.line >= 2 && i.column >= 1),
            );
        });
test('GLSL3 reflection drift fails even when GLSL4 matches', () => {
    const input = effect();
    input.shaders[0].glsl3.frag = input.shaders[0].glsl3.frag.replace('vec4 color;', 'mat4 color;');
    assert.throws(() => prepareEffectForRegistration(input), /glsl3 material member layout/);
});
test('unreflected bare uniform is not silently accepted', () => {
    const input = effect();
    input.shaders[0].glsl4.vert += '\nuniform vec4 missing;';
    assert.throws(() => prepareEffectForRegistration(input), /DECLARATION_UNSUPPORTED/);
});
test('unchanged legacy HDR fixture remains accepted', () => {
    const fixture = require(path.join(root, 'examples/hdr-color-pipeline/color-input.effect.json'));
    assert.equal(prepareEffectForRegistration(fixture).effect.name, fixture.name);
});
