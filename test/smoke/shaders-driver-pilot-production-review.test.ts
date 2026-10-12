// Lead production regressions. NODE_CONTRACT; no browser proof is claimed.
import type {} from 'jest';
import { validateParams, createDriverState, driverFrame } from '../../examples/shader-driver-pilot/src/driver';

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const browser = require('../../tools/verify/shaders-driver-pilot-browser.cjs');
const oracle = require('../../tools/verify/shaders-driver-pilot-oracle.cjs');
const perf = require('../../tools/verify/shaders-driver-pilot-performance.cjs');
const root = path.resolve(__dirname, '../..');

function scalar(defaultValue: unknown) {
    return { bindings: [{ target: 'neon.intensity', binding: { source: 'pointer', axis: 'x' }, defaultValue }] };
}

function declaredDefaults(name: string) {
    const source = fs.readFileSync(path.join(root, 'examples/shader-driver-pilot/src/main.ts'), 'utf8');
    const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
    let result: Record<string, number> | null = null;
    function walk(node: any) {
        if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) {
            let initializer = node.initializer;
            while (initializer && (ts.isAsExpression(initializer) || ts.isParenthesizedExpression(initializer)))
                initializer = initializer.expression;
            if (initializer && ts.isObjectLiteralExpression(initializer)) {
                result = {};
                for (const p of initializer.properties) {
                    if (ts.isPropertyAssignment(p) && ts.isNumericLiteral(p.initializer))
                        result[p.name.getText(ast)] = Number(p.initializer.text);
                }
            }
        }
        ts.forEachChild(node, walk);
    }
    walk(ast);
    return result;
}

describe('Driver production contract: independent inputs and observations', () => {
    test.each([[null], [true], [{}], [{ x: NaN, y: 0.5 }]])('rejects invalid scalar default %p', (value) => {
        expect(validateParams(scalar(value)).ok).toBe(false);
    });
    test('vector default must contain two finite coordinates', () => {
        expect(
            validateParams({
                bindings: [{ target: 'neon.position', binding: { source: 'pointer', axis: 'uv' }, defaultValue: 1 }],
            }).ok,
        ).toBe(false);
    });
    test('paused state freezes pointer-driven outputs as well as time', () => {
        const state = createDriverState();
        const params: any = [{ target: 'neon.rotation', binding: { source: 'pointer', axis: 'x' }, defaultValue: 0 }];
        const first = driverFrame(state, { pointer: { x: 0.2, y: 0.8 }, deltaTime: 0.1 }, params);
        state.paused = true;
        const paused = driverFrame(state, { pointer: { x: 0.9, y: 0.1 }, deltaTime: 0.1 }, params);
        expect(paused).toEqual(first);
        expect(state.pointer).toEqual({ x: 0.2, y: 0.8 });
        expect(state.time).toBe(0.1);
    });
    test('independent oracle preserves vector output', () => {
        expect(
            oracle.computeBinding({ source: 'pointer', axis: 'uv' }, { time: 0 }, { pointer: { x: 0.2, y: 0.8 } }),
        ).toEqual({ x: 0.2, y: 0.8 });
    });
    test.each(['HOLO_DEFAULTS', 'NEON_DEFAULTS'])('%s agrees with the frozen mother parameter defaults', (name) => {
        const id = name === 'HOLO_DEFAULTS' ? 'holographic' : 'neon';
        const mother = JSON.parse(fs.readFileSync(path.join(root, `examples/shader-${id}/parameters.json`), 'utf8'));
        const declared = declaredDefaults(name);
        // Reading the real schema is also valid; silently diverging hard-coded values is not.
        if (declared) {
            expect(Object.keys(declared).length).toBeGreaterThan(0);
            for (const [key, value] of Object.entries(declared)) expect(value).toBe(mother.params[key].defaultValue);
        } else {
            const inputs = browser.INPUTS || [];
            expect(inputs).toContain(`examples/shader-${id}/parameters.json`);
        }
    });
    test('current fingerprints and empty engine objects cannot substitute for measurements', () => {
        const report = {
            schemaVersion: 'w5-driver-pilot/1',
            ...browser.currentIdentity(),
            phase: 'functional',
            engines: [{ engine: 'chromium' }, { engine: 'firefox' }, { engine: 'webkit' }],
            agentGate: 'NOT_RUN',
            subset: true,
            completed: false,
            scopePassed: true,
            exitCode: 0,
        };
        expect(browser.validateFiles(report).ok).toBe(false);
    });
    test('finite duration overflow is rejected without poisoning state', () => {
        const state = createDriverState();
        state.time = Number.MAX_VALUE;
        const before = JSON.stringify(state);
        expect(() => driverFrame(state, { pointer: { x: 0.2, y: 0.8 }, deltaTime: Number.MAX_VALUE }, [])).toThrow();
        expect(JSON.stringify(state)).toBe(before);
    });
    test('empty frame records cannot pass a complete-looking performance window', () => {
        const raw = {
            readPixelsDuringWindow: 0,
            timerAvailable: false,
            gpuSamples: [],
            queryEvents: [],
            frames: Array.from({ length: 90 }, () => ({})),
            updateCalls: [{}],
            methods: { instrumentation: 'instrumented' },
        };
        expect(perf.validatePerformance(raw, perf.PROFILES[0], 'neon').errors.length).toBeGreaterThan(0);
    });
    test('shape-correct containers with no measured captures, cycles or controls are rejected', () => {
        const report = {
            schemaVersion: 'w5-driver-pilot/1',
            ...browser.currentIdentity(),
            phase: 'functional',
            engines: ['chromium', 'firefox', 'webkit'].map((engine) => ({
                engine,
                browserVersion: 'contract-fixture',
                pageErrors: [],
                consoleErrors: [],
                shaderCompile: [{ compiled: true }],
                pageClosed: true,
                browserClosed: true,
                captures: browser.VISUAL_PLAN.map(() => ({})),
                invalids: browser.INVALID_CASES.map(() => ({})),
                normal: {},
                resources: { rows: [] },
            })),
            agentGate: 'NOT_RUN',
            subset: true,
            completed: false,
            scopePassed: true,
            exitCode: 0,
        };
        expect(browser.validateFiles(report).ok).toBe(false);
    });
    test('performance plan has six unique consumer/profile tuples per engine', () => {
        const tuples = browser.PERFORMANCE_PLAN.map((p: any) => `${p.consumer}/${p.profile.id}`);
        expect(tuples.length).toBe(6);
        expect(new Set(tuples).size).toBe(6);
    });
});
