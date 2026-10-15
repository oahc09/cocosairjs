'use strict';
// CPU-only protocol fixtures: real Node child processes and in-worker HTTP, never Playwright or GPU.
const hooks = require('./example-evidence-observer.cjs');
const http = require('http');
const cp = require('child_process');
const mode = process.env.EXAMPLE_EVIDENCE_CPU_CASE;
if (!mode) throw Error('CPU fixture requires supervisor CPU mode');
if (process.env.ESBUILD_WORKER_THREADS !== '0') throw Error('CPU collector compiler mode mismatch');
if (process.env.EXAMPLE_EVIDENCE_CUSTODIAN_REQUEST_FD || process.env.EXAMPLE_EVIDENCE_CUSTODIAN_RESPONSE_FD)
    throw Error('Custodian private pipe descriptors leaked into collector');
const modes = JSON.parse(process.env.EXAMPLE_EVIDENCE_MODES);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const launcher = {
    executablePath: () => process.execPath,
    async launch() {
        if (mode === 'missing-browser') return { close: async () => {} };
        const child = cp.spawn(
            process.execPath,
            [
                '-e',
                `
            process.stdin.resume();
            process.stdin.on('data', () => {
                ${
                    mode === 'double-fork-orphan'
                        ? `
                    const middle = require('child_process').spawn(process.execPath, ['-e',
                        "require('child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' }).unref(); process.stdout.write('spawned', () => process.exit(0));"],
                        { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
                    middle.stdout.once('data', () => process.exit(0));
                    return;
                `
                        : ''
                }
                ${
                    ['orphan-descendant', 'detached-orphan', 'detached-zombie'].includes(mode)
                        ? `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(
                              mode === 'double-fork-orphan'
                                  ? "require('child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' }).unref(); process.exit(0);"
                                  : mode === 'detached-zombie'
                                    ? 'process.exit(0);'
                                    : 'setInterval(() => {}, 1000)',
                          )}],
                    { detached: ${mode !== 'orphan-descendant'}, stdio: 'ignore' }).unref();`
                        : ''
                }
                process.exit(${mode === 'browser-nonzero' ? 7 : 0});
            });
            ${mode === 'forced' ? 'process.on("SIGTERM", () => {});' : ''}
        `,
            ],
            { detached: true, stdio: ['pipe', 'pipe', 'pipe'] },
        );
        const closed = new Promise((resolve) => child.once('close', resolve));
        if (mode === 'late-launch') await pause(hooks.limits.startupMs + hooks.limits.closeMs);
        return {
            async close() {
                if (mode === 'forced') return new Promise(() => {});
                child.stdin.end('close\n');
                await closed;
            },
        };
    },
};
hooks.instrumentLauncher(launcher);
class CpuRuntime {
    constructor() {
        this.viewport = { width: 480, height: 360 };
    }
    async start() {
        if (mode !== 'missing-server') {
            this.server = http.createServer((req, res) => res.end('CPU fixture, not rendering evidence'));
            await new Promise((resolve) => this.server.listen(0, '127.0.0.1', resolve));
        }
        this.browser = await launcher.launch({ executablePath: process.execPath });
        this.page = {
            evaluate: async () => ({
                frames: 2,
                clock: 'CPU_DUMMY_NOT_RENDERING',
                domReady: true,
                selectorCount: 1,
                nativeEngineFrames: null,
            }),
        };
        return {};
    }
    async stop() {
        const errors = [];
        try {
            if (this.browser) await this.browser.close();
            if (mode === 'detached-zombie') await pause(100);
        } catch (error) {
            errors.push(error);
        }
        try {
            if (this.server)
                await new Promise((resolve, reject) => {
                    this.server.close((error) => (error ? reject(error) : resolve()));
                    this.server.closeAllConnections?.();
                });
        } catch (error) {
            errors.push(error);
        }
        if (mode === 'stop-error') errors.push(Error('intentional stop failure after actual cleanup'));
        if (errors.length) throw new AggregateError(errors, 'CPU stop errors');
    }
}
hooks.instrumentRuntime(CpuRuntime);
(async () => {
    if (mode === 'worker-startup') await pause(hooks.limits.startupMs + 100);
    if (mode === 'synchronous-compiler') {
        const esbuild = require(require('path').join(process.cwd(), 'node_modules/esbuild'));
        const built = esbuild.buildSync({
            stdin: { contents: 'export const value: number = 42', loader: 'ts' },
            write: false,
            format: 'esm',
        });
        const transformed = esbuild.transformSync('const value: number = 42', { loader: 'ts' });
        if (!built.outputFiles[0].text.includes('42') || !transformed.code.includes('42'))
            throw Error('Real synchronous compiler output missing');
    }
    for (const evidenceMode of modes) {
        const runtime = new CpuRuntime();
        try {
            await runtime.start({ paths: { workspace: __dirname }, evidenceMode });
            if (mode === 'overlap') await new CpuRuntime().start({ paths: { workspace: __dirname } });
            if (mode === 'missing-ready') await pause(hooks.limits.startupMs + 100);
            if (mode === 'hang') await new Promise(() => {});
            await pause(20);
        } finally {
            await runtime.stop();
        }
    }
    if (mode === 'worker-nonzero') process.exitCode = 3;
})().catch((error) => {
    console.error(error.stack);
    process.exitCode = 1;
});
