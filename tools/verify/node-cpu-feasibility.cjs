/* Read-only feasibility probe. No DOM shim, mock device or browser renderer. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');

function run({ consumer, requireScene = false } = {}) {
    const mode = consumer ? 'installed-package' : 'workspace-bundle';
    const modules = consumer
        ? ['cocosair.js/math', 'cocosair.js']
        : ['cocosair.math.js', 'cocosair.module.js'].map((name) => pathToFileURL(path.join(root, 'build', name)).href);
    if (consumer) assert.ok(fs.statSync(consumer).isDirectory(), 'Consumer directory is required');
    const code = `
        import assert from 'node:assert/strict';
        const keys = ['window', 'document', 'HTMLElement', 'HTMLCanvasElement', 'WebGL2RenderingContext',
            'GPUDevice', 'cc', 'CocosEngine'];
        const assertClean = (checked = keys) => {
            for (const key of checked) assert.ok(!(key in globalThis), 'Unexpected browser global: ' + key);
            assert.equal(typeof globalThis.navigator?.gpu, 'undefined');
        };
        assertClean();
        const math = await import(${JSON.stringify(modules[0])});
        assertClean();
        assert.equal(typeof math.Node, 'undefined');
        assert.equal(typeof math.createAirApp, 'undefined');
        const local = new math.Vec3(1, 2, 3);
        const world = new math.Vec3();
        const worldMatrix = new math.Mat4();
        math.Mat4.fromRTS(worldMatrix, new math.Quat(), new math.Vec3(4, 5, 6), new math.Vec3(2, 2, 2));
        math.Vec3.transformMat4(world, local, worldMatrix);
        assert.deepEqual([world.x, world.y, world.z], [6, 9, 12]);
        let main;
        try {
            const runtime = await import(${JSON.stringify(modules[1])});
            main = { status: 'IMPORT_ONLY', nodeExport: typeof runtime.Node === 'function' };
        } catch (error) {
            if (!(error instanceof ReferenceError) ||
                !/^(window|document|HTMLElement|HTMLCanvasElement) is not defined$/.test(error.message)) throw error;
            main = { status: 'BLOCKED_DOM_DEPENDENCY', error: error.message };
        }
        assertClean(keys.slice(0, -2));
        const runtimeGlobals = keys.slice(-2).filter((key) => key in globalThis);
        console.log(JSON.stringify({
            node: process.version, math: { status: 'PASS', transformedPoint: [6, 9, 12] }, main: { ...main, runtimeGlobals },
            scene: { status: 'NOT_VALIDATED', checks: ['hierarchy', 'bounds', 'fixed-step'] },
            rendererInitialized: false, gpuValidated: false, visuallyPresented: false,
        }));
    `;
    const execution = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
        cwd: consumer ? path.resolve(consumer) : root,
        encoding: 'utf8',
        env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^NODE_OPTIONS$/i.test(key))),
        timeout: 15000,
        maxBuffer: 128 * 1024,
    });
    assert.equal(execution.status, 0, execution.error?.message || execution.stderr);
    const report = { mode, ...JSON.parse(execution.stdout) };
    return { report, exitCode: requireScene ? 2 : 0 };
}

if (require.main === module) {
    const args = process.argv.slice(2);
    try {
        assert.ok(new Set(args).size === args.length);
        assert.ok(args.every((arg) => arg.startsWith('--consumer=') || arg === '--require-scene'));
        const consumers = args.filter((arg) => arg.startsWith('--consumer='));
        assert.ok(consumers.length <= 1);
        const consumer = consumers[0]?.slice('--consumer='.length);
        assert.ok(consumers.length === 0 || consumer, 'Consumer directory is required');
        const { report, exitCode } = run({ consumer, requireScene: args.includes('--require-scene') });
        console.log(JSON.stringify(report));
        process.exitCode = exitCode;
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { run };
