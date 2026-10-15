'use strict';
/**
 * Publish a complete fixed-snapshot campaign, with a durable fail-closed guard.
 *
 * node tools/verify/publish-example-evidence.cjs --campaign=/external/campaign/merged.json \
 *     --source-dir=/external/campaign
 *
 * No browser launches here. A complete staged repository is validated before any
 * evidence or metadata is replaced. Only existing stable promotion fields may be
 * refreshed; the canonical report is the last payload written. Failed commits
 * retain their guard and staging directory for inspection, never claim success,
 * and never automatically discard evidence or roll metadata back.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const protocol = require('./example-evidence-campaign.cjs');
const common = require('./example-spec-common.cjs');

const REPO = path.resolve(__dirname, '..', '..');
const CANONICAL = 'docs/evidence/examples-verified.json';
const GUARD = 'docs/evidence/.examples-publication-incomplete.json';
const PACKAGE_ROOT = 'docs/evidence/example-campaigns';
const GUARD_SCHEMA = 'cocos-air.example-evidence-publication-transaction/v1';

function invariant(ok, message) {
    if (!ok) throw new Error(message);
}
function same(a, b) {
    return protocol.objectDigest(a) === protocol.objectDigest(b);
}
function inside(root, file) {
    const relative = path.relative(path.resolve(root), path.resolve(file));
    return (
        relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
    );
}
function posix(value) {
    return value.split(path.sep).join('/');
}
function plainPath(file, allowMissing = false) {
    const absolute = path.resolve(file);
    let cursor = path.parse(absolute).root;
    for (const part of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part);
        let stat;
        try {
            stat = fs.lstatSync(cursor);
        } catch (error) {
            if (allowMissing && error.code === 'ENOENT') return;
            throw error;
        }
        invariant(!stat.isSymbolicLink(), `publication symlink forbidden: ${cursor}`);
    }
}
function regularFile(file) {
    plainPath(file);
    invariant(fs.lstatSync(file).isFile(), `publication nonregular file: ${file}`);
}
function readJson(file) {
    regularFile(file);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function jsonBytes(value) {
    return Buffer.from(JSON.stringify(value, null, 2) + '\n');
}
function digest(file) {
    regularFile(file);
    return protocol.fileDigest(file);
}
function maybeDigest(file) {
    plainPath(file, true);
    return fs.existsSync(file) ? digest(file) : null;
}
function syncDirectory(directory) {
    const descriptor = fs.openSync(directory, 'r');
    try {
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
}
function durableDirectory(directory) {
    plainPath(directory, true);
    if (fs.existsSync(directory)) {
        invariant(fs.lstatSync(directory).isDirectory(), `publication destination is not a directory: ${directory}`);
        return;
    }
    durableDirectory(path.dirname(directory));
    fs.mkdirSync(directory);
    syncDirectory(path.dirname(directory));
}
function durableWrite(file, bytes, exclusive = false) {
    plainPath(file, true);
    durableDirectory(path.dirname(file));
    const descriptor = fs.openSync(file, exclusive ? 'wx' : 'w');
    try {
        fs.writeFileSync(descriptor, bytes);
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
    syncDirectory(path.dirname(file));
}
function atomicWrite(file, bytes, transactionId) {
    plainPath(file, true);
    const temporary = `${file}.publication-${transactionId}.tmp`;
    durableWrite(temporary, bytes, true);
    fs.renameSync(temporary, file);
    syncDirectory(path.dirname(file));
}
function inventory(directory) {
    plainPath(directory);
    invariant(fs.lstatSync(directory).isDirectory(), `publication source is not a directory: ${directory}`);
    const files = [];
    function walk(current) {
        for (const name of fs.readdirSync(current).sort()) {
            const file = path.join(current, name);
            const stat = fs.lstatSync(file);
            invariant(!stat.isSymbolicLink(), `publication symlink forbidden: ${file}`);
            if (stat.isDirectory()) walk(file);
            else {
                invariant(stat.isFile(), `publication nonregular source: ${file}`);
                files.push({ path: posix(path.relative(directory, file)), ...digest(file) });
            }
        }
    }
    walk(directory);
    invariant(files.length > 0, 'publication source directory is empty');
    return files;
}
function syncTree(directory) {
    for (const name of fs.readdirSync(directory)) {
        const file = path.join(directory, name);
        const stat = fs.lstatSync(file);
        invariant(!stat.isSymbolicLink(), `publication symlink forbidden: ${file}`);
        if (stat.isDirectory()) syncTree(file);
        else {
            invariant(stat.isFile(), `publication nonregular source: ${file}`);
            const descriptor = fs.openSync(file, 'r');
            try {
                fs.fsyncSync(descriptor);
            } finally {
                fs.closeSync(descriptor);
            }
        }
    }
    syncDirectory(directory);
}
function copyFiles(source, destination, files) {
    for (const entry of files) {
        const from = path.resolve(source, entry.path);
        const to = path.resolve(destination, entry.path);
        invariant(inside(source, from) && inside(destination, to), 'publication copy path escapes root');
        regularFile(from);
        plainPath(to, true);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    }
}
function assertFullCampaign(data, options) {
    const result = protocol.validateCampaign(data, options);
    invariant(result.ok, `campaign cannot publish: ${result.errors.join('; ')}`);
    invariant(!data.publication, 'campaign was already published; collect a new frozen campaign');
}
function checkedReference(ref, owner, sourceDir) {
    invariant(
        ref && typeof ref.path === 'string' && !path.isAbsolute(ref.path) && !ref.path.includes('\\'),
        'invalid publication reference',
    );
    const file = path.resolve(path.dirname(owner), ref.path);
    invariant(inside(sourceDir, file), `publication reference escapes source directory: ${ref.path}`);
    invariant(
        same(digest(file), { bytes: ref.bytes, sha256: ref.sha256 }),
        `publication reference hash mismatch: ${ref.path}`,
    );
    return file;
}
function assertSourceClosure(data, campaignPath, sourceDir) {
    for (const segmentRef of data.segments) {
        const segmentFile = checkedReference(segmentRef, campaignPath, sourceDir);
        const segment = readJson(segmentFile);
        for (const attempt of segment.attempts) {
            const attemptFile = checkedReference(attempt.report, segmentFile, sourceDir);
            const report = readJson(attemptFile);
            invariant(report.custodyArtifacts, 'publication requires original custody artifacts');
            for (const ref of [
                report.rawCollector,
                report.rawReceipt,
                ...report.logs,
                ...report.artifacts,
                ...Object.values(report.custodyArtifacts),
            ]) {
                checkedReference(ref, attemptFile, sourceDir);
            }
            for (const row of [report.result, ...(report.result?.modeEvidence || [])]) {
                for (const response of row.networkAssets || [])
                    checkedReference(response.bodyArtifact, attemptFile, sourceDir);
            }
        }
    }
}
function refreshPromotions(stage, freeze, results) {
    const manifestFile = path.join(stage, 'examples/files.json');
    const manifest = readJson(manifestFile);
    const beforeManifest = JSON.parse(JSON.stringify(manifest));
    const changes = [];
    for (const baseline of freeze.promotionBaseline) {
        if (baseline.status !== 'stable') continue;
        const relative = `examples/${baseline.dir}/example.json`;
        const file = path.join(stage, relative);
        const spec = readJson(file);
        const entry = manifest.examples.find((item) => item.id === baseline.id);
        invariant(spec.status === 'stable' && entry?.status === 'stable', `publication status drift: ${baseline.id}`);
        invariant(
            Object.hasOwn(spec, 'promotion') && Object.hasOwn(entry, 'promotion'),
            `publication cannot add promotion: ${baseline.id}`,
        );
        const promotion = common.promotionOf(results.find((row) => row.id === baseline.id));
        invariant(promotion, `publication stable example lacks promotion proof: ${baseline.id}`);
        if (!same(spec.promotion, promotion)) {
            spec.promotion = promotion;
            fs.writeFileSync(file, jsonBytes(spec));
            changes.push(relative);
        }
        entry.promotion = promotion;
    }
    if (!same(manifest, beforeManifest)) {
        fs.writeFileSync(manifestFile, jsonBytes(manifest));
        changes.push('examples/files.json');
    }
    return changes.sort();
}
function preparePublication({ repo = REPO, campaign, sourceDir } = {}) {
    repo = path.resolve(repo);
    invariant(campaign && sourceDir, 'publication requires --campaign and --source-dir');
    campaign = path.resolve(campaign);
    sourceDir = path.resolve(sourceDir);
    plainPath(repo);
    plainPath(path.join(repo, GUARD), true);
    invariant(
        !fs.existsSync(path.join(repo, GUARD)),
        'incomplete publication guard exists; inspect and restore the interrupted transaction first',
    );
    invariant(inside(sourceDir, campaign), 'merged campaign must be inside its source directory');
    invariant(!inside(sourceDir, repo), 'publication source directory cannot contain the repository');
    const data = readJson(campaign);
    assertFullCampaign(data, { repo, evidencePath: campaign });
    assertSourceClosure(data, campaign, sourceDir);
    const sourceFiles = inventory(sourceDir);
    const packageRelative = `${PACKAGE_ROOT}/${data.freezeId}`;
    plainPath(path.join(repo, packageRelative), true);
    invariant(!fs.existsSync(path.join(repo, packageRelative)), 'immutable publication package already exists');
    const stage = fs.mkdtempSync(path.join(repo, '.example-publication-stage-'));
    try {
        // No symlink overlay: all byte-bound source and SDK inputs are real copies.
        for (const relative of protocol.INPUT_TREES) fs.mkdirSync(path.join(stage, relative), { recursive: true });
        copyFiles(repo, stage, data.freeze.inputs);
        const packageDirectory = path.join(stage, packageRelative);
        copyFiles(sourceDir, packageDirectory, sourceFiles);
        invariant(
            same(sourceFiles, inventory(sourceDir)) && same(sourceFiles, inventory(packageDirectory)),
            'campaign source changed while staging',
        );
        const segments = data.segments.map((ref) => {
            const original = checkedReference(ref, campaign, sourceDir);
            return path.join(packageDirectory, path.relative(sourceDir, original));
        });
        // Re-derive every canonical result path from copied immutable attempts.
        const canonicalPath = path.join(stage, CANONICAL);
        const staged = protocol.mergeCampaign({
            repo: stage,
            freeze: data.freeze,
            segments,
            out: canonicalPath,
            publicationStaging: true,
        });
        const changes = refreshPromotions(stage, staged.freeze, staged.results);
        staged.publication = protocol.buildPublication(staged.freeze, staged.results, { repo: stage });
        fs.writeFileSync(canonicalPath, jsonBytes(staged));
        const checked = protocol.validateCampaign(staged, { repo: stage, evidencePath: canonicalPath });
        invariant(checked.ok, `staged publication invalid: ${checked.errors.join('; ')}`);
        protocol.assertFrozenInputs(data.freeze, { repo });
        const writes = [...changes, CANONICAL].map((relative) => ({
            path: relative,
            before: maybeDigest(path.join(repo, relative)),
            after: digest(path.join(stage, relative)),
        }));
        const backup = path.join(stage, '.publication-before');
        fs.mkdirSync(backup);
        copyFiles(
            repo,
            backup,
            writes.filter((item) => item.before),
        );
        return {
            repo,
            stage,
            sourceDir,
            campaign,
            packageRelative,
            packageFiles: sourceFiles,
            writes,
            backup: '.publication-before',
            freezeId: data.freezeId,
        };
    } catch (error) {
        fs.rmSync(stage, { recursive: true, force: true });
        throw error;
    }
}
function commitPublication(plan) {
    const { repo, stage, packageRelative, packageFiles, writes } = plan;
    invariant(
        inside(repo, stage) && path.basename(stage).startsWith('.example-publication-stage-'),
        'invalid publication stage',
    );
    invariant(writes.length > 0 && writes[writes.length - 1].path === CANONICAL, 'canonical publication must be last');
    plainPath(stage);
    const staged = readJson(path.join(stage, CANONICAL));
    invariant(packageRelative === `${PACKAGE_ROOT}/${staged.freezeId}`, 'publication package path mismatch');
    const allowedWrites = [...staged.publication.files.map((item) => item.path).sort(), CANONICAL];
    invariant(
        same(
            writes.map((item) => item.path),
            allowedWrites,
        ),
        'publication write set differs from allowed promotion delta',
    );
    const checked = protocol.validateCampaign(staged, { repo: stage, evidencePath: path.join(stage, CANONICAL) });
    invariant(checked.ok, `staged publication invalid: ${checked.errors.join('; ')}`);
    invariant(staged.freezeId === plan.freezeId && staged.freeze.scope.length > 0, 'publication plan/freeze mismatch');
    protocol.assertFrozenInputs(staged.freeze, { repo });
    for (const item of writes) {
        invariant(
            inside(repo, path.resolve(repo, item.path)) && inside(stage, path.resolve(stage, item.path)),
            'publication write escapes repository',
        );
        invariant(
            same(maybeDigest(path.join(repo, item.path)), item.before),
            `publication target changed before commit: ${item.path}`,
        );
        invariant(
            same(digest(path.join(stage, item.path)), item.after),
            `publication staged bytes changed: ${item.path}`,
        );
    }
    invariant(
        same(inventory(path.join(stage, packageRelative)), packageFiles),
        'publication staged package hash mismatch',
    );
    const packageDirectory = path.join(repo, packageRelative);
    plainPath(packageDirectory, true);
    invariant(!fs.existsSync(packageDirectory), 'immutable publication package already exists');
    const guard = path.join(repo, GUARD);
    const transactionId = crypto.randomUUID();
    invariant(plan.backup === '.publication-before', 'invalid publication backup path');
    const backup = path.join(stage, plan.backup);
    for (const item of writes.filter((entry) => entry.before)) {
        invariant(same(digest(path.join(backup, item.path)), item.before), `publication backup changed: ${item.path}`);
    }
    syncTree(backup);
    syncDirectory(stage);
    syncDirectory(repo);
    // The exclusive guard is the lock. Fsync it before the first visible mutation.
    const transaction = {
        schema: GUARD_SCHEMA,
        transactionId,
        freezeId: plan.freezeId,
        startedAt: new Date().toISOString(),
        stage: posix(path.relative(repo, stage)),
        backup: posix(path.relative(repo, backup)),
        package: { path: packageRelative, files: packageFiles },
        writes,
    };
    durableWrite(guard, jsonBytes(transaction), true);
    try {
        // Another publisher could have completed between preflight and acquiring
        // the exclusive guard. Recheck under the guard before changing payloads.
        protocol.assertFrozenInputs(staged.freeze, { repo });
        for (const item of writes) {
            invariant(
                same(maybeDigest(path.join(repo, item.path)), item.before),
                `publication target changed while acquiring guard: ${item.path}`,
            );
        }
        invariant(!fs.existsSync(packageDirectory), 'immutable publication package already exists');
        const stagedPackage = path.join(stage, packageRelative);
        syncTree(stagedPackage);
        durableDirectory(path.dirname(packageDirectory));
        fs.renameSync(stagedPackage, packageDirectory);
        syncDirectory(path.dirname(packageDirectory));
        for (const item of writes)
            atomicWrite(path.join(repo, item.path), fs.readFileSync(path.join(stage, item.path)), transactionId);
        // Rehash every delivered file before removing the fail-closed guard.
        invariant(same(inventory(packageDirectory), packageFiles), 'published package hash mismatch');
        for (const item of writes)
            invariant(same(digest(path.join(repo, item.path)), item.after), `published hash mismatch: ${item.path}`);
        invariant(
            same(protocol.collectInputs(repo), staged.freeze.inputs),
            'publication changed frozen non-promotion inputs',
        );
        protocol.validatePublication(staged.freeze, staged.publication, staged.results, repo);
        fs.unlinkSync(guard);
        syncDirectory(path.dirname(guard));
    } catch (error) {
        // A directory fsync may fail after unlink has succeeded. Restore the
        // visible fail-closed guard rather than reporting a guard that is absent.
        if (!fs.existsSync(guard)) {
            try {
                durableWrite(guard, jsonBytes(transaction), true);
            } catch (guardError) {
                throw new Error(
                    `Publication finalization failed and guard restoration failed: ${guardError.message}. Retain ${stage} and stop all evidence consumers. ${error.message}`,
                );
            }
        }
        throw new Error(
            `Publication incomplete; guard retained at ${GUARD}; staged files retained at ${path.relative(repo, stage)}. ${error.message}`,
        );
    }
    // Cleanup is outside the guarded transaction. A cleanup error cannot relabel
    // a successfully committed, checked publication as incomplete.
    let cleanupWarning;
    try {
        fs.rmSync(stage, { recursive: true, force: true });
    } catch (error) {
        cleanupWarning = `Published successfully; remove unused staging directory ${path.relative(repo, stage)}: ${error.message}`;
    }
    return {
        published: true,
        freezeId: plan.freezeId,
        total: staged.freeze.scope.length,
        canonical: CANONICAL,
        package: packageRelative,
        changed: writes.map((item) => item.path),
        ...(cleanupWarning ? { cleanupWarning } : {}),
    };
}
function publishEvidence(options) {
    return commitPublication(preparePublication(options));
}
function main(args) {
    const argument = (name) => args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
    invariant(
        !args.some((value) => !['repo', 'campaign', 'source-dir'].some((name) => value.startsWith(`--${name}=`))),
        'unknown publication option',
    );
    const result = publishEvidence({
        repo: argument('repo') || REPO,
        campaign: argument('campaign'),
        sourceDir: argument('source-dir'),
    });
    console.log(JSON.stringify(result));
}
if (require.main === module) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
module.exports = { CANONICAL, GUARD, GUARD_SCHEMA, preparePublication, commitPublication, publishEvidence };
