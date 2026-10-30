// Fail-closed evidence admission. No model invocation, browser launch, build or historical evidence rewrite.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const referenceContracts = require('../benchmark/upstream/reference-contracts.cjs');
const root = path.resolve(__dirname, '../..');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const digest = (value) => sha256(JSON.stringify(value));
function fileHash(base, file) {
    if (
        typeof file !== 'string' ||
        path.isAbsolute(file) ||
        file.includes('\\') ||
        file.split('/').some((p) => p === '..' || p === '')
    )
        throw new Error('unsafe evidence path');
    const resolved = path.resolve(base, file),
        real = fs.realpathSync(resolved);
    if (!real.startsWith(fs.realpathSync(base) + path.sep)) throw new Error('evidence escapes root');
    return sha256(fs.readFileSync(resolved));
}
function sameSet(a, b) {
    return (
        a.length === b.length && new Set(a).size === a.length && [...a].sort().join('\0') === [...b].sort().join('\0')
    );
}
const requiredSources = [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'README.md',
    'AGENTS.md',
    'ai/plans/upstream-update.md',
    'ai/ledgers/upstream-update/execution-map.json',
    'LICENSE',
    'node_modules/.package-lock.json',
    'node_modules/typescript/package.json',
    'node_modules/typescript/lib/typescript.js',
    'node_modules/esbuild/package.json',
    'node_modules/esbuild/lib/main.js',
];
const requiredArtifacts = [
    'build/cocosair.module.js',
    'build/cocosair.module.min.js',
    'build/cocosair.module.js.map',
    'build/cocosair.module.min.js.map',
    'build/cocosair.module.d.ts',
    'build/cocosair.legacy.d.ts',
    'build/cocosair.math.js',
    'build/cocosair.math.d.ts',
    'build/cocosair.math.legacy.d.ts',
    'build/math-build.json',
    'build/dts-contract.json',
    'build/package.json',
    'build/npm/cocosair.module.js',
    'build/npm/cocosair.module.min.js',
    'build/npm/cocosair.math.js',
    'build/spark.module.js',
    'build/spark.module.js.map',
    'build/spark.module.d.ts',
    'build/spark.module.meta.json',
    'build/fflate/MANIFEST.md',
    'build/fflate/package.json',
    'build/fflate/LICENSE',
    'build/fflate/esm/browser.js',
    'build/gltf-decoders/package.json',
    'build/gltf-decoders/MANIFEST.md',
    'build/gltf-decoders/draco/draco_decoder.wasm',
    'build/gltf-decoders/draco/draco_decoder_nodejs.js',
    'build/gltf-decoders/meshopt/meshopt_decoder.mjs',
    'build/gltf-decoders/basis/basis_transcoder.js',
    'build/gltf-decoders/basis/basis_transcoder.wasm',
    'build/webgpu/manifest.json',
    'build/webgpu/glslang.js',
    'build/webgpu/glslang.wasm',
    'build/webgpu/twgsl.js',
    'build/webgpu/twgsl.wasm',
    'build/npm/webgpu/manifest.json',
    'build/npm/webgpu/glslang.js',
    'build/npm/webgpu/glslang.wasm',
    'build/npm/webgpu/twgsl.js',
    'build/npm/webgpu/twgsl.wasm',
    'build/box2d3/air-box2d.mjs',
    'build/box2d3/air-box2d.wasm',
    'build/box2d3/receipt.json',
    'build/npm/box2d3/air-box2d.mjs',
    'build/npm/box2d3/air-box2d.wasm',
    'build/npm/box2d3/receipt.json',
];
function sourceFiles(base) {
    const files = [...requiredSources];
    const walk = (relative) => {
        const absolute = path.join(base, relative);
        if (!fs.existsSync(absolute)) return;
        for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
            if (['node_modules', '.git', 'output'].includes(entry.name)) continue;
            const file = relative + '/' + entry.name;
            if (entry.isSymbolicLink()) throw new Error('symlink in source identity inventory');
            if (entry.isDirectory()) walk(file);
            else if (entry.isFile()) files.push(file);
        }
    };
    for (const directory of [
        'src',
        'tools',
        'test',
        'examples',
        '.github',
        'vendor',
        'docs/gltf',
        'docs/guides',
        'docs/manual',
        'docs/reference',
        'docs/notes',
        'skills',
    ])
        walk(directory);
    if (fs.existsSync(path.join(base, 'docs')))
        for (const entry of fs.readdirSync(path.join(base, 'docs'), { withFileTypes: true })) {
            if (entry.isFile() && /\.(md|json)$/.test(entry.name)) files.push('docs/' + entry.name);
        }
    return [...new Set(files)].sort();
}
function artifactFiles(base) {
    const files = new Set(requiredArtifacts);
    const walk = (relative) => {
        if (!fs.existsSync(path.join(base, relative))) return;
        for (const entry of fs.readdirSync(path.join(base, relative), { withFileTypes: true })) {
            const file = relative + '/' + entry.name;
            if (entry.isSymbolicLink()) throw new Error('symlink in artifact identity inventory');
            if (entry.isDirectory()) walk(file);
            else if (entry.isFile()) files.add(file);
        }
    };
    for (const directory of [
        'build/fflate',
        'build/gltf-decoders',
        'build/webgpu',
        'build/box2d3',
        'build/npm/webgpu',
        'build/npm/box2d3',
        'build/spark-types',
    ])
        walk(directory);
    return [...files].sort();
}
function createSnapshot(base, manifest) {
    return {
        schema: 'upstream-candidate-snapshot/1',
        frozenAt: new Date().toISOString(),
        manifestDigest: digest(manifest),
        sourceEntries: Object.fromEntries(sourceFiles(base).map((file) => [file, fileHash(base, file)])),
        artifactEntries: Object.fromEntries(artifactFiles(base).map((file) => [file, fileHash(base, file)])),
    };
}
function validateSnapshot(snapshot, base, manifest) {
    const errors = [];
    if (snapshot?.schema !== 'upstream-candidate-snapshot/1' || snapshot.manifestDigest !== digest(manifest))
        errors.push('snapshot/manifest identity mismatch');
    try {
        if (!sameSet(Object.keys(snapshot?.sourceEntries || {}), sourceFiles(base)))
            errors.push('source fingerprint inventory is incomplete or changed');
    } catch (error) {
        errors.push(error.message);
    }
    try {
        if (!sameSet(Object.keys(snapshot?.artifactEntries || {}), artifactFiles(base)))
            errors.push('SDK/optional-asset fingerprint inventory is incomplete or changed');
    } catch (error) {
        errors.push(error.message);
    }
    for (const group of ['sourceEntries', 'artifactEntries']) {
        const entries = snapshot?.[group];
        if (!entries || !Object.keys(entries).length) {
            errors.push(`missing ${group}`);
            continue;
        }
        for (const [file, expected] of Object.entries(entries)) {
            try {
                if (!/^[a-f0-9]{64}$/.test(expected) || fileHash(base, file) !== expected) errors.push(`stale ${file}`);
            } catch (error) {
                errors.push(`missing/invalid ${file}: ${error.message}`);
            }
        }
    }
    return errors;
}
function verifyEvidence(evidence, base, errors, label) {
    if (!Array.isArray(evidence) || evidence.length === 0) {
        errors.push(`${label}: missing raw evidence`);
        return;
    }
    for (const item of evidence) {
        try {
            if (fileHash(base, item.path) !== item.sha256) errors.push(`${label}: stale evidence ${item.path}`);
        } catch (error) {
            errors.push(`${label}: missing/invalid evidence ${error.message}`);
        }
    }
}
function validateEngine(report, snapshot, manifest, base = root) {
    const errors = validateSnapshot(snapshot, base, manifest),
        missing = [],
        research = [];
    if (report?.track !== 'ENGINE_REFERENCE' || report.snapshotDigest !== digest(snapshot))
        errors.push('wrong track or candidate identity');
    if (report?.completed !== true || report.partial !== false) errors.push('incomplete/subset engine execution');
    if (
        !sameSet(
            report?.scope || [],
            manifest.cases.map((c) => c.id),
        )
    )
        errors.push('engine scope differs from frozen 36-case inventory');
    const seen = new Set(),
        rows = Array.isArray(report?.observations) ? report.observations : [];
    for (const row of rows) {
        const item = manifest.cases.find((c) => c.id === row.caseId),
            key = `${row.caseId}/${row.dimension}`;
        if (!item || !item.dimensions.includes(row.dimension) || seen.has(key)) {
            errors.push(`unexpected/duplicate observation ${key}`);
            continue;
        }
        seen.add(key);
        verifyEvidence(row.evidence, base, errors, key);
        if (row.snapshotDigest !== digest(snapshot)) errors.push(`${key}: stale candidate result`);
        if (row.expectedNegativeOnly === true && row.status === 'PASS')
            errors.push(`${key}: negative-only result cannot establish positive support`);
        if (item.kind === 'experimental-decision') {
            research.push({ key, status: row.status, rationale: row.rationale || null });
            if (!['PASS', 'BLOCKED', 'FAIL', 'NOT_RUN', 'NOT_APPLICABLE_WITH_EVIDENCE'].includes(row.status))
                errors.push(`${key}: invalid research status`);
            if (row.status === 'NOT_APPLICABLE_WITH_EVIDENCE' && !row.rationale)
                errors.push(`${key}: no applicability rationale`);
        } else if (row.status !== 'PASS') errors.push(`${key}: ${row.status || 'NOT_RUN'}`);
    }
    for (const item of manifest.cases)
        for (const dimension of item.dimensions) {
            const key = `${item.id}/${dimension}`;
            if (!seen.has(key)) missing.push(key);
        }
    if (missing.length) errors.push(`missing frozen observations: ${missing.join(', ')}`);
    const stablePassed = errors.length === 0;
    const researchCompleted =
        research.length ===
            manifest.cases
                .filter((c) => c.kind === 'experimental-decision')
                .reduce((n, c) => n + c.dimensions.length, 0) &&
        research.every(
            (row) => row.status === 'PASS' || (row.status === 'NOT_APPLICABLE_WITH_EVIDENCE' && !!row.rationale),
        );
    return {
        gate: 'ENGINE',
        status: stablePassed ? 'PASS' : 'BLOCKED',
        stablePassed,
        researchCompleted,
        planComplete: stablePassed && researchCompleted,
        errors,
        missing,
        research,
    };
}
let metrics;
function existingMetrics() {
    if (metrics) return metrics;
    // Reuse the existing eligibility implementation, rather than inventing another denominator.
    const source = require('esbuild').buildSync({
        entryPoints: [path.join(root, 'tools/benchmark/runner/metrics.ts')],
        bundle: true,
        write: false,
        format: 'cjs',
        platform: 'node',
    }).outputFiles[0].text;
    const loaded = new Module(path.join(root, 'tools/benchmark/runner/metrics.cjs'), module);
    loaded.paths = module.paths;
    loaded.filename = path.join(root, 'tools/benchmark/runner/metrics.cjs');
    loaded._compile(source, loaded.filename);
    return (metrics = loaded.exports);
}
function validateAgentPreparation(protocol, base, errors, configuration = {}, referenceOptions = {}) {
    const preparation = protocol?.preparation;
    const tasks = new Map();
    const rows = Array.isArray(preparation?.tasks) ? preparation.tasks : [];
    if (preparation?.schema !== 'upstream-agent-preparation/1' || preparation.status !== 'READY_FOR_GENERATION')
        errors.push('paired public inputs and independent reference validation are not ready for generation');
    verifyEvidence(preparation?.sourceManifestEvidence, base, errors, 'preparation/source-manifests');
    if (
        !sameSet(
            rows.map((task) => task?.id),
            protocol.tasks.map((task) => task.id),
        )
    )
        errors.push('preparation differs from the frozen 12-task cohort');
    for (const task of rows) {
        if (!task || tasks.has(task.id)) {
            errors.push('duplicate/malformed prepared task');
            continue;
        }
        tasks.set(task.id, task);
        if (!/^[a-f0-9]{64}$/.test(task.commonInputSha256 || ''))
            errors.push(`${task.id}: common public input identity missing`);
        if (
            !Array.isArray(task.repetitionSeeds) ||
            task.repetitionSeeds.length !== protocol.cohort.repetitions ||
            task.repetitionSeeds.some((seed) => !Number.isSafeInteger(seed)) ||
            new Set(task.repetitionSeeds).size !== protocol.cohort.repetitions
        )
            errors.push(`${task.id}: pre-generation repeated seeds are not frozen`);
        if (
            !Array.isArray(task.validatorIds) ||
            !task.validatorIds.length ||
            task.validatorIds.some((id) => typeof id !== 'string' || !id)
        )
            errors.push(`${task.id}: independent observation contracts missing`);
        if (task.referencesBrowserValidated !== true)
            errors.push(`${task.id}: both independent reference arms have not been validated`);
        for (const engine of protocol.cohort.engines) {
            const label = `${task.id}/reference/${engine}`;
            verifyEvidence(task.referenceEvidence?.[engine], base, errors, label);
            const receipts = task.referenceReceipts?.[engine];
            if (!Array.isArray(receipts) || receipts.length !== protocol.cohort.repetitions) {
                errors.push(`${label}: expected one protected reference receipt per frozen seed`);
                continue;
            }
            const seenSeeds = new Set();
            for (const item of receipts) {
                try {
                    if (!item || fileHash(base, item.path) !== item.sha256)
                        throw new Error('reference receipt bytes changed');
                    const receipt = JSON.parse(fs.readFileSync(path.join(base, item.path), 'utf8'));
                    if (!task.repetitionSeeds?.includes(receipt.seed) || seenSeeds.has(receipt.seed))
                        throw new Error('reference seed is missing, unexpected or duplicate');
                    seenSeeds.add(receipt.seed);
                    const validated = referenceContracts.validateReferenceReceipt(receipt, {
                        root: base,
                        evidenceRoot: path.dirname(path.join(base, item.path)),
                        threePackageDir: referenceOptions.threePackageDir,
                        engineArtifactPath: referenceOptions.engineArtifactPaths?.[engine],
                        taskId: task.id,
                        commonInputSha256: task.commonInputSha256,
                        seed: receipt.seed,
                        engineArtifactSha256:
                            configuration[engine === 'three' ? 'threeArtifactSha256' : 'cocosArtifactSha256'],
                    });
                    if (
                        validated.validated !== true ||
                        validated.engine !== engine ||
                        validated.taskId !== task.id ||
                        !sameSet(task.validatorIds || [], [validated.contractId])
                    )
                        throw new Error('reference returned different engine, task or observation contract');
                } catch (error) {
                    errors.push(`${label}: independent receipt validation failed: ${error.message}`);
                }
            }
        }
    }
    return tasks;
}
function validateAgent(
    report,
    snapshot,
    protocol,
    base = root,
    manifest = JSON.parse(
        fs.readFileSync(path.join(root, 'ai/ledgers/upstream-update/acceptance-manifest.json'), 'utf8'),
    ),
    referenceOptions = {},
) {
    const errors = validateSnapshot(snapshot, base, manifest),
        exclusions = [],
        runs = Array.isArray(report?.runs) ? report.runs : [];
    const preparedTasks = validateAgentPreparation(protocol, base, errors, report?.configuration, referenceOptions);
    const model = report?.model;
    if (
        protocol.executionStatus !== 'READY' ||
        !protocol.launchConfiguration ||
        !protocol.referenceBaseline?.executionIdentityFrozen
    )
        errors.push('protocol launch identity has not been frozen for real generation');
    if (
        report?.track !== 'AGENT_GENERATED' ||
        report.snapshotDigest !== digest(snapshot) ||
        report.protocolDigest !== digest(protocol)
    )
        errors.push('wrong Agent track/protocol/candidate identity');
    if (report?.completed !== true || report.partial !== false) errors.push('incomplete Agent execution');
    if (
        !model ||
        model.kind !== 'LLM' ||
        !model.provider ||
        !model.revision ||
        !model.name ||
        /scripted|reference-solver|^A001$/i.test([model.name, model.profileId].join(' '))
    )
        errors.push('real immutable LLM identity missing; scripted references do not count');
    if (
        !report?.configuration?.threeArtifactSha256 ||
        !report.configuration.cocosArtifactSha256 ||
        !report.configuration.knowledgeSha256 ||
        !report.configuration.generationParameters
    )
        errors.push('unfrozen launch/package/knowledge configuration');
    if (
        protocol.launchConfiguration?.configurationDigest !== digest(report?.configuration) ||
        protocol.launchConfiguration?.modelDigest !== digest(model)
    )
        errors.push('launch configuration/model differs from pre-generation protocol freeze');
    if (report?.configuration?.preparationDigest !== digest(protocol.preparation ?? null))
        errors.push('launch configuration does not bind the frozen paired preparation');
    if (report?.configuration?.threeArtifactSha256 !== protocol.referenceBaseline?.artifactSha256)
        errors.push('three package differs from the existing fixed reference baseline');
    for (const key of ['threeArtifactSha256', 'cocosArtifactSha256', 'knowledgeSha256'])
        if (!/^[a-f0-9]{64}$/.test(report?.configuration?.[key] || ''))
            errors.push(`invalid configuration identity ${key}`);
    if (runs.length !== protocol.cohort.runsPerConfiguration)
        errors.push('expected exactly 72 retained runs per configuration');
    const keys = new Set(),
        runIds = new Set(),
        pairs = new Map();
    for (const run of runs) {
        const key = `${run.taskId}/${run.repeat}/${run.engine}`;
        if (
            !protocol.tasks.some((t) => t.id === run.taskId) ||
            ![0, 1, 2].includes(run.repeat) ||
            !protocol.cohort.engines.includes(run.engine) ||
            keys.has(key)
        ) {
            errors.push(`unexpected/duplicate run ${key}`);
            continue;
        }
        keys.add(key);
        if (!Number.isSafeInteger(run.seed)) errors.push(`${key}: missing recorded seed`);
        const prepared = preparedTasks.get(run.taskId);
        if (
            !prepared ||
            run.commonInputSha256 !== prepared.commonInputSha256 ||
            run.seed !== prepared.repetitionSeeds?.[run.repeat]
        )
            errors.push(`${key}: generated input/seed differs from pre-generation public freeze`);
        if (
            !Array.isArray(run.validatorCoverage) ||
            !prepared?.validatorIds?.every((id) => run.validatorCoverage.includes(id))
        )
            errors.push(`${key}: prepared independent observation contract not covered`);
        if (!run.runId || runIds.has(run.runId)) errors.push(`${key}: duplicate/missing provider run id`);
        runIds.add(run.runId);
        const pairKey = `${run.taskId}/${run.repeat}`;
        if (!pairs.has(pairKey)) pairs.set(pairKey, []);
        pairs.get(pairKey).push(run);
        if (
            !run.runId ||
            run.generationSource !== 'provider' ||
            run.modelRevision !== model?.revision ||
            !/^[a-f0-9]{64}$/.test(run.commonInputSha256 || '')
        )
            errors.push(`${key}: missing generated/pairing provenance`);
        for (const field of ['inputEvidence', 'outputEvidence', 'validationEvidence'])
            verifyEvidence(run[field], base, errors, `${key}/${field}`);
        if (
            !Number.isFinite(run.elapsedMs) ||
            run.elapsedMs < 0 ||
            !Number.isSafeInteger(run.tokens?.input) ||
            !Number.isSafeInteger(run.tokens?.output) ||
            run.tokens.input < 0 ||
            run.tokens.output < 0 ||
            !Number.isFinite(run.cost?.amount) ||
            run.cost.amount < 0 ||
            !run.cost.currency
        )
            errors.push(`${key}: missing real time/token/cost observations`);
        const trial = run.trial;
        if (
            !trial ||
            !Number.isInteger(trial.repairs) ||
            trial.repairs < 0 ||
            trial.repairs > protocol.cohort.repairBudget ||
            trial.manifest?.repairBudget !== protocol.cohort.repairBudget ||
            trial.manifest?.timeBudgetMs !== protocol.cohort.timeBudgetMs ||
            typeof trial.firstSubmissionCompilePass !== 'boolean' ||
            !Array.isArray(trial.policyDenials)
        ) {
            errors.push(`${key}: invalid existing trial contract`);
            continue;
        }
        if (
            !['VALID', 'INFRA_FAILURE', 'INVALID_RUN'].includes(trial.trialResult) ||
            !['PASS', 'FAIL', 'EXPECTED_UNSUPPORTED', 'EXPECTED_FALLBACK', 'SKIP', 'NOT_EVALUATED'].includes(
                trial.engineResult,
            ) ||
            !['PASS', 'FAIL', 'BUDGET_EXHAUSTED', 'TIMEOUT', 'SKIP', 'NOT_EVALUATED'].includes(trial.agentResult) ||
            !['ENGINE', 'AGENT', 'INFRASTRUCTURE', 'ISOLATION', 'DEVICE', 'NONE'].includes(trial.failureDomain)
        )
            errors.push(`${key}: unknown trial classification`);
        if (trial.agentResult === 'PASS' && !['PASS', 'EXPECTED_FALLBACK'].includes(trial.engineResult))
            errors.push(`${key}: generated PASS lacks a valid independent reference`);
        if (trial.agentResult === 'PASS') {
            try {
                const item = run.observationEvidence;
                if (!item || fileHash(base, item.path) !== item.sha256)
                    throw new Error('missing or changed raw generated observation');
                const observation = JSON.parse(fs.readFileSync(path.join(base, item.path), 'utf8'));
                if (observation.taskId !== run.taskId || observation.engine !== run.engine)
                    throw new Error('generated observation belongs to a different arm');
                const result = referenceContracts.validateObservation(observation);
                if (result.validated !== true || !prepared?.validatorIds?.includes(result.contractId))
                    throw new Error('generated observation did not pass the frozen independent contract');
            } catch (error) {
                errors.push(`${key}: generated PASS rejected by independent observation validation: ${error.message}`);
            }
        }
        if (!existingMetrics().isEligible(trial))
            exclusions.push({
                key,
                topResult: trial.trialResult,
                engineResult: trial.engineResult,
                reason: trial.failureReason || trial.skip?.reason || null,
            });
        if (trial.failureDomain === 'ISOLATION') errors.push(`${key}: isolation failure`);
        if (trial.agentResult === 'SKIP' && !trial.approvedNonBlockingSkip)
            errors.push(`${key}: unapproved skipped run`);
        if (
            !Array.isArray(run.publicAPIMisuse) ||
            !Array.isArray(run.validatorCoverage) ||
            run.validatorCoverage.length === 0
        )
            errors.push(`${key}: missing misuse/validation coverage observations`);
    }
    let availablePairs = 0;
    for (const [key, pair] of pairs) {
        if (pair.length !== 2 || pair[0].commonInputSha256 !== pair[1].commonInputSha256) {
            errors.push(`${key}: unmatched pair`);
            continue;
        }
        if (pair.every((run) => run.trial && existingMetrics().isEligible(run.trial))) availablePairs++;
    }
    if (availablePairs !== protocol.cohort.pairsPerConfiguration)
        errors.push('fewer than 36 available matched pairs; excluded attempts remain visible, not successful');
    const validTrials = runs
        .map((run) => run.trial)
        .filter((trial) => trial?.manifest && Number.isInteger(trial.repairs) && Array.isArray(trial.policyDenials));
    const aggregate = validTrials.length ? existingMetrics().aggregate(validTrials) : null;
    if (!aggregate) errors.push('no observed trials; Agent performance metrics are unavailable');
    else if (aggregate.agentFinalSuccessRate < protocol.cohort.minimumSuccessRate)
        errors.push('Agent final success rate below frozen 80%');
    return {
        gate: 'AGENT',
        status: errors.length ? 'BLOCKED' : 'PASS',
        errors,
        retainedRuns: runs.length,
        availablePairs,
        exclusions,
        metrics: aggregate,
    };
}
module.exports = {
    sha256,
    digest,
    sourceFiles,
    requiredSources,
    artifactFiles,
    requiredArtifacts,
    createSnapshot,
    validateSnapshot,
    validateEngine,
    validateAgent,
    validateAgentPreparation,
};
if (require.main === module) {
    const args = Object.fromEntries(
        process.argv.slice(2).map((arg) => {
            const i = arg.indexOf('=');
            return [arg.slice(0, i), arg.slice(i + 1)];
        }),
    );
    if (args['--freeze']) {
        if (fs.existsSync(args['--freeze'])) throw new Error('Freeze output already exists');
        const manifest = JSON.parse(
            fs.readFileSync(path.join(root, 'ai/ledgers/upstream-update/acceptance-manifest.json'), 'utf8'),
        );
        const snapshot = createSnapshot(root, manifest);
        fs.mkdirSync(path.dirname(args['--freeze']), { recursive: true });
        fs.writeFileSync(args['--freeze'], JSON.stringify(snapshot, null, 2) + '\n');
        console.log(JSON.stringify({ frozen: args['--freeze'], snapshotDigest: digest(snapshot) }));
        process.exit(0);
    }
    if (!args['--snapshot'] || !args['--engine'] || !args['--agent'] || !args['--out'])
        throw new Error('--snapshot= --engine= --agent= --out= required');
    if (fs.existsSync(args['--out'])) throw new Error('Output exists; never overwrite original gate attempts');
    const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
    const snapshot = read(args['--snapshot']),
        manifest = read(path.join(root, 'ai/ledgers/upstream-update/acceptance-manifest.json')),
        protocol = read(path.join(root, 'tools/benchmark/upstream/agent-protocol.json'));
    const engine = validateEngine(read(args['--engine']), snapshot, manifest),
        agent = validateAgent(read(args['--agent']), snapshot, protocol, root, manifest, {
            threePackageDir: args['--three-package'],
            engineArtifactPaths: { cocosair: args['--cocos-artifact'], three: args['--three-artifact'] },
        });
    const result = {
        collectedAt: new Date().toISOString(),
        engine,
        agent,
        planComplete: engine.planComplete && agent.status === 'PASS',
    };
    fs.mkdirSync(path.dirname(args['--out']), { recursive: true });
    fs.writeFileSync(args['--out'], JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
    if (!result.planComplete) process.exitCode = 1;
}
