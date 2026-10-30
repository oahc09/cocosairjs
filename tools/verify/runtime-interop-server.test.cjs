const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startServer, parseArgs } = require('./runtime-interop.cjs');
const { prepare } = require('../build/runtime-interop-android.cjs');

test('interop routes expose only fixed modules/assets and reject malformed requests without leaking paths', async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'air-interop-server-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const bundle = path.join(root, 'runtime.js');
    fs.writeFileSync(bundle, 'export const value = 1;');
    fs.mkdirSync(path.join(root, 'webgpu'));
    fs.writeFileSync(path.join(root, 'webgpu/glslang.js'), 'export default 1;');
    fs.writeFileSync(path.join(root, 'secret.txt'), 'private');
    fs.symlinkSync(path.join(root, 'secret.txt'), path.join(root, 'webgpu/twgsl.js'));
    const server = await startServer(bundle);
    t.after(() => server.close());
    for (const route of [
        '/probe.html',
        '/sdk/cocosair.module.js',
        '/sdk/webgpu/glslang.js',
        '/probes/module-fixture.mjs',
    ]) {
        const result = await fetch(server.origin + route);
        assert.equal(result.status, 200, route);
    }
    const head = await fetch(server.origin + '/probe.html', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal((await fetch(server.origin + '/probe.html', { method: 'POST' })).status, 405);
    for (const route of [
        '/probes/native-host.cjs',
        '/probes/host-patches/private.mjs',
        '/sdk/webgpu/secret.txt',
        '/src/entry.ts',
    ])
        assert.equal((await fetch(server.origin + route)).status, 404, route);
    for (const route of ['/%zz', '/sdk/webgpu/twgsl.js']) {
        const result = await fetch(server.origin + route);
        assert.equal(result.status, 400, route);
        assert.equal(await result.text(), 'Bad request');
    }
});

test('external host archives and Android staging require unambiguous explicit arguments', () => {
    assert.throws(() => parseArgs(['--out=x', '--host-patches=x']), /requires --host-build/);
    assert.equal(
        parseArgs(['--out=x', '--host=mystral', '--executable=x', '--host-build=b', '--host-patches=p'])[
            'host-patches'
        ],
        'p',
    );
    assert.throws(() => prepare(['--out=x', '--out=y']), /duplicate/);
    assert.throws(() => prepare(['--out=x', '--bundle=a', '--bundle=b']), /duplicate/);
});
