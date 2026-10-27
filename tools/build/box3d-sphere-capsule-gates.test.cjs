/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// SYNTHETIC parser/analytic controls only. Never executes WASM/native/APP.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const hash = (x) =>
    createHash('sha256')
        .update(typeof x === 'string' ? x : JSON.stringify(x))
        .digest('hex');
const root = path.resolve(__dirname, '../..');
const expected = require('./box3d-command-expectations.json');
const imported = Promise.all([
    import('../physics/box3d/sphere-capsule/oracle.mjs'),
    import('../physics/box3d/sphere-capsule/qualification.mjs'),
]);
async function fixture() {
    const [{ CASES, CHECKS, TOLERANCE, sphereCapsuleOracle }, { verifySphereCapsuleQualification }] = await imported;
    const identity = [0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
    const capsule = { kind: 'capsule', center: [0, 0, 0], radius: 0.5, halfSegment: 1, direction: 1 };
    const sphere = { kind: 'sphere', center: [0, 0, 0], radius: 0.25 };
    const spherePose = (p) => [...p, 0, 0, 0, 1, ...p];
    function syntheticSample(fixture) {
        const cap = { ...capsule, direction: fixture.axis },
            p = [0, 0, 0];
        if (fixture.region === 'side') {
            p[fixture.axis] = 0.2;
            p[(fixture.axis + 1) % 3] = 0.7;
        } else p[fixture.axis] = fixture.region === 'cap-minus' ? -1.7 : 1.7;
        const sp = spherePose(p),
            o = sphereCapsuleOracle(cap, identity, sphere, sp);
        const c = {
            contactId: [1, 2, 3],
            shapeA: { low: 1, high: 2 },
            shapeB: { low: 3, high: 4 },
            bodyA: { low: 5, high: 6 },
            bodyB: { low: 7, high: 8 },
            manifolds: [{ points: [{ baseSeparation: o.separation }] }],
        };
        c.geometry = {
            status: 'AVAILABLE',
            source: 'CACHED_MANIFOLD_GENERATION',
            contactId: [...c.contactId],
            shapeA: { ...c.shapeA },
            shapeB: { ...c.shapeB },
            bodyA: { ...c.bodyA },
            bodyB: { ...c.bodyB },
            geometryRevision: { low: 1, high: 0 },
            generatedAfterStep: { low: 0, high: 0 },
            readStepIndex: 1,
            readMutationRevision: 4,
            generationPoseA: [...identity],
            generationPoseB: [...sp],
            manifolds: [
                {
                    normalAtoB: o.normal,
                    normalBtoA: o.normal.map((v) => -v),
                    localNormalAtoB_A: o.localNormalA,
                    localNormalAtoB_B: o.localNormalB,
                    points: [
                        {
                            worldPointA: o.point,
                            worldPointB: o.point,
                            localPointA: o.localPointA,
                            localPointB: o.localPointB,
                        },
                    ],
                },
            ],
        };
        return {
            ...fixture,
            contact: c,
            independentPoseA: [...identity],
            independentPoseB: sp,
            shapeA: cap,
            shapeB: sphere,
        };
    }

    const rows = CASES.map(syntheticSample);
    const samplesText = rows.map((x) => JSON.stringify(x)).join('\n') + '\n';
    const producer = { coreSha: 'a'.repeat(40), schemaSha256: 'b'.repeat(64), variant: 'st-simd' };
    const report = {
        validatedSamples: 18,
        lastCase: CASES.at(-1),
        lastSnapshot: {},
        profile: 'air-box3d-sphere-capsule-native-generation-v1',
        status: 'PASS',
        startedAt: '2026-10-27T00:00:00Z',
        completedAt: '2026-10-27T00:01:00Z',
        fixtureSha256: 'c'.repeat(64),
        oracleSha256: 'd'.repeat(64),
        tolerance: TOLERANCE,
        scope: '18 nondegenerate finite sphere/capsule generation cases; native WASM, not Cocos events or full T15/C21',
        checks: CHECKS.map((name) => ({ name, result: 'PASS' })),
        observations: {},
        cleanupErrors: [],
        identity: producer,
        samplesArtifact: {
            path: 'sphere-capsule-samples.raw.jsonl',
            records: 18,
            bytes: Buffer.byteLength(samplesText),
            sha256: hash(samplesText),
        },
    };
    return {
        verify: verifySphereCapsuleQualification,
        args: {
            report,
            samplesText,
            identity: producer,
            fixtureSha256: report.fixtureSha256,
            oracleSha256: report.oracleSha256,
        },
    };
}
test('SYNTHETIC only: exact 18-case analytic consumer accepts well-formed CPU samples', async () => {
    const { verify, args } = await fixture();
    assert.equal(verify(args).samples, 18);
});
const changes = {
    validatedSamples: (a) => (a.report.validatedSamples = 17),
    missingCheck: (a) => a.report.checks.pop(),
    unknownCheck: (a) => a.report.checks.push({ name: 'unknown', result: 'PASS' }),
    reorderedChecks: (a) => a.report.checks.reverse(),
    failedCheck: (a) => (a.report.checks[0].result = 'FAIL'),
    identity: (a) => (a.report.identity = { ...a.report.identity, coreSha: 'wrong' }),
    fixture: (a) => (a.report.fixtureSha256 = 'f'.repeat(64)),
    oracle: (a) => (a.report.oracleSha256 = 'f'.repeat(64)),
    samplesHash: (a) => (a.report.samplesArtifact.sha256 = 'f'.repeat(64)),
    unknownReport: (a) => (a.report.unknown = true),
    cleanup: (a) => a.report.cleanupErrors.push('error'),
    tolerance: (a) => (a.report.tolerance = { point: 99 }),
};
for (const [name, change] of Object.entries(changes))
    test('SYNTHETIC rejection: ' + name, async () => {
        const { verify, args } = await fixture();
        change(args);
        assert.throws(() => verify(args));
    });
for (const kind of ['normal', 'point', 'pose', 'identity', 'duplicate', 'order', 'expected', 'extra'])
    test('SYNTHETIC recomputation rejects rehashed ' + kind, async () => {
        const { verify, args } = await fixture();
        const rows = args.samplesText.trimEnd().split('\n').map(JSON.parse);
        if (kind === 'normal') rows[0].contact.geometry.manifolds[0].normalAtoB[0] += 0.3;
        if (kind === 'point') rows[0].contact.geometry.manifolds[0].points[0].worldPointA[0] += 0.3;
        if (kind === 'pose') rows[0].independentPoseA[0] += 0.3;
        if (kind === 'identity') rows[0].contact.geometry.shapeA.low++;
        if (kind === 'duplicate') rows[1] = rows[0];
        if (kind === 'order') rows.reverse();
        if (kind === 'expected') rows[0].expected = {};
        if (kind === 'extra') rows.push(rows[0]);
        args.samplesText = rows.map((x) => JSON.stringify(x)).join('\n') + '\n';
        args.report.samplesArtifact = {
            path: 'sphere-capsule-samples.raw.jsonl',
            records: rows.length,
            bytes: Buffer.byteLength(args.samplesText),
            sha256: hash(args.samplesText),
        };
        assert.throws(() => verify(args));
    });
test('exact additive gate locks preserve prior111/85/58 prefix and current47 command count', () => {
    assert.equal(expected.gate.commands, 47);
    assert.equal(expected.gate.inputs.length, 136);
    assert.equal(expected.gate.compileUnits.length, 87);
    assert.equal(expected.gate.evidence.length, 63);
    for (const [k, n] of [
        ['inputs', 111],
        ['compileUnits', 85],
        ['evidence', 58],
    ])
        assert.equal(hash(expected.gate[k].slice(0, n)), BASE_HASH[k]);
    assert.deepEqual(expected.gate.inputs.slice(111, 120), expected.sphereCapsuleExtension.inputs);
    assert.deepEqual(expected.gate.evidence.slice(58, 60), expected.sphereCapsuleExtension.evidence);
    for (const name of ['tools/physics/box3d/audit-artifacts.mjs', 'tools/build/box3d-assets.cjs'])
        assert.match(fs.readFileSync(path.join(root, name), 'utf8'), /verifySphereCapsuleQualification/);
});

const BASE_HASH = {
    inputs: '856b62ffc638acf80b155f35f08181cac32427531841a52ebb2b2f7b3d44e297',
    compileUnits: '8ba0887b8de875a73833b36c0f70b3cdfd82d7144b9a67170952ab086fa47de6',
    evidence: '6dedb633a3987bbbd501c8df4db3516f2bb6787d4784cff87a07570a7366a6d6',
};

// Execute the actual production evidence guards, not only the parallel JSON inventory.
// No artifact reads, WASM imports, or qualification result are simulated by this slice.
function productionEvidenceGuard(source) {
    const start = '    assert.deepEqual(\n        sorted(audit.evidence.map((row) => row.path)),\n        sorted([';
    const end = '    for (const record of audit.evidence) verifyRecord(directory, record);';
    assert.equal(source.split(start).length, 2, 'Exactly one inline production evidence inventory');
    assert.equal(source.split(end).length, 2, 'Exactly one following evidence-file verification loop');
    const from = source.indexOf(start),
        to = source.indexOf(end, from);
    assert(to > from);
    assert(source.lastIndexOf('async function verifySTBuild(', from) >= 0);
    const statements = source.slice(from, to);
    assert.match(statements, /sorted\(COMMAND_EXPECTATIONS\.gate\.evidence\)/);
    return vm.runInNewContext(
        `(audit) => { ${statements} }`,
        { assert, COMMAND_EXPECTATIONS: expected, sorted: (items) => Array.from(items).sort() },
        { timeout: 1000 },
    );
}
const assetsSource = fs.readFileSync(path.join(root, 'tools/build/box3d-assets.cjs'), 'utf8');
const evidenceRows = (names) => ({ evidence: names.map((name) => ({ path: name })) });
test('actual verifySTBuild evidence guards accept exactly all 63 current paths, in any audit order', () => {
    const verify = productionEvidenceGuard(assetsSource);
    verify(evidenceRows(expected.gate.evidence));
    verify(evidenceRows([...expected.gate.evidence].reverse()));
});
for (const name of ['sphere-capsule-samples.raw.jsonl', 'wasm-sphere-capsule-contract.raw.json'])
    test('actual verifySTBuild evidence guards reject missing ' + name, () => {
        const verify = productionEvidenceGuard(assetsSource);
        assert.throws(() => verify(evidenceRows(expected.gate.evidence.filter((item) => item !== name))));
    });
test('actual verifySTBuild evidence guards reject unknown and duplicated paths', () => {
    const verify = productionEvidenceGuard(assetsSource);
    assert.throws(() => verify(evidenceRows([...expected.gate.evidence, 'unqualified.raw.json'])));
    assert.throws(() => verify(evidenceRows([...expected.gate.evidence, expected.gate.evidence[0]])));
});
test('regression: the old inline 58-path consumer rejects the real current 63-path inventory', () => {
    let old = assetsSource;
    for (const name of ['sphere-capsule-samples.raw.jsonl', 'wasm-sphere-capsule-contract.raw.json']) {
        const line = `            '${name}',\n`;
        assert.equal(old.split(line).length, 2);
        old = old.replace(line, '');
    }
    assert.throws(() => productionEvidenceGuard(old)(evidenceRows(expected.gate.evidence)));
    // The second exact guard still rejects the old 58 even if the first is reverted.
    assert.throws(() => productionEvidenceGuard(old)(evidenceRows(expected.gate.evidence.slice(0, 58))));
});
