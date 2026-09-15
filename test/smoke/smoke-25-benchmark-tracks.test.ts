/**
 * Smoke 25 — V0.6 T5/T6/T7：Validators（§54）确定性断言 + Reference/Agent 双 Track
 * 状态机（§6-15）+ Run Manifest（§43）。运行时用 InProcess 伪 Runtime（浏览器通道
 * 由 Playwright 实现单独验收）。
 */
import { nodeRequire } from '../shims';
const fs = nodeRequire('fs') as typeof import('fs');
const path = nodeRequire('path') as typeof import('path');
const os = nodeRequire('os') as typeof import('os');

import { RuntimeSnapshot, VALIDATORS, runValidators } from '../../tools/benchmark/validators';
import { TrialRunner, TrialOptions, TrialRuntime } from '../../tools/benchmark/runner/trial';
import { BenchmarkDefinition, loadCatalog } from '../../tools/benchmark/catalog/schema';
import { ManualAgentDriver } from '../../tools/benchmark/driver/manual-driver';
import { RuntimeChannel } from '../../tools/benchmark/runner/harness';

const PNG_A = 'data:image/png;base64,AAA';
const PNG_B = 'data:image/png;base64,BBB';

function snapshot (overrides: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot {
    return {
        capability: { name: 'webgl2', status: 'supported' },
        scene: {
            sceneId: 'scene-1', name: 'demo', nodeCount: 3, componentCount: 3,
            componentsByType: { Camera: 1, DirectionalLight: 1, MeshRenderer: 1, Animation: 1 },
            cameraCount: 1, lightCount: 1, rendererCount: 1,
            uniqueAssetCount: { total: 2, byKind: { Mesh: 1, Material: 1 } },
            nodes: [
                { id: 'node-1', name: 'root', parentId: null },
                { id: 'node-2', name: 'cube', parentId: 'node-1' },
                { id: 'node-3', name: 'camera', parentId: 'node-1' },
            ],
            truncated: false,
        },
        nodes: {
            'node-2': {
                id: 'node-2', name: 'cube', parentId: 'node-1', childrenIds: [],
                active: true, activeSelf: true,
                components: [{ id: 'comp-1', type: 'MeshRenderer', enabled: true }],
                local: { position: [1, 2, 3], rotationEuler: [0, 45, 0], scale: [1, 1, 1] },
                world: { position: [1, 2, 3] },
            },
        },
        assets: { ok: true, counts: { Mesh: 1, Material: 1 }, diagnostics: [], unchecked: [{}] },
        capture: { png: PNG_B, width: 64, height: 64, sceneId: 'scene-1', frameIndex: 2 },
        centerPixel: [200, 120, 60],
        runtimeErrors: [],
        ...overrides,
    };
}

describe('V0.6 §54 — 首批 Validator', () => {
    test('12 个 Validator 全部注册且可组合执行', () => {
        expect(Object.keys(VALIDATORS).length).toBe(12);
        const snap = snapshot();
        const results = runValidators(
            ['scene-ready', 'node-exists', 'node-count', 'transform-equals', 'asset-loaded', 'animation-playing',
                'material-property', 'no-runtime-error', 'visible-frame', 'frame-diff', 'capability-status', 'resource-released'],
            snap,
            {
                'node-exists': { name: 'cube' },
                'node-count': { min: 3 },
                'transform-equals': { nodeName: 'cube', position: [1, 2, 3] },
                'asset-loaded': { kind: 'Mesh' },
                'frame-diff': { beforePng: PNG_A },
                'capability-status': { requires: 'webgl2' },
            },
        );
        expect(results.every((r) => r.state === 'PASS')).toBe(true);
    });

    test('失败路径确定性：缺节点/错变换/旧帧/坏资产/运行时错误', () => {
        const snap = snapshot();
        expect(runValidators(['node-exists'], snap, { 'node-exists': { name: 'nope' } })[0].state).toBe('FAIL');
        expect(runValidators(['transform-equals'], snap, { 'transform-equals': { nodeName: 'cube', position: [9, 9, 9] } })[0].state).toBe('FAIL');
        expect(runValidators(['frame-diff'], snap, { 'frame-diff': { beforePng: PNG_B } })[0].detail).toContain('identical');
        const bad = snapshot({ assets: { ok: false, counts: {}, diagnostics: [{ code: 'MISSING_DEPENDENCY', location: 'x', message: 'm' }], unchecked: [] } });
        expect(runValidators(['asset-loaded'], bad, {})[0].state).toBe('FAIL');
        expect(runValidators(['no-runtime-error'], snapshot({ runtimeErrors: [{ seq: 1, category: 'shader', message: 'boom' }] }), {})[0].state).toBe('FAIL');
        expect(runValidators(['visible-frame'], snapshot({ centerPixel: [10, 20, 40] }), {})[0].state).toBe('FAIL');
    });

    test('能力合同：unsupported/fallback 状态映射', () => {
        const results = runValidators(['capability-status'], snapshot({ capability: { name: 'webgl2', status: 'unsupported' } }), { 'capability-status': { requires: 'webgl2' } });
        expect(results[0].state).toBe('EXPECTED_UNSUPPORTED');
        const results2 = runValidators(['capability-status'], snapshot({ capability: { name: 'avif', status: 'fallback' } }), { 'capability-status': { requires: 'avif' } });
        expect(results2[0].state).toBe('EXPECTED_FALLBACK');
    });
});

// ---- 双 Track 状态机（InProcess Runtime）----

interface FakeState { errors: { seq: number; category: string; message: string }[] }

function makeRuntime (state: FakeState, render: { png: string; center: [number, number, number] }): TrialRuntime {
    const fakeSnapshot = (): RuntimeSnapshot => snapshot({ capture: { ...snapshot().capture!, png: render.png }, centerPixel: render.center, runtimeErrors: state.errors });
    const channel: RuntimeChannel & { snapshot (): Promise<RuntimeSnapshot> } = {
        inspect: async () => fakeSnapshot(),
        captureFrame: async () => ({ png: render.png, width: 64, height: 64, sceneId: 'scene-1', frameIndex: 1 }),
        errorReport: async () => ({ errors: state.errors, dropped: 0 }),
        executeReference: async () => undefined, // 冻结操作在本假 Runtime 中无副作用
        snapshot: async () => fakeSnapshot(),
    };
    return {
        start: async () => channel,
        stop: async () => undefined,
    };
}

function benchmark (overrides: Partial<BenchmarkDefinition> = {}): BenchmarkDefinition {
    return {
        id: 'B001', version: '1.0.0', name: 'demo scene', benchmarkType: 'runtime-control',
        category: 'Scene', difficulty: 'basic',
        prompt: 'Create a rotating cube scene with camera and light.',
        startingFixture: 'fixtures/B001',
        referenceOperations: [{ action: 'createNode', name: 'cube' }],
        writablePaths: ['src'], readablePaths: [], protectedPaths: ['protected'],
        allowedTools: [], allowedCommands: [{ command: 'node', allowAnyArgs: false }], allowedNetworkHosts: [],
        knowledgeProfile: 'K2',
        validators: ['scene-ready', 'node-exists', 'no-runtime-error'],
        validatorParams: { 'node-exists': { name: 'cube' } },
        capabilityRequirements: [], browserRequirements: 'chrome>=100',
        repairBudget: 5, timeBudgetMs: 600000,
        tags: ['scene'],
        ...overrides,
    };
}

function options (workRoot: string, runtime: TrialRuntime): TrialOptions {
    return {
        benchmark: benchmark(),
        workRoot,
        cocosairRevision: 'f519d86',
        catalogRevision: 'catalog-r1',
        agentProfile: 'A001',
        environment: { os: 'test', browser: 'jsdom-fake', viewport: '64x64', webglBackend: 'none' },
        cacheMode: 'cold',
        randomSeed: 0,
        fixtureDir: fs.mkdtempSync(path.join(os.tmpdir(), 'v06-fixture-')),
        runtime,
    };
}

describe('V0.6 §6-15 — 双 Track 状态机', () => {
    test('Reference Track：validators 全过 → engine PASS；agent 不参与', async () => {
        const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v06-run-'));
        const runner = new TrialRunner(makeRuntime({ errors: [] }, { png: PNG_B, center: [200, 120, 60] }));
        const result = await runner.runReference(options(workRoot, makeRuntime({ errors: [] }, { png: PNG_B, center: [200, 120, 60] })));
        expect(result.trialResult).toBe('VALID');
        expect(result.engineResult).toBe('PASS');
        expect(result.agentResult).toBe('NOT_EVALUATED');
        expect(result.failureDomain).toBe('NONE');
    });

    test('Reference FAIL → failureDomain=ENGINE；Fixture 缺失 → INFRA_FAILURE', async () => {
        const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v06-run2-'));
        const runner = new TrialRunner(makeRuntime({ errors: [{ seq: 1, category: 'shader', message: 'compile failed' }] }, { png: PNG_A, center: [10, 20, 40] }));
        const failing = await runner.runReference(options(workRoot, makeRuntime({ errors: [{ seq: 1, category: 'shader', message: 'x' }] }, { png: PNG_A, center: [10, 20, 40] })));
        expect(failing.engineResult).toBe('FAIL');
        expect(failing.failureDomain).toBe('ENGINE');

        const opts = options(workRoot, makeRuntime({ errors: [] }, { png: PNG_B, center: [1, 2, 3] }));
        opts.fixtureDir = path.join(workRoot, 'not-exist');
        const infra = await runner.runReference(opts);
        expect(infra.trialResult).toBe('INFRA_FAILURE');
        expect(infra.failureDomain).toBe('INFRASTRUCTURE');
        expect(infra.engineResult).toBe('NOT_EVALUATED');
    });

    test('Agent Track：一次提交即通过 → PASS 且 firstCompile=true（§36）', async () => {
        const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v06-run3-'));
        const runtime = makeRuntime({ errors: [] }, { png: PNG_B, center: [200, 120, 60] });
        const runner = new TrialRunner(runtime);
        const driver = new ManualAgentDriver('A001-scripted');
        // 提交源码（语法完好）→ freshBuild 通过 → validators 全过
        driver.script(
            { type: 'write-file', path: 'src/main.ts', content: 'const cube = 1;\nexport { cube };\n' },
            { type: 'finish', summary: 'done' },
        );
        const result = await runner.runAgent(options(workRoot, runtime), driver);
        expect(result.agentResult).toBe('PASS');
        expect(result.firstSubmissionCompilePass).toBe(true);
        expect(result.repairs).toBe(0);
    });

    test('Agent 语法错误 → FAIL(AGENT) + compile feedback；修复后 PASS 计 1 次 repair（§37）', async () => {
        const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v06-run4-'));
        const runtime = makeRuntime({ errors: [] }, { png: PNG_B, center: [200, 120, 60] });
        const runner = new TrialRunner(runtime);
        const driver = new ManualAgentDriver('A001-scripted');
        driver.script(
            { type: 'write-file', path: 'src/main.ts', content: 'const cube = (1;\n' }, // 括号不平衡 = 语法坏
            { type: 'patch-file', path: 'src/main.ts', diff: '@@ -1,1 +1,1 @@\n-const cube = (1;\n+const cube = 1;\nexport { cube };\n' },
            { type: 'finish', summary: 'fixed' },
        );
        const result = await runner.runAgent(options(workRoot, runtime), driver);
        expect(result.agentResult).toBe('PASS');
        expect(result.firstSubmissionCompilePass).toBe(false);
        expect(result.repairs).toBe(1);
    });

    test('策略拒绝：写受保护路径被 Harness 阻止 → VALID + POLICY 事件，内容不变（§30/§31）', async () => {
        const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v06-run5-'));
        const opts = options(workRoot, makeRuntime({ errors: [] }, { png: PNG_B, center: [200, 120, 60] }));
        fs.mkdirSync(path.join(opts.fixtureDir, 'protected'), { recursive: true });
        fs.writeFileSync(path.join(opts.fixtureDir, 'protected', 'answer.ts'), 'ANSWER');
        opts.benchmark = { ...opts.benchmark, validators: ['scene-ready'] };
        const runner = new TrialRunner(makeRuntime({ errors: [] }, { png: PNG_B, center: [200, 120, 60] }));
        const driver = new ManualAgentDriver('A001-scripted');
        driver.script(
            { type: 'write-file', path: 'protected/answer.ts', content: 'HACKED' },
            { type: 'finish', summary: 'attempted' },
        );
        const result = await runner.runAgent(opts, driver);
        expect(result.trialResult).toBe('VALID'); // 正确拒绝 = Trial 仍 VALID（§30）
        expect(result.policyDenials.some((d) => d.code === 'PROTECTED_RESOURCE')).toBe(true);
        expect(fs.readFileSync(path.join(result.workspaceDir!, 'protected', 'answer.ts'), 'utf8')).toBe('ANSWER');
    });

    test('真实隔离突破（台账捕获）→ violations 非空（§32 审计）', async () => {
        const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v06-run6-'));
        const opts = options(workRoot, makeRuntime({ errors: [] }, { png: PNG_B, center: [200, 120, 60] }));
        fs.mkdirSync(path.join(opts.fixtureDir, 'protected'), { recursive: true });
        fs.writeFileSync(path.join(opts.fixtureDir, 'protected', 'answer.ts'), 'ANSWER');
        opts.benchmark = { ...opts.benchmark, validators: ['scene-ready'] };
        const ws = await import('../../tools/benchmark/runner/workspace');
        const w = ws.TrialWorkspace.create({
            workRoot,
            fixtureDir: opts.fixtureDir,
            policyConfig: {
                writablePaths: ['src'], readablePaths: [], protectedPaths: ['protected'],
                allowedCommands: [], allowedPathRoots: [], allowedNetworkHosts: [],
            },
        });
        expect(w.isolationViolations()).toEqual([]);
        // 绕过 Harness 的真实篡改：台账必须捕获（INVALID_RUN 判定输入）
        fs.writeFileSync(path.join(w.paths.workspace, 'protected', 'answer.ts'), 'HACKED');
        expect(w.isolationViolations().some((v) => v.includes('protected'))).toBe(true);
    });
});

describe('V0.6 §48/§49 — Catalog Schema', () => {
    test('合法 catalog 通过；Type B 缺 reference / 重复 id / deprecated 无替代 → 报错', () => {
        const good = loadCatalog({ revision: 'r1', benchmarks: [benchmark()] });
        expect(good.errors).toEqual([]);
        const bad = loadCatalog({
            revision: 'r1',
            benchmarks: [
                benchmark(),
                { ...benchmark(), id: 'B002', benchmarkType: 'source-repair', referenceImplementation: undefined } as BenchmarkDefinition,
                { ...benchmark(), id: 'B001', deprecated: true },
            ],
        });
        expect(bad.errors.length).toBeGreaterThanOrEqual(2);
    });
});
