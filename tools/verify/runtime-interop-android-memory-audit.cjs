/* Offline memory evidence audit. No ADB, application execution or input writes.
 * node tools/verify/runtime-interop-android-memory-audit.cjs --report=<closed-memory-report.json> --out=<new-dir>
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const consumer = require('./runtime-interop-android-memory.cjs');
const MEMORY_SHA = '680db112c9bfa3308f8592cc9626db7b9ce583bbeab262dfe3be49b7bbeebf15';
const LIFECYCLE_SHA = '12c360ece283e99b8fae3925b43e7afeb4772d083e98dc9da6b5332ccfec6ef7';
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
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const relative = (file) => path.relative(process.cwd(), file).replace(/\\/g, '/');
const requireValue = (value, message) => {
    if (!value) throw Error(message);
};

function parseArgs(argv) {
    const values = {};
    for (const argument of argv) {
        const match = /^--(report|out)=(.+)$/.exec(argument);
        requireValue(match && !Object.hasOwn(values, match[1]), 'Unknown, empty or duplicate argument: ' + argument);
        values[match[1]] = path.resolve(match[2]);
    }
    requireValue(values.report && values.out, '--report and --out are required');
    return values;
}

function verifyBigIntLedger(snapshots) {
    let previous;
    for (const snapshot of snapshots) {
        const sums = { acquired: 0n, released: 0n, live: 0n, peak: 0n };
        requireValue(
            Object.keys(snapshot.types).sort().join(',') === [...TYPES].sort().join(','),
            'Independent type inventory differs',
        );
        if (previous)
            requireValue(
                snapshot.sequence === previous.sequence + 1 && snapshot.steadyMs >= previous.steadyMs,
                'Independent sequence/steady-clock check failed',
            );
        for (const type of TYPES) {
            const row = snapshot.types[type];
            for (const field of Object.keys(sums)) {
                requireValue(
                    Number.isSafeInteger(row[field]) && row[field] >= 0,
                    'Invalid actual native count: ' + type + '.' + field,
                );
                sums[field] += BigInt(row[field]);
            }
            requireValue(
                BigInt(row.acquired) - BigInt(row.released) === BigInt(row.live) && row.peak >= row.live,
                'Independent ownership conservation failed: ' + type,
            );
            if (previous)
                requireValue(
                    row.acquired >= previous.types[type].acquired &&
                        row.released >= previous.types[type].released &&
                        row.peak >= previous.types[type].peak,
                    'Independent cumulative ledger regressed: ' + type,
                );
        }
        for (const field of ['acquired', 'released', 'live'])
            requireValue(sums[field] === BigInt(snapshot.total[field]), 'Independent typed sum failed: ' + field);
        requireValue(
            BigInt(snapshot.total.acquired) - BigInt(snapshot.total.released) === BigInt(snapshot.total.live),
            'Independent total conservation failed',
        );
        requireValue(
            snapshot.total.peak >= snapshot.total.live && BigInt(snapshot.total.peak) <= sums.peak,
            'Concurrent total peak is invalid',
        );
        requireValue(
            BigInt(snapshot.wrapper.created) - BigInt(snapshot.wrapper.finalized) === BigInt(snapshot.wrapper.live) &&
                snapshot.wrapper.peak >= snapshot.wrapper.live,
            'Wrapper accounting differs from real finalization',
        );
        requireValue(snapshot.types.canvasTexture.peak <= 1, 'Canvas owned texture peak exceeds the frame contract');
        if (['periodic', 'cleanup'].includes(snapshot.stage))
            requireValue(
                snapshot.types.canvasTexture.live === 0 && snapshot.types.canvasView.live === 0,
                'Completed frame retains a Canvas lease',
            );
        if (snapshot.stage === 'cleanup')
            requireValue(
                snapshot.total.live === 0 && TYPES.every((type) => snapshot.types[type].live === 0),
                'Real native cleanup did not reach zero',
            );
        previous = snapshot;
    }
    requireValue(
        snapshots[0]?.stage === 'init' && snapshots.at(-1)?.stage === 'cleanup',
        'Actual resource lifecycle is incomplete',
    );
}

function verifyPartProof(snapshots, logLines, lifecycleReport) {
    let parts = 0;
    const nativePid = lifecycleReport.crashAudit.nativePid;
    const lower = lifecycleReport.crashAudit.lowerEpochSeconds;
    const upper = lifecycleReport.crashAudit.upperEpochSecondsExclusive;
    for (const snapshot of snapshots) {
        const { transport, line, epochSeconds, ...value } = snapshot;
        let payload;
        if (transport.kind === 'ordered-parts') {
            requireValue(
                transport.total === transport.parts.length && transport.total > 0,
                'PART count differs from retained proof',
            );
            const chunks = [];
            let lastLine = -1,
                lastEpoch = -Infinity;
            for (const [index, part] of transport.parts.entries()) {
                const raw = logLines[part.line - 1];
                requireValue(
                    raw === part.raw && sha(Buffer.from(raw)) === part.rawLineSha256,
                    'PART original row or SHA differs',
                );
                const header =
                    /^\s*(\d+\.\d+)\s+(\d+)\s+(\d+)\s+[VDIWEF]\s+MystralInterop\s*:\s?RESOURCE_SNAPSHOT_PART (\d+) (\d+)\/(\d+) ([\s\S]+)$/.exec(
                        raw,
                    );
                requireValue(
                    header &&
                        Number(header[2]) === nativePid &&
                        Number(header[4]) === value.sequence &&
                        Number(header[5]) === index &&
                        Number(header[6]) === transport.total,
                    'PART actual PID/sequence/index/count differs',
                );
                requireValue(
                    Number(header[1]) === part.epochSeconds &&
                        part.pid === nativePid &&
                        part.line > lastLine &&
                        part.epochSeconds >= lastEpoch &&
                        part.epochSeconds >= lower &&
                        part.epochSeconds < upper,
                    'PART original order or time window differs',
                );
                const chunk = header[7];
                requireValue(
                    !/[^\x20-\x7e]/.test(chunk) &&
                        Buffer.byteLength(chunk) <= 512 &&
                        (index === transport.total - 1 || Buffer.byteLength(chunk) === 512),
                    'PART actual ASCII byte geometry differs',
                );
                requireValue(
                    Buffer.byteLength(chunk) === part.payloadBytes && sha(Buffer.from(chunk)) === part.payloadSha256,
                    'PART raw chunk SHA differs',
                );
                chunks.push(chunk);
                lastLine = part.line;
                lastEpoch = part.epochSeconds;
                parts++;
            }
            payload = chunks.join('');
        } else {
            requireValue(transport.kind === 'single-line', 'Unknown retained transport');
            const raw = logLines[line - 1];
            requireValue(
                raw === transport.raw && sha(Buffer.from(raw)) === transport.rawLineSha256,
                'Single-line original row differs',
            );
            const position = raw.indexOf('RESOURCE_SNAPSHOT ');
            requireValue(position >= 0, 'Single-line payload is absent');
            payload = raw.slice(position + 'RESOURCE_SNAPSHOT '.length);
        }
        requireValue(
            Buffer.byteLength(payload) === transport.payloadBytes &&
                sha(Buffer.from(payload)) === transport.payloadSha256 &&
                isDeepStrictEqual(JSON.parse(payload), value),
            'Complete snapshot original JSON bytes, hash or value differ',
        );
    }
    return parts;
}

async function main(argv) {
    const args = parseArgs(argv);
    fs.mkdirSync(args.out);
    const inputs = new Map();
    const read = (file) => {
        const absolute = path.resolve(file),
            bytes = fs.readFileSync(absolute);
        const item = { file: relative(absolute), bytes: bytes.length, sha256: sha(bytes) };
        if (inputs.has(absolute))
            requireValue(isDeepStrictEqual(inputs.get(absolute), item), 'Input changed during audit: ' + item.file);
        else inputs.set(absolute, item);
        return bytes;
    };
    const json = (file) => JSON.parse(read(file));
    const check = (name, condition) => {
        requireValue(condition, name);
        result.checks.push({ name, pass: true });
    };
    const result = {
        schema: 'air-android-native-memory-offline-audit-v1',
        createdAt: new Date().toISOString(),
        pass: false,
        checks: [],
        subset: true,
        releaseReady: false,
        scope: 'Closed memory evidence, ownership accounting and memory comparison; independent lifecycle image audit remains separate',
    };
    const source = read(__filename);
    fs.writeFileSync(path.join(args.out, 'audit-source.cjs'), source, { flag: 'wx' });
    try {
        const memoryFile = require.resolve('./runtime-interop-android-memory.cjs');
        const lifecycleFile = require.resolve('./runtime-interop-android-lifecycle.cjs');
        check(
            'Frozen consumer and lifecycle source identity',
            sha(read(memoryFile)) === MEMORY_SHA && sha(read(lifecycleFile)) === LIFECYCLE_SHA,
        );
        const memory = json(args.report);
        result.subject = { file: relative(args.report), sha256: sha(read(args.report)), status: memory.status };
        check(
            'Final memory subject is a completed 900-second accepted run',
            memory.schema === 'air-android-native-memory-evidence-v1' &&
                memory.completed === true &&
                memory.requestedSoakSeconds === 900 &&
                memory.pass === true &&
                ['PASS', 'PASS_WITH_OPEN_FINDINGS'].includes(memory.status) &&
                memory.hardOwnershipGatesPassed === true &&
                !memory.error,
        );
        check(
            'Source producer archive matches the current frozen wrapper',
            memory.producer.file === relative(memoryFile) &&
                memory.producer.sha256 === MEMORY_SHA &&
                memory.producer.retainedSource === 'collector-source.cjs' &&
                sha(read(path.join(path.dirname(args.report), 'collector-source.cjs'))) === MEMORY_SHA,
        );
        const verifyInputMap = (report, name) => {
            check(
                name + ' before/after fingerprint maps match',
                report.inputsUnchanged === true && isDeepStrictEqual(report.inputs, report.finalInputs),
            );
            requireValue(report.inputs && Object.keys(report.inputs).length > 0, 'Missing input fingerprint map');
            for (const [file, expected] of Object.entries(report.inputs))
                requireValue(sha(read(file)) === expected, name + ' input bytes changed: ' + file);
            result.checks.push({
                name: name + ' actual fingerprint files match',
                pass: true,
                files: Object.keys(report.inputs).length,
            });
        };
        verifyInputMap(memory, 'Memory wrapper');
        const lifecyclePath = path.resolve(memory.lifecycle.file);
        const child = json(lifecyclePath);
        check(
            'Memory subject binds the actual lifecycle report bytes',
            sha(read(lifecyclePath)) === memory.lifecycle.sha256 &&
                read(lifecyclePath).length === memory.lifecycle.bytes,
        );
        verifyInputMap(child, 'Lifecycle collector');
        check(
            'Lifecycle application, release and physical log shutdown are closed',
            child.pass === true &&
                child.completed === true &&
                Object.values(child.stages).every((stage) => stage.status === 'PASS') &&
                child.teardown?.pass === true &&
                child.nativeExit?.code === 0 &&
                child.processCleanup?.pass === true &&
                child.processCleanup.normalNativeExitBeforeCleanup === true &&
                child.logcatShutdown?.close?.observed === true &&
                child.logcatShutdown.closedBeforeRequest === false &&
                child.logcatShutdown.elapsedMs <= 2000 &&
                child.crashAudit?.pass === true &&
                !child.collectorCloseError,
        );
        const directory = path.dirname(lifecyclePath);
        const log = read(path.join(directory, 'logcat.txt'));
        check('Original closed log bytes match lifecycle crash audit', sha(log) === child.crashAudit.logSha256);
        const exceptions = consumer.consumeJsExceptions(child, directory);
        check(
            'Current-PID JavaScript exception consumer replays exactly',
            exceptions.pass &&
                exceptions.exceptionLogRows === 0 &&
                isDeepStrictEqual(exceptions, memory.javascriptExceptions) &&
                isDeepStrictEqual(exceptions, json(path.join(path.dirname(args.report), 'javascript-exceptions.json'))),
        );
        const findings = [];
        const resources = consumer.consumeResources(child, directory, findings);
        check(
            'Original RESOURCE transport and ownership consumer replay exactly',
            resources.pass &&
                isDeepStrictEqual(resources, memory.nativeOwnership) &&
                isDeepStrictEqual(resources, json(path.join(path.dirname(args.report), 'native-ownership.json'))),
        );
        verifyBigIntLedger(resources.snapshots);
        result.checks.push({
            name: 'Independent BigInt 18-type conservation, native totals, sequence, Canvas frame leases and cleanup zero',
            pass: true,
            snapshots: resources.snapshots.length,
        });
        const partCount = verifyPartProof(resources.snapshots, log.toString('utf8').split(/\r?\n/), child);
        result.checks.push({
            name: 'Original PART rows, ASCII chunks, ordered payload and complete JSON SHA',
            pass: true,
            parts: partCount,
        });
        const samples = child.stages.continuous.samples;
        check(
            'Continuous host samples cover the real 900-second window without catch-up',
            samples.length >= 21 &&
                samples.at(-1).monotonicStartMs - samples[0].monotonicStartMs >= 900000 &&
                samples
                    .slice(1)
                    .every(
                        (sample, index) =>
                            sample.monotonicStartMs - samples[index].monotonicStartMs >= 30000 &&
                            sample.monotonicStartMs - samples[index].monotonicStartMs <= 45000 &&
                            sample.actualWallStartMs - samples[index].actualWallStartMs >= 0 &&
                            sample.actualWallStartMs - samples[index].actualWallStartMs <= 45000,
                    ),
        );
        const lines = log.toString('utf8').split(/\r?\n/);
        const taps = lines
            .map((raw) =>
                /^\s*(\d+\.\d+)\s+(\d+)\s+\d+\s+[VDIWEF]\s+MystralInterop\s*:\s?EVENT demo-input\s*$/.exec(raw),
            )
            .filter(
                (match) =>
                    match &&
                    Number(match[2]) === child.crashAudit.nativePid &&
                    Number(match[1]) >= child.crashAudit.lowerEpochSeconds &&
                    Number(match[1]) < child.crashAudit.upperEpochSecondsExclusive,
            )
            .map((match) => Number(match[1]));
        const begin = taps[samples[0].event.taps - 1],
            end = taps[samples.at(-1).event.taps - 1];
        const periodic = resources.snapshots.filter(
            (row) => row.stage === 'periodic' && row.epochSeconds >= begin && row.epochSeconds <= end,
        );
        const points = [begin, ...periodic.map((row) => row.epochSeconds), end];
        check(
            'Independent native periodic coverage matches actual continuous input boundaries',
            taps.length === samples.at(-1).event.taps &&
                periodic.length >= 2 &&
                begin === resources.coverage.beginEpochSeconds &&
                end === resources.coverage.endEpochSeconds &&
                points
                    .slice(1)
                    .every((value, index) => (value - points[index]) * 1000 <= 15000 && value >= points[index]) &&
                periodic
                    .slice(1)
                    .every(
                        (row, index) =>
                            row.steadyMs - periodic[index].steadyMs <= 15000 &&
                            row.steadyMs >= periodic[index].steadyMs,
                    ),
        );
        const baselinePath = path.resolve(memory.baseline.file);
        const baseline = json(baselinePath);
        check(
            'Original baseline report identity and completed scope',
            sha(read(baselinePath)) === memory.baseline.sha256 &&
                read(baselinePath).length === memory.baseline.bytes &&
                baseline.pass &&
                baseline.completed &&
                baseline.requestedSoakSeconds === 900 &&
                baseline.stages.continuous.status === 'PASS',
        );
        check(
            'SDK, staging and device-image comparison contexts match',
            child.device.pageBytes === baseline.device.pageBytes &&
                child.device.fingerprint === baseline.device.fingerprint &&
                child.device.abiList === baseline.device.abiList &&
                ['interop/sdk/cocosair.module.js', 'assets-manifest.json'].every(
                    (asset) => child.packagedAssets[asset].sha256 === baseline.packagedAssets[asset].sha256,
                ),
        );
        const currentMemory = consumer.consumeMemory(child, directory);
        const previousMemory = consumer.consumeMemory(baseline, path.dirname(baselinePath));
        check(
            'Raw candidate and baseline meminfo consumers replay exactly',
            isDeepStrictEqual(currentMemory, memory.memory) &&
                isDeepStrictEqual(previousMemory, memory.baselineMemory) &&
                isDeepStrictEqual(currentMemory, memory.comparison.candidate) &&
                isDeepStrictEqual(previousMemory, memory.comparison.baseline),
        );
        for (const [name, observation] of [
            ['candidate', currentMemory],
            ['baseline', previousMemory],
        ]) {
            check(
                name + ' memory observations retain four actual collection times',
                observation.samples.length === 4 &&
                    observation.samples[0].elapsedMs < 15000 &&
                    observation.samples
                        .slice(1)
                        .every(
                            (row, index) =>
                                row.elapsedMs - observation.samples[index].elapsedMs >= 300000 &&
                                row.elapsedMs - observation.samples[index].elapsedMs <= 345000,
                        ),
            );
            for (const row of observation.samples) {
                const raw = read(row.evidence.file);
                const native = /^\s*Native Heap\s+(\d+)\s+\d+\s+\d+\s+\d+\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/m.exec(
                    raw.toString('utf8'),
                );
                const total = /^\s*TOTAL PSS:\s*(\d+)\s+TOTAL RSS:\s*(\d+)/m.exec(raw.toString('utf8'));
                requireValue(
                    sha(raw) === row.evidence.sha256 &&
                        raw.length === row.evidence.bytes &&
                        native &&
                        total &&
                        Number(native[1]) === row.nativeHeapPssKiB &&
                        Number(native[2]) === row.nativeHeapRssKiB &&
                        Number(native[3]) === row.nativeHeapSizeKiB &&
                        Number(native[4]) === row.nativeHeapAllocKiB &&
                        Number(native[5]) === row.nativeHeapFreeKiB &&
                        Number(total[1]) === row.totalPssKiB &&
                        Number(total[2]) === row.totalRssKiB,
                    'Independent meminfo table-column check differs',
                );
            }
            const first = observation.samples[0],
                last = observation.samples.at(-1);
            requireValue(
                observation.actualDraws === last.frames - first.frames &&
                    observation.nativeHeapPssGrowthKiB === last.nativeHeapPssKiB - first.nativeHeapPssKiB &&
                    observation.nativeHeapAllocGrowthKiB === last.nativeHeapAllocKiB - first.nativeHeapAllocKiB &&
                    observation.nativeHeapPssGrowthKiBPerDraw ===
                        (last.nativeHeapPssKiB - first.nativeHeapPssKiB) / (last.frames - first.frames),
                'Independent memory growth/draw arithmetic differs',
            );
        }
        check(
            'Candidate-minus-baseline memory calculations match actual rows and draws',
            memory.comparison.nativeHeapPssGrowthDifferenceKiB ===
                currentMemory.nativeHeapPssGrowthKiB - previousMemory.nativeHeapPssGrowthKiB &&
                memory.comparison.nativeHeapAllocGrowthDifferenceKiB ===
                    currentMemory.nativeHeapAllocGrowthKiB - previousMemory.nativeHeapAllocGrowthKiB &&
                memory.comparison.nativeHeapPssGrowthPerDrawDifference ===
                    currentMemory.nativeHeapPssGrowthKiBPerDraw - previousMemory.nativeHeapPssGrowthKiBPerDraw,
        );
        if (currentMemory.nativeHeapPssStrictlyIncreasing)
            findings.push({
                kind: 'native-heap-pss-increasing-at-all-four-observations',
                growthKiB: currentMemory.nativeHeapPssGrowthKiB,
                meaning:
                    'Residual native memory growth remains open even if the matched WebGPU ownership accounting passes',
            });
        check(
            'Open findings and overall result preserve the actual acceptance scope',
            isDeepStrictEqual(findings, memory.openFindings) &&
                memory.status === (findings.length ? 'PASS_WITH_OPEN_FINDINGS' : 'PASS') &&
                memory.overallResult ===
                    (findings.length
                        ? 'MATCHED_OWNERSHIP_COUNTERS_PASS_WITH_OPEN_MEMORY_FINDINGS'
                        : 'MATCHED_OWNERSHIP_COUNTERS_AND_LIFECYCLE_PASS') &&
                memory.allResourcesLeakFree === 'NOT_ESTABLISHED' &&
                memory.releaseReady === false,
        );
        result.subjectOpenFindings = findings;
        result.resourceSnapshots = resources.snapshots.length;
        result.originalTransportParts = partCount;
        result.currentMemory = currentMemory;
        result.baselineMemory = previousMemory;
        result.completedEvidenceVerified = true;
    } catch (error) {
        result.error = String(error.stack || error);
    } finally {
        try {
            for (const [file, item] of inputs)
                requireValue(
                    sha(fs.readFileSync(file)) === item.sha256,
                    'Input mutated before audit closure: ' + item.file,
                );
            result.inputsUnchanged = true;
        } catch (error) {
            result.inputStabilityError = String(error);
            result.inputsUnchanged = false;
        }
        result.inputs = [...inputs.values()];
        result.producer = {
            file: relative(__filename),
            bytes: source.length,
            sha256: sha(source),
            retainedSource: 'audit-source.cjs',
        };
        result.pass = result.completedEvidenceVerified === true && result.inputsUnchanged && !result.error;
        result.status = result.pass ? 'PASS' : 'FAIL_OR_NOT_READY';
        result.finishedAt = new Date().toISOString();
        fs.writeFileSync(path.join(args.out, 'report.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
        console.log(
            JSON.stringify({
                status: result.status,
                checks: result.checks.length,
                error: result.error,
                report: relative(path.join(args.out, 'report.json')),
            }),
        );
        process.exitCode = result.pass ? 0 : 1;
    }
    return result;
}

module.exports = { parseArgs, verifyBigIntLedger, verifyPartProof, main };
if (require.main === module)
    main(process.argv.slice(2)).catch((error) => {
        console.error(error.stack || error);
        process.exitCode = 1;
    });
