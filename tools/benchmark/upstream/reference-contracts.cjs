/** Fail-closed, read-only preparation admission. Never launches a browser or generates a trial. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const oracle = require('./references/observations.cjs');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const MANIFEST_PATH = 'tools/benchmark/upstream/reference-manifest.json';
const COHORT = Object.freeze({
    tasks: 12,
    repetitions: 3,
    engines: ['cocosair', 'three'],
    pairsPerConfiguration: 36,
    runsPerConfiguration: 72,
    repairBudget: 5,
    timeBudgetMs: 1200000,
    minimumSuccessRate: 0.8,
});
function safeFile(root, relative) {
    assert(
        typeof relative === 'string' && relative.length > 0 && !path.isAbsolute(relative),
        'relative evidence path required',
    );
    const base = fs.realpathSync(root),
        file = path.resolve(base, relative);
    assert(file.startsWith(base + path.sep), 'path escapes evidence root');
    const real = fs.realpathSync(file);
    assert(real.startsWith(base + path.sep), 'symlink escapes evidence root');
    return real;
}
function readManifest(root) {
    const bytes = fs.readFileSync(safeFile(root, MANIFEST_PATH)),
        manifest = JSON.parse(bytes);
    assert.equal(manifest.schema, 'upstream-agent-reference-manifest/1');
    assert.deepEqual(manifest.cohort, COHORT);
    assert.deepEqual(manifest.thresholds, oracle.THRESHOLDS);
    assert.deepEqual(manifest.tasks.map((t) => t.taskId).sort(), oracle.TASK_IDS);
    assert.equal(manifest.referencesProtected, true);
    assert.equal(
        new Set(manifest.sources.map((source) => source.id)).size,
        manifest.sources.length,
        'duplicate source identity',
    );
    const publicBytes = fs.readFileSync(safeFile(root, manifest.publicInputManifest.path));
    assert.equal(sha256(publicBytes), manifest.publicInputManifest.sha256, 'public input manifest changed');
    const publicInputs = JSON.parse(publicBytes);
    for (const task of manifest.tasks) {
        assert.equal(task.contractId, oracle.contractId(task.taskId));
        assert.deepEqual(task.cases, oracle.CASES[task.taskId]);
        const publicTask = publicInputs.tasks.find((row) => row.id === task.taskId);
        assert.equal(task.commonInputSha256, publicTask.commonInputSha256, 'common input contract changed');
        assert.deepEqual(task.repetitionSeeds, publicTask.repetitionSeeds, 'frozen seeds changed');
    }
    return { manifest, manifestSha256: sha256(bytes) };
}
function inspectReferencePreparation(root, options = {}) {
    root = path.resolve(root);
    const { manifest, manifestSha256 } = readManifest(root),
        blockers = [];
    const sources = Object.fromEntries(
        manifest.sources.map((source) => {
            let actualSha256 = null,
                reason = null;
            try {
                const sourceRoot = source.package === 'three' ? options.threePackageDir : root;
                if (!sourceRoot)
                    throw Error(
                        'Exact extracted three@0.186.1 package path not supplied for read-only source verification',
                    );
                actualSha256 = sha256(fs.readFileSync(safeFile(sourceRoot, source.path)));
                if (actualSha256 !== source.sha256) reason = 'source SHA256 differs from frozen reference';
            } catch (error) {
                reason = error.message;
            }
            return [source.id, { ...source, actualSha256, verified: !reason, reason }];
        }),
    );
    const tasks = manifest.tasks.map((task) => {
        const references = Object.fromEntries(
            ['cocosair', 'three'].map((engine) => {
                const reference = task.references[engine];
                const mismatches = reference.sourceIds.filter((id) => !sources[id]?.verified);
                const sourceBound = mismatches.length === 0;
                const sourceReady =
                    sourceBound && reference.pendingSemantics.length === 0 && !!reference.collectorAdapter;
                const missing = [
                    ...mismatches.map((id) => ({
                        code: 'REFERENCE_SOURCE_UNVERIFIED',
                        sourceId: id,
                        reason: sources[id]?.reason || 'unknown source',
                    })),
                    ...reference.pendingSemantics.map((reason) => ({
                        code:
                            task.taskId === 'AU12' && engine === 'three'
                                ? 'THREE_MATCHING_DECLARATIONS_NOT_FROZEN'
                                : 'REFERENCE_SEMANTIC_GAP',
                        reason,
                    })),
                ];
                if (!reference.collectorAdapter)
                    missing.push({ code: 'COMMON_COLLECTOR_BINDING_MISSING', reason: reference.collectorGap });
                for (const missingEntry of missing) blockers.push({ taskId: task.taskId, engine, ...missingEntry });
                return [engine, { ...reference, sourceBound, sourceReady, browserValidated: false, blockers: missing }];
            }),
        );
        const validator = sources[task.validatorSourceId];
        if (!validator?.verified) blockers.push({ taskId: task.taskId, code: 'VALIDATOR_SOURCE_UNVERIFIED' });
        const sourceReady = validator?.verified === true && Object.values(references).every((r) => r.sourceReady);
        return {
            taskId: task.taskId,
            contractId: task.contractId,
            commonInputSha256: task.commonInputSha256,
            repetitionSeeds: task.repetitionSeeds,
            cases: task.cases,
            references,
            validatorIdentity: { path: validator?.path, sha256: validator?.sha256, export: 'validateObservation' },
            sourceReady,
            browserValidated: false,
            readyForReferenceExecution: sourceReady,
        };
    });
    blockers.push({
        code: 'PAIRED_REFERENCE_BROWSER_EVIDENCE_MISSING',
        reason: 'No retained common-contract browser receipt has been supplied and verified for both engines on every task.',
    });
    return {
        schema: 'upstream-agent-reference-preparation/1',
        manifestSha256,
        cohort: COHORT,
        thresholds: oracle.THRESHOLDS,
        sources,
        tasks,
        readyForReferenceExecution: tasks.every((t) => t.sourceReady),
        readyForGeneration: false,
        blockers,
        scope: 'Source preparation and independent CPU oracle tests only; never an LLM or browser success metric.',
    };
}
function prepareReferenceInventory({ root, ...options }) {
    return inspectReferencePreparation(root, options);
}
/** Verify the actual archive and its public ESM entry, without extraction or package scripts. */
function inspectArtifactRuntime(engineArtifactPath, engine, expectedSha256) {
    assert(['cocosair', 'three'].includes(engine));
    assert(engineArtifactPath, 'trusted engine artifact path required');
    const artifact = path.resolve(engineArtifactPath);
    assert.equal(sha256(fs.readFileSync(artifact)), expectedSha256, 'engine archive bytes differ from frozen identity');
    const { execFileSync } = require('node:child_process');
    const names = execFileSync('tar', ['-tzf', artifact], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
        .trim()
        .split('\n');
    const readEntry = (entry) => {
        assert.equal(names.filter((name) => name === entry).length, 1, 'archive entry must exist exactly once');
        return execFileSync('tar', ['-xzOf', artifact, entry], { maxBuffer: 64 * 1024 * 1024 });
    };
    const metadata = JSON.parse(readEntry('package/package.json'));
    if (engine === 'three') {
        assert.equal(metadata.name, 'three');
        assert.equal(metadata.version, '0.186.1');
        assert.equal(expectedSha256, '8cd068708ea44f2c73c944b1cead2ba2f0d5c15c8fc194e5700f4e4f4a033fe7');
    } else assert(['cocosair.js', 'cocosair'].includes(metadata.name), 'not a Cocos AIR package');
    const exported =
        typeof metadata.exports?.['.'] === 'string' ? metadata.exports['.'] : metadata.exports?.['.']?.import;
    assert(
        typeof exported === 'string' && exported.startsWith('./') && !exported.split('/').includes('..'),
        'unambiguous public ESM export required',
    );
    const runtimeEntry = 'package/' + exported.slice(2);
    if (engine === 'three') assert.equal(runtimeEntry, 'package/build/three.module.js');
    const runtime = readEntry(runtimeEntry);
    return {
        artifactSha256: expectedSha256,
        packageName: metadata.name,
        packageVersion: metadata.version,
        runtimeEntry,
        runtimeModuleSha256: sha256(runtime),
    };
}
/** Every served Three module must be an exact member of the frozen archive, not only its entry point. */
function verifyExtractedArtifact(engineArtifactPath, packageDir) {
    assert(packageDir, 'trusted extracted package directory required');
    const expected = require('./references/sdk-reference.cjs').archiveEntries(engineArtifactPath);
    const actual = [],
        base = fs.realpathSync(packageDir);
    const walk = (directory) => {
        for (const name of fs.readdirSync(directory).sort()) {
            const file = path.join(directory, name),
                stat = fs.lstatSync(file);
            assert(!stat.isSymbolicLink(), 'extracted package must not serve unverified symlink targets');
            if (stat.isDirectory()) walk(file);
            else {
                assert(stat.isFile());
                actual.push({
                    path: path.relative(base, file).split(path.sep).join('/'),
                    bytes: stat.size,
                    sha256: sha256(fs.readFileSync(file)),
                });
            }
        }
    };
    walk(base);
    actual.sort((a, b) => a.path.localeCompare(b.path));
    assert.deepEqual(
        actual,
        expected,
        'extracted package differs from actual frozen archive, including transitive module imports',
    );
    return { files: actual.length, treeSha256: sha256(JSON.stringify(actual)) };
}
/** Receipt schema cannot self-attest success. Re-read all retained bytes and apply the protected oracle.
 * Current manifest deliberately does not admit collectors that omit required common raw observations.
 */
function validateReferenceReceipt(
    receipt,
    {
        root,
        taskId,
        commonInputSha256,
        seed,
        engineArtifactSha256,
        engineArtifactPath,
        engine,
        evidenceRoot = root,
        threePackageDir,
    } = {},
) {
    assert(root, 'repository root required');
    const { manifest, manifestSha256 } = readManifest(root);
    const task = manifest.tasks.find((t) => t.taskId === taskId);
    assert(task, 'unknown reference task');
    assert.equal(receipt?.schema, 'upstream-agent-reference-receipt/1');
    assert.equal(receipt.taskId, taskId);
    assert.equal(receipt.contractId, task.contractId);
    assert(['cocosair', 'three'].includes(receipt.engine));
    if (engine) assert.equal(receipt.engine, engine);
    assert.equal(commonInputSha256, task.commonInputSha256, 'caller input hash is not frozen task identity');
    assert.equal(receipt.commonInputSha256, commonInputSha256);
    assert(/^[0-9a-f]{64}$/.test(commonInputSha256));
    assert(Number.isSafeInteger(seed) && task.repetitionSeeds.includes(seed), 'caller seed is not frozen');
    assert.equal(receipt.seed, seed);
    assert.equal(receipt.manifestSha256, manifestSha256);
    assert.equal(receipt.engineArtifactSha256, engineArtifactSha256);
    assert(/^[0-9a-f]{64}$/.test(engineArtifactSha256));
    const runtimeIdentity = inspectArtifactRuntime(engineArtifactPath, receipt.engine, engineArtifactSha256);
    assert.equal(
        receipt.runtimeModuleSha256,
        runtimeIdentity.runtimeModuleSha256,
        'served runtime is not the actual archive public ESM entry',
    );
    if (receipt.engine === 'three') verifyExtractedArtifact(engineArtifactPath, threePackageDir);
    const reference = task.references[receipt.engine];
    assert(
        reference.collectorAdapter,
        `${taskId}/${receipt.engine}: no complete common-contract collector binding is frozen`,
    );
    assert.equal(reference.pendingSemantics.length, 0, 'reference semantic coverage incomplete');
    const preparation = inspectReferencePreparation(root, { threePackageDir });
    assert(preparation.sources[task.validatorSourceId]?.verified, 'independent validator source changed');
    assert(
        preparation.tasks.find((t) => t.taskId === taskId).references[receipt.engine].sourceReady,
        'reference sources not verified',
    );
    assert.equal(receipt.collector.path, reference.collectorAdapter.path);
    assert.equal(receipt.collector.sha256, reference.collectorAdapter.sha256);
    assert.equal(receipt.collector.contractId, task.contractId);
    assert.equal(receipt.provenance.kind, 'protected-reference-browser-collection');
    assert.equal(receipt.provenance.generatedTrial, false);
    assert.equal(receipt.provenance.scriptedBenchmarkRun, false);
    assert.equal(receipt.browser.backend, 'webgl2');
    for (const name of ['name', 'version', 'renderer', 'device'])
        assert(typeof receipt.browser[name] === 'string' && receipt.browser[name]);
    assert(
        Number.isFinite(Date.parse(receipt.startedAt)) &&
            Date.parse(receipt.finishedAt) >= Date.parse(receipt.startedAt),
    );
    const readArtifact = (artifact) => {
        assert(/^[0-9a-f]{64}$/.test(artifact?.sha256));
        const bytes = fs.readFileSync(safeFile(evidenceRoot, artifact.path));
        assert.equal(sha256(bytes), artifact.sha256, 'retained reference artifact changed');
        return bytes;
    };
    const observation = JSON.parse(readArtifact(receipt.artifacts.observation));
    assert.equal(observation.taskId, taskId);
    assert.equal(observation.engine, receipt.engine);
    const validation = oracle.validateObservation(observation);
    const invocation = JSON.parse(readArtifact(receipt.artifacts.invocation));
    assert.equal(invocation.taskId, taskId);
    assert.equal(invocation.engine, receipt.engine);
    assert.equal(invocation.modelCalls, 0);
    assert.equal(invocation.generatedTrial, false);
    assert.equal(invocation.engineArtifactSha256, engineArtifactSha256);
    assert.equal(invocation.runtimeModuleSha256, receipt.runtimeModuleSha256);
    assert(/^[0-9a-f]{64}$/.test(receipt.runtimeModuleSha256));
    assert.equal(invocation.exitCode, 0);
    assert.equal(invocation.browserClosed, true);
    assert.equal(invocation.serverClosed, true);
    assert.equal(invocation.collectorSha256, receipt.collector.sha256);
    assert.equal(invocation.commonInputSha256, commonInputSha256);
    assert.equal(invocation.seed, seed);
    assert.deepEqual(
        invocation.sourceFingerprints,
        Object.fromEntries(reference.sourceIds.map((id) => [id, preparation.sources[id].sha256])),
    );
    if (taskId === 'AU12') {
        const evidence = JSON.parse(readArtifact(receipt.artifacts.sdkEvidence));
        const index = JSON.parse(readArtifact(receipt.artifacts.sdkEvidenceIndex));
        assert(Array.isArray(index) && index.length > 0, 'retained compiler/build/browser raw artifacts required');
        assert.equal(new Set(index.map((row) => row.path)).size, index.length, 'duplicate SDK evidence path');
        index.forEach(readArtifact);
        assert.equal(evidence.prepared.package.sha256, engineArtifactSha256);
        assert.equal(evidence.cpu.packageSha256, engineArtifactSha256);
        assert.equal(evidence.cpu.status, 'CPU_OBSERVED_BROWSER_PENDING');
        assert.equal(evidence.prepared.sourceSha256, preparation.sources.sdkReference.sha256);
        assert.equal(evidence.cpu.sourceSha256, preparation.sources.sdkReference.sha256);
        assert(evidence.cpu.stages.length >= 7);
        evidence.cpu.stages.forEach((stage) => {
            assert.equal(stage.exitCode, 0);
            assert.equal(stage.signal, null);
            assert.equal(stage.error, null);
            assert(typeof stage.stdout === 'string' && stage.stdout.includes('SDK_RESULT '));
        });
        const types = observation.cases.find((row) => row.id === 'strict-types');
        assert.deepEqual(evidence.cpu.modes, types.modes);
        if (receipt.engine === 'cocosair') {
            assert.equal(types.declarationPackageSha256, engineArtifactSha256);
            assert.equal(types.fixtureSource.sha256, sha256(fs.readFileSync(safeFile(root, types.fixtureSource.path))));
            assert.equal(
                types.fixtureSource.verifierSha256,
                sha256(fs.readFileSync(safeFile(root, types.fixtureSource.verifierPath))),
            );
        }
        const browserRows = [
            ...observation.cases.find((row) => row.id === 'installed-esm').browserModes,
            ...observation.cases.find((row) => row.id === 'vite').browserModes,
        ];
        assert.deepEqual(evidence.browsers, browserRows);
        for (const row of browserRows) {
            const record = index.find((item) => item.path === `sdk-${row.mode}.png`);
            assert(record, 'SDK screenshot missing');
            assert.equal(record.sha256, row.presentation.sha256);
            const screenshot = require('pngjs').PNG.sync.read(readArtifact(record));
            const offset =
                (Math.floor(screenshot.height / 2) * screenshot.width + Math.floor(screenshot.width / 2)) * 4;
            assert.deepEqual([...screenshot.data.subarray(offset, offset + 4)], row.presentation.pixels);
        }
    }
    if (['AU01', 'AU02', 'AU03'].includes(taskId)) {
        const server = JSON.parse(readArtifact(receipt.artifacts.requestServer));
        assert.equal(server.schema, 'upstream-request-server-observations/1');
        assert(
            Object.values(server.sessions).some((session) => session.entries.length > 0),
            'real HTTP server observations required',
        );
        for (const session of Object.values(server.sessions)) {
            assert.equal(session.held.length, 0);
            assert.equal(session.listenerCount, 0);
        }
        assert.equal(
            server.resourceHashes['model.gltf'],
            '390bd62799e00d3ee72779835b3a2e0a23eabc37a02bfcb8df6b737780023568',
        );
        assert.equal(
            server.resourceHashes['mesh.bin'],
            'cd4f0f0904b0661f78f9e0245ec2bfd2c935ad17afb2d0a9b5082d36f0103405',
        );
        assert.equal(
            server.resourceHashes['pixel.png'],
            'dc1ee8a784c37702b5b456b1657db9c8ce3fc98fd4e30c203b300aaf724eae2f',
        );
    }
    const png = require('pngjs').PNG.sync.read(readArtifact(receipt.artifacts.compositor));
    assert(
        png.width > 0 && png.height > 0 && png.data.some((v, i) => i % 4 !== 3 && v > 8),
        'blank compositor artifact',
    );
    return {
        validated: true,
        taskId,
        engine: receipt.engine,
        contractId: task.contractId,
        manifestSha256,
        observationSha256: receipt.artifacts.observation.sha256,
        validation,
    };
}
module.exports = {
    COHORT,
    MANIFEST_PATH,
    sha256,
    inspectReferencePreparation,
    prepareReferenceInventory,
    inspectArtifactRuntime,
    verifyExtractedArtifact,
    validateReferenceReceipt,
    validateObservation: oracle.validateObservation,
};
if (require.main === module) {
    const root = path.resolve(__dirname, '../../..');
    const packageArg = process.argv.find((v) => v.startsWith('--three-package='))?.slice(16);
    const output = inspectReferencePreparation(root, { threePackageDir: packageArg && path.resolve(packageArg) });
    console.log(JSON.stringify(output, null, 2));
    if (!output.readyForGeneration) process.exitCode = 2;
}
