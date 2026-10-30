const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const referenceContracts = require('../benchmark/upstream/reference-contracts.cjs');
const {
    sha256,
    digest,
    requiredArtifacts,
    requiredSources,
    createSnapshot,
    validateEngine,
    validateAgent,
    validateAgentPreparation,
} = require('./upstream-gates.cjs');
const manifest = require('../../ai/ledgers/upstream-update/acceptance-manifest.json');
const originalProtocol = require('../benchmark/upstream/agent-protocol.json');
function fixture(t, { mockReferenceBoundary = true } = {}) {
    // This unit suite isolates aggregate admission from the separately tested real protected receipt validator.
    // The stub is confined to node:test context; there is no production bypass option.
    if (mockReferenceBoundary)
        t.mock.method(referenceContracts, 'validateReferenceReceipt', (receipt) => ({
            validated: true,
            engine: receipt.engine,
            taskId: receipt.taskId,
            contractId: 'unit-only',
        }));
    if (mockReferenceBoundary)
        t.mock.method(referenceContracts, 'validateObservation', (observation) => ({
            validated: true,
            contractId: 'unit-only',
            taskId: observation.taskId,
        }));
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'upstream-gate-unit-'));
    t.after(() => fs.rmSync(base, { recursive: true, force: true }));
    for (const file of [...requiredSources, 'src/contract.ts', ...requiredArtifacts, 'evidence/raw.json']) {
        fs.mkdirSync(path.dirname(path.join(base, file)), { recursive: true });
        fs.writeFileSync(path.join(base, file), 'synthetic unit fixture, NOT runtime evidence');
    }
    const snapshot = createSnapshot(base, manifest),
        evidence = [
            { path: 'evidence/raw.json', sha256: sha256(fs.readFileSync(path.join(base, 'evidence/raw.json'))) },
        ];
    const engine = {
        track: 'ENGINE_REFERENCE',
        snapshotDigest: digest(snapshot),
        completed: true,
        partial: false,
        scope: manifest.cases.map((c) => c.id),
        observations: manifest.cases.flatMap((c) =>
            c.dimensions.map((dimension) => ({
                caseId: c.id,
                dimension,
                status: 'PASS',
                snapshotDigest: digest(snapshot),
                evidence,
            })),
        ),
    };
    const protocol = structuredClone(originalProtocol);
    protocol.executionStatus = 'READY';
    protocol.launchConfiguration = { frozen: true };
    protocol.referenceBaseline.executionIdentityFrozen = true;
    protocol.referenceBaseline.artifactSha256 = 'a'.repeat(64);
    protocol.preparation = {
        schema: 'upstream-agent-preparation/1',
        status: 'READY_FOR_GENERATION',
        sourceManifestEvidence: evidence,
        tasks: protocol.tasks.map((task) => ({
            id: task.id,
            commonInputSha256: 'a'.repeat(64),
            repetitionSeeds: [0, 1, 2],
            validatorIds: ['unit-only'],
            referencesBrowserValidated: true,
            referenceEvidence: { cocosair: evidence, three: evidence },
            referenceReceipts: Object.fromEntries(
                protocol.cohort.engines.map((engine) => [
                    engine,
                    [0, 1, 2].map((seed) => {
                        const file = `evidence/reference-${task.id}-${engine}-${seed}.json`;
                        const content = JSON.stringify({ taskId: task.id, engine, seed, unitOnly: true });
                        fs.writeFileSync(path.join(base, file), content);
                        return { path: file, sha256: sha256(content) };
                    }),
                ]),
            ),
        })),
    };
    const model = {
        kind: 'LLM',
        provider: 'synthetic-unit-only',
        name: 'unit-model',
        revision: 'unit-revision',
        profileId: 'unit',
    };
    const runs = protocol.tasks.flatMap((task) =>
        [0, 1, 2].flatMap((repeat) =>
            protocol.cohort.engines.map((engine) => ({
                taskId: task.id,
                repeat,
                seed: repeat,
                engine,
                runId: `${task.id}-${repeat}-${engine}`,
                generationSource: 'provider',
                modelRevision: model.revision,
                commonInputSha256: 'a'.repeat(64),
                inputEvidence: evidence,
                outputEvidence: evidence,
                validationEvidence: evidence,
                observationEvidence: (() => {
                    const file = `evidence/observation-${task.id}-${repeat}-${engine}.json`;
                    const content = JSON.stringify({ taskId: task.id, engine, unitOnly: true });
                    fs.writeFileSync(path.join(base, file), content);
                    return { path: file, sha256: sha256(content) };
                })(),
                elapsedMs: 1,
                tokens: { input: 1, output: 1 },
                cost: { amount: 0, currency: 'USD' },
                publicAPIMisuse: [],
                validatorCoverage: ['unit-only'],
                trial: {
                    manifest: { repairBudget: 5, timeBudgetMs: 1200000 },
                    benchmarkType: 'source-create',
                    trialResult: 'VALID',
                    engineResult: 'PASS',
                    agentResult: 'PASS',
                    failureDomain: 'NONE',
                    repairs: 0,
                    firstSubmissionCompilePass: true,
                    policyDenials: [],
                },
            })),
        ),
    );
    const agent = {
        track: 'AGENT_GENERATED',
        snapshotDigest: digest(snapshot),
        protocolDigest: digest(protocol),
        completed: true,
        partial: false,
        model,
        configuration: {
            threeArtifactSha256: 'a'.repeat(64),
            cocosArtifactSha256: 'b'.repeat(64),
            knowledgeSha256: 'c'.repeat(64),
            generationParameters: { temperature: 0 },
            preparationDigest: digest(protocol.preparation),
        },
        runs,
    };
    protocol.launchConfiguration = {
        configurationDigest: digest(agent.configuration),
        modelDigest: digest(agent.model),
    };
    agent.protocolDigest = digest(protocol);
    return { base, snapshot, evidence, engine, protocol, agent };
}
test('synthetic complete fixtures exercise validators, not real Engine/Agent performance', (t) => {
    const f = fixture(t);
    assert.equal(validateEngine(f.engine, f.snapshot, manifest, f.base).planComplete, true);
    assert.equal(validateAgent(f.agent, f.snapshot, f.protocol, f.base).status, 'PASS');
});
for (const kind of [
    'missing-evidence',
    'stale-evidence',
    'stale-source',
    'omitted-source',
    'omitted-artifact',
    'changed-installed-tool',
    'changed-optional-asset',
    'added-artifact',
    'subset',
    'skip',
    'negative-only',
    'duplicate',
    'removed-research',
])
    test('Engine rejects ' + kind, (t) => {
        const f = fixture(t);
        if (kind === 'missing-evidence') f.engine.observations[0].evidence = [];
        if (kind === 'stale-evidence') fs.writeFileSync(path.join(f.base, 'evidence/raw.json'), 'changed');
        if (kind === 'stale-source') fs.writeFileSync(path.join(f.base, 'src/contract.ts'), 'changed');
        if (kind === 'omitted-source') delete f.snapshot.sourceEntries['src/contract.ts'];
        if (kind === 'omitted-artifact') delete f.snapshot.artifactEntries[requiredArtifacts[0]];
        if (kind === 'changed-installed-tool')
            fs.writeFileSync(path.join(f.base, 'node_modules/typescript/lib/typescript.js'), 'changed');
        if (kind === 'changed-optional-asset')
            fs.writeFileSync(path.join(f.base, 'build/webgpu/twgsl.wasm'), 'changed');
        if (kind === 'added-artifact') fs.writeFileSync(path.join(f.base, 'build/webgpu/extra.wasm'), 'added');
        if (kind === 'subset') f.engine.partial = true;
        if (kind === 'skip') f.engine.observations[0].status = 'SKIP';
        if (kind === 'negative-only') f.engine.observations[0].expectedNegativeOnly = true;
        if (kind === 'duplicate') f.engine.observations.push(f.engine.observations[0]);
        if (kind === 'removed-research')
            f.engine.observations = f.engine.observations.filter((r) => r.caseId !== 'T33');
        assert.equal(validateEngine(f.engine, f.snapshot, manifest, f.base).planComplete, false);
    });
test('evidenced inapplicability completes a research decision without claiming feature support', (t) => {
    const f = fixture(t),
        r = f.engine.observations.find((r) => r.caseId === 'T31');
    r.status = 'NOT_APPLICABLE_WITH_EVIDENCE';
    r.rationale = 'synthetic unsupported decision';
    const result = validateEngine(f.engine, f.snapshot, manifest, f.base);
    assert.equal(result.stablePassed, true);
    assert.equal(result.researchCompleted, true);
    assert.equal(result.planComplete, true);
    assert.equal(
        result.research.find((row) => row.key === 'T31/chromium-webgl2').status,
        'NOT_APPLICABLE_WITH_EVIDENCE',
    );
});
for (const kind of [
    'scripted',
    'wrong-track',
    'partial',
    'missing-run',
    'duplicate-run',
    'unmatched-pair',
    'unknown-cost',
    'malformed-coverage',
    'missing-output',
    'infra',
    'unapproved-skip',
    'isolation',
    'budget',
    'low-success',
    'unfrozen',
    'stale-source',
    'unprepared',
    'reference-not-validated',
    'missing-reference-evidence',
    'unfrozen-input',
    'unfrozen-seed',
    'wrong-validator',
    'changed-three-baseline',
    'missing-reference-receipts',
    'changed-reference-bytes',
    'duplicate-reference-seed',
    'wrong-reference-engine',
    'missing-generated-observation',
    'changed-generated-observation',
    'wrong-generated-arm',
])
    test('Agent rejects ' + kind, (t) => {
        const f = fixture(t),
            r = f.agent.runs[0];
        if (kind === 'missing-reference-receipts') delete f.protocol.preparation.tasks[0].referenceReceipts;
        if (kind === 'changed-reference-bytes')
            fs.appendFileSync(
                path.join(f.base, f.protocol.preparation.tasks[0].referenceReceipts.three[0].path),
                'changed',
            );
        if (kind === 'duplicate-reference-seed')
            f.protocol.preparation.tasks[0].referenceReceipts.three[1] =
                f.protocol.preparation.tasks[0].referenceReceipts.three[0];
        if (kind === 'wrong-reference-engine')
            f.protocol.preparation.tasks[0].referenceReceipts.three =
                f.protocol.preparation.tasks[0].referenceReceipts.cocosair;
        if (kind === 'missing-generated-observation') delete r.observationEvidence;
        if (kind === 'changed-generated-observation')
            fs.appendFileSync(path.join(f.base, r.observationEvidence.path), 'changed');
        if (kind === 'wrong-generated-arm') r.observationEvidence = f.agent.runs[1].observationEvidence;
        if (kind === 'scripted') f.agent.model.name = 'scripted-reference-solver';
        if (kind === 'wrong-track') f.agent.track = 'ENGINE_REFERENCE';
        if (kind === 'partial') f.agent.partial = true;
        if (kind === 'missing-run') f.agent.runs.pop();
        if (kind === 'duplicate-run') f.agent.runs[1] = f.agent.runs[0];
        if (kind === 'unmatched-pair') r.commonInputSha256 = 'd'.repeat(64);
        if (kind === 'unknown-cost') r.cost = null;
        if (kind === 'malformed-coverage') r.validatorCoverage = 'claimed';
        if (kind === 'missing-output') r.outputEvidence = [];
        if (kind === 'infra') {
            r.trial.trialResult = 'INFRA_FAILURE';
            r.trial.agentResult = 'NOT_EVALUATED';
            r.trial.failureDomain = 'INFRASTRUCTURE';
        }
        if (kind === 'unapproved-skip') r.trial.agentResult = 'SKIP';
        if (kind === 'isolation') r.trial.failureDomain = 'ISOLATION';
        if (kind === 'budget') r.trial.repairs = 6;
        if (kind === 'low-success') for (const run of f.agent.runs.slice(0, 20)) run.trial.agentResult = 'FAIL';
        if (kind === 'unfrozen') f.protocol.executionStatus = 'BLOCKED';
        if (kind === 'stale-source') fs.writeFileSync(path.join(f.base, 'src/contract.ts'), 'changed');
        if (kind === 'unprepared') delete f.protocol.preparation;
        if (kind === 'reference-not-validated') f.protocol.preparation.tasks[0].referencesBrowserValidated = false;
        if (kind === 'missing-reference-evidence') f.protocol.preparation.tasks[0].referenceEvidence.three = [];
        if (kind === 'unfrozen-input') for (const run of f.agent.runs) run.commonInputSha256 = 'e'.repeat(64);
        if (kind === 'unfrozen-seed') for (const run of f.agent.runs) run.seed += 100;
        if (kind === 'wrong-validator') r.validatorCoverage = ['unrelated'];
        if (kind === 'changed-three-baseline') f.protocol.referenceBaseline.artifactSha256 = 'f'.repeat(64);
        assert.equal(validateAgent(f.agent, f.snapshot, f.protocol, f.base).status, 'BLOCKED');
    });

test('actual protected receipt validator rejects self-attested booleans and synthetic hashes', (t) => {
    const f = fixture(t, { mockReferenceBoundary: false });
    const errors = [];
    validateAgentPreparation(f.protocol, f.base, errors, f.agent.configuration);
    assert.equal(errors.filter((message) => message.includes('independent receipt validation failed')).length, 72);
});
test('every configured arm and seed reaches the independent protected reference boundary', (t) => {
    const f = fixture(t),
        errors = [];
    validateAgentPreparation(f.protocol, f.base, errors, f.agent.configuration);
    assert.deepEqual(errors, []);
    assert.equal(referenceContracts.validateReferenceReceipt.mock.callCount(), 72);
    for (const call of referenceContracts.validateReferenceReceipt.mock.calls) {
        const [receipt, options] = call.arguments;
        assert.equal(options.taskId, receipt.taskId);
        assert.equal(options.seed, receipt.seed);
        assert.equal(options.engineArtifactSha256, receipt.engine === 'three' ? 'a'.repeat(64) : 'b'.repeat(64));
    }
});

test('no model observations never produces a zero-percent performance claim', (t) => {
    const f = fixture(t);
    f.agent.runs = [];
    const result = validateAgent(f.agent, f.snapshot, f.protocol, f.base);
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.metrics, null);
    assert.equal(result.retainedRuns, 0);
    assert.equal(result.availablePairs, 0);
});
test('actual generated observation oracle rejects self-attested synthetic PASS', (t) => {
    const f = fixture(t, { mockReferenceBoundary: false });
    const result = validateAgent(f.agent, f.snapshot, f.protocol, f.base);
    assert.equal(
        result.errors.filter((message) =>
            message.includes('generated PASS rejected by independent observation validation'),
        ).length,
        72,
    );
});

test('checked-in preparation binds the actual public inputs and protected reference inventory without enabling generation', () => {
    const root = path.resolve(__dirname, '../..');
    const publicInputs = require('../benchmark/upstream/public-inputs.json');
    const references = require('../benchmark/upstream/reference-manifest.json');
    const preparation = originalProtocol.preparation;
    assert.equal(originalProtocol.executionStatus, 'BLOCKED');
    assert.equal(originalProtocol.launchConfiguration, null);
    assert.equal(preparation.status, 'PREPARED_NOT_VALIDATED');
    assert.equal(preparation.tasks.length, 12);
    assert.equal(preparation.referenceSourceCount, references.sources.length);
    for (const item of preparation.sourceManifestEvidence)
        assert.equal(sha256(fs.readFileSync(path.join(root, item.path))), item.sha256);
    for (const task of preparation.tasks) {
        const common = publicInputs.tasks.find((item) => item.id === task.id);
        const reference = references.tasks.find((item) => item.taskId === task.id);
        assert.equal(task.commonInputSha256, common.commonInputSha256);
        assert.equal(task.commonInputSha256, reference.commonInputSha256);
        assert.deepEqual(task.repetitionSeeds, common.repetitionSeeds);
        assert.deepEqual(task.validatorIds, [reference.contractId]);
        assert.equal(task.referencesBrowserValidated, false);
        for (const engine of originalProtocol.cohort.engines) {
            assert.deepEqual(task.referenceReceipts[engine], []);
            assert.deepEqual(task.referenceEvidence[engine], []);
            assert.deepEqual(task.referenceSourceIds[engine], reference.references[engine].sourceIds);
        }
    }
    const configurations = originalProtocol.preparedComparisonConfigurations;
    assert.equal(configurations.length, 4);
    for (const configuration of configurations) {
        assert.equal(configuration.status, 'BLOCKED_NOT_EXECUTED');
        assert.equal(configuration.runCount, 0);
        assert.equal(configuration.model, null);
        assert.equal(configuration.threeArtifactSha256, references.threeArtifact.sha256);
    }
    const control = configurations.find((item) => item.id === 'engine-control');
    const candidate = configurations.find((item) => item.id === 'engine-candidate');
    assert.equal(control.cocosKnowledgeSha256, candidate.cocosKnowledgeSha256);
    assert.notEqual(control.cocosArtifactSha256, candidate.cocosArtifactSha256);
    const old = configurations.find((item) => item.id === 'knowledge-old');
    const current = configurations.find((item) => item.id === 'knowledge-current');
    assert.equal(old.cocosArtifactSha256, current.cocosArtifactSha256);
    assert.notEqual(old.cocosKnowledgeSha256, current.cocosKnowledgeSha256);
});
