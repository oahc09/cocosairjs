/* Run the unchanged lifecycle contract, then independently consume native ownership counters.
 * No APK installation, SDK changes, device configuration changes or historical evidence writes.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const lifecycle = require('./runtime-interop-android-lifecycle.cjs');
const LIFECYCLE_SHA256 = '12c360ece283e99b8fae3925b43e7afeb4772d083e98dc9da6b5332ccfec6ef7';
const TYPES = [
    'canvasTexture',
    'canvasView',
    'buffer',
    'texture',
    'textureView',
    'shaderModule',
    'renderPipeline',
    'computePipeline',
    'sampler',
    'bindGroupLayout',
    'bindGroup',
    'pipelineLayout',
    'commandEncoder',
    'commandBuffer',
    'renderPass',
    'computePass',
    'renderBundleEncoder',
    'renderBundle',
];
const FIELDS = ['acquired', 'released', 'live', 'peak'];
const MAX_PERIODIC_GAP_MS = 15000;
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const check = (condition, message) => {
    if (!condition) throw Error(message);
};
const portable = (file) => path.relative(process.cwd(), file).replace(/\\/g, '/');
const identity = (file) => ({
    file: portable(file),
    bytes: fs.statSync(file).size,
    sha256: sha(fs.readFileSync(file)),
});

function parseArgs(argv) {
    let baseline = 'output/runtime-interop/android-lifecycle-16k-attempt-1/report.json';
    let specified = false;
    const forwarded = [];
    for (const argument of argv) {
        if (argument.startsWith('--baseline-report=')) {
            check(!specified && argument.length > '--baseline-report='.length, 'Duplicate or empty baseline report');
            specified = true;
            baseline = argument.slice('--baseline-report='.length);
        } else forwarded.push(argument);
    }
    return { ...lifecycle.parseArgs(forwarded), baseline, forwarded };
}

function integer(value, description) {
    check(Number.isSafeInteger(value) && value >= 0, 'Invalid nonnegative counter: ' + description);
}

function ledger(value, description, previous, wrapper = false) {
    const fields = wrapper ? ['created', 'finalized', 'live', 'peak'] : FIELDS;
    check(value && typeof value === 'object' && !Array.isArray(value), 'Missing resource ledger: ' + description);
    check(
        Object.keys(value).sort().join(',') === [...fields].sort().join(','),
        'Unexpected counter fields: ' + description,
    );
    for (const field of fields) integer(value[field], description + '.' + field);
    const acquired = wrapper ? 'created' : 'acquired';
    const released = wrapper ? 'finalized' : 'released';
    check(
        value[acquired] - value[released] === value.live && value.peak >= value.live,
        'Ownership conservation failed: ' + description,
    );
    if (previous) {
        check(
            value[acquired] >= previous[acquired] &&
                value[released] >= previous[released] &&
                value.peak >= previous.peak,
            'Cumulative counters decreased: ' + description,
        );
    }
}

function parseEpochLog(text) {
    return text
        .split(/\r?\n/)
        .map((raw, line) => {
            const match = /^\s*(\d+\.\d+)\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+([^:]+):\s?(.*)$/.exec(raw);
            return (
                match && {
                    raw,
                    line: line + 1,
                    epochSeconds: Number(match[1]),
                    pid: Number(match[2]),
                    tag: match[5].trim(),
                    message: match[6],
                }
            );
        })
        .filter(Boolean);
}

function trend(snapshots, select) {
    const values = snapshots.map((row) => ({
        sequence: row.value.sequence,
        steadyMs: row.value.steadyMs,
        ...select(row.value),
    }));
    const first = values[0],
        last = values.at(-1);
    const changes = values.slice(1).map((value, index) => value.live - values[index].live);
    const increases = changes.filter((n) => n > 0).length;
    const decreases = changes.filter((n) => n < 0).length;
    return {
        first,
        last,
        minimumLive: Math.min(...values.map((v) => v.live)),
        maximumLive: Math.max(...values.map((v) => v.live)),
        liveDelta: last.live - first.live,
        acquiredDelta: last.acquired === undefined ? null : last.acquired - first.acquired,
        releasedDelta: last.released === undefined ? null : last.released - first.released,
        createdDelta: last.created === undefined ? null : last.created - first.created,
        finalizedDelta: last.finalized === undefined ? null : last.finalized - first.finalized,
        increasingIntervals: increases,
        decreasingIntervals: decreases,
        constantIntervals: changes.length - increases - decreases,
        monotoneNonDecreasingWithNetGrowth: decreases === 0 && last.live > first.live,
        observedReclamation: decreases > 0,
        interpretation:
            'Observed sampled ownership flow; collection phase and GC timing are retained, not replaced with an arbitrary live-object threshold',
    };
}

function reassembleSnapshots(records) {
    const values = [];
    const sequences = new Set();
    let pending;
    let lastTime = -Infinity;
    for (const row of records) {
        check(row.epochSeconds >= lastTime, 'Resource log transport time moved backwards');
        lastTime = row.epochSeconds;
        if (row.message.startsWith('RESOURCE_SNAPSHOT ')) {
            check(!pending, 'Single-line snapshot interrupted an incomplete part sequence');
            const text = row.message.slice('RESOURCE_SNAPSHOT '.length);
            const value = JSON.parse(text);
            integer(value.sequence, 'snapshot sequence');
            check(!sequences.has(value.sequence), 'Duplicate complete resource snapshot sequence');
            sequences.add(value.sequence);
            values.push({
                ...row,
                value,
                transport: {
                    kind: 'single-line',
                    line: row.line,
                    raw: row.raw,
                    rawLineSha256: sha(Buffer.from(row.raw)),
                    payloadBytes: Buffer.byteLength(text),
                    payloadSha256: sha(Buffer.from(text)),
                },
            });
            continue;
        }
        check(row.message.startsWith('RESOURCE_SNAPSHOT_PART '), 'Unknown resource transport record');
        const match = /^RESOURCE_SNAPSHOT_PART (0|[1-9]\d*) (0|[1-9]\d*)\/(0|[1-9]\d*) ([\s\S]+)$/.exec(row.message);
        check(match, 'Resource part prefix differs from the fixed sequence/index/total protocol');
        const part = {
            sequence: Number(match[1]),
            index: Number(match[2]),
            total: Number(match[3]),
            payload: match[4],
        };
        integer(part.sequence, 'part sequence');
        integer(part.index, 'part index');
        integer(part.total, 'part count');
        check(
            part.total > 0 && part.total <= 64 && part.index < part.total && part.payload.length > 0,
            'Resource part bounds or payload are invalid',
        );
        check(
            !/[^\x20-\x7e]/.test(part.payload) &&
                Buffer.byteLength(part.payload) <= 512 &&
                Buffer.byteLength(row.message) <= 700,
            'Resource part is not a bounded ASCII transport chunk',
        );
        if (part.index < part.total - 1)
            check(
                Buffer.byteLength(part.payload) === 512,
                'Nonfinal resource transport chunk does not contain the original 512 bytes',
            );
        check(!sequences.has(part.sequence), 'Resource part repeats a completed sequence');
        if (!pending) {
            check(part.index === 0, 'Resource snapshot is missing its first part');
            pending = { first: row, sequence: part.sequence, total: part.total, payloads: [], parts: [] };
        }
        check(
            part.sequence === pending.sequence && part.total === pending.total && row.pid === pending.first.pid,
            'Resource part sequence, count or PID was interleaved',
        );
        check(part.index === pending.parts.length, 'Resource snapshot part is missing, duplicated or out of order');
        pending.payloads.push(part.payload);
        pending.parts.push({
            index: part.index,
            line: row.line,
            raw: row.raw,
            rawLineSha256: sha(Buffer.from(row.raw)),
            epochSeconds: row.epochSeconds,
            pid: row.pid,
            payloadBytes: Buffer.byteLength(part.payload),
            payloadSha256: sha(Buffer.from(part.payload)),
        });
        if (pending.parts.length === pending.total) {
            const text = pending.payloads.join('');
            const value = JSON.parse(text);
            check(value.sequence === pending.sequence, 'Reassembled snapshot sequence differs from its envelopes');
            sequences.add(value.sequence);
            values.push({
                ...pending.first,
                value,
                transport: {
                    kind: 'ordered-parts',
                    sequence: pending.sequence,
                    total: pending.total,
                    lastEpochSeconds: row.epochSeconds,
                    payloadBytes: Buffer.byteLength(text),
                    payloadSha256: sha(Buffer.from(text)),
                    parts: pending.parts,
                },
            });
            pending = undefined;
        }
    }
    check(!pending, 'Resource snapshot ended with missing parts');
    return values;
}

function consumeResources(report, directory, openFindings) {
    const logFile = path.join(directory, 'logcat.txt');
    const records = parseEpochLog(fs.readFileSync(logFile, 'utf8'));
    const { nativePid, lowerEpochSeconds, upperEpochSecondsExclusive } = report.crashAudit || {};
    check(
        Number.isSafeInteger(nativePid) &&
            nativePid > 0 &&
            Number.isFinite(lowerEpochSeconds) &&
            Number.isFinite(upperEpochSecondsExclusive),
        'Lifecycle report lacks current-run PID and epoch bounds',
    );
    const current = records.filter(
        (row) =>
            row.pid === nativePid &&
            row.epochSeconds >= lowerEpochSeconds &&
            row.epochSeconds < upperEpochSecondsExclusive,
    );
    const selected = current.filter(
        (row) =>
            row.tag === 'MystralInterop' &&
            (row.message.startsWith('RESOURCE_SNAPSHOT ') || row.message.startsWith('RESOURCE_SNAPSHOT_PART ')),
    );
    check(selected.length >= 2, 'Native ownership snapshots are missing');
    const snapshots = reassembleSnapshots(selected);
    let previous;
    for (const row of snapshots) {
        const value = row.value;
        check(
            value.schema === 'mystral-webgpu-resource-snapshot-v1' &&
                value.pid === nativePid &&
                ['init', 'periodic', 'cleanup'].includes(value.stage),
            'Native resource snapshot schema, stage or PID differs',
        );
        integer(value.sequence, 'sequence');
        check(Number.isFinite(value.steadyMs) && value.steadyMs >= 0, 'Native resource steady clock is invalid');
        if (previous)
            check(
                value.sequence === previous.sequence + 1 && value.steadyMs >= previous.steadyMs,
                'Native resource snapshot sequence or clock is incomplete',
            );
        check(
            value.types && Object.keys(value.types).sort().join(',') === [...TYPES].sort().join(','),
            'Native resource type inventory differs',
        );
        for (const name of TYPES) ledger(value.types[name], name, previous?.types[name]);
        ledger(value.total, 'total', previous?.total);
        // Acquired/released/live are additive. Total peak is the peak concurrent total, not the sum of per-type peaks.
        for (const name of ['acquired', 'released', 'live'])
            check(
                value.total[name] === TYPES.reduce((sum, type) => sum + value.types[type][name], 0),
                'Typed ownership sum differs: ' + name,
            );
        check(
            value.total.peak <= TYPES.reduce((sum, type) => sum + value.types[type].peak, 0),
            'Concurrent total peak exceeds all per-type peaks',
        );
        ledger(value.wrapper, 'wrapper', previous?.wrapper, true);
        check(
            value.types.canvasTexture.peak <= 1,
            'More than one owned current Canvas texture was retained concurrently',
        );
        if (value.stage === 'periodic' || value.stage === 'cleanup')
            check(
                value.types.canvasTexture.live === 0 && value.types.canvasView.live === 0,
                'Canvas frame leases remain owned after frame expiration',
            );
        if (value.stage === 'init')
            check(!previous && value.total.live === 0, 'Resource init does not begin from an empty native ledger');
        if (value.stage === 'cleanup')
            check(
                value.total.live === 0 && TYPES.every((type) => value.types[type].live === 0),
                'Native binding-owned references remain after cleanup',
            );
        previous = value;
    }
    check(
        snapshots[0].value.stage === 'init' && snapshots.at(-1).value.stage === 'cleanup',
        'Native resource lifetime lacks init or final cleanup',
    );
    check(
        snapshots.filter((row) => row.value.stage === 'init').length === 1,
        'Native resource counters restarted within the process',
    );
    const result = {
        schema: 'mystral-webgpu-resource-snapshot-v1',
        scope: 'Only bindings-managed owned WGPU API result references; borrowed context/device/queue/adapter and internal native helpers are excluded',
        pass: true,
        nativePid,
        snapshots: snapshots.map(({ line, epochSeconds, value, transport }) => ({
            line,
            epochSeconds,
            transport,
            ...value,
        })),
        log: identity(logFile),
        nativeCleanupLive: snapshots.at(-1).value.total.live,
        wrapperCleanupLive: snapshots.at(-1).value.wrapper.live,
        wrapperCleanupZeroRequired: false,
        canvasTextureMaximumOwned: 1,
        canvasViewBoundaryOwned: 0,
        canvasViewPeak: snapshots.at(-1).value.types.canvasView.peak,
        canvasViewPeakInterpretation:
            'Multiple views of one current texture are legal; every sampled completed-frame boundary must release all owned Canvas views',
    };
    const samples = report.stages.continuous.samples || [];
    if (samples.length) {
        const inputRows = current.filter((row) => row.tag === 'MystralInterop' && row.message === 'EVENT demo-input');
        const maximumTap = samples.at(-1).event.taps;
        check(inputRows.length === maximumTap, 'Native input log does not bind all actual demo taps');
        const firstTap = samples[0].event.taps;
        const lastTap = maximumTap;
        const begin = inputRows[firstTap - 1].epochSeconds;
        const end = inputRows[lastTap - 1].epochSeconds;
        check(end > begin, 'Continuous native time window is invalid');
        const periodic = snapshots.filter(
            (row) => row.value.stage === 'periodic' && row.epochSeconds >= begin && row.epochSeconds <= end,
        );
        check(periodic.length >= 2, 'No continuous-stage periodic ownership coverage');
        const epochPoints = [begin, ...periodic.map((row) => row.epochSeconds), end];
        const gaps = epochPoints.slice(1).map((value, index) => (value - epochPoints[index]) * 1000);
        const steadyGaps = periodic
            .slice(1)
            .map((value, index) => value.value.steadyMs - periodic[index].value.steadyMs);
        check(
            gaps.every((n) => n >= 0 && n <= MAX_PERIODIC_GAP_MS) &&
                steadyGaps.every((n) => n >= 0 && n <= MAX_PERIODIC_GAP_MS),
            'Continuous ownership snapshot gap exceeds fifteen-second evidence coverage budget',
        );
        result.coverage = {
            status: 'PASS',
            firstTap,
            lastTap,
            beginEpochSeconds: begin,
            endEpochSeconds: end,
            periodicSnapshots: periodic.length,
            maximumEpochGapMs: Math.max(...gaps),
            maximumNativeSteadyGapMs: Math.max(...steadyGaps),
            maximumAllowedGapMs: MAX_PERIODIC_GAP_MS,
            meaning:
                'Coverage allowance for five-second native snapshot sampling, not an application performance target; pause/lock intervals outside the continuous stage are excluded',
        };
        result.typedFlows = Object.fromEntries(
            TYPES.map((type) => [type, trend(periodic, (value) => value.types[type])]),
        );
        result.totalFlow = trend(periodic, (value) => value.total);
        result.wrapperFlow = trend(periodic, (value) => value.wrapper);
        for (const [type, flow] of Object.entries(result.typedFlows)) {
            if (!['canvasTexture', 'canvasView'].includes(type) && flow.monotoneNonDecreasingWithNetGrowth) {
                openFindings.push({
                    kind: 'sampled-owned-reference-growth',
                    type,
                    liveDelta: flow.liveDelta,
                    increasingIntervals: flow.increasingIntervals,
                    decreasingIntervals: flow.decreasingIntervals,
                    meaning:
                        'Observed monotone live growth remains open; final cleanup zero does not establish bounded retention throughout execution',
                });
            }
        }
        if (result.wrapperFlow.monotoneNonDecreasingWithNetGrowth)
            openFindings.push({
                kind: 'sampled-wrapper-retention-growth',
                liveDelta: result.wrapperFlow.liveDelta,
                meaning:
                    'Wrapper reachability and GC timing require separate interpretation; native API counters do not prove all wrapper memory is bounded',
            });
    } else result.coverage = { status: 'NOT_RUN', reason: 'Diagnostic --soak-seconds=0 has no continuous stage' };
    return result;
}

function consumeMemory(report, directory) {
    const pid = report.crashAudit?.nativePid;
    check(Number.isSafeInteger(pid), 'Memory samples lack a bound native PID');
    const values = [];
    for (const sample of report.stages.continuous.samples || []) {
        const file = path.join(directory, sample.label + '.meminfo.txt');
        if (!fs.existsSync(file)) continue;
        const raw = fs.readFileSync(file, 'utf8');
        const foundPid = /\*\* MEMINFO in pid (\d+) \[com\.mystral\.engine\.interop\] \*\*/.exec(raw);
        check(foundPid && Number(foundPid[1]) === pid, 'meminfo sample belongs to another process');
        const native = /^\s*Native Heap\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/m.exec(raw);
        const total = /^\s*TOTAL PSS:\s*(\d+)\s+TOTAL RSS:\s*(\d+)/m.exec(raw);
        check(native && total, 'Unexpected Android meminfo table layout');
        values.push({
            sample: sample.label,
            elapsedMs: sample.elapsedMs,
            frames: sample.event.frames,
            taps: sample.event.taps,
            nativeHeapPssKiB: Number(native[1]),
            nativeHeapRssKiB: Number(native[5]),
            nativeHeapSizeKiB: Number(native[6]),
            nativeHeapAllocKiB: Number(native[7]),
            nativeHeapFreeKiB: Number(native[8]),
            totalPssKiB: Number(total[1]),
            totalRssKiB: Number(total[2]),
            evidence: identity(file),
        });
    }
    if (!values.length) return { status: 'NOT_RUN', samples: [] };
    const first = values[0],
        last = values.at(-1);
    const draws = last.frames - first.frames;
    check(draws > 0, 'Memory comparison has no real AIR draw progress');
    const delta = last.nativeHeapPssKiB - first.nativeHeapPssKiB;
    return {
        status: 'OBSERVATION_ONLY',
        samples: values,
        actualDraws: draws,
        observationMs: last.elapsedMs - first.elapsedMs,
        nativeHeapPssGrowthKiB: delta,
        nativeHeapAllocGrowthKiB: last.nativeHeapAllocKiB - first.nativeHeapAllocKiB,
        totalPssGrowthKiB: last.totalPssKiB - first.totalPssKiB,
        nativeHeapPssGrowthKiBPerDraw: delta / draws,
        nativeHeapPssStrictlyIncreasing:
            values.length >= 4 &&
            values.slice(1).every((row, index) => row.nativeHeapPssKiB > values[index].nativeHeapPssKiB),
        meaning:
            'Native Heap PSS is the first Native Heap table column, not the differently defined App Summary value; no memory threshold determines ownership PASS',
    };
}

async function main(argv) {
    const args = parseArgs(argv);
    const out = path.resolve(args.out);
    fs.mkdirSync(out);
    const save = (name, value) =>
        fs.writeFileSync(
            path.join(out, name),
            Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n',
            { flag: 'wx' },
        );
    const source = fs.readFileSync(__filename);
    save('collector-source.cjs', source);
    const baselineFile = path.resolve(args.baseline);
    const lifecycleFile = require.resolve('./runtime-interop-android-lifecycle.cjs');
    const inputFiles = [
        __filename,
        lifecycleFile,
        baselineFile,
        path.resolve(args.apk),
        path.join(path.dirname(path.resolve(args.apk)), 'build-report.json'),
    ];
    const fingerprint = () =>
        Object.fromEntries([...new Set(inputFiles)].sort().map((file) => [portable(file), sha(fs.readFileSync(file))]));
    const report = {
        schema: 'air-android-native-memory-evidence-v1',
        createdAt: new Date().toISOString(),
        subset: true,
        releaseReady: false,
        pass: false,
        completed: false,
        openFindings: [],
        scope: 'Bindings-managed owned WebGPU API reference accounting plus unchanged Android lifecycle evidence and comparative memory observations',
        allResourcesLeakFree: 'NOT_ESTABLISHED',
        producer: { file: portable(__filename), sha256: sha(source), retainedSource: 'collector-source.cjs' },
        requestedSoakSeconds: args['soak-seconds'],
    };
    let baseline;
    try {
        check(sha(fs.readFileSync(lifecycleFile)) === LIFECYCLE_SHA256, 'Frozen lifecycle collector bytes changed');
        baseline = JSON.parse(fs.readFileSync(baselineFile));
        check(
            baseline.pass &&
                baseline.completed &&
                baseline.inputsUnchanged &&
                baseline.stages.continuous.status === 'PASS' &&
                baseline.requestedSoakSeconds === 900,
            'Baseline is not the completed original fifteen-minute lifecycle run',
        );
        const baselineDirectory = path.dirname(baselineFile);
        report.baselineMemory = consumeMemory(baseline, baselineDirectory);
        check(report.baselineMemory.samples.length >= 4, 'Baseline has incomplete memory observations');
        inputFiles.push(...report.baselineMemory.samples.map((row) => path.resolve(row.evidence.file)));
        report.inputs = fingerprint();
        report.baseline = identity(baselineFile);
        const forwarded = args.forwarded.filter((arg) => !arg.startsWith('--out='));
        forwarded.push('--out=' + path.join(out, 'lifecycle'));
        const actual = await lifecycle.main(forwarded);
        report.lifecycle = {
            ...identity(path.join(out, 'lifecycle/report.json')),
            status: actual.status,
            pass: actual.pass,
            completed: actual.completed,
            inputsUnchanged: actual.inputsUnchanged,
            stageStatuses: Object.fromEntries(
                Object.entries(actual.stages).map(([name, value]) => [name, value.status]),
            ),
        };
        check(actual.inputsUnchanged, 'Lifecycle input fingerprint changed');
        const diagnostic = args['soak-seconds'] === 0;
        check(
            diagnostic
                ? actual.status === 'PARTIAL' &&
                      ['initial', 'background', 'lock', 'surface'].every(
                          (name) => actual.stages[name].status === 'PASS',
                      ) &&
                      actual.teardown?.pass &&
                      actual.processCleanup?.pass &&
                      actual.crashAudit?.pass
                : actual.pass && actual.completed,
            'Unchanged lifecycle contract did not pass the requested scope',
        );
        check(
            actual.device.pageBytes === baseline.device.pageBytes &&
                actual.device.fingerprint === baseline.device.fingerprint &&
                actual.device.abiList === baseline.device.abiList,
            'Baseline and candidate device image/ABI/page-size contexts differ',
        );
        for (const asset of ['interop/sdk/cocosair.module.js', 'assets-manifest.json'])
            check(
                actual.packagedAssets[asset].sha256 === baseline.packagedAssets[asset].sha256,
                'Baseline and candidate SDK or staged asset manifest changed',
            );
        report.nativeOwnership = consumeResources(actual, path.join(out, 'lifecycle'), report.openFindings);
        save('native-ownership.json', report.nativeOwnership);
        report.memory = consumeMemory(actual, path.join(out, 'lifecycle'));
        if (!diagnostic) {
            check(report.memory.samples.length >= 4, 'Candidate has incomplete memory observations');
            report.comparison = {
                candidate: report.memory,
                baseline: report.baselineMemory,
                nativeHeapPssGrowthDifferenceKiB:
                    report.memory.nativeHeapPssGrowthKiB - report.baselineMemory.nativeHeapPssGrowthKiB,
                nativeHeapPssGrowthPerDrawDifference:
                    report.memory.nativeHeapPssGrowthKiBPerDraw - report.baselineMemory.nativeHeapPssGrowthKiBPerDraw,
                nativeHeapAllocGrowthDifferenceKiB:
                    report.memory.nativeHeapAllocGrowthKiB - report.baselineMemory.nativeHeapAllocGrowthKiB,
                meaning:
                    'Matched SDK/staging/device-image bounded observations; differences are measured values, not an arbitrary threshold or proof of all native allocation ownership',
            };
            if (report.memory.nativeHeapPssStrictlyIncreasing)
                report.openFindings.push({
                    kind: 'native-heap-pss-increasing-at-all-four-observations',
                    growthKiB: report.memory.nativeHeapPssGrowthKiB,
                    meaning:
                        'Residual native memory growth remains open even if the matched WebGPU ownership accounting passes',
                });
        }
        report.completed = !diagnostic;
        report.hardOwnershipGatesPassed = true;
    } catch (error) {
        report.error = String(error.stack || error);
    } finally {
        try {
            report.finalInputs = fingerprint();
            report.inputsUnchanged =
                !!report.inputs &&
                JSON.stringify(report.inputs) === JSON.stringify(report.finalInputs) &&
                fs.readFileSync(path.join(out, 'collector-source.cjs')).equals(source);
        } catch (error) {
            report.inputStabilityError = String(error);
            report.inputsUnchanged = false;
        }
        report.pass =
            report.completed && report.hardOwnershipGatesPassed === true && report.inputsUnchanged && !report.error;
        report.status =
            report.error || !report.inputsUnchanged
                ? 'FAIL'
                : !report.completed
                  ? 'PARTIAL'
                  : report.openFindings.length
                    ? 'PASS_WITH_OPEN_FINDINGS'
                    : 'PASS';
        report.overallResult = report.pass
            ? report.openFindings.length
                ? 'MATCHED_OWNERSHIP_COUNTERS_PASS_WITH_OPEN_MEMORY_FINDINGS'
                : 'MATCHED_OWNERSHIP_COUNTERS_AND_LIFECYCLE_PASS'
            : report.status;
        report.finishedAt = new Date().toISOString();
        save('report.json', report);
        console.log(
            JSON.stringify({
                status: report.status,
                overallResult: report.overallResult,
                openFindings: report.openFindings,
                error: report.error,
                report: portable(path.join(out, 'report.json')),
            }),
        );
        process.exitCode = report.pass ? 0 : 1;
    }
    return report;
}

module.exports = { parseArgs, consumeResources, consumeMemory, reassembleSnapshots, trend, main };
if (require.main === module)
    main(process.argv.slice(2)).catch((error) => {
        console.error(error.stack || error);
        process.exitCode = 1;
    });
