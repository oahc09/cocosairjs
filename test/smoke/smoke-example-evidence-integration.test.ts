import { nodeRequire } from '../shims';
// These tests inspect pure collector guards; real esbuild execution is covered by the workspace CPU subprocess tests.
jest.mock('esbuild', () => ({}));
jest.mock('../../tools/verify/browser-engines.cjs', () => ({
    launchOptions: () => ({ executablePath: '/CPU-NO-BROWSER', args: [] }),
}));
const fs = nodeRequire('fs') as typeof import('fs');
const path = nodeRequire('path') as typeof import('path');
const os = nodeRequire('os') as typeof import('os');
const http = nodeRequire('http') as typeof import('http');
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
describe('Evidence collector integration safeguards', () => {
    test('clean-checkout npm copies are explicitly hydrated without changing committed bundle bytes', () => {
        const cp = nodeRequire('child_process') as typeof import('child_process');
        for (const relative of [
            'tools/build/prepare-package.cjs',
            'tools/build/runtime-layout.cjs',
            'tools/verify/published-artifacts.cjs',
            'src/air/builtin/register.ts',
            'package.json',
            'build/cocosair.module.js',
            'build/cocosair.module.min.js',
        ]) {
            put(relative, fs.readFileSync(path.join(root, relative), 'utf8'));
        }
        for (const file of ['build/cocosair.module.js.map', 'build/cocosair.module.min.js.map']) put(file, '{}');
        const before = fs.readFileSync(path.join(temp, 'build/cocosair.module.js'));
        const run = (script: string) =>
            cp.spawnSync('node', [path.join(temp, script)], { cwd: temp, encoding: 'utf8' });
        expect(run('tools/verify/published-artifacts.cjs').status).toBe(1);
        expect(run('tools/build/prepare-package.cjs').status).toBe(0);
        expect(run('tools/verify/published-artifacts.cjs').status).toBe(0);
        expect(fs.readFileSync(path.join(temp, 'build/cocosair.module.js')).equals(before)).toBe(true);
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

    test('independent PR capture checks out the exact head with read-only credentials', () => {
        expect(Object.keys(workflow.on).sort()).toEqual(['pull_request', 'workflow_dispatch']);
        expect(workflow.permissions).toEqual({ contents: 'read' });
        expect(Object.keys(workflow.jobs)).toEqual(['capture']);
        expect(captureJob.needs).toBeUndefined();
        expect(captureJob.permissions).toBeUndefined();
        expect(captureJob['continue-on-error']).toBeUndefined();
        expect(captureJob.if).toBe(
            "github.event_name == 'workflow_dispatch' || github.event.pull_request.head.repo.full_name == github.repository",
        );
        const checkouts = steps.filter((step: any) => step.uses?.startsWith('actions/checkout@'));
        expect(checkouts).toHaveLength(1);
        expect(checkouts[0].with.ref).toBe('${{ github.event.pull_request.head.sha || github.sha }}');
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
        expect(shell.match(/\bnode tools\/build\/[^\s]+/g)).toEqual(['node tools/build/prepare-package.cjs']);
        expect(shell).not.toMatch(/\bln\s+[^\n]*node_modules/);
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
            startupMs: 15000,
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
    });

    test('uploads preserve raw attempts, complete portable evidence and hidden interruption backups', () => {
        const uploads = steps.filter((step: any) => step.uses === 'actions/upload-artifact@v4');
        expect(uploads).toHaveLength(3);
        const byName = Object.fromEntries(uploads.map((step: any) => [step.with.name, step]));
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
