// Lead review: production driver and validators, NODE_CONTRACT only.
import type {} from 'jest';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const ts = require('typescript');
const browser = require('../../tools/verify/shaders-driver-pilot-browser.cjs');
const perf = require('../../tools/verify/shaders-driver-pilot-performance.cjs');
const root = path.resolve(__dirname, '../..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'air-driver-review-'));
const bundle = path.join(scratch, 'driver.cjs');
cp.execFileSync(
    process.execPath,
    [
        '-e',
        `require('esbuild').buildSync({entryPoints:['examples/shader-driver-pilot/src/driver.ts'],bundle:true,platform:'node',format:'cjs',outfile:${JSON.stringify(bundle)}})`,
    ],
    { cwd: root, windowsHide: true },
);
const driver = require(bundle);
afterAll(() => {
    const absolute = path.resolve(scratch);
    if (
        path.dirname(absolute) !== path.resolve(os.tmpdir()) ||
        !path.basename(absolute).startsWith('air-driver-review-')
    )
        throw new Error('Unsafe cleanup');
    fs.rmSync(absolute, { recursive: true, force: true });
});

function binding() {
    return { target: 'neon.intensity', binding: { source: 'pointer', axis: 'x' }, defaultValue: 1 };
}

describe('Driver Lead review: atomic validation and actual mapping', () => {
    test('valid scalar binding is accepted', () => {
        expect(driver.validateParams({ bindings: [binding()] }).ok).toBe(true);
    });
    test.each([
        [
            'unknown root key',
            (d: any) => {
                d.ghost = 1;
            },
        ],
        [
            'unknown binding key',
            (d: any) => {
                d.bindings[0].binding.ghost = 1;
            },
        ],
        [
            'non-boolean clamp',
            (d: any) => {
                d.bindings[0].binding.clamp = 'false';
            },
        ],
        [
            'missing default',
            (d: any) => {
                delete d.bindings[0].defaultValue;
            },
        ],
        [
            'string scalar default',
            (d: any) => {
                d.bindings[0].defaultValue = 'one';
            },
        ],
        [
            'partial range',
            (d: any) => {
                d.bindings[0].binding.inputMin = 0;
            },
        ],
        [
            'duplicate target',
            (d: any) => {
                d.bindings.push(binding());
            },
        ],
    ])('rejects %s', (_label, mutate) => {
        const data = { bindings: [binding()] };
        mutate(data);
        expect(driver.validateParams(data).ok).toBe(false);
    });
    test('returned binding data cannot be mutated through caller aliases', () => {
        const data = { bindings: [binding()] };
        const accepted = driver.validateParams(data);
        expect(accepted.ok).toBe(true);
        data.bindings[0].binding.source = 'corrupted';
        expect(accepted.values[0].binding.source).toBe('pointer');
    });
    test('non-finite pointer is rejected before state changes', () => {
        const state = driver.createDriverState();
        const before = JSON.stringify(state);
        expect(() => driver.driverFrame(state, { pointer: { x: NaN, y: 0.5 }, deltaTime: 0.1 }, [binding()])).toThrow();
        expect(JSON.stringify(state)).toBe(before);
    });
    test('pointer-position preserves both normalized coordinates', () => {
        const params = [
            { target: 'position', binding: { source: 'pointer', axis: 'uv' }, defaultValue: { x: 0.5, y: 0.5 } },
        ];
        const values = driver.driverFrame(
            driver.createDriverState(),
            { pointer: { x: 0.2, y: 0.8 }, deltaTime: 0.1 },
            params,
        );
        expect(values.position).toEqual({ x: 0.2, y: 0.8 });
    });
    test('default target namespaces match the actual consumer registry', () => {
        const source = fs.readFileSync(path.join(root, 'examples/shader-driver-pilot/src/main.ts'), 'utf8');
        const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
        let targets: string[] = [];
        const walk = (node: any) => {
            if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'DEFAULT_BINDINGS') {
                const visit = (child: any) => {
                    if (
                        ts.isPropertyAssignment(child) &&
                        child.name.getText(ast) === 'target' &&
                        ts.isStringLiteral(child.initializer)
                    )
                        targets.push(child.initializer.text);
                    ts.forEachChild(child, visit);
                };
                visit(node.initializer);
            }
            ts.forEachChild(node, walk);
        };
        walk(ast);
        expect(targets.length).toBeGreaterThan(0);
        expect(targets.filter((t) => !browser.CONSUMERS.includes(t.split('.')[0]))).toEqual([]);
    });
});

describe('Driver Lead review: evidence cannot pass without execution', () => {
    test('empty source closure and empty engine set are rejected', () => {
        expect(
            browser.validateFiles({
                schemaVersion: 'w5-driver-pilot/1',
                inputs: [],
                engines: [],
                agentGate: 'NOT_RUN',
                subset: true,
                completed: false,
            }).ok,
        ).toBe(false);
    });
    test('malformed source closure is rejected without TypeError', () => {
        let result: any;
        expect(() => {
            result = browser.validateFiles({
                schemaVersion: 'w5-driver-pilot/1',
                inputs: {},
                engines: [],
                agentGate: 'NOT_RUN',
                subset: true,
                completed: false,
            });
        }).not.toThrow();
        expect(result.ok).toBe(false);
    });
    test('performance cannot pass with omitted frames and updates', () => {
        const result = perf.validatePerformance(
            {
                readPixelsDuringWindow: 0,
                timerAvailable: false,
                gpuSamples: [],
                queryEvents: [],
                methods: { instrumentation: 'instrumented' },
            },
            perf.PROFILES[0],
            'neon',
        );
        expect(result.errors.length).toBeGreaterThan(0);
    });
    test('GPU unavailable cannot carry nonempty GPU samples', () => {
        const result = perf.validatePerformance(
            {
                readPixelsDuringWindow: 0,
                timerAvailable: false,
                gpuSamples: [{}],
                queryEvents: [],
                frames: Array.from({ length: 90 }, (_, frame) => ({ frame })),
                updateCalls: [],
                methods: { instrumentation: 'instrumented' },
            },
            perf.PROFILES[0],
            'neon',
        );
        expect(result.errors.length).toBeGreaterThan(0);
    });
});
