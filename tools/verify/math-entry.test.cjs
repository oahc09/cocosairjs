/* Standalone canonical math tests. Browser/main-entry acceptance is separate. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { Worker } = require('node:worker_threads');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');
const { buildMathModule } = require('../build/math-module.cjs');
const root = path.resolve(__dirname, '../..');
let math, receipt;
const temporary = [];
const temp = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-math-'));
    temporary.push(dir);
    return dir;
};
test.after(() => {
    for (const directory of temporary) fs.rmSync(directory, { recursive: true, force: true });
});
test('isolated Node import preserves every descriptor after an empty-ESM loader control', async (t) => {
    receipt = await buildMathModule(root);
    const url = pathToFileURL(path.join(root, 'build/cocosair.math.js')).href;
    const probe = spawnSync(
        process.execPath,
        [
            '--input-type=module',
            '-e',
            `
        import assert from 'node:assert/strict';
        const snapshot=()=>Object.getOwnPropertyDescriptors(globalThis);
        function differences(before,after) {
            const changes=[];
            for(const key of new Set([...Reflect.ownKeys(before),...Reflect.ownKeys(after)])) {
                const a=before[key],b=after[key];
                if(!a||!b||['value','get','set','writable','enumerable','configurable'].some(field=>!Object.is(a[field],b[field]))) changes.push(String(key));
            }
            return changes;
        }
        const beforeLoader=snapshot();
        await import('data:text/javascript,export const empty = true');
        const beforeMath=snapshot(), loaderChanges=differences(beforeLoader,beforeMath);
        const math=await import(${JSON.stringify(url)});
        const afterMath=snapshot(),mathChanges=differences(beforeMath,afterMath);
        assert.deepEqual(mathChanges,[], 'math changed host globals');
        assert.equal(new math.Vec3(3,4,12).length(),13);
        await import('data:text/javascript,globalThis.__airMathPollutionControl = 42');
        const polluted=differences(afterMath,snapshot());
        assert.deepEqual(polluted,['__airMathPollutionControl']);
        assert.throws(()=>assert.deepEqual(polluted,[]));
        delete globalThis.__airMathPollutionControl;
        assert.deepEqual(differences(afterMath,snapshot()),[]);
        console.log(JSON.stringify({node:process.version,loaderChanges,mathChanges,pollutionDetected:true,exports:Object.keys(math).sort()}));
    `,
        ],
        { encoding: 'utf8', timeout: 15000 },
    );
    assert.equal(probe.status, 0, probe.stderr);
    const result = JSON.parse(probe.stdout);
    assert.deepEqual(result.exports, receipt.exports);
    t.diagnostic(
        JSON.stringify({
            node: result.node,
            loaderChanges: result.loaderChanges,
            mathChanges: result.mathChanges,
            pollutionDetected: result.pollutionDetected,
        }),
    );
    // Other numeric tests use their own module instance in the test process.
    math = await import(url);
    assert.equal(new math.Vec3(3, 4, 12).toVec2().length(), 5);
});
test('canonical quaternion, matrix, vector and color algorithms remain usable', () => {
    const { Vec3, Quat, Mat4, Color } = math;
    const q = new Quat();
    Quat.fromEuler(q, 13, -29, 47);
    const transform = new Mat4();
    Mat4.fromRTS(transform, q, new Vec3(1, -2, 3), new Vec3(2, 3, 4));
    const inverse = new Mat4();
    Mat4.invert(inverse, transform);
    const source = new Vec3(2, 4, 8),
        world = new Vec3(),
        roundtrip = new Vec3();
    Vec3.transformMat4(world, source, transform);
    Vec3.transformMat4(roundtrip, world, inverse);
    for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(roundtrip[axis] - source[axis]) < 1e-10);
    const cross = new Vec3();
    Vec3.cross(cross, new Vec3(1, 0, 0), new Vec3(0, 1, 0));
    assert.equal(cross.z, 1);
    assert.equal(Color.fromHEX(new Color(), '#4080c0').toHEX(), '4080c0');
    assert.equal(math.clamp01(-1), 0);
    assert.equal(math.clamp01(2), 1);
});
test('real Node Worker imports without global, window or document aliases', async () => {
    const url = pathToFileURL(path.join(root, 'build/cocosair.math.js')).href;
    const worker = new Worker(
        `const { parentPort } = require('node:worker_threads'); delete globalThis.global; import(${JSON.stringify(url)}).then(m => parentPort.postMessage({ length:new m.Vec3(3,4,12).length(), aliases:['global','window','document','cc','CocosEngine'].filter(k=>k in globalThis) })).catch(e=>{throw e});`,
        { eval: true },
    );
    const messages = [];
    await new Promise((resolve, reject) => {
        worker.on('message', (m) => messages.push(m));
        worker.on('error', reject);
        worker.on('exit', (code) => (code ? reject(Error('worker exit ' + code)) : resolve()));
    });
    assert.deepEqual(messages, [{ length: 13, aliases: [] }]);
});
test('worker-like VM rejects every DOM access and keeps the namespace private', async () => {
    const code = await esbuild.transform(fs.readFileSync(path.join(root, 'build/cocosair.math.js'), 'utf8'), {
        format: 'cjs',
        target: 'es2020',
    });
    const sandbox = { module: { exports: {} }, console };
    for (const key of ['window', 'document'])
        Object.defineProperty(sandbox, key, {
            get() {
                throw Error('Unexpected ' + key);
            },
        });
    vm.runInNewContext(code.code, sandbox);
    assert.equal(new sandbox.module.exports.Vec4(1, 2, 2, 4).length(), 5);
    assert.equal('cc' in sandbox, false);
    assert.equal('CocosEngine' in sandbox, false);
});
test('independent source tree reproduces JS, declarations and source receipt byte-for-byte', async () => {
    const independent = temp();
    for (const relative of Object.keys(receipt.inputs)) {
        const target = path.join(independent, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(root, relative), target);
    }
    const again = await buildMathModule(independent);
    assert.deepEqual(again, receipt);
    for (const file of [...Object.keys(receipt.outputs), 'math-build.json'])
        assert.deepEqual(
            fs.readFileSync(path.join(independent, 'build', file)),
            fs.readFileSync(path.join(root, 'build', file)),
        );
});
test('installed-package-shaped Node consumer resolves cocosair.js/math', () => {
    // Resolves the exact manifest; full npm tarball/type acceptance is a separate gate.
    const consumer = temp(),
        pkg = path.join(consumer, 'node_modules/cocosair.js');
    fs.mkdirSync(path.join(pkg, 'build/npm'), { recursive: true });
    fs.copyFileSync(path.join(root, 'package.json'), path.join(pkg, 'package.json'));
    fs.writeFileSync(path.join(pkg, 'build/package.json'), '{"type":"module"}');
    fs.copyFileSync(path.join(root, 'build/cocosair.math.js'), path.join(pkg, 'build/npm/cocosair.math.js'));
    const run = spawnSync(
        process.execPath,
        [
            '--input-type=module',
            '-e',
            "import {Vec3} from 'cocosair.js/math'; if(new Vec3(3,4,12).length()!==13)process.exit(2)",
        ],
        { cwd: consumer, encoding: 'utf8' },
    );
    assert.equal(run.status, 0, run.stderr);
});
