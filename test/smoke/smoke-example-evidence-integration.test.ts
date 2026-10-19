import { nodeProcess, nodeRequire } from '../shims';
// Collector imports mock esbuild; clean-checkout regressions invoke real tooling in Node subprocesses.
jest.mock('esbuild', () => ({}));
jest.mock('../../tools/verify/browser-engines.cjs', () => ({
    launchOptions: () => ({ executablePath: '/CPU-NO-BROWSER', args: [] }),
}));
const fs = nodeRequire('fs') as typeof import('fs');
const path = nodeRequire('path') as typeof import('path');
const os = nodeRequire('os') as typeof import('os');
const http = nodeRequire('http') as typeof import('http');
const cp = nodeRequire('child_process') as typeof import('child_process');
const crypto = nodeRequire('crypto') as typeof import('crypto');
const root = path.resolve('.');
const runtime = nodeRequire(path.join(root, 'tools/benchmark/runner/browser-runtime.cjs'));
const collector = nodeRequire(path.join(root, 'tools/verify/example-spec-browser.cjs'));
const preflight = nodeRequire(path.join(root, 'tools/verify/example-evidence-preflight.cjs'));
const runner = nodeRequire(path.join(root, 'tools/verify/run-example-evidence-campaign.cjs'));
const trace = nodeRequire(path.join(root, 'tools/verify/api-trace.cjs'));
const syntheticFixtures = nodeRequire(path.join(root, 'tools/verify/example-evidence-campaign.cpu-fixture.cjs'));
let receiptValidationSpy: any;
let temp: string;
beforeEach(() => {
    receiptValidationSpy = syntheticFixtures.installSyntheticReceiptValidationSpy(jest);
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'air-evidence-integration-'));
});
afterEach(() => {
    receiptValidationSpy?.mockRestore();
    fs.rmSync(temp, { recursive: true, force: true });
});
function put(relative: string, value: string): string {
    const file = path.join(temp, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value);
    return file;
}
function sparkBootstrapCommands(workflowFile: string) {
    const yaml = nodeRequire('js-yaml');
    const workflow = yaml.load(fs.readFileSync(path.join(root, workflowFile), 'utf8'), { schema: yaml.JSON_SCHEMA });
    const lines = Object.values(workflow.jobs)
        .flatMap((job: any) => job.steps)
        .filter((step: any) => typeof step.run === 'string')
        .flatMap((step: any) => step.run.trim().split('\n'));
    const onlyLine = (predicate: (line: string) => boolean): string => {
        const matches = lines.filter(predicate);
        expect(matches).toHaveLength(1);
        return matches[0];
    };
    const snapshot = onlyLine((line) => line.startsWith('sha256sum src/air/spark/generated/'));
    const generate = onlyLine((line) => line === 'node tools/build/spark-runtime-tree.cjs');
    const hashGuard = onlyLine(
        (line) => line.startsWith('sha256sum --check ') && line.includes('committed-spark-tree'),
    );
    const diffGuard = onlyLine((line) => line === 'git diff --exit-code -- src/air/spark/generated');
    expect(lines.indexOf(snapshot)).toBeLessThan(lines.indexOf(generate));
    expect(lines.indexOf(generate)).toBeLessThan(lines.indexOf(hashGuard));
    expect(lines.indexOf(hashGuard)).toBeLessThan(lines.indexOf(diffGuard));
    expect(lines.indexOf(diffGuard)).toBeLessThan(
        lines.findIndex((line: string) => line.includes('node tools/verify/example-evidence-preflight.cjs')),
    );
    return { snapshot, hashGuard, diffGuard };
}
function cleanSparkCheckout(name: string) {
    const repo = path.join(temp, name);
    const listed = cp.spawnSync(
        'git',
        [
            'ls-files',
            '-z',
            '--',
            'tools/build/spark-runtime-tree.cjs',
            'vendor/spark',
            'vendor/spark-rs',
            'build/fflate',
            'src/air/spark/generated',
        ],
        { cwd: root, encoding: 'utf8' },
    );
    expect(listed.status).toBe(0);
    const files = listed.stdout.split('\0').filter(Boolean);
    for (const relative of files) {
        const target = path.join(repo, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(root, relative), target);
    }
    const generatedFiles = files.filter((file) => file.startsWith('src/air/spark/generated/'));
    expect(generatedFiles).toHaveLength(3);
    expect(cp.spawnSync('git', ['init', '--quiet'], { cwd: repo }).status).toBe(0);
    expect(cp.spawnSync('git', ['add', '.'], { cwd: repo }).status).toBe(0);
    const runnerTemp = path.join(repo, '.runner-temp');
    fs.mkdirSync(path.join(runnerTemp, 'committed-example-campaign'), { recursive: true });
    const env = { ...nodeProcess.env, NODE_PATH: path.join(root, 'node_modules'), RUNNER_TEMP: runnerTemp };
    const options = { cwd: repo, encoding: 'utf8' as const, env, timeout: 30000 };
    const runGenerator = (...args: string[]) =>
        cp.spawnSync(nodeProcess.execPath, ['tools/build/spark-runtime-tree.cjs', ...args], options);
    const runShell = (command: string) => cp.spawnSync('bash', ['-c', 'set -euo pipefail\n' + command], options);
    const generatedHashes = () =>
        Object.fromEntries(
            generatedFiles.map((file) => [
                file,
                crypto
                    .createHash('sha256')
                    .update(fs.readFileSync(path.join(repo, file)))
                    .digest('hex'),
            ]),
        );
    expect(fs.existsSync(path.join(repo, 'output/spark-runtime-tree-manifest.json'))).toBe(false);
    expect(fs.existsSync(path.join(repo, 'node_modules'))).toBe(false);
    for (const candidate of ['build/cocosair.module.js', 'build/spark.module.js'])
        expect(fs.existsSync(path.join(repo, candidate))).toBe(false);
    return { repo, generatedFiles, generatedHashes, runGenerator, runShell };
}
describe('Evidence collector integration safeguards', () => {
    test('clean-checkout npm copies are explicitly hydrated without changing committed bundle bytes', () => {
        const cp = nodeRequire('child_process') as typeof import('child_process');
        for (const relative of [
            'tools/build/prepare-package.cjs',
            'tools/build/math-module.cjs',
            'src/DebugInfos.json',
            'tools/build/runtime-layout.cjs',
            'tools/build/webgpu-assets.cjs',
            'tools/verify/published-artifacts.cjs',
            'src/air/builtin/register.ts',
            'package.json',
            'build/cocosair.module.js',
            'build/cocosair.module.min.js',
        ]) {
            put(relative, fs.readFileSync(path.join(root, relative), 'utf8'));
        }
        for (const file of ['build/cocosair.module.js.map', 'build/cocosair.module.min.js.map']) put(file, '{}');
        fs.cpSync(path.join(root, 'vendor/webgpu'), path.join(temp, 'vendor/webgpu'), { recursive: true });
        // The package builds the real canonical math entry, not a fixture stub.
        fs.cpSync(path.join(root, 'src/cocos/core'), path.join(temp, 'src/cocos/core'), { recursive: true });
        const before = fs.readFileSync(path.join(temp, 'build/cocosair.module.js'));
        const run = (script: string) =>
            cp.spawnSync('node', [path.join(temp, script)], {
                cwd: temp,
                encoding: 'utf8',
                // Resolve the copied packager's existing dependencies; fixture inputs remain isolated.
                env: { ...nodeProcess.env, NODE_PATH: path.join(root, 'node_modules') },
            });
        expect(run('tools/verify/published-artifacts.cjs').status).toBe(1);
        expect(run('tools/build/prepare-package.cjs').status).toBe(0);
        expect(run('tools/verify/published-artifacts.cjs').status).toBe(0);
        expect(fs.readFileSync(path.join(temp, 'build/cocosair.module.js')).equals(before)).toBe(true);
        for (const file of fs.readdirSync(path.join(temp, 'vendor/webgpu'))) {
            expect(
                fs
                    .readFileSync(path.join(temp, 'build/npm/webgpu', file))
                    .equals(fs.readFileSync(path.join(temp, 'vendor/webgpu', file))),
            ).toBe(true);
        }
    });

    test('clean-checkout Spark manifest bootstrap preserves every tracked generated byte in both workflows', () => {
        const generatedAtRoots: Record<string, string>[] = [];
        const manifestsAtRoots: string[] = [];
        for (const workflow of ['example-evidence', 'format']) {
            const commands = sparkBootstrapCommands(`.github/workflows/${workflow}.yml`);
            const checkout = cleanSparkCheckout(workflow);
            const before = checkout.generatedHashes();
            expect(commands.snapshot.split(' > ')[0].split(' ').slice(1).sort()).toEqual(
                [...checkout.generatedFiles].sort(),
            );
            const missing = checkout.runGenerator('--check');
            expect(missing.status).toBe(1);
            expect(missing.stderr).toContain('output/spark-runtime-tree-manifest.json');
            expect(checkout.generatedHashes()).toEqual(before);
            expect(checkout.runShell(commands.snapshot).status).toBe(0);
            const generated = checkout.runGenerator();
            expect(generated.status).toBe(0);
            expect(JSON.parse(generated.stdout).passed).toBe(true);
            const manifest = fs.readFileSync(
                path.join(checkout.repo, 'output/spark-runtime-tree-manifest.json'),
                'utf8',
            );
            manifestsAtRoots.push(manifest);
            expect(manifest).not.toContain(checkout.repo);
            expect(manifest).not.toContain(root);
            expect(checkout.generatedHashes()).toEqual(before);
            generatedAtRoots.push(checkout.generatedHashes());
            for (const file of checkout.generatedFiles) {
                const bytes = fs.readFileSync(path.join(checkout.repo, file));
                expect(bytes.includes(Buffer.from(checkout.repo))).toBe(false);
                expect(bytes.includes(Buffer.from(root))).toBe(false);
            }
            expect(checkout.runShell(commands.hashGuard + '\n' + commands.diffGuard).status).toBe(0);
            const checked = checkout.runGenerator('--check');
            expect(checked.status).toBe(0);
            expect(JSON.parse(checked.stdout).passed).toBe(true);
        }
        expect(generatedAtRoots[0]).toEqual(generatedAtRoots[1]);
        expect(manifestsAtRoots[0]).toBe(manifestsAtRoots[1]);
    });

    test('both workflow guards reject a bootstrap that repairs corrupted tracked Spark source bytes', () => {
        for (const workflow of ['example-evidence', 'format']) {
            const commands = sparkBootstrapCommands(`.github/workflows/${workflow}.yml`);
            for (const suffix of ['js', 'js.map', 'd.ts']) {
                const checkout = cleanSparkCheckout(`${workflow}-${suffix}`);
                const original = checkout.generatedHashes();
                expect(checkout.runGenerator().status).toBe(0);
                const file = `src/air/spark/generated/spark-runtime.${suffix}`;
                fs.appendFileSync(path.join(checkout.repo, file), '\n ');
                expect(cp.spawnSync('git', ['add', file], { cwd: checkout.repo }).status).toBe(0);
                const before = checkout.generatedHashes();
                const manifestPath = path.join(checkout.repo, 'output/spark-runtime-tree-manifest.json');
                const manifestBefore = fs.readFileSync(manifestPath);
                expect(checkout.runGenerator('--check').status).toBe(1);
                expect(checkout.generatedHashes()).toEqual(before);
                expect(fs.readFileSync(manifestPath).equals(manifestBefore)).toBe(true);
                expect(checkout.runShell(commands.snapshot).status).toBe(0);
                expect(checkout.runGenerator().status).toBe(0);
                expect(checkout.generatedHashes()).not.toEqual(before);
                expect(checkout.generatedHashes()).toEqual(original);
                // The generator accepts its repaired output; the workflow must still reject the candidate rewrite.
                expect(checkout.runGenerator('--check').status).toBe(0);
                const guarded = checkout.runShell(
                    commands.hashGuard + '\n' + commands.diffGuard + '\nprintf "preflight would run\\n"',
                );
                expect(guarded.status).toBe(1);
                expect(guarded.stdout).toContain(`${file}: FAILED`);
                expect(guarded.stdout).not.toContain('preflight would run');
                expect(checkout.runShell(commands.diffGuard).status).toBe(1);
            }
        }
    });

    test('current generated source maps match real current inputs', () => {
        const maps = preflight.checkSourceMaps(root);
        expect(maps).toHaveLength(3);
        expect(maps.every((map: any) => map.verifiedSources > 0)).toBe(true);
        expect(maps[2].virtual.map((item: any) => item.source)).toEqual(['air-inline-worker:air-spark-inline-worker']);
    });
    test('stale source map contents fail before evidence collection', () => {
        put('src/main.ts', 'new source');
        for (const name of preflight.MAPS)
            put(name, JSON.stringify({ sources: ['../src/main.ts'], sourcesContent: ['old source'] }));
        expect(() => preflight.checkSourceMaps(temp)).toThrow('Build/source drift');
    });
    test('unrecognized virtual source cannot skip current-source checks', () => {
        for (const name of preflight.MAPS)
            put(name, JSON.stringify({ sources: ['unknown:fake'], sourcesContent: ['fake'] }));
        expect(() => preflight.checkSourceMaps(temp)).toThrow();
    });
    test('response body store reuses identical bytes and verifies their full hash', () => {
        const dir = path.join(temp, 'responses');
        const bytes = Buffer.from('actual HTTP body');
        const first = runtime.persistResponseBody(dir, bytes);
        const second = runtime.persistResponseBody(dir, bytes);
        expect(second).toEqual(first);
        expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(fs.readFileSync(first.path).equals(bytes)).toBe(true);
        expect(fs.readdirSync(dir)).toHaveLength(1);
    });
    test('changed CAS bytes are rejected, not relabelled with their filename hash', () => {
        const first = runtime.persistResponseBody(temp, 'body');
        fs.writeFileSync(first.path, 'wrong');
        expect(() => runtime.persistResponseBody(temp, 'body')).toThrow('response body store drift');
    });
    test('response body symlink is rejected even when its target has identical bytes', () => {
        const first = runtime.persistResponseBody(temp, 'body');
        fs.unlinkSync(first.path);
        fs.symlinkSync(put('other', 'body'), first.path);
        expect(() => runtime.persistResponseBody(temp, 'body')).toThrow('response body store drift');
    });
    test('physical HTTP server closes even when context cleanup rejects', async () => {
        const server = http.createServer();
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        let closed = false;
        server.once('close', () => {
            closed = true;
        });
        let browserClosed = false;
        const instance = new runtime.BrowserRuntime({ esbuild: {}, repo: root });
        instance.context = {
            close: async () => {
                throw Error('context close failed');
            },
        };
        instance.browser = {
            close: async () => {
                browserClosed = true;
            },
        };
        instance.server = server;
        await expect(instance.stop()).rejects.toThrow('BrowserRuntime cleanup failed');
        expect(browserClosed).toBe(true);
        expect(closed).toBe(true);
        expect(server.listening).toBe(false);
    });
    test('late runtime errors through stop invalidate a previously successful row', () => {
        const output = { result: 'PASS', errors: [], validatorResults: [], networkAssets: [] };
        collector.sealStoppedEvidence(
            {
                pageErrors: [{ message: 'late unfrozen-network' }],
                resourceResponses: [
                    {
                        url: 'http://127.0.0.1:1/a',
                        status: 200,
                        size: 4,
                        sha256: 'a'.repeat(64),
                        observation: 'server-response',
                    },
                ],
            },
            output,
        );
        expect(output.result).toBe('FAIL');
        expect(output.errors).toEqual(['late unfrozen-network']);
        expect(output.networkAssets).toHaveLength(1);
    });
    test('nested cross-example direct bundle imports cannot bypass instrumentation', () => {
        const workspace = path.join(temp, 'examples/selected');
        fs.mkdirSync(workspace, { recursive: true });
        put('examples/sibling/src/nested.ts', "export { Node } from '/build/cocosair.module.js';");
        expect(
            collector.traceBypasses(workspace, '<html></html>', [
                {
                    source: 'examples/sibling/src/nested.ts',
                    resolved: 'examples/sibling/src/nested.ts',
                    kind: 'module',
                },
            ]),
        ).toEqual(['examples/sibling/src/nested.ts']);
    });
    test('both independent Spark artifacts affect candidate identity', () => {
        for (const file of ['cocosair.module.js', 'cocosair.module.d.ts', 'spark.module.js', 'spark.module.d.ts'])
            put('build/' + file, file);
        const original = trace.candidateFingerprint(temp);
        put('build/spark.module.js', 'changed JS');
        const changedJS = trace.candidateFingerprint(temp);
        expect(changedJS).not.toBe(original);
        put('build/spark.module.d.ts', 'changed declaration');
        expect(trace.candidateFingerprint(temp)).not.toBe(changedJS);
    });
    test('candidate cannot omit an independent Spark declaration', () => {
        for (const file of ['cocosair.module.js', 'cocosair.module.d.ts', 'spark.module.js'])
            put('build/' + file, file);
        expect(() => trace.candidateFingerprint(temp)).toThrow('candidate artifact missing');
    });
    test('each sealed attempt must pass strict admission before the next example can run', () => {
        const fixtures = nodeRequire(path.join(root, 'tools/verify/example-evidence-campaign.cpu-fixture.cjs'));
        for (const malformed of [false, true]) {
            const state = fixtures.fixture();
            try {
                const attempt = fixtures.attempt(state, 'spark-splats', {
                    result: malformed
                        ? (row: any) => {
                              row.validatorResults = [];
                          }
                        : undefined,
                });
                const segment = fixtures.segment(state, [attempt]);
                const result = runner.inspectAttemptAdmission({
                    repo: state.repo,
                    freeze: state.freeze,
                    segments: [segment],
                    id: 'spark-splats',
                    attempt: 1,
                });
                expect(result.ok).toBe(!malformed);
                expect(result.partial).toBe(true);
                expect(result.completed).toBe(false);
                if (malformed) expect(result.errors.join('; ')).toMatch(/missing validators/);
            } finally {
                fs.rmSync(state.temp, { recursive: true, force: true });
            }
        }
    });

    test('unknown ID and overwrite/retry without history are rejected before browser launch', () => {
        const freezePath = put('freeze.json', JSON.stringify({ scope: [{ id: 'one' }] }));
        expect(() =>
            runner.planAttempt({ freezePath, id: 'missing', out: path.join(temp, 'attempts/missing/1') }),
        ).toThrow('known frozen ID');
        expect(() =>
            runner.planAttempt({ freezePath, id: 'one', attempt: 2, out: path.join(temp, 'attempts/one/2') }),
        ).toThrow('preceding');
        const options = { freezePath, id: 'one', out: path.join(temp, 'attempts/one/1') };
        expect(runner.planAttempt(options).entry.id).toBe('one');
        fs.mkdirSync(options.out, { recursive: true });
        expect(() => runner.planAttempt(options)).toThrow('never overwrite');
    });
});

test('default quality stays a bounded five-example core gate without requiring full evidence', () => {
    const yaml = nodeRequire('js-yaml');
    const text = fs.readFileSync(path.join(root, '.github/workflows/format.yml'), 'utf8');
    const workflow = yaml.load(text, { schema: yaml.JSON_SCHEMA });
    expect(Object.keys(workflow.jobs)).toEqual(['quality']);
    expect(Object.keys(workflow.on).sort()).toEqual(['pull_request', 'push']);
    expect(workflow.permissions).toEqual({ contents: 'read' });
    const job = workflow.jobs.quality;
    expect(job['timeout-minutes']).toBe(35);
    const checkouts = job.steps.filter((s: any) => s.uses === 'actions/checkout@v4');
    expect(checkouts).toHaveLength(1);
    expect(checkouts[0].with.repository).toBeUndefined();
    expect(checkouts[0].with['persist-credentials']).toBe(false);
    const runs = job.steps.filter((s: any) => typeof s.run === 'string').map((s: any) => s.run);
    const shell = runs.join('\n');
    for (const command of [
        'npm run format:check',
        'npm run typecheck',
        'npm run build:all',
        'npm run build:spark',
        'shaders-holographic-rotation.test.cjs',
        'example-asset-lifecycle.test.cjs',
        'example-evidence-shutdown-policy.test.cjs',
        'smoke-01-bootstrap.test.ts',
        'smoke-02-scene.test.ts',
        'smoke-03-runtime-asset.test.ts',
        'audio-cancellation.test.ts',
        'audio-cancellation-harness.test.ts',
    ]) {
        expect(shell).toContain(command);
    }
    expect(shell).not.toMatch(
        /verify:test-inventory|verify:browser-matrix|example-evidence-supervisor\.test|example-evidence-process-diagnostics\.test|example-evidence-shutdown-trace|publish-example-evidence|example-evidence-campaign\.cjs (?:check|merge)|COCOS_UPSTREAM|prepare-shader-reference/,
    );
    const smoke = runs.find((run: string) => run.includes('for id in '));
    expect(smoke).toBeDefined();
    const ids = smoke
        .match(/for id in ([^;]+); do/)[1]
        .trim()
        .split(/\s+/);
    expect(ids).toEqual(['shader-driver-pilot', 'glass-refraction', 'gltf-viewer', 'input', 'spark-splats']);
    for (const id of ids) expect(fs.existsSync(path.join(root, 'examples', id, 'example.json'))).toBe(true);
    expect(smoke).toContain(
        'timeout --signal=TERM --kill-after=4s 174s node tools/verify/run-example-evidence-campaign.cjs',
    );
    expect(smoke).toContain('--execute-authorized 2>&1 | tee');
    expect(smoke).toContain(' + 180 ))');
    expect(smoke).toContain(' + 1800 ))');
    expect(smoke).not.toMatch(/--startup|--close|--allow-partial|--promote|--attempt=/);
    expect(shell.indexOf('npm run build:spark')).toBeLessThan(shell.indexOf('example-evidence-campaign.cjs freeze'));
    expect(shell.indexOf('example-evidence-shutdown-policy.test.cjs')).toBeLessThan(shell.indexOf('playwright@'));
    for (const run of runs) {
        expect(run).toMatch(/^set -euo pipefail\n/);
        expect(run).not.toMatch(/\|\|\s*(?:true|:)|set \+e/);
    }
    for (const step of job.steps) expect(step['continue-on-error']).toBeUndefined();
    const upload = job.steps.filter((s: any) => s.uses === 'actions/upload-artifact@v4');
    expect(upload).toHaveLength(1);
    expect(upload[0].if).toBe('always()');
    expect(upload[0].with.path).toContain('/core-example-smoke/');
    expect(upload[0].with.path).not.toContain('docs/evidence/');
});

describe('Committed example evidence workflow safeguards', () => {
    const workflowText = fs.readFileSync(path.join(root, '.github/workflows/example-evidence.yml'), 'utf8');
    const yaml = nodeRequire('js-yaml');
    const workflow = yaml.load(workflowText, { schema: yaml.JSON_SCHEMA });
    const captureJob = workflow.jobs.capture;
    const steps = captureJob.steps;
    const shell = steps
        .filter((step: any) => typeof step.run === 'string')
        .map((step: any) => step.run)
        .join('\n');
    const runContaining = (fragment: string): string => {
        const matches = steps.filter((step: any) => typeof step.run === 'string' && step.run.includes(fragment));
        expect(matches).toHaveLength(1);
        return matches[0].run;
    };

    test('manual full capture checks out the selected revision with read-only credentials', () => {
        expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
        expect(workflow.permissions).toEqual({ contents: 'read' });
        expect(Object.keys(workflow.jobs)).toEqual(['capture']);
        expect(captureJob.needs).toBeUndefined();
        expect(captureJob.permissions).toBeUndefined();
        expect(captureJob['continue-on-error']).toBeUndefined();
        expect(captureJob.if).toBeUndefined();
        const checkouts = steps.filter((step: any) => step.uses?.startsWith('actions/checkout@'));
        expect(checkouts).toHaveLength(1);
        expect(checkouts[0].with.ref).toBe('${{ github.sha }}');
        expect(checkouts[0].with['persist-credentials']).toBe(false);
        const identity = steps.find((step: any) => step.env?.EXPECTED_HEAD);
        expect(identity.env.EXPECTED_HEAD).toBe(checkouts[0].with.ref);
        expect(identity.run).toContain('test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD"');
        expect(identity.run).toContain('git rev-parse HEAD >');
        expect(workflowText).not.toMatch(/pull_request_target|\bsecrets\s*\.|\bgit\s+(?:[^\n]*\s)?push\b/);
        for (const step of steps) expect(step['continue-on-error']).toBeUndefined();
    });

    test('real dependencies and pinned official browser tooling preserve all committed build bytes', () => {
        const record = runContaining('git ls-files -z build | xargs -0 sha256sum');
        const hydrate = runContaining('npm ci --ignore-scripts');
        const tooling = runContaining('playwright@1.62.1');
        const capture = runContaining('example-evidence-campaign.cjs freeze');
        expect(shell.indexOf(record)).toBeLessThan(shell.indexOf(hydrate));
        expect(shell.indexOf(hydrate)).toBeLessThan(shell.indexOf(tooling));
        expect(shell.indexOf(tooling)).toBeLessThan(shell.indexOf(capture));
        expect(hydrate).toContain('node tools/build/prepare-package.cjs');
        expect(hydrate.indexOf('npm ci')).toBeLessThan(hydrate.indexOf('node tools/build/prepare-package.cjs'));
        expect(tooling).toContain(
            'npm install --prefix "$RUNNER_TEMP/air-browser-tools" --no-save --ignore-scripts --package-lock=false playwright@1.62.1',
        );
        expect(tooling).toContain(
            'node "$RUNNER_TEMP/air-browser-tools/node_modules/playwright/cli.js" install --with-deps chromium',
        );
        expect(tooling).toContain('echo "NODE_PATH=$RUNNER_TEMP/air-browser-tools/node_modules" >> "$GITHUB_ENV"');
        for (const run of [hydrate, tooling]) {
            expect(run).toContain('sha256sum --check "$RUNNER_TEMP/committed-example-campaign/committed-build.sha256"');
            expect(run).toContain(
                'git diff --exit-code -- build tools/build/build-number.json package.json package-lock.json',
            );
        }
        expect(shell).not.toMatch(/\bnpm\s+run\s+build(?::|\s|$)/);
        expect(shell.match(/\bnode tools\/build\/[^\s]+/g)).toEqual([
            'node tools/build/prepare-package.cjs',
            'node tools/build/spark-runtime-tree.cjs',
        ]);
        expect(shell).not.toMatch(/\bln\s+[^\n]*node_modules/);
        expect(workflowText).toContain('test/smoke/smoke-example-driver-pixel-diagnostics.test.ts');
    });

    test('one immutable frozen ID list runs the HTML, driver and Spark pilots before every remaining ID', () => {
        const capture = runContaining('example-evidence-campaign.cjs freeze');
        const compact = capture.replace(/\s/g, '');
        const pilotArray = capture.match(/const pilots = (\[[^\n]+\]);/);
        expect(pilotArray).not.toBeNull();
        expect(JSON.parse(pilotArray![1].replace(/'/g, '"'))).toEqual([
            'html-texture-experimental',
            'shader-driver-pilot',
            'spark-splats',
        ]);
        expect(compact).toContain('if(pilots.some(id=>!freeze.scope.some(entry=>entry.id===id)))throwError(');
        expect(compact).toContain(
            'constids=[...pilots,...freeze.scope.map(entry=>entry.id).filter(id=>!pilots.includes(id))];',
        );
        expect(compact).toContain(
            'if(newSet(ids).size!==freeze.scope.length||ids.length!==freeze.scope.length)throwError(',
        );
        expect(compact).toContain("fs.writeFileSync(path.join(root,'ids.txt'),ids.join('\\n')+'\\n',{flag:'wx'});");
        expect(capture.match(/example-evidence-campaign\.cjs freeze/g)).toHaveLength(1);
        expect(capture.indexOf('example-evidence-preflight.cjs')).toBeLessThan(
            capture.indexOf('example-evidence-campaign.cjs freeze'),
        );
        expect(capture.indexOf('example-evidence-campaign.cjs freeze')).toBeLessThan(
            capture.indexOf('fs.writeFileSync'),
        );
        expect(capture.indexOf('fs.writeFileSync')).toBeLessThan(capture.indexOf('while IFS= read -r id; do'));
        expect(capture).toContain('done < "$campaign/ids.txt"');
        expect(capture).toContain('if [ "$index" -eq 3 ]; then');
        expect(capture).not.toMatch(/--attempt=|--ids=|--allow-partial/);
    });

    test('every attempt is bounded and fail-closed before strict full merge and publication', () => {
        const protocol = nodeRequire(path.join(root, 'tools/verify/example-evidence-campaign.cjs'));
        const capture = runContaining('example-evidence-campaign.cjs freeze');
        const publish = runContaining('node tools/verify/publish-example-evidence.cjs');
        expect(protocol.DEFAULT_LIMITS).toEqual({
            startupMs: 30000,
            closeMs: 4000,
            innerMs: 120000,
            abortMs: 125000,
            forceMs: 133000,
            finalMs: 139000,
        });
        expect(captureJob['timeout-minutes']).toBe(90);
        expect(steps[0].run).toContain('date +%s > "$RUNNER_TEMP/committed-example-campaign/job-started-epoch.txt"');
        expect(capture).toContain('capture_deadline=$(( $(date +%s) + 4800 ))');
        expect(capture).toContain('job_deadline=$(( $(cat "$campaign/job-started-epoch.txt") + 4800 ))');
        expect(capture).toContain(
            'campaign_deadline=$(( capture_deadline < job_deadline ? capture_deadline : job_deadline ))',
        );
        expect(capture).toContain('if [ "$(( $(date +%s) + 180 ))" -gt "$campaign_deadline" ]; then');
        expect(capture).toContain('exit 124');
        expect(capture.match(/node tools\/verify\/run-example-evidence-campaign\.cjs/g)).toHaveLength(1);
        expect(capture).toContain(
            'timeout --signal=TERM --kill-after=4s 174s node tools/verify/run-example-evidence-campaign.cjs --freeze="$campaign/freeze.json" --id="$id" --out="$campaign/attempts/$id/1" --execute-authorized 2>&1 | tee "$campaign/invocation-$index.log"',
        );
        for (const run of steps.filter((step: any) => typeof step.run === 'string').map((step: any) => step.run)) {
            expect(run).toMatch(/^set -euo pipefail\n/);
            expect(run).not.toMatch(/\|\|\s*(?:true|:)|set \+e/);
        }
        expect(capture).toContain('.filter(x=>x.endsWith(".json")).sort().map(x=>p.join(d,x)).join(",")');
        expect(capture).toContain(
            'node tools/verify/example-evidence-campaign.cjs merge --freeze="$campaign/freeze.json" --segments="$segments" --out="$campaign/merged.json"',
        );
        expect(capture).toContain(
            'node tools/verify/example-evidence-campaign.cjs check --evidence="$campaign/merged.json"',
        );
        expect(capture.indexOf('example-evidence-campaign.cjs merge')).toBeLessThan(
            capture.indexOf('example-evidence-campaign.cjs check'),
        );
        expect(shell.indexOf(capture)).toBeLessThan(shell.indexOf(publish));
        expect(publish).toContain(
            'node tools/verify/publish-example-evidence.cjs --campaign="$campaign/merged.json" --source-dir="$campaign"',
        );
        expect(publish).toContain('node tools/verify/example-evidence-campaign.cjs check\n');
        expect(publish).toContain('npm run verify:example-chain');
        expect(publish).toContain('git diff --binary -- examples > "$campaign/promotion-delta.patch"');
        for (const run of [capture, publish])
            expect(run).toContain('sha256sum --check "$campaign/committed-build.sha256"');
        expect(shell).not.toMatch(/--allow-partial|--promote|--demote|gallery:manifest/);
        expect(shell).not.toContain('example-evidence-shutdown-trace.cjs --mode=');
        expect(shell).not.toContain('diagnostic_deadline=');
        const manual = yaml.load(
            fs.readFileSync(path.join(root, '.github/workflows/example-shutdown-diagnostic.yml'), 'utf8'),
            { schema: yaml.JSON_SCHEMA },
        );
        expect(Object.keys(manual.on)).toEqual(['workflow_dispatch']);
        expect(manual.permissions).toEqual({ contents: 'read' });
        const manualSteps = Object.values(manual.jobs).flatMap((job: any) => job.steps);
        const compatibility: any = manualSteps.find((step: any) =>
            step.run?.includes('Legacy shutdown trace is unavailable'),
        );
        expect(compatibility).toBeDefined();
        expect(manualSteps.indexOf(compatibility)).toBeLessThan(
            manualSteps.findIndex((step: any) => step.run?.includes('npm ci')),
        );
        const compatibilityCheck = cp.spawnSync('bash', ['-c', compatibility.run], {
            cwd: root,
            encoding: 'utf8',
            timeout: 5000,
        });
        expect(compatibilityCheck.status).toBe(1);
        expect(compatibilityCheck.stderr).toContain('Legacy shutdown trace is unavailable for browser-shutdown/2');
        expect(compatibility.run).not.toMatch(/spawn|execFile|--mode=|playwright/);
        const diagnosticStep: any = manualSteps.find((step: any) => step.run?.includes('diagnostic_deadline='));
        const diagnostic = diagnosticStep.run;
        expect(diagnosticStep['timeout-minutes']).toBe(10);
        expect(manualSteps.some((step: any) => step.run?.includes('publish-example-evidence'))).toBe(false);
        expect(diagnostic).toContain('diagnostic_deadline=$(( $(date +%s) + 600 ))');
        expect(diagnostic).toContain(
            'diagnostic_deadline=$(( diagnostic_deadline < original_job_deadline ? diagnostic_deadline : original_job_deadline ))',
        );
        expect(diagnostic).toContain('if [ "$untraced_completed" -ne 1 ] || [ "$traced_completed" -lt 1 ]; then');

        expect(diagnostic).toContain('for sample in 0 1 2 3 4 5 6; do');
        expect(diagnostic).toContain('if [ "$(( $(date +%s) + 180 ))" -gt "$diagnostic_deadline" ]; then');
        expect(diagnostic).toContain('--mode=availability --trace=on');
        expect(diagnostic).toContain('EXAMPLE_EVIDENCE_LIVE_STRACE_CONTROLS=1');
        expect(diagnostic).toContain('EXAMPLE_EVIDENCE_TRACE_DEADLINE_EPOCH="$diagnostic_deadline"');
        expect(diagnostic).toContain('if [ "$(( $(date +%s) + 370 ))" -gt "$diagnostic_deadline" ]; then');
        expect(diagnostic).toContain('EXAMPLE_EVIDENCE_TRACE_CONTROL_OUT="$diagnostic/live-controls"');
        expect(diagnostic.indexOf('--mode=availability --trace=on')).toBeLessThan(
            diagnostic.indexOf('EXAMPLE_EVIDENCE_LIVE_STRACE_CONTROLS=1'),
        );
        expect(diagnostic.indexOf('EXAMPLE_EVIDENCE_LIVE_STRACE_CONTROLS=1')).toBeLessThan(
            diagnostic.indexOf('for sample in 0 1 2 3 4 5 6; do'),
        );
        expect(diagnostic).toContain('for control in positive browser-nonzero custodian-delayed-stop-ack; do');
        expect(diagnostic).toContain('for trace in off on; do');
        expect(diagnostic).toContain('r.diagnosticComplete!==true||r.canonicalEligible!==false');
        expect(diagnostic).toContain('[ "$attribution" = MATCHED ]');
        expect(diagnostic).not.toMatch(/publish-example|campaign\.cjs merge|--allow-partial/);
        expect(diagnostic).not.toMatch(/sudo|sysctl\s|setcap|seccomp=/);
        expect(capture).not.toContain('example-shutdown-diagnostics');
    });

    test('uploads preserve raw attempts, complete portable evidence and hidden interruption backups', () => {
        const uploads = steps.filter((step: any) => step.uses === 'actions/upload-artifact@v4');
        expect(uploads).toHaveLength(4);
        const byName = Object.fromEntries(uploads.map((step: any) => [step.with.name, step]));
        expect(byName['example-shutdown-diagnostics']).toBeUndefined();
        const cpu = byName['example-evidence-cpu-receipts'];
        expect(cpu.if).toBe('always()');
        expect(cpu.with.path).toBe('${{ runner.temp }}/example-evidence-cpu/');
        const raw = byName['committed-example-campaign-raw'];
        expect(raw.if).toBe('always()');
        expect(raw.with.path).toBe('${{ runner.temp }}/committed-example-campaign/');
        expect(raw.with['if-no-files-found']).toBe('error');
        const publication = byName['committed-example-campaign-publication'];
        expect(publication.if).toBe("always() && steps.publish.outcome == 'success'");
        expect(steps.find((step: any) => step.id === 'publish').run).toBe(
            runContaining('node tools/verify/publish-example-evidence.cjs'),
        );
        expect(publication.with.path.trim().split('\n')).toEqual([
            'docs/evidence/examples-verified.json',
            'docs/evidence/example-campaigns/',
        ]);
        const interruption = byName['committed-example-publication-interruption'];
        expect(interruption.if).toBe('failure()');
        expect(interruption.with['include-hidden-files']).toBe(true);
        expect(interruption.with.path.trim().split('\n')).toEqual([
            'docs/evidence/.examples-publication-incomplete.json',
            '.example-publication-stage-*/',
        ]);
    });
});

test('collector sync compiler mode preserves real build/transform bytes without a persistent helper', () => {
    const script = `
        const fs = require('fs'), path = require('path'), crypto = require('crypto');
        const repo = process.argv[1];
        const esbuild = require(path.join(repo, 'node_modules/esbuild'));
        const { BrowserRuntime } = require(path.join(repo, 'tools/benchmark/runner/browser-runtime.cjs'));
        const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
        const namespace = fs.readlinkSync('/proc/self/ns/pid');
        function identity(pid) {
            try {
                const stat = fs.readFileSync('/proc/' + pid + '/stat', 'utf8');
                const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
                if (+fields[1] !== process.pid) return null; // Do not inspect unrelated users' namespaces.
                return { pid, state: fields[0], ppid: +fields[1], startTicks: fields[19],
                    namespace: fs.readlinkSync('/proc/' + pid + '/ns/pid'),
                    command: fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').split('\\0') };
            } catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') return null; throw error; }
        }
        function children() {
            return fs.readdirSync('/proc').filter(name => /^\\d+$/.test(name)).map(name => identity(+name))
                .filter(row => row && row.ppid === process.pid && row.namespace === namespace);
        }
        const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
        (async () => {
            const outputs = [];
            const initial = children();
            for (const dir of ['html-texture-experimental', 'shader-driver-pilot', 'spark-splats']) {
                const runtime = new BrowserRuntime({ esbuild, repo });
                const built = await runtime.build({ paths: { workspace: path.join(repo, 'examples', dir) } });
                if (!built.success) throw Error(JSON.stringify(built));
                outputs.push({ dir, sha256: hash(runtime.compiledEntry.code) });
            }
            const transformed = esbuild.transformSync('export const answer: number = 42', { loader: 'ts', format: 'esm' });
            const afterCalls = children();
            // This is the explicit negative-control teardown, not a production success receipt.
            // Kill only this process's exact esbuild child while its Worker still owns waitpid.
            for (const child of afterCalls) {
                if (!child.command.some(value => /^--service=/.test(value))) throw Error('Unexpected CPU child');
                const current = identity(child.pid);
                if (!current || current.startTicks !== child.startTicks || current.namespace !== child.namespace ||
                    current.ppid !== process.pid) throw Error('CPU child identity changed before cleanup');
                process.kill(child.pid, 'SIGTERM');
            }
            const deadline = Date.now() + 3000;
            while (children().length && Date.now() < deadline) await pause(10);
            const afterCleanup = children();
            await esbuild.stop();
            if (afterCleanup.length) throw Error('Compiler child not physically collected');
            console.log(JSON.stringify({ outputs, transformed: transformed.code, initial, afterCalls, afterCleanup }));
        })().catch(error => { console.error(error.stack); process.exitCode = 1; });
    `;
    const probe = (mode: string) => {
        const child = cp.spawnSync(nodeProcess.execPath, ['-e', script, root], {
            cwd: root,
            env: { ...nodeProcess.env, ESBUILD_WORKER_THREADS: mode },
            encoding: 'utf8',
            timeout: 25000,
        });
        expect(child.status).toBe(0);
        expect(child.signal).toBe(null);
        expect(child.error).toBeUndefined();
        return JSON.parse(child.stdout);
    };
    const defaultMode = probe('1');
    const syncMode = probe('0');
    expect(defaultMode.initial).toEqual([]);
    expect(defaultMode.afterCalls).toHaveLength(1);
    expect(defaultMode.afterCalls[0].command.join(' ')).toMatch(/esbuild.*--service=/);
    expect(defaultMode.afterCleanup).toEqual([]);
    expect(syncMode.initial).toEqual([]);
    expect(syncMode.afterCalls).toEqual([]);
    expect(syncMode.afterCleanup).toEqual([]);
    expect(syncMode.outputs).toEqual(defaultMode.outputs);
    expect(syncMode.transformed).toEqual(defaultMode.transformed);
}, 60000);

test.each([undefined, '1'])('collector rejects compiler mode %s before loading esbuild', (mode) => {
    const child = cp.spawnSync(nodeProcess.execPath, ['-e', `require('./tools/verify/example-spec-browser.cjs')`], {
        cwd: root,
        env: { ...nodeProcess.env, EXAMPLE_EVIDENCE_SUPERVISED: '1', ESBUILD_WORKER_THREADS: mode },
        encoding: 'utf8',
        timeout: 5000,
    });
    expect(child.status).toBe(1);
    expect(child.stderr).toContain('requires ESBUILD_WORKER_THREADS=0 before loading esbuild');
});
