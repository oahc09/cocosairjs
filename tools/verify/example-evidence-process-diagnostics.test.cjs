'use strict';
/** CPU-only diagnostics controls. Fixture children are owned and reaped by the test. */
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { once } = require('events');
const test = require('node:test');
const { snapshotOwnedProcess, MAX_CMDLINE_BYTES } = require('./example-evidence-process-diagnostics.cjs');
const expected = { pid: 321, startTicks: '42', namespace: 'pid:[1234]' };
const live = { ...expected, state: 'S', ppid: 123, pgrp: 123 };
function error(code) {
    throw Object.assign(new Error('PRIVATE_ERROR_VALUE'), { code });
}
function ioFor(options = {}) {
    let reads = 0;
    return {
        readIdentity() {
            const key = reads++ === 0 ? 'before' : 'after';
            const value = key in options ? options[key] : live;
            return typeof value === 'function' ? value() : value;
        },
        readlink: options.readlink || (() => '/private/user/token/chrome'),
        readBounded(file, maximum) {
            if (file.endsWith('/comm')) {
                assert.equal(maximum, 4096);
                return options.comm || Buffer.from('chrome\n');
            }
            assert.equal(maximum, MAX_CMDLINE_BYTES);
            return options.cmdline ? options.cmdline() : Buffer.from('/private/user/chrome\0--type=gpu-process\0');
        },
    };
}
function unknown(options) {
    const result = snapshotOwnedProcess(expected, ioFor(options));
    assert.equal(result.status, 'unknown');
    assert.equal(result.details, null);
    assert.ok(result.reasons.length);
    assert.equal(result.signalSender, 'unknown');
    assert.ok(!JSON.stringify(result).includes('PRIVATE_ERROR_VALUE'));
    assert.ok(!JSON.stringify(result).includes('PRIVATE_VALUE'));
}
test('stable identity exposes only allowed names and process-reported role', () => {
    const result = snapshotOwnedProcess(expected, ioFor());
    assert.equal(result.status, 'observed');
    assert.deepEqual(result.details, {
        executable: 'chromium',
        command: 'chromium',
        processType: 'gpu-process',
        utilitySubType: 'unknown',
        flags: {},
    });
    assert.equal(result.purpose, 'diagnostic-only');
    assert.equal(result.signalSender, 'unknown');
    assert.ok(!JSON.stringify(result).includes('/private/'));
});
for (const [name, options] of [
    ['missing initial identity', { before: null }],
    ['identity read denied', { before: () => error('EPERM') }],
    ['PID reused before read', { before: { ...live, startTicks: '43' } }],
    ['PID reused during read', { after: { ...live, startTicks: '43' } }],
    ['namespace changed', { after: { ...live, namespace: 'pid:[5678]' } }],
    ['vanished during read', { after: null }],
    ['after identity permission denied', { after: () => error('EACCES') }],
    ['already zombie', { before: { ...live, state: 'Z' } }],
    ['became zombie', { after: { ...live, state: 'Z' } }],
    ['missing executable', { readlink: () => error('ENOENT') }],
    ['permission denied executable', { readlink: () => error('EACCES') }],
    ['permission denied cmdline', { cmdline: () => error('EPERM') }],
    ['empty cmdline', { cmdline: () => Buffer.alloc(0) }],
    ['oversized cmdline', { cmdline: () => Buffer.alloc(MAX_CMDLINE_BYTES + 1, 0) }],
    ['missing terminating NUL', { cmdline: () => Buffer.from('chrome\0--type=gpu-process') }],
    ['empty argv zero', { cmdline: () => Buffer.from('\0--type=gpu-process\0') }],
    ['invalid utf8', { cmdline: () => Buffer.from([255, 0]) }],
    ['split type flag', { cmdline: () => Buffer.from('chrome\0--type\0gpu-process\0') }],
    ['multiple conflicting types', { cmdline: () => Buffer.from('chrome\0--type=renderer\0--type=gpu-process\0') }],
    ['unsafe type', { cmdline: () => Buffer.from('chrome\0--type=PRIVATE_VALUE\0') }],
    [
        'unsafe utility type',
        { cmdline: () => Buffer.from('chrome\0--type=utility\0--utility-sub-type=PRIVATE_VALUE\0') },
    ],
    [
        'utility subtype in wrong role',
        { cmdline: () => Buffer.from('chrome\0--type=renderer\0--utility-sub-type=network.mojom.NetworkService\0') },
    ],
    [
        'duplicate utility subtype',
        {
            cmdline: () =>
                Buffer.from(
                    'chrome\0--type=utility\0--utility-sub-type=network.mojom.NetworkService\0--utility-sub-type=audio.mojom.AudioService\0',
                ),
        },
    ],
    ['conflicting fixed flag', { cmdline: () => Buffer.from('chrome\0--use-angle=swiftshader\0--use-angle=vulkan\0') }],
    ['duplicated same fixed flag', { cmdline: () => Buffer.from('chrome\0--use-gl=angle\0--use-gl=angle\0') }],
    ['mixed headless forms', { cmdline: () => Buffer.from('chrome\0--headless\0--headless=new\0') }],
    ['secret fixed flag value', { cmdline: () => Buffer.from('chrome\0--use-angle=https://PRIVATE_VALUE\0') }],
])
    test(`${name} stays unknown without raw data`, () => unknown(options));
test('safe allowlisted flags and utility subtype survive without raw argv or paths', () => {
    const result = snapshotOwnedProcess(
        expected,
        ioFor({
            cmdline: () =>
                Buffer.from(
                    'PRIVATE_ARGV_ZERO\0--type=utility\0--utility-sub-type=network.mojom.NetworkService\0--use-angle=swiftshader\0--no-sandbox\0--headless=new\0--token=PRIVATE_VALUE\0',
                ),
        }),
    );
    assert.equal(result.status, 'observed');
    assert.equal(result.details.utilitySubType, 'network.mojom.NetworkService');
    assert.deepEqual(result.details.flags, { noSandbox: true, useAngle: 'swiftshader', headlessMode: 'new' });
    assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
});
for (const executable of ['SECRET_EXECUTABLE', 'node', 'python3']) {
    test(`non-Chromium executable ${executable} cannot claim Chrome roles or flags`, () => {
        const result = snapshotOwnedProcess(
            expected,
            ioFor({
                comm: Buffer.from('SECRET_COMM\n'),
                readlink: () => `/private/${executable}`,
                cmdline: () =>
                    Buffer.from(
                        'SECRET_ARGV_ZERO\0--type=utility\0--utility-sub-type=network.mojom.NetworkService\0--use-angle=swiftshader\0--no-sandbox\0https://example.invalid/SECRET_URL\0--token=SECRET_TOKEN\0--user-data-dir=SECRET_PROFILE\0',
                    ),
            }),
        );
        assert.equal(result.status, 'observed');
        assert.equal(
            result.details.executable,
            executable === 'node' ? 'node' : executable === 'python3' ? 'python' : 'unknown',
        );
        assert.equal(result.details.command, 'unknown');
        assert.equal(result.details.processType, 'unknown');
        assert.equal(result.details.utilitySubType, 'unknown');
        assert.deepEqual(result.details.flags, {});
        assert.ok(!JSON.stringify(result).includes('SECRET_'));
        assert.ok(!/argv|sha256|hash|executablePath|cmdline/.test(JSON.stringify(result)));
    });
}
test('unknown option keys, misleading substrings and NUL-separated data cannot become flags', () => {
    const result = snapshotOwnedProcess(
        expected,
        ioFor({
            cmdline: () =>
                Buffer.from(
                    'chrome\0--PRIVATE_KEY=--type=utility\0https://PRIVATE_URL/?--use-gl=angle\0--no-sandbox=PRIVATE_VALUE\0--not-use-angle=swiftshader\0\0',
                ),
        }),
    );
    assert.equal(result.status, 'observed');
    assert.equal(result.details.processType, 'browser');
    assert.deepEqual(result.details.flags, {});
    assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
});
test('invalid expected identity does not echo untrusted strings', () => {
    const result = snapshotOwnedProcess({ pid: 321, startTicks: 'SECRET', namespace: 'SECRET' }, ioFor());
    assert.equal(result.status, 'unknown');
    assert.equal(result.identity, null);
    assert.ok(!JSON.stringify(result).includes('SECRET'));
});
test(
    'real alive child becomes a zombie and is reaped, while signal sender stays unknown',
    { timeout: 10000 },
    async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'example-process-diagnostic-'));
        const control = path.join(directory, 'control');
        const phase = path.join(directory, 'phase');
        const source = `
import json, os, pathlib, signal, subprocess, sys, time
control, phase = map(pathlib.Path, sys.argv[1:])
child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)', '--type=gpu-process'])
phase.write_text(json.dumps({'pid': child.pid, 'phase': 'alive'}))
try:
    deadline = time.monotonic() + 8
    while not control.exists() and time.monotonic() < deadline: time.sleep(.005)
    if not control.exists(): raise RuntimeError('control deadline')
    os.kill(child.pid, signal.SIGTERM)
    while time.monotonic() < deadline:
        raw = pathlib.Path(f'/proc/{child.pid}/stat').read_text()
        if raw[raw.rfind(')') + 2:].split()[0] == 'Z': break
        time.sleep(.001)
    else: raise RuntimeError('zombie deadline')
    phase.write_text(json.dumps({'pid': child.pid, 'phase': 'zombie'}))
    while control.read_text() != 'reap' and time.monotonic() < deadline: time.sleep(.005)
    if control.read_text() != 'reap': raise RuntimeError('reap deadline')
    pid, status = os.waitpid(child.pid, 0)
    child.returncode = os.waitstatus_to_exitcode(status)
    phase.write_text(json.dumps({'pid': pid, 'phase': 'reaped', 'rawStatus': status}))
finally:
    if child.returncode is None:
        child.kill()
        child.wait()
`;
        const fixture = spawn('python3', ['-c', source, control, phase], { stdio: ['ignore', 'ignore', 'pipe'] });
        const closed = once(fixture, 'close');
        let stderr = '';
        fixture.stderr.on('data', (value) => {
            stderr += value;
        });
        const waitFor = async (name) => {
            const until = Date.now() + 5000;
            while (Date.now() < until) {
                try {
                    const value = JSON.parse(fs.readFileSync(phase, 'utf8'));
                    if (value.phase === name) return value;
                } catch {}
                await new Promise((resolve) => setTimeout(resolve, 5));
            }
            throw Error(`Fixture phase missing: ${name}`);
        };
        try {
            const { pid } = await waitFor('alive');
            const raw = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
            const fields = raw.slice(raw.lastIndexOf(')') + 2).split(' ');
            const row = { pid, startTicks: fields[19], namespace: fs.readlinkSync(`/proc/${pid}/ns/pid`) };
            const aliveSnapshot = snapshotOwnedProcess(row);
            assert.equal(aliveSnapshot.status, 'observed');
            assert.equal(aliveSnapshot.details.executable, 'python');
            assert.equal(aliveSnapshot.details.processType, 'unknown');
            fs.writeFileSync(control, 'stop');
            await waitFor('zombie');
            assert.equal(fs.readFileSync(`/proc/${pid}/cmdline`).length, 0);
            const zombieSnapshot = snapshotOwnedProcess(row);
            assert.equal(zombieSnapshot.status, 'unknown');
            assert.equal(zombieSnapshot.details, null);
            assert.equal(zombieSnapshot.before.state, 'Z');
            assert.ok(zombieSnapshot.reasons.includes('not-alive-before-read'));
            assert.equal(zombieSnapshot.signalSender, 'unknown');
            fs.writeFileSync(control, 'reap');
            const reaped = await waitFor('reaped');
            assert.equal(reaped.rawStatus, 15);
            const absentSnapshot = snapshotOwnedProcess(row);
            assert.equal(absentSnapshot.status, 'unknown');
            assert.equal(absentSnapshot.details, null);
            const [code, signal] = await closed;
            assert.equal(code, 0, stderr);
            assert.equal(signal, null);
        } finally {
            // The fixture owns and reaps its child, including on failed assertions or cancellation.
            fs.writeFileSync(control, 'reap');
            await closed;
            fs.rmSync(directory, { recursive: true, force: true });
        }
    },
);
