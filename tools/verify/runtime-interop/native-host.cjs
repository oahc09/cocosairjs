/* Run the shared Web API probes in an external runtime without changing that runtime. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const { createNativePresentation } = require('./native-presentation.cjs');
const { SCENE_KINDS, matrixPassed } = require('./scene-contract.cjs');

const CASE_IDS = ['canvas-dom-events', 'module-assets', 'wasm-shader', 'gpu-submit-present', 'gpu-errors-loss'];
const STATUSES = new Set(['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN']);
const TIMEOUT_MS = 90_000;

async function buildEntry(root, filename, kind, options, capture) {
    const smoke = kind === 'air';
    const scene = SCENE_KINDS.includes(kind);
    const marker = scene
        ? 'AIR_RUNTIME_INTEROP_SCENE'
        : smoke
          ? 'AIR_RUNTIME_INTEROP_SMOKE'
          : 'AIR_RUNTIME_INTEROP_RESULT';
    const name = scene ? 'runSceneScenario' : smoke ? 'runAirSmoke' : 'runRuntimeInterop';
    const moduleName = scene ? 'scene-runner.mjs' : smoke ? 'air-smoke.mjs' : 'probes.mjs';
    const failure =
        scene || smoke
            ? { id: scene ? kind : 'air-webgpu-smoke', status: 'FAIL', observations: {} }
            : { schema: 'air-runtime-interop-probes-v1', completed: false, cases: [], pass: false };
    const contents = `import { ${name} } from './${moduleName}';
(async () => {
    let result;
    try {
        result = await ${name}({ ...${JSON.stringify(options)},
            ${
                capture
                    ? `capturePresentation: async ({phase} = {}) => {
                const response = await fetch(${JSON.stringify(capture.url)}, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...${JSON.stringify({ token: capture?.token, kind })}, ...(phase === undefined ? {} : {phase}) }) });
                const evidence = await response.json();
                if (!response.ok) throw new Error(evidence.error || 'Independent capture failed');
                return evidence;
            },`
                    : ''
            }
            canvas: globalThis.canvas ?? globalThis.document?.querySelector?.('canvas') });
    } catch (error) {
        result = { ...${JSON.stringify(failure)}, error: {
            name: String(error?.name ?? 'Error'), message: String(error?.message ?? error) } };
    }
    console.log('${marker} ' + JSON.stringify(result));
    if (typeof globalThis.process?.exit === 'function') {
        globalThis.process.exit(${smoke || scene ? "result.status === 'PASS'" : 'result.pass === true'} ? 0 : 1);
    }
})();`;
    const result = await require('esbuild').build({
        stdin: {
            contents,
            resolveDir: path.join(root, 'tools/verify/runtime-interop'),
            sourcefile: 'native-entry.mjs',
        },
        write: false,
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: 'es2022',
        logLevel: 'silent',
    });
    fs.writeFileSync(filename, result.outputFiles[0].contents);
    return marker;
}

function runProcess(executable, entry, out, kind, marker, { headed, capture } = {}) {
    return new Promise((resolve) => {
        const stdoutPath = path.join(out, `native-${kind}.stdout.log`);
        const stderrPath = path.join(out, `native-${kind}.stderr.log`);
        const stdoutFd = fs.openSync(stdoutPath, 'w');
        const stderrFd = fs.openSync(stderrPath, 'w');
        const report = {
            kind,
            entry: path.basename(entry),
            stdout: path.basename(stdoutPath),
            stderr: path.basename(stderrPath),
            timeoutMs: TIMEOUT_MS,
            startedAt: new Date().toISOString(),
            timedOut: false,
            exit: { observed: false },
            close: { observed: false },
            errors: [],
            consoleErrors: [],
        };
        const decoder = new StringDecoder('utf8');
        const results = [];
        let pending = '';
        let finished = false;
        let timer;
        let closeTimer;
        let child;
        function line(value) {
            if (/^\[error\]\s/.test(value) && report.consoleErrors.length < 32) report.consoleErrors.push(value);
            const match = value.replace(/\r$/, '').match(new RegExp(`^(?:\\[log\\]\\s*)?${marker} (.*)$`));
            if (!match) return;
            try {
                results.push(JSON.parse(match[1]));
            } catch (error) {
                report.errors.push(`Malformed result JSON: ${error.message}`);
            }
        }
        function consume(chunk) {
            pending += chunk;
            let end;
            while ((end = pending.indexOf('\n')) !== -1) {
                line(pending.slice(0, end));
                pending = pending.slice(end + 1);
            }
            if (pending.length > 4 * 1024 * 1024) {
                report.errors.push('Unterminated stdout line exceeded 4 MiB; raw output retained');
                pending = '';
            }
        }
        function finish() {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            clearTimeout(closeTimer);
            consume(decoder.end());
            if (pending) line(pending);
            fs.closeSync(stdoutFd);
            fs.closeSync(stderrFd);
            capture?.clearTarget(child?.pid);
            if (results.length !== 1) report.errors.push(`Expected one result marker, received ${results.length}`);
            report.result = results.length === 1 ? results[0] : null;
            report.endedAt = new Date().toISOString();
            resolve(report);
        }
        try {
            const args = ['run', entry, ...(headed ? [] : ['--headless']), '--width', '320', '--height', '240'];
            report.arguments = args.map((value) => (value === entry ? path.basename(entry) : value));
            child = spawn(executable, args, {
                cwd: path.dirname(entry),
                windowsHide: !headed,
                shell: false,
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            report.pid = child.pid ?? null;
            child.on('spawn', () => {
                try {
                    capture?.setTarget(child.pid, kind);
                    report.captureTargetRegistered = !!capture;
                } catch (error) {
                    report.errors.push(`Capture target registration failed: ${error.message}`);
                    report.killRequested = child.kill('SIGKILL');
                }
            });
            child.stdout.on('data', (chunk) => {
                if (!finished) {
                    fs.writeSync(stdoutFd, chunk);
                    consume(decoder.write(chunk));
                }
            });
            child.stderr.on('data', (chunk) => {
                if (!finished) fs.writeSync(stderrFd, chunk);
            });
            child.on('error', (error) => report.errors.push(`Spawn/process error: ${error.message}`));
            child.stdout.on('error', (error) => report.errors.push(`stdout error: ${error.message}`));
            child.stderr.on('error', (error) => report.errors.push(`stderr error: ${error.message}`));
            child.on('exit', (code, signal) => {
                report.exit = { observed: true, code, signal, at: new Date().toISOString() };
            });
            child.on('close', (code, signal) => {
                report.close = { observed: true, code, signal, at: new Date().toISOString() };
                finish();
            });
            timer = setTimeout(() => {
                report.timedOut = true;
                report.errors.push(`Native process exceeded ${TIMEOUT_MS} ms`);
                report.killRequested = child.kill('SIGKILL');
                closeTimer = setTimeout(() => {
                    report.errors.push('Native process close was not observed within the 5-second shutdown budget');
                    child.stdout.destroy();
                    child.stderr.destroy();
                    child.unref();
                    finish();
                }, 5_000);
            }, TIMEOUT_MS);
        } catch (error) {
            report.errors.push(`Could not start native process: ${error.message}`);
            finish();
        }
    });
}

function validProbes(value) {
    if (value?.schema !== 'air-runtime-interop-probes-v1' || value.completed !== true) return false;
    if (!Array.isArray(value.cases) || value.cases.length !== CASE_IDS.length) return false;
    const ids = new Set(value.cases.map((item) => item.id));
    return (
        CASE_IDS.every((id) => ids.has(id)) &&
        value.cases.every(
            (item) => STATUSES.has(item.status) && item.observations && typeof item.observations === 'object',
        ) &&
        typeof value.pass === 'boolean' &&
        value.pass === value.cases.every((item) => item.status === 'PASS')
    );
}

async function runNative({
    executable,
    root,
    out,
    origin,
    assetBaseUrl,
    moduleUrl,
    bundleUrl,
    captureExecutable,
    headed = false,
    verifyPresentation,
    matrix = false,
}) {
    const result = {
        probes: null,
        air: null,
        processes: [],
        completed: false,
        pass: false,
        errors: [],
        identity: null,
        capture: null,
    };
    let capture;
    try {
        if (captureExecutable && (!headed || process.platform !== 'win32'))
            throw new Error('Independent Windows capture requires --headed on a Win32 runner');
        fs.mkdirSync(out, { recursive: true });
        const stat = fs.statSync(executable);
        if (!stat.isFile()) throw new Error('Native executable must be a regular file');
        const hash = crypto.createHash('sha256');
        for await (const chunk of fs.createReadStream(executable)) hash.update(chunk);
        result.identity = {
            name: path.basename(executable),
            size: stat.size,
            sha256: hash.digest('hex'),
            version: null,
        };
        if (captureExecutable) {
            capture = await createNativePresentation({ captureExecutable, out, verifyPresentation });
            result.capture = capture.report;
        }
        for (const kind of ['probes', 'air', ...(matrix ? SCENE_KINDS : [])]) {
            const entry = path.resolve(out, kind === 'probes' ? 'native-entry.js' : `native-${kind}-entry.js`);
            try {
                const scene = SCENE_KINDS.includes(kind);
                const options =
                    kind === 'probes'
                        ? { assetBaseUrl, moduleUrl }
                        : scene
                          ? { id: kind.slice(6), bundleUrl, assetRootUrl: `${origin}/assets/` }
                          : { bundleUrl };
                for (const url of Object.entries(options)
                    .filter(([key]) => key !== 'id')
                    .map(([, value]) => value)) {
                    if (!url || new URL(url).origin !== new URL(origin).origin) {
                        throw new Error('Native probe assets must use the runner origin');
                    }
                }
                const marker = await buildEntry(root, entry, kind, options, capture);
                const processReport = await runProcess(executable, entry, out, kind, marker, { headed, capture });
                result.processes.push(processReport);
                result[kind] = processReport.result;
                result.errors.push(...processReport.errors.map((message) => `${kind}: ${message}`));
            } catch (error) {
                result.errors.push(`${kind}: ${error.message}`);
            }
        }
        if (!validProbes(result.probes)) result.errors.push('Native probes result is incomplete or invalid');
        if (
            result.air?.id !== 'air-webgpu-smoke' ||
            !['PASS', 'FAIL', 'NOT_RUN'].includes(result.air.status) ||
            !result.air.observations ||
            typeof result.air.observations !== 'object'
        ) {
            result.errors.push('Native AIR smoke result is incomplete or invalid');
        }
        const submitted = result.probes?.cases?.find((item) => item.id === 'gpu-submit-present');
        function verifiedCapture(kind, presentation, phase) {
            const records =
                capture?.report.captures.filter((item) => item.kind === kind && (!phase || item.phase === phase)) || [];
            const evidence = records.length === 1 ? records[0] : null;
            return (
                evidence?.verification?.pass === true &&
                presentation?.pass === true &&
                presentation.channel === 'windows-graphics-capture' &&
                presentation.pid === evidence.pid &&
                presentation.hwnd === evidence.metadata.hwnd &&
                presentation.file === evidence.file &&
                presentation.sha256 === evidence.verification.sha256
            );
        }
        if (submitted?.status === 'PASS' && !verifiedCapture('probes', submitted.observations.presentation))
            result.errors.push('Native probe presentation PASS lacks matching independent Windows capture');
        if (result.air?.status === 'PASS' && !verifiedCapture('air', result.air.observations.presentation))
            result.errors.push('Native AIR presentation PASS lacks matching independent Windows capture');
        if (matrix)
            for (const kind of SCENE_KINDS) {
                const row = result[kind];
                if (row?.id !== kind || !['PASS', 'FAIL', 'NOT_RUN'].includes(row.status) || !row.observations)
                    result.errors.push(`Native ${kind} result is incomplete or invalid`);
                if (
                    row?.status === 'PASS' &&
                    !['before', 'after'].every((phase) =>
                        verifiedCapture(kind, row.observations.presentation[phase], phase),
                    )
                )
                    result.errors.push(`Native ${kind} lacks independent before/after capture bindings`);
            }
    } catch (error) {
        result.errors.push(error.message);
    } finally {
        try {
            await capture?.close();
        } catch (error) {
            result.errors.push(`Capture bridge close failed: ${error.message}`);
        }
    }
    result.completed =
        result.errors.length === 0 &&
        result.processes.length === (matrix ? 6 : 2) &&
        result.processes.every(
            (item) =>
                !item.timedOut && item.exit.observed && item.close.observed && !item.exit.signal && !item.close.signal,
        );
    result.pass =
        result.completed &&
        !!capture &&
        result.probes?.pass === true &&
        result.air?.status === 'PASS' &&
        (!matrix || matrixPassed(result)) &&
        result.processes.every(
            (item) => item.exit.code === 0 && item.close.code === 0 && item.consoleErrors.length === 0,
        );
    return result;
}

module.exports = { runNative };
