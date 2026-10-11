import * as path from 'path';
import { execFileSync } from 'child_process';

const ROOT = path.resolve(__dirname, '../..');

// Production TS + its real shared dependency are bundled; only native isValid
// and timer scheduling are controlled here. This is NODE_CONTRACT, not pixels.
function load() {
    const options = {
        entryPoints: [path.join(ROOT, 'examples/shared/shader-lifecycle.ts')],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        write: false,
        external: ['cocosair'],
        logLevel: 'silent',
    };
    // esbuild needs Node's native Uint8Array realm; jsdom's global setup is
    // intentionally preserved. Compile in a normal Node child, without a shell.
    const code = execFileSync(
        process.execPath,
        ['-e', `process.stdout.write(require('esbuild').buildSync(${JSON.stringify(options)}).outputFiles[0].text)`],
        { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const window: any = {};
    const module = { exports: {} as any };
    const schedule = (callback: () => void) => Promise.resolve().then(callback);
    new Function('require', 'module', 'exports', 'window', 'requestAnimationFrame', 'setTimeout', code)(
        (id: string) => {
            if (id !== 'cocosair') throw new Error(`Unexpected import: ${id}`);
            return { isValid: (ref: any) => ref?.isValid === true };
        },
        module,
        module.exports,
        window,
        schedule,
        schedule,
    );
    return { window, install: module.exports.installShaderLifecycle };
}

function setup(
    config: {
        leakedRef?: boolean;
        invalidFresh?: boolean;
        empty?: boolean;
        reuseRetired?: boolean;
        keepRetiredPointer?: boolean;
        validZeroRef?: boolean;
        incompleteFresh?: boolean;
        falseRetirementTrace?: boolean;
        differentAssetName?: boolean;
        reuseFreshAsset?: boolean;
    } = {},
) {
    const { window, install } = load();
    const old = { id: 'old', refCount: 1, isValid: true };
    const secondOld = { id: 'second-old', refCount: 1, isValid: true };
    let current: any = old;
    let disposed = false;
    let created = 0;
    let retired = 0;
    let stepped = 0;
    let step: () => Promise<void> = async () => {
        stepped++;
    };
    install({
        label: 'actual-contract',
        isDisposed: () => disposed,
        getInstance: () => current,
        createInstance: () => {
            created++;
            if (config.reuseRetired) {
                old.refCount = 1;
                old.isValid = true;
                current = old;
                return old;
            }
            current = { id: `fresh-${created}`, refCount: 1, isValid: !config.invalidFresh };
            return current;
        },
        retireInstance: (target: any) => {
            retired++;
            const before = target.refCount;
            target.refCount = config.leakedRef ? 9 : 0;
            target.isValid = !!config.validZeroRef;
            secondOld.refCount = 0;
            secondOld.isValid = false;
            if (!config.keepRetiredPointer) current = null;
            return {
                detached: true,
                refs: [
                    { kind: 'Mesh', before, after: config.falseRetirementTrace ? 9 : target.refCount },
                    ...(config.incompleteFresh ? [{ kind: 'Material', before: 1, after: 0 }] : []),
                ],
            };
        },
        ownedAssets: (target: any) =>
            config.empty
                ? []
                : [
                      {
                          name: config.differentAssetName ? 'surface-mesh' : 'Mesh',
                          ref: config.reuseFreshAsset ? old : target,
                      },
                      ...(config.incompleteFresh && target === old ? [{ name: 'Material', ref: secondOld }] : []),
                  ],
        stepClock: () => step(),
    });
    return {
        window,
        old,
        terminal: () => {
            disposed = true;
        },
        setStep: (callback: () => Promise<void>) => {
            step = callback;
        },
        counts: () => ({ created, retired, stepped }),
        current: () => current,
    };
}

describe('Lead Gallery lifecycle review (production NODE_CONTRACT)', () => {
    test('actual helper and dependency imports bundle successfully', () => {
        expect(typeof load().install).toBe('function');
    });

    test('non-consuming hold reports assets without retiring or creating', () => {
        const state = setup();
        expect(state.window.__lifecycleHold()).toBe(1);
        expect(state.window.__lifecycleHold()).toBe(1);
        expect(state.counts()).toEqual({ created: 0, retired: 0, stepped: 0 });
    });

    test('concurrent and subsequent calls return the exact same promise', async () => {
        const state = setup();
        const first = state.window.__lifecycle();
        const concurrent = state.window.__lifecycle();
        expect(concurrent).toBe(first);
        const report = await first;
        expect(report.released).toBe(true);
        expect(report.reloaded).toBe(true);
        expect(state.window.__lifecycle()).toBe(first);
        expect(state.counts().created).toBe(1);
        expect(state.counts().retired).toBe(1);
    });

    test('real retire followed by distinct live replacement is observed', async () => {
        const state = setup();
        const report = await state.window.__lifecycle();
        expect(report.held).toBe(1);
        expect(report.errors).toEqual([]);
        expect(state.old.refCount).toBe(0);
        expect(state.current()).not.toBe(state.old);
        expect(state.current().refCount).toBe(1);
        expect(state.current().isValid).toBe(true);
        expect(state.counts().stepped).toBeGreaterThanOrEqual(2);
    });

    test('zero hold never claims released or performs a reconstruction', async () => {
        const state = setup({ empty: true });
        const report = await state.window.__lifecycle();
        expect(report.released).toBe(false);
        expect(report.errors.length).toBeGreaterThan(0);
        expect(state.counts().created).toBe(0);
        expect(state.counts().retired).toBe(0);
    });

    test('refCount 9 cannot claim released even if isValid is already false', async () => {
        const state = setup({ leakedRef: true });
        const report = await state.window.__lifecycle();
        expect(report.released).toBe(false);
        expect(report.leaked).toContain('Mesh');
    });

    test('invalid replacement cannot be hidden by filtering its asset list', async () => {
        const state = setup({ invalidFresh: true });
        const report = await state.window.__lifecycle();
        expect(report.reloaded).toBe(false);
        expect(report.errors.length).toBeGreaterThan(0);
    });

    test('terminal app release rejects lifecycle and never recreates', async () => {
        const state = setup();
        state.terminal();
        await expect(state.window.__lifecycle()).rejects.toMatchObject({ code: 'SHADER_LIFECYCLE_DISPOSED' });
        expect(state.counts().created).toBe(0);
        expect(state.counts().retired).toBe(0);
        expect(state.window.__lifecycleHold()).toBe(0);
    });

    test('terminal during pending settle prevents late reconstruction', async () => {
        const state = setup();
        let resolve!: () => void;
        const pendingStep = new Promise<void>((done) => {
            resolve = done;
        });
        state.setStep(() => pendingStep);
        const pending = state.window.__lifecycle();
        state.terminal();
        resolve();
        const report = await pending;
        expect(report.reloaded).toBe(false);
        expect(report.errors.join(' ')).toContain('SHADER_LIFECYCLE_DISPOSED');
        expect(state.counts().created).toBe(0);
    });

    test('retired object cannot be revived and accepted as a fresh instance', async () => {
        const report = await setup({ reuseRetired: true }).window.__lifecycle();
        expect(report.reloaded).toBe(false);
        expect(report.errors.length).toBeGreaterThan(0);
    });

    test('retire callback must clear the current instance pointer before recreation', async () => {
        const report = await setup({ keepRetiredPointer: true }).window.__lifecycle();
        expect(report.errors.length).toBeGreaterThan(0);
    });

    test('zero refs alone do not prove release while the asset is still valid', async () => {
        const report = await setup({ validZeroRef: true }).window.__lifecycle();
        expect(report.released).toBe(false);
        expect(report.leaked).toContain('Mesh');
    });

    test('reacquire must restore every previously owned asset kind', async () => {
        const report = await setup({ incompleteFresh: true }).window.__lifecycle();
        expect(report.reloaded).toBe(false);
        expect(report.errors.length).toBeGreaterThan(0);
    });

    test('retirement trace inconsistent with actual references cannot produce an error-free report', async () => {
        const report = await setup({ falseRetirementTrace: true }).window.__lifecycle();
        expect(report.errors.length).toBeGreaterThan(0);
    });

    test('native kind and Gallery label differences cannot hide a false retirement trace', async () => {
        const report = await setup({ falseRetirementTrace: true, differentAssetName: true }).window.__lifecycle();
        expect(report.errors.length).toBeGreaterThan(0);
    });

    test('new instance wrapping the old asset cannot claim complete reacquisition', async () => {
        const report = await setup({ reuseFreshAsset: true }).window.__lifecycle();
        expect(report.reloaded).toBe(false);
        expect(report.errors.length).toBeGreaterThan(0);
    });
});
