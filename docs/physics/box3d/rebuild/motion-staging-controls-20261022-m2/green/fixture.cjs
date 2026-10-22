/* Read-only native inputs; writes isolated temporary distribution/negative fixtures in output/.
 * Byte/provenance tests and one real Node staged-loader cycle, not browser/package acceptance.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createRetainedFixtures } = require('./retained-negative-fixture.cjs');
const { verifySTBuild, stageBox3DAssets, box3DAssetsPlugin } = require('../../build/box3d-assets.cjs');
const root = path.resolve(__dirname, '../../..');
assert(process.env.BOX3D_ST_TEST_BUILD, 'Set BOX3D_ST_TEST_BUILD to a fresh audited actual ST output');
const source = path.resolve(process.env.BOX3D_ST_TEST_BUILD);
const base = path.join(root, 'output');
fs.mkdirSync(base, { recursive: true });
const output = fs.mkdtempSync(path.join(base, 'box3d-motion-assets-tests-'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJSON = (directory, name) => JSON.parse(fs.readFileSync(path.join(directory, name)));
const writeJSON = (directory, name, value) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value));
function rehashAuditEvidence(directory, name) {
    const audit = readJSON(directory, 'artifact-audit.raw.json');
    const row = audit.evidence.find((item) => item.path === name);
    assert(row, `Required qualification evidence is missing: ${name}`);
    const bytes = fs.readFileSync(path.join(directory, name));
    Object.assign(row, { bytes: bytes.length, sha256: hash(bytes) });
    writeJSON(directory, 'artifact-audit.raw.json', audit);
}
const fixtureFiles = fs.readdirSync(source).filter((name) => fs.lstatSync(path.join(source, name)).isFile());
fixtureFiles.push('CMakeFiles/air_box3d.dir/link.txt');
const fixtures = createRetainedFixtures({
    source,
    output: path.join(output, 'negative-fixtures'),
    files: fixtureFiles,
});
console.log('Retained asset test output: ' + output);
function runRejection(name, directory, retained, phase) {
    const target = path.join(output, `${name}-${phase}-rejected`);
    const args = [path.join(__dirname, 'verify-assets-negative-case.cjs'), directory, target];
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    fs.writeFileSync(path.join(retained, phase + '.stdout.raw.txt'), result.stdout ?? '');
    fs.writeFileSync(path.join(retained, phase + '.stderr.raw.txt'), result.stderr ?? '');
    writeJSON(retained, phase + '.command.json', {
        command: [process.execPath, ...args],
        cwd: root,
        exitCode: result.status,
        signal: result.signal,
        error: result.error ? String(result.error) : null,
        nodeVersion: process.version,
        gate: {
            path: 'tools/build/box3d-assets.cjs',
            sha256: hash(fs.readFileSync(path.join(root, 'tools/build/box3d-assets.cjs'))),
        },
        collector: {
            path: 'tools/verify/box3d/verify-assets-negative-case.cjs',
            sha256: hash(fs.readFileSync(args[0])),
        },
    });
    assert.equal(result.status, 0, `${name}/${phase}: ${result.stderr}`);
    const observed = JSON.parse(result.stdout);
    assert.equal(observed.status, 'EXPECTED_REJECTION_NO_OUTPUT');
    assert.equal(observed.targetAbsent, true);
    assert.equal(fs.existsSync(target), false);
    return {
        exitCode: result.status,
        rejection: {
            name: observed.error.name,
            code: observed.error.code,
            message: observed.error.message.split(directory).join('<fixture>').split(target).join('<target>'),
        },
    };
}
test('motion qualification mutations reject before writing and reconstruct exactly', async () => {
    await verifySTBuild(source);
    const rawMutation = (label, file, mutate) => [
        label,
        (directory) => {
            const value = readJSON(directory, file);
            mutate(value);
            writeJSON(directory, file, value);
            rehashAuditEvidence(directory, file);
        },
    ];
    const mutations = [
        ...[
            'actualFastRotationFlag',
            'batchPreflightNoPartialMutation',
            'capacityOverlapLockedCanaries',
            'strictQuaternionAndOverflow',
            'disabledResetForcePreserve',
            'tinyTargetWakeAndStationaryCap',
            'postResetCOMTarget',
            'worldAxisLockAndCaps',
            'fullGenerationWorld',
            'scratchTrackedAndCleanup',
            'substepDomain',
            'emptyNoOutputWrite',
            'coreBytesRestored',
        ].map((key) =>
            rawMutation('native-motion-missing-' + key, 'native-motion-contract.raw.json', (value) => {
                delete value[key];
            }),
        ),
        rawMutation('native-motion-status', 'native-motion-contract.raw.json', (value) => {
            value.status = 'FAIL';
        }),
        rawMutation('native-motion-pointer', 'native-motion-contract.raw.json', (value) => {
            value.pointerBytes = 8;
        }),
        rawMutation('motion-status', 'wasm-motion-contract.raw.json', (value) => {
            value.status = 'FAIL';
        }),
        rawMutation('motion-fixture', 'wasm-motion-contract.raw.json', (value) => {
            value.fixtureSha256 = '0'.repeat(64);
        }),
        rawMutation('motion-schema', 'wasm-motion-contract.raw.json', (value) => {
            value.identity.schemaSha256 = '0'.repeat(64);
        }),
        ...[
            'admissionAndEmptyValidate',
            'lockAndCapRejection',
            'teleportOptionsCOMAndForces',
            'mergedResetTargetAndClear',
            'immutableCopiesAndHeapGrowth',
            'fullId128Cycles',
            'independentDampedTargetGrid',
            'modeledShortfallNotTeleport',
            'realContactAndSensorTiming',
            'mutationPhasesNoReplay',
            'cleanup',
        ].map((key) =>
            rawMutation('motion-missing-' + key, 'wasm-motion-contract.raw.json', (value) => {
                delete value.checks[key];
            }),
        ),
        rawMutation('motion-sample-count', 'wasm-motion-contract.raw.json', (value) => {
            value.sampleCount--;
        }),
        rawMutation('motion-sample-records', 'wasm-motion-contract.raw.json', (value) => {
            value.samplesArtifact.records--;
        }),
        rawMutation('motion-sample-bytes', 'wasm-motion-contract.raw.json', (value) => {
            value.samplesArtifact.bytes--;
        }),
        rawMutation('motion-sample-hash', 'wasm-motion-contract.raw.json', (value) => {
            value.samplesArtifact.sha256 = '0'.repeat(64);
        }),
        [
            'motion-sample-truncated-rehashed',
            (directory) => {
                const name = 'motion-samples.raw.jsonl',
                    file = path.join(directory, name);
                const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
                lines.pop();
                const bytes = Buffer.from(lines.join('\n') + '\n');
                fs.writeFileSync(file, bytes);
                rehashAuditEvidence(directory, name);
                const raw = readJSON(directory, 'wasm-motion-contract.raw.json');
                Object.assign(raw.samplesArtifact, { bytes: bytes.length, sha256: hash(bytes) });
                writeJSON(directory, 'wasm-motion-contract.raw.json', raw);
                rehashAuditEvidence(directory, 'wasm-motion-contract.raw.json');
            },
        ],
        rawMutation('motion-grid-missing', 'wasm-motion-contract.raw.json', (value) => {
            value.observations.grid.pop();
        }),
        rawMutation('motion-grid-budget', 'wasm-motion-contract.raw.json', (value) => {
            value.observations.grid[0].max.origin = 0.1;
        }),
        rawMutation('motion-grid-not-number', 'wasm-motion-contract.raw.json', (value) => {
            value.observations.grid[0].max.angle = null;
        }),
        rawMutation('motion-grid-ticks', 'wasm-motion-contract.raw.json', (value) => {
            value.observations.grid[0].ticks--;
        }),
        ...['motion_bridge.c', 'motion_contract.c'].map((name) => [
            'motion-compile-missing-' + name,
            (directory) => {
                const audit = readJSON(directory, 'artifact-audit.raw.json');
                const index = audit.compiledSourceHashes.findIndex((row) => row.path.endsWith('/' + name));
                assert(index >= 0);
                audit.compiledSourceHashes[index] = audit.compiledSourceHashes[0];
                writeJSON(directory, 'artifact-audit.raw.json', audit);
            },
        ]),
        [
            'motion-audit-missing',
            (directory) => {
                const audit = readJSON(directory, 'artifact-audit.raw.json');
                const index = audit.evidence.findIndex((row) => row.path === 'wasm-motion-contract.raw.json');
                assert(index >= 0);
                audit.evidence.splice(index, 1);
                writeJSON(directory, 'artifact-audit.raw.json', audit);
            },
        ],
    ];
    assert.equal(mutations.length, 41);
    writeJSON(output, 'motion-rejection-inventory.json', {
        status: 'RUNNING',
        planned: mutations.map(([name]) => name),
    });
    for (const [name, mutate] of mutations) {
        const directory = fixtures.create(name);
        mutate(directory);
        const { replay, retained } = fixtures.retainAndReconstruct(name);
        const original = runRejection(name, directory, retained, 'original');
        const reconstructed = runRejection(name, replay, retained, 'replay');
        assert.deepEqual(reconstructed.rejection, original.rejection);
        fixtures.retire(name, {
            sameExpectedRejection: true,
            originalExitCode: original.exitCode,
            replayExitCode: reconstructed.exitCode,
            rejection: original.rejection,
            rawFilesRetained: [
                'original.stdout.raw.txt',
                'original.stderr.raw.txt',
                'original.command.json',
                'replay.stdout.raw.txt',
                'replay.stderr.raw.txt',
                'replay.command.json',
            ],
        });
    }
    writeJSON(output, 'motion-rejection-inventory.json', {
        status: 'PASS_ALL_41_RECONSTRUCTED_AND_REPEAT_REJECTED',
        completed: mutations.map(([name]) => name),
    });
});
