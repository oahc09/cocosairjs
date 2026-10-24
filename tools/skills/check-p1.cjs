#!/usr/bin/env node
'use strict';

// Deterministic P1 CI orchestration. Writes only below an explicit, new --out.
// Retained real reading events are inputs; this tool never collects or synthesizes them.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '../..');
const SOURCE_COMMIT = '66d11fd0c3c189b7dfa6d20645222e237352f9f3';
const ORIGINAL_HASH = '1e9c6637a512b819e822d8d06ea64d444c1e5640f35c48134f70fe80a5363e19';
const PREREQUISITE_HASH = '46a9449ad54586ae70a914a77992801ea732270ab7f14509f40bf3792ee22d9d';
const RECOVERY = 'ai/plans/skills-token-evidence/recovery';
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function inside(root, target) {
    const relative = path.relative(root, target);
    return (
        relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
    );
}

function noSymlinks(filename, allowMissing = false) {
    const absolute = path.resolve(filename);
    let cursor = path.parse(absolute).root;
    for (const part of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part);
        try {
            assert(!fs.lstatSync(cursor).isSymbolicLink(), `Symlink is not permitted: ${cursor}`);
        } catch (error) {
            if (allowMissing && error.code === 'ENOENT') return;
            throw error;
        }
    }
}

function readFile(filename) {
    noSymlinks(filename);
    assert(fs.lstatSync(filename).isFile(), `Not a regular file: ${filename}`);
    return fs.readFileSync(filename);
}

function validateOutput(out, tempRoot, protectedRoots) {
    assert(typeof out === 'string' && out.length > 0, 'Explicit --out is required');
    assert(path.isAbsolute(out), '--out must be absolute');
    const result = path.resolve(out);
    const temporary = path.resolve(tempRoot);
    noSymlinks(result, true);
    noSymlinks(temporary);
    assert(
        result !== temporary && inside(temporary, result),
        '--out must be below RUNNER_TEMP or the OS temporary directory',
    );
    assert(!fs.existsSync(result), '--out must be a new, nonexistent directory');
    assert(fs.lstatSync(path.dirname(result)).isDirectory(), '--out parent must already exist');
    for (const root of protectedRoots.map((value) => path.resolve(value))) {
        assert(
            !inside(root, result) && !inside(result, root),
            '--out must be isolated from sources and working directory',
        );
    }
    return result;
}

function parseArgs(argv) {
    const result = {};
    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];
        assert(['--source', '--out', '--candidate-loads'].includes(argument), `Unknown option: ${argument}`);
        const key = argument.slice(2);
        assert(!Object.hasOwn(result, key), `Duplicate option: ${argument}`);
        assert(argv[index + 1] && !argv[index + 1].startsWith('--'), `Missing value: ${argument}`);
        result[key] = argv[++index];
    }
    assert(result.source, '--source is required: use the immutable original Git checkout');
    assert(result.out, 'Explicit --out is required');
    return result;
}

function candidateLoadPath(repoRoot, override) {
    const relative = override === undefined ? `${RECOVERY}/reading-candidate-B1/events.jsonl` : override;
    assert(typeof relative === 'string' && !path.isAbsolute(relative), 'Candidate loads must be repository-relative');
    const target = path.resolve(repoRoot, relative);
    const evidenceRoot = path.resolve(repoRoot, 'ai/plans/skills-token-evidence');
    assert(
        target !== evidenceRoot && inside(evidenceRoot, target),
        'Candidate loads must stay within skills-token-evidence',
    );
    assert(target.endsWith('.jsonl'), 'Candidate loads must be a JSONL evidence file');
    return target;
}

function validateManifestIdentity(manifest, expectedHash) {
    assert.equal(manifest.schema, 1, 'Unsupported snapshot manifest');
    assert.equal(manifest.base_commit, SOURCE_COMMIT, 'Original Git commit differs');
    assert.equal(manifest.snapshot_hash, expectedHash, 'Frozen snapshot identity differs');
    assert(Array.isArray(manifest.files) && manifest.files.length > 0, 'Snapshot file list is missing');
    assert.equal(sha256(JSON.stringify(manifest.files)), expectedHash, 'Frozen snapshot file list differs');
}

function exactReplacement(bytes, change) {
    assert.equal(sha256(bytes), change.before_sha256, `Prerequisite original hash differs: ${change.path}`);
    const text = bytes.toString('utf8');
    assert(Buffer.from(text).equals(bytes), 'Prerequisite input must be valid UTF-8');
    assert(typeof change.from === 'string' && change.from.length > 0, 'Prerequisite replacement must be nonempty');
    assert.equal(text.split(change.from).length, 2, `Prerequisite replacement must occur exactly once: ${change.path}`);
    return text.replace(change.from, change.to);
}

function validateB1Log(filename) {
    const records = readFile(filename)
        .toString('utf8')
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map(JSON.parse);
    assert.equal(records.length, 1, 'B1 requires exactly one retained attempt; retries require review');
    assert.equal(records[0].scenario_id, 'B1', 'P1 benefit evidence must be the real B1 scenario');
    assert.equal(records[0].complete, true, 'B1 evidence is incomplete');
    assert.equal(records[0].outcome, 'success', 'B1 evidence did not succeed');
}

function changedFormatFiles(original, candidate) {
    const before = new Map(original.map((file) => [file.path, file.sha256]));
    return candidate
        .filter((file) => before.get(file.path) !== file.sha256 && /\.(?:md|json|cjs)$/.test(file.path))
        .map((file) => file.path);
}

function writeNew(root, relative, bytes) {
    assert(typeof relative === 'string' && !relative.includes('\\') && !relative.includes('\0'), 'Unsafe output path');
    assert(
        relative.split('/').every((part) => part && part !== '.' && part !== '..'),
        'Unsafe output path',
    );
    const target = path.resolve(root, relative);
    assert(target !== root && inside(root, target), 'Output escaped --out');
    noSymlinks(target, true);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
}

function verifyDisk(lossless, root, files) {
    assert.deepEqual(lossless.enumerateFiles(root), files, `Disk file set, byte count or hash differs: ${root}`);
}

async function run(options, repoRoot = REPO_ROOT) {
    const source = path.resolve(options.source);
    noSymlinks(source);
    const out = validateOutput(options.out, process.env.RUNNER_TEMP || os.tmpdir(), [repoRoot, source, process.cwd()]);
    fs.mkdirSync(out, { mode: 0o700 });
    const report = { schema: 1, scope: 'deterministic-P1-CI', status: 'FAIL', source_commit: SOURCE_COMMIT, gates: [] };
    const json = (name, value) => writeNew(out, name, `${JSON.stringify(value, null, 2)}\n`);
    const input = (relative) => path.join(repoRoot, relative);
    function gate(name, script, args, { cwd = repoRoot, expected = 'PASS' } = {}) {
        const executable = input(script);
        readFile(executable);
        const result = spawnSync(process.execPath, [executable, ...args], {
            cwd,
            encoding: 'utf8',
            maxBuffer: 32 * 1024 * 1024,
        });
        writeNew(out, `reports/${name}.stdout`, result.stdout || '');
        writeNew(out, `reports/${name}.stderr`, result.stderr || '');
        json(`reports/${name}.exit.json`, {
            exit_code: result.status,
            signal: result.signal,
            error: result.error?.message || null,
        });
        assert(!result.error && !result.signal, `${name}: tool execution failed`);
        assert.equal(result.status, expected === 'FAIL' ? 1 : 0, `${name}: unexpected exit code`);
        const value = JSON.parse(result.stdout);
        assert.equal(value.status, expected, `${name}: unexpected report status`);
        report.gates.push({
            name,
            status: value.status,
            ...(expected === 'FAIL' ? { purpose: 'original defect retained, not an acceptance PASS' } : {}),
        });
        return value;
    }
    try {
        for (const relative of [
            'tools/skills/verify-lossless.cjs',
            'tools/skills/route-regression.cjs',
            'tools/skills/lib/md-parse.cjs',
            'tools/skills/gen-index.cjs',
            'tools/skills/verify-meta.cjs',
            'tools/skills/measure-tokens.cjs',
            'skills/cocosair/scripts/check-paths.cjs',
        ])
            readFile(input(relative));
        const lossless = require(input('tools/skills/verify-lossless.cjs'));
        const route = require(input('tools/skills/route-regression.cjs'));
        const parser = require(input('tools/skills/lib/md-parse.cjs'));
        const index = require(input('tools/skills/gen-index.cjs'));
        const prettier = require(input('node_modules/prettier'));
        const originalBytes = readFile(input(`${RECOVERY}/original-manifest.json`));
        const original = JSON.parse(originalBytes);
        validateManifestIdentity(original, ORIGINAL_HASH);
        verifyDisk(lossless, source, original.files);
        const prerequisiteBytes = readFile(input(`${RECOVERY}/prerequisite-manifest.json`));
        const prerequisite = JSON.parse(prerequisiteBytes);
        validateManifestIdentity(prerequisite, PREREQUISITE_HASH);
        const proof = JSON.parse(readFile(input(`${RECOVERY}/prerequisite-proof.json`)));
        assert.equal(proof.original_snapshot_hash, ORIGINAL_HASH, 'Proof original identity differs');
        assert.equal(proof.prerequisite_snapshot_hash, PREREQUISITE_HASH, 'Proof prerequisite identity differs');
        assert.deepEqual(
            proof.changes.map(({ path, from, to }) => ({ path, from, to })),
            route.PREREQUISITE_CHANGES,
            'Proof exceeds the four fixed repairs',
        );
        assert.deepEqual(proof.added, [route.PREREQUISITE_ADDED], 'Proof added page differs from fixed approval');
        const candidateFiles = lossless.enumerateFiles(repoRoot);
        const candidateManifest = {
            schema: 1,
            base_commit: SOURCE_COMMIT,
            files: candidateFiles,
            snapshot_hash: lossless.manifestHash(candidateFiles),
        };
        const ledger = input('ai/plans/skills-migration-ledger.json');
        const ledgerBytes = readFile(ledger);
        assert.equal(
            JSON.parse(ledgerBytes).source_snapshot_hash,
            PREREQUISITE_HASH,
            'Final ledger must start at the approved prerequisite',
        );
        const originalLoads = input(`${RECOVERY}/reading-original-B1/events-audited.jsonl`);
        const candidateLoads = candidateLoadPath(repoRoot, options['candidate-loads']);
        report.candidate_loads = path.relative(repoRoot, candidateLoads).replace(/\\/g, '/');
        validateB1Log(originalLoads);
        validateB1Log(candidateLoads);
        const rawHashes = [originalLoads, candidateLoads, ledger].map((filename) => ({
            filename,
            hash: sha256(readFile(filename)),
        }));
        const roots = Object.fromEntries(
            ['original', 'prerequisite', 'candidate', 'a-only'].map((name) => [name, path.join(out, name)]),
        );
        for (const root of Object.values(roots)) fs.mkdirSync(root, { mode: 0o700 });
        for (const file of original.files)
            writeNew(roots.original, file.path, lossless.readSafeFile(source, file.path));
        writeNew(roots.original, 'manifest.json', originalBytes); // Preserve manifest bytes for the route baseline fingerprint.
        lossless.loadSnapshot(roots.original);
        const changes = new Map(proof.changes.map((change) => [change.path, change]));
        const config = (await prettier.resolveConfig(input('.prettierrc.json'))) || {};
        for (const file of original.files) {
            let bytes = lossless.readSafeFile(source, file.path);
            const change = changes.get(file.path);
            if (change) {
                let text = exactReplacement(bytes, change);
                // The approved proof includes only this table's formatting in addition to its exact replacement.
                if (file.path === 'skills/cocosair-verification/references/gate-catalog.md') {
                    text = await prettier.format(text, { ...config, filepath: file.path });
                }
                bytes = Buffer.from(text);
                assert.equal(sha256(bytes), change.after_sha256, `Prerequisite repaired hash differs: ${file.path}`);
            }
            writeNew(roots.prerequisite, file.path, bytes);
        }
        const addition = route.PREREQUISITE_ADDED;
        const addedBytes = lossless.readSafeFile(repoRoot, addition.path);
        assert.equal(sha256(addedBytes), addition.sha256, 'Fixed verification page changed');
        assert.equal(addedBytes.length, addition.bytes, 'Fixed verification page byte count changed');
        writeNew(roots.prerequisite, addition.path, addedBytes);
        writeNew(roots.prerequisite, 'manifest.json', prerequisiteBytes);
        lossless.loadSnapshot(roots.prerequisite);
        json(
            'reports/prerequisite-chain.json',
            route.validatePrerequisiteSnapshot(
                route.loadSnapshot(roots.original),
                route.loadSnapshot(roots.prerequisite),
                proof,
                parser.parseMarkdown,
                index,
            ),
        );
        for (const file of candidateFiles) {
            const bytes = lossless.readSafeFile(repoRoot, file.path);
            writeNew(roots.candidate, file.path, bytes);
            writeNew(roots['a-only'], file.path, bytes);
        }
        writeNew(roots.candidate, 'manifest.json', `${JSON.stringify(candidateManifest, null, 2)}\n`);
        lossless.loadSnapshot(roots.candidate);
        verifyDisk(lossless, roots['a-only'], candidateFiles);
        assert.deepEqual(
            fs.readdirSync(roots['a-only']),
            ['skills'],
            'A-only copy must contain just the complete skills tree',
        );
        const formatFiles = changedFormatFiles(original.files, candidateFiles);
        assert(formatFiles.length > 0, 'Final candidate has no changed skill files');
        json('reports/format-scope.json', { files: formatFiles });
        const format = spawnSync(
            process.execPath,
            [input('node_modules/prettier/bin/prettier.cjs'), '--check', ...formatFiles],
            { cwd: repoRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
        );
        writeNew(out, 'reports/modified-skills-prettier.stdout', format.stdout || '');
        writeNew(out, 'reports/modified-skills-prettier.stderr', format.stderr || '');
        assert(!format.error && !format.signal && format.status === 0, 'Modified skills formatting failed');
        report.gates.push({ name: 'modified-skills-prettier', status: 'PASS', files: formatFiles.length });
        const paths = 'skills/cocosair/scripts/check-paths.cjs';
        gate('original-paths', paths, [`--root=${roots.original}/skills`], { expected: 'FAIL' });
        gate('prerequisite-paths', paths, [`--root=${roots.prerequisite}/skills`]);
        gate('original-restore', 'tools/skills/verify-lossless.cjs', [
            '--restore-check',
            roots.original,
            '--out',
            path.join(out, 'restored'),
        ]);
        gate('candidate-paths', paths, [`--root=${repoRoot}/skills`]);
        gate('candidate-index', 'tools/skills/gen-index.cjs', ['--root', repoRoot, '--check']);
        gate('candidate-meta', 'tools/skills/verify-meta.cjs', ['--root', repoRoot, '--snapshot', roots.original]);
        gate('candidate-lossless', 'tools/skills/verify-lossless.cjs', [
            '--root',
            repoRoot,
            '--snapshot',
            roots.prerequisite,
            '--ledger',
            ledger,
            '--phase',
            'P1',
        ]);
        gate('candidate-route', 'tools/skills/route-regression.cjs', [
            '--snapshot',
            roots.original,
            '--root',
            repoRoot,
            '--prompts',
            input('tools/skills/fixtures/route-prompts.json'),
            '--baseline',
            input('ai/plans/skills-route-baseline.json'),
            '--tier',
            'T1',
            '--view',
            'both',
        ]);
        gate('candidate-static-diff', 'tools/skills/measure-tokens.cjs', [
            '--root',
            repoRoot,
            '--diff',
            input('ai/plans/skills-token-baseline.json'),
            '--source-snapshot',
            roots.original,
            '--json',
        ]);
        const benefit = gate('candidate-B1-diff', 'tools/skills/measure-tokens.cjs', [
            '--loads',
            candidateLoads,
            '--snapshot',
            roots.candidate,
            '--scenarios',
            input('tools/skills/fixtures/load-scenarios.json'),
            '--source-snapshot',
            roots.original,
            '--diff',
            input(`${RECOVERY}/original-B1.json`),
            '--baseline-loads',
            originalLoads,
            '--json',
        ]);
        assert.equal(benefit.diff.status, 'PASS', 'Real B1 cost comparison failed');
        assert.equal(benefit.diff.comparisons.length, 1, 'Expected only one B1 comparison');
        assert.equal(benefit.diff.comparisons[0].scenario_id, 'B1', 'Missing B1 comparison');
        gate('a-only-paths', paths, [`--root=${roots['a-only']}/skills`], { cwd: roots['a-only'] });
        gate('a-only-index', 'tools/skills/gen-index.cjs', ['--root', roots['a-only'], '--check'], {
            cwd: roots['a-only'],
        });
        gate('a-only-meta', 'tools/skills/verify-meta.cjs', ['--root', roots['a-only'], '--snapshot', roots.original], {
            cwd: roots['a-only'],
        });
        verifyDisk(lossless, roots['a-only'], candidateFiles);
        verifyDisk(lossless, repoRoot, candidateFiles);
        verifyDisk(lossless, source, original.files);
        lossless.loadSnapshot(roots.original);
        lossless.loadSnapshot(roots.prerequisite);
        lossless.loadSnapshot(roots.candidate);
        for (const entry of rawHashes)
            assert.equal(sha256(readFile(entry.filename)), entry.hash, 'Input evidence changed during CI');
        json('reports/a-only-manifest.json', {
            schema: 1,
            status: 'PASS',
            files: lossless.enumerateFiles(roots['a-only']),
            snapshot_hash: candidateManifest.snapshot_hash,
            copied_snapshot_code_executed: false,
        });
        report.status = 'PASS';
        report.original_snapshot_hash = ORIGINAL_HASH;
        report.prerequisite_snapshot_hash = PREREQUISITE_HASH;
        report.candidate_snapshot_hash = candidateManifest.snapshot_hash;
        report.read_events_collected_or_synthesized = false;
        report.phase_two_authorized = false;
    } catch (error) {
        report.error = error.message;
    }
    json('summary.json', report);
    return report;
}

module.exports = {
    SOURCE_COMMIT,
    ORIGINAL_HASH,
    PREREQUISITE_HASH,
    inside,
    noSymlinks,
    readFile,
    validateOutput,
    parseArgs,
    candidateLoadPath,
    validateManifestIdentity,
    exactReplacement,
    validateB1Log,
    changedFormatFiles,
    writeNew,
    verifyDisk,
    run,
};

if (require.main === module) {
    (async () => {
        try {
            const result = await run(parseArgs(process.argv.slice(2)));
            console.log(JSON.stringify(result, null, 2));
            process.exitCode = result.status === 'PASS' ? 0 : 1;
        } catch (error) {
            console.error(error.message);
            process.exitCode = 1;
        }
    })();
}
