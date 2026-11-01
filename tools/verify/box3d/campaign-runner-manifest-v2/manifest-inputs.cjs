/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Dedicated manifest profile. Never accepts/downgrades to historical cohort schemas.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const SCHEMA = 'box3d-same-build-cohort-manifest-v2';
const DOC = 'docs/physics/box3d/joints/point-to-point-vertical-slice.md';
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const gitHash = (type, data) => crypto.createHash('sha1').update(`${type} ${data.length}\0`).update(data).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(file));
function relative(name) {
    assert(typeof name === 'string' && name.length && !path.isAbsolute(name));
    assert(!name.includes('\\') && name.split('/').every((x) => x && x !== '.' && x !== '..'), 'Unsafe input path');
    return name;
}
function inside(root, file) {
    const lexical = path.relative(path.resolve(root), path.resolve(file));
    assert(lexical && !lexical.startsWith('..' + path.sep) && lexical !== '..' && !path.isAbsolute(lexical));
    let parent = path.resolve(root);
    for (const part of lexical.split(path.sep).slice(0, -1)) {
        parent = path.join(parent, part);
        assert(fs.lstatSync(parent).isDirectory(), 'Undeclared symlink directory in input path');
    }
    const rel = path.relative(fs.realpathSync(root), fs.realpathSync(file));
    assert(rel && !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel), 'Input escapes root');
    return rel.split(path.sep).join('/');
}
function inputFile(root, name, projection = []) {
    relative(name);
    assert(projection.length <= 1, 'Only the proven postbuild counter projection is supported');
    for (const item of projection) {
        assert.equal(item.path, 'tools/build/build-number.json', 'Unknown projection path');
        assert(path.isAbsolute(item.file) && fs.lstatSync(item.file).isFile(), 'Projection requires a regular file');
    }
    return projection.find((item) => item.path === name)?.file ?? path.join(root, name);
}
function row(root, name, projection = []) {
    relative(name);
    const file = inputFile(root, name, projection),
        stat = fs.lstatSync(file);
    assert(stat.isFile() || stat.isSymbolicLink(), 'Only file or declared symlink');
    if (!projection.some((item) => item.path === name)) inside(root, file);
    const bytes = fs.readFileSync(file);
    return {
        path: name,
        ...(stat.isSymbolicLink() ? { symlinkTarget: fs.readlinkSync(file) } : {}),
        sha256: sha(bytes),
        bytes: bytes.length,
    };
}
function verifyRows(root, rows, projection = []) {
    assert(Array.isArray(rows) && rows.length > 0);
    const byPath = new Map();
    for (const item of rows) {
        relative(item.path);
        assert(!byPath.has(item.path), 'Duplicate input path');
        assert.deepEqual(
            Object.keys(item).sort(),
            ('symlinkTarget' in item
                ? ['path', 'bytes', 'sha256', 'symlinkTarget']
                : ['path', 'bytes', 'sha256']
            ).sort(),
        );
        assert(Number.isSafeInteger(item.bytes) && item.bytes >= 0 && /^[a-f0-9]{64}$/.test(item.sha256));
        byPath.set(item.path, item);
        assert.deepEqual(row(root, item.path, projection), item, 'Input bytes or link identity changed: ' + item.path);
    }
    // Manifest SHA covers referent bytes, not link-text bytes. Keep both identities
    // distinct and require the resolved referent to have its own independent row.
    for (const item of rows) {
        if (!('symlinkTarget' in item)) continue;
        assert(typeof item.symlinkTarget === 'string' && !path.isAbsolute(item.symlinkTarget));
        const target = inside(root, path.join(root, item.path));
        const referent = byPath.get(target);
        assert(referent && !('symlinkTarget' in referent), 'Symlink referent must have a plain-file manifest row');
        assert.equal(referent.sha256, item.sha256);
        assert.equal(referent.bytes, item.bytes);
    }
    return byPath;
}
function walk(root, prefix = '') {
    return fs
        .readdirSync(path.join(root, prefix), { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap((item) => {
            const name = prefix ? prefix + '/' + item.name : item.name;
            assert(!item.isSymbolicLink(), 'Fixture/runtime closure cannot contain symlinks');
            return item.isDirectory() ? walk(root, name) : [row(root, name)];
        });
}
function runtimeRows(artifacts) {
    return [
        ...[
            'cocosair.module.js',
            'cocosair.module.js.map',
            'evidence/build/result.json',
            'evidence/build/source-inputs.json',
        ].map((name) => row(artifacts, name)),
        ...walk(path.join(artifacts, 'physics/box3d/st')).map((item) => ({
            ...item,
            path: 'physics/box3d/st/' + item.path,
        })),
    ].sort((a, b) => a.path.localeCompare(b.path));
}
function gitRepository(repository, commit, expectedTree) {
    assert(/^[a-f0-9]{40}$/.test(commit) && /^[a-f0-9]{40}$/.test(expectedTree));
    const cache = new Map();
    function object(type, id) {
        const key = type + ':' + id;
        if (!cache.has(key)) {
            const bytes = execFileSync('git', ['cat-file', type, id], { cwd: repository, maxBuffer: 32 * 1024 * 1024 });
            assert.equal(gitHash(type, bytes), id, 'Git object hash mismatch');
            cache.set(key, bytes);
        }
        return cache.get(key);
    }
    const commitBytes = object('commit', commit);
    assert.equal(/^tree ([a-f0-9]{40})\n/.exec(commitBytes.toString())?.[1], expectedTree, 'Wrong producer tree');
    function entry(name) {
        const parts = relative(name).split('/');
        let id = expectedTree,
            found;
        for (let index = 0; index < parts.length; index++) {
            const data = object('tree', id);
            let offset = 0;
            found = undefined;
            while (offset < data.length) {
                const space = data.indexOf(32, offset),
                    nul = data.indexOf(0, space);
                assert(space > offset && nul > space && nul + 21 <= data.length, 'Malformed Git tree');
                const item = {
                    mode: data.subarray(offset, space).toString(),
                    name: data.subarray(space + 1, nul).toString(),
                    sha: data.subarray(nul + 1, nul + 21).toString('hex'),
                };
                offset = nul + 21;
                if (item.name === parts[index]) found = item;
            }
            assert(found, 'Git path missing from exact commit: ' + name);
            if (index < parts.length - 1) assert.equal(found.mode, '40000', 'Git path parent is not tree');
            id = found.sha;
        }
        return found;
    }
    function verifyFile(root, name, projection = []) {
        const found = entry(name),
            file = inputFile(root, name, projection);
        const stat = fs.lstatSync(file);
        const bytes = stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(file)) : fs.readFileSync(file);
        assert.equal(
            found.mode,
            stat.isSymbolicLink() ? '120000' : stat.mode & 0o111 ? '100755' : '100644',
            'Git mode mismatch',
        );
        assert.equal(gitHash('blob', bytes), found.sha, 'Git source/blob mismatch: ' + name);
        return found.sha;
    }
    return { entry, verifyFile };
}
function identity(lock) {
    const productSha256 = sha(
        JSON.stringify({
            runtimeProducer: lock.runtimeProducer,
            runtimeTree: lock.runtimeTree,
            runtimeBuildNumber: lock.runtimeBuildNumber,
            runtime: lock.runtime,
            fullManifestSha256: lock.fullManifestSha256,
        }),
    );
    return {
        producerCommit: lock.runtimeProducer,
        runtimeBuildNumber: lock.runtimeBuildNumber,
        productSha256,
        regressionFixtureCommit: lock.regressionFixtureCommit,
        acceptanceSha256: sha(
            JSON.stringify({
                productSha256,
                fixtureCommit: lock.regressionFixtureCommit,
                fixtureTree: lock.fixtureTree,
                fixture: lock.fixture,
                auxiliary: lock.auxiliary,
                provenance: lock.provenance,
                evidence: lock.evidence,
                policy: lock.policy,
                projection: lock.projection,
                fixtureCode: lock.fixtureCode,
            }),
        ),
    };
}
function verifyProvenance(lock, manifest, sourceRoot, policy) {
    assert.equal(policy.schema, 'box3d-223-explicit-provenance-policy-v1');
    assert.equal(policy.runtimeProducer, lock.runtimeProducer);
    assert.equal(policy.fullManifestSha256, lock.fullManifestSha256);
    const wanted = new Map(manifest.files.map((r) => [r.path, r]));
    assert.equal(lock.provenance.length, wanted.size, 'Incomplete provenance union');
    const external = new Map(policy.external.map((r) => [r.path, r]));
    assert.equal(external.size, policy.external.length);
    const evidence = new Map(lock.evidence.map((r) => [r.id, r]));
    assert.equal(evidence.size, lock.evidence.length);
    const git = gitRepository(lock.runtimeRepository, lock.runtimeProducer, lock.runtimeTree);
    const seen = new Set();
    for (const item of lock.provenance) {
        assert(wanted.has(item.path) && !seen.has(item.path), 'Unknown/duplicate provenance path');
        seen.add(item.path);
        if (item.kind === 'git') {
            assert(!item.path.startsWith('node_modules/'), 'Installed dependency mislabeled Git');
            assert(!external.has(item.path), 'External row mislabeled Git');
            assert.equal(git.verifyFile(sourceRoot, item.path, lock.projection), item.blob);
        } else if (item.kind === 'dependency') {
            assert(item.path.startsWith('node_modules/'), 'Dependency fallback restricted to installed node_modules');
            assert.equal(item.evidenceId, 'build-admission');
        } else if (item.kind === 'external') {
            const allowed = external.get(item.path);
            assert(allowed, 'Unknown external input fails closed: ' + item.path);
            assert.deepEqual(item.evidenceIds, allowed.evidenceIds);
            assert.equal(wanted.get(item.path).sha256, allowed.sha256);
            assert.equal(wanted.get(item.path).bytes, allowed.bytes);
            assert(item.evidenceIds.includes('build-admission'));
            assert(
                item.evidenceIds.some((id) => id !== 'build-admission'),
                'External input requires original provenance',
            );
            for (const id of item.evidenceIds) assert(evidence.has(id), 'Missing external provenance evidence');
        } else assert.fail('Unsupported provenance class');
    }
    assert.equal(seen.size, wanted.size);
    for (const name of external.keys()) assert(wanted.has(name), 'Policy names a nonexistent input');
}
function verifyAuxiliary(lock, fixtureGit) {
    assert(
        Array.isArray(lock.auxiliary) && lock.auxiliary.some((r) => r.path === DOC),
        'Mandatory P2P document missing',
    );
    verifyRows(lock.fixtureRepository, lock.auxiliary);
    for (const item of lock.auxiliary) fixtureGit.verifyFile(lock.fixtureRepository, item.path);
}
function verifyEvidence(evidence, pins) {
    assert(Array.isArray(evidence) && evidence.length > 0);
    const byId = new Map();
    for (const item of evidence) {
        assert(!byId.has(item.id), 'Duplicate evidence ID');
        byId.set(item.id, item);
        assert(path.isAbsolute(item.file));
        const bytes = fs.readFileSync(item.file);
        assert.equal(bytes.length, item.bytes);
        assert.equal(sha(bytes), item.sha256, 'External provenance drift: ' + item.id);
    }
    if (pins) {
        assert.equal(pins.length, byId.size, 'Evidence closure differs from committed policy');
        for (const pin of pins) {
            const actual = byId.get(pin.id);
            assert(
                actual && actual.bytes === pin.bytes && actual.sha256 === pin.sha256,
                'Evidence differs from committed pin',
            );
        }
    }
    return byId;
}
function verifyExternalBindings(lock, manifest, policy, sourceRoot, artifacts) {
    const evidence = new Map(lock.evidence.map((r) => [r.id, r]));
    const archive = read(evidence.get('archive-package-manifest').file);
    const archiveRows = new Map(archive.files.map((r) => [r.path, r]));
    for (const item of policy.external) {
        const original = archiveRows.get('source/' + item.path);
        assert(
            original && original.sha256 === item.sha256 && original.bytes === item.bytes,
            'External source not in original archive manifest: ' + item.path,
        );
    }
    const native = read(evidence.get('native-build-receipt').file);
    assert.equal(native.status, 'PASS');
    assert.equal(native.inputHashes.length, 79);
    for (const item of native.inputHashes) {
        assert.equal(
            sha(fs.readFileSync(inputFile(sourceRoot, item.path, lock.projection))),
            item.sha256,
            'Native original input drift: ' + item.path,
        );
    }
    if (artifacts) {
        for (const item of native.artifacts)
            assert.deepEqual(
                row(path.join(artifacts, 'physics/box3d/st'), item.path),
                item,
                'Runtime native artifact provenance mismatch',
            );
    }
    const build = read(evidence.get('runtime-build-result').file);
    assert.equal(build.exitCode, 0);
    assert.equal(build.head, lock.runtimeProducer);
    assert.equal(build.inputManifestSha256, lock.fullManifestSha256);
}
function verify(lock, artifacts, sourceRoot, fixtureRoot) {
    assert.equal(lock.schema, SCHEMA, 'Unsupported profile; no legacy downgrade');
    assert.equal(lock.status, 'FROZEN_INPUTS_NOT_TEST_RESULT');
    assert.equal(lock.node, process.version);
    assert.equal(lock.nodeSha256, sha(fs.readFileSync(process.execPath)));
    assert.equal(lock.sourceRoot, path.resolve(sourceRoot));
    assert.equal(lock.fixtureRoot, path.resolve(fixtureRoot));
    assert.equal(lock.fixtureVersion, 6);
    const manifestBytes = fs.readFileSync(path.join(artifacts, 'evidence/build/source-inputs.json'));
    assert.equal(sha(manifestBytes), lock.fullManifestSha256);
    const manifest = JSON.parse(manifestBytes);
    assert.equal(manifest.schema, 'box3d-branch-build-inputs-v1');
    assert.equal(manifest.remoteCommit, lock.runtimeProducer);
    assert.equal(manifest.remoteTree, lock.runtimeTree);
    assert.equal(manifest.files.length, 17696, 'Complete 223 manifest required');
    assert.equal(
        manifest.files.reduce((n, r) => n + r.bytes, 0),
        398202572,
    );
    assert.equal(manifest.files.filter((r) => 'symlinkTarget' in r).length, 56);
    assert.equal(lock.runtimeBuildNumber, 223);
    const build = read(path.join(artifacts, 'evidence/build/result.json'));
    assert.equal(build.exitCode, 0);
    assert.equal(build.head, lock.runtimeProducer);
    assert.equal(build.inputManifestSha256, lock.fullManifestSha256);
    assert.deepEqual(lock.source, manifest.files, 'Do not drop or normalize original manifest rows');
    verifyRows(sourceRoot, manifest.files, lock.projection);
    verifyRows(artifacts, lock.runtime);
    assert.deepEqual(lock.runtime, runtimeRows(artifacts), 'Complete runtime/ST closure required');
    const buildNumber = /const AIR_BUILD_NUMBER = (\d+);/.exec(
        fs.readFileSync(path.join(artifacts, 'cocosair.module.js'), 'utf8'),
    );
    assert.equal(Number(buildNumber?.[1]), lock.runtimeBuildNumber, 'Actual ESM build number mismatch');
    verifyRows(fixtureRoot, lock.fixture);
    assert.deepEqual(walk(fixtureRoot), lock.fixture, 'Fixture closure added/removed input');
    assert.deepEqual(
        walk(path.dirname(fixtureRoot)).map((r) => ({ ...r, path: lock.codeRepositoryPrefix + '/' + r.path })),
        lock.fixtureCode,
        'Code closure added/removed input',
    );
    assert.deepEqual(lock.cohortIdentity, identity(lock));
    const fixtureGit = gitRepository(lock.fixtureRepository, lock.regressionFixtureCommit, lock.fixtureTree);
    for (const item of lock.fixture)
        fixtureGit.verifyFile(lock.fixtureRepository, relative(lock.fixtureRepositoryPrefix + '/' + item.path));
    // Check copied fixture against the actual committed bytes, not only both hashes independently.
    for (const item of lock.fixture)
        assert.equal(
            sha(fs.readFileSync(path.join(lock.fixtureRepository, lock.fixtureRepositoryPrefix, item.path))),
            item.sha256,
        );
    verifyRows(lock.fixtureRepository, lock.fixtureCode);
    for (const item of lock.fixtureCode) fixtureGit.verifyFile(lock.fixtureRepository, item.path);
    verifyAuxiliary(lock, fixtureGit);
    verifyEvidence(lock.evidence);
    const admission = lock.evidence.find((r) => r.id === 'build-admission');
    assert(admission);
    const admissionData = read(admission.file);
    assert.equal(admissionData.inputManifestSha256, lock.fullManifestSha256);
    assert.equal(admissionData.remoteCommit, lock.runtimeProducer);
    const policyFile = path.join(lock.fixtureRepository, relative(lock.policy.path));
    assert.equal(sha(fs.readFileSync(policyFile)), lock.policy.sha256);
    fixtureGit.verifyFile(lock.fixtureRepository, lock.policy.path);
    const policy = read(policyFile);
    verifyEvidence(lock.evidence, policy.evidence);
    verifyExternalBindings(lock, manifest, policy, sourceRoot, artifacts);
    verifyProvenance(lock, manifest, sourceRoot, policy);
    for (const name of [
        'src/air/physics/box3d/point-to-point-constraint.ts',
        'src/air/physics/box3d/shared-body.ts',
        'src/air/physics/box3d/world.ts',
        'src/air/physics/box3d/world-command-owner.ts',
        'src/air/physics/box3d/registration.ts',
        'src/cocos/physics/cannon/constraints/cannon-point-to-point-constraint.ts',
        'src/air/physics/box3d/binding/facade.mjs',
        'src/air/physics/box3d/world-binding.ts',
        'src/cocos/physics/framework/components/constraints/point-to-point-constraint.ts',
        'src/cocos/physics/framework/constraint-state-control.ts',
        'src/air/box3d-controls.ts',
        'src/air/index.ts',
    ])
        assert(
            manifest.files.some((r) => r.path === name),
            'Original P2P production input missing',
        );
    const schema = read(path.join(sourceRoot, 'tools/physics/box3d/abi-schema.json'));
    assert.equal(schema.pointToPointJointBridge?.geometryFloats, 6);
    assert.equal(schema.pointToPointJointBridge?.stateWords, 25);
    const exports = read(path.join(sourceRoot, 'tools/physics/box3d/exports.json'));
    const facade = fs.readFileSync(path.join(sourceRoot, 'src/air/physics/box3d/binding/facade.mjs'), 'utf8');
    for (const name of ['air_b3_p2p_create', 'air_b3_p2p_configure', 'air_b3_p2p_state'])
        assert(exports.includes('_' + name));
    for (const name of ['createPointToPointJoint', 'configurePointToPointJoint', 'pointToPointJointState'])
        assert(facade.includes(name + '('));
    const wasmExports = new Set(
        WebAssembly.Module.exports(
            new WebAssembly.Module(fs.readFileSync(path.join(artifacts, 'physics/box3d/st/box3d-st.wasm'))),
        ).map((r) => r.name.replace(/^_/, '')),
    );
    for (const name of ['air_b3_p2p_create', 'air_b3_p2p_configure', 'air_b3_p2p_state'])
        assert(wasmExports.has(name), 'Missing real P2P WASM ABI');
    return lock;
}
module.exports = {
    SCHEMA,
    DOC,
    sha,
    gitHash,
    row,
    relative,
    verifyRows,
    inputFile,
    gitRepository,
    identity,
    verifyProvenance,
    verifyAuxiliary,
    verifyEvidence,
    verifyExternalBindings,
    verify,
};
