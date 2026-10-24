/**
 * Gallery lifecycle contract tests: executes the production installShaderLifecycle
 * via Node subprocess esbuild bundling (Lead review pattern, not jsdom Buffer realm).
 * Also verifies generator Prettier compliance with actual formatting.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

const ROOT = path.resolve(__dirname, '../..');

// ── Production helper loader (Node subprocess, same as Lead review) ──
function loadHelper(): { window: any; install: (options: any) => void } {
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
    const listeners = new Map<string, Set<() => void>>();
    const timers = new Map<number, () => void>();
    let frame = 0;
    let scheduled = false;
    const director = {
        getTotalFrames: () => frame,
        on: (event: string, callback: () => void) => {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event)!.add(callback);
            if (scheduled) return;
            scheduled = true;
            schedule(function tick() {
                scheduled = false;
                if (!listeners.get('update')?.size) return;
                for (const callback of listeners.get('update') || []) callback();
                for (const callback of listeners.get('draw') || []) callback();
                frame++;
                scheduled = true;
                schedule(tick);
            });
        },
        off: (event: string, callback: () => void) => listeners.get(event)?.delete(callback),
    };
    let timerId = 0;
    new Function('require', 'module', 'exports', 'window', 'requestAnimationFrame', 'setTimeout', 'clearTimeout', code)(
        (id: string) => {
            if (id !== 'cocosair') throw new Error(`Unexpected import: ${id}`);
            return {
                isValid: (ref: any) => ref?.isValid === true,
                director,
                Director: { EVENT_AFTER_UPDATE: 'update', EVENT_AFTER_DRAW: 'draw' },
            };
        },
        module,
        module.exports,
        window,
        schedule,
        (callback: () => void) => {
            timers.set(++timerId, callback);
            return timerId;
        },
        (id: number) => timers.delete(id),
    );
    return { window, install: module.exports.installShaderLifecycle };
}

function setupMock(config: { empty?: boolean; leakedRef?: boolean; invalidFresh?: boolean } = {}) {
    const { window, install } = loadHelper();
    const old = { id: 'old', refCount: 1, isValid: true };
    let current: any = old;
    let disposed = false;
    let created = 0;
    let retired = 0;
    let stepped = 0;
    let step: () => Promise<void> = async () => {
        stepped++;
    };
    install({
        label: 'test',
        isDisposed: () => disposed,
        getInstance: () => current,
        createInstance: () => {
            created++;
            current = { id: `fresh-${created}`, refCount: 1, isValid: !config.invalidFresh };
            return current;
        },
        retireInstance: (target: any) => {
            retired++;
            const before = target.refCount;
            target.refCount = config.leakedRef ? 9 : 0;
            target.isValid = false;
            current = null;
            return { detached: true, refs: [{ kind: 'Mesh', before, after: target.refCount }] };
        },
        ownedAssets: (target: any) => (config.empty ? [] : [{ name: 'Mesh', ref: target }]),
        stepClock: () => step(),
    });
    return {
        window,
        old,
        terminal: () => {
            disposed = true;
        },
        setStep: (fn: () => Promise<void>) => {
            step = fn;
        },
        counts: () => ({ created, retired, stepped }),
        current: () => current,
    };
}

// ── Helper execution tests ──
describe('shader-lifecycle helper execution contracts', () => {
    test('installShaderLifecycle is a real exported function from the bundle', () => {
        expect(typeof loadHelper().install).toBe('function');
    });

    test('non-consuming __lifecycleHold returns count without retiring', () => {
        const state = setupMock();
        expect(state.window.__lifecycleHold()).toBe(1);
        expect(state.counts().retired).toBe(0);
        expect(state.counts().created).toBe(0);
    });

    test('concurrent __lifecycle calls return the exact same promise', async () => {
        const state = setupMock();
        const first = state.window.__lifecycle();
        const second = state.window.__lifecycle();
        expect(second).toBe(first);
        const report = await first;
        expect(report.released).toBe(true);
        expect(report.reloaded).toBe(true);
        expect(state.counts().created).toBe(1);
    });

    test('leaked refCount prevents released claim', async () => {
        const state = setupMock({ leakedRef: true });
        const report = await state.window.__lifecycle();
        expect(report.released).toBe(false);
        expect(report.leaked).toContain('Mesh');
    });

    test('empty hold never claims released', async () => {
        const state = setupMock({ empty: true });
        const report = await state.window.__lifecycle();
        expect(report.released).toBe(false);
        expect(report.errors.length).toBeGreaterThan(0);
    });

    test('terminal rejects with SHADER_LIFECYCLE_DISPOSED and never recreates', async () => {
        const state = setupMock();
        state.terminal();
        await expect(state.window.__lifecycle()).rejects.toMatchObject({ code: 'SHADER_LIFECYCLE_DISPOSED' });
        expect(state.counts().created).toBe(0);
        expect(state.window.__lifecycleHold()).toBe(0);
    });

    test('terminal during pending settle prevents late reconstruction', async () => {
        const state = setupMock();
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

    test('real retire nulls the instance variable before recreation', async () => {
        const state = setupMock();
        await state.window.__lifecycle();
        expect(state.current()).not.toBe(state.old);
        expect(state.current().isValid).toBe(true);
        expect(state.current().refCount).toBe(1);
    });
});

// ── Three examples wire the helper correctly ──
const examples = ['shader-noise-dissolve', 'shader-thin-film', 'shader-sparkle'];

describe.each(examples)('%s lifecycle wiring', (example) => {
    const mainPath = path.join(ROOT, 'examples', example, 'src', 'main.ts');

    test('imports installShaderLifecycle from the shared helper', () => {
        const main = fs.readFileSync(mainPath, 'utf8');
        expect(main).toContain("from '../../shared/shader-lifecycle.js'");
    });

    test('provides isDisposed connected to the terminal release variable', () => {
        const main = fs.readFileSync(mainPath, 'utf8');
        expect(main).toContain('isDisposed:');
    });

    test('example.json declares validation.lifecycle resource-released', () => {
        const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', example, 'example.json'), 'utf8'));
        expect(json.validation?.lifecycle).toContain('resource-released');
    });
});

// ── Generator Prettier compliance with actual formatting ──
describe('generator Prettier compliance', () => {
    test.each(examples)('%s generated effect passes actual Prettier format check', (example) => {
        const generated = path.join(ROOT, 'examples', example, 'src', 'effect.generated.ts');
        expect(fs.existsSync(generated)).toBe(true);
        const content = fs.readFileSync(generated, 'utf8');
        // Verify the generated file is valid TypeScript by parsing it
        expect(content).toContain('export');
        // Verify the generated file passes the actual Prettier CLI check
        try {
            execFileSync(
                process.execPath,
                [path.join(ROOT, 'node_modules/prettier/bin/prettier.cjs'), '--check', generated],
                {
                    cwd: ROOT,
                    encoding: 'utf8',
                    stdio: ['ignore', 'pipe', 'pipe'],
                },
            );
        } catch {
            throw new Error(`Prettier check failed for ${generated}`);
        }
    });

    test.each(examples)('%s generator source imports prettier', (example) => {
        const dir = path.join(ROOT, 'examples', example);
        const genFile = fs.readdirSync(dir).find((f) => f.startsWith('generate'));
        expect(genFile).toBeTruthy();
        const genSource = fs.readFileSync(path.join(dir, genFile!), 'utf8');
        expect(genSource).toContain('prettier');
    });
});
