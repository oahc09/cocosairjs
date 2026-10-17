/* Verify the explicit submission scope and evidence transport. No Git mutations or runtime builds.
 * Default: read-only. --export=<new output directory> copies evidence and delivery controls only.
 * --root=<directory> --evidence-only verifies that transport without a checkout, SDK, or browser.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const assert = require('node:assert/strict');
const MANIFEST = 'docs/evidence/webgpu-submission/manifest.json';
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function regular(root, relative) {
    assert.equal(typeof relative, 'string', 'invalid file path');
    assert.ok(relative && !relative.includes('\\') && !relative.includes('\0'), `nonportable path: ${relative}`);
    assert.ok(
        !path.posix.isAbsolute(relative) && !relative.split('/').some((part) => ['..', '.', ''].includes(part)),
        `unsafe path: ${relative}`,
    );
    const absolute = path.resolve(root, relative);
    assert.ok(absolute.startsWith(root + path.sep), `path escapes root: ${relative}`);
    assert.ok(
        fs.lstatSync(absolute).isFile() && fs.realpathSync(absolute) === absolute,
        `nonregular path: ${relative}`,
    );
    return fs.readFileSync(absolute);
}
function verify(root, manifest, evidenceOnly = false) {
    assert.equal(manifest.schema, 'cocos-air.webgpu-submission/v1');
    assert.equal(manifest.releaseReady, false);
    assert.equal(manifest.blockers.api, 'BLOCKED_LINUX_ENVIRONMENT');
    assert.equal(manifest.blockers.safari, 'NOT_RUN_EXTERNAL');
    const files = new Map();
    for (const row of manifest.files) {
        assert.ok(!files.has(row.path), `duplicate path: ${row.path}`);
        assert.ok(
            /^[a-f0-9]{64}$/.test(row.sha256) && Number.isSafeInteger(row.bytes) && row.bytes >= 0,
            `invalid digest: ${row.path}`,
        );
        files.set(row.path, row);
    }
    for (const paths of Object.values(manifest.profiles)) {
        assert.equal(new Set(paths).size, paths.length, 'duplicate profile entry');
        for (const file of paths) assert.ok(files.has(file), `profile path not inventoried: ${file}`);
    }
    const held = new Set([
        ...manifest.profiles.parallel,
        ...manifest.profiles.parallelExamples,
        ...manifest.profiles.parallelDocumentation,
        ...manifest.profiles.generated,
        ...manifest.profiles.evidence,
    ]);
    for (const file of manifest.profiles.webgpuSource)
        assert.ok(!held.has(file), `WebGPU source profile includes held file: ${file}`);
    assert.deepEqual([...manifest.generatedDependencies.parallelSource].sort(), [...manifest.profiles.parallel].sort());
    assert.equal(manifest.generatedDependencies.state, 'HOLD_UNTIL_PARALLEL_SOURCE_DELIVERED_OR_ISOLATED_REBUILD');
    for (const file of manifest.transportReports) {
        assert.ok(
            /^docs\/(api-coverage-report|example-api-inventory|test-inventory)\.json$/.test(file),
            'unexpected transport report',
        );
        assert.ok(files.has(file), `transport report not inventoried: ${file}`);
        const copy = manifest.reportCopies[file];
        assert.equal(copy, `docs/evidence/webgpu-submission/reports/${path.posix.basename(file)}`);
        assert.ok(manifest.profiles.evidence.includes(copy), `report snapshot not delivered: ${file}`);
        assert.equal(files.get(copy)?.sha256, files.get(file).sha256, `report snapshot mismatch: ${file}`);
        assert.equal(files.get(copy)?.bytes, files.get(file).bytes, `report snapshot size mismatch: ${file}`);
    }
    const selected = evidenceOnly
        ? new Set([...manifest.profiles.evidence, ...manifest.profiles.controls])
        : new Set(files.keys());
    for (const file of selected) {
        const row = files.get(file);
        const bytes = regular(root, file);
        assert.equal(bytes.length, row.bytes, `size mismatch: ${file}`);
        assert.equal(sha(bytes), row.sha256, `hash mismatch: ${file}`);
    }
    let archiveReferences = 0;
    for (const file of manifest.archives) {
        assert.ok(selected.has(file), `archive manifest not delivered: ${file}`);
        const archive = JSON.parse(regular(root, file));
        for (const [relative, expected] of Object.entries(archive.files)) {
            const member = path.posix.join(path.posix.dirname(file), relative);
            assert.ok(selected.has(member), `archive reference not delivered: ${member}`);
            const row = files.get(member);
            assert.equal(
                row.sha256,
                typeof expected === 'string' ? expected : expected.sha256,
                `archive hash mismatch: ${member}`,
            );
            if (expected.bytes !== undefined)
                assert.equal(row.bytes, expected.bytes, `archive size mismatch: ${member}`);
            archiveReferences++;
        }
    }
    const release = JSON.parse(regular(root, manifest.currentReport));
    assert.equal(release.candidateFingerprint, manifest.candidate.fingerprint);
    assert.equal(release.sourceSha256, manifest.candidate.sourceSha256);
    assert.equal(release.releaseReady, false);
    for (const [file, hash] of Object.entries(release.evidenceSha256)) {
        const delivered = manifest.reportCopies[file] || file;
        assert.ok(selected.has(delivered), `current evidence not delivered: ${file}`);
        assert.equal(files.get(delivered).sha256, hash, `current evidence binding mismatch: ${file}`);
    }
    const matrix = JSON.parse(regular(root, 'docs/evidence/browser-matrix/browser-matrix.json'));
    assert.equal(matrix.completed, true);
    assert.equal(matrix.subset, false);
    assert.equal(matrix.runTotal, 78);
    assert.equal(matrix.runPass, matrix.runTotal);
    let pngs = 0;
    for (const row of matrix.records) {
        assert.equal(row.result, 'PASS');
        for (const key of ['png', 'pngBefore']) {
            if (!row[key]) continue;
            const file = row[key].replace(/\\/g, '/');
            assert.ok(selected.has(file), `matrix PNG not delivered: ${file}`);
            assert.equal(files.get(file).sha256.slice(0, 16), row[key + 'Sha256_16']);
            assert.equal(files.get(file).bytes, row[key + 'Bytes']);
            pngs++;
        }
    }
    const devtools = JSON.parse(regular(root, 'docs/evidence/devtools-examples.json'));
    for (const row of devtools.examples) {
        assert.ok(selected.has(row.artifact.path), `DevTools PNG not delivered: ${row.id}`);
        assert.equal(files.get(row.artifact.path).sha256.slice(0, 16), row.artifact.hash);
        assert.equal(files.get(row.artifact.path).bytes, row.artifact.bytes);
    }
    let ignored = [];
    if (!evidenceOnly) {
        const git = (...args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
        assert.equal(path.resolve(git('rev-parse', '--show-toplevel')), root, 'not the declared checkout');
        assert.equal(git('rev-parse', 'HEAD'), manifest.baseHead, 'base HEAD changed');
        const checked = cp.spawnSync('git', ['check-ignore', '--stdin', '-z'], {
            cwd: root,
            encoding: 'utf8',
            input: [...selected].join('\0') + '\0',
        });
        assert.ok([0, 1].includes(checked.status), checked.stderr);
        ignored = checked.stdout.split('\0').filter(Boolean);
        assert.deepEqual(ignored, [], 'delivery files are ignored by Git');
        const campaign = require(path.join(root, 'tools/verify/example-evidence-campaign.cjs'));
        const currentInputs = campaign.collectInputs(root);
        assert.equal(campaign.objectDigest(currentInputs), manifest.workspace.inputDigest, 'workspace inputs changed');
        const original = JSON.parse(regular(root, manifest.candidate.inputsRecord));
        const before = new Map(original.inputs.map((row) => [row.path, row]));
        const after = new Map(currentInputs.map((row) => [row.path, row]));
        const drift = [...new Set([...before.keys(), ...after.keys()])]
            .sort()
            .filter((file) => JSON.stringify(before.get(file)) !== JSON.stringify(after.get(file)))
            .map((file) => ({
                path: file,
                before: before.get(file) || null,
                after: after.get(file) || null,
            }));
        assert.deepEqual(drift, manifest.workspace.inputDrift, 'unrecorded input drift');
        assert.equal(manifest.workspace.evidenceFresh, drift.length === 0);
        assert.deepEqual(
            drift.map((row) => row.path),
            [...manifest.profiles.parallelExamples].sort(),
            'drift is outside held parallel examples',
        );
        assert.equal(
            require(path.join(root, 'tools/verify/api-trace.cjs')).candidateFingerprint(root),
            manifest.workspace.fingerprint,
        );
        assert.equal(
            require(path.join(root, 'tools/verify/webgpu-candidate.cjs')).sourceFingerprint(root),
            manifest.workspace.sourceSha256,
        );
        assert.equal(JSON.parse(regular(root, 'package.json')).version, manifest.version);
        assert.equal(JSON.parse(regular(root, 'tools/build/build-number.json')).lastBuildNumber, manifest.buildCounter);
    }
    return {
        schema: manifest.schema,
        mode: evidenceOnly ? 'evidence-transport' : 'checkout',
        verifiedFiles: selected.size,
        archiveReferences,
        matrixPngs: pngs,
        devtoolsPngs: devtools.examples.length,
        ignoredFiles: ignored.length,
        sourceProfile: manifest.profiles.webgpuSource.length,
        heldParallel: manifest.profiles.parallel.length,
        heldParallelExamples: manifest.profiles.parallelExamples.length,
        heldParallelDocumentation: manifest.profiles.parallelDocumentation.length,
        heldGenerated: manifest.profiles.generated.length,
        evidenceFreshForWorkspace: manifest.workspace.evidenceFresh,
        releaseReady: false,
        blockers: manifest.blockers,
    };
}
function main() {
    const args = process.argv.slice(2);
    assert.ok(
        args.every((arg) => arg === '--evidence-only' || /^(--root|--export|--manifest)=.+/.test(arg)),
        'unknown argument',
    );
    const option = (name) => args.find((arg) => arg.startsWith(name + '='))?.slice(name.length + 1);
    const root = path.resolve(option('--root') || path.join(__dirname, '../..'));
    const manifestFile = path.resolve(root, option('--manifest') || MANIFEST);
    const manifest = JSON.parse(fs.readFileSync(manifestFile));
    const evidenceOnly = args.includes('--evidence-only');
    const result = verify(root, manifest, evidenceOnly);
    if (option('--export')) {
        assert.ok(!evidenceOnly && !option('--manifest'), 'export uses the checkout default manifest');
        const destination = path.resolve(root, option('--export'));
        assert.ok(
            destination.startsWith(path.join(root, 'output') + path.sep),
            'export must be a new directory under output',
        );
        assert.ok(!fs.existsSync(destination), 'export destination already exists');
        // Make the transport only after the complete checkout verification succeeds.
        fs.mkdirSync(destination, { recursive: true });
        for (const file of new Set([...manifest.profiles.evidence, ...manifest.profiles.controls, MANIFEST])) {
            const bytes = regular(root, file);
            fs.mkdirSync(path.dirname(path.join(destination, file)), { recursive: true });
            fs.writeFileSync(path.join(destination, file), bytes, { flag: 'wx' });
        }
        result.transport = verify(destination, manifest, true);
        result.exportedTo = path.relative(root, destination).split(path.sep).join('/');
    }
    console.log(JSON.stringify(result, null, 2));
}
module.exports = { verify };
if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
