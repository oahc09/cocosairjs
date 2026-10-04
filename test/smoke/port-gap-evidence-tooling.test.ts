// PG-27/PG-34 S0 工具批次回归：候选快照漂移检测 + PG-34 证据 schema 校验。
// 夹具均为临时目录中的小文件（无 git），不触碰仓库内容；真实仓库的快照/预检由 CLI 演示。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
    collectSnapshot,
    compareSnapshots,
    sha256File,
} = require('../../tools/verify/port-gap-candidate-snapshot.cjs');
const {
    validatePortGapReport,
    makeValidReport,
    SCHEMA_VERSION,
} = require('../../tools/verify/port-gap-evidence-schema.cjs');

function write(abs, content) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
}

describe('PG-27 candidate snapshot drift detection', () => {
    let root;
    beforeAll(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'port-gap-snap-'));
        // 有区分度的小型夹具：源码、config、构建产物（unmin/min 两件），内容互不相同。
        write(path.join(root, 'src', 'main.ts'), 'export const answer = 42;\n');
        write(path.join(root, 'src', 'util', 'math.ts'), 'export const add = (a: number, b: number) => a + b;\n');
        write(path.join(root, 'package.json'), '{"name":"fixture","version":"1.0.0"}\n');
        write(path.join(root, 'build', 'cocosair.module.js'), '// unminified bundle v1\n');
        write(path.join(root, 'build', 'cocosair.module.min.js'), '// minified bundle v1\n');
    });
    afterAll(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    function collect(extra = {}) {
        return collectSnapshot({ root, loadUrl: 'http://127.0.0.1:7454/starter/', ...extra });
    }

    test('same-version shipped manual and example changes drift without rebuilding runtime', () => {
        const files = ['docs/manual/examples/manual-port-recipes/main.ts', 'examples/recipe/src/main.ts'];
        for (const relative of files) {
            write(path.join(root, relative), 'export const movement = 1;\n');
            const before = collect({ deep: true });
            write(path.join(root, relative), 'export const movement = 2;\n');
            const after = collect({ deep: true });
            expect(before.groups.artifacts.digest).toBe(after.groups.artifacts.digest);
            const result = compareSnapshots(before, after);
            expect(result.drifted).toBe(true);
            const drift = result.drifts.find((entry) => entry.group === 'contracts');
            const changed = drift.detail.find((entry) => entry.path === relative);
            expect(changed.kind).toBe('changed');
            expect(changed.before.sha256).not.toBe(changed.after.sha256);
        }
    });

    test('git dirty candidates hash untracked source and gitignored npm/decoder bytes', () => {
        const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'port-gap-git-snap-'));
        try {
            execFileSync('git', ['init', '--quiet'], { cwd: fixture });
            write(path.join(fixture, '.gitignore'), 'build/\n');
            write(path.join(fixture, 'src', 'new.ts'), 'export const value = 1;\n');
            write(path.join(fixture, 'build', 'npm', 'runtime.js'), 'npm-v1');
            write(path.join(fixture, 'build', 'gltf-decoders', 'decoder.wasm'), 'decoder-v1');
            const before = collectSnapshot({ root: fixture, deep: true });
            expect(before.groups.source.fileCount).toBe(1);
            expect(before.groups.artifacts.entryDetail.some((entry) => entry.path === 'build/npm/runtime.js' && entry.present)).toBe(true);
            expect(before.groups.artifacts.entryDetail.some((entry) => entry.path === 'build/gltf-decoders/decoder.wasm' && entry.present)).toBe(true);
            write(path.join(fixture, 'src', 'new.ts'), 'export const value = 2;\n');
            write(path.join(fixture, 'build', 'npm', 'runtime.js'), 'npm-v2');
            write(path.join(fixture, 'build', 'gltf-decoders', 'decoder.wasm'), 'decoder-v2');
            const after = collectSnapshot({ root: fixture, deep: true });
            // Filenames/git dirty identity remain unchanged; byte digests still detect all edits.
            expect(after.git.dirtyDigest).toBe(before.git.dirtyDigest);
            expect(after.groups.source.digest).not.toBe(before.groups.source.digest);
            expect(after.groups.artifacts.digest).not.toBe(before.groups.artifacts.digest);
            expect(compareSnapshots(before, after).drifted).toBe(true);
        } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
    });

    test('explicit AIR_OUT_DIR variant bytes are measured independently of default build', () => {
        const old = process.env.AIR_OUT_DIR;
        try {
            process.env.AIR_OUT_DIR = 'variant-output';
            write(path.join(root, 'variant-output', 'cocosair.module.js'), 'variant-v1');
            const before = collect({ deep: true });
            write(path.join(root, 'variant-output', 'cocosair.module.js'), 'variant-v2');
            const after = collect({ deep: true });
            const drift = compareSnapshots(before, after).drifts.find((entry) => entry.group === 'artifacts');
            expect(drift.detail.some((entry) => entry.path === 'variant-output/cocosair.module.js')).toBe(true);
        } finally { if (old === undefined) delete process.env.AIR_OUT_DIR; else process.env.AIR_OUT_DIR = old; }
    });

    test('non-git fixture records honest git.unavailable and collects groups', () => {
        const snap = collect({ deep: true });
        expect(snap.schemaVersion).toBe('port-gap-candidate-snapshot/1');
        expect(snap.git.available).toBe(false);
        expect(snap.groups.source.fileCount).toBe(2);
        expect(snap.groups.artifacts.fileCount).toBe(2);
        expect(snap.loadTarget).toMatchObject({ url: 'http://127.0.0.1:7454/starter/', providedBy: 'cli-flag' });
        // deep 模式下逐文件 sha256 可定位
        const main = snap.groups.source.entryDetail.find((e) => e.path === 'src/main.ts');
        expect(main.sha256).toBe(sha256File(path.join(root, 'src', 'main.ts')));
    });

    test('identical state -> check clean (same candidate)', () => {
        const a = collect({ deep: true });
        const b = collect({ deep: true });
        const result = compareSnapshots(a, b);
        expect(result.drifted).toBe(false);
        expect(result.sameCandidate).toBe(true);
    });

    test('same-version source drift is detected with per-file detail', () => {
        const before = collect({ deep: true });
        write(path.join(root, 'src', 'util', 'math.ts'), 'export const add = (a: number, b: number) => a - b; // drifted\n');
        const after = collect({ deep: true });
        const result = compareSnapshots(before, after);
        expect(result.drifted).toBe(true);
        const drift = result.drifts.find((d) => d.scope === 'group' && d.group === 'source');
        expect(drift).toBeTruthy();
        const item = drift.detail.find((x) => x.path === 'src/util/math.ts');
        expect(item.kind).toBe('changed');
        expect(item.before.sha256).not.toBe(item.after.sha256);
    });

    test('artifact byte drift is detected on the exact artifact path', () => {
        const before = collect({ deep: true });
        write(path.join(root, 'build', 'cocosair.module.min.js'), '// minified bundle v2 DRIFTED\n');
        const after = collect({ deep: true });
        const result = compareSnapshots(before, after);
        expect(result.drifted).toBe(true);
        const drift = result.drifts.find((d) => d.scope === 'group' && d.group === 'artifacts');
        const item = drift.detail.find((x) => x.path === 'build/cocosair.module.min.js');
        expect(item.kind).toBe('changed');
        expect(item.after.bytes).toBe('// minified bundle v2 DRIFTED\n'.length);
    });

    test('artifact removal is detected as removed, not silently tolerated', () => {
        const before = collect({ deep: true });
        fs.rmSync(path.join(root, 'build', 'cocosair.module.min.js'));
        const after = collect({ deep: true });
        const result = compareSnapshots(before, after);
        expect(result.drifted).toBe(true);
        const drift = result.drifts.find((d) => d.scope === 'group' && d.group === 'artifacts');
        expect(drift.detail.find((x) => x.path === 'build/cocosair.module.min.js').kind).toBe('removed');
        // 快照主体如实登记 notRun/missing，不猜测：被删产物进入声明清单缺口披露
        const notRunPaths = after.notRun.map((n) => n.path);
        expect(notRunPaths).toContain('build/cocosair.module.min.js');
        // 夹具只有 2/6 声明产物：其余缺失同样逐项披露（map/d.ts/package.json + 两个产物目录）
        expect(notRunPaths).toContain('build/cocosair.module.d.ts');
        expect(notRunPaths).toContain('build/npm/');
        // 恢复，供后续用例使用
        write(path.join(root, 'build', 'cocosair.module.min.js'), '// minified bundle v2 DRIFTED\n');
    });

    test('loadUrl is an explicit identity input: same files, different URL -> drift', () => {
        const a = collect({ deep: true });
        const b = collectSnapshot({ root, loadUrl: 'http://127.0.0.1:7454/hello-cube/', deep: true });
        const result = compareSnapshots(a, b);
        expect(result.drifted).toBe(true);
        expect(result.drifts).toEqual([expect.objectContaining({ scope: 'loadUrl' })]);
    });

    test('AIR identity inputs change the snapshot identity digest', () => {
        const plain = collectSnapshot({ root, deep: true });
        const prev = process.env.AIR_FEATURES;
        process.env.AIR_FEATURES = 'air,base';
        try {
            const variant = collectSnapshot({ root, deep: true });
            expect(variant.airIdentityInputs.airFeatures.declared).toBe('air,base');
            expect(variant.airIdentityInputs.identityInputsDigest).not.toBe(plain.airIdentityInputs.identityInputsDigest);
            expect(variant.snapshotId).not.toBe(plain.snapshotId);
        } finally {
            if (prev === undefined) delete process.env.AIR_FEATURES;
            else process.env.AIR_FEATURES = prev;
        }
    });
});

describe('PG-34 evidence report schema validation', () => {
    test('schema version constant and valid report accepted', () => {
        expect(SCHEMA_VERSION).toBe('port-gap-evidence/1');
        const result = validatePortGapReport(makeValidReport());
        expect(result.ok).toBe(true);
        expect(result.errors).toEqual([]);
    });

    function rejects(name, mutate, rule) {
        test(`${name} -> rejected by ${rule}`, () => {
            const report = makeValidReport();
            mutate(report);
            const result = validatePortGapReport(report);
            expect(result.ok).toBe(false);
            expect(result.errors.map((e) => e.rule)).toContain(rule);
        });
    }

    rejects(
        'fabricated PASS without command/exit/rawOutputs',
        (r) => {
            delete r.execution.command;
            delete r.execution.exitCode;
            delete r.rawOutputs;
        },
        'execution.command',
    );
    rejects(
        'empty scope (no declared, no cases)',
        (r) => {
            r.scope.declared = [];
            r.scope.totalCases = 0;
        },
        'scope.empty',
    );
    rejects(
        'PASS without candidate fingerprint',
        (r) => {
            r.fingerprints.candidate = { present: false, status: 'NOT_RUN', reason: 'build not run' };
        },
        'candidate',
    );
    rejects(
        'fingerprint key silently omitted',
        (r) => {
            delete r.fingerprints.browser;
        },
        'fingerprints.required',
    );
    rejects(
        'old-round FAIL superseded by nothing but final PASS',
        (r) => {
            r.attempts = [{ status: 'FAIL', command: 'x', cwd: '/r', startedAt: r.execution.startedAt, endedAt: r.execution.endedAt, exitCode: 1 }];
        },
        'attempts.supersededBy',
    );
    rejects(
        'USER_CONFIRMED as the only evidence on an instrumented gate',
        (r) => {
            r.evidenceTypes = ['USER_CONFIRMED'];
        },
        'evidence.userConfirmed',
    );
    rejects(
        'BROWSER evidence without browser fingerprint',
        (r) => {
            r.evidenceTypes = ['BROWSER_RENDER_PASS'];
            r.method = { kind: 'ENGINE_HEADLESS', detail: 'headless only' };
        },
        'evidence.browser',
    );
    rejects(
        'GPU placeholder inference recorded as GPU_MEASURED',
        (r) => {
            r.evidenceTypes = ['GPU_MEASURED'];
            r.measurements = { gpu: { available: false, inferred: true } };
        },
        'evidence.gpu',
    );
    rejects(
        'AG1 PASS without external materials',
        (r) => {
            r.gate = 'AG1';
        },
        'externalMaterials',
    );
    rejects(
        'SYNTHETIC method PASS without limitations disclosure',
        (r) => {
            r.method = { kind: 'SYNTHETIC', detail: 'synthetic events only' };
        },
        'method.limitations',
    );
    rejects(
        'subset run claimed completed',
        (r) => {
            r.scope.completed = true;
        },
        'scope.completed',
    );
    rejects(
        'inherited prior evidence with mismatched candidate fingerprint',
        (r) => {
            r.priorEvidence = { inherited: true, candidateFingerprint: 'f'.repeat(64) };
        },
        'priorEvidence',
    );
    rejects(
        'FAIL without failureStage',
        (r) => {
            r.execution.status = 'FAIL';
            r.execution.exitCode = 1;
        },
        'failureStage',
    );
    rejects(
        'invented evidence type',
        (r) => {
            r.evidenceTypes = ['TOTALLY_VERIFIED'];
        },
        'evidenceTypes',
    );

    test('NOT_CONFIGURED items are disclosed structurally', () => {
        const report = makeValidReport();
        report.notConfigured = [{ item: 'playwright', status: 'NOT_CONFIGURED', detail: 'module not resolvable' }];
        expect(validatePortGapReport(report).ok).toBe(true);
        const bad = makeValidReport();
        bad.notConfigured = [{ item: 'playwright', status: 'PASS' }];
        expect(validatePortGapReport(bad).errors.map((e) => e.rule)).toContain('notConfigured');
    });

    test('unresolved actual attempts remain honest under NOT_RUN or FAIL, never PASS', () => {
        const report = makeValidReport();
        report.attempts = [
            { ...report.execution, status: 'FAIL', exitCode: 1 },
            { ...report.execution, status: 'NOT_RUN', exitCode: 1, reason: 'One browser input scope remains unavailable' },
        ];
        for (const status of ['NOT_RUN', 'FAIL']) {
            report.execution.status = status;
            report.execution.exitCode = 1;
            report.execution.reason = 'Current scope remains incomplete';
            report.failureStage = 'environment';
            expect(validatePortGapReport(report).ok).toBe(true);
        }
        report.execution.status = 'PASS';
        report.execution.exitCode = 0;
        expect(validatePortGapReport(report).errors.map((e) => e.rule)).toContain('attempts.supersededBy');
        report.execution.status = 'NOT_RUN';
        report.attempts[0].supersededBy = -1;
        expect(validatePortGapReport(report).errors.map((e) => e.rule)).toContain('attempts.supersededBy');
    });

    test('scope counts account for every case and reject invalid numeric counts', () => {
        const invalidCounts = [
            { totalCases: 2, measuredCases: 1, skippedCases: 0 },
            { totalCases: 1, measuredCases: 2, skippedCases: 0 },
            { totalCases: 1, measuredCases: -1, skippedCases: 2 },
            { totalCases: 1, measuredCases: 0.5, skippedCases: 0.5 },
            { totalCases: NaN, measuredCases: 0, skippedCases: 0 },
            { totalCases: Infinity, measuredCases: Infinity, skippedCases: 0 },
            { totalCases: Number.MAX_SAFE_INTEGER + 1, measuredCases: Number.MAX_SAFE_INTEGER + 1, skippedCases: 0 },
        ];
        for (const counts of invalidCounts) {
            const report = makeValidReport();
            Object.assign(report.scope, counts);
            expect(validatePortGapReport(report).errors.map((e) => e.rule)).toContain('scope.counts');
        }
        const complete = makeValidReport();
        expect(validatePortGapReport(complete).ok).toBe(true);
    });

    test('honest NOT_RUN report without candidate is acceptable (as long as status is not PASS)', () => {
        const report = makeValidReport();
        report.execution = { status: 'NOT_RUN', reason: 'browser tooling NOT_CONFIGURED on this host' };
        report.execution.blockedBy = undefined;
        report.scope = { declared: ['browser-input-sequence'], subset: true, completed: false, totalCases: 1, measuredCases: 0, skippedCases: 1, skippedDetail: [{ id: 'browser-input-sequence', reason: 'playwright NOT_CONFIGURED' }] };
        report.fingerprints.browser = { present: false, status: 'NOT_CONFIGURED', reason: 'playwright module unavailable' };
        report.evidenceTypes = ['SOURCE_CHECKED'];
        report.method = { kind: 'CONTRACT_STATIC', detail: 'source review only; no run attempted' };
        const result = validatePortGapReport(report);
        expect(result.ok).toBe(true);
    });
});
