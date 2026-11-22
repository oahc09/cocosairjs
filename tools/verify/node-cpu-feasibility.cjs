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
    const runIsolated = (specifier, body) => {
        const code = `
            import assert from 'node:assert/strict';
            import { realpathSync } from 'node:fs';
            import { isAbsolute, relative, resolve, sep } from 'node:path';
            import { fileURLToPath } from 'node:url';
            const keys = ['window', 'document', 'HTMLElement', 'HTMLCanvasElement', 'WebGL2RenderingContext',
                'GPUDevice', 'cc', 'CocosEngine'];
            const assertClean = (checked = keys) => {
                for (const key of checked) assert.ok(!(key in globalThis), 'Unexpected browser global: ' + key);
                assert.equal(typeof globalThis.navigator?.gpu, 'undefined');
            };
            assertClean();
            const specifier = ${JSON.stringify(specifier)};
            if (${Boolean(consumer)}) {
                const installedRoot = resolve('node_modules', 'cocosair.js');
                assert.equal(realpathSync(installedRoot), realpathSync('.') + sep + 'node_modules' + sep + 'cocosair.js');
                const relativeModule = relative(realpathSync(installedRoot),
                    realpathSync(fileURLToPath(import.meta.resolve(specifier))));
                assert.ok(relativeModule && !isAbsolute(relativeModule) && relativeModule.split(sep)[0] !== '..',
                    'Bare specifier did not resolve inside the installed package: ' + relativeModule);
            }
            ${body}
        `;
        const execution = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
            cwd: consumer ? path.resolve(consumer) : root,
            encoding: 'utf8',
            env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^NODE_(OPTIONS|PATH)$/i.test(key))),
            timeout: 15000,
            maxBuffer: 128 * 1024,
        });
        assert.equal(execution.status, 0, execution.error?.message || execution.stderr);
        return JSON.parse(execution.stdout);
    };
    const math = runIsolated(
        modules[0],
        `
        const math = await import(specifier);
        assertClean();
        assert.equal(typeof math.Node, 'undefined');
        assert.equal(typeof math.createAirApp, 'undefined');
        const { Mat4, Quat, Vec3 } = math;
        const xyz = ({ x, y, z }) => [x, y, z];
        const transform = (m, v) => xyz(Vec3.transformMat4(new Vec3(), v, m));
        const trs = (translation, scale) => Mat4.fromRTS(new Mat4(), new Quat(), translation, scale);
        const transformedPoint = transform(trs(new Vec3(4, 5, 6), new Vec3(2, 2, 2)), new Vec3(1, 2, 3));
        assert.deepEqual(transformedPoint, [6, 9, 12]);
        const measure = (parentX) => {
            const parent = trs(new Vec3(parentX, 4, 5), new Vec3(-2, 3, 0.5));
            const child = trs(new Vec3(1, -1, 2), new Vec3(1, 1, 1));
            const composed = Mat4.multiply(new Mat4(), parent, child);
            const corners = [-1, 1].flatMap(x => [-2, 2].flatMap(y =>
                [-3, 3].map(z => transform(composed, new Vec3(x, y, z)))));
            const min = [0, 1, 2].map(axis => Math.min(...corners.map(point => point[axis])));
            const max = [0, 1, 2].map(axis => Math.max(...corners.map(point => point[axis])));
            return { center: transform(composed, new Vec3()), min, max };
        };
        const initial = measure(3);
        const moved = measure(10);
        assert.deepEqual(initial, { center: [1, 1, 6], min: [-1, -5, 4.5], max: [3, 7, 7.5] });
        assert.deepEqual(moved, { center: [8, 1, 6], min: [6, -5, 4.5], max: [10, 7, 7.5] });
        assertClean();
        console.log(JSON.stringify({
            status: 'PASS', transformedPoint,
            signedScaleTransformedCorners: { initial, moved },
        }));
    `,
    );
    const main = runIsolated(
        modules[1],
        `
        let result;
        try {
            const runtime = await import(specifier);
            result = { status: 'IMPORT_ONLY', nodeExport: typeof runtime.Node === 'function' };
        } catch (error) {
            if (!(error instanceof ReferenceError) ||
                !/^(window|document|HTMLElement|HTMLCanvasElement) is not defined$/.test(error.message)) throw error;
            result = { status: 'BLOCKED_DOM_DEPENDENCY', error: error.message };
        }
        assertClean(keys.slice(0, -2));
        const runtimeGlobals = keys.slice(-2).filter((key) => key in globalThis);
        console.log(JSON.stringify({ ...result, runtimeGlobals }));
    `,
    );
    const report = {
        mode,
        node: process.version,
        math,
        main,
        scene: { status: 'NOT_VALIDATED', checks: ['hierarchy', 'bounds', 'fixed-step'] },
        rendererInitialized: false,
        gpuValidated: false,
        visuallyPresented: false,
    };
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
