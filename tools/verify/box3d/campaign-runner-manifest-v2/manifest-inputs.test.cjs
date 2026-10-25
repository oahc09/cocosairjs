/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Synthetic verifier tests only: no runtime import, native solver or physics dispatch.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const zlib = require('node:zlib');
const input = require('./manifest-inputs.cjs');

function temporary(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'box3d-manifest-unit-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}
function put(root, name, content = 'synthetic test bytes\n') {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
}
function repository(t) {
    const root = temporary(t);
    const git = (...args) =>
        execFileSync('git', args, {
            cwd: root,
            encoding: 'utf8',
            env: {
                ...process.env,
                GIT_AUTHOR_NAME: 'Synthetic unit fixture',
                GIT_AUTHOR_EMAIL: 'synthetic@example.invalid',
                GIT_COMMITTER_NAME: 'Synthetic unit fixture',
                GIT_COMMITTER_EMAIL: 'synthetic@example.invalid',
                GIT_AUTHOR_DATE: '2001-01-01T00:00:00+0000',
                GIT_COMMITTER_DATE: '2001-01-01T00:00:00+0000',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
    git('init', '--quiet');
    put(root, 'src/tracked.js');
    git('add', 'src/tracked.js');
    git('-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Synthetic verifier fixture, not production evidence');
    return { root, git, commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}') };
}
function provenanceFixture(t) {
    const repo = repository(t);
    put(repo.root, 'node_modules/fixture/package.json', '{"name":"synthetic"}\n');
    put(repo.root, 'external/native-fixture.txt');
    const manifest = {
        files: ['src/tracked.js', 'node_modules/fixture/package.json', 'external/native-fixture.txt'].map((p) =>
            input.row(repo.root, p),
        ),
    };
    const lock = {
        runtimeRepository: repo.root,
        runtimeProducer: repo.commit,
        runtimeTree: repo.tree,
        fullManifestSha256: input.sha(JSON.stringify(manifest)),
        evidence: [{ id: 'build-admission' }, { id: 'original-native-receipt' }],
        provenance: [
            { path: 'src/tracked.js', kind: 'git', blob: repo.git('rev-parse', 'HEAD:src/tracked.js') },
            { path: 'node_modules/fixture/package.json', kind: 'dependency', evidenceId: 'build-admission' },
            {
                path: 'external/native-fixture.txt',
                kind: 'external',
                evidenceIds: ['build-admission', 'original-native-receipt'],
            },
        ],
    };
    const policy = {
        schema: 'box3d-223-explicit-provenance-policy-v1',
        runtimeProducer: repo.commit,
        fullManifestSha256: lock.fullManifestSha256,
        external: [{ ...manifest.files[2], evidenceIds: ['build-admission', 'original-native-receipt'] }],
    };
    return { repo, manifest, lock, policy };
}
const clone = (value) => JSON.parse(JSON.stringify(value));

test('synthetic plain rows and separately locked symlink referents validate', (t) => {
    const root = temporary(t);
    put(root, 'target.txt');
    fs.symlinkSync('target.txt', path.join(root, 'link.txt'));
    const rows = ['target.txt', 'link.txt'].map((name) => input.row(root, name));
    assert.equal(input.verifyRows(root, rows).size, 2);
    assert.equal(rows[1].symlinkTarget, 'target.txt');
    assert.equal(rows[1].sha256, rows[0].sha256);
    assert.notEqual(rows[1].sha256, input.sha('target.txt'), 'Link record is not a hash of link text');
});

test('row byte drift, duplicate paths, unsupported keys and unsafe paths fail', (t) => {
    const root = temporary(t);
    put(root, 'one.txt');
    const rows = [input.row(root, 'one.txt')];
    assert.throws(() => input.verifyRows(root, [...rows, rows[0]]), /Duplicate/);
    assert.throws(() => input.verifyRows(root, [{ ...rows[0], unverified: true }]));
    for (const name of ['../outside', '/absolute', 'a/../b', 'a\\b', 'a//b', './a']) {
        assert.throws(() => input.relative(name), undefined, name);
    }
    fs.appendFileSync(path.join(root, 'one.txt'), 'changed');
    assert.throws(() => input.verifyRows(root, rows), /Input bytes or link identity changed/);
});

test('missing referent row and same-byte symlink retarget are rejected', (t) => {
    const root = temporary(t);
    put(root, 'one.txt');
    put(root, 'two.txt');
    fs.symlinkSync('one.txt', path.join(root, 'link.txt'));
    const rows = ['one.txt', 'two.txt', 'link.txt'].map((name) => input.row(root, name));
    assert.throws(
        () =>
            input.verifyRows(
                root,
                rows.filter((row) => row.path !== 'one.txt'),
            ),
        /referent/,
    );
    fs.unlinkSync(path.join(root, 'link.txt'));
    fs.symlinkSync('two.txt', path.join(root, 'link.txt'));
    assert.throws(() => input.verifyRows(root, rows), /link identity changed/);
});

test('symlink escape, dangling link and replacing link with same-byte file fail', (t) => {
    const root = temporary(t);
    put(root, 'target.txt');
    fs.symlinkSync('target.txt', path.join(root, 'link.txt'));
    const rows = ['target.txt', 'link.txt'].map((name) => input.row(root, name));
    fs.unlinkSync(path.join(root, 'link.txt'));
    put(root, 'link.txt');
    assert.throws(() => input.verifyRows(root, rows), /link identity changed/);
    const external = temporary(t);
    put(external, 'outside.txt');
    fs.unlinkSync(path.join(root, 'link.txt'));
    fs.symlinkSync(path.join(external, 'outside.txt'), path.join(root, 'link.txt'));
    assert.throws(() => input.verifyRows(root, rows), /escapes root/);
    fs.unlinkSync(path.join(root, 'link.txt'));
    fs.symlinkSync('missing.txt', path.join(root, 'link.txt'));
    assert.throws(() => input.verifyRows(root, rows), /ENOENT/);
});

test('same-byte package-directory symlink substitution cannot evade per-file lstat checks', (t) => {
    const root = temporary(t);
    const name = 'node_modules/package/code.js';
    put(root, name);
    const rows = [input.row(root, name)];
    put(root, 'node_modules/alias/code.js');
    fs.rmSync(path.join(root, 'node_modules/package'), { recursive: true });
    fs.symlinkSync('alias', path.join(root, 'node_modules/package'));
    assert(fs.lstatSync(path.join(root, name)).isFile());
    assert.throws(() => input.verifyRows(root, rows), /[Ss]ymlink|[Dd]irectory/);
});

test('real synthetic Git commit/tree/blob verify; source bytes, mode and absent path fail', (t) => {
    const repo = repository(t);
    const verifier = input.gitRepository(repo.root, repo.commit, repo.tree);
    assert.equal(verifier.verifyFile(repo.root, 'src/tracked.js'), repo.git('rev-parse', 'HEAD:src/tracked.js'));
    assert.throws(() => verifier.verifyFile(repo.root, input.DOC), /Git path missing/);
    fs.chmodSync(path.join(repo.root, 'src/tracked.js'), 0o755);
    assert.throws(() => verifier.verifyFile(repo.root, 'src/tracked.js'), /mode mismatch/);
    fs.chmodSync(path.join(repo.root, 'src/tracked.js'), 0o644);
    fs.appendFileSync(path.join(repo.root, 'src/tracked.js'), 'changed');
    assert.throws(() => verifier.verifyFile(repo.root, 'src/tracked.js'), /source\/blob mismatch/);
});

test('wrong producer tree and nonexistent producer are rejected', (t) => {
    const repo = repository(t);
    assert.throws(() => input.gitRepository(repo.root, repo.commit, '0'.repeat(40)), /Wrong producer tree/);
    assert.throws(() => input.gitRepository(repo.root, '0'.repeat(40), repo.tree));
});

test('tampered synthetic loose commit/tree objects cannot retain their claimed Git identity', (t) => {
    const corrupt = (repo, id) => {
        const file = path.join(repo.root, '.git/objects', id.slice(0, 2), id.slice(2));
        const raw = zlib.inflateSync(fs.readFileSync(file));
        raw[raw.length - 1] ^= 1;
        fs.chmodSync(file, 0o600);
        fs.writeFileSync(file, zlib.deflateSync(raw));
    };
    const commitRepo = repository(t);
    corrupt(commitRepo, commitRepo.commit);
    assert.throws(
        () => input.gitRepository(commitRepo.root, commitRepo.commit, commitRepo.tree),
        /Git object hash mismatch/,
    );
    const treeRepo = repository(t);
    corrupt(treeRepo, treeRepo.tree);
    const verifier = input.gitRepository(treeRepo.root, treeRepo.commit, treeRepo.tree);
    assert.throws(() => verifier.verifyFile(treeRepo.root, 'src/tracked.js'), /Git object hash mismatch/);
});

test('finite provenance union validates synthetic Git/dependency/external classes', (t) => {
    const { repo, manifest, lock, policy } = provenanceFixture(t);
    assert.doesNotThrow(() => input.verifyProvenance(lock, manifest, repo.root, policy));
    const wrong = clone(lock);
    wrong.provenance[0].blob = '0'.repeat(40);
    assert.throws(() => input.verifyProvenance(wrong, manifest, repo.root, policy));
});

test('unknown external paths, missing provenance, duplicate provenance and weak evidence fail', (t) => {
    const { repo, manifest, lock, policy } = provenanceFixture(t);
    const verify = (candidate, rules = policy) => input.verifyProvenance(candidate, manifest, repo.root, rules);
    assert.throws(() => verify(lock, { ...policy, external: [] }), /Unknown external/);
    assert.throws(() => verify({ ...lock, provenance: lock.provenance.slice(1) }), /Incomplete provenance union/);
    assert.throws(
        () => verify({ ...lock, provenance: [lock.provenance[0], lock.provenance[0], lock.provenance[2]] }),
        /duplicate provenance/,
    );
    const wrong = clone(lock);
    wrong.provenance[2].evidenceIds = ['build-admission'];
    const weakPolicy = clone(policy);
    weakPolicy.external[0].evidenceIds = ['build-admission'];
    assert.throws(() => verify(wrong, weakPolicy), /original provenance/);
    assert.throws(() => verify({ ...lock, evidence: [{ id: 'build-admission' }] }), /Missing external provenance/);
});

test('installed-dependency fallback cannot absorb Git source or src/node_modules', (t) => {
    const { repo, manifest, lock, policy } = provenanceFixture(t);
    const wrong = clone(lock);
    wrong.provenance[0] = { path: 'src/tracked.js', kind: 'dependency', evidenceId: 'build-admission' };
    assert.throws(
        () => input.verifyProvenance(wrong, manifest, repo.root, policy),
        /restricted to installed node_modules/,
    );
    wrong.provenance[0].path = 'src/node_modules/tracked.js';
    const altered = clone(manifest);
    altered.files[0].path = wrong.provenance[0].path;
    assert.throws(
        () => input.verifyProvenance(wrong, altered, repo.root, policy),
        /restricted to installed node_modules/,
    );
});

test('manifest and producer policy mismatches and unknown classes fail closed', (t) => {
    const { repo, manifest, lock, policy } = provenanceFixture(t);
    assert.throws(() =>
        input.verifyProvenance(lock, manifest, repo.root, { ...policy, runtimeProducer: '0'.repeat(40) }),
    );
    assert.throws(() =>
        input.verifyProvenance(lock, manifest, repo.root, { ...policy, fullManifestSha256: '0'.repeat(64) }),
    );
    const wrong = clone(lock);
    wrong.provenance[2].kind = 'arbitrary-local-fallback';
    assert.throws(() => input.verifyProvenance(wrong, manifest, repo.root, policy), /Unsupported provenance class/);
});

test('versioned verifier rejects legacy and unknown schemas before any input access', () => {
    for (const schema of ['box3d-same-build-cohort-v1', 'invented-v99', undefined]) {
        assert.throws(
            () => input.verify({ schema }, '/does-not-exist', '/does-not-exist', '/does-not-exist'),
            /Unsupported profile; no legacy downgrade/,
        );
    }
});

test('product and fixture acceptance identities remain distinct and fixture tamper changes acceptance', () => {
    const lock = {
        runtimeProducer: '1'.repeat(40),
        runtimeTree: '2'.repeat(40),
        runtimeBuildNumber: 223,
        runtime: [],
        fullManifestSha256: '3'.repeat(64),
        regressionFixtureCommit: '4'.repeat(40),
        fixtureTree: '5'.repeat(40),
        fixture: [],
        auxiliary: [],
        provenance: [],
        evidence: [],
        policy: {},
    };
    const before = input.identity(lock);
    const after = input.identity({ ...lock, regressionFixtureCommit: '6'.repeat(40) });
    assert.equal(before.productSha256, after.productSha256);
    assert.notEqual(before.acceptanceSha256, after.acceptanceSha256);
    assert.notEqual(before.productSha256, input.identity({ ...lock, runtimeProducer: '7'.repeat(40) }).productSha256);
});

test('mandatory auxiliary document requires the actual fixture Git blob and rejects omission or tamper', (t) => {
    const repo = repository(t);
    const beforeDoc = input.gitRepository(repo.root, repo.commit, repo.tree);
    assert.throws(
        () => input.verifyAuxiliary({ fixtureRepository: repo.root, auxiliary: [] }, beforeDoc),
        /Mandatory P2P/,
    );
    put(repo.root, input.DOC, '# Synthetic verifier document, not a historical restoration\n');
    const lock = { fixtureRepository: repo.root, auxiliary: [input.row(repo.root, input.DOC)] };
    assert.throws(() => input.verifyAuxiliary(lock, beforeDoc), /Git path missing/);
    repo.git('add', input.DOC);
    repo.git('-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Synthetic auxiliary fixture only');
    const afterDoc = input.gitRepository(
        repo.root,
        repo.git('rev-parse', 'HEAD'),
        repo.git('rev-parse', 'HEAD^{tree}'),
    );
    assert.doesNotThrow(() => input.verifyAuxiliary(lock, afterDoc));
    fs.appendFileSync(path.join(repo.root, input.DOC), 'tamper');
    assert.throws(() => input.verifyAuxiliary(lock, afterDoc), /Input bytes or link identity changed/);
});

test('external evidence bytes and committed pins cannot drift or lose entries', (t) => {
    const root = temporary(t);
    const file = put(root, 'receipt.json', '{"scope":"synthetic"}\n');
    const bytes = fs.readFileSync(file);
    const record = { id: 'original-native-receipt', file, bytes: bytes.length, sha256: input.sha(bytes) };
    const pins = [{ id: record.id, bytes: record.bytes, sha256: record.sha256 }];
    assert.equal(input.verifyEvidence([record], pins).size, 1);
    assert.throws(() => input.verifyEvidence([record, record], pins), /Duplicate evidence/);
    assert.throws(() => input.verifyEvidence([record], []), /closure differs/);
    assert.throws(() => input.verifyEvidence([record], [{ ...pins[0], sha256: '0'.repeat(64) }]), /committed pin/);
    fs.writeFileSync(file, '{"scope":"SYNTHETIC"}\n');
    assert.throws(() => input.verifyEvidence([record], pins), /External provenance drift/);
});

test('synthetic external archive/native/build bindings reject missing origins, native drift and producer mismatch', (t) => {
    const root = temporary(t);
    const nativeRows = [];
    for (let index = 0; index < 79; index++) {
        const name = `native/input-${index}.txt`;
        put(root, name, `synthetic source ${index}\n`);
        nativeRows.push({ path: name, sha256: input.sha(fs.readFileSync(path.join(root, name))) });
    }
    put(root, 'external/artifact.txt');
    const external = input.row(root, 'external/artifact.txt');
    const archive = { files: [{ ...external, path: 'source/' + external.path }] };
    const native = { status: 'PASS', inputHashes: nativeRows };
    const producer = '1'.repeat(40);
    const manifestSha = '2'.repeat(64);
    const build = { exitCode: 0, head: producer, inputManifestSha256: manifestSha };
    const write = (name, data) => put(root, name, JSON.stringify(data));
    const archiveFile = write('archive.json', archive);
    const nativeFile = write('native.json', native);
    const buildFile = write('build.json', build);
    const lock = {
        runtimeProducer: producer,
        fullManifestSha256: manifestSha,
        evidence: [
            { id: 'archive-package-manifest', file: archiveFile },
            { id: 'native-build-receipt', file: nativeFile },
            { id: 'runtime-build-result', file: buildFile },
        ],
    };
    const policy = { external: [external] };
    const check = () => input.verifyExternalBindings(lock, { files: [external] }, policy, root);
    assert.doesNotThrow(check);
    write('archive.json', { files: [] });
    assert.throws(check, /not in original archive/);
    write('archive.json', archive);
    fs.appendFileSync(path.join(root, nativeRows[0].path), 'changed');
    assert.throws(check, /Native original input drift/);
    put(root, nativeRows[0].path, 'synthetic source 0\n');
    write('build.json', { ...build, head: '3'.repeat(40) });
    assert.throws(check);
});

test('only the exact counter projection is allowed and projected bytes remain manifest-bound', (t) => {
    const root = temporary(t);
    const projected = temporary(t);
    const counter = 'tools/build/build-number.json';
    put(root, counter, '{"lastBuildNumber":222}\n');
    const rows = [input.row(root, counter)];
    const original = put(projected, 'original-counter.json', '{"lastBuildNumber":222}\n');
    const projection = [{ path: counter, file: original }];
    put(root, counter, '{"lastBuildNumber":223}\n');
    assert.throws(() => input.verifyRows(root, rows), /Input bytes or link identity changed/);
    assert.doesNotThrow(() => input.verifyRows(root, rows, projection));
    assert.equal(
        JSON.parse(fs.readFileSync(path.join(root, counter))).lastBuildNumber,
        223,
        'Live source was not changed',
    );
    assert.throws(
        () => input.verifyRows(root, rows, [{ path: 'src/arbitrary.js', file: original }]),
        /Unknown projection path/,
    );
    assert.throws(() => input.verifyRows(root, rows, [...projection, ...projection]), /Only the proven/);
    assert.throws(
        () => input.verifyRows(root, rows, [{ path: counter, file: 'relative-counter.json' }]),
        /regular file/,
    );
    const link = path.join(projected, 'counter-link.json');
    fs.symlinkSync('original-counter.json', link);
    assert.throws(() => input.verifyRows(root, rows, [{ path: counter, file: link }]), /regular file/);
    fs.appendFileSync(original, 'tamper');
    assert.throws(() => input.verifyRows(root, rows, projection), /Input bytes or link identity changed/);
});
