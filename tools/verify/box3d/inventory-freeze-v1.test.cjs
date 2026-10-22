const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const {
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
} = require('./inventory-freeze-v1.cjs');

const documents = loadFrozenV1();
const resolved = resolveFrozenV1();
const verifier = 'tools/verify/box3d/inventory-freeze-v1.cjs';
const clone = (value) => structuredClone(value);
const rejectMutation = (mutate) => {
    const bad = clone(documents);
    mutate(bad);
    assert.throws(() => validateDocuments(bad));
};
const withArchive = (run) => {
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'box3d-frozen-inventory-v1-'));
    try {
        for (const file of [...archiveRequirements(), verifier]) {
            const target = path.join(elsewhere, file);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.copyFileSync(path.join(ROOT, file), target);
        }
        return run(elsewhere);
    } finally {
        fs.rmSync(elsewhere, { recursive: true, force: true });
    }
};

// Tool/contract integrity only. These tests execute no physics acceptance fixture.
test('formal v1 preserves the exact full denominator, definitions and original references', () => {
    assert.equal(resolved.inventoryFrozen, true);
    assert.equal(resolved.expandedRequiredCellCount, 2128);
    assert.equal(resolved.requiredCells.length, 2128);
    assert.equal(new Set(resolved.requiredCells.map((row) => row.cellId)).size, 2128);
    assert.equal(resolved.executionDefinitions.length, 186);
    assert.deepEqual(resolved.executionDefinitions, documents.candidate.executionDefinitions);
    assert.deepEqual(resolved.sourceReferences, documents.candidate.sourceReferences);
    assert.deepEqual(
        resolved.requiredCells.map((row) => row.cellId),
        documents.candidate.candidateCells.map((row) => row.cellId),
    );
    assert.deepEqual(resolved.sourceCounts, { parentCategories: 91, fixedSubcases: 84, auxiliaryTests: 2 });
    assert.deepEqual(
        resolved.sourceReferences.filter((row) => row.referenceKind === 'auxiliary-test').map((row) => row.id),
        ['B3-U01', 'B3-U02'],
    );
});

test('all required cells are unexecuted and no frozen state contains imported acceptance credit', () => {
    for (const cell of resolved.requiredCells) {
        assert.equal(cell.required, true);
        assert.equal(cell.requirementStatus, 'FROZEN_REQUIRED');
        assert.equal(cell.executionStatus, 'NOT_RUN');
        assert.equal(cell.executedAt, null);
        assert.deepEqual(cell.evidence, []);
    }
    for (const ref of resolved.sourceReferences) {
        assert.equal(ref.status, 'NOT_RUN');
        assert.deepEqual(ref.evidence, []);
    }
    assert.deepEqual(resolved.summary.statuses, { PASS: 0, FAIL: 0, NOT_RUN: 2128, BLOCKED: 0, INFRA_FAILURE: 0 });
    assert.equal(resolved.readiness.acceptanceEvidenceImported, false);
});

test('only four denominator decisions are technically adopted, with the exact review evidence', () => {
    const adopted = resolved.decisions.filter((row) => row.status === 'ADOPTED_TECHNICAL');
    assert.deepEqual(
        adopted.map((row) => row.id),
        ADOPTED,
    );
    assert.equal(documents.review.noProductCompatibilityOrAcceptanceClaim, true);
    assert.equal(resolved.provenance.technicalDecisionEvidence.kind, 'INTEGRATOR_TECHNICAL_REVIEW');
    assert.equal(resolved.provenance.technicalDecisionEvidence.reviewerRole, 'Integrator');
    assert.equal(resolved.provenance.technicalDecisionEvidence.candidateRevision, '5b8e575');
    assert.equal(documents.review.evidence.basisSections.length, 6);
    assert.equal(Object.hasOwn(documents.review.evidence, 'quote'), false);
    for (const row of adopted) {
        assert.equal(row.technicalReviewEvidenceId, documents.review.evidence.id);
        assert.equal(row.approvalEvidence, null, 'No additional user approval is fabricated');
        assert.equal(row.blocks, null);
    }
    for (const cell of resolved.requiredCells) {
        assert(!cell.pendingDecisionIds.some((id) => ADOPTED.includes(id)));
        const original = documents.candidate.candidateCells.find((row) => row.cellId === cell.cellId);
        assert.deepEqual(cell.planningDecisionIds, original.pendingDecisionIds);
    }
});

test('technical denominator freeze coexists with fixture/resource/participant/performance unreadiness', () => {
    assert.equal(resolved.inventoryFrozen, true);
    assert.equal(resolved.readiness.G0, 'NOT_RUN');
    assert.equal(resolved.gateStatus, 'NOT_RUN');
    assert.equal(resolved.readiness.otherGates, 'NOT_RUN');
    assert.deepEqual(
        resolved.unresolvedReadinessDecisions.map((row) => row.id),
        UNRESOLVED,
    );
    for (const row of resolved.unresolvedReadinessDecisions) {
        assert(row.status.startsWith('PENDING_'));
        assert.equal(row.doesNotUnfreezeDefinedDenominator, true);
        assert.equal(row.approvalEvidence, null);
    }
    assert.equal(resolved.requiredCells.filter((row) => row.blockedResourceIds.length).length, 2056);
    assert.equal(resolved.readiness.performanceBaseline, 'NOT_ESTABLISHED');
    assert(
        resolved.fixtureSpecifications.every((row) => row.fixtureHash === null && row.acceptedEvidence.length === 0),
    );
    assert.deepEqual(resolved.resourcePlanSnapshot, documents.candidate.resourcePlanSnapshot);
});

test('positive MT, real-device, human and Debug/Release obligations remain exact', () => {
    assert.equal(resolved.requiredCells.filter((row) => row.positiveMtExecutionRequired).length, 1331);
    const targets = resolved.requiredCells.filter((row) => row.testId === 'WASM-13-AIR-MT');
    assert.equal(new Set(targets.map((row) => row.environmentId)).size, 6);
    assert.deepEqual([...new Set(targets.map((row) => row.workerCount))].sort(), [2, 3, 4]);
    assert.equal(resolved.summary.byBuildProfile.debug, 176);
    assert(resolved.requiredCells.some((row) => row.resourceIds.includes('BIZ07-FIRST-TIME-USERS')));
    assert(resolved.requiredCells.some((row) => row.environmentId === 'ANDROID-WEBVIEW'));
    assert(resolved.requiredCells.some((row) => row.environmentId === 'IOS-SAFARI'));
    assert(resolved.mtTargetReview.every((row) => row.status === 'FROZEN_REQUIRED_TARGET_NOT_COMPATIBILITY_CLAIM'));
});

test('the complete fixture assertion and evidence metadata can be recovered without regeneration', () => {
    assert.deepEqual(resolved.fixtureSpecifications, documents.candidate.fixtureSpecifications);
    assert.deepEqual(resolved.evidenceRequirements, documents.candidate.evidenceRequirements);
    assert.deepEqual(resolved.environmentDefinitions, documents.candidate.environmentDefinitions);
    assert.deepEqual(resolved.variantDefinitions, documents.candidate.variantDefinitions);
    assert.deepEqual(resolved.technicalCheckpoints, documents.candidate.technicalCheckpoints);
    const originalCells = new Map(documents.candidate.candidateCells.map((row) => [row.cellId, row]));
    for (const cell of resolved.requiredCells) {
        const { planningDecisionIds, ...rest } = cell;
        const source = originalCells.get(cell.cellId);
        assert.deepEqual(rest, {
            ...source,
            requirementStatus: 'FROZEN_REQUIRED',
            pendingDecisionIds: source.pendingDecisionIds.filter((id) => !ADOPTED.includes(id)),
        });
        assert.deepEqual(planningDecisionIds, source.pendingDecisionIds);
    }
});

test('candidate history is byte-pinned and still retains its original unapproved status', () => {
    assert.equal(documents.candidate.inventoryFrozen, false);
    assert.equal(documents.candidate.expandedRequiredCellCount, null);
    assert.equal(documents.policy.status, 'DETERMINISTIC_PROPOSAL_NOT_APPROVED_FREEZE');
    for (const history of documents.frozen.protectedCandidateHistory) {
        assert.equal(digest(fs.readFileSync(path.join(ROOT, history.path))), history.sha256);
        assert.equal(history.sha256, PINNED_V1_BYTES[history.path]);
    }
    assert.equal(documents.frozen.protectedCandidateHistory.length, 5);
});

test('formal original-input digests bind actual bytes rather than newly rehashed substitutes', () => {
    assert.deepEqual(documents.frozen.sourceInputDigests, documents.candidate.sourceInputs);
    for (const input of documents.frozen.sourceInputDigests) {
        assert.equal(digest(fs.readFileSync(path.join(ROOT, input.path))), input.sha256);
    }
    assert.equal(
        documents.review.originalPlan.sha256,
        '17b4dcf0d8acbe0ed72f81ab4d3fc53c6a51f705d573699f0d50137e4bf00c46',
    );
});

test('a separate dependency-free archive mechanically restores all 2128 cells using built-in Node only', () => {
    withArchive((elsewhere) => {
        assert(!fs.existsSync(path.join(elsewhere, 'node_modules')));
        const output = execFileSync(process.execPath, [path.join(elsewhere, verifier), '--resolve-json'], {
            cwd: os.tmpdir(),
            encoding: 'utf8',
            maxBuffer: 16 * 1024 * 1024,
        });
        const restored = JSON.parse(output);
        assert.deepEqual(restored, resolved);
        assert(!output.includes(ROOT));
        assert(!output.includes(elsewhere));
        assert.equal(restored.requiredCells.length, 2128);
        assert.equal(restored.sourceReferences.length, 177);
        assert.equal(restored.executionDefinitions.length, 186);
    });
});

test('check and resolve are read-only, with no implicit snapshot repairs or writes', () => {
    withArchive((elsewhere) => {
        const files = [...archiveRequirements(), verifier];
        const before = files.map((file) => ({
            file,
            bytes: fs.readFileSync(path.join(elsewhere, file)),
            mtimeMs: fs.statSync(path.join(elsewhere, file)).mtimeMs,
        }));
        const output = execFileSync(process.execPath, [path.join(elsewhere, verifier), '--check'], {
            encoding: 'utf8',
        });
        assert.match(output, /2128 required cells/);
        resolveFrozenV1(elsewhere);
        for (const row of before) {
            assert.deepEqual(fs.readFileSync(path.join(elsewhere, row.file)), row.bytes);
            assert.equal(fs.statSync(path.join(elsewhere, row.file)).mtimeMs, row.mtimeMs);
        }
    });
});

test('write, regenerate, repair and unknown flags are rejected rather than altering the frozen version', () => {
    for (const flag of ['--write', '--regenerate', '--repair', '--freeze', '--update', '--check --write']) {
        const result = spawnSync(process.execPath, [path.join(ROOT, verifier), flag], { encoding: 'utf8' });
        assert.notEqual(result.status, 0, flag);
        assert.match(result.stderr, /No --write\/repair\/regeneration/);
    }
    assert.equal(digest(fs.readFileSync(path.join(ROOT, FILES.frozen))), PINNED_V1_BYTES[FILES.frozen]);
});

test('missing, duplicate, relabeled and reordered cell identities are rejected', () => {
    rejectMutation((bad) => bad.frozen.cellStates.pop());
    rejectMutation((bad) => bad.frozen.cellStates.push(bad.frozen.cellStates[0]));
    rejectMutation((bad) => {
        bad.frozen.cellStates[0].cellId = bad.frozen.cellStates[0].cellId.replace('|mt2|', '|mt4|');
    });
    rejectMutation((bad) => {
        bad.frozen.cellStates.reverse();
    });
    rejectMutation((bad) => {
        bad.frozen.cellStates[0].required = false;
    });
});

test('an introduced PASS, nonempty evidence, execution timestamp or premature Gate PASS is rejected', () => {
    rejectMutation((bad) => {
        bad.frozen.cellStates[0].executionStatus = 'PASS';
    });
    rejectMutation((bad) => {
        bad.frozen.cellStates[0].evidence = ['limited-node-subset'];
    });
    rejectMutation((bad) => {
        bad.frozen.cellStates[0].executedAt = '2026-10-22T00:00:00Z';
    });
    rejectMutation((bad) => {
        bad.frozen.readiness.G0 = 'PASS';
    });
    rejectMutation((bad) => {
        bad.frozen.readiness.otherGates = 'PASS';
    });
    rejectMutation((bad) => {
        bad.frozen.summary.statuses.PASS = 1;
    });
});

test('unresolved denominator decisions, missing technical review or fabricated user approval are rejected', () => {
    rejectMutation((bad) => {
        bad.review.adoptedDenominatorDecisions[0].status = 'PENDING_INTEGRATOR_REVIEW';
    });
    rejectMutation((bad) => {
        bad.frozen.denominatorDecisions[1].status = 'PENDING_INTEGRATOR_REVIEW';
    });
    rejectMutation((bad) => {
        bad.review.adoptedDenominatorDecisions.pop();
    });
    rejectMutation((bad) => {
        bad.frozen.denominatorDecisions.pop();
    });
    rejectMutation((bad) => {
        bad.review.noProductCompatibilityOrAcceptanceClaim = false;
    });
    rejectMutation((bad) => {
        bad.review.evidence.reviewerRole = 'User';
    });
    rejectMutation((bad) => {
        bad.review.evidence.basisSections = [];
    });
});

test('D04/D05/D07 and exact resource/fixture readiness cannot be promoted with denominator adoption', () => {
    rejectMutation((bad) => {
        bad.review.unresolvedReadinessDecisions[0].status = 'ADOPTED_TECHNICAL';
        bad.frozen.unresolvedReadinessDecisions = bad.review.unresolvedReadinessDecisions;
    });
    rejectMutation((bad) => {
        bad.frozen.readiness.cellsWithResourceBlockers = 0;
    });
    rejectMutation((bad) => {
        bad.frozen.readiness.fixtureSpecifications = 'READY';
    });
    rejectMutation((bad) => {
        bad.frozen.readiness.performanceBaseline = 'ESTABLISHED';
    });
    rejectMutation((bad) => {
        bad.frozen.readiness.requiredMissingDevicesAndHumansPreserved = false;
    });
});

test('missing definitions, original references, altered original digests or permissive mutation policy are rejected', () => {
    rejectMutation((bad) => bad.frozen.executionDefinitionKeys.pop());
    rejectMutation((bad) => bad.frozen.sourceReferenceIds.pop());
    rejectMutation((bad) => {
        bad.frozen.sourceInputDigests[0].sha256 = '0'.repeat(64);
    });
    rejectMutation((bad) => {
        bad.review.originalPlan.sha256 = '0'.repeat(64);
    });
    rejectMutation((bad) => {
        bad.frozen.mutationPolicy.automaticRegenerationAllowed = true;
    });
    rejectMutation((bad) => {
        bad.frozen.mutationPolicy.inPlaceChangesAllowed = true;
    });
});

test('raw formal or review byte tampering fails even when parsed JSON would be unchanged', () => {
    for (const file of [FILES.frozen, FILES.review]) {
        withArchive((elsewhere) => {
            fs.appendFileSync(path.join(elsewhere, file), '\n');
            assert.throws(() => loadFrozenV1(elsewhere), /Pinned v1 bytes changed/);
        });
    }
});

test('raw original plan, policy, resource and candidate changes require a new version, never auto-repair', () => {
    const paths = [
        'ai/plans/box3d-v1.2-reference.md',
        FILES.policy,
        `${'docs/physics/box3d/contracts'}/acceptance-resources.json`,
        FILES.candidate,
    ];
    for (const file of paths) {
        withArchive((elsewhere) => {
            const target = path.join(elsewhere, file);
            fs.appendFileSync(target, '\n');
            const altered = fs.readFileSync(target);
            assert.throws(() => loadFrozenV1(elsewhere), /Pinned v1 bytes changed/);
            assert.deepEqual(fs.readFileSync(target), altered, 'Verifier must not repair changed inputs');
        });
    }
});

test('changing candidate variants or shrinking aggregates is rejected by the original candidate byte anchor', () => {
    for (const mutate of [
        (candidate) => {
            candidate.candidateCells[0].artifactVariant = 'unsupported';
        },
        (candidate) => {
            candidate.candidateCells[0].variantId = 'st';
        },
        (candidate) => {
            candidate.sourceReferences[0].requiredCellIds = candidate.sourceReferences[0].requiredCellIds.slice(0, 1);
        },
    ]) {
        withArchive((elsewhere) => {
            const target = path.join(elsewhere, FILES.candidate);
            const candidate = JSON.parse(fs.readFileSync(target));
            mutate(candidate);
            fs.writeFileSync(target, `${JSON.stringify(candidate, null, 2)}\n`);
            assert.throws(() => loadFrozenV1(elsewhere), /Pinned v1 bytes changed/);
        });
    }
});

test('rewiring both mutable references cannot replace independently pinned v1 bytes', () => {
    withArchive((elsewhere) => {
        const reviewPath = path.join(elsewhere, FILES.review);
        const review = JSON.parse(fs.readFileSync(reviewPath));
        review.evidence.decisionSummary = 'forged engineering acceptance';
        fs.writeFileSync(reviewPath, `${JSON.stringify(review, null, 2)}\n`);
        const frozenPath = path.join(elsewhere, FILES.frozen);
        const frozen = JSON.parse(fs.readFileSync(frozenPath));
        frozen.reviewRecord.sha256 = digest(fs.readFileSync(reviewPath));
        fs.writeFileSync(frozenPath, `${JSON.stringify(frozen, null, 2)}\n`);
        assert.throws(() => loadFrozenV1(elsewhere), /Pinned v1 bytes changed/);
    });
});

test('formal D02 separates positive MT execution from audit/negative credit and target enumeration from support', () => {
    const decision = documents.review.adoptedDenominatorDecisions.find((row) => row.id === 'D02-MT-POSITIVE-TARGETS');
    assert.equal(decision.technicalClarification.positiveMtExecutionRequiredCellCount, 1331);
    assert.equal(decision.technicalClarification.auditOrRequiredNegativeMtCellCount, 18);
    assert.equal(decision.technicalClarification.auditOrNegativeCellsGiveCompatibilityCredit, false);
    assert.equal(decision.technicalClarification.actualTargetSupportVerified, false);
    assert.equal(decision.technicalClarification.targetClassEnumerationTechnicallyFrozen, true);
    assert.equal(decision.technicalClarification.G0ReadinessSatisfied, false);
    assert.equal(resolved.decisions.find((row) => row.id === decision.id).recommendation, decision.acceptedScope);
    assert.match(decision.acceptedScope, /only for the 1,331 cells with positiveMtExecutionRequired=true/);
    assert(!decision.acceptedScope.includes('Freeze actual positive target support before G0'));
    rejectMutation((bad) => {
        bad.review.adoptedDenominatorDecisions.find(
            (row) => row.id === decision.id,
        ).technicalClarification.auditOrNegativeCellsGiveCompatibilityCredit = true;
    });
    rejectMutation((bad) => {
        bad.review.adoptedDenominatorDecisions.find((row) => row.id === decision.id).acceptedScope =
            bad.candidate.decisions.find((row) => row.id === decision.id).recommendation;
    });
});
