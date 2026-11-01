/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { gitBlobs, dependencyFiles } = require('./capture.cjs');
const ROOT = path.resolve(__dirname, '../../../..');
const FIXTURE = path.join(__dirname, 'cases/cohort-v1');
const CASES = path.join(__dirname, 'cases');
const fixtureBase = (lock) => (lock.fixtureVersion >= 2 ? CASES : FIXTURE);
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(file));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
function row(base, name) {
    assert(!path.isAbsolute(name) && !name.split('/').includes('..'));
    const bytes = fs.readFileSync(path.join(base, name));
    return { path: name, bytes: bytes.length, sha256: sha(bytes) };
}
function walk(base, dir = '') {
    return fs
        .readdirSync(path.join(base, dir), { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap((entry) => {
            const name = dir ? dir + '/' + entry.name : entry.name;
            assert(!entry.isSymbolicLink(), 'No symlinked fixture inputs');
            return entry.isDirectory() ? walk(base, name) : [row(base, name)];
        });
}
function fixtureRows(version) {
    if (version === 1) return walk(FIXTURE);
    return walk(CASES).filter((row) => {
        const match = /^cohort-v(\d+)\//.exec(row.path);
        return match && Number(match[1]) <= version;
    });
}
const manifestInputs = require('./manifest-inputs.cjs');
const identity = manifestInputs.identity;
function verify(lockFile, artifacts, sourceRoot) {
    const lock = read(lockFile);
    manifestInputs.verify(lock, artifacts, sourceRoot, CASES);
    assert.deepEqual(fixtureRows(6), lock.fixture, 'Fixture directory closure changed');
    const code = walk(__dirname).map((r) => ({ ...r, path: lock.codeRepositoryPrefix + '/' + r.path }));
    assert.deepEqual(code, lock.fixtureCode, 'Entire regression code closure changed');
    return lock;
}
function freezeCohort(configFile, newLockFile) {
    const config = read(configFile);
    assert.equal(config.schema, 'box3d-manifest-cohort-freeze-config-v2');
    const artifacts = path.resolve(config.artifacts),
        sourceRoot = fs.realpathSync(config.sourceRoot);
    const manifestBytes = fs.readFileSync(path.join(artifacts, 'evidence/build/source-inputs.json'));
    const manifest = JSON.parse(manifestBytes);
    const fixtureRepository = fs.realpathSync(config.fixtureRepository);
    const evidence = config.evidence.map(({ id, file }) => {
        file = fs.realpathSync(file);
        const bytes = fs.readFileSync(file);
        return { id, file, bytes: bytes.length, sha256: sha(bytes) };
    });
    const codeRepositoryPrefix = config.codeRepositoryPrefix;
    manifestInputs.relative(codeRepositoryPrefix);
    const runtimeNames = [
        'cocosair.module.js',
        'cocosair.module.js.map',
        'evidence/build/result.json',
        'evidence/build/source-inputs.json',
    ];
    const runtime = [
        ...runtimeNames.map((name) => row(artifacts, name)),
        ...walk(path.join(artifacts, 'physics/box3d/st')).map((r) => ({ ...r, path: 'physics/box3d/st/' + r.path })),
    ].sort((a, b) => a.path.localeCompare(b.path));
    const lock = {
        schema: manifestInputs.SCHEMA,
        status: 'FROZEN_INPUTS_NOT_TEST_RESULT',
        node: process.version,
        nodeSha256: sha(fs.readFileSync(process.execPath)),
        runtimeProducer: config.runtimeProducer,
        runtimeTree: config.runtimeTree,
        runtimeBuildNumber: 223,
        runtimeRepository: fs.realpathSync(config.runtimeRepository),
        regressionFixtureCommit: config.regressionFixtureCommit,
        fixtureTree: config.fixtureTree,
        fixtureRepository,
        codeRepositoryPrefix,
        fixtureRepositoryPrefix: codeRepositoryPrefix + '/cases',
        fixtureRoot: CASES,
        sourceRoot,
        fixtureVersion: 6,
        projection: config.projection ?? [],
        source: manifest.files,
        fullManifestSha256: sha(manifestBytes),
        runtime,
        fixture: fixtureRows(6),
        fixtureCode: walk(__dirname).map((r) => ({ ...r, path: codeRepositoryPrefix + '/' + r.path })),
        auxiliary: [manifestInputs.row(fixtureRepository, manifestInputs.DOC)],
        provenance: read(config.provenanceFile),
        evidence,
        policy: {
            path: config.policyPath,
            sha256: sha(fs.readFileSync(path.join(fixtureRepository, config.policyPath))),
        },
        sourceAcquisition:
            'Complete original prebuild manifest projection; exact runtime Git objects, installed dependency bytes, and explicitly admitted external inputs. Fixture/docs use a separate real commit. No original history restoration claimed.',
        scope: 'Same frozen production snapshot; Node/JSDOM ST supplemental consumers; no formal cell or Gate credit.',
    };
    lock.cohortIdentity = identity(lock);
    manifestInputs.verify(lock, artifacts, sourceRoot, CASES);
    write(newLockFile, lock);
    verify(newLockFile, artifacts, sourceRoot);
    return lock;
}
function prepareCohort(entry, options) {
    const artifacts = path.resolve(options.artifacts),
        lockFile = path.resolve(options.lock),
        sourceRoot = path.resolve(options.sourceRoot);
    const lock = verify(lockFile, artifacts, sourceRoot);
    const env = {
        BOX3D_COHORT_LOCK: lockFile,
        BOX3D_COHORT_SOURCE_ROOT: sourceRoot,
        ...(entry.contactFamily ? { CONTACT_FAMILY: entry.contactFamily } : {}),
    };
    if (entry.family === 'query')
        assert(
            lock.runtimeBuildNumber >= (lock.fixtureVersion >= 3 ? 219 : 218) &&
                [2, 3, 4, 5, 6].includes(lock.fixtureVersion),
            'Production query consumer requires new218+ v2 fixture closure',
        );
    const consumer =
        entry.family === 'query'
            ? path.join(CASES, `cohort-v${Math.min(lock.fixtureVersion, 3)}/query/consumer.mjs`)
            : entry.family === 'trigger'
              ? path.join(CASES, 'cohort-v4/trigger/consumer.mjs')
              : entry.family === 'sku'
                ? path.join(CASES, `cohort-v${lock.fixtureVersion}/sku/consumer.mjs`)
                : path.join(FIXTURE, entry.family, 'consumer.mjs');
    if (entry.family === 'trigger')
        assert(
            lock.fixtureVersion >= 4 && lock.runtimeBuildNumber >= 220,
            'Trigger requires production220+ v4 closure',
        );
    if (entry.family === 'sku')
        assert(lock.fixtureVersion >= 5 && lock.runtimeBuildNumber >= 220, 'SKU requires production220+ v5 closure');
    const args = ['trigger', 'sku'].includes(entry.family)
        ? [consumer, artifacts, '$OUTPUT', lockFile, entry.mode]
        : ['collision', 'contact', 'query'].includes(entry.family)
          ? [consumer, artifacts, '$OUTPUT']
          : [consumer, artifacts, lockFile, '$OUTPUT', entry.mode];
    const files = [
        __filename,
        require.resolve('./manifest-inputs.cjs'),
        lockFile,
        ...lock.evidence.map((r) => r.file),
        ...lock.fixtureCode.map((r) => path.join(lock.fixtureRepository, r.path)),
        ...lock.auxiliary.map((r) => path.join(lock.fixtureRepository, r.path)),
        path.join(lock.fixtureRepository, lock.policy.path),
        ...lock.runtime.map((r) => path.join(artifacts, r.path)),
        ...lock.source.map((r) => manifestInputs.inputFile(sourceRoot, r.path, lock.projection)),
        ...lock.fixture.map((r) => path.join(fixtureBase(lock), r.path)),
        ...dependencyFiles(sourceRoot),
    ];
    return { args, env, files, cohortIdentity: lock.cohortIdentity, fixtureVersion: lock.fixtureVersion };
}
function assertOneCohort(identities, required) {
    if (!required) return;
    assert(
        identities.length > 0 && identities.every(Boolean),
        'Same-build batch requires a cohort identity for every case',
    );
    for (const value of identities)
        assert.deepEqual(value, identities[0], 'Mixed production builds cannot form one same-build cohort');
}
module.exports = { freezeCohort, prepareCohort, assertOneCohort, verify, identity };
