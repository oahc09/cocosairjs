#!/usr/bin/env node
/* U10 static public preparation only. No network, package installation, model calls,
 * browser launch, Git mutation, reference execution or metric aggregation. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');

const SCHEMA = 'upstream-agent-public-inputs/1';
const MAIN = 'b573be0741db9e2a13d38ce7e65870b97a1f5fbc';
const TASK_IDS = Array.from({ length: 12 }, (_, index) => `AU${String(index + 1).padStart(2, '0')}`);
const SEEDS = [2026102201, 2026102202, 2026102203];
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object')
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [key, canonical(value[key])]),
        );
    return value;
};
const canonicalHash = (value) => sha256(Buffer.from(JSON.stringify(canonical(value))));
const inventoryHash = (rows) =>
    sha256(
        Buffer.from(
            JSON.stringify(
                [...rows]
                    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
                    .map((r) => [r.path, r.sha256]),
            ),
        ),
    );
const isSHA256 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function safeRelative(relative) {
    assert.equal(typeof relative, 'string', 'relative path required');
    assert(relative.length && !relative.includes('\\') && !relative.includes('\0'), 'invalid relative path');
    assert(
        !path.posix.isAbsolute(relative) && !relative.split('/').some((part) => ['', '.', '..'].includes(part)),
        'unsafe relative path',
    );
    return relative;
}
function boundedFile(root, relative) {
    const base = fs.realpathSync(root);
    const full = path.resolve(base, safeRelative(relative));
    const actual = fs.realpathSync(full);
    assert(actual.startsWith(base + path.sep), `source escaped its root: ${relative}`);
    let cursor = base;
    for (const part of relative.split('/')) {
        cursor = path.join(cursor, part);
        assert(!fs.lstatSync(cursor).isSymbolicLink(), `symlink not accepted: ${relative}`);
    }
    assert(fs.statSync(actual).isFile(), `regular file required: ${relative}`);
    return actual;
}
function checkedBytes(bytes, row) {
    assert.equal(bytes.length, row.bytes, `byte length mismatch: ${row.path || row.id}`);
    assert.equal(sha256(bytes), row.sha256, `SHA256 mismatch: ${row.path || row.id}`);
    return bytes;
}
function publicResource(row) {
    return {
        id: row.id,
        path: row.publicPath,
        bytes: row.bytes,
        sha256: row.sha256,
        ...(row.semantic ? { semantic: row.semantic } : {}),
    };
}
function commonInput(manifest, task) {
    return {
        schema: 'upstream-agent-common-input/1',
        task: {
            id: task.id,
            topic: task.topic,
            prompt: task.prompt,
            contractId: task.contractId,
            specification: task.publicSpec,
        },
        resources: task.resourceIds.map((id) => publicResource(manifest.resources.find((row) => row.id === id))),
        seeds: task.repetitionSeeds,
        cohort: manifest.cohort,
        seedContract: manifest.seedContract,
        toolContract: manifest.toolContract,
        networkContract: manifest.networkContract,
        renderContract: manifest.renderContract,
        httpFixtureContract: manifest.httpFixtureContract,
    };
}
function validateManifest(manifest) {
    assert.equal(manifest.schema, SCHEMA);
    assert.equal(manifest.status, 'PREPARED_NOT_RUN');
    assert.deepEqual(
        manifest.cohort,
        {
            tasks: 12,
            repetitions: 3,
            engines: ['cocosair', 'three'],
            pairsPerConfiguration: 36,
            runsPerConfiguration: 72,
            minimumSuccessRate: 0.8,
            repairBudget: 5,
            timeBudgetMs: 1200000,
        },
        'fixed U10 cohort/budgets must not change silently',
    );
    assert.deepEqual(
        manifest.tasks.map((task) => task.id),
        TASK_IDS,
    );
    assert.deepEqual(manifest.seedContract.seeds, SEEDS);
    const callerTypeOptions = manifest.tasks.find((task) => task.id === 'AU12').publicSpec.strictTypeOptions;
    assert.equal(callerTypeOptions.strictNullChecks, true, 'AU12 caller strictNullChecks required');
    assert.equal(callerTypeOptions.skipLibCheck, true, 'AU12 must preserve the documented skipLibCheck true contract');
    const compilerContract = manifest.tasks.find((task) => task.id === 'AU12').publicSpec.compilerContract;
    assert.equal(compilerContract?.id, 'upstream-sdk-types/3', 'AU12 versioned common compiler contract required');
    assert.equal(compilerContract.fixtureScope, 'paired-common/1');
    assert.equal(compilerContract.candidateExtensionScope, 'candidate-u06-extension/1');
    assert.deepEqual(compilerContract.commonModeIds, ['5.9.3/node16', '5.9.3/bundler']);
    assert.deepEqual(compilerContract.cocosCompatibilityModeIds, ['4.9.5/node', '4.9.5/node16']);
    assert.deepEqual(compilerContract.threeCompatibilityModeIds, []);
    assert.equal(manifest.threeBaseline.package, 'three');
    assert.equal(manifest.threeBaseline.version, '0.186.1');
    assert.equal(manifest.threeBaseline.tarballUrl, 'https://registry.npmjs.org/three/-/three-0.186.1.tgz');
    assert(isSHA256(manifest.threeBaseline.artifactSha256));
    assert.equal(manifest.threeBaseline.declarations?.package, '@types/three', 'exact declaration package required');
    assert.equal(manifest.threeBaseline.declarations?.version, '0.186.0', 'exact declaration version required');
    assert(isSHA256(manifest.threeBaseline.declarations?.manifestSha256), 'declaration manifest identity required');
    assert.equal(manifest.knowledgeProfiles.old.origin, 'main-git-blobs');
    assert.equal(manifest.knowledgeProfiles.old.sourceCommit, MAIN);
    assert.equal(manifest.networkContract.external, 'deny');
    assert.equal(manifest.networkContract.peerAccess, 'deny');
    assert.equal(manifest.toolContract.hostToolBindings, null, 'preparation must not invent launch tool bindings');
    assert.equal(manifest.observations.generatedRuns, 0);
    assert.equal(manifest.observations.referenceRuns, 0);
    for (const field of ['successRate', 'tokens', 'cost', 'toolCalls'])
        assert.equal(manifest.observations[field], null);
    const ids = new Set(),
        destinations = new Set();
    for (const row of manifest.resources) {
        assert(!ids.has(row.id), `duplicate resource ID ${row.id}`);
        assert(!destinations.has(row.publicPath), `duplicate resource destination ${row.publicPath}`);
        ids.add(row.id);
        destinations.add(row.publicPath);
        safeRelative(row.publicPath);
        safeRelative(row.sourcePath);
        assert(row.publicPath.startsWith('assets/'), 'public resources must stay in assets');
        assert(/\.(?:gltf|glb|bin|png)$/.test(row.publicPath), 'implementation/reference code is not a public asset');
        assert(isSHA256(row.sha256) && Number.isInteger(row.bytes) && row.bytes > 0);
        assert(['checkout-file', 'request-payload', 'literal-data-uri'].includes(row.sourceKind));
    }
    for (const [name, profile] of Object.entries(manifest.knowledgeProfiles)) {
        const paths = new Set();
        for (const row of profile.files) {
            safeRelative(row.path);
            assert(
                row.path === 'README.md' || /^docs\/(manual|gltf|guides|reference)\/[a-z0-9-]+\.md$/.test(row.path),
                'non-public knowledge path',
            );
            assert(!paths.has(row.path), `duplicate knowledge path ${row.path}`);
            paths.add(row.path);
            assert(isSHA256(row.sha256));
            if (name === 'old') {
                assert.equal(row.origin, 'git-blob', 'old knowledge cannot come from the revised worktree');
                assert(/^[a-f0-9]{40}$/.test(row.gitBlobSha1));
            } else assert.equal(row.origin, 'current-checkout');
        }
        assert.equal(inventoryHash(profile.files), profile.inventorySha256, `knowledge inventory mismatch: ${name}`);
    }
    for (const task of manifest.tasks) {
        assert.equal(task.contractId, `upstream-agent-observation/1:${task.id}`);
        assert.deepEqual(task.repetitionSeeds, SEEDS);
        assert.equal(task.pairedSemanticsStatus, 'PREPARED_NOT_VALIDATED');
        assert.equal(task.referenceValidationStatus, 'NOT_RUN');
        assert.equal(new Set(task.resourceIds).size, task.resourceIds.length);
        for (const id of task.resourceIds) assert(ids.has(id), `unknown resource ${id}`);
        assert.equal(
            task.commonInputSha256,
            canonicalHash(commonInput(manifest, task)),
            `common input hash mismatch: ${task.id}`,
        );
    }
    return manifest;
}
function oldKnowledgeBytes(repoRoot, inputsRoot, row) {
    let bytes;
    try {
        bytes = execFileSync('git', ['cat-file', 'blob', row.gitBlobSha1], {
            cwd: repoRoot,
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 16 * 1024 * 1024,
        });
    } catch {
        bytes = fs.readFileSync(boundedFile(inputsRoot, `agent-input-preparation/git-blobs/${row.gitBlobSha1}`));
    }
    const gitHash = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    assert.equal(gitHash, row.gitBlobSha1, `old knowledge Git blob mismatch: ${row.path}`);
    return checkedBytes(bytes, row);
}
// Explicit replay of a frozen current-profile corpus; never silently fall back from checkout drift.
// "current" names the historical comparison arm, not the current candidate checkout.
function currentKnowledgeBytes(repoRoot, row, sourceCommit) {
    if (sourceCommit === undefined) return checkedBytes(fs.readFileSync(boundedFile(repoRoot, row.path)), row);
    assert(/^[a-f0-9]{40}$/.test(sourceCommit), 'current knowledge replay requires an exact commit');
    safeRelative(row.path);
    const objectType = execFileSync('git', ['cat-file', '-t', sourceCommit], {
        cwd: repoRoot,
        encoding: 'utf8',
    }).trim();
    assert.equal(objectType, 'commit', 'current knowledge source must be a commit');
    return checkedBytes(
        execFileSync('git', ['show', `${sourceCommit}:${row.path}`], {
            cwd: repoRoot,
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 16 * 1024 * 1024,
        }),
        row,
    );
}
function resourceBytes(repoRoot, row) {
    const source = boundedFile(repoRoot, row.sourcePath);
    if (row.sourceKind === 'checkout-file') return checkedBytes(fs.readFileSync(source), row);
    assert.equal(sha256(fs.readFileSync(source)), row.sourceSha256, `derived asset source mismatch: ${row.id}`);
    if (row.sourceKind === 'literal-data-uri') {
        assert(fs.readFileSync(source, 'utf8').includes(row.base64), 'literal asset is absent from bound source');
        return checkedBytes(Buffer.from(row.base64, 'base64'), row);
    }
    // Only the pinned local synthetic payload producer executes, not its HTTP server or a reference.
    assert.equal(row.sourcePath, 'test/fixtures/upstream-request-policy/server.cjs');
    assert.equal(row.payloadCase, 'default-options');
    assert(['model.gltf', 'mesh.bin', 'pixel.png'].includes(row.payloadResource));
    return checkedBytes(require(source).payload(row.payloadCase, row.payloadResource, '').body, row);
}
function treeInventory(root) {
    const rows = [];
    function visit(relative = '') {
        const dir = path.join(root, relative);
        for (const name of fs.readdirSync(dir).sort()) {
            const entry = relative ? `${relative}/${name}` : name;
            const full = path.join(root, entry),
                stat = fs.lstatSync(full);
            assert(!stat.isSymbolicLink(), `package symlink forbidden: ${entry}`);
            if (stat.isDirectory()) visit(entry);
            else {
                assert(stat.isFile(), `special package entry forbidden: ${entry}`);
                rows.push({ path: entry, bytes: stat.size, sha256: sha256(fs.readFileSync(full)) });
            }
        }
    }
    visit();
    return rows;
}
function verifyAssetClosure(manifest, files) {
    for (const task of manifest.tasks) {
        const allowed = new Set(
            task.resourceIds.map((id) => manifest.resources.find((row) => row.id === id).publicPath),
        );
        for (const relative of allowed) {
            if (!relative.endsWith('.gltf')) continue;
            const document = JSON.parse(files.get(relative));
            assert.equal(document.asset?.version, '2.0', `invalid public glTF: ${relative}`);
            for (const item of [...(document.buffers || []), ...(document.images || [])]) {
                if (!item.uri || item.uri.startsWith('data:')) continue;
                assert(
                    !item.uri.includes(':') && !item.uri.includes('?') && !item.uri.includes('#'),
                    'public resource cannot require external network',
                );
                const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(relative), item.uri));
                assert(allowed.has(dependency), `${task.id} missing asset dependency: ${dependency}`);
                assert(files.has(dependency), `asset dependency not materialized: ${dependency}`);
            }
        }
    }
}
function verifyTooling(manifest, inputsRoot) {
    const observed = manifest.toolingEvidence;
    const lock = fs.readFileSync(boundedFile(inputsRoot, observed.lockRelativePath));
    assert.equal(sha256(lock), observed.lockSha256, 'consumer tooling lock changed');
    for (const row of observed.packages) {
        const packageRoot = path.join(inputsRoot, row.relativePath);
        const bytes = fs.readFileSync(boundedFile(packageRoot, 'package.json'));
        assert.equal(sha256(bytes), row.packageJsonSha256, `tool metadata drift: ${row.name}`);
        const meta = JSON.parse(bytes);
        assert.equal(meta.name, row.name);
        assert.equal(meta.version, row.version);
        const inventory = treeInventory(packageRoot);
        assert.equal(inventoryHash(inventory), row.treeSha256, `tool package bytes drift: ${row.name}`);
    }
    return observed;
}
function verifyThree(manifest, inputsRoot) {
    const pin = manifest.threeBaseline;
    const archive = fs.readFileSync(boundedFile(inputsRoot, pin.archiveRelativePath));
    assert.equal(sha256(archive), pin.artifactSha256, 'three archive SHA256 mismatch');
    assert.equal(crypto.createHash('sha1').update(archive).digest('hex'), pin.npmShasum);
    assert.equal('sha512-' + crypto.createHash('sha512').update(archive).digest('base64'), pin.npmIntegrity);
    const metaBytes = fs.readFileSync(boundedFile(inputsRoot, pin.registryMetadataRelativePath));
    assert.equal(sha256(metaBytes), pin.registryMetadataSha256);
    const meta = JSON.parse(metaBytes);
    assert.equal(meta.name, 'three');
    assert.equal(meta.version, pin.version);
    assert.equal(meta.dist.tarball, pin.tarballUrl);
    assert.equal(meta.dist.integrity, pin.npmIntegrity);
    const packageRoot = path.join(inputsRoot, safeRelative(pin.extractedRelativePath));
    const packageMeta = readJSON(boundedFile(packageRoot, 'package.json'));
    assert.equal(packageMeta.name, 'three');
    assert.equal(packageMeta.version, pin.version);
    assert.equal(packageMeta.types, undefined);
    assert.equal(packageMeta.typings, undefined);
    for (const row of pin.packageFiles) checkedBytes(fs.readFileSync(boundedFile(packageRoot, row.path)), row);
    const rows = treeInventory(packageRoot);
    assert.equal(rows.length, pin.packageFileCount, 'three extracted file count mismatch');
    assert.equal(inventoryHash(rows), pin.installedTreeSha256, 'three extracted tree mismatch');
    assert(!rows.some((row) => row.path.endsWith('.d.ts')), 'update declaration evidence if declarations appear');
    return { archiveSha256: pin.artifactSha256, installedTreeSha256: pin.installedTreeSha256, files: rows };
}
function readEngineReceipt(file) {
    if (!file) return null;
    const bytes = fs.readFileSync(file),
        receipt = JSON.parse(bytes);
    assert.equal(receipt.schema, 'upstream-agent-engine-artifacts/1');
    for (const key of ['control', 'candidate']) {
        const row = receipt[key];
        if (!row) continue;
        assert(isSHA256(row.sha256), `${key} exact artifact SHA256 required`);
        assert.equal(sha256(fs.readFileSync(row.artifactPath)), row.sha256, `${key} artifact mismatch`);
        assert(row.provenance && typeof row.provenance.artifactKind === 'string');
        if (key === 'control')
            assert.equal(row.provenance.sourceCommit, MAIN, 'control source must be the frozen main commit');
    }
    return { sha256: sha256(bytes), receipt };
}
function verifyThreeDeclarations(manifest, repoRoot, inputsRoot) {
    const pin = manifest.threeBaseline.declarations;
    assert(pin && isSHA256(pin.manifestSha256), 'frozen Three declarations manifest required');
    const bytes = fs.readFileSync(boundedFile(repoRoot, pin.manifestPath));
    assert.equal(sha256(bytes), pin.manifestSha256, 'Three declarations manifest changed');
    const spec = JSON.parse(bytes);
    assert.equal(spec.schema, 'upstream-three-declarations/1');
    assert.equal(spec.compilerContract, 'upstream-sdk-types/3');
    assert.equal(spec.engineVersion, '0.186.1');
    assert.equal(spec.declarationPackage, '@types/three');
    assert.equal(spec.declarationVersion, '0.186.0');
    const locked = fs.readFileSync(boundedFile(repoRoot, spec.lock.repositoryPath));
    const inputLock = boundedFile(inputsRoot, spec.lock.inputRelativePath);
    assert.equal(sha256(locked), spec.lock.sha256);
    assert.deepEqual(fs.readFileSync(inputLock), locked, 'declaration input lock differs from committed lock');
    const sdk = require('./references/sdk-reference.cjs');
    const consumerDir = path.join(inputsRoot, safeRelative(spec.consumerRelativePath));
    const packages = spec.packages.map((row) => {
        const metadataBytes = fs.readFileSync(boundedFile(inputsRoot, row.relativePaths.metadata));
        assert.equal(sha256(metadataBytes), row.metadataSha256);
        const metadata = JSON.parse(metadataBytes);
        assert.equal(metadata.name, row.name);
        assert.equal(metadata.version, row.version);
        assert.equal(metadata.dist.tarball, row.archiveURL);
        assert.equal(metadata.dist.integrity, row.integrity);
        const record = sdk.verifyInstalledArtifact(
            {
                archivePath: boundedFile(inputsRoot, row.relativePaths.archive),
                installedPath: path.join(inputsRoot, safeRelative(row.relativePaths.installed)),
                archivePrefix: row.archivePrefix,
                sha256: row.sha256,
            },
            consumerDir,
            row.name,
            row.version,
        );
        assert.equal(record.treeSha256, row.installedTreeSha256);
        return record;
    });
    const declarations = packages.find((row) => row.name === '@types/three');
    assert(declarations && declarations.version === '0.186.0');
    sdk.verifyDeclarationClosure(
        {
            engine: 'three',
            declarationDependencies: packages.filter((row) => row !== declarations),
            declarationLock: { path: inputLock, sha256: spec.lock.sha256 },
        },
        declarations,
        consumerDir,
    );
    return {
        manifestSha256: pin.manifestSha256,
        lockSha256: spec.lock.sha256,
        declarationArchiveSha256: declarations.sha256,
        packages: packages.map(({ name, version, sha256, treeSha256 }) => ({ name, version, sha256, treeSha256 })),
        status: 'IDENTITIES_VERIFIED_NOT_BROWSER_EXECUTED',
    };
}
function pairSchedule(manifest) {
    return manifest.tasks.flatMap((task, taskIndex) =>
        task.repetitionSeeds.map((seed, repeatIndex) => ({
            pairId: `${task.id}-R${repeatIndex + 1}`,
            taskId: task.id,
            repetition: repeatIndex + 1,
            seed,
            commonInputSha256: task.commonInputSha256,
            armOrder: (taskIndex + repeatIndex) % 2 === 0 ? ['cocosair', 'three'] : ['three', 'cocosair'],
            status: 'PREPARED_NOT_RUN',
        })),
    );
}
function prepareInputs(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '../../..'));
    const inputsRoot = path.resolve(options.inputsRoot || `${repoRoot}-inputs`);
    const manifestPath = path.resolve(options.manifest || path.join(__dirname, 'public-inputs.json'));
    const manifestBytes = fs.readFileSync(manifestPath);
    const manifest = validateManifest(JSON.parse(manifestBytes));
    const files = new Map();
    function stage(relative, bytes) {
        safeRelative(relative);
        assert(!files.has(relative), `duplicate output ${relative}`);
        files.set(relative, bytes);
    }
    for (const [profile, config] of Object.entries(manifest.knowledgeProfiles))
        for (const row of config.files) {
            const bytes =
                profile === 'old'
                    ? oldKnowledgeBytes(repoRoot, inputsRoot, row)
                    : currentKnowledgeBytes(repoRoot, row, options.currentKnowledgeCommit);
            stage(`knowledge/${profile}/cocosair/${row.path}`, bytes);
        }
    const three = verifyThree(manifest, inputsRoot);
    const threeDeclarations = verifyThreeDeclarations(manifest, repoRoot, inputsRoot);
    const tooling = verifyTooling(manifest, inputsRoot);
    for (const profile of ['old', 'current'])
        for (const row of manifest.threeKnowledge.files) {
            const root = path.join(inputsRoot, manifest.threeBaseline.extractedRelativePath);
            stage(
                `knowledge/${profile}/three/${row.path}`,
                checkedBytes(fs.readFileSync(boundedFile(root, row.path)), row),
            );
        }
    assert.equal(inventoryHash(manifest.threeKnowledge.files), manifest.threeKnowledge.inventorySha256);
    for (const row of manifest.resources) stage(row.publicPath, resourceBytes(repoRoot, row));
    verifyAssetClosure(manifest, files);
    for (const task of manifest.tasks)
        stage(
            `tasks/${task.id}.json`,
            jsonBytes({ ...commonInput(manifest, task), commonInputSha256: task.commonInputSha256 }),
        );
    stage('TOOL-POLICY.json', jsonBytes({ tool: manifest.toolContract, network: manifest.networkContract }));
    const inventory = [...files].map(([file, bytes]) => ({ path: file, bytes: bytes.length, sha256: sha256(bytes) }));
    const engineArtifacts = readEngineReceipt(options.engineReceipt);
    const requirements = manifest.remainingRequirements.filter(
        (row) =>
            !(row.field === 'engineArtifacts.control' && engineArtifacts?.receipt.control) &&
            !(row.field === 'engineArtifacts.candidate' && engineArtifacts?.receipt.candidate),
    );
    const report = {
        schema: 'upstream-agent-input-preparation/1',
        status: 'PREPARED_NOT_RUN',
        publicPreparationComplete: true,
        generationAllowed: false,
        manifestSha256: sha256(manifestBytes),
        cohort: manifest.cohort,
        pairSchedule: pairSchedule(manifest),
        configurationScope:
            'Thirty-six pairs and seventy-two arms PER separately frozen configuration; schedule does not establish semantic equivalence or launch authority.',
        commonInputHashes: Object.fromEntries(manifest.tasks.map((task) => [task.id, task.commonInputSha256])),
        knowledgeInventoryHashes: {
            old: manifest.knowledgeProfiles.old.inventorySha256,
            current: manifest.knowledgeProfiles.current.inventorySha256,
            three: manifest.threeKnowledge.inventorySha256,
        },
        currentKnowledgeProvenance: {
            origin: options.currentKnowledgeCommit ? 'explicit-frozen-git-replay' : 'current-checkout',
            sourceCommit: options.currentKnowledgeCommit || null,
            inventorySha256: manifest.knowledgeProfiles.current.inventorySha256,
            scope: 'Exact manifest corpus only; replay does not establish current candidate knowledge or acceptance.',
        },
        oldKnowledgeProvenance: {
            sourceCommit: MAIN,
            files: manifest.knowledgeProfiles.old.files,
            absentByMainTree: manifest.knowledgeProfiles.old.absentByMainTree,
        },
        threeBaseline: {
            version: '0.186.1',
            artifactSha256: three.archiveSha256,
            installedTreeSha256: three.installedTreeSha256,
            npmIntegrity: manifest.threeBaseline.npmIntegrity,
            fileCount: three.files.length,
        },
        engineArtifacts,
        threeDeclarations,
        toolingEvidence: tooling,
        materializationContract: manifest.materializationContract,
        publicInventorySha256: inventoryHash(inventory),
        publicInventory: inventory,
        remainingRequirements: requirements,
        observations: manifest.observations,
        claims: [
            'Static inventory/byte verification only; no model, browser, reference run or success metric.',
            'No CB21 model selection, historical K0 label, or scripted reference is inherited as generated output.',
            'Control/candidate receipt byte checks do not establish their runtime acceptance or paired semantics.',
        ],
    };
    if (options.execute) {
        const publicRoot = path.resolve(options.publicRoot || path.join(inputsRoot, 'agent-input-preparation/public'));
        const out = path.resolve(options.out || path.join(repoRoot, 'output/upstream-update/agent-input-preparation'));
        assert(
            !fs.existsSync(publicRoot),
            'public output already exists; use a new directory, never overwrite a frozen input',
        );
        assert(
            !fs.existsSync(out),
            'report output already exists; use a new directory to retain immutable preparation receipts',
        );
        assert(
            publicRoot !== repoRoot && !publicRoot.startsWith(repoRoot + path.sep),
            'public inputs must be outside the source repository',
        );
        assert(
            publicRoot !== out && !publicRoot.startsWith(out + path.sep) && !out.startsWith(publicRoot + path.sep),
            'public and protected receipt roots must be separate',
        );
        fs.mkdirSync(publicRoot, { recursive: true });
        for (const [relative, bytes] of files) {
            const destination = path.join(publicRoot, relative);
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            fs.writeFileSync(destination, bytes, { flag: 'wx', mode: 0o444 });
        }
        fs.mkdirSync(out, { recursive: true });
        fs.writeFileSync(path.join(out, 'report.json'), jsonBytes(report), { flag: 'wx' });
        fs.writeFileSync(path.join(out, 'three-package-inventory.json'), jsonBytes(three.files), { flag: 'wx' });
        fs.writeFileSync(path.join(out, 'public-inputs.json'), manifestBytes, { flag: 'wx' });
    }
    return report;
}
module.exports = {
    SCHEMA,
    MAIN,
    TASK_IDS,
    SEEDS,
    sha256,
    canonicalHash,
    inventoryHash,
    commonInput,
    validateManifest,
    checkedBytes,
    currentKnowledgeBytes,
    boundedFile,
    treeInventory,
    verifyAssetClosure,
    pairSchedule,
    readEngineReceipt,
    prepareInputs,
    verifyThreeDeclarations,
};
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.includes('--help')) {
        console.log(`Usage: node tools/benchmark/upstream/prepare-inputs.cjs [--execute] [--manifest=PATH]
  [--repo-root=PATH] [--inputs-root=PATH] [--public-root=PATH] [--out=PATH]
  [--engine-receipt=PATH] [--current-knowledge-commit=40_HEX_COMMIT]
Default: verify frozen current-profile hashes against the active checkout; drift fails.
Explicit commit: replay only the exact historical current-profile corpus from Git.
This is NOT current merged candidate inputs. Old-profile provenance remains unchanged.
A new candidate campaign must freeze a new version/manifest and rerun both compared
configurations; historical replay must not be mixed into its current-knowledge claim.
No model/browser/reference execution or acceptance is established by preparation.`);
        process.exit(0);
    }
    const value = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
    try {
        const report = prepareInputs({
            execute: args.includes('--execute'),
            repoRoot: value('repo-root'),
            inputsRoot: value('inputs-root'),
            manifest: value('manifest'),
            currentKnowledgeCommit: value('current-knowledge-commit'),
            publicRoot: value('public-root'),
            out: value('out'),
            engineReceipt: value('engine-receipt'),
        });
        console.log(JSON.stringify(report, null, 2));
    } catch (error) {
        console.error(
            JSON.stringify(
                {
                    schema: 'upstream-agent-input-preparation/1',
                    status: 'INPUT_ERROR',
                    publicPreparationComplete: false,
                    generationAllowed: false,
                    error: error.message,
                },
                null,
                2,
            ),
        );
        process.exitCode = 1;
    }
}
