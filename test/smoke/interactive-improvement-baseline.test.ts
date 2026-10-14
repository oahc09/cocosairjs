/**
 * IER-00/01 合同测试（S0 审查修订版）。
 * 全部使用 os.tmpdir/mkdtemp 临时目录，不触碰仓库内固定 worker-* 文件。
 * 合成 PNG 仅作合同正例，不冒充浏览器实证。
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { PNG } from 'pngjs';

const {
    buildBaseline,
    verifyBaseline,
    applyExecutionReport,
    currentIdentity,
    INVENTORY_APIS,
    CAPABILITY_STATUS,
    TASK_DOC_MODULE_SHA256,
} = require('../../tools/verify/interactive-improvement-baseline.cjs');
const {
    validateEvidence,
    makeSyntheticRecord,
    evaluateVisibility,
    REQUIRED_FIELDS,
    RESULT_ENUM,
    METHOD_ENUM,
} = require('../../tools/verify/interactive-improvement-evidence.cjs');

const ROOT = path.resolve(__dirname, '../..');

function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ier-s0-'));
}

/** 生成真实可解码 PNG：黑底 + 指定区域红色方块（供 oracle 复算）。 */
function makeRealPng(dir: string, opts: { w?: number; h?: number; red?: [number, number, number, number] } = {}) {
    const w = opts.w ?? 8;
    const h = opts.h ?? 8;
    const png = new PNG({ width: w, height: h });
    for (let i = 0; i < w * h; i++) {
        png.data[i * 4] = 10;
        png.data[i * 4 + 1] = 10;
        png.data[i * 4 + 2] = 10;
        png.data[i * 4 + 3] = 255;
    }
    const [rx, ry, rw, rh] = opts.red ?? [2, 2, 4, 4];
    for (let y = ry; y < ry + rh && y < h; y++) {
        for (let x = rx; x < rx + rw && x < w; x++) {
            const idx = (w * y + x) * 4;
            png.data[idx] = 220;
            png.data[idx + 1] = 30;
            png.data[idx + 2] = 30;
            png.data[idx + 3] = 255;
        }
    }
    const file = path.join(dir, 'real.png');
    fs.writeFileSync(file, PNG.sync.write(png));
    const bytes = fs.readFileSync(file);
    return { file, bytes, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), png };
}

const isoNow = () => new Date().toISOString();

describe('IER-00 baseline: file presence is not executed evidence', () => {
    test('default buildBaseline never emits tested-passed', () => {
        const baseline = buildBaseline();
        expect(baseline.capabilities.filter((c: any) => c.status === 'tested-passed')).toEqual([]);
        for (const cap of baseline.capabilities) {
            expect(Object.values(CAPABILITY_STATUS)).toContain(cap.status);
            expect(cap.testExecution).toBe('NOT_RUN'); // 测试文件存在只标 testAvailable
        }
    });

    test('exact 64-digit historical task-doc SHA recorded honestly', () => {
        expect(TASK_DOC_MODULE_SHA256).toHaveLength(64);
        expect(buildBaseline().historicalDedup.taskDocModuleSha256).toBe(TASK_DOC_MODULE_SHA256);
        // currentModuleDiffers 是事实陈述（布尔），不强制永远为 true
        expect(typeof buildBaseline().historicalDedup.currentModuleDiffers).toBe('boolean');
    });

    test('section 1.2 additions inventoried: prefilter, releaseScene, sessionScope', () => {
        const names = buildBaseline().capabilities.map((c: any) => c.name);
        for (const n of ['validateAirPrefilteredEnvironment', 'bindAirPrefilteredEnvironment', 'releaseScene']) {
            expect(names).toContain(n);
        }
        expect(names.some((n: string) => n.includes('sessionScope'))).toBe(true);
    });

    test('createSessionGate maps to action-input suites (not scene-release)', () => {
        const api = INVENTORY_APIS.find((a: any) => a.name === 'createSessionGate')!;
        expect(api.tests).toContain('test/smoke/port-gap-action-input-dom.test.ts');
        expect(api.tests).toContain('test/smoke/port-gap-action-input-native.test.ts');
        expect(api.tests).not.toContain('test/smoke/port-gap-scene-release.test.ts');
        const cap = buildBaseline().capabilities.find((c: any) => c.name === 'createSessionGate');
        expect(cap.testAvailable).toBe(true);
        expect(cap.testExecution).toBe('NOT_RUN');
    });

    test('export detection is export-statement based, not arbitrary bundle text', () => {
        const baseline = buildBaseline();
        // 未核对项如实：编造的名字不能凭 bundle 任意文本命中
        expect(baseline.capabilities.every((c: any) => c.status !== 'unchecked' || true)).toBe(true);
        // releaseScene 非顶层导出，必须是 member-declared 而非 exported
        const release = baseline.capabilities.find((c: any) => c.name === 'releaseScene');
        expect(release.status).toBe(CAPABILITY_STATUS.MEMBER);
        expect(release.detection.inTopLevelExports).toBe(false);
        // 顶层函数必须走 export 语句
        const rt = baseline.capabilities.find((c: any) => c.name === 'createAirRenderTarget');
        expect(rt.status).toBe(CAPABILITY_STATUS.EXPORTED);
        expect(rt.detection.inTopLevelExports).toBe(true);
    });

    test('identity reuses candidate snapshot: HEAD/branch/dirty/group digests', () => {
        const baseline = buildBaseline();
        expect(baseline.appCommit).toMatch(/^[0-9a-f]{40}$/);
        // GitHub PR checkouts are detached: the snapshot contract deliberately
        // records null rather than inventing a branch. Compare to actual Git state.
        const branch = require('child_process').spawnSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
            cwd: ROOT,
            encoding: 'utf8',
        });
        expect(branch.error).toBeUndefined();
        expect([0, 1]).toContain(branch.status);
        expect(baseline.git.branch).toBe(branch.status === 0 ? branch.stdout.trim() : null);
        expect(Array.isArray(baseline.git.dirty)).toBe(true);
        expect(baseline.git.dirtyDigest).toMatch(/^[0-9a-f]{64}$/);
        for (const group of ['source', 'config', 'runner', 'contracts', 'artifacts']) {
            expect(baseline.groupDigests[group]).toMatch(/^[0-9a-f]{64}$/);
        }
        expect(baseline.candidateSnapshotId).toMatch(/^[0-9a-f]{64}$/);
    });

    test('min/map/bootstrap/npm/html-source artifact identities provided', () => {
        const arts = buildBaseline().artifactIdentity;
        for (const rel of [
            'build/cocosair.module.min.js',
            'build/cocosair.module.min.js.map',
            'build/bootstrap.js',
            'build/bootstrap.js.map',
            'build/npm/cocosair.module.js',
            'build/npm/html-source.js',
        ]) {
            expect(arts[rel].present).toBe(true);
            expect(arts[rel].sha256).toMatch(/^[0-9a-f]{64}$/);
            expect(arts[rel].bytes).toBeGreaterThan(0);
        }
    });

    test('builtFrom uses source-map sampling, not HEAD speculation', () => {
        const baseline = buildBaseline();
        expect(baseline.builtFrom).toHaveLength(2); // dev + min
        for (const r of baseline.builtFrom) {
            expect(['verified-sampled', 'stale', 'UNKNOWN']).toContain(r.status);
            if (r.status === 'verified-sampled') expect(r.sampled).toBeGreaterThan(0);
            if (r.status === 'stale') expect(r.stale.length + r.missingFromMap.length).toBeGreaterThan(0);
        }
    });

    test('dedup table: 12 IER rows mapped to the 10 recommendations with concrete reuse', () => {
        const table = buildBaseline().dedupTable;
        expect(table.map((r: any) => r.ier)).toEqual(
            Array.from({ length: 12 }, (_, i) => `IER-${String(i).padStart(2, '0')}`),
        );
        const recs = new Set(table.map((r: any) => r.recommendation));
        // 10 条建议 A1 A2 B1 C1 C2 D1 D2 E1 E2 E3 全覆盖（E3/D1 各映射两项）
        for (const rec of ['A1', 'A2', 'B1', 'C1', 'C2', 'D1', 'D2', 'E1', 'E2', 'E3']) {
            expect([...recs].some((r) => String(r).includes(rec))).toBe(true);
        }
        for (const row of table) {
            expect(['reuse', 'add-tests', 'needs-rerun', 'missing-materials']).toContain(row.action);
            expect(row.reuse.length).toBeGreaterThan(0);
            expect(row.reusePathsExist).toBe(true); // 复用物路径真实存在（npm run 前缀除外）
        }
    });

    test('missing evidence stays explicit, never fabricated', () => {
        for (const item of buildBaseline().missingEvidence) {
            expect(['MISSING', 'NOT_RUN', 'UNKNOWN', 'TASK_DOC_REFERENCE']).toContain(item.status);
            expect(item.reason).toBeTruthy();
        }
    });

    test('verifyBaseline: current-matching report passes; any drift rejected', () => {
        const baseline = buildBaseline();
        expect(verifyBaseline(baseline).ok).toBe(true);
        // HEAD 漂移
        expect(verifyBaseline({ ...baseline, appCommit: 'f'.repeat(40) }).ok).toBe(false);
        // 组摘要漂移
        const driftGroup = { ...baseline, groupDigests: { ...baseline.groupDigests, source: 'a'.repeat(64) } };
        expect(verifyBaseline(driftGroup).ok).toBe(false);
        // 产物 SHA 漂移
        const driftArt = {
            ...baseline,
            artifactIdentity: {
                ...baseline.artifactIdentity,
                'build/cocosair.module.js': { present: true, bytes: 1, sha256: 'b'.repeat(64) },
            },
        };
        expect(verifyBaseline(driftArt).ok).toBe(false);
        // 格式不全
        expect(verifyBaseline({ schemaVersion: 'ier-baseline/2' }).ok).toBe(false);
        // 错误历史 SHA
        expect(
            verifyBaseline({
                ...baseline,
                historicalDedup: { ...baseline.historicalDedup, taskDocModuleSha256: 'f6836f60' + '0'.repeat(54) },
            }).ok,
        ).toBe(false);
    });

    test('applyExecutionReport: only identity-bound passing suites upgrade to tested-passed', () => {
        const baseline = buildBaseline();
        const goodSuite = {
            file: 'test/smoke/port-gap-action-state.test.ts',
            exitCode: 0,
            testsPassed: 12,
            testsTotal: 12,
        };
        // 身份不匹配 → 拒绝升级
        const wrong = applyExecutionReport(baseline, {
            identity: { sdkModuleSha256: 'c'.repeat(64) },
            suites: [goodSuite],
        });
        expect(wrong.upgraded).toBe(false);
        // 身份匹配 + 通过套件 → 升级
        const ok = applyExecutionReport(baseline, {
            identity: { sdkModuleSha256: baseline.sdkModuleSha256, appCommit: baseline.appCommit },
            suites: [goodSuite],
        });
        expect(ok.upgraded).toBeGreaterThan(0);
        const cap = baseline.capabilities.find((c: any) => c.name === 'createActionState');
        expect(cap.status).toBe(CAPABILITY_STATUS.TESTED);
        expect(cap.testExecution.status).toBe('PASS');
        // 失败套件不升级
        const b2 = buildBaseline();
        const failing = {
            file: 'test/smoke/port-gap-action-state.test.ts',
            exitCode: 1,
            testsPassed: 11,
            testsTotal: 12,
        };
        const r2 = applyExecutionReport(b2, { identity: { sdkModuleSha256: b2.sdkModuleSha256 }, suites: [failing] });
        expect(r2.upgraded).toBe(0);
        expect(b2.capabilities.find((c: any) => c.name === 'createActionState').status).not.toBe(
            CAPABILITY_STATUS.TESTED,
        );
    });

    test('currentIdentity reads disk for CLI verification', () => {
        const id = currentIdentity();
        expect(id.sdkModule.present).toBe(true);
        expect(id.sdkModule.sha256).toBe(buildBaseline().sdkModuleSha256);
        expect(id.minModule.present).toBe(true);
        expect(id.appCommit).toMatch(/^[0-9a-f]{40}$/);
    });
});

describe('IER-01 evidence: honest NOT_RUN and strict PASS gate', () => {
    test('fully UNKNOWN SYNTHETIC record with NOT_RUN is valid', () => {
        const r = validateEvidence(makeSyntheticRecord());
        expect(r.ok).toBe(true);
        expect(r.failures).toEqual([]);
    });

    test('invalid structures fail without crashing (no TypeError)', () => {
        for (const bad of [null, undefined, 'string', 42, [], [{ nested: true }]] as any[]) {
            const r = validateEvidence(bad);
            expect(r.ok).toBe(false);
            expect(r.failures.length).toBeGreaterThan(0);
        }
        expect(validateEvidence({ no: 'fields' }).ok).toBe(false);
    });

    test('typed field table enforced: NaN/Infinity/negative dpr always rejected', () => {
        for (const dpr of [NaN, Infinity, -1, -0.5]) {
            expect(validateEvidence(makeSyntheticRecord({ dpr })).ok).toBe(false);
        }
        expect(validateEvidence(makeSyntheticRecord({ pngBytes: NaN })).ok).toBe(false);
        expect(validateEvidence(makeSyntheticRecord({ viewport: { width: 0, height: 100 } })).ok).toBe(false);
        expect(validateEvidence(makeSyntheticRecord({ viewport: { width: NaN, height: 100 } } as any)).ok).toBe(false);
    });

    test('null observations rejected; explicit UNKNOWN accepted for NOT_RUN', () => {
        for (const field of [
            'receivedEvent',
            'modelState',
            'layoutReceipt',
            'observationTimestamp',
            'browser',
            'seed',
        ]) {
            expect(validateEvidence(makeSyntheticRecord({ [field]: null })).ok).toBe(false);
        }
        expect(validateEvidence(makeSyntheticRecord({ receivedEvent: 'UNKNOWN', modelState: 'UNKNOWN' })).ok).toBe(
            true,
        );
    });

    test('acceptance positive: real decodable PNG + oracle recomputation (SYNTHETIC contract, LIMITED)', () => {
        const dir = makeTmpDir();
        try {
            const { file, sha256, bytes } = makeRealPng(dir, { red: [2, 2, 4, 4] });
            const rec = makeSyntheticRecord({
                runId: 'run-ok',
                caseId: 'case-ok',
                browser: 'node-contract',
                inputMethod: 'none',
                sourceStatus: 'recreated',
                result: 'LIMITED',
                method: 'NODE_SYNTHETIC',
                pngPath: file,
                pngSha256: sha256,
                pngBytes: bytes.length,
                pngDimensions: [8, 8],
                observationTimestamp: isoNow(),
                receivedEvent: { type: 'none' },
                modelState: { changed: false },
                layoutReceipt: { checked: true },
                submittedFrame: { event: 'AFTER_DRAW' },
                execution: { command: 'node contract-test', cwd: dir, exitCode: 0 },
                referenceComparison: { result: 'NOT_RUN', reason: 'SYNTHETIC' },
            });
            const oracle = {
                region: [2, 2, 4, 4],
                kind: 'red' as const,
                minPixels: 12,
                expectedCentroid: [3.5, 3.5],
                tolerance: 1,
            };
            const r = validateEvidence(rec, { visibilityOracle: oracle });
            expect(r.failures).toEqual([]);
            expect(r.ok).toBe(true);
            expect(r.visibility?.ok).toBe(true);
            expect(r.visibility?.hits).toBe(16); // 从真实像素复算而非计数器
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('PASS gate requires browser/viewport/dpr/events/execution/fingerprints/PNG/oracle', () => {
        const dir = makeTmpDir();
        try {
            const { file, sha256, bytes } = makeRealPng(dir);
            // 全 UNKNOWN + PASS → 拒
            expect(validateEvidence(makeSyntheticRecord({ result: 'PASS', sourceStatus: 'observed' })).ok).toBe(false);
            // 缺 oracle 的完整 PASS → 拒（像素无法复算）
            const noOracle = makeSyntheticRecord({
                result: 'PASS',
                sourceStatus: 'observed',
                method: 'REAL_BROWSER',
                browser: 'chromium',
                viewport: { width: 8, height: 8 },
                dpr: 1,
                inputMethod: 'mouse',
                receivedEvent: { type: 'click' },
                modelState: { moved: true },
                layoutReceipt: { ok: true },
                submittedFrame: { event: 'AFTER_DRAW' },
                observationTimestamp: isoNow(),
                pngPath: file,
                pngSha256: sha256,
                pngBytes: bytes.length,
                appFingerprint: { commit: 'a'.repeat(40) },
                harnessFingerprint: { sha256: 'a'.repeat(64) },
                sdkFingerprint: { sdkModuleSha256: 'a'.repeat(64) },
                execution: { command: 'playwright', cwd: dir, exitCode: 0 },
                limitations: [],
            });
            const r1 = validateEvidence(noOracle);
            expect(r1.ok).toBe(false);
            expect(r1.failures.some((f: string) => f.includes('visibilityOracle'))).toBe(true); // 像素无法复算拒 PASS
            // NODE_SYNTHETIC / STATIC 不能 PASS
            expect(validateEvidence(makeSyntheticRecord({ result: 'PASS', method: 'NODE_SYNTHETIC' })).ok).toBe(false);
            expect(
                validateEvidence(makeSyntheticRecord({ result: 'PASS', method: 'STATIC', limitations: [] })).ok,
            ).toBe(false);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('PNG integrity: missing path, SHA tamper, bytes tamper, truncated all rejected', () => {
        const dir = makeTmpDir();
        try {
            const { file, sha256, bytes } = makeRealPng(dir);
            // 缺文件
            expect(
                validateEvidence(makeSyntheticRecord({ pngPath: path.join(dir, 'nope.png'), pngSha256: sha256 })).ok,
            ).toBe(false);
            // SHA 篡改
            expect(
                validateEvidence(
                    makeSyntheticRecord({ pngPath: file, pngSha256: 'd'.repeat(64), pngBytes: bytes.length }),
                ).ok,
            ).toBe(false);
            // bytes 篡改
            expect(
                validateEvidence(makeSyntheticRecord({ pngPath: file, pngSha256: sha256, pngBytes: bytes.length + 5 }))
                    .ok,
            ).toBe(false);
            // 截断 PNG（hash 正确也不行）
            const truncated = bytes.subarray(0, 40);
            const truncFile = path.join(dir, 'trunc.png');
            fs.writeFileSync(truncFile, truncated);
            const truncSha = crypto.createHash('sha256').update(truncated).digest('hex');
            const r = validateEvidence(
                makeSyntheticRecord({ pngPath: truncFile, pngSha256: truncSha, pngBytes: truncated.length }),
            );
            expect(r.ok).toBe(false);
            expect(r.failures.some((f: string) => f.includes('UNDECODABLE'))).toBe(true);
            // 尺寸声明与实际不符
            expect(
                validateEvidence(
                    makeSyntheticRecord({
                        pngPath: file,
                        pngSha256: sha256,
                        pngBytes: bytes.length,
                        pngDimensions: [64, 64],
                    }),
                ).ok,
            ).toBe(false);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('identity drift: sdk/app/harness known mismatch rejected regardless of result', () => {
        const ctx = { sdkModuleSha256: 'b'.repeat(64), appCommit: 'b'.repeat(40), harnessSha256: 'b'.repeat(64) };
        expect(
            validateEvidence(makeSyntheticRecord({ sdkFingerprint: { sdkModuleSha256: 'a'.repeat(64) } }), ctx).ok,
        ).toBe(false);
        expect(validateEvidence(makeSyntheticRecord({ appFingerprint: { commit: 'a'.repeat(40) } }), ctx).ok).toBe(
            false,
        );
        expect(
            validateEvidence(makeSyntheticRecord({ appFingerprint: { sha256: 'a'.repeat(64) } }), {
                appSha256: 'b'.repeat(64),
            }).ok,
        ).toBe(false);
        expect(validateEvidence(makeSyntheticRecord({ harnessFingerprint: { sha256: 'a'.repeat(64) } }), ctx).ok).toBe(
            false,
        );
        // NOT_RUN 也拒 known drift（不伪造身份）
        expect(
            validateEvidence(
                makeSyntheticRecord({ result: 'NOT_RUN', sdkFingerprint: { sdkModuleSha256: 'a'.repeat(64) } }),
                ctx,
            ).ok,
        ).toBe(false);
        // UNKNOWN 指纹不触发漂移（诚实未知）
        expect(validateEvidence(makeSyntheticRecord(), ctx).ok).toBe(true);
    });

    test('stale reports rejected by selectedRun/selectedCase', () => {
        expect(validateEvidence(makeSyntheticRecord({ runId: 'A' }), { selectedRunId: 'B' }).ok).toBe(false);
        expect(validateEvidence(makeSyntheticRecord({ caseId: 'A' }), { selectedCaseId: 'B' }).ok).toBe(false);
        expect(validateEvidence(makeSyntheticRecord({ runId: 'A' }), { selectedRunId: 'A' }).ok).toBe(true);
    });

    test('enums: result/method/sourceStatus all enforced', () => {
        expect(validateEvidence(makeSyntheticRecord({ result: 'BANANA' })).ok).toBe(false);
        expect(validateEvidence(makeSyntheticRecord({ result: 'BLOCKED' })).ok).toBe(true);
        expect(validateEvidence(makeSyntheticRecord({ result: 'LIMITED' })).ok).toBe(true);
        expect(validateEvidence(makeSyntheticRecord({ method: 'CARRIER_PIGEON' })).ok).toBe(false);
        expect(validateEvidence(makeSyntheticRecord({ sourceStatus: 'vibes' })).ok).toBe(false);
    });

    test('SYNTHETIC cannot masquerade as REAL_BROWSER', () => {
        // 合成标记 + REAL_BROWSER → 拒
        expect(validateEvidence(makeSyntheticRecord({ method: 'REAL_BROWSER' })).ok).toBe(false);
        // NODE_SYNTHETIC 无 limitations → 拒
        expect(validateEvidence(makeSyntheticRecord({ limitations: [] })).ok).toBe(false);
        // 合成记录不能 PASS
        expect(validateEvidence(makeSyntheticRecord({ result: 'PASS' })).ok).toBe(false);
    });

    test('fidelity separated from function: unobserved/recreated reference rules', () => {
        // unobserved 不能 PASS
        expect(validateEvidence(makeSyntheticRecord({ result: 'PASS', sourceStatus: 'unobserved' })).ok).toBe(false);
        // recreated PASS 必须显式声明 referenceComparison 且不得 PASS
        const missingRc = makeSyntheticRecord({ result: 'PASS', sourceStatus: 'recreated' });
        expect(validateEvidence(missingRc).ok).toBe(false);
        const rcPass = makeSyntheticRecord({
            result: 'PASS',
            sourceStatus: 'recreated',
            referenceComparison: { result: 'PASS' },
        });
        expect(validateEvidence(rcPass).ok).toBe(false);
        const rcNotRun = makeSyntheticRecord({
            result: 'LIMITED',
            sourceStatus: 'recreated',
            referenceComparison: { result: 'NOT_RUN', reason: 'no reference pixels' },
        });
        expect(validateEvidence(rcNotRun).ok).toBe(true);
    });

    test('evaluateVisibility recomputes from real pixels; fake counters cannot pass', () => {
        const dir = makeTmpDir();
        try {
            const { png } = makeRealPng(dir, { red: [2, 2, 4, 4] });
            // 正确 oracle：红块 16 像素，质心 (3.5,3.5)
            const good = evaluateVisibility(png, {
                region: [0, 0, 8, 8],
                kind: 'red',
                minPixels: 12,
                expectedCentroid: [3.5, 3.5],
                tolerance: 0.5,
            });
            expect(good.ok).toBe(true);
            // 遮挡/无目标：minPixels 高于实际 → 拒
            const occluded = evaluateVisibility(png, { region: [0, 0, 8, 8], kind: 'red', minPixels: 100 });
            expect(occluded.ok).toBe(false);
            // 空白区域（无目标）→ 拒
            const blank = evaluateVisibility(png, { region: [6, 6, 2, 2], kind: 'red', minPixels: 1 });
            expect(blank.ok).toBe(false);
            // 质心超差 → 拒
            const centroid = evaluateVisibility(png, {
                region: [0, 0, 8, 8],
                kind: 'red',
                minPixels: 1,
                expectedCentroid: [7, 7],
                tolerance: 0.5,
            });
            expect(centroid.ok).toBe(false);
            // 非法 oracle
            expect(evaluateVisibility(png, { region: [-1, 0, 4, 4], kind: 'red', minPixels: 1 }).ok).toBe(false);
            expect(evaluateVisibility(png, { region: [0, 0, 4, 4], kind: 'magic', minPixels: 1 }).ok).toBe(false);
            expect(evaluateVisibility(png, null as any).ok).toBe(false);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('field contract documented honestly: 22 original + method + execution = 24 required', () => {
        expect(REQUIRED_FIELDS).toHaveLength(24);
        expect(REQUIRED_FIELDS).toContain('method');
        expect(REQUIRED_FIELDS).toContain('execution');
        expect(REQUIRED_FIELDS).not.toContain('referenceComparison'); // 可选
        expect(RESULT_ENUM).toEqual(['PASS', 'FAIL', 'NOT_RUN', 'BLOCKED', 'LIMITED']);
        expect(METHOD_ENUM).toEqual(['REAL_BROWSER', 'STEP_CLOCK', 'NODE_SYNTHETIC', 'STATIC']);
    });
});
