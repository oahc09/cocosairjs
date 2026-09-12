/* Verify the actual dev server with a temporary example only. Engine sources
 * and other agents' server processes are never changed or stopped. */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const assert = require('assert');
const vm = require('vm');
const root = path.resolve(__dirname, '../..');
const port = Number(process.env.AIR_VERIFY_PORT || 7471);
const file = path.join(root, 'examples/starter', `v03-loop-${process.pid}.ts`);
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['tools/dev/dev-server.cjs', '--port', String(port)], { cwd: root, windowsHide: true });
let log = ''; child.stdout.on('data', (data) => log += data); child.stderr.on('data', (data) => log += data);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
    let ready = false;
    for (let i = 0; i < 100; i++) {
        if (child.exitCode !== null) throw new Error(log);
        if (log.includes('Cocos AIR dev server:')) { ready = true; break; }
        await sleep(100);
    }
    assert(ready, 'Server did not start');
    const html = await (await fetch(base + '/starter/')).text();
    assert.strictEqual((html.match(/type="importmap"/g) || []).length, 1);
    assert.strictEqual((await fetch(base + '/__runtime-assets.js')).status, 200);
    const before = await (await fetch(base + '/__stats')).json();
    const token = await (await fetch(base + '/__reload_token')).json();
    fs.writeFileSync(file, 'export const value: number = 1;');
    let after;
    for (let i = 0; i < 50; i++) {
        after = await (await fetch(base + '/__stats')).json();
        if (after.exampleReloads > before.exampleReloads) break;
        await sleep(100);
    }
    assert(after.exampleReloads > before.exampleReloads);
    assert.notStrictEqual((await (await fetch(base + '/__reload_token')).json()).token, token.token);
    const url = `${base}/starter/${path.basename(file)}`;
    assert((await (await fetch(url)).text()).includes('const value = 1'));
    fs.writeFileSync(file, 'export const value: number = ;');
    assert.strictEqual((await fetch(url)).status, 500);
    fs.writeFileSync(file, 'export const value: number = 2;');
    assert((await (await fetch(url)).text()).includes('const value = 2'));
    assert.deepStrictEqual(after.engineRebuilds, before.engineRebuilds);
    assert.deepStrictEqual(after.airRebuilds, before.airRebuilds);
    let errorReads = 0;
    const gl = { drawElements: () => 42, getError: () => ++errorReads,
        COMPILE_STATUS: 1, LINK_STATUS: 2, getShaderParameter: () => false, getProgramParameter: () => false,
        getShaderInfoLog: () => 'shader failed', getProgramInfoLog: () => 'link failed' };
    class Canvas { getContext () { return gl; } }
    const window = { addEventListener () {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'tools/dev/air-prelude.js'), 'utf8'), { window, HTMLCanvasElement: Canvas });
    const ctx = new Canvas().getContext('webgl');
    assert.strictEqual(ctx.drawElements(), 42); ctx.getShaderParameter({}, 1); ctx.getProgramParameter({}, 2);
    assert.strictEqual(errorReads, 0);
    assert.strictEqual(window.__glStats.draws, 1); assert.strictEqual(window.__glStats.shaderErrs.length, 1);
    assert.strictEqual(window.__glStats.linkErrs.length, 1);
    const result = { ok: true, reloads: after.exampleReloads, engineBuilds: after.engineRebuilds.length,
        airBuilds: after.airRebuilds.length, exampleErrorRecovery: true, importMaps: 1, webglErrorsConsumed: errorReads };
    fs.mkdirSync(path.join(root, 'output/playwright'), { recursive: true });
    fs.writeFileSync(path.join(root, 'output/playwright/v03-dev-loop.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    child.kill();
});
