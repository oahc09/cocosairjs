/* Independent Windows Graphics Capture bridge. Only the runner may select a spawned target PID. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { PNG } = require('pngjs');
const { SCENE_KINDS } = require('./scene-contract.cjs');
const { verifyScenePresentation } = require('./scene-oracles.cjs');

const CAPTURE_TIMEOUT_MS = 10_000;
const BODY_LIMIT = 4096;
const SCENES = new Set(SCENE_KINDS);
const KINDS = new Set(['probes', 'air', ...SCENE_KINDS]);

async function boundedCapture(operation) {
    let timer;
    try {
        return await Promise.race([
            operation,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(Error('Independent capture operation exceeded 15 seconds')), 15_000);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function executableIdentity(executable) {
    const stat = fs.statSync(executable);
    if (!stat.isFile()) throw Error('Capture executable must be a regular file');
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(executable)) hash.update(chunk);
    return { name: path.basename(executable), size: stat.size, sha256: hash.digest('hex') };
}

function runCapture(executable, pid, filename, out, kind, phase) {
    return new Promise((resolve) => {
        const label = `native-${kind}${phase ? `-${phase}` : ''}`;
        const stdout = `${label}.capture.stdout.log`;
        const stderr = `${label}.capture.stderr.log`;
        let stdoutFd, stderrFd;
        try {
            stdoutFd = fs.openSync(path.join(out, stdout), 'wx');
            stderrFd = fs.openSync(path.join(out, stderr), 'wx');
        } catch (error) {
            if (stdoutFd !== undefined) fs.closeSync(stdoutFd);
            throw error;
        }
        const result = {
            kind,
            ...(phase ? { phase } : {}),
            pid,
            file: path.basename(filename),
            stdout,
            stderr,
            timeoutMs: CAPTURE_TIMEOUT_MS,
            timedOut: false,
            exit: { observed: false },
            close: { observed: false },
            errors: [],
        };
        let child,
            timer,
            closeTimer,
            finished = false;
        const chunks = [];
        let bytes = 0;
        function finish() {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            clearTimeout(closeTimer);
            fs.closeSync(stdoutFd);
            fs.closeSync(stderrFd);
            try {
                if (bytes > 65536) throw Error('Capture helper stdout exceeded 64 KiB; raw output retained');
                const lines = Buffer.concat(chunks).toString('utf8').trim().split(/\r?\n/);
                if (lines.length !== 1 || !lines[0]) throw Error('Capture helper must print exactly one JSON line');
                result.metadata = JSON.parse(lines[0]);
            } catch (error) {
                result.errors.push(error.message);
            }
            resolve(result);
        }
        try {
            child = spawn(executable, ['--pid', String(pid), '--out', filename], {
                windowsHide: true,
                shell: false,
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            result.helperPid = child.pid ?? null;
            child.stdout.on('data', (chunk) => {
                if (finished) return;
                fs.writeSync(stdoutFd, chunk);
                bytes += chunk.length;
                if (bytes <= 65536) chunks.push(chunk);
            });
            child.stderr.on('data', (chunk) => {
                if (!finished) fs.writeSync(stderrFd, chunk);
            });
            child.on('error', (error) => result.errors.push(`Capture process error: ${error.message}`));
            child.stdout.on('error', (error) => result.errors.push(`Capture stdout error: ${error.message}`));
            child.stderr.on('error', (error) => result.errors.push(`Capture stderr error: ${error.message}`));
            child.on('exit', (code, signal) => {
                result.exit = { observed: true, code, signal };
            });
            child.on('close', (code, signal) => {
                result.close = { observed: true, code, signal };
                finish();
            });
            timer = setTimeout(() => {
                result.timedOut = true;
                result.errors.push('Capture helper exceeded the 10-second deadline');
                result.killRequested = child.kill('SIGKILL');
                closeTimer = setTimeout(() => {
                    result.errors.push('Capture helper physical close was not observed after termination');
                    child.stdout.destroy();
                    child.stderr.destroy();
                    child.unref();
                    finish();
                }, 1000);
            }, CAPTURE_TIMEOUT_MS);
        } catch (error) {
            result.errors.push(`Could not start capture helper: ${error.message}`);
            finish();
        }
    });
}

async function createNativePresentation({ captureExecutable, out, verifyPresentation }) {
    if (process.platform !== 'win32') throw Error('Windows Graphics Capture requires a Win32 runner');
    if (typeof verifyPresentation !== 'function') throw Error('Independent PNG pixel verification is required');
    const executable = path.resolve(captureExecutable);
    const identity = await executableIdentity(executable);
    const root = path.resolve(__dirname, '../../..');
    const receiptPath = path.resolve(path.dirname(executable), '../capture-build.json');
    const receiptBytes = fs.readFileSync(receiptPath);
    const receipt = JSON.parse(receiptBytes);
    if (
        receipt.schema !== 'air-runtime-capture-build-v1' ||
        receipt.completed !== true ||
        receipt.pass !== true ||
        receipt.executable?.sha256 !== identity.sha256 ||
        receipt.executable.bytes !== identity.size ||
        path.resolve(root, receipt.executable.path) !== executable
    )
        throw Error('Capture build receipt does not bind this helper executable');
    for (const file of [
        'tools/verify/runtime-interop/capture/CMakeLists.txt',
        'tools/verify/runtime-interop/capture/capture.cpp',
    ]) {
        const hash = crypto
            .createHash('sha256')
            .update(fs.readFileSync(path.join(root, file)))
            .digest('hex');
        if (receipt.sources?.[file] !== hash || receipt.sourcesAfter?.[file] !== hash)
            throw Error(`Capture helper requires a fresh build for ${file}`);
    }
    const buildReceipt = {
        file: path.relative(root, receiptPath).replace(/\\/g, '/'),
        sha256: crypto.createHash('sha256').update(receiptBytes).digest('hex'),
        sources: receipt.sources,
    };
    const token = crypto.randomBytes(32).toString('hex');
    const report = { channel: 'windows-graphics-capture', identity, buildReceipt, captures: [], rejections: [] };
    const seen = new Set();
    const pending = new Set();
    const sockets = new Set();
    let target,
        closing = false;
    function reject(response, code, message) {
        if (report.rejections.length < 32) report.rejections.push({ code, message });
        response.writeHead(code, { 'Content-Type': 'application/json', Connection: 'close' });
        response.end(JSON.stringify({ pass: false, status: 'FAIL', error: message }));
    }
    function successfulBefore(selected) {
        const records = report.captures.filter(
            (record) => record.kind === selected.kind && record.pid === selected.pid && record.phase === 'before',
        );
        const before = records.length === 1 ? records[0] : null;
        if (!before || before.verification?.pass !== true || !before.sha256)
            throw Error('Scene after capture requires one successful before capture from this target');
        return before;
    }
    function readPrevious(before) {
        const filename = path.resolve(out, before.file);
        const stat = fs.lstatSync(filename);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024)
            throw Error('Before capture must remain a bounded regular PNG file');
        const bytes = fs.readFileSync(filename);
        const hash = crypto.createHash('sha256').update(bytes).digest('hex');
        if (hash !== before.sha256 || hash !== before.verification.sha256)
            throw Error('Before capture PNG changed after its original verification');
        return bytes;
    }
    async function capture(selected, phase) {
        const previous = phase === 'after' ? successfulBefore(selected) : null;
        if (previous) readPrevious(previous);
        const label = `native-${selected.kind}${phase ? `-${phase}` : ''}`;
        const filename = path.resolve(out, `${label}-presentation.png`);
        if (fs.existsSync(filename)) throw Error('Capture PNG must identify a new file');
        if ((await executableIdentity(executable)).sha256 !== identity.sha256)
            throw Error('Capture executable changed before execution');
        const result = await runCapture(executable, selected.pid, filename, out, selected.kind, phase);
        report.captures.push(result);
        if (
            result.timedOut ||
            result.errors.length ||
            !result.exit.observed ||
            !result.close.observed ||
            result.exit.code !== 0 ||
            result.close.code !== 0 ||
            result.exit.signal ||
            result.close.signal
        )
            throw Error(`Capture helper failed: ${result.errors.join('; ') || 'exit/close was not clean'}`);
        if ((await executableIdentity(executable)).sha256 !== identity.sha256)
            throw Error('Capture executable changed during execution');
        if (target !== selected || closing) throw Error('Native target closed before capture completed');
        const metadata = result.metadata;
        if (
            metadata?.channel !== 'windows-graphics-capture' ||
            metadata.pid !== selected.pid ||
            typeof metadata.hwnd !== 'string' ||
            !/^0x[0-9a-f]+$/i.test(metadata.hwnd) ||
            BigInt(metadata.hwnd) === 0n ||
            typeof metadata.file !== 'string' ||
            !path.isAbsolute(metadata.file) ||
            path.resolve(metadata.file) !== filename ||
            !Number.isInteger(metadata.width) ||
            !Number.isInteger(metadata.height) ||
            metadata.width < 16 ||
            metadata.height < 16 ||
            metadata.width * metadata.height > 64 * 1024 * 1024
        )
            throw Error('Capture helper metadata does not match the runner-owned target and output');
        if (previous && previous.metadata.hwnd !== metadata.hwnd)
            throw Error('Scene after capture belongs to a different window than its before capture');
        const stat = fs.lstatSync(filename);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024)
            throw Error('Capture output must be a bounded regular PNG file');
        const bytes = fs.readFileSync(filename);
        if (
            bytes.length < 24 ||
            !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
            bytes.readUInt32BE(16) !== metadata.width ||
            bytes.readUInt32BE(20) !== metadata.height
        )
            throw Error('Capture PNG header disagrees with helper metadata');
        const png = PNG.sync.read(bytes);
        if (png.width !== metadata.width || png.height !== metadata.height)
            throw Error('Capture PNG dimensions disagree with helper metadata');
        result.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
        const previousBytes = previous ? readPrevious(previous) : undefined;
        const verified = SCENES.has(selected.kind)
            ? verifyScenePresentation(bytes, selected.kind, { phase, previousBytes })
            : await verifyPresentation(bytes, selected.kind);
        if (typeof verified?.pass !== 'boolean' || verified.status !== (verified.pass ? 'PASS' : 'FAIL'))
            throw Error('Independent PNG verifier returned an invalid result');
        if (verified.sha256 !== result.sha256) throw Error('Independent PNG verifier did not bind the captured bytes');
        result.verification = verified;
        if (previous) {
            result.previous = {
                file: previous.file,
                sha256: previous.sha256,
                pid: previous.pid,
                hwnd: previous.metadata.hwnd,
            };
        }
        return {
            ...verified,
            ...(phase ? { phase } : {}),
            ...(result.previous ? { previous: result.previous } : {}),
            sha256: result.sha256,
            channel: 'windows-graphics-capture',
            file: path.basename(filename),
            pid: selected.pid,
            hwnd: metadata.hwnd,
            identity,
            rawArtifacts: { stdout: result.stdout, stderr: result.stderr, png: result.file },
        };
    }
    const server = http.createServer(async (request, response) => {
        if (request.method !== 'POST' || request.url !== '/capture')
            return reject(response, 404, 'Unknown capture endpoint');
        request.setTimeout(2000, () => request.destroy());
        let body = '';
        try {
            for await (const chunk of request) {
                if (Buffer.byteLength(body) + chunk.length > BODY_LIMIT)
                    return reject(response, 413, 'Capture request exceeded the body limit');
                body += chunk.toString('utf8');
            }
            request.setTimeout(0);
            const message = JSON.parse(body);
            const scene = SCENES.has(message?.kind);
            if (
                !message ||
                typeof message !== 'object' ||
                Object.keys(message).sort().join(',') !== (scene ? 'kind,phase,token' : 'kind,token') ||
                message.token !== token ||
                (scene && !['before', 'after'].includes(message.phase))
            )
                return reject(response, 403, 'Capture token or request shape is invalid');
            if (closing || !target || message.kind !== target.kind)
                return reject(response, 409, 'No matching active native target');
            const phase = scene ? message.phase : undefined;
            const slot = phase || 'legacy';
            if (target.consumed.has(slot)) return reject(response, 409, 'Native target capture was already requested');
            if (phase === 'after') {
                try {
                    successfulBefore(target);
                } catch (error) {
                    return reject(response, 409, error.message);
                }
            }
            target.consumed.add(slot);
            const operation = boundedCapture(capture(target, phase));
            pending.add(operation);
            try {
                const value = await operation;
                response.writeHead(200, { 'Content-Type': 'application/json', Connection: 'close' });
                response.end(JSON.stringify(value));
            } finally {
                pending.delete(operation);
            }
        } catch (error) {
            if (!response.headersSent) reject(response, 500, error.message);
            else response.destroy();
        }
    });
    server.on('connection', (socket) => {
        sockets.add(socket);
        socket.once('close', () => sockets.delete(socket));
    });
    await new Promise((resolve, rejectListen) => {
        server.once('error', rejectListen);
        server.listen(0, '127.0.0.1', resolve);
    });
    return {
        url: `http://127.0.0.1:${server.address().port}/capture`,
        token,
        report,
        setTarget(pid, kind) {
            if (closing || target || !Number.isInteger(pid) || pid <= 0 || !KINDS.has(kind) || seen.has(kind))
                throw Error('Capture target must be a new runner-owned child process');
            seen.add(kind);
            target = { pid, kind, consumed: new Set() };
        },
        clearTarget(pid) {
            if (target?.pid === pid) target = undefined;
        },
        async close() {
            closing = true;
            target = undefined;
            await Promise.allSettled([...pending]);
            const closed = new Promise((resolve) => server.close(resolve));
            for (const socket of sockets) socket.destroy();
            await closed;
        },
    };
}

module.exports = { createNativePresentation };
