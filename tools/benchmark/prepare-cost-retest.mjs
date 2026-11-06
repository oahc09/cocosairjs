#!/usr/bin/env node
// CB21 preparation only: new isolated cohort/workspaces, no provider API and no legacy gate mutation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const value = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const execute = args.includes('--execute');
const benchRoot = path.resolve(value('bench-root', '.'));
const candidate = value('candidate') ? path.resolve(value('candidate')) : null;
const runRoot = value('run-root') ? path.resolve(value('run-root')) : null;
const sdkRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const scenes = value('scenes', 'E01,E02,E05,E10').split(',');
const profiles = value('profiles', 'K0,K1').split(',');
const repeats = Number(value('repeats', '3'));
const identity = value('identity') ? JSON.parse(fs.readFileSync(path.resolve(value('identity')), 'utf8')) : null;
const THREE_VERSION = '0.186.1';
const hash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const fileHash = (file) => hash(fs.readFileSync(file));
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, data) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
};

function treeHash(directory) {
    const rows = [];
    function visit(dir, prefix = '') {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const relative = prefix + entry.name;
            if (entry.isDirectory()) visit(path.join(dir, entry.name), relative + '/');
            else if (entry.isFile()) rows.push([relative, fileHash(path.join(dir, entry.name))]);
            else throw new Error(`Links/special files are not valid frozen input: ${relative}`);
        }
    }
    visit(directory);
    return hash(Buffer.from(JSON.stringify(rows)));
}

function archiveFiles(file) {
    const bytes = zlib.gunzipSync(fs.readFileSync(file), { maxOutputLength: 256 * 1024 * 1024 });
    const files = [];
    let offset = 0;
    let longName;
    let pax = {};
    while (offset + 512 <= bytes.length) {
        const header = bytes.subarray(offset, offset + 512);
        if (header.every((byte) => byte === 0)) break;
        const text = (start, length) =>
            header
                .subarray(start, start + length)
                .toString('utf8')
                .replace(/\0.*$/s, '');
        const size = Number.parseInt(text(124, 12).trim() || '0', 8);
        if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > bytes.length)
            throw new Error('Invalid tar range');
        const data = bytes.subarray(offset + 512, offset + 512 + size);
        const type = text(156, 1) || '0';
        offset += 512 + Math.ceil(size / 512) * 512;
        if (type === 'L') {
            longName = data.toString('utf8').replace(/\0.*$/s, '');
            continue;
        }
        if (type === 'x') {
            pax = {};
            for (let at = 0; at < data.length;) {
                const space = data.indexOf(32, at);
                const length = Number(data.subarray(at, space).toString());
                if (!(length > 0) || at + length > data.length) throw new Error('Invalid PAX range');
                const item = data.subarray(space + 1, at + length - 1).toString();
                const split = item.indexOf('=');
                pax[item.slice(0, split)] = item.slice(split + 1);
                at += length;
            }
            continue;
        }
        if (type === '5') continue;
        if (type !== '0') throw new Error(`Unsupported tar entry type ${type}`);
        const prefix = text(345, 155);
        const name = pax.path || longName || (prefix ? prefix + '/' : '') + text(0, 100);
        longName = undefined;
        pax = {};
        if (!name.startsWith('package/')) throw new Error(`Invalid package entry ${name}`);
        const relative = name.slice('package/'.length);
        if (relative.split('/').some((part) => part === '..') || path.isAbsolute(relative))
            throw new Error(`Unsafe package entry ${name}`);
        files.push({ relative, data: Buffer.from(data) });
    }
    return files;
}

function installCandidate(files, target, frozenReadme) {
    for (const file of files) {
        // K0 and K1 execute the exact same binary/type surface; only the knowledge directory differs.
        if (file.relative.startsWith('docs/') && file.relative !== 'docs/THIRD_PARTY_LICENSES.md') continue;
        if (file.relative === 'README.md') continue;
        const destination = path.resolve(target, file.relative);
        if (!destination.startsWith(path.resolve(target) + path.sep))
            throw new Error('Package extraction escaped target');
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, file.data);
    }
    fs.copyFileSync(frozenReadme, path.join(target, 'README.md'));
}

const DOCS = [
    'docs/manual/fundamentals.md',
    'docs/manual/creating-a-scene.md',
    'docs/manual/materials.md',
    'docs/manual/uniform-types.md',
    'docs/manual/input-and-events.md',
    'docs/manual/animation-system.md',
    'docs/manual/asset-loading-and-lifetime.md',
    'docs/manual/primitives.md',
    'docs/gltf/gltf-runtime.md',
    'docs/gltf/gltf-decoder-deployment.md',
];

const POLICY_RECIPE =
    'Fresh isolated cold-start arm. Own application/template, README/types and explicit knowledge are readable. Offline runtime import/execution and own assigned loopback browser/server are allowed. External network, engine implementation source, peers, history, SDK source, reference, secrets, validators and npm install are forbidden. Unknown metrics remain null.';
const PROMPT_RECIPE =
    'Implement the provided public brief/spec with the frozen engine/package and supplied knowledge profile. Build, inspect real browser pixels, maintain WORKLOG.md and RESULT.md. Fresh fork-none using the user-selected model/effort. State alone does not prove behavior.';

const blockers = [];
if (!runRoot) blockers.push('--run-root must name a brand-new isolated directory');
if (runRoot && fs.existsSync(runRoot))
    blockers.push('run-root already exists: no overwrite/resume in this materializer');
if (runRoot && (runRoot === benchRoot || runRoot.startsWith(benchRoot + path.sep)))
    blockers.push('run-root must be outside the historical benchmark tree');
if (runRoot && (runRoot === sdkRoot || runRoot.startsWith(sdkRoot + path.sep)))
    blockers.push('run-root must be outside the SDK tree to isolate arms and avoid test package collisions');
if (!candidate || !fs.existsSync(candidate))
    blockers.push('a final candidate .tgz is required; this helper never builds/packs implicitly');
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 99) blockers.push('repeats must be an integer in [1,99]');
if (profiles.some((profile) => !['K0', 'K1'].includes(profile)))
    blockers.push('only K0/K1 profiles are allowed; K2/private references are never copied');
for (const scene of scenes)
    if (!/^E\d\d$/.test(scene) || !fs.existsSync(path.join(benchRoot, 'briefs', scene, 'spec.json')))
        blockers.push(`public scene unavailable: ${scene}`);
if (
    identity?.modelId !== 'gpt-6-luna' ||
    identity?.reasoningEffort !== 'high' ||
    identity?.selectionSource !== 'trusted-user-request'
)
    blockers.push('identity must freeze the user-selected gpt-6-luna/high route with trusted-user-request provenance');
const publicInputs = [
    'config/agents.yaml',
    'config/benchmark.yaml',
    'config/environments.yaml',
    'knowledge/K0/cocosair/manifest.json',
    'knowledge/K0/three/manifest.json',
];
for (const file of publicInputs)
    if (!fs.existsSync(path.join(benchRoot, file))) blockers.push(`public input missing: ${file}`);
let threeBaseline = null;
try {
    const directory = path.join(benchRoot, 'node_modules/three');
    if (!fs.lstatSync(directory).isDirectory()) throw new Error('a regular local package directory is required');
    const metadata = json(path.join(directory, 'package.json'));
    if (metadata.name !== 'three' || metadata.version !== THREE_VERSION)
        throw new Error(`expected three@${THREE_VERSION}, found ${metadata.name}@${metadata.version}`);
    threeBaseline = {
        name: metadata.name,
        version: metadata.version,
        installedPackageHash: treeHash(directory),
        artifactSha256: null,
        provenance: 'Installed package name/version and local tree snapshot only; registry archive not authenticated.',
    };
} catch (error) {
    blockers.push(`three baseline is invalid: ${error.message}`);
}
const candidateHash = candidate && fs.existsSync(candidate) ? fileHash(candidate) : null;
let files = [];
let candidatePackage = null;
if (candidateHash) {
    try {
        files = archiveFiles(candidate);
        const packageFile = files.find((file) => file.relative === 'package.json');
        candidatePackage = packageFile ? JSON.parse(packageFile.data.toString()) : null;
        if (candidatePackage?.name !== 'cocosair.js') blockers.push('candidate is not a cocosair.js npm package');
        for (const key of ['main', 'types']) {
            const relative = candidatePackage?.[key]?.replace(/^\.\//, '');
            if (!relative || !files.some((file) => file.relative === relative))
                blockers.push(`candidate ${key} entry is missing`);
        }
    } catch (error) {
        blockers.push(`candidate archive is invalid: ${error.message}`);
    }
}
const manifest = {
    schema: 'cb21-isolated-cohort-v1',
    mode: execute ? 'execute' : 'dry-run',
    createdAt: new Date().toISOString(),
    runRoot,
    sourceBenchmarkRoot: benchRoot,
    candidate: { path: candidate, sha256: candidateHash, packageVersion: candidatePackage?.version ?? null },
    threeBaseline,
    configuredIdentity: identity,
    modelRevision: identity?.modelRevision ?? null,
    modelRevisionUnavailableReason: identity?.modelRevision
        ? null
        : 'The desktop host does not expose an immutable provider model revision.',
    publicInputHashes: Object.fromEntries(
        publicInputs
            .filter((file) => fs.existsSync(path.join(benchRoot, file)))
            .map((file) => [file, fileHash(path.join(benchRoot, file))]),
    ),
    factors: {
        codeEpoch: candidateHash,
        knowledge: profiles,
        scenes,
        repeats,
        pairedEngines: [`three@${THREE_VERSION}`, 'cocosair-current'],
        k0Readme: 'historical frozen K0 README',
        k1: 'same package/README/types plus explicitly curated current generic docs',
    },
    metrics: {
        observedExecutionEvents: 'official read_thread event IDs, per arm/turn/category, deduplicated',
        agentToolCalls: null,
        tokens: null,
        note: 'Execution events are not synonymous with Agent tool invocations. Unknown measurements remain null.',
    },
    sceneSpecHashes: Object.fromEntries(
        scenes
            .filter((scene) => fs.existsSync(path.join(benchRoot, 'briefs', scene, 'spec.json')))
            .map((scene) => [scene, fileHash(path.join(benchRoot, 'briefs', scene, 'spec.json'))]),
    ),
    sceneBriefHashes: Object.fromEntries(
        scenes
            .filter((scene) => fs.existsSync(path.join(benchRoot, 'briefs', scene, 'brief.md')))
            .map((scene) => [scene, fileHash(path.join(benchRoot, 'briefs', scene, 'brief.md'))]),
    ),
    legacyMutation: false,
    historicalCostComparability: 'new instrument cohort; historical self-reported N=1 costs are contextual only',
    pairCount: scenes.length * profiles.length * repeats,
    armCount: scenes.length * profiles.length * repeats * 2,
    blockers,
};
if (!execute) {
    console.log(JSON.stringify(manifest, null, 2));
    process.exit(0);
}
if (blockers.length) {
    console.error(JSON.stringify(manifest, null, 2));
    process.exit(2);
}

fs.mkdirSync(runRoot, { recursive: false });
const frozenReadmes = Object.fromEntries(
    ['cocosair', 'three'].map((engine) => [engine, path.join(benchRoot, 'knowledge/K0', engine, 'README.md')]),
);
const pairRecords = [];
let port = Number(value('port-base', '8200'));
for (const profile of profiles)
    for (let repetition = 1; repetition <= repeats; repetition++)
        for (const scene of scenes) {
            const rep = `R${String(repetition).padStart(2, '0')}`;
            const pairId = `PAIR-${scene}-${profile}-${rep}`;
            const engines = repetition % 2 === 1 ? ['three', 'cocosair'] : ['cocosair', 'three'];
            const pair = {
                pairId,
                sceneId: scene,
                knowledgeProfile: profile,
                repetition: rep,
                codeEpoch: candidateHash,
                configuredIdentity: identity,
                pairStatus: 'PREPARED_NOT_RUN',
                startDeltaMaxSeconds: 30,
                budget: { maxToolCalls: 120, maxWallTimeMinutes: 90, maxBuildAttempts: 8, maxBrowserAttempts: 6 },
                arms: {},
            };
            for (const [index, engine] of engines.entries()) {
                const armName = `arm-${index === 0 ? 'a' : 'b'}`;
                const armRoot = path.join(runRoot, pairId, armName);
                const workspace = path.join(armRoot, 'workspace');
                fs.mkdirSync(workspace, { recursive: true });
                fs.cpSync(path.join(benchRoot, 'templates', engine), workspace, {
                    recursive: true,
                    filter: (source) =>
                        !['node_modules', 'dist', '.budget'].includes(
                            path.relative(path.join(benchRoot, 'templates', engine), source).split(path.sep)[0],
                        ),
                });
                const nm = path.join(workspace, 'node_modules');
                fs.mkdirSync(nm, { recursive: true });
                for (const dependency of ['esbuild', '@esbuild/win32-x64', 'playwright', 'playwright-core']) {
                    const source = path.join(benchRoot, 'node_modules', dependency);
                    if (fs.existsSync(source)) fs.cpSync(source, path.join(nm, dependency), { recursive: true });
                }
                if (engine === 'cocosair')
                    installCandidate(files, path.join(nm, 'cocosair.js'), frozenReadmes.cocosair);
                else fs.cpSync(path.join(benchRoot, 'node_modules/three'), path.join(nm, 'three'), { recursive: true });
                const installedPackageHash = treeHash(path.join(nm, engine === 'three' ? 'three' : 'cocosair.js'));
                if (engine === 'three' && installedPackageHash !== threeBaseline.installedPackageHash)
                    throw new Error('three baseline changed after preflight; preserve this incomplete cohort');
                if (engine === 'cocosair') {
                    const packagePath = path.join(workspace, 'package.json');
                    const packageData = json(packagePath);
                    packageData.dependencies = { ...packageData.dependencies, 'cocosair.js': candidatePackage.version };
                    packageData.cb21OfflineInstalled = {
                        directory: 'node_modules/cocosair.js',
                        candidateTarballSha256: candidateHash,
                        installForbidden: true,
                    };
                    writeJson(packagePath, packageData);
                    const lockPath = path.join(workspace, 'package-lock.json');
                    if (fs.existsSync(lockPath)) {
                        const lock = json(lockPath);
                        if (lock.packages?.['']) lock.packages[''].dependencies = packageData.dependencies;
                        for (const installed of [
                            lock.packages?.['node_modules/cocosair.js'],
                            lock.dependencies?.['cocosair.js'],
                        ]) {
                            if (installed) {
                                installed.version = candidatePackage.version;
                                delete installed.resolved;
                                delete installed.integrity;
                            }
                        }
                        lock.cb21OfflineInstalled = true;
                        writeJson(lockPath, lock);
                    }
                }
                const knowledge = path.join(armRoot, 'knowledge');
                fs.mkdirSync(knowledge, { recursive: true });
                fs.copyFileSync(frozenReadmes[engine], path.join(knowledge, 'README.md'));
                if (profile === 'K1') {
                    if (engine === 'three')
                        fs.cpSync(path.join(benchRoot, 'knowledge/K1/three'), knowledge, { recursive: true });
                    else
                        for (const relative of DOCS) {
                            const source = path.join(sdkRoot, relative);
                            const target = path.join(knowledge, relative);
                            if (!fs.existsSync(source)) throw new Error(`Required generic doc missing: ${relative}`);
                            fs.mkdirSync(path.dirname(target), { recursive: true });
                            fs.copyFileSync(source, target);
                        }
                }
                const spec = json(path.join(benchRoot, 'briefs', scene, 'spec.json'));
                for (const file of ['brief.md', 'spec.json'])
                    fs.copyFileSync(path.join(benchRoot, 'briefs', scene, file), path.join(armRoot, file));
                for (const asset of spec.assets || []) {
                    const source = path.join(benchRoot, asset.path);
                    const target = path.join(workspace, asset.path);
                    if (fs.existsSync(source)) {
                        fs.mkdirSync(path.dirname(target), { recursive: true });
                        fs.copyFileSync(source, target);
                    }
                }
                const toolPolicy = `Fresh fork-none ${identity.modelId}/${identity.reasoningEffort}. Work only inside ${armRoot}.\nRead own application/template code, README, SDK types and explicit knowledge only. Import/execute installed runtime packages, but do not open engine implementation source.\nOwn localhost/127.0.0.1 browser/server at assigned port ${port} is allowed. Set PORT=${port} for the dev server. External network and other arm ports/profiles are forbidden.\nNo other arms, historical results, SDK source repository, reference, secrets, credentials or private validators.\nNo npm install; use copied offline dependencies. Preserve public brief/spec and .budget counters.\nBuild/browser counts use template scripts. Tools/tokens require official event evidence; never invent them.\n`;
                const boundedPolicy =
                    toolPolicy +
                    'Do not load extra Skills, memory, or documents not provided in this arm. Provided README, .d.ts and knowledge are readable; engine implementation sources are not. Real runtime API/scene probing is allowed.\n';
                fs.writeFileSync(path.join(armRoot, 'TOOL-POLICY.txt'), boundedPolicy);
                const prompt = `You are one cold-start ${engine} arm in CB21 (${pairId}/${armName}). Read TOOL-POLICY.txt, brief.md and spec.json.\nImplement the public specification in workspace. Build, inspect real browser pixels, maintain WORKLOG.md and RESULT.md.\nOnly read your own arm tree; knowledge/ provides the ${profile} generic documentation. Do not read the parent SDK task or another arm.\nDo not claim success from state fields alone. Budget: 120 tool invocations (when observable), 90 minutes, 8 builds, 6 browser attempts.\n`;
                const boundedPrompt =
                    prompt +
                    'Do not load extra Skills, memory, or unprovided documentation. Read the provided README/types/knowledge; use real runtime probes, not engine implementation source.\n';
                fs.writeFileSync(path.join(armRoot, 'ARM-PROMPT.txt'), boundedPrompt);
                const record = {
                    armName,
                    engine,
                    enginePackage: {
                        name: engine === 'three' ? threeBaseline.name : candidatePackage.name,
                        version: engine === 'three' ? threeBaseline.version : candidatePackage.version,
                    },
                    workspace,
                    port: port++,
                    modelId: identity.modelId,
                    reasoningEffort: identity.reasoningEffort,
                    modelRevision: identity.modelRevision ?? null,
                    modelRevisionUnavailableReason: manifest.modelRevisionUnavailableReason,
                    userSelectionSource: identity.selectionSource,
                    agentThreadId: null,
                    startedAt: null,
                    endedAt: null,
                    armPromptHash: hash(Buffer.from(boundedPrompt)),
                    armPromptRecipeHash: hash(Buffer.from(PROMPT_RECIPE)),
                    toolPolicyHash: hash(Buffer.from(boundedPolicy)),
                    toolPolicyRecipeHash: hash(Buffer.from(POLICY_RECIPE)),
                    machineCounterScriptHashes: Object.fromEntries(
                        ['count.mjs', 'verify-browser.mjs']
                            .filter((name) => fs.existsSync(path.join(workspace, 'scripts', name)))
                            .map((name) => [`scripts/${name}`, fileHash(path.join(workspace, 'scripts', name))]),
                    ),
                    knowledgeHash: treeHash(knowledge),
                    installedPackageHash,
                    metrics: {
                        observedExecutionEvents: null,
                        agentToolCalls: null,
                        inputTokens: null,
                        outputTokens: null,
                        wallTimeMs: null,
                        buildAttempts: null,
                        browserAttempts: null,
                    },
                };
                writeJson(path.join(armRoot, 'RUN-META.json'), record);
                pair.arms[armName] = record;
            }
            writeJson(path.join(runRoot, pairId, 'pair.json'), pair);
            pairRecords.push(pair);
        }
manifest.preparedPairs = pairRecords.map((pair) => pair.pairId);
manifest.blockers = [];
manifest.environment = {
    node: process.version,
    os: `${os.platform()} ${os.release()}`,
    formalPerformanceSampling: 'serial-only',
    isolation: 'policy-only, fresh local dependency copies; not OS enforced',
};
writeJson(path.join(runRoot, 'COHORT.json'), manifest);
console.log(
    JSON.stringify(
        {
            status: 'PREPARED_NOT_RUN',
            runRoot,
            pairCount: pairRecords.length,
            dispatch:
                'Spawn fresh fork_turns=none arms with the frozen model/effort; record actual agentThreadId and official event IDs. No API was called.',
        },
        null,
        2,
    ),
);
