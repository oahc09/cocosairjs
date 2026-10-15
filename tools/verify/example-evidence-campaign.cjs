/** Fixed-snapshot example evidence. This protocol never promotes or demotes examples.
 * Raw attempts and segments are immutable and incomplete; only an exact, current,
 * fully closed union can become a completed segmented campaign. All hashes are SHA256.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');

const REPO = path.resolve(__dirname, '..', '..');
const SCHEMAS = Object.freeze({
    freeze: 'cocos-air.example-evidence-freeze/v1',
    attempt: 'cocos-air.example-evidence-attempt/v1',
    segment: 'cocos-air.example-evidence-segment/v1',
    campaign: 'cocos-air.example-evidence-campaign/v1',
    publication: 'cocos-air.example-evidence-publication/v1',
});
const MODE = 'segmented-fixed-snapshot';
const HEX64 = /^[a-f0-9]{64}$/;
const CUSTODY_ROLES = Object.freeze(['raw', 'nodeReceipt', 'journal', 'stdout', 'stderr']);
const REQUIRED_FILES = [
    '.github/workflows/format.yml',
    '.github/workflows/example-evidence.yml',
    'package.json',
    'package-lock.json',
    'examples/files.json',
    'docs/example-api-inventory.json',
    'tools/verify/example-evidence-custodian.py',
    'build/cocosair.module.js',
    'build/cocosair.module.d.ts',
    'build/cocosair.module.js.map',
    'build/cocosair.module.min.js',
    'build/cocosair.module.min.js.map',
    'node_modules/esbuild/package.json',
    'node_modules/typescript/package.json',
    'build/spark.module.js',
    'build/spark.module.d.ts',
    'build/spark.module.js.map',
];
const INPUT_TREES = [
    'examples',
    'src',
    'vendor',
    'tools/verify',
    'tools/benchmark/runner',
    'tools/benchmark/validators',
    'tools/debug',
    'tools/recipes',
    'tools/examples',
    'tools/dev',
    'tools/build',
];
const OPTIONAL_TREES = ['build/gltf-decoders', 'build/spark-types', 'build/fflate', 'build/devtools'];
const OPTIONAL_FILES = ['build/package.json', 'build/cocosair.legacy.d.ts', 'build/spark.module.meta.json'];
const DEFAULT_LIMITS = Object.freeze({
    startupMs: 15000,
    closeMs: 4000,
    innerMs: 120000,
    abortMs: 125000,
    forceMs: 133000,
    finalMs: 139000,
});

function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') {
        return (
            '{' +
            Object.keys(value)
                .sort()
                .filter((key) => value[key] !== undefined)
                .map((key) => JSON.stringify(key) + ':' + stable(value[key]))
                .join(',') +
            '}'
        );
    }
    return JSON.stringify(value);
}
function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}
function objectDigest(value) {
    return sha256(stable(value));
}
function same(a, b) {
    return stable(a) === stable(b);
}
function invariant(ok, message) {
    if (!ok) throw new Error(message);
}
function posix(value) {
    return value.split(path.sep).join('/');
}
function within(root, file) {
    const rel = path.relative(path.resolve(root), path.resolve(file));
    return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}
function regularFile(file) {
    const st = fs.lstatSync(file);
    invariant(
        !st.isSymbolicLink() && st.isFile() && fs.realpathSync(file) === path.resolve(file),
        `not a regular in-tree file: ${file}`,
    );
    return st;
}
function fileDigest(file) {
    regularFile(file);
    const bytes = fs.readFileSync(file);
    return { bytes: bytes.length, sha256: sha256(bytes) };
}
function walk(root, relative, out) {
    const file = path.resolve(root, relative);
    invariant(within(root, file), `input escapes repository: ${relative}`);
    const st = fs.lstatSync(file);
    invariant(!st.isSymbolicLink(), `symbolic link input forbidden: ${relative}`);
    if (st.isDirectory()) {
        for (const name of fs.readdirSync(file).sort()) walk(root, posix(path.join(relative, name)), out);
    } else {
        invariant(st.isFile(), `nonregular input forbidden: ${relative}`);
        out.set(posix(relative), { path: posix(relative), ...fileDigest(file) });
    }
}
function promotionInput(relative) {
    return relative === 'examples/files.json' || /^examples\/.+\/example\.json$/.test(relative);
}
function normalizedInput(repo, entry) {
    if (!promotionInput(entry.path)) return entry;
    const value = JSON.parse(fs.readFileSync(path.join(repo, entry.path), 'utf8'));
    if (entry.path === 'examples/files.json') {
        invariant(Array.isArray(value.examples), 'invalid manifest examples');
        for (const item of value.examples) delete item.promotion;
    } else delete value.promotion;
    const bytes = Buffer.from(JSON.stringify(value));
    return { path: entry.path, bytes: bytes.length, sha256: sha256(bytes) };
}
function collectInputs(repo = REPO) {
    const files = new Map();
    for (const rel of REQUIRED_FILES) {
        regularFile(path.join(repo, rel));
        walk(repo, rel, files);
    }
    for (const rel of INPUT_TREES) walk(repo, rel, files);
    for (const rel of [...OPTIONAL_TREES, ...OPTIONAL_FILES]) {
        if (fs.existsSync(path.join(repo, rel))) walk(repo, rel, files);
    }
    return [...files.values()]
        .map((entry) => normalizedInput(repo, entry))
        .sort((a, b) => a.path.localeCompare(b.path));
}
function collectInputDigest(repo = REPO) {
    return objectDigest(collectInputs(repo));
}
function collectRawInputs(repo, inputs) {
    return inputs
        .filter((entry) => promotionInput(entry.path))
        .map((entry) => ({ path: entry.path, ...fileDigest(path.join(repo, entry.path)) }));
}
function promotionBaseline(repo, scope) {
    return scope.map((entry) => {
        const spec = JSON.parse(fs.readFileSync(path.join(repo, 'examples', entry.dir, 'example.json'), 'utf8'));
        return {
            id: entry.id,
            dir: entry.dir,
            status: spec.status,
            hadPromotion: Object.hasOwn(spec, 'promotion'),
            promotion: spec.promotion,
        };
    });
}
function claimedApis(spec) {
    return [...new Set([...(spec.api?.claims || []), ...(spec.api?.evidence || []).map((e) => e.api)])].sort();
}
function declaredValidators(spec) {
    const v = spec.validation || {};
    return [
        ...new Set([
            ...(spec.ready?.validators || []),
            ...(v.functional || []),
            ...(v.visual || []),
            ...(v.lifecycle || []),
            ...(v.capability || []),
            ...(v.interaction || []).map((id) => `interaction:${id}`),
        ]),
    ].sort();
}
function modeSpecs(spec) {
    invariant(!spec.bench?.apiVariants || Array.isArray(spec.bench.apiVariants), 'apiVariants must be an array');
    return [
        spec,
        ...(spec.bench?.apiVariants || []).map((variant, index) => ({
            ...spec,
            scene: { ...spec.scene, expectedGraph: { nodes: variant.nodes } },
            interaction: { steps: variant.steps },
            bench: { ...spec.bench, entryQuery: variant.query, artifactSuffix: '-mode-' + (index + 1) },
        })),
    ];
}
function collectScope(repo = REPO) {
    const common = require('./example-spec-common.cjs');
    const trace = require('./api-trace.cjs');
    const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'examples/files.json'), 'utf8'));
    invariant(Array.isArray(manifest.examples) && manifest.examples.length > 0, 'empty or invalid example manifest');
    const ids = new Set();
    const dirs = new Set();
    const scope = [];
    const discovered = new Set();
    (function discover(dir) {
        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, item.name);
            invariant(!item.isSymbolicLink(), `symbolic link example input forbidden: ${file}`);
            if (item.isDirectory()) discover(file);
            else if (item.name === 'example.json')
                discovered.add(posix(path.relative(path.join(repo, 'examples'), path.dirname(file))));
        }
    })(path.join(repo, 'examples'));
    invariant(
        discovered.size === manifest.examples.length,
        'manifest omits/disagrees with discovered example specifications',
    );
    for (const entry of manifest.examples) {
        invariant(typeof entry.id === 'string' && /^[\w-]+$/.test(entry.id), 'invalid manifest example ID');
        invariant(
            typeof entry.dir === 'string' && /^[\w-]+(?:\/[\w-]+)*$/.test(entry.dir),
            `invalid example dir: ${entry.id}`,
        );
        invariant(!ids.has(entry.id) && !dirs.has(entry.dir), `duplicate manifest ID or dir: ${entry.id}`);
        ids.add(entry.id);
        dirs.add(entry.dir);
        invariant(discovered.has(entry.dir), `manifest dir not discovered: ${entry.dir}`);
        const dir = path.join(repo, 'examples', entry.dir);
        const spec = JSON.parse(fs.readFileSync(path.join(dir, 'example.json'), 'utf8'));
        invariant(spec.id === entry.id, `manifest/spec ID mismatch: ${entry.id}`);
        invariant(
            Boolean(spec.requiresDevTools) === Boolean(entry.requiresDevTools),
            `manifest/spec DevTools mismatch: ${entry.id}`,
        );
        invariant(
            spec.status === entry.status && same(spec.bench, entry.bench),
            `manifest/spec contract mismatch: ${entry.id}`,
        );
        if (entry.requiresDevTools) continue;
        regularFile(path.join(dir, 'index.html'));
        const seenQueries = new Set();
        const modes = modeSpecs(spec).map((modeSpec, index) => {
            const query = index ? spec.bench.apiVariants[index - 1].query : spec.bench?.entryQuery || '';
            invariant(
                typeof query === 'string' && !seenQueries.has(query),
                `duplicate/invalid mode query: ${entry.id}`,
            );
            seenQueries.add(query);
            return {
                id: index ? `variant:${index}` : 'primary',
                query,
                specFingerprint: common.specFingerprintOf(modeSpec),
                validators: declaredValidators(modeSpec),
                viewport: modeSpec.bench?.viewport || { width: 480, height: 360 },
            };
        });
        scope.push({
            id: entry.id,
            dir: entry.dir,
            shell: spec.bench?.mode === 'ui-shell',
            specFingerprint: common.specFingerprintOf(spec),
            sourceFingerprint: trace.sourceFingerprint(dir),
            apis: claimedApis(spec),
            modes,
        });
    }
    invariant(scope.length > 0, 'empty non-DevTools scope');
    return scope;
}
function validateRuntimeIdentity(identity, limits = DEFAULT_LIMITS) {
    invariant(identity && identity.traceOn === true, 'runtime traceOn must be true');
    invariant(['chromium', 'firefox', 'webkit'].includes(identity.browserType), 'invalid browserType');
    invariant(
        typeof identity.playwrightVersion === 'string' && identity.playwrightVersion.length > 0,
        'missing Playwright version',
    );
    invariant(
        typeof identity.executableVersion === 'string' && identity.executableVersion.length > 0,
        'missing browser version',
    );
    invariant(HEX64.test(identity.executableSha256), 'missing browser executable SHA256');
    invariant(
        Array.isArray(identity.launchArgs) && identity.launchArgs.every((arg) => typeof arg === 'string'),
        'invalid launchArgs',
    );
    const custody = identity.custody;
    invariant(
        custody?.schemaVersion === 'example-evidence-custody-runtime/1' &&
            custody.platform === 'linux' &&
            custody.ipc === 'inherited-anonymous-pipes/v1',
        'missing/unknown kernel custody runtime identity',
    );
    invariant(
        typeof custody.python?.executablePath === 'string' &&
            path.isAbsolute(custody.python.executablePath) &&
            /^Python 3\.\d+(?:\.\d+)?/.test(custody.python.version) &&
            HEX64.test(custody.python.sha256),
        'invalid custody Python interpreter identity',
    );
    invariant(
        typeof custody.helper?.path === 'string' &&
            path.isAbsolute(custody.helper.path) &&
            path.basename(custody.helper.path) === 'example-evidence-custodian.py' &&
            HEX64.test(custody.helper.sha256),
        'invalid custody helper identity',
    );
    for (const key of Object.keys(DEFAULT_LIMITS))
        invariant(Number.isInteger(limits[key]) && limits[key] > 0, `invalid limit ${key}`);
    invariant(limits.startupMs <= 15000 && limits.closeMs <= 4000, 'startup/close limits exceed contract');
    invariant(
        limits.startupMs < limits.innerMs &&
            limits.innerMs < limits.abortMs &&
            limits.abortMs < limits.forceMs &&
            limits.forceMs < limits.finalMs &&
            limits.finalMs <= 300000,
        'invalid bounded deadline ordering',
    );
}
function collectRuntimeIdentity(browserType = 'chromium') {
    const launch = require('./browser-engines.cjs').launchOptions(browserType);
    const executablePath = launch.executablePath;
    const executableVersion = childProcess
        .execFileSync(executablePath, ['--version'], { encoding: 'utf8', timeout: 15000 })
        .trim();
    const identity = {
        browserType,
        executablePath,
        playwrightVersion: require('playwright/package.json').version,
        executableVersion,
        executableSha256: fileDigest(executablePath).sha256,
        launchArgs: launch.args || [],
        traceOn: true,
        custody: require('./example-evidence-supervisor.cjs').getCustodyRuntimeIdentity(),
        host: { executablePath, platform: process.platform, arch: process.arch },
    };
    validateRuntimeIdentity(identity);
    return identity;
}
function freezeCampaign({ repo = REPO, out, runtimeIdentity, limits = DEFAULT_LIMITS } = {}) {
    runtimeIdentity = runtimeIdentity || collectRuntimeIdentity();
    validateRuntimeIdentity(runtimeIdentity, limits);
    const inputs = collectInputs(repo);
    invariant(
        inputs.find((entry) => entry.path === 'tools/verify/example-evidence-custodian.py')?.sha256 ===
            runtimeIdentity.custody.helper.sha256,
        'custody helper differs from frozen source',
    );
    const scope = collectScope(repo);
    const freeze = {
        schema: SCHEMAS.freeze,
        mode: MODE,
        createdAt: new Date().toISOString(),
        runtimeIdentity,
        limits: { ...limits },
        scope,
        inputs,
        rawInputs: collectRawInputs(repo, inputs),
        promotionBaseline: promotionBaseline(repo, scope),
        manifestPromotionBaseline: JSON.parse(
            fs.readFileSync(path.join(repo, 'examples/files.json'), 'utf8'),
        ).examples.map((e) => ({ id: e.id, hadPromotion: Object.hasOwn(e, 'promotion'), promotion: e.promotion })),
        inputDigest: objectDigest(inputs),
        candidateFingerprint: require('./api-trace.cjs').candidateFingerprint(repo),
    };
    freeze.freezeId = objectDigest(freeze);
    if (out) writeImmutable(out, freeze);
    return freeze;
}
function validateFreeze(freeze, { repo = REPO, checkInputs = true, publication, results } = {}) {
    invariant(freeze?.schema === SCHEMAS.freeze && freeze.mode === MODE, 'unknown freeze schema/mode');
    const { freezeId, ...body } = freeze;
    invariant(HEX64.test(freezeId) && freezeId === objectDigest(body), 'freeze identity mismatch');
    invariant(Number.isFinite(Date.parse(freeze.createdAt)), 'invalid freeze timestamp');
    validateRuntimeIdentity(freeze.runtimeIdentity, freeze.limits);
    invariant(
        Array.isArray(freeze.inputs) && freeze.inputs.length > 0 && freeze.inputDigest === objectDigest(freeze.inputs),
        'invalid input digest',
    );
    invariant(Array.isArray(freeze.scope) && freeze.scope.length > 0, 'empty frozen scope');
    invariant(
        freeze.inputs.find((entry) => entry.path === 'tools/verify/example-evidence-custodian.py')?.sha256 ===
            freeze.runtimeIdentity.custody.helper.sha256,
        'custody helper differs from frozen source',
    );
    if (checkInputs) {
        invariant(same(freeze.inputs, collectInputs(repo)), 'frozen inputs changed');
        if (publication) validatePublication(freeze, publication, results, repo);
        else invariant(same(freeze.rawInputs, collectRawInputs(repo, freeze.inputs)), 'raw frozen inputs changed');
        invariant(same(freeze.scope, collectScope(repo)), 'frozen manifest scope or fingerprints changed');
        invariant(
            freeze.candidateFingerprint === require('./api-trace.cjs').candidateFingerprint(repo),
            'candidate fingerprint changed',
        );
    }
    return freeze;
}
function validatePublication(freeze, publication, results, repo = REPO) {
    invariant(publication?.schema === SCHEMAS.publication, 'unknown publication schema');
    invariant(Array.isArray(results) && results.length === freeze.scope.length, 'publication needs full results');
    const currentRaw = collectRawInputs(repo, freeze.inputs);
    const changed = currentRaw.flatMap((entry, index) =>
        same(entry, freeze.rawInputs[index])
            ? []
            : [{ ...entry, before: { bytes: freeze.rawInputs[index].bytes, sha256: freeze.rawInputs[index].sha256 } }],
    );
    invariant(same(publication.files, changed), 'publication raw artifact manifest mismatch');
    const common = require('./example-spec-common.cjs');
    const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'examples/files.json'), 'utf8'));
    for (const baseline of freeze.promotionBaseline) {
        const spec = JSON.parse(fs.readFileSync(path.join(repo, 'examples', baseline.dir, 'example.json'), 'utf8'));
        const entry = manifest.examples.find((e) => e.id === baseline.id);
        const row = results.find((r) => r.id === baseline.id);
        invariant(row && row.result === 'PASS', 'publication contains missing/failed row');
        if (baseline.status === 'stable')
            invariant(
                baseline.hadPromotion &&
                    freeze.manifestPromotionBaseline.find((item) => item.id === baseline.id)?.hadPromotion,
                `publication cannot add promotion fields: ${baseline.id}`,
            );
        const expected = baseline.status === 'stable' ? common.promotionOf(row) : baseline.promotion;
        invariant(baseline.status !== 'stable' || expected, 'publication stable row has no proof');
        invariant(same(spec.promotion, expected), `publication invalid promotion: ${baseline.id}`);
        if (baseline.status === 'stable')
            invariant(same(entry?.promotion, expected), `publication manifest promotion mismatch: ${baseline.id}`);
        else
            invariant(
                Object.hasOwn(spec, 'promotion') === baseline.hadPromotion,
                `publication changed draft promotion: ${baseline.id}`,
            );
    }
    for (const baseline of freeze.manifestPromotionBaseline) {
        const before = freeze.promotionBaseline.find((entry) => entry.id === baseline.id);
        if (before?.status === 'stable') continue;
        const entry = manifest.examples.find((item) => item.id === baseline.id);
        invariant(
            entry &&
                same(entry.promotion, baseline.promotion) &&
                Object.hasOwn(entry, 'promotion') === baseline.hadPromotion,
            `publication changed draft/DevTools manifest promotion: ${baseline.id}`,
        );
    }
    // No DevTools example may be modified by this ordinary-browser publication.
    const permitted = new Set(
        freeze.promotionBaseline.filter((b) => b.status === 'stable').map((b) => `examples/${b.dir}/example.json`),
    );
    permitted.add('examples/files.json');
    for (const entry of changed)
        invariant(permitted.has(entry.path), `publication changed forbidden file: ${entry.path}`);
}
function buildPublication(freeze, results, { repo = REPO } = {}) {
    const currentRaw = collectRawInputs(repo, freeze.inputs);
    const publication = {
        schema: SCHEMAS.publication,
        files: currentRaw.flatMap((entry, index) =>
            same(entry, freeze.rawInputs[index])
                ? []
                : [
                      {
                          ...entry,
                          before: { bytes: freeze.rawInputs[index].bytes, sha256: freeze.rawInputs[index].sha256 },
                      },
                  ],
        ),
    };
    invariant(same(freeze.inputs, collectInputs(repo)), 'publication changed non-promotion inputs');
    validatePublication(freeze, publication, results, repo);
    return publication;
}
function assertFrozenInputs(freeze, { repo = REPO, runtimeIdentity } = {}) {
    validateFreeze(freeze, { repo });
    if (runtimeIdentity) invariant(same(freeze.runtimeIdentity, runtimeIdentity), 'runtime identity changed');
    return freeze.inputDigest;
}
function writeImmutable(file, value) {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
function reference(file, owner) {
    return { path: posix(path.relative(path.dirname(path.resolve(owner)), path.resolve(file))), ...fileDigest(file) };
}
function resolveRef(ref, owner, { repo, portable = false } = {}) {
    invariant(
        ref && typeof ref.path === 'string' && ref.path && !path.isAbsolute(ref.path) && !ref.path.includes('\\'),
        'artifact reference must be relative POSIX path',
    );
    invariant(Number.isInteger(ref.bytes) && ref.bytes >= 0 && HEX64.test(ref.sha256), 'invalid artifact bytes/SHA256');
    const file = path.resolve(path.dirname(owner), ref.path);
    if (portable) invariant(within(repo, file), `published artifact is outside repository: ${ref.path}`);
    // Reject symlink traversal, including directory components, rather than hashing an escape target.
    let cursor = file;
    for (;;) {
        invariant(!fs.lstatSync(cursor).isSymbolicLink(), `symbolic link artifact forbidden: ${ref.path}`);
        const parent = path.dirname(cursor);
        if (parent === cursor) break;
        cursor = parent;
    }
    const current = fileDigest(file);
    invariant(current.bytes === ref.bytes && current.sha256 === ref.sha256, `artifact changed: ${ref.path}`);
    return file;
}
function modeRows(result, entry) {
    if (entry.modes.length > 1) {
        invariant(
            Array.isArray(result.modeEvidence) && result.modeEvidence.length === entry.modes.length,
            `${entry.id}: missing/extra mode evidence`,
        );
        return result.modeEvidence;
    }
    invariant(result.modeEvidence === undefined, `${entry.id}: unexpected mode evidence for a single-mode example`);
    return [result];
}
function writeAttempt({ repo = REPO, freeze, report, out }) {
    invariant(out, 'attempt output required');
    const entry = freeze.scope.find((e) => e.id === report.id);
    invariant(entry, `unknown attempt ID: ${report.id}`);
    const value = JSON.parse(JSON.stringify({ ...report, schema: SCHEMAS.attempt, freezeId: freeze.freezeId }));
    value.rawCollector = fs.existsSync(report.receipt.output.report)
        ? reference(report.receipt.output.report, out)
        : null;
    value.admissionErrors = value.rawCollector ? [] : ['raw collector report absent'];
    value.rawReceipt = reference(report.receipt.output.receipt, out);
    value.logs = ['stdout', 'stderr'].map((stream) => ({ stream, ...reference(report.receipt.output[stream], out) }));
    value.custodyArtifacts = {};
    for (const role of CUSTODY_ROLES) {
        const source = report.receipt.custody?.artifacts?.[role];
        if (!source || typeof source.path !== 'string' || !fs.existsSync(source.path)) {
            value.custodyArtifacts[role] = null;
            value.admissionErrors.push(`custody ${role} artifact absent`);
            continue;
        }
        const ref = reference(source.path, out);
        value.custodyArtifacts[role] = ref;
        if (source.bytes !== ref.bytes || source.sha256 !== ref.sha256)
            value.admissionErrors.push(`custody ${role} artifact changed before admission`);
    }

    const rows = value.result?.modeEvidence || (value.result ? [value.result] : []);
    const originFiles = [
        out,
        report.receipt.output.report,
        report.receipt.output.receipt,
        report.receipt.output.stdout,
        report.receipt.output.stderr,
    ];
    for (const role of CUSTODY_ROLES) {
        const source = report.receipt.custody?.artifacts?.[role];
        if (typeof source?.path === 'string') originFiles.push(path.resolve(source.path));
    }
    for (const row of rows) {
        if (row.artifact?.path) originFiles.push(path.resolve(repo, row.artifact.path));
        for (const response of row.networkAssets || [])
            if (response.bodyArtifact?.path) originFiles.push(path.resolve(repo, response.bodyArtifact.path));
    }
    let captureRoot = path.dirname(path.resolve(out));
    while (!originFiles.every((file) => within(captureRoot, file))) captureRoot = path.dirname(captureRoot);
    if (report.captureRoot) captureRoot = path.resolve(report.captureRoot);
    invariant(
        captureRoot !== path.parse(captureRoot).root && originFiles.every((file) => within(captureRoot, file)),
        'attempt artifacts escape capture root',
    );
    value.origin = { repo: path.resolve(repo), reportDirectory: path.dirname(path.resolve(out)), captureRoot };
    value.artifacts = [];
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        for (const resource of row.networkAssets || []) {
            if (resource.bodyArtifact) {
                const file = path.resolve(repo, resource.bodyArtifact.path);
                const ref = reference(file, out);
                invariant(
                    resource.bodyArtifact.sha256 === ref.sha256 && resource.bodyArtifact.bytes === ref.bytes,
                    'response body changed before admission',
                );
                resource.bodyArtifact = ref;
            }
        }
        if (!row.artifact || !(row.artifact.bytes > 0)) continue;
        const file = path.resolve(repo, row.artifact.path);
        const ref = reference(file, out);
        invariant(ref.bytes === row.artifact.bytes, `${entry.id}: screenshot byte count changed before admission`);
        invariant(
            !row.artifact.hash || ref.sha256.startsWith(row.artifact.hash),
            `${entry.id}: screenshot hash changed before admission`,
        );
        value.artifacts.push({ mode: entry.modes[index]?.id, ...ref });
        row.artifact = { path: ref.path, bytes: ref.bytes, hash: ref.sha256 };
    }
    if (value.result?.modeEvidence?.length) {
        value.result.artifact = { ...value.result.modeEvidence[0].artifact };
        value.result.networkAssets = JSON.parse(JSON.stringify(value.result.modeEvidence[0].networkAssets || []));
    }
    writeImmutable(out, value);
    return { id: value.id, attempt: value.attempt, report: { path: path.resolve(out), ...fileDigest(out) } };
}
function createSegment({ freeze, attempts, out, segmentId } = {}) {
    invariant(Array.isArray(attempts) && attempts.length > 0, 'empty segment');
    invariant(out, 'segment output required');
    const segment = {
        schema: SCHEMAS.segment,
        mode: MODE,
        segmentId: segmentId || crypto.randomUUID(),
        freezeId: freeze.freezeId,
        inputDigest: freeze.inputDigest,
        browser: freeze.runtimeIdentity.browserType,
        partial: true,
        completed: false,
        attempts: attempts.map((attempt) => ({
            id: attempt.id,
            attempt: attempt.attempt,
            report: reference(path.resolve(attempt.report.path), out),
        })),
    };
    invariant(
        path.resolve(out) !== path.join(REPO, 'docs/evidence/examples-verified.json'),
        'raw segment cannot overwrite canonical evidence',
    );
    writeImmutable(out, segment);
    return segment;
}
function checkValidators(row, mode, allowApiFailure, spec) {
    invariant(Array.isArray(row.validatorResults) && row.validatorResults.length > 0, `${row.id}: missing validators`);
    const ids = new Set();
    const keys = new Set();
    const perStep = {
        'interaction:button-click': 'buttonText',
        'interaction:select-option': 'selectId',
        'interaction:drag': 'drag',
        'interaction:probe': 'probe',
    };
    for (const check of row.validatorResults) {
        const key = `${check.validatorId}:${check.stepIndex === undefined ? 'summary' : check.stepIndex}`;
        invariant(typeof check.validatorId === 'string' && !keys.has(key), `${row.id}: duplicate/invalid validator`);
        keys.add(key);
        ids.add(check.validatorId);
        if (check.stepIndex !== undefined) {
            invariant(
                perStep[check.validatorId] &&
                    Number.isInteger(check.stepIndex) &&
                    spec.interaction?.steps?.[check.stepIndex]?.[perStep[check.validatorId]],
                `${row.id}: invalid step assertion`,
            );
        }
        invariant(
            check.state === 'PASS' ||
                (allowApiFailure && check.validatorId === 'api-executed' && check.state === 'FAIL'),
            `${row.id}: failed validator ${check.validatorId}`,
        );
    }
    for (const id of mode.validators)
        invariant(keys.has(`${id}:summary`), `${row.id}: missing declared validator ${id}`);
    for (const [validator, property] of Object.entries(perStep)) {
        const expected = (spec.interaction?.steps || []).flatMap((step, index) => (step?.[property] ? [index] : []));
        const actual = row.validatorResults
            .filter((v) => v.validatorId === validator && v.stepIndex !== undefined)
            .map((v) => v.stepIndex)
            .sort((a, b) => a - b);
        invariant(same(expected, actual), `${row.id}: missing/duplicate interaction step ${validator}`);
    }
    const failures = row.validatorResults.filter((v) => v.state !== 'PASS');
    invariant(row.result === (failures.length ? 'FAIL' : 'PASS'), `${row.id}: row result disagrees with validators`);
    invariant(
        Array.isArray(row.errors) && (failures.length > 0 || row.errors.length === 0),
        `${row.id}: unexplained errors`,
    );
}
function checkProofs(row, spec, dir, allowUnobserved = false) {
    const common = require('./example-spec-common.cjs');
    const expectedApis = claimedApis(spec);
    invariant(
        Array.isArray(row.apiProof) && same(row.apiProof.map((p) => p.api).sort(), expectedApis),
        `${row.id}: missing/duplicate/unknown API proof`,
    );
    const units = Object.fromEntries(row.apiProof.map((p) => [p.api, p]));
    const passed = row.validatorResults.filter((v) => v.state === 'PASS').map((v) => v.validatorId);
    const expected = common.apiProofOf(spec, dir, units, passed);
    for (const p of row.apiProof) {
        const recomputed = expected.find((q) => q.api === p.api);
        for (const key of ['api', 'proof', 'state', 'calls', 'reads', 'via', 'mechanism', 'bound', 'bindings']) {
            invariant(same(p[key], recomputed[key]), `${row.id}: inconsistent API ${p.api} ${key}`);
        }
        invariant(
            Number.isFinite(p.calls) && p.calls >= 0 && Number.isFinite(p.reads) && p.reads >= 0,
            `${row.id}: invalid API counters`,
        );
        if (p.state === 'executed') {
            invariant(
                (p.via === 'call' && p.calls > 0) || (p.via === 'read' && p.reads > 0),
                `${row.id}: API execution not observed ${p.api}`,
            );
            invariant(p.proof === 'verified', `${row.id}: executed API lacks validator/source binding ${p.api}`);
        } else if (p.proof === 'attested') {
            invariant(
                p.bound &&
                    p.calls === 0 &&
                    p.reads === 0 &&
                    p.via === null &&
                    ((p.state === 'not-instrumentable' && ['data-member', 'namespace'].includes(p.mechanism)) ||
                        (p.state === 'unresolved' && p.mechanism === 'unresolved')),
                `${row.id}: unsupported attestation ${p.api}`,
            );
        } else {
            invariant(
                allowUnobserved && p.state === 'not-observed' && p.proof === 'unproven',
                `${row.id}: unobserved/unproven API ${p.api}`,
            );
        }
    }
}
function checkResult(result, entry, freeze, repo) {
    invariant(
        result?.id === entry.id &&
            result.result === 'PASS' &&
            Array.isArray(result.errors) &&
            result.errors.length === 0,
        `${entry.id}: failed/partial row`,
    );
    invariant(
        result.specFingerprint === entry.specFingerprint &&
            result.sourceFingerprint === entry.sourceFingerprint &&
            result.candidateFingerprint === freeze.candidateFingerprint,
        `${entry.id}: stale/mixed row fingerprint`,
    );
    const spec = JSON.parse(fs.readFileSync(path.join(repo, 'examples', entry.dir, 'example.json'), 'utf8'));
    const specs = modeSpecs(spec);
    const rows = modeRows(result, entry);
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const mode = entry.modes[index];
        invariant(
            row.id === entry.id &&
                row.specFingerprint === mode.specFingerprint &&
                row.sourceFingerprint === entry.sourceFingerprint &&
                row.candidateFingerprint === freeze.candidateFingerprint,
            `${entry.id}: mode fingerprint mismatch ${mode.id}`,
        );
        if (rows.length > 1) invariant(row.query === mode.query, `${entry.id}: mode query/order mismatch`);
        checkValidators(row, mode, rows.length > 1, specs[index]);
        if (!entry.shell)
            invariant(
                row.instrumentation && row.instrumentation.bytes > 0 && row.instrumentation.hash,
                `${entry.id}: missing API instrumentation`,
            );
        checkProofs(row, specs[index], path.join(repo, 'examples', entry.dir), rows.length > 1);
    }
    if (rows.length > 1) {
        const union = rows[0].apiProof.map(
            (p) => rows.flatMap((r) => r.apiProof).find((q) => q.api === p.api && q.state === 'executed') || p,
        );
        invariant(same(result.apiProof, union), `${entry.id}: mode API union mismatch`);
        for (const p of union)
            invariant(
                ['verified', 'attested'].includes(p.proof) && p.state !== 'not-observed',
                `${entry.id}: unobserved API union`,
            );
        const expectedChecks = rows.flatMap((r, mode) =>
            r.validatorResults.filter((v) => v.validatorId !== 'api-executed').map((v) => ({ ...v, mode })),
        );
        const suppliedChecks = result.validatorResults.filter((v) => v.validatorId !== 'api-executed');
        invariant(same(expectedChecks, suppliedChecks), `${entry.id}: mode validator union mismatch`);
        const execution = result.validatorResults.filter((v) => v.validatorId === 'api-executed');
        invariant(
            execution.length === 1 && execution[0].state === 'PASS',
            `${entry.id}: API union validator missing/failed`,
        );
    }
    return rows;
}
function checkNetwork(row, entry, freeze, reportFile, options) {
    invariant(row.networkAssetsScope === 'recorded-server-responses', `${entry.id}: missing recorded response scope`);
    invariant(
        Array.isArray(row.networkAssets) && row.networkAssets.length > 0,
        `${entry.id}: missing served response identities`,
    );
    const sourcePaths = new Set();
    for (const response of row.networkAssets) {
        invariant(
            typeof response.path === 'string' &&
                response.path.startsWith('/') &&
                Number.isInteger(response.status) &&
                response.status >= 100 &&
                response.status <= 599 &&
                Number.isInteger(response.bytes) &&
                response.bytes >= 0 &&
                HEX64.test(response.sha256),
            `${entry.id}: invalid response identity`,
        );
        const bodyFile = resolveRef(response.bodyArtifact, reportFile, options);
        invariant(
            response.sha256 === response.bodyArtifact.sha256 && response.bytes === response.bodyArtifact.bytes,
            `${entry.id}: response/body identity mismatch`,
        );
        // Reading the body above independently rehashes the immutable HTTP bytes, including transformed TS/trace output.
        invariant(bodyFile, `${entry.id}: missing response body`);
        const source = response.source;
        invariant(source && typeof source.kind === 'string', `${entry.id}: response source identity missing`);
        const matchSource = (identity) => {
            invariant(
                identity && typeof identity.path === 'string' && HEX64.test(identity.sha256),
                `${entry.id}: response source identity missing`,
            );
            const input = freeze.inputs.find((item) => item.path === identity.path);
            const raw = freeze.rawInputs.find((item) => item.path === identity.path);
            invariant(
                input && identity.sha256 === (raw || input).sha256,
                `${entry.id}: response source differs from freeze`,
            );
            sourcePaths.add(identity.path);
        };
        if (source.kind === 'generated') {
            invariant(
                [
                    'tools/benchmark/runner/browser-runtime.cjs',
                    'tools/verify/example-spec-browser.cjs',
                    'tools/verify/api-trace.cjs',
                    'tools/verify/example-workspace.cjs',
                ].includes(source.generator) && freeze.inputs.some((item) => item.path === source.generator),
                `${entry.id}: generated response has no frozen generator`,
            );
            if (source.original) matchSource(source.original);
        } else {
            invariant(
                ['repository-build', 'isolated-workspace'].includes(source.kind),
                `${entry.id}: unknown response source kind`,
            );
            matchSource(source);
        }
    }
    invariant(sourcePaths.has(`examples/${entry.dir}/index.html`), `${entry.id}: missing document response`);
    if (!entry.shell)
        invariant(sourcePaths.has('build/cocosair.module.js'), `${entry.id}: missing main runtime response`);
    if (entry.id === 'spark-splats')
        invariant(sourcePaths.has('build/spark.module.js'), `${entry.id}: missing Spark runtime response`);
}
function comparableResult(result) {
    const row = JSON.parse(JSON.stringify(result));
    const strip = (item) => {
        if (item.artifact) {
            delete item.artifact.path;
            if (item.artifact.hash) item.artifact.hash = item.artifact.hash.slice(0, 16);
        }
        for (const response of item.networkAssets || []) if (response.bodyArtifact) delete response.bodyArtifact.path;
    };
    strip(row);
    for (const mode of row.modeEvidence || []) strip(mode);
    return row;
}
function checkAttempt(attempt, ref, owner, freeze, options) {
    const { repo, portable } = options;
    const file = resolveRef(ref, owner, { repo, portable });
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    invariant(report.schema === SCHEMAS.attempt, 'unknown attempt schema');
    invariant(
        Array.isArray(report.admissionErrors) && report.admissionErrors.length === 0,
        'attempt admission errors retained',
    );
    invariant(
        report.origin &&
            path.isAbsolute(report.origin.repo) &&
            path.isAbsolute(report.origin.reportDirectory) &&
            path.isAbsolute(report.origin.captureRoot) &&
            report.origin.captureRoot !== path.parse(report.origin.captureRoot).root &&
            within(report.origin.captureRoot, report.origin.reportDirectory),
        'invalid attempt origin mapping',
    );
    const mappedPath = (original) => {
        const absolute = path.resolve(report.origin.repo, original);
        invariant(within(report.origin.captureRoot, absolute), 'original artifact escapes admitted capture root');
        return posix(path.relative(report.origin.reportDirectory, absolute));
    };
    invariant(
        report.rawCollector?.path === mappedPath(report.receipt.output.report) &&
            report.rawReceipt?.path === mappedPath(report.receipt.output.receipt),
        'raw artifact origin mapping mismatch',
    );
    for (const log of report.logs || [])
        invariant(log.path === mappedPath(report.receipt.output[log.stream]), 'stdio origin mapping mismatch');
    invariant(report.id === attempt.id && report.attempt === attempt.attempt, 'attempt index/report mismatch');
    invariant(
        report.freezeId === freeze.freezeId &&
            report.inputDigestBefore === freeze.inputDigest &&
            report.inputDigestAfter === freeze.inputDigest,
        `${report.id}: mixed freeze or stale attempt inputs`,
    );
    invariant(Number.isInteger(report.attempt) && report.attempt >= 1, 'invalid attempt number');
    const rawCollectorPath = resolveRef(report.rawCollector, file, { repo, portable });
    const rawCollector = JSON.parse(fs.readFileSync(rawCollectorPath, 'utf8'));
    invariant(
        rawCollector.completed === false &&
            rawCollector.partial === true &&
            Array.isArray(rawCollector.results) &&
            rawCollector.results.length === 1 &&
            rawCollector.results[0].id === report.id,
        `${report.id}: raw collector is not one immutable partial attempt`,
    );
    invariant(
        same(comparableResult(rawCollector.results[0]), comparableResult(report.result)),
        `${report.id}: result differs from raw collector`,
    );
    const rawRows = rawCollector.results[0].modeEvidence || [rawCollector.results[0]];
    const portableRows = report.result.modeEvidence || [report.result];
    rawRows.forEach((row, index) => {
        if (row.artifact?.bytes > 0)
            invariant(
                portableRows[index]?.artifact?.path === mappedPath(row.artifact.path),
                'screenshot origin mapping mismatch',
            );
        (row.networkAssets || []).forEach((response, responseIndex) => {
            invariant(
                portableRows[index]?.networkAssets?.[responseIndex]?.bodyArtifact?.path ===
                    mappedPath(response.bodyArtifact.path),
                'response body origin mapping mismatch',
            );
        });
    });
    const rawReceiptPath = resolveRef(report.rawReceipt, file, { repo, portable });
    invariant(
        same(JSON.parse(fs.readFileSync(rawReceiptPath, 'utf8')), report.receipt),
        `${report.id}: receipt differs from raw receipt`,
    );
    invariant(
        Array.isArray(report.logs) && same(report.logs.map((log) => log.stream).sort(), ['stderr', 'stdout']),
        `${report.id}: missing worker stdio artifacts`,
    );
    for (const log of report.logs) resolveRef(log, file, { repo, portable });
    invariant(
        report.custodyArtifacts && same(Object.keys(report.custodyArtifacts).sort(), [...CUSTODY_ROLES].sort()),
        `${report.id}: missing/unknown custody artifact roles`,
    );
    const custodyContents = {};
    for (const role of CUSTODY_ROLES) {
        const ref = report.custodyArtifacts[role];
        const original = report.receipt.custody?.artifacts?.[role];
        invariant(
            original &&
                ref?.path === mappedPath(original.path) &&
                ref.bytes === original.bytes &&
                ref.sha256 === original.sha256,
            `${report.id}: custody ${role} origin/identity mismatch`,
        );
        const artifact = resolveRef(ref, file, { repo, portable });
        const content = fs.readFileSync(artifact);
        custodyContents[role] = ['raw', 'nodeReceipt'].includes(role) ? JSON.parse(content.toString('utf8')) : content;
    }
    const custodyCheck = require('./example-evidence-supervisor.cjs').validateCustodyArtifacts(
        report.receipt,
        custodyContents,
    );
    invariant(
        custodyCheck.ok,
        `${report.id}: kernel custody originals invalid: ${(custodyCheck.errors || []).join('; ')}`,
    );

    const entry = freeze.scope.find((e) => e.id === report.id);
    invariant(entry, `unknown example ID: ${report.id}`);
    const started = Date.parse(report.startedAt);
    const finished = Date.parse(report.finishedAt);
    invariant(
        Number.isFinite(started) &&
            Number.isFinite(finished) &&
            started >= Date.parse(freeze.createdAt) &&
            finished >= started &&
            finished <= Date.now() + 60000 &&
            report.startedAt === report.receipt?.startedAt &&
            report.finishedAt === report.receipt?.endedAt,
        `${report.id}: invalid attempt chronology`,
    );
    invariant(same(report.receipt?.runtimeIdentity, freeze.runtimeIdentity), `${report.id}: runtime identity mismatch`);
    invariant(same(report.receipt?.limits, freeze.limits), `${report.id}: supervision limits mismatch`);
    const closure = require('./example-evidence-supervisor.cjs').validateAttemptReceipt(report.receipt, {
        id: report.id,
        expectedModes: entry.modes.map((m) => m.id),
        expectedViewports: Object.fromEntries(entry.modes.map((mode) => [mode.id, mode.viewport])),
        requireSuccess: report.result?.result === 'PASS',
    });
    invariant(closure.ok, `${report.id}: incomplete/forced closure: ${(closure.errors || []).join('; ')}`);
    invariant(report.result && ['PASS', 'FAIL'].includes(report.result.result), `${report.id}: absent result`);
    invariant(Array.isArray(report.artifacts), `${report.id}: missing artifact inventory`);
    const modeIds = new Set();
    for (const artifact of report.artifacts) {
        invariant(
            entry.modes.some((m) => m.id === artifact.mode) && !modeIds.has(artifact.mode),
            `${report.id}: unknown/duplicate artifact mode`,
        );
        modeIds.add(artifact.mode);
        const png = resolveRef(artifact, file, { repo, portable });
        invariant(
            fs
                .readFileSync(png)
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
            `${report.id}: screenshot is not PNG`,
        );
    }
    if (report.result.result === 'PASS') {
        const rows = checkResult(report.result, entry, freeze, repo);
        for (const row of rows) checkNetwork(row, entry, freeze, file, { repo, portable });
        invariant(report.artifacts.length === entry.modes.length, `${report.id}: missing screenshot mode`);
        rows.forEach((row, index) => {
            const artifact = report.artifacts.find((a) => a.mode === entry.modes[index].id);
            invariant(
                row.artifact?.path === artifact.path &&
                    row.artifact.bytes === artifact.bytes &&
                    row.artifact.hash === artifact.sha256,
                `${report.id}: screenshot row/manifest mismatch`,
            );
        });
    }
    return { report, file, ref, owner };
}
function inspectSegments(freeze, segmentPaths, { repo = REPO, portable = false } = {}) {
    invariant(Array.isArray(segmentPaths) && segmentPaths.length > 0, 'no segments');
    const entries = [];
    const segmentIds = new Set();
    const keys = new Set();
    const paths = new Set();
    for (const file of segmentPaths) {
        const real = path.resolve(file);
        invariant(!paths.has(real), 'duplicate segment file');
        paths.add(real);
        const segment = JSON.parse(fs.readFileSync(real, 'utf8'));
        invariant(segment.schema === SCHEMAS.segment && segment.mode === MODE, 'unknown segment schema/mode');
        invariant(segment.completed === false && segment.partial === true, 'raw segment falsely marked completed');
        invariant(
            segment.freezeId === freeze.freezeId &&
                segment.inputDigest === freeze.inputDigest &&
                segment.browser === freeze.runtimeIdentity.browserType,
            'mixed segment freeze/browser',
        );
        invariant(
            typeof segment.segmentId === 'string' && segment.segmentId && !segmentIds.has(segment.segmentId),
            'duplicate/absent segment ID',
        );
        segmentIds.add(segment.segmentId);
        invariant(Array.isArray(segment.attempts) && segment.attempts.length > 0, 'empty segment');
        for (const attempt of segment.attempts) {
            const key = `${attempt.id}:${attempt.attempt}`;
            invariant(!keys.has(key), `duplicate example attempt: ${key}`);
            keys.add(key);
            entries.push(checkAttempt(attempt, attempt.report, real, freeze, { repo, portable }));
        }
    }
    const chronological = entries
        .slice()
        .sort((a, b) => Date.parse(a.report.startedAt) - Date.parse(b.report.startedAt));
    const attemptIds = new Set();
    const workers = new Set();
    chronological.forEach((entry, index) => {
        const receipt = entry.report.receipt;
        const workerIdentity = `${receipt.worker.namespace}:${receipt.worker.pid}:${receipt.worker.startTicks}`;
        invariant(
            typeof receipt.attemptId === 'string' &&
                receipt.attemptId &&
                !attemptIds.has(receipt.attemptId) &&
                !workers.has(workerIdentity),
            'duplicate physical worker/attempt identity',
        );
        attemptIds.add(receipt.attemptId);
        workers.add(workerIdentity);
        if (index)
            invariant(
                Date.parse(entry.report.startedAt) >= Date.parse(chronological[index - 1].report.finishedAt),
                'campaign workers overlap across examples',
            );
    });
    const selected = [];
    for (const entry of freeze.scope) {
        const attempts = entries
            .filter((a) => a.report.id === entry.id)
            .sort((a, b) => a.report.attempt - b.report.attempt);
        attempts.forEach((a, index) => {
            invariant(a.report.attempt === index + 1, `${entry.id}: omitted retry/first-failure attempt`);
            if (index)
                invariant(
                    Date.parse(a.report.startedAt) >= Date.parse(attempts[index - 1].report.finishedAt),
                    `${entry.id}: overlapping retry attempts`,
                );
        });
        if (attempts.length && attempts[attempts.length - 1].report.result.result === 'PASS')
            selected.push(attempts[attempts.length - 1]);
    }
    return {
        entries,
        selected,
        remaining: freeze.scope.filter((e) => !selected.some((a) => a.report.id === e.id)).map((e) => e.id),
    };
}
function projectResult(admitted, repo) {
    const row = JSON.parse(JSON.stringify(admitted.report.result));
    const convert = (r) => {
        r.artifact.path = posix(path.relative(repo, path.resolve(path.dirname(admitted.file), r.artifact.path)));
        for (const resource of r.networkAssets || [])
            resource.bodyArtifact.path = posix(
                path.relative(repo, path.resolve(path.dirname(admitted.file), resource.bodyArtifact.path)),
            );
    };
    convert(row);
    for (const mode of row.modeEvidence || []) convert(mode);
    return row;
}
function proofTotals(results) {
    const totals = { verified: 0, attested: 0, unproven: 0 };
    for (const row of results) for (const proof of row.apiProof) totals[proof.proof]++;
    return totals;
}
function mergeCampaign({ repo = REPO, freeze, segments, out, allowPartial = false, publicationStaging = false } = {}) {
    if (typeof freeze === 'string') freeze = JSON.parse(fs.readFileSync(freeze, 'utf8'));
    validateFreeze(freeze, { repo });
    invariant(out, 'merge output required');
    const canonical = path.resolve(out) === path.join(path.resolve(repo), 'docs/evidence/examples-verified.json');
    invariant(!canonical || publicationStaging === true, 'canonical merge requires publication staging transaction');
    const inspection = inspectSegments(freeze, segments, { repo, portable: within(repo, out) });
    const complete = inspection.remaining.length === 0;
    invariant(complete || (allowPartial && !canonical), `incomplete campaign: ${inspection.remaining.join(', ')}`);
    const results = inspection.selected.map((entry) => projectResult(entry, repo));
    const data = {
        schema: SCHEMAS.campaign,
        mode: MODE,
        runner: 'tools/verify/example-spec-browser.cjs',
        measuredAt: new Date().toISOString(),
        browser: freeze.runtimeIdentity.browserType,
        freeze,
        freezeId: freeze.freezeId,
        candidateFingerprint: freeze.candidateFingerprint,
        partial: !complete,
        completed: complete,
        scopePassed: complete,
        total: results.length,
        pass: results.length,
        fail: 0,
        runTotal: results.length,
        runPass: results.length,
        sessionTotal: inspection.selected.reduce(
            (n, a) => n + freeze.scope.find((e) => e.id === a.report.id).modes.length,
            0,
        ),
        apiProofTotals: proofTotals(results),
        remaining: inspection.remaining,
        segments: segments.map((file) => reference(file, out)),
        attempts: inspection.entries.map((a) => ({
            id: a.report.id,
            attempt: a.report.attempt,
            report: reference(a.file, out),
        })),
        results,
    };
    if (complete) {
        const checked = validateCampaign(data, { repo, evidencePath: out });
        invariant(checked.ok, checked.errors.join('; '));
    }
    require('./example-spec-common.cjs').writeJsonAtomic(out, data);
    return data;
}
function validateCampaign(
    data,
    { repo = REPO, evidencePath = path.join(repo, 'docs/evidence/examples-verified.json') } = {},
) {
    try {
        invariant(
            !fs.existsSync(path.join(repo, 'docs/evidence/.examples-publication-incomplete.json')),
            'incomplete evidence publication transaction',
        );
        invariant(data?.schema === SCHEMAS.campaign && data.mode === MODE, 'unknown/legacy campaign schema');
        invariant(
            data.completed === true && data.partial === false && data.scopePassed === true,
            'incomplete/partial campaign',
        );
        validateFreeze(data.freeze, { repo, publication: data.publication, results: data.results });
        const freeze = data.freeze;
        invariant(
            data.freezeId === freeze.freezeId &&
                data.candidateFingerprint === freeze.candidateFingerprint &&
                data.browser === freeze.runtimeIdentity.browserType,
            'campaign header/freeze mismatch',
        );
        invariant(data.runner === 'tools/verify/example-spec-browser.cjs', 'unknown campaign runner');
        const measured = Date.parse(data.measuredAt);
        invariant(
            Number.isFinite(measured) && measured >= Date.parse(freeze.createdAt) && measured <= Date.now() + 60000,
            'invalid campaign timestamp',
        );
        invariant(Array.isArray(data.segments) && data.segments.length > 0, 'missing campaign segments');
        const portable = within(repo, evidencePath);
        const segments = data.segments.map((ref) => resolveRef(ref, evidencePath, { repo, portable }));
        const inspection = inspectSegments(freeze, segments, { repo, portable });
        invariant(
            inspection.remaining.length === 0 && Array.isArray(data.remaining) && data.remaining.length === 0,
            'missing/failed expected IDs',
        );
        invariant(
            inspection.entries.every((a) => Date.parse(a.report.finishedAt) <= measured + 1000),
            'campaign measured before attempts finished',
        );
        const expectedAttempts = inspection.entries.map((a) => ({
            id: a.report.id,
            attempt: a.report.attempt,
            report: reference(a.file, evidencePath),
        }));
        invariant(same(data.attempts, expectedAttempts), 'omitted/changed attempt history');
        const results = inspection.selected.map((a) => projectResult(a, repo));
        invariant(same(data.results, results), 'campaign results differ from immutable attempts');
        invariant(results.length === freeze.scope.length && results.length > 0, 'empty/missing campaign scope');
        for (const key of ['total', 'pass', 'runTotal', 'runPass'])
            invariant(data[key] === results.length, `invalid campaign ${key}`);
        invariant(
            data.fail === 0 && data.sessionTotal === freeze.scope.reduce((n, e) => n + e.modes.length, 0),
            'invalid failure/session counts',
        );
        invariant(proofTotals(results).unproven === 0, 'unproven API in completed campaign');
        invariant(same(data.apiProofTotals, proofTotals(results)), 'invalid API proof totals');
        return { ok: true, errors: [] };
    } catch (error) {
        return { ok: false, errors: [String(error.message || error)] };
    }
}
function main(args) {
    const command = args[0];
    const arg = (name) => args.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3);
    const repo = path.resolve(arg('repo') || REPO);
    const out = arg('out') && path.resolve(arg('out'));
    if (command === 'freeze') {
        invariant(out, 'freeze requires --out');
        const freeze = freezeCampaign({
            repo,
            out,
            runtimeIdentity: collectRuntimeIdentity(arg('browser') || 'chromium'),
        });
        console.log(
            JSON.stringify({
                freezeId: freeze.freezeId,
                examples: freeze.scope.length,
                sessions: freeze.scope.reduce((n, e) => n + e.modes.length, 0),
                out,
            }),
        );
    } else if (command === 'merge') {
        invariant(out && arg('freeze') && arg('segments'), 'merge requires --freeze, --segments=a,b and --out');
        const data = mergeCampaign({
            repo,
            out,
            freeze: arg('freeze'),
            segments: arg('segments')
                .split(',')
                .map((p) => path.resolve(p)),
            allowPartial: args.includes('--allow-partial'),
        });
        console.log(JSON.stringify({ completed: data.completed, total: data.total, remaining: data.remaining, out }));
    } else if (command === 'check') {
        const evidencePath = path.resolve(arg('evidence') || path.join(repo, 'docs/evidence/examples-verified.json'));
        const checked = validateCampaign(JSON.parse(fs.readFileSync(evidencePath, 'utf8')), { repo, evidencePath });
        console.log(JSON.stringify(checked));
        process.exitCode = checked.ok ? 0 : 1;
    } else throw new Error('usage: example-evidence-campaign.cjs freeze|merge|check [--repo=...] [--out=...]');
}
if (require.main === module) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
module.exports = {
    SCHEMAS,
    MODE,
    REQUIRED_FILES,
    INPUT_TREES,
    OPTIONAL_TREES,
    OPTIONAL_FILES,
    DEFAULT_LIMITS,
    CUSTODY_ROLES,
    sha256,
    objectDigest,
    fileDigest,
    collectInputs,
    collectInputDigest,
    collectScope,
    collectRuntimeIdentity,
    freezeCampaign,
    validateFreeze,
    assertFrozenInputs,
    writeAttempt,
    createSegment,
    mergeCampaign,
    validateCampaign,
    validateRuntimeIdentity,
    inspectSegments,
    buildPublication,
    validatePublication,
};
