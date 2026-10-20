'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const { FAMILIES, STEP_SCOPES, classify, parseTree, treeAt, changedPaths, validateSteps } = require('./ci-scope.cjs');
const script = path.resolve(__dirname, 'ci-scope.cjs');
const root = path.resolve(__dirname, '../..');
function temporary(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-ci-policy-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}
function put(root, file, content) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
}
function git(dir, ...args) {
    return cp
        .execFileSync(
            'git',
            ['-C', dir, '-c', 'user.name=CI fixture', '-c', 'user.email=fixture@example.invalid', ...args],
            {
                encoding: 'utf8',
                env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
                stdio: ['ignore', 'pipe', 'pipe'],
            },
        )
        .trim();
}
function commit(dir) {
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'Synthetic CI policy fixture');
    return git(dir, 'rev-parse', 'HEAD');
}
function stepsFor(plan) {
    return Object.fromEntries(
        Object.entries(STEP_SCOPES).map(([id, scope]) => [
            id,
            { outcome: scope === 'always' || plan[scope] ? 'success' : 'skipped' },
        ]),
    );
}
function cli(dir, args, env = {}) {
    return cp.spawnSync(process.execPath, [script, ...args], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, CI_RECEIPT_DIR: path.join(dir, 'output/ci'), ...env },
    });
}
for (const files of [
    ['README.md'],
    ['docs/guides/rendering.md', 'ai/plans/design.txt'],
    ['docs/reference/ci.md', 'skills/cocosair/SKILL.md'],
]) {
    test('explicit prose-only paths avoid builds: ' + files.join(','), () => {
        const plan = classify(files);
        assert.equal(plan.code, false);
        assert.equal(
            plan.skills,
            files.some((p) => p.startsWith('skills/')),
        );
        assert.equal(plan.full, false);
    });
}
for (const file of [
    'src/air/app.ts',
    'src/cocos/foo.ts',
    'src/pal/foo.js',
    'pal/foo.ts',
    'package-lock.json',
    'package.json',
    'tools/build/prepare-package.cjs',
    'build/a.js.map',
    '.github/workflows/format.yml',
    'docs/manual/examples/demo/index.html',
    'docs/guide/sample.js',
    'examples/shared/asset-lifecycle.js',
    'fixtures/a.json',
    'unknown.txt',
    'ai/ledgers/current.json',
]) {
    test('shared, executable or unknown input remains full: ' + file, () => {
        const plan = classify([file]);
        assert.equal(plan.full, true);
        assert.equal(plan.skills, true);
        for (const f of FAMILIES) assert.equal(plan[f], true);
    });
}
for (const [file, family] of [
    ['tools/verify/interactive-timeline-browser.cjs', 'timeline'],
    ['test/smoke/interactive-geometry.test.ts', 'geometry'],
    ['examples/interactive-input/src/main.ts', 'input'],
    ['examples/water-multipass/src/main.ts', 'color'],
    ['tools/verify/interactive-performance.cjs', 'performance'],
    ['docs/manual/examples/interactive-kit/main.js', 'kit'],
]) {
    test('related module retains its complete suite: ' + family, () => {
        const plan = classify([file]);
        assert.equal(plan.code, true);
        assert.equal(plan[family], true);
        assert.equal(plan.full, false);
    });
}
test('unknown, empty, bad paths and unavailable diffs are conservative; explicit manual modes work', () => {
    for (const plan of [
        classify([]),
        classify(['../escape']),
        classify(['/absolute']),
        classify(['bad\\name']),
        classify(['README.md'], 'auto', 'missing base'),
        classify(['README.md'], 'unexpected'),
        classify(['README.md'], 'full'),
    ])
        assert.equal(plan.full, true);
    assert.equal(classify([], 'skills').skills, true);
    assert.equal(classify([], 'skills').code, false);
    assert.equal(classify(['tools/skills/check-p1.cjs']).skills, true);
});
test('real independent Git trees include renamed, deleted, new, spaced and newline paths', (t) => {
    const dir = temporary(t),
        base = path.join(dir, '.ci-base');
    fs.mkdirSync(base);
    for (const repo of [dir, base]) {
        git(repo, 'init', '-q');
        put(repo, '.gitignore', '.ci-base/\noutput/\n');
        put(repo, 'docs/deleted.md', 'old');
        put(repo, 'old name.txt', 'same');
        put(repo, 'docs/unchanged.md', 'same');
    }
    const before = commit(base);
    fs.rmSync(path.join(dir, 'docs/deleted.md'));
    fs.renameSync(path.join(dir, 'old name.txt'), path.join(dir, 'new name.txt'));
    // Git permits newline paths even on hosts whose filesystem does not. Keep the
    // real tree fixture portable by writing this one entry through the index.
    git(dir, 'add', '.');
    const blob = cp
        .execFileSync('git', ['-C', dir, 'hash-object', '-w', '--stdin'], {
            input: 'new',
            encoding: 'utf8',
        })
        .trim();
    git(
        dir,
        '-c',
        'core.protectNTFS=false',
        'update-index',
        '--add',
        '--cacheinfo',
        '100644',
        blob,
        'docs/new\nline.md',
    );
    git(dir, 'commit', '-qm', 'Synthetic CI policy fixture with newline path');
    const after = git(dir, 'rev-parse', 'HEAD');
    assert.deepEqual(changedPaths(treeAt(base, before), treeAt(dir, after)), [
        'docs/deleted.md',
        'docs/new\nline.md',
        'new name.txt',
        'old name.txt',
    ]);
    assert.throws(() => treeAt(base, after), /mismatch/);
    const run = cli(dir, ['plan'], {
        CI_EVENT: 'pull_request',
        CI_MODE: 'auto',
        CI_HEAD_SHA: after,
        CI_BASE_SHA: before,
    });
    assert.equal(run.status, 0, run.stderr);
    const plan = JSON.parse(fs.readFileSync(path.join(dir, 'output/ci/scope.json')));
    assert.equal(plan.head, after);
    assert.equal(plan.base, before);
    assert.equal(plan.full, true);
    assert.equal(plan.files.length, 4);
    const missing = cli(dir, ['plan'], { CI_EVENT: 'pull_request', CI_HEAD_SHA: after, CI_BASE_SHA: '0'.repeat(40) });
    assert.equal(missing.status, 0);
    assert.equal(JSON.parse(missing.stdout).full, true);
    const tag = cli(dir, ['plan'], { CI_EVENT: 'push', CI_HEAD_SHA: after });
    assert.equal(JSON.parse(tag.stdout).full, true);
});
test('tree parsing keeps mode changes and rejects malformed records', () => {
    const sha = '1'.repeat(40),
        a = parseTree(Buffer.from(`100644 blob ${sha}\ta\0`)),
        b = parseTree(Buffer.from(`100755 blob ${sha}\ta\0`));
    assert.deepEqual(changedPaths(a, b), ['a']);
    assert.deepEqual(changedPaths(a, a), []);
    assert.throws(() => parseTree(Buffer.from('bogus\ta\0')), /invalid/);
});
for (const outcome of ['failure', 'cancelled', 'skipped', undefined]) {
    test('required result cannot become green: ' + String(outcome), (t) => {
        const plan = classify([], 'full'),
            steps = stepsFor(plan);
        steps.geometry_cpu = outcome ? { outcome } : undefined;
        const result = validateSteps(plan, steps);
        assert.equal(result.passed, false);
        assert.match(result.errors.join('\n'), /geometry_cpu/);
        const dir = temporary(t);
        put(dir, 'output/ci/scope.json', JSON.stringify(plan));
        const run = cli(dir, ['gate'], { CI_STEPS_JSON: JSON.stringify(steps) });
        assert.equal(run.status, 1);
        assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'output/ci/gate.json'))).passed, false);
    });
}
test('only explicit unrelated skips pass; missing or inconsistent plans fail', () => {
    const plan = classify(['docs/guides/plain.md']),
        steps = stepsFor(plan),
        result = validateSteps(plan, steps);
    assert.equal(result.passed, true);
    assert(result.skipped.some((row) => row.id === 'build' && row.reason === 'plan.code=false'));
    steps.build = { outcome: 'success' };
    assert.equal(validateSteps(plan, steps).passed, false);
    assert.equal(validateSteps(null, {}).passed, false);
    assert.equal(validateSteps({ ...plan, geometry: true }, {}).passed, false);
    assert.equal(validateSteps({ ...plan, full: true }, {}).passed, false);
    assert.equal(validateSteps(classify([], 'full'), stepsFor(classify([], 'full'))).passed, true);
});
test('a real piped CPU failure prevents the subsequent synthetic build and gate rejects its skip', (t) => {
    const dir = temporary(t),
        marker = path.join(dir, 'should-not-build');
    const run = cp.spawnSync(
        'bash',
        ['-c', 'set -euo pipefail\n"$NODE" -e "process.exit(7)" | tee "$LOG"\nprintf built > "$MARKER"'],
        {
            encoding: 'utf8',
            env: { ...process.env, NODE: process.execPath, LOG: path.join(dir, 'failure.log'), MARKER: marker },
        },
    );
    assert.equal(run.status, 7);
    assert.equal(fs.existsSync(marker), false);
    const plan = classify([], 'full'),
        steps = stepsFor(plan);
    steps.core_cpu.outcome = 'failure';
    steps.build.outcome = 'skipped';
    assert.equal(validateSteps(plan, steps).passed, false);
});
test('timings record actual cache output and preserve failed phase exit', (t) => {
    const dir = temporary(t),
        env = {
            CI_DEPENDENCY_CACHE_HIT: 'false',
            CI_HEAD_SHA: 'a'.repeat(40),
            ImageOS: 'ubuntu24',
            ImageVersion: 'fixture-image',
        };
    assert.equal(cli(dir, ['time-start', 'cpu'], env).status, 0);
    assert.equal(cli(dir, ['time-end', 'cpu', '7'], env).status, 0);
    const result = JSON.parse(fs.readFileSync(path.join(dir, 'output/ci/timings.json')));
    assert.equal(result.dependencyCacheHit, false);
    assert.equal(result.imageOS, 'ubuntu24');
    assert.equal(result.phases.cpu.exitCode, 7);
    assert(result.phases.cpu.elapsedMs >= 0);
    assert.equal(cli(dir, ['time-start', 'cpu'], env).status, 1);
    const other = path.join(dir, 'unknown');
    fs.mkdirSync(other);
    assert.equal(cli(other, ['time-start', 'install']).status, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(other, 'output/ci/timings.json'))).dependencyCacheHit, null);
});
test('fresh artifact copy requires matching head and all expected outputs, never optional stale glob', (t) => {
    const dir = temporary(t);
    git(dir, 'init', '-q');
    put(dir, 'README.md', 'synthetic artifact contract');
    put(dir, '.gitignore', 'build/\noutput/\n');
    const head = commit(dir);
    const files = [
        'cocosair.module.js',
        'cocosair.module.min.js',
        'cocosair.module.js.map',
        'cocosair.module.min.js.map',
        'cocosair.module.d.ts',
        'cocosair.legacy.d.ts',
        'cocosair.math.js',
        'cocosair.math.d.ts',
        'cocosair.math.legacy.d.ts',
        'math-build.json',
    ];
    for (const name of files) put(dir, 'build/' + name, 'synthetic:' + name);
    assert.equal(cli(dir, ['identity'], { CI_HEAD_SHA: '0'.repeat(40) }).status, 1);
    assert.equal(fs.existsSync(path.join(dir, 'output/ci/build')), false);
    fs.rmSync(path.join(dir, 'build/math-build.json'));
    assert.equal(cli(dir, ['identity'], { CI_HEAD_SHA: head }).status, 1);
    assert.equal(fs.existsSync(path.join(dir, 'output/ci/build')), false);
    put(dir, 'build/math-build.json', 'synthetic:math-build.json');
    const run = cli(dir, ['identity'], { CI_HEAD_SHA: head });
    assert.equal(run.status, 0, run.stderr);
    const receipt = JSON.parse(fs.readFileSync(path.join(dir, 'output/ci/build-identity.json')));
    assert.equal(receipt.head, head);
    assert.equal(receipt.files.length, 10);
    for (const row of receipt.files)
        assert.equal(
            crypto
                .createHash('sha256')
                .update(fs.readFileSync(path.join(dir, 'output/ci', row.path)))
                .digest('hex'),
            row.sha256,
        );
});
test('one ordinary workflow has CPU before one build, exact-head receipts and always fail-closed gate', () => {
    const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/format.yml'), 'utf8'), {
            schema: yaml.JSON_SCHEMA,
        }),
        steps = workflow.jobs.quality.steps;
    assert.deepEqual(Object.keys(workflow.jobs), ['quality']);
    assert.deepEqual(workflow.permissions, { contents: 'read' });
    assert.equal(workflow.concurrency['cancel-in-progress'], true);
    assert.equal(steps.find((s) => s.uses === 'actions/setup-node@v4').with['node-version'], '22.23.3');
    const all = steps
        .filter((s) => s.run)
        .map((s) => s.run)
        .join('\n');
    assert.equal((all.match(/npm run build:all/g) || []).length, 1);
    assert.equal((all.match(/npm ci --ignore-scripts/g) || []).length, 1);
    for (const id of ['typecheck', 'core_cpu', 'sdk_cpu', 'geometry_cpu'])
        assert(steps.findIndex((s) => s.id === id) < steps.findIndex((s) => s.id === 'build'));
    const build = steps.find((s) => s.id === 'build');
    assert(build.run.indexOf('npm run build:all') < build.run.indexOf('ci-scope.cjs identity'));
    const gate = steps.find((s) => s.id === 'gate');
    assert.equal(gate.if, 'always()');
    assert.equal(gate.env.CI_STEPS_JSON, '${{ toJSON(steps) }}');
    for (const id of Object.keys(STEP_SCOPES)) {
        const matches = steps.filter((s) => s.id === id);
        assert.equal(matches.length, 1, id);
        if (STEP_SCOPES[id] !== 'always')
            assert.equal(matches[0].if, `steps.classify.outputs.${STEP_SCOPES[id]} == 'true'`);
    }
    for (const step of steps) {
        if (step.id !== 'base_tree') assert.equal(step['continue-on-error'], undefined);
        if (step.run) {
            assert.match(step.run, /^set -euo pipefail\n/);
            assert.doesNotMatch(step.run, /\|\|\s*(?:true|:)|set \+e/);
            const syntax = cp.spawnSync('bash', ['-n'], { input: step.run, encoding: 'utf8' });
            assert.equal(syntax.status, 0, syntax.stderr);
        }
    }
    const upload = steps.filter((s) => s.uses === 'actions/upload-artifact@v4');
    assert.equal(upload.length, 1);
    assert.equal(upload[0].if, 'always()');
    assert.match(upload[0].with.path, /output\/ci\//);
    assert.doesNotMatch(upload[0].with.path, /^\s*build\//m);
    for (const name of ['sdk-recipes', 'skills']) {
        const wrapper = yaml.load(fs.readFileSync(path.join(root, `.github/workflows/${name}.yml`), 'utf8'), {
            schema: yaml.JSON_SCHEMA,
        });
        assert.deepEqual(Object.keys(wrapper.on), ['workflow_dispatch']);
        const job = Object.values(wrapper.jobs)[0];
        assert.equal(job.uses, './.github/workflows/format.yml');
        assert.equal(job.with.mode, name === 'skills' ? 'skills' : 'full');
    }
});

// CLI modes differ intentionally: geometry/input require an explicit selection;
// timeline/multipass/color/kit auditors validate the report's selected scope internally.
// Evidence-chain reports define their own requested browser/DPR subset. Performance
// remains CPU-contract-only here, with no fabricated device measurement command.
const BROWSER_COMMAND_CONTRACTS = [
    ['timeline', 'interactive-timeline-browser', { browser: 'chromium', out: 'timeline.json' }],
    ['timeline', 'interactive-timeline-browser', { browser: 'chromium', verify: 'timeline.json' }],
    ['timeline', 'interactive-timeline-audit', { report: 'timeline.json', out: 'timeline-audit.json' }],
    ['evidence', 'interactive-improvement-browser', { browser: 'chromium', out: 'input-compositor.json' }],
    ['evidence', 'interactive-improvement-browser', { verify: 'input-compositor.json' }],
    [
        'evidence',
        'interactive-improvement-evidence-audit',
        { report: 'input-compositor.json', out: 'input-compositor-audit.json' },
    ],
    ['multipass', 'interactive-multipass-browser', { browser: 'chromium', out: 'multipass.json' }],
    ['multipass', 'interactive-multipass-browser', { browser: 'chromium', verify: 'multipass.json' }],
    ['multipass', 'interactive-multipass-audit', { report: 'multipass.json', out: 'multipass-audit.json' }],
    ['geometry', 'interactive-geometry-browser', { browser: 'chromium', out: 'geometry.json' }],
    ['geometry', 'interactive-geometry-browser', { browser: 'chromium', verify: 'geometry.json' }],
    [
        'geometry',
        'interactive-geometry-audit',
        { browser: 'chromium', report: 'geometry.json', out: 'geometry-audit.json' },
    ],
    ['color', 'interactive-color-compare-browser', { browser: 'chromium', out: 'color-compare.json' }],
    ['color', 'interactive-color-compare-browser', { browser: 'chromium', verify: 'color-compare.json' }],
    ['color', 'interactive-color-compare-audit', { report: 'color-compare.json', out: 'color-compare-audit.json' }],
    ['mixed_input', 'interactive-input-browser', { browser: 'chromium', out: 'mixed-input.json' }],
    [
        'mixed_input',
        'interactive-input-audit',
        { browser: 'chromium', report: 'mixed-input.json', out: 'mixed-input-audit.json' },
    ],
    [
        'installed_kit',
        'interactive-kit-consumer',
        { browser: 'chromium', tarball: 'tarball/cocosair.js-1.0.0.tgz', out: 'installed-kit.json' },
    ],
    ['installed_kit', 'interactive-kit-consumer', { browser: 'chromium', verify: 'installed-kit.json' }],
    ['installed_kit', 'interactive-kit-audit', { report: 'installed-kit.json', out: 'installed-kit-audit.json' }],
];
function checkBrowserCommands(text) {
    const workflow = yaml.load(text, { schema: yaml.JSON_SCHEMA });
    const actual = [];
    for (const step of workflow.jobs.quality.steps) {
        for (const match of (step.run || '').matchAll(/\bnode (tools\/verify\/interactive-[\w-]+\.cjs)([^\n]*)/g)) {
            if (!BROWSER_COMMAND_CONTRACTS.some(([id]) => id === step.id)) continue;
            const options = {};
            const args = match[2]
                .split(/\s+(?:2>&1|\|)|;/)[0]
                .trim()
                .split(/\s+/)
                .filter(Boolean);
            for (const arg of args) {
                const m = /^--([a-z-]+)=(.+)$/.exec(arg);
                assert(m, 'unrecognized CLI argument ' + arg);
                assert.equal(options[m[1]], undefined, 'duplicate CLI argument ' + m[1]);
                options[m[1]] = m[2];
            }
            actual.push([step.id, path.basename(match[1], '.cjs'), options]);
        }
    }
    const expected = BROWSER_COMMAND_CONTRACTS.map(([step, script, options]) => [
        step,
        script,
        Object.fromEntries(Object.entries(options).map(([k, v]) => [k, k === 'browser' ? v : 'output/sdk-ci/' + v])),
    ]);
    assert.deepEqual(actual, expected);
    const mixed = workflow.jobs.quality.steps.find((s) => s.id === 'mixed_input').run;
    assert.match(mixed, /checkSelectedReport\(report, \['chromium'\]\)/);
    assert.match(mixed, /!validation\.valid/);
    assert.match(mixed, /!validation\.notRun\.length/);
    const shell = workflow.jobs.quality.steps.map((s) => s.run || '').join('\n');
    assert.doesNotMatch(shell, /node tools\/verify\/interactive-performance(?:-audit)?\.cjs/);
}
const workflowText = () => fs.readFileSync(path.join(root, '.github/workflows/format.yml'), 'utf8');
function checkFreshMapPhase(text) {
    const steps = yaml.load(text, { schema: yaml.JSON_SCHEMA }).jobs.quality.steps;
    const build = steps.findIndex((s) => s.id === 'build');
    const packageIndex = steps.findIndex((s) => s.id === 'package');
    assert(build >= 0 && packageIndex > build);
    const matches = steps.filter((s) => /npx jest[^\n]*test\/smoke\/generated-source-maps\.test\.ts/.test(s.run || ''));
    assert.equal(matches.length, 1);
    assert.equal(matches[0], steps[packageIndex]);
    assert.equal(matches[0].if, "steps.classify.outputs.code == 'true'");
    assert.doesNotMatch(matches[0].run, /--testNamePattern|--passWithNoTests/);
    assert.match(
        matches[0].run,
        /!r\.success\|\|r\.numTotalTests!==1\|\|r\.numPassedTests!==1\|\|r\.numPendingTests!==0/,
    );
    assert.match(matches[0].run, /--json --outputFile=output\/sdk-ci\/generated-source-maps-tests\.json/);
    const core = steps.find((s) => s.id === 'core_cpu');
    assert.match(core.run, /test\/smoke\/smoke-example-evidence-integration\.test\.ts/);
    assert.doesNotMatch(core.run, /--testNamePattern|generated-source-maps\.test/);
}
test('fresh source-map positive runs exactly once after the build; CPU negatives remain before it', () => {
    checkFreshMapPhase(workflowText());
    const cpu = fs.readFileSync(path.join(root, 'test/smoke/smoke-example-evidence-integration.test.ts'), 'utf8');
    const built = fs.readFileSync(path.join(root, 'test/smoke/generated-source-maps.test.ts'), 'utf8');
    assert.doesNotMatch(cpu, /current generated source maps match real current inputs/);
    assert.match(cpu, /stale source map contents fail before evidence collection/);
    assert.equal((built.match(/test\(/g) || []).length, 1);
    assert.match(built, /preflight\.checkSourceMaps\(root\)/);
    assert.match(built, /toHaveLength\(3\)/);
});
for (const [name, from, to] of [
    [
        'missing run',
        'npx jest --runInBand --no-cache --runTestsByPath test/smoke/generated-source-maps.test.ts',
        'echo missing-fresh-map-run',
    ],
    ['missing exact count', 'r.numPassedTests!==1', 'false'],
    [
        'test filter',
        '--runTestsByPath test/smoke/generated-source-maps.test.ts',
        '--testNamePattern=never --runTestsByPath test/smoke/generated-source-maps.test.ts',
    ],
    [
        'prebuild run',
        'test/smoke/webgl2-state-audit.test.ts',
        'test/smoke/generated-source-maps.test.ts test/smoke/webgl2-state-audit.test.ts',
    ],
]) {
    test('fresh source-map phase rejects ' + name, () => {
        const text = workflowText();
        assert(text.includes(from));
        assert.throws(() => checkFreshMapPhase(text.replace(from, to)));
    });
}
test('all real workflow collector, verification and audit CLI modes bind the same browser, report and tarball', () => {
    checkBrowserCommands(workflowText());
});
for (const [name, from, to] of [
    [
        'missing geometry selection (actual failed CI)',
        'interactive-geometry-audit.cjs --browser=chromium',
        'interactive-geometry-audit.cjs',
    ],
    [
        'wrong geometry browser',
        'interactive-geometry-audit.cjs --browser=chromium',
        'interactive-geometry-audit.cjs --browser=webkit',
    ],
    [
        'full geometry verification',
        'interactive-geometry-browser.cjs --browser=chromium --verify=',
        'interactive-geometry-browser.cjs --verify=',
    ],
    ['missing input selection', 'interactive-input-audit.cjs --browser=chromium', 'interactive-input-audit.cjs'],
    [
        'unrecognized color audit option',
        'interactive-color-compare-audit.cjs --report=',
        'interactive-color-compare-audit.cjs --browser=chromium --report=',
    ],
    ['wrong timeline report', '--report=output/sdk-ci/timeline.json', '--report=output/sdk-ci/other.json'],
    [
        'wrong installed tarball',
        '--tarball=output/sdk-ci/tarball/cocosair.js-1.0.0.tgz',
        '--tarball=output/sdk-ci/stale.tgz',
    ],
    [
        'wrong selected input verifier',
        "checkSelectedReport(report, ['chromium'])",
        "checkSelectedReport(report, ['webkit'])",
    ],
]) {
    test('workflow CLI contract rejects ' + name, () => {
        const text = workflowText();
        assert(text.includes(from));
        assert.throws(() => checkBrowserCommands(text.replace(from, to)));
    });
}
