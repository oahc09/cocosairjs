import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
/* Opt-in exact Three source pool diagnostic through a software Dawn host. */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const lock = require('./three-experiment-2026-11-18.json');
const { buildSync, version: esbuild } = require('esbuild');
const pins = lock.experiments.find(({ id }) => id === 'webgpu-timestamp-batching');
const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', timeout: 10000 }).trim();
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const artifact = (name) => path.join(out, name);
const entry = 'src/renderers/webgpu/utils/WebGPUTimestampQueryPool.js';
const opts = {};
for (const arg of process.argv.slice(2)) {
    const match = /^--(before|after|out|dawn)=(.+)$/.exec(arg);
    assert.ok(match && !Object.hasOwn(opts, match[1]), 'Specify --before=DIR --after=DIR --out=NEW_DIR --dawn=FILE');
    opts[match[1]] = path.resolve(match[2]);
}
assert.equal(Object.keys(opts).length, 4, 'Specify --before=DIR --after=DIR --out=NEW_DIR --dawn=FILE');
const { out } = opts;
fs.mkdirSync(out);
const builds = {};
function buildArm(arm) {
    const dir = opts[arm];
    const commit = git(dir, 'rev-parse', 'HEAD');
    assert.equal(commit, pins[arm], 'Wrong pinned Three SHA');
    assert.equal(git(dir, 'status', '--porcelain', '--untracked-files=all', '--', 'src', 'package.json'), '');
    const tree = new Map(
        git(dir, 'ls-tree', '-r', 'HEAD', 'src', 'package.json')
            .split('\n')
            .map((line) => {
                const record = /^100(?:644|755) blob ([0-9a-f]{40})\t(.+)$/.exec(line);
                assert.ok(record, 'Unexpected tree record');
                return [record[2], record[1]];
            }),
    );
    const output = artifact(arm + '.mjs');
    const { metafile } = buildSync({
        absWorkingDir: dir,
        entryPoints: [entry],
        outfile: output,
        bundle: true,
        platform: 'node',
        format: 'esm',
        ignoreAnnotations: true,
        metafile: true,
    });
    for (const input of ['package.json', ...Object.keys(metafile.inputs)]) {
        assert.ok(input === 'package.json' || input.startsWith('src/'));
        const file = path.join(dir, input);
        assert.equal(fs.realpathSync(file), path.join(fs.realpathSync(dir), input));
        const bytes = fs.readFileSync(file);
        const digest = createHash('sha1')
            .update('blob ' + bytes.length + '\0')
            .update(bytes)
            .digest('hex');
        assert.equal(digest, tree.get(input), 'Changed Three Git blob: ' + input);
    }
    writeFileSync(artifact(arm + '.meta.json'), JSON.stringify(metafile, null, 2) + '\n');
    return { commit, sourceTree: git(dir, 'rev-parse', 'HEAD:src'), bundleSha256: sha(fs.readFileSync(output)) };
}
function bounded(task, ms, label) {
    const stop = new AbortController();
    return Promise.race([
        task,
        sleep(ms, null, { signal: stop.signal }).then(() => {
            throw Error(label + ' timed out');
        }),
    ]).finally(() => stop.abort());
}
const watchdog = setTimeout(() => {
    const failure = { status: 'FAIL', error: 'Overall Dawn diagnostic timed out', builds };
    writeFileSync(artifact('failure.json'), JSON.stringify(failure, null, 2) + '\n');
    console.error(failure.error);
    process.exit(1);
}, 30000);
let cleanup = () => {};
async function main() {
    for (const arm of ['before', 'after']) builds[arm] = buildArm(arm);
    assert.equal(path.basename(opts.dawn), 'index.js', 'Pass the official WebGPU for Node package entry');
    const dawnEntry = fs.realpathSync(opts.dawn);
    const dawnDir = path.dirname(dawnEntry);
    const dawnPackage = JSON.parse(fs.readFileSync(path.join(dawnDir, 'package.json'), 'utf8'));
    assert.equal(dawnPackage.name, 'webgpu');
    assert.equal(dawnPackage.version, '0.6.2');
    assert.equal(dawnPackage.repository?.url, 'git+https://github.com/dawn-gpu/node-webgpu.git');
    const arch = process.platform === 'darwin' ? 'universal' : process.arch;
    const nativeAddon = path.join(dawnDir, 'dist', process.platform + '-' + arch, 'dawn.node');
    const dawnNativeSha256 = sha(fs.readFileSync(nativeAddon));
    const { create, globals } = await import(pathToFileURL(dawnEntry).href);
    Object.assign(globalThis, globals);
    const gpu = create(['backend=vulkan']);
    const adapter = await bounded(gpu.requestAdapter(), 3000, 'requestAdapter');
    assert.ok(adapter?.features.has('timestamp-query'), 'Dawn adapter does not support timestamp-query');
    assert.equal(adapter.info.isFallbackAdapter, true, 'Software fallback adapter required for this control');
    const device = await bounded(
        adapter.requestDevice({ requiredFeatures: ['timestamp-query'] }),
        3000,
        'requestDevice',
    );
    cleanup = () => device.destroy();
    assert.ok(device.features.has('timestamp-query'));
    const uncaptured = [];
    device.addEventListener('uncapturederror', (e) => uncaptured.push(e.error.message));
    device.pushErrorScope('validation');
    const s = device.createShaderModule({
        code: `
    @vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {
      var p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3)); return vec4f(p[i],0,1);
    }
    @fragment fn fs()->@location(0) vec4f{return vec4f(1,0,0,1);}
    @group(0) @binding(0) var<storage,read_write> result:array<u32>;
    @compute @workgroup_size(64) fn cs(@builtin(global_invocation_id) i:vec3u) {result[i.x]=i.x*23u+7u;}
`,
    });
    const rp = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: s, entryPoint: 'vs' },
        fragment: { module: s, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
    });
    const cp = device.createComputePipeline({ layout: 'auto', compute: { module: s, entryPoint: 'cs' } });
    const tex = device.createTexture({
        size: [128, 128],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const data = device.createBuffer({ size: 65536, usage: GPUBufferUsage.STORAGE });
    const group = device.createBindGroup({
        layout: cp.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: data } }],
    });
    function submit(kind, timestampWrites) {
        const t = performance.now(),
            enc = device.createCommandEncoder();
        if (kind === 'render') {
            const pass = enc.beginRenderPass({
                colorAttachments: [
                    { view: tex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] },
                ],
                timestampWrites,
            });
            pass.setPipeline(rp);
            pass.draw(3);
            pass.end();
        } else {
            const pass = enc.beginComputePass({ timestampWrites });
            pass.setPipeline(cp);
            pass.setBindGroup(0, group);
            pass.dispatchWorkgroups(256);
            pass.end();
        }
        device.queue.submit([enc.finish()]);
        return performance.now() - t;
    }
    const kinds = ['render', 'compute', 'render', 'compute', 'render'];
    for (const kind of kinds) submit(kind);
    await bounded(device.queue.onSubmittedWorkDone(), 5000, 'warmup work');
    const outputs = [];
    for (const arm of ['before', 'after']) {
        const Pool = (await import(pathToFileURL(artifact(arm + '.mjs')).href)).default;
        const old = arm === 'before';
        const pools = old
            ? { render: new Pool(device, 'render', 4), compute: new Pool(device, 'compute', 4) }
            : { shared: new Pool(device, 4) };
        let phase = 'collection',
            active = 0,
            peak = 0,
            qid = 0;
        const qids = new WeakMap(),
            maps = [],
            rows = [],
            submitCpuMs = [],
            drains = [];
        const allocs = new WeakMap(),
            oldBySlot = { render: new Map(), compute: new Map() };
        const timer = old ? null : pools.shared.beginTimer();
        const currentQid = (q) => {
            if (!qids.has(q)) qids.set(q, ++qid);
            return qids.get(q);
        };
        const peakByPool = {};
        for (const [name, pool] of Object.entries(pools)) {
            let currentRead = null,
                inFlight = 0;
            const original = pool._resolveQueries.bind(pool);
            pool._resolveQueries = (...args) => {
                assert.equal(currentRead, null);
                const q = old ? pool.querySet : args[0].querySet;
                const identities = old
                    ? [...pool.queryOffsets.entries()].map(([uid, slot]) => {
                          assert.equal(oldBySlot[name].get(slot).uid, uid);
                          return oldBySlot[name].get(slot);
                      })
                    : [...args[0].queryTimers.keys()].map((slot) => allocs.get(q).get(slot));
                currentRead = { querySet: currentQid(q), identities };
                return original(...args).finally(() => (currentRead = null));
            };
            const buf = pool.resultBuffer;
            const map = buf.mapAsync.bind(buf);
            const read = buf.getMappedRange.bind(buf);
            buf.mapAsync = async (...args) => {
                const stamp = {
                    pool: name,
                    phase,
                    bytes: args[2],
                    querySet: currentRead.querySet,
                    ordinals: currentRead.identities.map((x) => x.ordinal),
                };
                maps.push(stamp);
                const t = performance.now();
                peak = Math.max(peak, ++active);
                peakByPool[name] = Math.max(peakByPool[name] || 0, ++inFlight);
                try {
                    await bounded(map(...args), 3000, 'map ' + name);
                } finally {
                    stamp.mapMs = performance.now() - t;
                    stamp.completePhase = phase;
                    active--;
                    inFlight--;
                }
            };
            buf.getMappedRange = (...args) => {
                const buffer = read(...args);
                const times = new BigUint64Array(buffer);
                assert.equal(times.length, currentRead.identities.length * 2);
                for (const identity of currentRead.identities) {
                    const { slot } = identity;
                    rows.push({
                        ...identity,
                        startNs: String(times[slot]),
                        endNs: String(times[slot + 1]),
                        readPhase: phase,
                    });
                }
                return buffer;
            };
        }
        for (const [ordinal, kind] of kinds.entries()) {
            if (ordinal === 2) for (let i = 0; i < 16; i++) submit('compute'); // Deliberate untracked queue work.
            const pool = old ? pools[kind] : pools.shared;
            const uid = kind + '-' + ordinal + ':f1';
            const slot = old ? pool.allocateQueriesForContext(uid) : pool.allocateQueries();
            assert.notEqual(slot, null);
            const q = pool.querySet;
            const identity = { frame: 1, ordinal, kind, uid, slot, querySet: currentQid(q) };
            if (!allocs.has(q)) allocs.set(q, new Map());
            allocs.get(q).set(slot, identity);
            if (old) oldBySlot[kind].set(slot, identity);
            submitCpuMs.push(
                submit(kind, { querySet: q, beginningOfPassWriteIndex: slot, endOfPassWriteIndex: slot + 1 }),
            );
        }
        let settled = false;
        let settledAtRows = null;
        if (timer)
            pools.shared.endTimer(timer).then(() => {
                settled = true;
                settledAtRows = rows.length;
            });
        const collectedBeforeDrain = rows.length;
        assert.ok(!settled);
        phase = 'drain';
        const deadline = performance.now() + 5000;
        while (rows.length < kinds.length || active !== 0 || (timer && !settled)) {
            assert.ok(performance.now() < deadline, 'bounded drain timed out');
            const state = { rows: rows.length, active, pendingTimer: timer?.pending ?? null };
            if (JSON.stringify(drains.at(-1)) !== JSON.stringify(state)) drains.push(state);
            for (const pool of Object.values(pools)) {
                if (old) void pool.resolveQueriesAsync();
                else pool.resolveQueries();
            }
            await sleep(1);
        }
        rows.sort((a, b) => a.ordinal - b.ordinal);
        assert.deepEqual(
            rows.map(({ ordinal, kind }) => [ordinal, kind]),
            kinds.map((kind, i) => [i, kind]),
        );
        const raw = rows.map(({ startNs, endNs }) => [BigInt(startNs), BigInt(endNs)]);
        for (const [a, b] of raw) assert.ok(a > 0n && b >= a, 'invalid raw interval');
        for (let i = 1; i < raw.length; i++)
            assert.ok(raw[i][0] >= raw[i - 1][1], 'same-queue intervals must be serial');
        const sum = raw.reduce((a, [s, e]) => a + e - s, 0n);
        const zeroQuantizedRows = raw.filter(([s, e]) => s === e).length;

        const span = raw.at(-1)[1] - raw[0][0];
        assert.ok(span >= sum);
        if (timer) {
            assert.equal(pools.shared.getDuration(timer), Number(span) / 1e6);
            assert.deepEqual(
                maps.map((x) => x.bytes),
                [32, 32, 16],
            );
            assert.equal(peak, 1);
            assert.equal(timer.pending, 0);
            assert.equal(settledAtRows, kinds.length);
            assert.equal(timer.lost, false);
        }
        assert.ok(Object.values(peakByPool).every((x) => x === 1));
        outputs.push({
            arm,
            ...builds[arm],
            rows,
            zeroQuantizedRows,
            durationEvidence: sum > 0n && span > sum ? 'DISTINCT_SPAN_AND_SUM' : 'INCONCLUSIVE_AT_ADAPTER_PRECISION',
            maps,
            peak,
            peakByPool,
            drains,
            collectedBeforeDrain,
            settledAtRows,
            submitCpuMs,
            sumNs: String(sum),
            spanNs: String(span),
            newPoolDurationMs: timer ? pools.shared.getDuration(timer) : null,
        });
        await bounded(Promise.all(Object.values(pools).map((pool) => pool.dispose())), 5000, 'pool disposal');
    }
    const validation = await bounded(device.popErrorScope(), 3000, 'validation scope');
    assert.equal(validation, null, validation?.message);
    assert.deepEqual(uncaptured, []);
    const { vendor, architecture, device: deviceId, description, isFallbackAdapter } = adapter.info;
    const result = {
        esbuild,
        node: process.version,
        dawnVersion: dawnPackage.version,
        dawnNativeSha256,
        dawnModuleSha256: sha(fs.readFileSync(dawnEntry)),
        harnessSha256: sha(fs.readFileSync(new URL(import.meta.url))),
        status: 'PASS_DAWN_SOFTWARE_TIMESTAMP_CONTROL',
        adapter: { vendor, architecture, deviceId, description, isFallbackAdapter },
        timestampQuery: true,
        untrackedSentinel: { afterOrdinal: 1, computePasses: 16 },
        outputs,
        noNativeBrowserOrHardwarePerformanceClaim: true,
    };
    writeFileSync(artifact('result.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(result.status);
    tex.destroy();
    data.destroy();
}
try {
    await main();
} catch (error) {
    writeFileSync(
        artifact('failure.json'),
        JSON.stringify({ status: 'FAIL', error: error.stack, builds }, null, 2) + '\n',
    );
    console.error(error);
    process.exitCode = 1;
} finally {
    cleanup();
    clearTimeout(watchdog);
}
