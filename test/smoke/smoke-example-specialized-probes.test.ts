// Synthetic NODE_CONTRACT observations only. No pixels below are browser evidence.
import { nodeRequire } from '../shims';
const fs = nodeRequire('fs');
const path = nodeRequire('path');
const B = nodeRequire(path.resolve('tools/verify/shaders-driver-pilot-browser.cjs'));
const O = nodeRequire(path.resolve('tools/verify/shaders-driver-pilot-oracle.cjs'));
const P = nodeRequire(path.resolve('tools/verify/example-specialized-probes.cjs'));
const C = nodeRequire(path.resolve('tools/verify/example-evidence-campaign.cjs'));
const F = nodeRequire(path.resolve('tools/verify/example-evidence-campaign.cpu-fixture.cjs'));
const clone = (x: any) => JSON.parse(JSON.stringify(x));
const scope = { id: P.ID, mode: 'primary', query: '', viewport: { width: 480, height: 360 } };
function state(steps: number[], frame: number) {
    const bindings = B.bindingsFor('holographic', 'time');
    const pointer = { x: 0.5, y: 0.5 };
    let time = 0;
    const outputsAt = (time: number) =>
        Object.fromEntries(bindings.map((p: any) => [p.target, O.computeBinding(p.binding, { time }, { pointer })]));
    const ledger = steps.map((dt, i) => {
        const before = time;
        time += dt;
        const outputs = outputsAt(time);
        return {
            frame: i === 0 ? 100 : 102 + i,
            dt,
            pointer,
            eventSequence: 0,
            generation: 2,
            backing: scope.viewport,
            timeBefore: before,
            timeAfter: time,
            outputs,
            materialUniforms: O.uniforms('holographic', outputs, time, 480, 360),
            nodePosition: O.consumed('holographic', outputs).position,
        };
    });
    const outputs = outputsAt(time),
        used = O.consumed('holographic', outputs);
    return {
        selectedConsumer: 'holographic',
        currentInstance: 1,
        frame,
        time,
        driver: { pointer, time, generation: 2, paused: false, released: false },
        bindings,
        outputs,
        motherParams: used.params,
        nodePosition: used.position,
        uniformReadback: O.uniforms('holographic', outputs, time, 480, 360),
        released: false,
        diagnostic: false,
        pointerLog: [],
        frameLedger: ledger,
        viewport: scope.viewport,
        dpr: 1,
        canvas: { ...scope.viewport, css: scope.viewport },
        oneCanvas: 1,
        shaders: [{ compiled: true }],
    };
}
function synthetic() {
    const zero = state([], 100),
        stepped = state([P.DT], 101),
        afterProbe = clone(stepped);
    afterProbe.frame += 2;
    const captured = {
        ...clone(stepped),
        driver: { ...stepped.driver, paused: true },
        diagnostic: true,
        frame: stepped.frame + 1,
    };
    const probe = {
        state: captured,
        pixels: O.points('holographic', 480, 360).map((p: any) => ({
            ...p,
            rgba: O.linearBytes(O.pixel('holographic', stepped.outputs, stepped.time, 480, 360, p.x, p.y)),
        })),
        gpuReceipt: {
            canvas: clone(stepped.canvas),
            frame: captured.frame - 1,
            time: stepped.time,
            glError: 0,
            targetRGBA8: true,
            transparentClear: true,
            detached: true,
            disposed: true,
        },
        tempRefs: { before: 1, after: 0 },
        rendererRestored: true,
        preserved: { instanceEqual: true, timeEqual: true, framesEqual: true, outputsEqual: true },
    };
    return {
        schema: P.SCHEMA,
        scope: clone(scope),
        consumer: 'holographic',
        dt: P.DT,
        errors: [],
        zero,
        stepped,
        afterProbe,
        resumedBefore: clone(afterProbe),
        resumedAfter: state([P.DT, P.DT, P.DT], 105),
        probe,
        renderer: {
            before: '',
            after: '',
            sameReference: true,
            validBefore: true,
            validAfter: true,
            refsBefore: 1,
            refsAfter: 1,
        },
    };
}
describe('ordinary Driver Pilot specialized proof contract (synthetic CPU only)', () => {
    test('both CI entry points run this specialized contract before browser capture', () => {
        for (const workflow of ['format', 'example-evidence']) {
            const text = fs.readFileSync(path.resolve('.github/workflows/' + workflow + '.yml'), 'utf8');
            const command = text
                .split('\n')
                .find(
                    (line: string) =>
                        line.includes('npx jest --runInBand --no-cache --runTestsByPath') &&
                        line.includes('test/smoke/smoke-example-specialized-probes.test.ts'),
                );
            expect(command).toContain('test/smoke/smoke-example-specialized-probes.test.ts');
            const capture = text.indexOf(
                workflow === 'format' ? 'id: core_browser' : 'node tools/verify/run-example-evidence-campaign.cjs',
            );
            expect(capture).toBeGreaterThan(0);
            expect(text.indexOf(command!)).toBeLessThan(capture);
            if (workflow === 'format') {
                expect(command).toContain('$RUNNER_TEMP/core-cpu/unit-tests.log');
                expect(text).toContain('${{ runner.temp }}/core-cpu/');
                expect(text).toMatch(
                    /name: Retain exact-head originals, failures and timings\s+if: always\(\)\s+uses: actions\/upload-artifact@v4/,
                );
            } else {
                expect(text).toContain('EXAMPLE_EVIDENCE_CPU_OUT="$RUNNER_TEMP/example-evidence-cpu"');
                expect(text).toMatch(
                    /if: always\(\)[\s\S]*?name: example-evidence-cpu-receipts[\s\S]*?path: \$\{\{ runner.temp \}\}\/example-evidence-cpu\//,
                );
            }
        }
    });
    test('recomputes a complete primary proof and accepts real assets with empty UUIDs', () => {
        expect(P.validateProbe(synthetic(), scope)).toEqual({ ok: true, errors: [] });
    });
    test('separate diagnostic success, failure or replacement pixels cannot change the canonical verdict', () => {
        for (const corrupt of [false, true]) {
            const raw = synthetic();
            if (corrupt) raw.probe.pixels[0].rgba[0] ^= 128;
            const original = P.validateProbe(raw, scope);
            for (const diagnostic of [
                null,
                { status: 'PASS', pixels: synthetic().probe.pixels },
                { diagnosticOnly: true, status: 'error', errors: ['diagnostic failure'] },
            ]) {
                expect(P.validateProbe({ ...raw, pixelDiagnostics: diagnostic }, scope)).toEqual(original);
            }
            expect(original.ok).toBe(!corrupt);
        }
    });
    test.each([
        ['raw absent', (r: any) => null],
        [
            'GPU canvas absent',
            (r: any) => {
                delete r.probe.gpuReceipt.canvas;
                return r;
            },
        ],
        [
            'GPU canvas mismatch',
            (r: any) => {
                r.probe.gpuReceipt.canvas.width = 1;
                return r;
            },
        ],
        [
            'after-probe frame goes backwards',
            (r: any) => {
                r.afterProbe.frame -= 10;
                r.resumedBefore = clone(r.afterProbe);
                return r;
            },
        ],
        [
            'captured time counterfeit',
            (r: any) => {
                r.probe.state.time = r.probe.state.driver.time = 999;
                return r;
            },
        ],
        [
            'resumed ledger extends past snapshot',
            (r: any) => {
                r.resumedAfter.frameLedger.forEach((e: any, i: number) => (e.frame = 999 + i));
                return r;
            },
        ],
        [
            'diagnostic never restored',
            (r: any) => {
                for (const k of ['afterProbe', 'resumedBefore', 'resumedAfter']) r[k].diagnostic = true;
                return r;
            },
        ],
        [
            'driver remains paused',
            (r: any) => {
                r.resumedAfter.driver.paused = true;
                return r;
            },
        ],
        [
            'probe skips diagnostic frame',
            (r: any) => {
                r.probe.state.frame++;
                r.probe.gpuReceipt.frame++;
                return r;
            },
        ],
        [
            'probe never paused',
            (r: any) => {
                r.probe.state.driver.paused = false;
                return r;
            },
        ],
        [
            'native ledger prefix replaced',
            (r: any) => {
                r.resumedAfter.frameLedger[0].frame--;
                return r;
            },
        ],
        [
            'native appended frame predates resume',
            (r: any) => {
                r.resumedAfter.frameLedger[1].frame = 101;
                return r;
            },
        ],
        [
            'schema',
            (r: any) => {
                r.schema = 'unknown';
                return r;
            },
        ],
        [
            'scope identity',
            (r: any) => {
                r.scope.id = 'other';
                return r;
            },
        ],
        [
            'consumer',
            (r: any) => {
                r.consumer = 'neon';
                return r;
            },
        ],
        [
            'viewport',
            (r: any) => {
                r.scope.viewport.width++;
                return r;
            },
        ],
        [
            'errors',
            (r: any) => {
                r.errors.push('probe threw');
                return r;
            },
        ],
        [
            'fake time step',
            (r: any) => {
                r.stepped.time = 0;
                return r;
            },
        ],
        [
            'missing ledger',
            (r: any) => {
                r.stepped.frameLedger = [];
                return r;
            },
        ],
        [
            'wrong ledger dt',
            (r: any) => {
                r.stepped.frameLedger[0].dt *= 2;
                return r;
            },
        ],
        [
            'wrong generation',
            (r: any) => {
                r.stepped.driver.generation++;
                return r;
            },
        ],
        [
            'fake uniform',
            (r: any) => {
                r.stepped.uniformReadback = {};
                return r;
            },
        ],
        [
            'pixel mismatch',
            (r: any) => {
                r.probe.pixels[0].rgba[0] = (r.probe.pixels[0].rgba[0] + 128) % 256;
                return r;
            },
        ],
        [
            'target still attached',
            (r: any) => {
                r.probe.gpuReceipt.detached = false;
                return r;
            },
        ],
        [
            'target not disposed',
            (r: any) => {
                r.probe.gpuReceipt.disposed = false;
                return r;
            },
        ],
        [
            'temporary material retained',
            (r: any) => {
                r.probe.tempRefs.after = 1;
                return r;
            },
        ],
        [
            'renderer object replaced',
            (r: any) => {
                r.renderer.sameReference = false;
                return r;
            },
        ],
        [
            'renderer invalid',
            (r: any) => {
                r.renderer.validAfter = false;
                return r;
            },
        ],
        [
            'renderer refs changed',
            (r: any) => {
                r.renderer.refsAfter++;
                return r;
            },
        ],
        [
            'actual state differs despite preserved flags',
            (r: any) => {
                r.afterProbe.outputs = {};
                return r;
            },
        ],
        [
            'pacer stayed paused',
            (r: any) => {
                r.resumedAfter = clone(r.resumedBefore);
                return r;
            },
        ],
        [
            'pacer frame only, no real time',
            (r: any) => {
                r.resumedAfter = clone(r.resumedBefore);
                r.resumedAfter.frame += 2;
                return r;
            },
        ],
        [
            'pacer new instance',
            (r: any) => {
                r.resumedAfter.currentInstance++;
                return r;
            },
        ],
    ])('rejects %s even when other flags claim success', (_label, mutate) => {
        expect(P.validateProbe(mutate(synthetic()), scope).ok).toBe(false);
    });
    test('non-driver and altered mode/query cannot claim the specialized primary protocol', () => {
        expect(P.validateProbe(null, { ...scope, id: 'other' }).ok).toBe(true);
        expect(P.validateProbe(synthetic(), { ...scope, id: 'other' }).ok).toBe(false);
        for (const changed of [{ mode: 'variant:1' }, { query: '?consumer=neon' }])
            expect(P.validateProbe(synthetic(), { ...scope, ...changed }).ok).toBe(false);
    });
    test('collector finally restores the native pacer when readback throws and retains that failure', async () => {
        const raw = synthetic();
        const resume = jest.fn();
        (window as any).__driverpilot = { ready: true, snapshot: () => raw.afterProbe, resumePacer: resume };
        let count = 0;
        const page = {
            evaluate: jest.fn(async (fn: any, arg: any) => {
                if (arg?.key === '__driverPixelDiagnosticReplay') return { errors: [], diagnosticOnly: true };
                count++;
                if (count === 1) return { zero: raw.zero, stepped: raw.stepped };
                if (count === 2) throw Error('real readback failed');
                if (count === 3) return fn();
                return raw.resumedAfter;
            }),
            waitForFunction: jest.fn(async () => {}),
        };
        try {
            const observed = await P.collectProbe(page, scope);
            expect(resume).toHaveBeenCalledTimes(1);
            expect(observed.errors.join(' ')).toContain('real readback failed');
            expect(P.validateProbe(observed, scope).ok).toBe(false);
        } finally {
            delete (window as any).__driverpilot;
        }
    });
    test('collector retains native restoration timeout rather than reporting success', async () => {
        const raw = synthetic();
        let count = 0;
        const page = {
            evaluate: jest.fn(async (_fn: any, arg: any) =>
                arg?.key === '__driverPixelDiagnosticReplay'
                    ? { errors: [], diagnosticOnly: true }
                    : [
                          { zero: raw.zero, stepped: raw.stepped },
                          { probe: raw.probe, afterProbe: raw.afterProbe, renderer: raw.renderer },
                          raw.resumedBefore,
                      ][count++],
            ),
            waitForFunction: jest.fn(async () => {
                throw Error('native pacer timeout');
            }),
        };
        const observed = await P.collectProbe(page, scope);
        expect(observed.errors.join(' ')).toContain('native pacer timeout');
        expect(P.validateProbe(observed, scope).ok).toBe(false);
    });
    test.each([false, true])(
        'actual page callbacks isolate observations and retain readback error=%s',
        async (throwReadback) => {
            const raw = synthetic(),
                actions: string[] = [],
                observations: number[] = [];
            let current = raw.zero;
            const trace = { observing: 0, app: null as any };
            const material: any = {};
            for (const [key, value] of Object.entries({ uuid: '', isValid: true, refCount: 1 }))
                Object.defineProperty(material, key, {
                    get() {
                        observations.push(trace.observing);
                        return value;
                    },
                });
            const observe = (value: any) => {
                observations.push(trace.observing);
                return value;
            };
            const renderer = { getSharedMaterial: () => observe(material) };
            const node = { getComponent: () => observe(renderer) };
            trace.app = { getScene: () => observe({ getChildByName: () => observe(node) }) };
            const action = (name: string) => {
                expect(trace.observing).toBe(0);
                actions.push(name);
            };
            const hook = {
                ready: true,
                pausePacer: () => action('pausePacer'),
                __resetSession: () => action('reset'),
                resume: () => action('resume'),
                setBindings: () => {
                    action('bindings');
                    return { ok: true };
                },
                step: async (dt: number) => {
                    action('step:' + dt);
                    current = dt ? raw.stepped : raw.zero;
                    return current;
                },
                linearProbe: async () => {
                    action('linearProbe');
                    if (throwReadback) throw Error('readback failed');
                    current = raw.afterProbe;
                    return raw.probe;
                },
                snapshot: () => observe(current),
                resumePacer: () => {
                    action('resumePacer');
                    current = raw.resumedAfter;
                },
            };
            Object.assign(window, { __apiTrace: trace, __driverpilot: hook, __CPU_MESH_RENDERER: {} });
            const page = {
                evaluate: async (fn: any, arg: any) => {
                    // Execute the production callback; substitute only the browser module loader in this CPU double.
                    const source = fn
                        .toString()
                        .replace(
                            "await import('/build/cocosair.module.js')",
                            '({ MeshRenderer: window.__CPU_MESH_RENDERER })',
                        );
                    return new Function('arg', 'return (' + source + ')(arg)')(arg);
                },
                waitForFunction: async (fn: any, arg: any) => {
                    expect(fn(arg)).toBe(true);
                },
            };
            try {
                const observed = await P.collectProbe(page, scope);
                expect(P.validateProbe(observed, scope).ok).toBe(!throwReadback);
                expect(actions).toEqual([
                    'pausePacer',
                    'reset',
                    'resume',
                    'bindings',
                    'step:0',
                    'step:' + P.DT,
                    'linearProbe',
                    'resumePacer',
                ]);
                expect(observations.length).toBeGreaterThan(5);
                expect(observations.every((n) => n === 1)).toBe(true);
                expect(trace.observing).toBe(0);
            } finally {
                for (const key of ['__apiTrace', '__driverpilot', '__CPU_MESH_RENDERER']) delete (window as any)[key];
            }
        },
    );
    test.each(['absent', 'valid', 'pixel-corrupt', 'validator-absent'])(
        'strict campaign consumer enforces driver %s raw proof',
        (kind) => {
            const f = F.fixture();
            const spy = F.installSyntheticReceiptValidationSpy(jest);
            try {
                const specPath = path.join(f.repo, 'examples/alpha/example.json');
                const spec = F.read(specPath);
                spec.id = P.ID;
                delete spec.bench.apiVariants;
                F.write(specPath, spec);
                const manifestPath = path.join(f.repo, 'examples/files.json'),
                    manifest = F.read(manifestPath);
                manifest.examples[0] = { ...spec, dir: 'alpha' };
                F.write(manifestPath, manifest);
                f.freeze = C.freezeCampaign({
                    repo: f.repo,
                    runtimeIdentity: F.identity,
                    out: path.join(f.artifacts, 'driver-freeze.json'),
                });
                const result = (r: any) => {
                    if (kind !== 'absent') r.probeContracts = synthetic();
                    if (kind === 'pixel-corrupt') r.probeContracts.probe.pixels[0].rgba[0] ^= 128;
                    if (kind !== 'validator-absent')
                        r.validatorResults.push({ validatorId: 'driver-primary-probe', state: 'PASS' });
                };
                if (kind === 'valid') expect(F.check(f, F.complete(f, { [P.ID]: { result } })).ok).toBe(true);
                else expect(() => F.complete(f, { [P.ID]: { result } })).toThrow(/specialized probe/);
            } finally {
                spy.mockRestore();
                fs.rmSync(f.temp, { recursive: true, force: true });
            }
        },
    );
});
