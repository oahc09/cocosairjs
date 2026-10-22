#!/usr/bin/env node
/*
 * Read-only, built-in-Node-only verifier/resolver for the immutable v1 inventory.
 * --check verifies bytes, decision closure, every cell and unresolved readiness.
 * --resolve-json prints the mechanically recovered full inventory to stdout.
 * No generation, repair, write, build, browser, network or Git operation is provided.
 * New input bytes require a separately reviewed version; never update v1 in place.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const DIR = 'docs/physics/box3d/contracts';
const FILES = {
    frozen: `${DIR}/inventory-frozen-v1.json`,
    review: `${DIR}/inventory-freeze-review-v1.json`,
    candidate: `${DIR}/inventory-expansion-candidate.json`,
    policy: `${DIR}/inventory-expansion-policy.json`,
};
const PINNED_V1_BYTES = Object.freeze({
    [FILES.frozen]: 'c1031157b37b943d32b6cc26100b563064a16eb4225aeed6fbb7fcbbf25baaeb',
    [FILES.review]: '60db75cc6eafeb78c288edb72d5a7e00df129f5df867378d6013e00c3ab30a43',
    [FILES.candidate]: '1ca96ccfd50b32a1e64c207cf0fc5899a488cbf4ebf48a28b1192eaf8894624d',
    [FILES.policy]: '150d7166523a71eff7a58f76e205fd25676915639611ca76c75f523c6dcf507c',
    [`${DIR}/inventory-expansion-review.md`]: 'fb03c77338b26c59ceeb3a594735c64aca0c532916099c5c89ee54681536df1e',
    'tools/verify/box3d/inventory-expansion.cjs': '055ec408f3098972c762532688ade2f503719ed3fdd44f32c6ef6b54aadafcd4',
    'tools/verify/box3d/inventory-expansion.test.cjs':
        '022ed2e2f17b0ecf4671e4cc291afe7d5144fe30ef4945943a14dd3e55b47d59',
});
const ADOPTED = Object.freeze([
    'D01-ENVIRONMENT-SCOPE',
    'D02-MT-POSITIVE-TARGETS',
    'D03-DEBUG-RELEASE-CRITICAL',
    'D06-AGGREGATION-AND-CELL-KEY',
]);
const UNRESOLVED = Object.freeze(['D04-PERFORMANCE-PROTOCOL', 'D05-FIXTURE-FREEZE', 'D07-AGENT-AND-HUMAN-ASSIGNMENT']);
const D02_ADOPTED_SCOPE =
    'Retain the explicit MT2/MT4 shared-behavior cells and MT3 legal-count cells in the accepted matrix. Real successful pool/world execution is required only for the 1,331 cells with positiveMtExecutionRequired=true. The other 18 MT-related cells are artifact/contract audits or source-required negative diagnostics and cannot establish runtime compatibility. The six positive MT target classes are technically frozen as required obligations; actual support is established only by their corresponding real tests. Missing resources or capability observations cannot automatically replace positive obligations with unsupported/fallback credit. G0 fixture and other readiness conditions remain independently unmet.';
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const copy = (value) => JSON.parse(JSON.stringify(value));
const pointer = (file) => ({ path: file, sha256: PINNED_V1_BYTES[file] });

function readRelative(root, file) {
    assert(!path.isAbsolute(file) && !file.split('/').includes('..'), `Non-portable input path: ${file}`);
    return fs.readFileSync(path.join(root, file));
}

function verifyBytes(root, file, expected) {
    assert.match(expected, /^[a-f0-9]{64}$/, `Missing immutable digest: ${file}`);
    const bytes = readRelative(root, file);
    assert.equal(
        digest(bytes),
        expected,
        `Pinned v1 bytes changed: ${file}; restore the original or create a new reviewed version`,
    );
    return bytes;
}

function validateDocuments({ frozen, review, candidate, policy }) {
    assert.equal(frozen.schemaVersion, 1);
    assert.equal(frozen.inventoryVersion, 'box3d-required-inventory-frozen-v1');
    assert.equal(frozen.status, 'TECHNICALLY_FROZEN_NOT_ACCEPTANCE');
    assert.equal(frozen.inventoryFrozen, true);
    assert.equal(frozen.freezeScope, 'required-cell-enumeration-only');
    assert.equal(frozen.expandedRequiredCellCount, 2128);
    assert.equal(frozen.executableDefinitionCount, 186);
    assert.deepEqual(frozen.sourceCounts, { parentCategories: 91, fixedSubcases: 84, auxiliaryTests: 2 });
    assert.deepEqual(frozen.candidateSnapshot, pointer(FILES.candidate));
    assert.deepEqual(frozen.reviewRecord, pointer(FILES.review));
    assert.deepEqual(frozen.sourceInputDigests, candidate.sourceInputs);
    assert.deepEqual(frozen.protectedCandidateHistory, review.protectedCandidateHistory);
    const historicalPaths = Object.keys(PINNED_V1_BYTES).filter((file) => ![FILES.frozen, FILES.review].includes(file));
    assert.deepEqual(review.protectedCandidateHistory, historicalPaths.map(pointer));

    // Candidate history is preserved verbatim, including its original unapproved status.
    assert.equal(candidate.inventoryFrozen, false);
    assert.equal(candidate.expandedRequiredCellCount, null);
    assert.equal(candidate.candidateRequiredCellCount, 2128);
    assert.equal(candidate.executionDefinitions.length, 186);
    assert.equal(candidate.sourceReferences.length, 177);
    assert.equal(candidate.historicalAcceptanceImported, false);
    assert.equal(candidate.currentNarrowFixtureAcceptanceImported, false);
    assert.deepEqual(
        frozen.sourceReferenceIds,
        candidate.sourceReferences.map((row) => row.id),
    );
    assert.deepEqual(
        frozen.executionDefinitionKeys,
        candidate.executionDefinitions.map((row) => row.caseKey),
    );
    assert.equal(new Set(frozen.sourceReferenceIds).size, 177);
    assert.equal(new Set(frozen.executionDefinitionKeys).size, 186);
    assert.deepEqual(frozen.summary, candidate.summary);

    const expectedStates = candidate.candidateCells.map((row) => ({
        cellId: row.cellId,
        required: true,
        executionStatus: 'NOT_RUN',
        executedAt: null,
        evidence: [],
    }));
    assert.deepEqual(frozen.cellStates, expectedStates, 'Frozen cell identities or initial evidence/status changed');
    assert.equal(new Set(frozen.cellStates.map((row) => row.cellId)).size, 2128);
    for (const row of candidate.candidateCells) {
        assert.equal(row.cellId, [row.caseKey, row.environmentId, row.variantId, row.buildProfileId].join('|'));
        assert.equal(row.executionStatus, 'NOT_RUN');
        assert.deepEqual(row.evidence, []);
        assert.equal(row.required, true);
    }

    assert.equal(review.status, 'INTEGRATOR_TECHNICAL_DECISION_RECORDED');
    assert.equal(review.scope, 'required-cell-denominator-only');
    assert.equal(review.noProductCompatibilityOrAcceptanceClaim, true);
    assert.equal(review.evidence.kind, 'INTEGRATOR_TECHNICAL_REVIEW');
    assert.equal(review.evidence.reviewerRole, 'Integrator');
    assert.equal(review.evidence.id, 'M0-DENOMINATOR-ENGINEERING-REVIEW-V1');
    assert.equal(review.evidence.candidateRevision, '5b8e575');
    assert.deepEqual(review.evidence.basisSections, [
        'v1.2 section 8',
        'v1.2 section 9.1',
        'v1.2 section 10',
        'v1.2 section 11',
        'v1.2 section 14',
        'existing resource contract',
    ]);
    assert.deepEqual(review.acceptedCandidate, pointer(FILES.candidate));
    assert.deepEqual(review.acceptedPolicy, pointer(FILES.policy));
    const plan = candidate.sourceInputs.find((row) => row.id === 'reference');
    assert.deepEqual(review.originalPlan, { path: plan.path, sha256: plan.sha256 });
    assert.deepEqual(candidate.denominatorDecisionIds, ADOPTED);
    assert.deepEqual(policy.denominatorDecisionIds, ADOPTED);
    assert.deepEqual(
        review.adoptedDenominatorDecisions.map((row) => row.id),
        ADOPTED,
    );
    assert.deepEqual(
        frozen.denominatorDecisions.map((row) => row.id),
        ADOPTED,
    );
    for (const row of review.adoptedDenominatorDecisions) {
        assert.equal(row.status, 'ADOPTED_TECHNICAL', `Unresolved denominator decision: ${row.id}`);
        assert.equal(row.evidenceId, review.evidence.id);
        assert.equal(
            row.acceptedScope,
            row.id === 'D02-MT-POSITIVE-TARGETS'
                ? D02_ADOPTED_SCOPE
                : candidate.decisions.find((old) => old.id === row.id).recommendation,
        );
        if (row.id === 'D02-MT-POSITIVE-TARGETS') {
            assert.deepEqual(row.technicalClarification, {
                positiveMtExecutionRequiredCellCount: 1331,
                auditOrRequiredNegativeMtCellCount: 18,
                auditOrNegativeCellsGiveCompatibilityCredit: false,
                targetClassEnumerationTechnicallyFrozen: true,
                actualTargetSupportVerified: false,
                G0ReadinessSatisfied: false,
            });
            assert.deepEqual(row.candidateRecommendationPointer, {
                path: FILES.policy,
                jsonPointer: '/decisions/1/recommendation',
                sha256: PINNED_V1_BYTES[FILES.policy],
            });
        }
        assert.equal(row.effect, 'DENOMINATOR_ONLY_NOT_IMPLEMENTATION_COMPATIBILITY_OR_GATE_PASS');
    }
    for (const row of frozen.denominatorDecisions) {
        assert.deepEqual(row, { id: row.id, status: 'ADOPTED_TECHNICAL', evidenceId: review.evidence.id });
    }
    assert.deepEqual(
        review.unresolvedReadinessDecisions.map((row) => row.id),
        UNRESOLVED,
    );
    assert.deepEqual(frozen.unresolvedReadinessDecisions, review.unresolvedReadinessDecisions);
    for (const row of review.unresolvedReadinessDecisions) {
        const original = candidate.decisions.find((item) => item.id === row.id);
        assert.equal(row.status, original.status, `Readiness prematurely approved: ${row.id}`);
        assert.equal(row.blocks, original.blocks);
        assert.equal(row.approvalEvidence, null);
        assert.equal(row.doesNotUnfreezeDefinedDenominator, true);
    }

    assert.equal(frozen.readiness.G0, 'NOT_RUN');
    assert.equal(frozen.readiness.otherGates, 'NOT_RUN');
    assert.equal(frozen.readiness.fixtureSpecifications, 'ASSERTION_SPEC_ONLY_EXECUTABLE_FIXTURE_NOT_FROZEN');
    assert.equal(frozen.readiness.cellsWithResourceBlockers, 2056);
    assert.equal(frozen.readiness.performanceBaseline, 'NOT_ESTABLISHED');
    assert.equal(frozen.readiness.acceptanceEvidenceImported, false);
    assert.equal(frozen.readiness.requiredMissingDevicesAndHumansPreserved, true);
    assert.equal(frozen.readiness.resourcePlanIsSnapshotNotFreshProbe, true);
    assert.equal(candidate.candidateCells.filter((row) => row.blockedResourceIds.length > 0).length, 2056);
    assert.equal(candidate.candidateCells.filter((row) => row.positiveMtExecutionRequired).length, 1331);
    assert.equal(review.preservedObligations.G0, 'NOT_RUN');
    assert.equal(review.preservedObligations.oldResultsImported, false);
    assert.equal(review.preservedObligations.fakeUnsupportedCreditAllowed, false);
    assert.equal(frozen.mutationPolicy.inPlaceChangesAllowed, false);
    assert.equal(frozen.mutationPolicy.automaticRegenerationAllowed, false);
    assert.equal(frozen.mutationPolicy.changedInputsRequireNewReviewedVersion, true);
    assert.equal(frozen.mutationPolicy.oldVersionAndFailuresMustBeRetained, true);
    return true;
}

function loadFrozenV1(root = ROOT) {
    const pinned = Object.fromEntries(
        Object.entries(PINNED_V1_BYTES).map(([file, hash]) => [file, verifyBytes(root, file, hash)]),
    );
    const documents = Object.fromEntries(Object.entries(FILES).map(([id, file]) => [id, JSON.parse(pinned[file])]));
    // Validate historical source bytes too. Current changed source bytes are not silently rehashed.
    for (const input of documents.candidate.sourceInputs) verifyBytes(root, input.path, input.sha256);
    validateDocuments(documents);
    return documents;
}

function resolveDocuments(documents) {
    validateDocuments(documents);
    const { frozen, review, candidate } = documents;
    const states = new Map(frozen.cellStates.map((row) => [row.cellId, row]));
    const decisions = candidate.decisions.map((row) => {
        if (!ADOPTED.includes(row.id)) return copy(row);
        return {
            ...copy(row),
            status: 'ADOPTED_TECHNICAL',
            recommendation: review.adoptedDenominatorDecisions.find((adopted) => adopted.id === row.id).acceptedScope,
            originalCandidateStatus: row.status,
            originalCandidateBlock: row.blocks,
            blocks: null,
            technicalReviewEvidenceId: review.evidence.id,
            approvalEvidence: null,
            approvalMeaning:
                'Integrator technical decision, not additional user approval or implementation acceptance.',
        };
    });
    return {
        schemaVersion: 1,
        inventoryVersion: frozen.inventoryVersion,
        status: frozen.status,
        inventoryFrozen: true,
        freezeScope: frozen.freezeScope,
        expandedRequiredCellCount: 2128,
        executableDefinitionCount: 186,
        sourceCounts: copy(frozen.sourceCounts),
        gateStatus: 'NOT_RUN',
        readiness: copy(frozen.readiness),
        provenance: {
            frozenFile: pointer(FILES.frozen),
            reviewRecord: copy(frozen.reviewRecord),
            candidateSnapshot: copy(frozen.candidateSnapshot),
            originalSourceInputs: copy(frozen.sourceInputDigests),
            technicalDecisionEvidence: copy(review.evidence),
        },
        decisions,
        denominatorDecisionIds: [...ADOPTED],
        unresolvedReadinessDecisions: copy(frozen.unresolvedReadinessDecisions),
        environmentDefinitions: copy(candidate.environmentDefinitions),
        variantDefinitions: copy(candidate.variantDefinitions),
        resourcePlanSnapshot: copy(candidate.resourcePlanSnapshot),
        evidenceRequirements: copy(candidate.evidenceRequirements),
        mtTargetReview: candidate.mtTargetReview.map((row) => ({
            ...copy(row),
            originalCandidateStatus: row.status,
            status: 'FROZEN_REQUIRED_TARGET_NOT_COMPATIBILITY_CLAIM',
        })),
        technicalCheckpoints: copy(candidate.technicalCheckpoints),
        sourceReferences: copy(candidate.sourceReferences),
        executionDefinitions: copy(candidate.executionDefinitions),
        fixtureSpecifications: copy(candidate.fixtureSpecifications),
        requiredCells: candidate.candidateCells.map((row) => ({
            ...copy(row),
            ...copy(states.get(row.cellId)),
            requirementStatus: 'FROZEN_REQUIRED',
            planningDecisionIds: [...row.pendingDecisionIds],
            pendingDecisionIds: row.pendingDecisionIds.filter((id) => !ADOPTED.includes(id)),
        })),
        summary: copy(frozen.summary),
        mutationPolicy: copy(frozen.mutationPolicy),
    };
}

function resolveFrozenV1(root = ROOT) {
    return resolveDocuments(loadFrozenV1(root));
}

function archiveRequirements(root = ROOT) {
    const { candidate } = loadFrozenV1(root);
    return [...new Set([...Object.keys(PINNED_V1_BYTES), ...candidate.sourceInputs.map((row) => row.path)])].sort();
}

if (require.main === module) {
    const args = process.argv.slice(2);
    assert(
        args.length === 1 && ['--check', '--resolve-json'].includes(args[0]),
        'Read-only v1: use --check or --resolve-json. No --write/repair/regeneration; changed inputs require a new reviewed version.',
    );
    const resolved = resolveFrozenV1();
    if (args[0] === '--resolve-json') process.stdout.write(`${JSON.stringify(resolved, null, 2)}\n`);
    else {
        process.stdout.write(
            'VERIFIED frozen v1: 2128 required cells / 186 definitions / 91 parents + 84 fixed + U01/U02. ' +
                'All NOT_RUN; 2056 resource-blocked cells retained; G0 NOT_RUN; no acceptance credit.\n',
        );
    }
}

module.exports = {
    ROOT,
    FILES,
    PINNED_V1_BYTES,
    ADOPTED,
    UNRESOLVED,
    digest,
    validateDocuments,
    loadFrozenV1,
    resolveDocuments,
    resolveFrozenV1,
    archiveRequirements,
};
