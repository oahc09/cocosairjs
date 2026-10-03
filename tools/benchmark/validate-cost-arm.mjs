#!/usr/bin/env node
// Independent CB21 verifier. Uses frozen public instrumentation, never legacy results or private references.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const option = (name) => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fileHash = (file) => digest(fs.readFileSync(file));
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
function treeHash(directory) {
    const rows = [];
    function visit(dir, prefix = '') {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const relative = prefix + entry.name;
            if (entry.isDirectory()) visit(path.join(dir, entry.name), relative + '/');
            else if (entry.isFile()) rows.push([relative, fileHash(path.join(dir, entry.name))]);
            else throw new Error(`Frozen inputs cannot contain links: ${relative}`);
        }
    }
    visit(directory);
    return digest(Buffer.from(JSON.stringify(rows)));
}
function budget(workspace) {
    return Object.fromEntries(
        ['build', 'browser'].map((kind) => {
            const file = path.join(workspace, '.budget', `${kind}.count`);
            const lines = fs.existsSync(file)
                ? fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean)
                : [];
            if (lines.some((line) => !/^\d{4}-\d{2}-\d{2}T/.test(line) || !Number.isFinite(Date.parse(line))))
                throw new Error(`Invalid ${kind} machine counter`);
            return [kind, { count: lines.length, timestamps: lines }];
        }),
    );
}

try {
    if (!option('cohort')) throw new Error('--cohort is required');
    const root = path.resolve(option('cohort'));
    const cohort = read(path.join(root, 'COHORT.json'));
    if (cohort.schema !== 'cb21-isolated-cohort-v1' || cohort.blockers?.length)
        throw new Error('Unsupported or blocked cohort');
    const instrument = path.join(root, 'instrument');
    if (args.includes('--prepare-instrument')) {
        if (fs.existsSync(instrument)) throw new Error('Instrument already exists; never overwrite frozen inputs');
        const source = path.resolve(cohort.sourceBenchmarkRoot);
        const launch = read(path.join(source, 'harness', 'launch-config.json'));
        if (!launch.webgl2?.ok || launch.swiftshaderFallback || !fs.existsSync(launch.executablePath))
            throw new Error('A real WebGL2 Chrome launch configuration is required');
        fs.mkdirSync(instrument);
        fs.cpSync(path.join(source, 'harness', 'runner'), path.join(instrument, 'runner'), { recursive: true });
        fs.copyFileSync(
            path.join(source, 'harness', 'launch-config.json'),
            path.join(instrument, 'launch-config.json'),
        );
        for (const dependency of ['playwright-core', 'pngjs']) {
            const local = path.join(source, 'harness', 'node_modules', dependency);
            const dependencySource = fs.existsSync(local) ? local : path.join(source, 'node_modules', dependency);
            fs.cpSync(dependencySource, path.join(instrument, 'node_modules', dependency), { recursive: true });
        }
        write(path.join(root, 'INSTRUMENT.json'), {
            schema: 'cb21-public-instrument-v1',
            preparedAt: new Date().toISOString(),
            instrumentHash: treeHash(instrument),
            sourceRunnerHash: treeHash(path.join(source, 'harness', 'runner')),
            browserExecutable: launch.executablePath,
            browserExecutableSha256: fileHash(launch.executablePath),
            wrapperSha256: fileHash(new URL(import.meta.url)),
            scope: 'Frozen public validator; new cohort integrity guard replaces legacy root dependency guard. GPU sampling serial.',
        });
        console.log('Frozen public instrument prepared; no arm executed.');
    } else {
        const pairId = option('pair');
        const armName = option('arm');
        if (!cohort.preparedPairs.includes(pairId) || !['arm-a', 'arm-b'].includes(armName))
            throw new Error('Select a prepared pair and arm');
        const arm = path.join(root, pairId, armName);
        const meta = read(path.join(arm, 'RUN-META.json'));
        const frozen = read(path.join(root, 'INSTRUMENT.json'));
        const out = path.join(arm, 'independent-validation');
        if (fs.existsSync(out)) throw new Error('Validation output already exists; preserve previous results');
        const checks = {
            candidate: fileHash(cohort.candidate.path) === cohort.candidate.sha256,
            installedPackage:
                treeHash(
                    path.join(meta.workspace, 'node_modules', meta.engine === 'three' ? 'three' : 'cocosair.js'),
                ) === meta.installedPackageHash,
            knowledge: treeHash(path.join(arm, 'knowledge')) === meta.knowledgeHash,
            prompt: fileHash(path.join(arm, 'ARM-PROMPT.txt')) === meta.armPromptHash,
            policy: fileHash(path.join(arm, 'TOOL-POLICY.txt')) === meta.toolPolicyHash,
            spec:
                fileHash(path.join(arm, 'spec.json')) ===
                cohort.sceneSpecHashes[read(path.join(arm, 'spec.json')).briefId],
            instrument: treeHash(instrument) === frozen.instrumentHash,
            browser: fileHash(frozen.browserExecutable) === frozen.browserExecutableSha256,
            wrapper: fileHash(new URL(import.meta.url)) === frozen.wrapperSha256,
            machineCounterScripts:
                Object.entries(meta.machineCounterScriptHashes || {}).length === 2 &&
                Object.entries(meta.machineCounterScriptHashes).every(
                    ([relative, expected]) =>
                        ['scripts/count.mjs', 'scripts/verify-browser.mjs'].includes(relative) &&
                        fileHash(path.join(meta.workspace, relative)) === expected,
                ),
        };
        if (Object.values(checks).some((pass) => !pass)) throw new Error(`Input drift: ${JSON.stringify(checks)}`);
        if (args.includes('--check-inputs')) {
            console.log(JSON.stringify({ pairId, armName, checks, machineCounters: budget(meta.workspace) }));
            process.exit(0);
        }
        fs.mkdirSync(out);
        const before = budget(meta.workspace);
        const startedAt = new Date().toISOString();
        const child = spawnSync(
            process.execPath,
            [
                path.join(instrument, 'runner', 'validate.mjs'),
                '--workspace',
                meta.workspace,
                '--spec',
                path.join(arm, 'spec.json'),
                '--out',
                out,
                '--run-id',
                `${pairId}-${armName}`,
                '--pair',
                pairId,
                '--engine',
                meta.engine === 'three' ? 'three' : 'air',
                '--port',
                String(meta.port),
                '--video',
            ],
            { cwd: root, encoding: 'utf8', timeout: 900000, maxBuffer: 32 * 1024 * 1024 },
        );
        fs.writeFileSync(path.join(out, 'runner.log'), `${child.stdout || ''}\n${child.stderr || ''}`);
        write(path.join(out, 'cohort-guard.json'), {
            schema: 'cb21-independent-guard-v1',
            startedAt,
            endedAt: new Date().toISOString(),
            checks,
            candidateSha256: cohort.candidate.sha256,
            instrumentHash: frozen.instrumentHash,
            machineCountersBeforeValidator: before,
            machineCountersAfterValidator: budget(meta.workspace),
            validatorExitCode: child.status,
            validatorError: child.error?.message ?? null,
            note: 'Validator build attempts are separate from cold-start agent attempts. No legacy root dependency guard used.',
        });
        console.log(JSON.stringify({ pairId, armName, exitCode: child.status, report: path.join(out, 'report.json') }));
        process.exitCode = child.status ?? 1;
    }
} catch (error) {
    console.error(error.message);
    process.exitCode = 2;
}
