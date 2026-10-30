'use strict';
// Read-only Git tree classification and fail-closed CI receipts. No network or build cache.
const fs = require('node:fs'),
    path = require('node:path'),
    cp = require('node:child_process'),
    crypto = require('node:crypto');
const FAMILIES = ['timeline', 'geometry', 'multipass', 'input', 'color', 'performance', 'evidence', 'identity', 'kit'];
const FAMILY_PATHS = {
    timeline: [
        'examples/interactive-timeline/',
        'tools/verify/interactive-timeline',
        'test/smoke/interactive-timeline',
    ],
    geometry: [
        'examples/interactive-geometry/',
        'tools/verify/interactive-geometry',
        'test/smoke/interactive-geometry',
    ],
    multipass: [
        'examples/interactive-multipass/',
        'tools/verify/interactive-multipass',
        'test/smoke/interactive-multipass',
    ],
    input: ['examples/interactive-input/', 'tools/verify/interactive-input', 'test/smoke/interactive-input'],
    color: [
        'examples/hdr-color-pipeline/',
        'examples/water-multipass/',
        'test/fixtures/interactive-color-compare/',
        'tools/verify/interactive-color-compare',
        'test/smoke/interactive-color-compare',
    ],
    performance: ['tools/verify/interactive-performance', 'test/smoke/interactive-performance'],
    evidence: [
        'examples/interactive-container/',
        'test/fixtures/interactive-evidence/',
        'tools/verify/interactive-improvement-browser',
        'tools/verify/interactive-improvement-evidence',
    ],
    identity: ['tools/verify/interactive-improvement-baseline', 'test/smoke/interactive-improvement-baseline'],
    kit: [
        'tools/examples/interactive-kit',
        'tools/verify/interactive-kit',
        'test/smoke/interactive-kit',
        'docs/manual/examples/interactive-kit/',
    ],
};
function classify(files, mode = 'auto', sourceError = '') {
    const plan = {
        schema: 'air-ci-scope/1',
        mode,
        files: [...files],
        reason: sourceError || 'explicit changed-tree paths',
        code: false,
        skills: false,
        full: false,
        ...Object.fromEntries(FAMILIES.map((x) => [x, false])),
    };
    const full = (reason) => {
        plan.reason = reason;
        plan.code = plan.skills = plan.full = true;
        for (const f of FAMILIES) plan[f] = true;
    };
    if (mode === 'skills') {
        plan.skills = true;
        plan.reason = 'explicit skills-only manual command';
        return plan;
    }
    if (mode === 'full' || mode !== 'auto' || sourceError || !files.length) {
        full(sourceError || 'full/manual, unknown mode or empty diff');
        return plan;
    }
    for (const file of files) {
        if (
            typeof file !== 'string' ||
            !file ||
            file.startsWith('/') ||
            file.includes('\\') ||
            file.split('/').includes('..')
        ) {
            full('invalid or unrecognized path');
            break;
        }
        if (file.startsWith('skills/') || file.startsWith('tools/skills/')) {
            plan.skills = true;
            continue;
        }
        if (
            (/^(docs|ai)\//.test(file) && !file.startsWith('docs/manual/examples/') && /\.(md|txt)$/.test(file)) ||
            file === 'README.md'
        )
            continue;
        let known = false;
        for (const [family, prefixes] of Object.entries(FAMILY_PATHS))
            if (prefixes.some((p) => file.startsWith(p))) {
                plan.code = plan[family] = true;
                known = true;
            }
        if (known) {
            if (/^(examples\/interactive-|docs\/manual\/examples\/interactive-kit\/)/.test(file)) plan.kit = true;
            continue;
        }
        full('runtime/config/shared/unknown path requires all retained suites');
        break;
    }
    return plan;
}
function parseTree(buffer) {
    const rows = new Map();
    for (const line of buffer.toString('utf8').split('\0').filter(Boolean)) {
        const tab = line.indexOf('\t');
        if (tab < 0 || !/^[0-7]{6} (blob|commit) [0-9a-f]{40}$/.test(line.slice(0, tab)))
            throw Error('invalid Git tree');
        rows.set(line.slice(tab + 1), line.slice(0, tab));
    }
    return rows;
}
function treeAt(root, expected) {
    if (!/^[0-9a-f]{40}$/.test(expected || '')) throw Error('missing immutable tree head');
    const head = cp.execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (head !== expected) throw Error('checkout head mismatch');
    return parseTree(
        cp.execFileSync('git', ['-C', root, 'ls-tree', '-r', '-z', '--full-tree', 'HEAD'], {
            maxBuffer: 32 * 1024 * 1024,
        }),
    );
}
function changedPaths(before, after) {
    return [...new Set([...before.keys(), ...after.keys()])].filter((p) => before.get(p) !== after.get(p)).sort();
}
const STEP_SCOPES = {
    classify: 'always',
    install: 'always',
    policy_tests: 'always',
    format: 'always',
    prepare: 'code',
    typecheck: 'code',
    core_cpu: 'code',
    sdk_cpu: 'code',
    timeline_cpu: 'timeline',
    geometry_cpu: 'geometry',
    multipass_cpu: 'multipass',
    input_cpu: 'input',
    color_cpu: 'color',
    performance_cpu: 'performance',
    kit_cpu: 'kit',
    identity_cpu: 'identity',
    skills_original: 'skills',
    skills_checks: 'skills',
    build: 'code',
    package: 'code',
    identity: 'identity',
    browser_install: 'code',
    core_browser: 'code',
    recipes: 'code',
    timeline: 'timeline',
    evidence: 'evidence',
    multipass: 'multipass',
    geometry: 'geometry',
    color: 'color',
    mixed_input: 'input',
    installed_kit: 'kit',
};
function validateSteps(plan, steps) {
    const errors = [],
        skipped = [];
    if (
        !plan ||
        plan.schema !== 'air-ci-scope/1' ||
        typeof plan.code !== 'boolean' ||
        typeof plan.skills !== 'boolean' ||
        typeof plan.full !== 'boolean' ||
        FAMILIES.some((k) => typeof plan[k] !== 'boolean')
    )
        return { passed: false, errors: ['missing valid scope plan'], skipped };
    if (
        (FAMILIES.some((k) => plan[k]) && !plan.code) ||
        (plan.full && (!plan.code || !plan.skills || FAMILIES.some((k) => !plan[k])))
    )
        return { passed: false, errors: ['inconsistent scope plan'], skipped };
    for (const [id, scope] of Object.entries(STEP_SCOPES)) {
        const required = scope === 'always' || plan[scope];
        const outcome = steps[id]?.outcome;
        if (required && outcome !== 'success') errors.push(`${id}: needed ${scope}, actual ${outcome || 'missing'}`);
        else if (!required && outcome !== 'skipped')
            errors.push(`${id}: unrelated scope expected explicit skip, actual ${outcome || 'missing'}`);
        else if (!required) skipped.push({ id, reason: `plan.${scope}=false`, outcome });
    }
    return { passed: !errors.length, errors, skipped };
}
const OUT = process.env.CI_RECEIPT_DIR || 'output/ci';
function write(name, value) {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, name), JSON.stringify(value, null, 2) + '\n');
}
function timing(action, id, code) {
    if (!/^[a-z][a-z0-9_]+$/.test(id || '')) throw Error('invalid phase id');
    const file = path.join(OUT, 'timings.json');
    const report = fs.existsSync(file)
        ? JSON.parse(fs.readFileSync(file))
        : {
              schema: 'air-ci-timings/1',
              node: process.version,
              runner: process.env.RUNNER_OS,
              architecture: process.arch,
              imageOS: process.env.ImageOS || null,
              imageVersion: process.env.ImageVersion || null,
              dependencyCacheHit: ['true', 'false'].includes(process.env.CI_DEPENDENCY_CACHE_HIT)
                  ? process.env.CI_DEPENDENCY_CACHE_HIT === 'true'
                  : null,
              head: process.env.CI_HEAD_SHA,
              dependencyCache: 'setup-node npm download cache only; fresh npm ci; no build cache',
              phases: {},
          };
    if (action === 'time-start') {
        if (report.phases[id]) throw Error('phase already ran: ' + id);
        report.phases[id] = { startedAt: new Date().toISOString(), startedMs: Date.now() };
    } else {
        const p = report.phases[id];
        if (!p || p.endedAt) throw Error('missing or repeated phase');
        p.endedAt = new Date().toISOString();
        p.elapsedMs = Date.now() - p.startedMs;
        p.exitCode = Number(code);
        if (!Number.isInteger(p.exitCode)) throw Error('invalid exit');
    }
    write('timings.json', report);
}
function main() {
    const [command, id, code] = process.argv.slice(2);
    if (command === 'time-start' || command === 'time-end') return timing(command, id, code);
    if (command === 'plan') {
        let files = [],
            error = '';
        const mode = process.env.CI_MODE || 'auto';
        if (mode === 'auto' && process.env.CI_EVENT === 'pull_request') {
            try {
                files = changedPaths(treeAt('.ci-base', process.env.CI_BASE_SHA), treeAt('.', process.env.CI_HEAD_SHA));
            } catch (e) {
                error = String(e.message);
            }
        } else if (mode === 'auto') error = 'non-PR run requires full retained coverage';
        const plan = classify(files, mode, error);
        plan.head = process.env.CI_HEAD_SHA;
        plan.base = process.env.CI_BASE_SHA || null;
        write('scope.json', plan);
        if (process.env.GITHUB_OUTPUT)
            fs.appendFileSync(
                process.env.GITHUB_OUTPUT,
                Object.entries(plan)
                    .filter(([, v]) => typeof v === 'boolean')
                    .map(([k, v]) => `${k}=${v}`)
                    .join('\n') + '\n',
            );
        console.log(JSON.stringify(plan));
        return;
    }
    if (command === 'gate') {
        const plan = JSON.parse(fs.readFileSync(path.join(OUT, 'scope.json'))),
            steps = JSON.parse(process.env.CI_STEPS_JSON || '{}'),
            result = validateSteps(plan, steps);
        write('gate.json', result);
        console.log(JSON.stringify(result));
        if (!result.passed) process.exitCode = 1;
        return;
    }
    if (command === 'identity') {
        const files = [
            'build/cocosair.module.js',
            'build/cocosair.module.min.js',
            'build/cocosair.module.js.map',
            'build/cocosair.module.min.js.map',
            'build/cocosair.module.d.ts',
            'build/cocosair.legacy.d.ts',
            'build/cocosair.math.js',
            'build/cocosair.math.d.ts',
            'build/cocosair.math.legacy.d.ts',
            'build/metadata/math-build.json',
        ];
        const actual = cp.execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
        if (actual !== process.env.CI_HEAD_SHA) throw Error('built checkout head mismatch');
        const inputs = files.map((p) => ({ path: p, bytes: fs.readFileSync(p) }));
        for (const input of inputs) {
            const target = path.join(OUT, input.path);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, input.bytes);
        }
        write('build-identity.json', {
            head: actual,
            files: inputs.map((input) => ({
                path: input.path,
                bytes: input.bytes.length,
                sha256: crypto.createHash('sha256').update(input.bytes).digest('hex'),
            })),
        });
        return;
    }
    throw Error('unknown CI command');
}
module.exports = {
    FAMILIES,
    FAMILY_PATHS,
    STEP_SCOPES,
    classify,
    parseTree,
    treeAt,
    changedPaths,
    validateSteps,
    timing,
};
if (require.main === module)
    try {
        main();
    } catch (e) {
        console.error(e);
        process.exitCode = 1;
    }
