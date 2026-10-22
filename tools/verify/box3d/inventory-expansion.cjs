#!/usr/bin/env node
/*
 * Deterministically expand the reviewed-input proposal. This is not an acceptance runner.
 * --check reads only. --write writes only inventory-expansion-candidate.json.
 * No browser, build, Git, network, clock, environment detection, or evidence import occurs.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const DIR = 'docs/physics/box3d/contracts';
const OUTPUT = `${DIR}/inventory-expansion-candidate.json`;
const INPUTS = {
    policy: `${DIR}/inventory-expansion-policy.json`,
    design: `${DIR}/inventory-design.json`,
    resources: `${DIR}/acceptance-resources.json`,
    api: `${DIR}/api-contract.json`,
    budgets: `${DIR}/performance-budget-initial.json`,
    decisions: `${DIR}/decisions.md`,
    reference: 'ai/plans/box3d-v1.2-reference.md',
    generator: 'tools/verify/box3d/inventory-expansion.cjs',
};
const SHA = (text) => crypto.createHash('sha256').update(text).digest('hex');
const ordered = (values) => [...new Set(values)].sort();
const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const keyOf = (row) => [row.caseKey, row.environmentId, row.variantId, row.buildProfileId].join('|');
const PHASE = /^M([0-8])$/;
const realEnvironmentIds = [
    'HOST-NODE',
    'HOST-CHROME',
    'DESKTOP-FIREFOX',
    'DESKTOP-SAFARI',
    'ANDROID-WEBVIEW',
    'IOS-SAFARI',
];

function readInputs(root = ROOT) {
    const bytes = Object.fromEntries(
        Object.entries(INPUTS).map(([id, file]) => [id, fs.readFileSync(path.join(root, file), 'utf8')]),
    );
    const parsed = Object.fromEntries(
        Object.entries(bytes).map(([id, text]) => [id, INPUTS[id].endsWith('.json') ? JSON.parse(text) : text]),
    );
    return { ...parsed, bytes };
}

function allSourceReferences(design) {
    return [
        ...design.parentCategories.map((row) => ({ ...row, referenceKind: 'parent-category' })),
        ...design.requiredSubcaseDesign.map((row) => ({ ...row, referenceKind: 'fixed-subcase' })),
        ...design.auxiliaryRequiredTests.map((row) => ({ ...row, referenceKind: 'auxiliary-test' })),
    ];
}

function validatePolicy(inputs) {
    const { policy, design, resources, budgets } = inputs;
    const references = allSourceReferences(design);
    assert.equal(policy.status, 'DETERMINISTIC_PROPOSAL_NOT_APPROVED_FREEZE');
    assert.equal(design.parentCategories.length, 91, 'Original parent category count changed');
    assert.equal(design.requiredSubcaseDesign.length, 84, 'Fixed subcase count changed');
    assert.deepEqual(design.auxiliaryRequiredTests.map((row) => row.id).sort(), ['B3-U01', 'B3-U02']);
    assert.equal(new Set(references.map((row) => row.id)).size, 177, 'Duplicate source IDs');
    assert(
        references.every((row) => row.required === true),
        'A source requirement was dropped',
    );
    assert.deepEqual(ordered(resources.requiredEnvironmentIds), ordered(realEnvironmentIds));
    assert.deepEqual(
        policy.environmentDefinitions.filter((row) => row.kind !== 'human-cohort').map((row) => row.id),
        realEnvironmentIds,
    );
    const ids = new Set(references.map((row) => row.id));
    const decisions = new Set(policy.decisions.map((row) => row.id));
    const environmentIds = new Set(policy.environmentDefinitions.map((row) => row.id));
    const variantIds = new Set(policy.variantDefinitions.map((row) => row.id));
    const profileIds = new Set(budgets.profiles.map((row) => row.id));
    const resourceIds = new Set([...resources.resources, ...policy.additionalResources].map((row) => row.id));
    const keys = new Set();
    for (const row of policy.definitions) {
        assert(!keys.has(row.caseKey), `Duplicate case key: ${row.caseKey}`);
        keys.add(row.caseKey);
        assert(ids.has(row.testId), `Unknown source test: ${row.testId}`);
        assert(PHASE.test(row.firstPhase), `Invalid phase: ${row.caseKey}`);
        assert(row.environmentIds.length && row.variantIds.length && row.buildProfileIds.length, row.caseKey);
        assert(row.fixtureSpecId === row.caseKey, `Unbound fixture spec: ${row.caseKey}`);
        for (const id of row.environmentIds) assert(environmentIds.has(id), `Unknown environment: ${id}`);
        for (const id of row.variantIds) assert(variantIds.has(id), `Unknown variant: ${id}`);
        for (const id of row.decisionIds) assert(decisions.has(id), `Unknown decision: ${id}`);
        for (const id of row.participantResourceIds) assert(resourceIds.has(id), `Unknown participant resource: ${id}`);
        for (const id of row.evidenceRequirementIds) assert(policy.evidenceRequirements[id], `Unknown evidence: ${id}`);
        assert(row.evidenceRequirementIds.includes('COMMON'), `Missing identity evidence: ${row.caseKey}`);
        assert(row.decisionIds.includes('D06-AGGREGATION-AND-CELL-KEY'));
        if (row.performanceProfileId) assert(profileIds.has(row.performanceProfileId));
        if (row.variantIds.some((id) => id.startsWith('mt'))) {
            assert(row.decisionIds.includes('D02-MT-POSITIVE-TARGETS'), `Unreviewed MT scope: ${row.caseKey}`);
        }
        if (row.buildProfileIds.includes('debug')) {
            assert(policy.criticalDebugReleaseTestIds.includes(row.testId), row.testId);
            assert(row.decisionIds.includes('D03-DEBUG-RELEASE-CRITICAL'));
        }
        if (row.testId.startsWith('B3-BIZ') || row.testId === 'B3-P07' || row.testId === 'B3-AG05') {
            assert.deepEqual(row.variantIds, ['st'], `EX09 must remain ST: ${row.caseKey}`);
        }
        if (row.fixtureKind === 'real-browser-performance') {
            assert(!row.environmentIds.includes('HOST-NODE'), 'Node cannot replace browser performance');
        }
    }
    for (const row of references) {
        const executable = policy.definitions.some((item) => item.testId === row.id);
        const aggregate =
            (row.referenceKind === 'parent-category' &&
                design.requiredSubcaseDesign.some((x) => x.parent === row.id)) ||
            policy.aggregateFixedSubcases[row.id] ||
            policy.crossCategoryAggregateDependencies[row.id];
        assert(executable || aggregate, `Source reference has no execution or aggregate: ${row.id}`);
    }
    for (const id of policy.parentRemainderTestIds) {
        assert(keys.has(`${id}::parent-table-remainder`), `Lost original parent-table assertions: ${id}`);
    }
    for (const id of policy.criticalDebugReleaseTestIds) {
        const defs = policy.definitions.filter((row) => row.testId === id);
        assert(defs.length, `Missing critical definition: ${id}`);
        assert(defs.every((row) => row.buildProfileIds.includes('debug') && row.buildProfileIds.includes('release')));
    }
    for (const [id, expected] of [
        ['WASM-13-BINDING', ['HOST-NODE', 'HOST-CHROME']],
        ['WASM-13-AIR-ST-HOST', ['HOST-NODE', 'HOST-CHROME']],
        ['WASM-13-AIR-ST-DEVICE', realEnvironmentIds.slice(2)],
    ]) {
        assert.deepEqual(policy.definitions.find((row) => row.testId === id).environmentIds, expected, id);
    }
    for (const [id, modes] of [
        ['WASM-13-AIR-MT', ['mt2', 'mt3', 'mt4']],
        ['WASM-14-MT', ['mt2', 'mt3', 'mt4']],
        ['B3-A06', ['st', 'mt2', 'mt4']],
    ]) {
        const definition = policy.definitions.find((row) => row.testId === id);
        assert.deepEqual(definition.variantIds, modes, `Lost declared thread-count coverage: ${id}`);
        if (id === 'WASM-13-AIR-MT')
            assert.deepEqual(definition.environmentIds, realEnvironmentIds, 'Positive MT platform target removed');
    }
    assert.equal(policy.definitions.filter((row) => row.coverageRole === 'independent-human-cohort').length, 1);
    assert.deepEqual(
        policy.definitions.find((row) => row.coverageRole === 'independent-human-cohort').participantResourceIds,
        ['BIZ07-FIRST-TIME-USERS'],
    );
    for (const decision of policy.decisions) assert.equal(decision.approvalEvidence, null, 'Do not fabricate approval');
}

function sourceLines(reference, id) {
    const exact = new RegExp(`(^|[^A-Z0-9-])${id}(?![A-Z0-9-])`);
    return reference
        .split('\n')
        .map((text, index) => ({ line: index + 1, text }))
        .filter((row) => exact.test(row.text));
}

function fixtureSpecification(definition, inputs) {
    const { policy, reference, api, budgets } = inputs;
    const ids = ordered([definition.testId, definition.parentCategoryId].filter(Boolean));
    const source = ids.flatMap((id) =>
        sourceLines(reference, id).map((row) => ({ path: INPUTS.reference, line: row.line, text: row.text })),
    );
    // Rebuild-only C14/C16 IDs are not falsely attributed to the old v1.2 prose.
    const sources = [...new Map(source.map((row) => [row.line, row])).values()].sort((a, b) => a.line - b.line);
    const requirements = ids.flatMap((id) => policy.fixtureSpecificRequirements[id] ?? []);
    const spec = {
        fixtureSpecId: definition.fixtureSpecId,
        testId: definition.testId,
        coverageRole: definition.coverageRole,
        status: 'ASSERTION_SPEC_ONLY_EXECUTABLE_FIXTURE_NOT_FROZEN',
        sourceAssertionLines: sources,
        normativeContext: [
            { path: INPUTS.reference, sections: ['5.3', '6', '9.1', '10.1', '15.1', '15.2'] },
            { path: INPUTS.design, testId: definition.testId },
        ],
        testIdOrigin: sourceLines(reference, definition.testId).length
            ? 'EXPLICIT_ORIGINAL_V1_2_REFERENCE'
            : /^B3-C(?:14-RECOVERY-|16-(?:SAMPLED-|SUSTAINED-))/.test(definition.testId)
              ? 'REBUILD_INVENTORY_ADDITION_NOT_AN_ORIGINAL_PLAN_QUOTE'
              : 'FIXED_DESIGN_ID_EXPANDED_FROM_PLAN_PARENT_OR_SUFFIX_NOT_A_VERBATIM_FULL_ID',
        specificRequirements: requirements,
        requiredBeforeExecution: [
            'Bind full input geometry/settings/seed/creation-order assets and executable fixture/independent oracle hashes.',
            'Review every source assertion in this fixture scope; record parameter coverage without deleting difficult cases.',
            'Record real target fingerprint and exact source/build/manifest identity; this specification is not evidence.',
        ],
        fixtureHash: null,
        executableFixturePath: null,
        independentOracleHash: null,
        acceptedEvidence: [],
    };
    if (definition.performanceProfileId) {
        spec.performanceProfile = budgets.profiles.find((row) => row.id === definition.performanceProfileId);
        spec.normativeContext.push({ path: INPUTS.budgets, profileId: definition.performanceProfileId });
    }
    if (definition.testId.startsWith('B3-C16-')) {
        spec.c16DurationContract = api.c16Duration;
        spec.normativeContext.push({ path: INPUTS.api, jsonPointer: '/c16Duration' });
        spec.normativeContext.push({
            path: INPUTS.decisions,
            section: 'C16 measurement clarification, not historical recovery',
        });
    }
    if (definition.testId.startsWith('B3-BIZ') || definition.testId === 'B3-P07' || definition.testId === 'B3-AG05') {
        spec.normativeContext.push({
            path: INPUTS.reference,
            sections: ['12.2', '12.3', '12.4', '12.5', '12.6', '12.7', '12.8', '12.9'],
        });
        spec.fixtureAssetReferences = [
            'config.json',
            'layouts.json',
            'abnormal-fixtures.json',
            'input-protocol.json',
            'scenarios.json',
            'FIXTURE-SPEC.md',
        ].map((name) => `${DIR}/gift-workshop/${name}`);
        spec.assetReferenceMeaning =
            'Design asset references only; no static-validation receipt or runtime PASS is imported.';
    }
    if (definition.exampleIds) spec.exampleIds = definition.exampleIds;
    return spec;
}

function generateInventory(inputs = readInputs()) {
    validatePolicy(inputs);
    const { policy, design, resources, bytes } = inputs;
    const variants = new Map(policy.variantDefinitions.map((row) => [row.id, row]));
    const environments = new Map(policy.environmentDefinitions.map((row) => [row.id, row]));
    const resourceSnapshot = [...resources.resources, ...policy.additionalResources];
    const resourceMap = new Map(resourceSnapshot.map((row) => [row.id, row]));
    const definitions = [...policy.definitions].sort((a, b) => compareText(a.caseKey, b.caseKey));
    const cells = [];
    for (const definition of definitions) {
        for (const environmentId of definition.environmentIds) {
            for (const variantId of definition.variantIds) {
                for (const buildProfileId of definition.buildProfileIds) {
                    const variant = variants.get(variantId);
                    const resourceIds = ordered([
                        ...environments.get(environmentId).resourceIds,
                        ...definition.participantResourceIds,
                    ]);
                    const firstPhaseNumber = Math.max(
                        Number(definition.firstPhase.match(PHASE)[1]),
                        variant.threading === 'multi' ? 6 : 0,
                        realEnvironmentIds.slice(2).includes(environmentId) ? 5 : 0,
                    );
                    const auditOnly = ['artifact-audit', 'performance-contract-audit'].includes(definition.fixtureKind);
                    const negativeMtDiagnostic = definition.testId === 'B3-AG03' && variant.threading === 'multi';
                    const positiveMtExecution = variant.threading === 'multi' && !auditOnly && !negativeMtDiagnostic;
                    const cell = {
                        caseKey: definition.caseKey,
                        testId: definition.testId,
                        parentCategoryId: definition.parentCategoryId,
                        environmentId,
                        variantId,
                        artifactVariant: variant.artifactVariant,
                        fixtureKind: definition.fixtureKind,
                        positiveMtExecutionRequired: positiveMtExecution,
                        workerCount: variant.workerCount,
                        buildProfileId,
                        fixtureIntroducedPhase: definition.firstPhase,
                        firstPhase: `M${firstPhaseNumber}`,
                        firstGate: `G${firstPhaseNumber}`,
                        finalGate: 'G8',
                        required: true,
                        requirementStatus: 'CANDIDATE_REQUIRED_PENDING_REVIEW',
                        executionStatus: 'NOT_RUN',
                        executedAt: null,
                        evidence: [],
                        fixtureSpecId: definition.fixtureSpecId,
                        evidenceRequirementIds: definition.evidenceRequirementIds,
                        resourceIds,
                        blockedResourceIds: resourceIds.filter((id) => resourceMap.get(id).status !== 'AVAILABLE'),
                        pendingDecisionIds: definition.decisionIds,
                        variantExecutionRequirement: auditOnly
                            ? 'ARTIFACT_OR_CONTRACT_AUDIT_ONLY; no runtime compatibility or positive-target credit.'
                            : negativeMtDiagnostic
                              ? 'SOURCE_REQUIRED_NEGATIVE_MT_DIAGNOSTIC; diagnose missing COOP/COEP, no positive-target credit.'
                              : positiveMtExecution
                                ? 'POSITIVE_REAL_MT_EXECUTION_REQUIRED; multi rejection/auto fallback is additional, not a replacement.'
                                : 'REAL_ST_FIXTURE_AS_SPECIFIED; no old core/WASM or backend substitution.',
                    };
                    cell.cellId = keyOf(cell);
                    cells.push(cell);
                }
            }
        }
    }
    cells.sort((a, b) => compareText(a.cellId, b.cellId));
    const sourceReferences = allSourceReferences(design).map((row) => {
        let keys;
        if (row.referenceKind === 'parent-category') {
            const categories = policy.crossCategoryAggregateDependencies[row.id] ?? [row.id];
            keys = definitions.filter((def) => categories.includes(def.parentCategoryId)).map((def) => def.caseKey);
        } else {
            const tests = policy.aggregateFixedSubcases[row.id] ?? [row.id];
            keys = definitions.filter((def) => tests.includes(def.testId)).map((def) => def.caseKey);
        }
        assert(keys.length, `Uncovered reference: ${row.id}`);
        return {
            id: row.id,
            parent: row.parent ?? null,
            referenceKind: row.referenceKind,
            required: true,
            status: 'NOT_RUN',
            aggregateOnly: row.referenceKind === 'parent-category' || Boolean(policy.aggregateFixedSubcases[row.id]),
            caseKeys: ordered(keys),
            requiredCellIds: cells.filter((cell) => keys.includes(cell.caseKey)).map((cell) => cell.cellId),
            countedAsAdditionalExecutableCell: false,
            evidence: [],
        };
    });
    const countBy = (field) =>
        Object.fromEntries(
            ordered(cells.map((row) => row[field])).map((key) => [
                key,
                cells.filter((row) => row[field] === key).length,
            ]),
        );
    return {
        schemaVersion: 1,
        contractVersion: policy.contractVersion,
        status: 'DETERMINISTIC_PROPOSAL_NOT_APPROVED_FREEZE',
        inventoryFrozen: false,
        expandedRequiredCellCount: null,
        candidateRequiredCellCount: cells.length,
        historicalAcceptanceImported: false,
        currentNarrowFixtureAcceptanceImported: false,
        gateStatus: 'NOT_RUN',
        sourceCounts: { parentCategories: 91, fixedSubcases: 84, auxiliaryTests: 2 },
        sourceInputs: Object.entries(INPUTS).map(([id, file]) => ({ id, path: file, sha256: SHA(bytes[id]) })),
        deterministicGeneration: {
            command: 'node tools/verify/box3d/inventory-expansion.cjs --write',
            checkCommand: 'node tools/verify/box3d/inventory-expansion.cjs --check',
            countMeaning: 'Executable candidate cells only; parent/fixed aggregate references are not counted twice.',
            cellKey: ['caseKey', 'environmentId', 'variantId', 'buildProfileId'],
            noClockOrAbsolutePathsOrExternalEvidence: true,
        },
        freezePrerequisites: [
            'Resolve denominator dimensions D01/D02/D03/D06 with explicit reviewed contract versions; this generator cannot approve them.',
            'A defined denominator may be technically frozen while device/fixture/participant/baseline readiness remains BLOCKED or NOT_RUN; do not remove those cells.',
            'Review exact resource plans; unavailable required resources remain required. G0 does not require devices or participants to be available today.',
            'A later reviewed freeze must set the actual denominator and retain this candidate and prior failures; do not relabel this snapshot.',
        ],
        denominatorDecisionIds: policy.denominatorDecisionIds,
        readinessDecisions: policy.readinessDecisions,
        decisions: policy.decisions,
        mtTargetReview: policy.mtTargetRecommendations.map((row) => ({
            ...row,
            status: 'POSITIVE_TARGET_PROPOSAL_NOT_COMPATIBILITY_CLAIM',
            candidateCellCount: cells.filter(
                (cell) => cell.environmentId === row.environmentId && cell.variantId.startsWith('mt'),
            ).length,
            positiveRuntimeCellCount: cells.filter(
                (cell) => cell.environmentId === row.environmentId && cell.positiveMtExecutionRequired,
            ).length,
            nonRuntimeOrNegativeMtCellCount: cells.filter(
                (cell) =>
                    cell.environmentId === row.environmentId &&
                    cell.variantId.startsWith('mt') &&
                    !cell.positiveMtExecutionRequired,
            ).length,
            affectedCaseKeys: ordered(
                cells
                    .filter((cell) => cell.environmentId === row.environmentId && cell.variantId.startsWith('mt'))
                    .map((cell) => cell.caseKey),
            ),
        })),
        environmentDefinitions: policy.environmentDefinitions,
        variantDefinitions: policy.variantDefinitions,
        resourcePlanSnapshot: {
            source: INPUTS.resources,
            caveat: 'Read-only source-plan snapshot, not a fresh availability probe. Preserve exact missing assignments/recovery conditions.',
            resources: resourceSnapshot,
        },
        evidenceRequirements: policy.evidenceRequirements,
        technicalCheckpoints: ['BIZ-AUTO', 'ST-HOST'].map((id) => {
            const bizTests = ['B3-BIZ01', 'B3-BIZ02', 'B3-BIZ03', 'B3-BIZ04', 'B3-BIZ05', 'B3-BIZ06', 'B3-BIZ08'];
            const tests =
                id === 'BIZ-AUTO'
                    ? bizTests
                    : [
                          ...bizTests,
                          'WASM-06-AIR-ST',
                          'WASM-13-AIR-ST-HOST',
                          'WASM-14-ST',
                          'B3-I04',
                          'B3-I04-COEXIST-COMPONENT',
                          'B3-I06-COEXIST-FULL',
                          'B3-I07',
                          'B3-I08',
                      ];
            return {
                id,
                status: 'NOT_RUN',
                isGate: false,
                scopeDecision: 'D01-ENVIRONMENT-SCOPE',
                cannotComplete: ['T21', 'T34', 'G5', 'G6', 'G8'],
                requiredCellIds: cells
                    .filter(
                        (cell) =>
                            tests.includes(cell.testId) &&
                            ['HOST-NODE', 'HOST-CHROME'].includes(cell.environmentId) &&
                            cell.variantId === 'st' &&
                            cell.buildProfileId === 'release' &&
                            cell.caseKey !== 'B3-I08::advanced-examples',
                    )
                    .map((cell) => cell.cellId),
                excludesButDoesNotRemove: ['WASM-13-AIR-ST-DEVICE', 'B3-BIZ07', 'MT', 'EX07', 'EX08'],
            };
        }),
        sourceReferences,
        executionDefinitions: definitions,
        fixtureSpecifications: definitions.map((row) => fixtureSpecification(row, inputs)),
        candidateCells: cells,
        summary: {
            executableDefinitionCount: definitions.length,
            statuses: { PASS: 0, FAIL: 0, NOT_RUN: cells.length, BLOCKED: 0, INFRA_FAILURE: 0 },
            cellsWithResourceBlockers: cells.filter((row) => row.blockedResourceIds.length > 0).length,
            resourceAvailabilityIsSeparateFromUnexecutedStatus: true,
            byEnvironment: countBy('environmentId'),
            byVariant: countBy('variantId'),
            byBuildProfile: countBy('buildProfileId'),
            byFirstGate: countBy('firstGate'),
        },
    };
}

function validateInventory(actual, inputs = readInputs()) {
    const expected = generateInventory(inputs);
    assert.deepEqual(
        actual,
        expected,
        'Inventory differs from complete deterministic expansion; regenerate/review, never patch results',
    );
    assert.equal(new Set(actual.candidateCells.map((row) => row.cellId)).size, actual.candidateRequiredCellCount);
    assert.equal(actual.inventoryFrozen, false);
    assert.equal(actual.expandedRequiredCellCount, null);
    assert(actual.candidateCells.every((row) => row.executionStatus === 'NOT_RUN' && row.evidence.length === 0));
    return true;
}

function categoryReadiness(inventory, id) {
    const reference = inventory.sourceReferences.find((row) => row.id === id);
    assert(reference, `Unknown reference: ${id}`);
    // This planning artifact intentionally has no receipt-ingestion or promote-to-PASS API.
    return {
        id,
        status: 'NOT_RUN',
        acceptanceReady: false,
        reason: 'Inventory is a proposal; no executed fixture evidence is imported or accepted.',
        requiredCandidateCells: reference.requiredCellIds.length,
    };
}

function serialize(inventory) {
    return `${JSON.stringify(inventory, null, 2)}\n`;
}

if (require.main === module) {
    const args = process.argv.slice(2);
    assert(args.length === 1 && ['--check', '--write'].includes(args[0]), 'Use exactly --check or --write');
    const inventory = generateInventory();
    const target = path.join(ROOT, OUTPUT);
    const expected = serialize(inventory);
    if (args[0] === '--write') fs.writeFileSync(target, expected);
    else assert.equal(fs.readFileSync(target, 'utf8'), expected, 'Generated inventory snapshot is stale or edited');
    process.stdout.write(
        `${args[0] === '--write' ? 'WROTE' : 'MATCH'} ${OUTPUT}: ${inventory.candidateRequiredCellCount} candidate cells; ` +
            'final denominator NOT FROZEN; acceptance NOT_RUN.\n',
    );
}

module.exports = {
    ROOT,
    OUTPUT,
    INPUTS,
    readInputs,
    validatePolicy,
    generateInventory,
    validateInventory,
    categoryReadiness,
    serialize,
};
