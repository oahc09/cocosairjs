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
            const managed = [];
            const shutdownCase = ${JSON.stringify(mode.startsWith('shutdown-') ? mode : '')};
            if (shutdownCase) {
                for (let i = 0; i < (shutdownCase === 'shutdown-double-term' ? 2 : 1); i++) {
                    const executable = shutdownCase === 'shutdown-wrong-image' ? '/bin/sleep' : process.execPath;
                    const args = shutdownCase === 'shutdown-wrong-image' ? ['30'] : ['-e',
                        "process.on('SIGTERM', () => { setTimeout(() => { process.removeAllListeners('SIGTERM'); process.kill(process.pid, 'SIGTERM'); }, " +
                        (shutdownCase === 'shutdown-delayed-term' ? 500 : 100) + "); }); setInterval(() => {}, 1000); process.stdout.write('ready');"];
                    const owned = require('child_process').spawn(executable, args, {detached:true, stdio:['ignore','pipe','ignore']});
                    managed.push(owned);
                }
            }
            process.stdin.resume();
            process.stdin.on('data', () => {
                if (shutdownCase) {
                    for (const owned of managed) if (shutdownCase !== 'shutdown-residual')
                        process.kill(owned.pid, shutdownCase === 'shutdown-kill' ? 'SIGKILL' : 'SIGTERM');
                    process.exit(0);
                }
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
            ${mode === 'early-child-exit' ? 'process.exit(7);' : mode === 'missing-child-ready' ? '' : mode === 'wrong-child-ready' ? "process.stdout.write('WRONG\\n');" : "if (!shutdownCase) process.stdout.write('CPU_CHILD_READY\\n'); else if (shutdownCase === 'shutdown-wrong-image') setTimeout(() => process.stdout.write('CPU_CHILD_READY\\n'), 30); else Promise.all(managed.map(child => new Promise(resolve => child.stdout.once('data', resolve)))).then(() => process.stdout.write('CPU_CHILD_READY\\n'));"}
        `,
            ],
            { detached: true, stdio: ['pipe', 'pipe', 'pipe'] },
        );
        const closed = new Promise((resolve) => child.once('close', resolve));
        // A spawned Node process is not yet an initialized CPU browser. Keep its
        // cold startup inside the existing startup budget, not the close budget.
        await new Promise((resolve, reject) => {
            child.once('error', reject);
            child.once('exit', () => reject(Error('CPU child exited before readiness')));
            child.stdout.once('data', (chunk) => {
                if (chunk.toString() !== 'CPU_CHILD_READY\n') reject(Error('Invalid CPU child readiness'));
                else {
                    console.log(
                        JSON.stringify({
                            cpuOnly: true,
                            type: 'cpu-child-ready',
                            pid: child.pid,
                            marker: chunk.toString(),
                        }),
                    );
                    resolve();
                }
            });
        });
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
    if (mode === 'worker-nonzero' || mode === 'shutdown-application-fail') process.exitCode = 3;
})().catch((error) => {
    console.error(error.stack);
    process.exitCode = 1;
});
