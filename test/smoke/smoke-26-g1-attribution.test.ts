/**
 * Smoke 26 — V0.6 G1（§45/§46）：Golden 10 catalog 有效性 + 失败归因八场景。
 *
 * §45 场景 → 归因映射：
 *  1 Reference Validator FAIL      → ENGINE
 *  2 Browser Startup FAIL          → INFRASTRUCTURE（NOT_EVALUATED）
 *  3 Agent Compile FAIL            → AGENT
 *  4 Repair Budget Exhausted       → AGENT（BUDGET_EXHAUSTED，计入分母）
 *  5 Policy Denied                 → VALID TRIAL + POLICY 事件（非 INVALID_RUN）
 *  6 真实 Protected Resource Escape → ISOLATION（台账捕获）
 *  7 Background Process Leakage     → Sandbox 记录 + dispose 停进程树
 *  8 Expected Unsupported Device   → EXPECTED_UNSUPPORTED（DEVICE 归因）
 *
 * §46 退出条件同时核对：eligible_trials 唯一（smoke-24）、Reference 不可见（策略拒读）、
 * Fresh Rebuild 生效（smoke-25 提交→重建→验证）、Repair Budget 生效（场景4）。
 */
import { nodeRequire, nodeProcess } from '../shims';
const fs = nodeRequire('fs') as typeof import('fs');
const path = nodeRequire('path') as typeof import('path');
const os = nodeRequire('os') as typeof import('os');
const process = { execPath: nodeProcess.execPath };

import { GOLDEN10, GOLDEN_CATALOG } from '../../tools/benchmark/catalog/golden10';
import { loadCatalog } from '../../tools/benchmark/catalog/schema';
import { TrialRunner, TrialOptions, TrialRuntime } from '../../tools/benchmark/runner/trial';
import { ManualAgentDriver } from '../../tools/benchmark/driver/manual-driver';
import { RuntimeChannel } from '../../tools/benchmark/runner/harness';
import { RuntimeSnapshot, VALIDATORS } from '../../tools/benchmark/validators';
import { CommandSandbox } from '../../tools/benchmark/runner/sandbox';

const PNG_GOOD = 'data:image/png;base64,GOOD';
const PNG_CLEAR = 'data:image/png;base64,CLEAR';

function snap (opts: { cube?: boolean; errors?: { seq: number; category: string; message: string }[]; clear?: boolean; animation?: boolean } = {}): RuntimeSnapshot {
    return {
        capability: { name: 'webgl2', status: 'supported' },
        scene: {
            sceneId: 's1', name: 'golden', nodeCount: opts.cube ? 2 : 1, componentCount: opts.animation ? 2 : 1,
            componentsByType: { Camera: 1, ...(opts.animation ? { Animation: 1 } : {}) },
            cameraCount: 1, lightCount: 0, rendererCount: 0,
            uniqueAssetCount: { total: 0, byKind: {} },
            nodes: [{ id: 'n1', name: 'scene-root', parentId: null }, ...(opts.cube ? [{ id: 'n2', name: 'cube', parentId: 'n1' }] : [])],
            truncated: false,
        },
        nodes: {}, assets: { ok: true, counts: {}, diagnostics: [], unchecked: [] },
        capture: { png: opts.clear ? PNG_CLEAR : PNG_GOOD, width: 8, height: 8, sceneId: 's1', frameIndex: 1 },
        centerPixel: opts.clear ? [10, 20, 40] : [200, 120, 60],
        runtimeErrors: opts.errors ?? [],
    };
}

function makeRuntime (state: Parameters<typeof snap>[0], failStart = false): TrialRuntime {
    const channel: RuntimeChannel & { snapshot (): Promise<RuntimeSnapshot> } = {
        inspect: async () => snap(state),
        captureFrame: async () => ({ png: state.clear ? PNG_CLEAR : PNG_GOOD, width: 8, height: 8, sceneId: 's1', frameIndex: 1 }),
        errorReport: async () => ({ errors: state.errors ?? [], dropped: 0 }),
        snapshot: async () => snap(state),
    };
    // build：与真实 esbuild 语义一致的括号平衡检查（破碎提交必须 FAIL）
    const buildCheck = async (workspace: { paths: { workspace: string } }) => {
        const fsp = nodeRequire('fs');
        const entry = ['src/main.ts', 'main.ts'].map((rel: string) => path.join(workspace.paths.workspace, rel)).find((p: string) => fsp.existsSync(p));
        if (!entry) { return { success: false, diagnostics: ['main.ts missing'] }; }
        const src = fsp.readFileSync(entry, 'utf8') as string;
        const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
        const stack: string[] = [];
        for (const ch of src) {
            if (ch === '(' || ch === '[' || ch === '{') { stack.push(ch); } else if (pairs[ch]) {
                if (stack.pop() !== pairs[ch]) { return { success: false, diagnostics: ['unbalanced ' + ch] }; }
            }
        }
        if (stack.length > 0) { return { success: false, diagnostics: ['unclosed'] }; }
        return { success: true, diagnostics: [] };
    };
    return {
        start: async () => { if (failStart) { throw new Error('browser launch failed (simulated)'); } return channel; },
        build: buildCheck,
        stop: async () => undefined,
    };
}

function bench (id: string, overrides: Record<string, unknown> = {}): ReturnType<typeof goldenById> {
    return goldenById(id, overrides);
}
function goldenById (id: string, overrides: Record<string, unknown> = {}) {
    const base = GOLDEN10.find((b) => b.id === id)!;
    return { ...base, ...overrides } as typeof base;
}

function opts (workRoot: string, runtime: TrialRuntime, benchmark: ReturnType<typeof goldenById>): TrialOptions {
    return {
        benchmark, workRoot, cocosairRevision: 'f519d86', catalogRevision: 'golden10-r1',
        agentProfile: 'A001', environment: { os: 'test', browser: 'jsdom-fake', viewport: '8x8', webglBackend: 'none' },
        cacheMode: 'cold', randomSeed: 0,
        fixtureDir: path.join(nodeRequire('path').resolve(__dirname, '../..'), 'tools', 'benchmark', 'fixtures', benchmark.id),
        runtime,
    };
}

test('§44：Golden 10 catalog 通过 schema 校验且 fixtures/references 在场', () => {
    const { errors } = loadCatalog(GOLDEN_CATALOG);
    expect(errors).toEqual([]);
    expect(GOLDEN10.length).toBe(10);
    const categories = new Set(GOLDEN10.map((b) => b.category));
    for (const required of ['Scene', 'Camera', 'Asset', 'glTF', 'Animation', 'Material', 'Interaction', 'Compression', 'Agent', 'Repair']) {
        expect(categories.has(required)).toBe(true);
    }
    const root = path.resolve(__dirname, '../..');
    for (const b of GOLDEN10) {
        expect(fs.existsSync(path.join(root, 'tools/benchmark/fixtures', b.id, 'index.html'))).toBe(true);
        if (b.referenceImplementation) {
            expect(fs.existsSync(path.join(root, 'tools/benchmark/references/frozen', b.referenceImplementation))).toBe(true);
        }
    }
});

test('场景1：Reference Validator FAIL → ENGINE（不误归 INFRA）', async () => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g1-'));
    const runner = new TrialRunner(makeRuntime({ cube: false, clear: true }));
    const result = await runner.runReference(opts(workRoot, makeRuntime({ cube: false, clear: true }), bench('B001', { validators: ['scene-ready', 'node-exists'] })));
    expect(result.trialResult).toBe('VALID');
    expect(result.engineResult).toBe('FAIL');
    expect(result.failureDomain).toBe('ENGINE');
});

test('场景2：Browser Startup FAIL → INFRASTRUCTURE + NOT_EVALUATED', async () => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g1-'));
    const runner = new TrialRunner(makeRuntime({}, true));
    const result = await runner.runReference(opts(workRoot, makeRuntime({}, true), bench('B001', { validators: ['scene-ready'] })));
    expect(result.trialResult).toBe('INFRA_FAILURE');
    expect(result.failureDomain).toBe('INFRASTRUCTURE');
    expect(result.engineResult).toBe('NOT_EVALUATED');
});

test('场景3：Agent Compile FAIL → AGENT（FEEDBACK 包含编译诊断）', async () => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g1-'));
    const runner = new TrialRunner(makeRuntime({}, false));
    const driver = new ManualAgentDriver();
    driver.script(
        { type: 'write-file', path: 'src/main.ts', content: 'const broken = ((;\n' },
        { type: 'finish', summary: 'gave up broken' },
    );
    const result = await runner.runAgent(opts(workRoot, makeRuntime({}, false), bench('B001', { validators: ['scene-ready'] })), driver);
    expect(result.agentResult).toBe('FAIL');
    expect(result.failureDomain).toBe('AGENT');
});

test('场景4：Repair Budget Exhausted → AGENT/BUDGET_EXHAUSTED 且计入分母', async () => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g1-'));
    const runtime = makeRuntime({});
    const runner = new TrialRunner(runtime);
    const driver = new ManualAgentDriver();
    driver.script(
        { type: 'write-file', path: 'src/main.ts', content: 'const a = ((;\n' },
        { type: 'patch-file', path: 'src/main.ts', diff: '@@ -1,1 +1,1 @@\n-const a = ((;\n+const a = (((;\n' },
        { type: 'patch-file', path: 'src/main.ts', diff: '@@ -1,1 +1,1 @@\n-const a = (((;\n+const a = (((((;\n' },
        { type: 'patch-file', path: 'src/main.ts', diff: '@@ -1,1 +1,1 @@\n-const a = (((((;\n+const a = (((((((;\n' },
        { type: 'patch-file', path: 'src/main.ts', diff: '@@ -1,1 +1,1 @@\n-const a = (((((((;\n+const a = (((((((((;\n' },
        { type: 'patch-file', path: 'src/main.ts', diff: '@@ -1,1 +1,1 @@\n-const a = (((((((((;\n+const a = ((((((((((;\n' },
        { type: 'finish', summary: 'still broken' },
    );
    const benchmark = bench('B001', { validators: ['scene-ready'], repairBudget: 2 });
    const result = await runner.runAgent(opts(workRoot, runtime, benchmark), driver);
    expect(result.agentResult).toBe('BUDGET_EXHAUSTED');
    expect(result.failureDomain).toBe('AGENT');
    expect(result.repairs).toBe(2); // §38：实际执行次数（第 3 次 patch 被预算拒绝，未执行）
});

test('场景5：Policy Denied → VALID + POLICY 事件（非 INVALID_RUN，仍计分母）', async () => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g1-'));
    const rt = makeRuntime({});
    const runner = new TrialRunner(rt);
    const driver = new ManualAgentDriver();
    driver.script(
        { type: 'read-file', path: 'protected/references/frozen/B001.main.ts' },
        { type: 'finish', summary: 'tried to peek' },
    );
    const benchmark = bench('B001', { validators: ['scene-ready'], readablePaths: [] });
    const result = await runner.runAgent(opts(workRoot, rt, benchmark), driver);
    expect(result.trialResult).toBe('VALID');
    expect(result.policyDenials.length).toBeGreaterThan(0);
    // 源码类 benchmark：被拒后无任何提交即 finish → FAIL/AGENT（§34 计入分母）
    expect(result.failureDomain).toBe('AGENT');
    expect(result.agentResult).toBe('FAIL');
});

test('场景6：真实 Protected Resource Escape → ISOLATION/INVALID_RUN（台账）', async () => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g1-'));
    const opts0 = opts(workRoot, makeRuntime({}), bench('B001', { validators: ['scene-ready'] }));
    const ws = await import('../../tools/benchmark/runner/workspace');
    const w = ws.TrialWorkspace.create({
        workRoot,
        fixtureDir: opts0.fixtureDir,
        policyConfig: {
            writablePaths: ['src'], readablePaths: [], protectedPaths: ['protected'],
            allowedCommands: [], allowedPathRoots: [], allowedNetworkHosts: [],
        },
        ledgerFiles: ['src/main.ts'],
    });
    // Agent 通过未知通道改写受保护参考实现（Harness 防线之外）
    fs.writeFileSync(path.join(w.paths.workspace, 'src', 'main.ts'), 'HACKED');
    const violations = w.isolationViolations();
    expect(violations).toContain('src/main.ts');
});

test('场景7：Background Process Leakage → Sandbox 记录并可清理进程树', async () => {
    const sandbox = new CommandSandbox(os.tmpdir());
    const slow = await sandbox.run(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 600 });
    expect(slow.timedOut).toBe(true);
    expect(slow.record.killed).toBe(true);
    expect(sandbox.records().length).toBe(1);
    await sandbox.dispose();
});

test('场景8：Expected Unsupported Device → EXPECTED_UNSUPPORTED（DEVICE 能力合同）', () => {
    const snapshotData = snap({});
    snapshotData.capability = { name: 'webgpu', status: 'unsupported' };
    const outcome = VALIDATORS['capability-status'].evaluate(snapshotData, { requires: 'webgpu' });
    expect(outcome.state).toBe('EXPECTED_UNSUPPORTED');
});
