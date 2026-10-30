const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const helper = require('./prepare-inputs.cjs');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'public-inputs.json'), 'utf8'));
const FROZEN_CURRENT_COMMIT = 'c15aa8b2e61c3eba6ff72eb8c2e5cbfe405cfdc8';
const clone = () => structuredClone(manifest);
const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), 'upstream-public-input-test-'));

function rehash(value) {
    for (const task of value.tasks) task.commonInputSha256 = helper.canonicalHash(helper.commonInput(value, task));
    return value;
}

test('all twelve fixed paired task contracts are complete without claiming execution', () => {
    helper.validateManifest(manifest);
    assert.equal(manifest.tasks.length * manifest.cohort.repetitions * manifest.cohort.engines.length, 72);
    for (const task of manifest.tasks) {
        assert(Object.keys(task.publicSpec).length > 2);
        assert.match(task.commonInputSha256, /^[a-f0-9]{64}$/);
        assert.equal(task.referenceValidationStatus, 'NOT_RUN');
    }
    assert.equal(manifest.observations.successRate, null);
});

test('task count, repetitions, budget, threshold and fixed seeds cannot silently drift', () => {
    for (const [field, value] of [
        ['tasks', 11],
        ['repetitions', 2],
        ['repairBudget', 6],
        ['timeBudgetMs', 1200001],
        ['minimumSuccessRate', 0.79],
    ]) {
        const bad = clone();
        bad.cohort[field] = value;
        assert.throws(() => helper.validateManifest(rehash(bad)), /cohort/);
    }
    const bad = clone();
    bad.tasks[0].repetitionSeeds[1] = 7;
    assert.throws(() => helper.validateManifest(rehash(bad)));
});

test('reworded specs and resource modifications invalidate common input hashes', () => {
    const bad = clone();
    bad.tasks[0].publicSpec.failure = 'Claim success without trying';
    assert.throws(() => helper.validateManifest(bad), /common input hash mismatch/);
    const changed = clone();
    changed.resources[0].sha256 = '0'.repeat(64);
    assert.throws(() => helper.validateManifest(changed), /common input hash mismatch/);
});

test('old knowledge is a Git-blob corpus, not current documents relabelled old', () => {
    assert.equal(manifest.knowledgeProfiles.old.files.length, 17);
    assert.equal(manifest.knowledgeProfiles.current.files.length, 21);
    assert.equal(manifest.knowledgeProfiles.old.absentByMainTree.length, 4);
    const bad = clone();
    bad.knowledgeProfiles.old.files[0].origin = 'current-checkout';
    assert.throws(() => helper.validateManifest(bad), /old knowledge cannot/);
});

test('knowledge inventories detect changed docs and prohibit source/test mounts', () => {
    const bad = clone();
    bad.knowledgeProfiles.old.files[0].sha256 = 'f'.repeat(64);
    assert.throws(() => helper.validateManifest(bad), /knowledge inventory mismatch/);
    const forbidden = clone();
    forbidden.knowledgeProfiles.current.files[0].path = 'test/fixtures/private-reference.js';
    assert.throws(() => helper.validateManifest(forbidden), /non-public knowledge path/);
});

test('public common task contains no producer paths or implementation/reference contents', () => {
    const task = helper.commonInput(manifest, manifest.tasks[1]);
    assert(!JSON.stringify(task).includes('sourceSha256'));
    assert(!JSON.stringify(task).includes('sourcePath'));
    assert(!JSON.stringify(task).includes('server.cjs'));
    for (const row of task.resources) assert(row.path.startsWith('assets/'));
    const bad = clone();
    bad.resources[0].publicPath = 'assets/reference.cjs';
    assert.throws(() => helper.validateManifest(rehash(bad)), /implementation\/reference/);
});

test('manifest cannot upgrade three, allow external/peer network or claim observations', () => {
    for (const mutate of [
        (m) => {
            m.threeBaseline.version = 'latest';
        },
        (m) => {
            m.networkContract.external = 'allow';
        },
        (m) => {
            m.networkContract.peerAccess = 'allow';
        },
        (m) => {
            m.observations.generatedRuns = 72;
        },
        (m) => {
            m.observations.tokens = 0;
        },
        (m) => {
            m.tasks[0].pairedSemanticsStatus = 'VALID';
        },
    ]) {
        const bad = clone();
        mutate(bad);
        assert.throws(() => helper.validateManifest(rehash(bad)));
    }
});

test('public file checks reject byte corruption and unsafe or symlink paths', () => {
    const root = temporary();
    try {
        fs.writeFileSync(path.join(root, 'ok.txt'), 'fixed');
        const bytes = fs.readFileSync(path.join(root, 'ok.txt'));
        helper.checkedBytes(bytes, { path: 'ok.txt', bytes: 5, sha256: helper.sha256(bytes) });
        assert.throws(
            () => helper.checkedBytes(Buffer.from('wrong'), { path: 'ok.txt', bytes: 5, sha256: helper.sha256(bytes) }),
            /SHA256 mismatch/,
        );
        assert.throws(() => helper.boundedFile(root, '../outside'), /unsafe/);
        fs.symlinkSync(path.join(root, 'ok.txt'), path.join(root, 'link.txt'));
        assert.throws(() => helper.boundedFile(root, 'link.txt'), /symlink/);
        assert.throws(() => helper.treeInventory(root), /symlink/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('canonical hashing and path inventories are order independent and byte sensitive', () => {
    assert.equal(helper.canonicalHash({ a: 1, b: [2, 3] }), helper.canonicalHash({ b: [2, 3], a: 1 }));
    const rows = [
        { path: 'z', sha256: 'f' },
        { path: 'a', sha256: 'e' },
    ];
    assert.equal(helper.inventoryHash(rows), helper.inventoryHash([...rows].reverse()));
    assert.notEqual(helper.canonicalHash([1, 2]), helper.canonicalHash([2, 1]));
});

test('external engine receipts bind actual bytes and the exact main control commit', () => {
    const root = temporary();
    try {
        const artifactPath = path.join(root, 'synthetic-test-only.tgz');
        fs.writeFileSync(artifactPath, 'synthetic test bytes, not an actual package');
        const receipt = {
            schema: 'upstream-agent-engine-artifacts/1',
            control: {
                artifactPath,
                sha256: helper.sha256(fs.readFileSync(artifactPath)),
                provenance: { sourceCommit: helper.MAIN, artifactKind: 'synthetic-test-only' },
            },
        };
        const file = path.join(root, 'receipt.json');
        fs.writeFileSync(file, JSON.stringify(receipt));
        assert.equal(helper.readEngineReceipt(file).receipt.control.sha256, receipt.control.sha256);
        receipt.control.provenance.sourceCommit = '0'.repeat(40);
        fs.writeFileSync(file, JSON.stringify(receipt));
        assert.throws(() => helper.readEngineReceipt(file), /control source/);
        receipt.control.provenance.sourceCommit = helper.MAIN;
        receipt.control.sha256 = '0'.repeat(64);
        fs.writeFileSync(file, JSON.stringify(receipt));
        assert.throws(() => helper.readEngineReceipt(file), /artifact mismatch/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

const repoRoot = path.resolve(__dirname, '../../..');
const inputsRoot = `${repoRoot}-inputs`;
const localArtifactsAvailable = fs.existsSync(path.join(inputsRoot, manifest.threeBaseline.archiveRelativePath));
test(
    'real historical input-bank replay preserves exact frozen bytes and never launches arms',
    { skip: !localArtifactsAvailable },
    () => {
        const root = temporary();
        try {
            const publicRoot = path.join(root, 'public'),
                out = path.join(root, 'report');
            const report = helper.prepareInputs({
                repoRoot,
                inputsRoot,
                publicRoot,
                out,
                execute: true,
                currentKnowledgeCommit: FROZEN_CURRENT_COMMIT,
            });
            assert.equal(report.currentKnowledgeProvenance.origin, 'explicit-frozen-git-replay');
            assert.equal(report.currentKnowledgeProvenance.sourceCommit, FROZEN_CURRENT_COMMIT);
            assert.equal(report.oldKnowledgeProvenance.sourceCommit, helper.MAIN);
            assert.equal(
                report.manifestSha256,
                helper.sha256(fs.readFileSync(path.join(__dirname, 'public-inputs.json'))),
            );
            assert.equal(report.publicPreparationComplete, true);
            assert.equal(report.generationAllowed, false);
            assert.equal(report.observations.generatedRuns, 0);
            assert.equal(report.threeBaseline.fileCount, 1263);
            assert.equal(Object.keys(report.commonInputHashes).length, 12);
            for (const row of report.publicInventory) {
                helper.checkedBytes(fs.readFileSync(path.join(publicRoot, row.path)), row);
                assert(!/\.(?:js|cjs|mjs|ts)$/.test(row.path), `protected source copied: ${row.path}`);
            }
            assert.equal(helper.inventoryHash(helper.treeInventory(publicRoot)), report.publicInventorySha256);
            assert.throws(
                () =>
                    helper.prepareInputs({
                        repoRoot,
                        inputsRoot,
                        publicRoot,
                        out,
                        execute: true,
                        currentKnowledgeCommit: FROZEN_CURRENT_COMMIT,
                    }),
                /already exists/,
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    },
);

test('each task glTF dependency closure excludes missing or external assets', () => {
    const value = clone();
    const files = new Map();
    for (const row of value.resources) {
        if (row.publicPath.endsWith('.gltf')) {
            files.set(row.publicPath, Buffer.from(JSON.stringify({ asset: { version: '2.0' } })));
        } else files.set(row.publicPath, Buffer.from('test-only synthetic bytes'));
    }
    const modelPath = 'assets/http/model.gltf';
    files.set(
        modelPath,
        Buffer.from(
            JSON.stringify({
                asset: { version: '2.0' },
                buffers: [{ uri: 'mesh.bin' }],
                images: [{ uri: 'pixel.png' }],
            }),
        ),
    );
    helper.verifyAssetClosure(value, files);
    files.set(modelPath, Buffer.from(JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'missing.bin' }] })));
    assert.throws(() => helper.verifyAssetClosure(value, files), /missing asset dependency/);
    files.set(
        modelPath,
        Buffer.from(
            JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'https://external.invalid/asset.bin' }] }),
        ),
    );
    assert.throws(() => helper.verifyAssetClosure(value, files), /external network/);
});

test('the full 36-pair schedule keeps 72 arms and deterministic balanced ordering', () => {
    const pairs = helper.pairSchedule(manifest);
    assert.equal(pairs.length, 36);
    assert.equal(pairs.flatMap((pair) => pair.armOrder).length, 72);
    assert.equal(new Set(pairs.map((pair) => pair.pairId)).size, 36);
    assert.equal(pairs.filter((pair) => pair.armOrder[0] === 'cocosair').length, 18);
    for (const task of manifest.tasks) {
        const selected = pairs.filter((pair) => pair.taskId === task.id);
        assert.deepEqual(
            selected.map((pair) => pair.seed),
            helper.SEEDS,
        );
        assert(selected.every((pair) => pair.commonInputSha256 === task.commonInputSha256));
    }
});

// ai/plans/upstream-update.md U06 preserves skipLibCheck while testing caller semantics.
test('AU12 preserves documented skipLibCheck true and strictNullChecks caller contract', () => {
    const current = manifest.tasks.find((task) => task.id === 'AU12').publicSpec.strictTypeOptions;
    assert.equal(current.skipLibCheck, true);
    assert.equal(current.strictNullChecks, true);
    for (const field of ['skipLibCheck', 'strictNullChecks']) {
        const bad = clone();
        bad.tasks.find((task) => task.id === 'AU12').publicSpec.strictTypeOptions[field] = false;
        assert.throws(() => helper.validateManifest(rehash(bad)), /AU12/);
    }
});

test('versioned AU12 common modes cannot delete Cocos legacy or force legacy modes onto Three', () => {
    for (const mutate of [
        (m) => {
            m.tasks[11].publicSpec.compilerContract.id = 'upstream-sdk-types/1';
        },
        (m) => {
            m.tasks[11].publicSpec.compilerContract.fixtureScope = 'candidate-u06-extension/1';
        },
        (m) => {
            delete m.tasks[11].publicSpec.compilerContract.fixtureScope;
        },
        (m) => {
            m.tasks[11].publicSpec.compilerContract.commonModeIds.pop();
        },
        (m) => {
            m.tasks[11].publicSpec.compilerContract.cocosCompatibilityModeIds.pop();
        },
        (m) => {
            m.tasks[11].publicSpec.compilerContract.threeCompatibilityModeIds.push('4.9.5/node');
        },
        (m) => {
            m.threeBaseline.declarations.version = 'latest';
        },
        (m) => {
            m.threeBaseline.declarations.manifestSha256 = null;
        },
    ]) {
        const bad = clone();
        mutate(bad);
        assert.throws(() => helper.validateManifest(rehash(bad)));
    }
});

test('explicit historical current knowledge replay remains hash-bound and never hides checkout drift', () => {
    // Protocol unit: self-contained objects, so ordinary depth-1 CI needs no repository history.
    // The separate real input-bank test still explicitly replays the frozen historical corpus.
    const root = temporary();
    const git = (...args) =>
        execFileSync(
            'git',
            ['-C', root, '-c', 'user.name=Replay fixture', '-c', 'user.email=fixture@example.invalid', ...args],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        ).trim();
    try {
        git('init', '--quiet');
        const bytes = Buffer.from('self-contained frozen knowledge\n');
        const row = { path: 'README.md', bytes: bytes.length, sha256: helper.sha256(bytes) };
        const file = path.join(root, row.path);
        fs.writeFileSync(file, bytes);
        const blob = git('hash-object', '-w', row.path);
        git('update-index', '--add', '--cacheinfo', `100644,${blob},${row.path}`);
        const frozen = git('commit-tree', git('write-tree'), '-m', 'Frozen fixture corpus');
        fs.writeFileSync(file, 'changed candidate documentation');
        const changedBlob = git('hash-object', '-w', row.path);
        git('update-index', '--cacheinfo', `100644,${changedBlob},${row.path}`);
        const changed = git('commit-tree', git('write-tree'), '-p', frozen, '-m', 'Changed fixture corpus');

        assert.throws(() => helper.currentKnowledgeBytes(root, row), /byte length mismatch/);
        assert.throws(() => helper.currentKnowledgeBytes(root, row, 'HEAD'), /exact commit/);
        assert.throws(() => helper.currentKnowledgeBytes(root, { ...row, path: '../README.md' }, frozen), /unsafe/);
        assert.throws(() => helper.currentKnowledgeBytes(root, row, blob), /must be a commit/);
        assert.throws(() => helper.currentKnowledgeBytes(root, row, changed), /mismatch/);
        assert.throws(
            () => helper.currentKnowledgeBytes(root, { ...row, sha256: '0'.repeat(64) }, frozen),
            /SHA256 mismatch/,
        );
        assert.deepEqual(helper.currentKnowledgeBytes(root, row, frozen), bytes);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
