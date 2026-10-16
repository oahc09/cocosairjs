'use strict';
/**
 * Privacy-bounded Linux process hints. Never an admission or custody predicate.
 * Names/roles are process-reported hints, not authenticated executable identities.
 * No raw argv, paths, arbitrary names, error text, or hashes of those values leave this module.
 */
const fs = require('fs');
const path = require('path');
const { TextDecoder } = require('util');
const MAX_CMDLINE_BYTES = 64 * 1024;
const MAX_TEXT_BYTES = 4096;
const STATES = new Set(['R', 'S', 'D', 'Z', 'T', 't', 'X', 'x', 'K', 'W', 'P', 'I']);
const DEAD_STATES = new Set(['Z', 'X', 'x']);
const NAMES = new Map([
    ['chrome', 'chromium'],
    ['chromium', 'chromium'],
    ['chromium-browser', 'chromium'],
    ['chrome-headless-shell', 'chromium-headless-shell'],
    ['chrome-headless', 'chromium-headless-shell'],
    ['chrome_crashpad_handler', 'chromium-crashpad-handler'],
    ['chrome_crashpad', 'chromium-crashpad-handler'],
    ['chrome_crashpad_', 'chromium-crashpad-handler'],
    ['node', 'node'],
    ['nodejs', 'node'],
    ['python', 'python'],
    ['python3', 'python'],
    ['python3.10', 'python'],
    ['python3.11', 'python'],
    ['python3.12', 'python'],
    ['python3.13', 'python'],
    ['python3.14', 'python'],
]);
const CHROMIUM_NAMES = new Set(['chromium', 'chromium-headless-shell']);
const PROCESS_TYPES = new Set(['renderer', 'gpu-process', 'utility', 'zygote', 'broker', 'crashpad-handler']);
const UTILITY_TYPES = new Set([
    'network.mojom.NetworkService',
    'storage.mojom.StorageService',
    'audio.mojom.AudioService',
    'video_capture.mojom.VideoCaptureService',
    'data_decoder.mojom.DataDecoderService',
    'media.mojom.CdmService',
]);
const BOOLEAN_FLAGS = new Map([
    ['--no-sandbox', 'noSandbox'],
    ['--disable-gpu-sandbox', 'disableGpuSandbox'],
    ['--disable-dev-shm-usage', 'disableDevShmUsage'],
]);
const VALUE_FLAGS = new Map([
    ['--use-gl', { key: 'useGl', values: new Set(['angle', 'desktop', 'egl', 'swiftshader', 'disabled']) }],
    [
        '--use-angle',
        {
            key: 'useAngle',
            values: new Set(['swiftshader', 'swiftshader-webgl', 'gl', 'gles', 'vulkan', 'default', 'metal', 'd3d11']),
        },
    ],
    ['--ozone-platform', { key: 'ozonePlatform', values: new Set(['headless', 'x11', 'wayland']) }],
    ['--headless', { key: 'headlessMode', values: new Set(['new', 'old', 'chrome']) }],
]);

function readIdentity(pid) {
    const raw = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = raw
        .slice(raw.lastIndexOf(')') + 2)
        .trimEnd()
        .split(' ');
    return {
        pid,
        state: fields[0],
        ppid: Number(fields[1]),
        pgrp: Number(fields[2]),
        startTicks: fields[19],
        namespace: fs.readlinkSync(`/proc/${pid}/ns/pid`),
    };
}
function readBounded(file, maximum) {
    const fd = fs.openSync(file, 'r');
    try {
        const bytes = Buffer.alloc(maximum + 1);
        let count = 0;
        while (count < bytes.length) {
            const size = fs.readSync(fd, bytes, count, bytes.length - count, null);
            if (!size) break;
            count += size;
        }
        return bytes.subarray(0, count);
    } finally {
        fs.closeSync(fd);
    }
}
const DEFAULT_IO = { readIdentity, readBounded, readlink: fs.readlinkSync };
function validIdentity(row) {
    return (
        Number.isSafeInteger(row?.pid) &&
        row.pid > 0 &&
        typeof row.startTicks === 'string' &&
        /^\d+$/.test(row.startTicks) &&
        typeof row.namespace === 'string' &&
        /^pid:\[\d+\]$/.test(row.namespace)
    );
}
function safeState(row) {
    return validIdentity(row) &&
        STATES.has(row.state) &&
        Number.isSafeInteger(row.ppid) &&
        row.ppid >= 0 &&
        Number.isSafeInteger(row.pgrp) &&
        row.pgrp >= 0
        ? { state: row.state, ppid: row.ppid, pgrp: row.pgrp }
        : null;
}
function failureCode(error) {
    if (error?.code === 'ENOENT' || error?.code === 'ESRCH') return 'missing';
    if (error?.code === 'EACCES' || error?.code === 'EPERM') return 'permission-denied';
    return 'unavailable';
}
function chromiumHints(argv, details, reasons) {
    const types = [];
    const utilities = [];
    const values = new Map();
    for (const arg of argv.slice(1)) {
        if (BOOLEAN_FLAGS.has(arg)) details.flags[BOOLEAN_FLAGS.get(arg)] = true;
        const separator = arg.indexOf('=');
        const key = separator < 0 ? arg : arg.slice(0, separator);
        const value = separator < 0 ? null : arg.slice(separator + 1);
        if (key === '--type') types.push(value);
        if (key === '--utility-sub-type') utilities.push(value);
        if (VALUE_FLAGS.has(key)) values.set(key, [...(values.get(key) || []), value]);
    }
    if (types.length === 1 && PROCESS_TYPES.has(types[0])) details.processType = types[0];
    else if (types.length) reasons.push('process-type-unrecognized-or-ambiguous');
    else details.processType = 'browser';
    if (utilities.length && details.processType !== 'utility') reasons.push('utility-type-role-mismatch');
    else if (utilities.length === 1 && UTILITY_TYPES.has(utilities[0])) details.utilitySubType = utilities[0];
    else if (utilities.length) reasons.push('utility-type-unrecognized-or-ambiguous');
    for (const [key, items] of values) {
        if (items.length !== 1) {
            reasons.push('value-flag-ambiguous');
            continue;
        }
        if (key === '--headless' && items[0] === null) details.flags.headless = true;
        else if (VALUE_FLAGS.get(key).values.has(items[0])) details.flags[VALUE_FLAGS.get(key).key] = items[0];
        else reasons.push('value-flag-unrecognized');
    }
}
function snapshotOwnedProcess(expected, io = DEFAULT_IO) {
    const result = {
        schemaVersion: 'example-evidence-process-diagnostic/1',
        purpose: 'diagnostic-only',
        status: 'unknown',
        identity: null,
        before: null,
        after: null,
        details: null,
        reasons: [],
        signalSender: 'unknown',
    };
    if (!validIdentity(expected)) {
        result.reasons.push('expected-identity-invalid');
        return result;
    }
    result.identity = { pid: expected.pid, startTicks: expected.startTicks, namespace: expected.namespace };
    const matches = (row) =>
        validIdentity(row) &&
        row.pid === expected.pid &&
        row.startTicks === expected.startTicks &&
        row.namespace === expected.namespace;
    let before;
    try {
        before = io.readIdentity(expected.pid);
    } catch (error) {
        result.reasons.push(`identity-before-${failureCode(error)}`);
    }
    result.before = safeState(before);
    if (!matches(before) || !result.before) {
        result.reasons.push('identity-before-mismatch-or-missing');
        return result;
    }
    if (DEAD_STATES.has(before.state)) {
        result.reasons.push('not-alive-before-read');
        return result;
    }
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const details = {
        executable: 'unknown',
        command: 'unknown',
        processType: 'unknown',
        utilitySubType: 'unknown',
        flags: {},
    };
    try {
        const raw = io.readBounded(`/proc/${expected.pid}/comm`, MAX_TEXT_BYTES);
        if (!Buffer.isBuffer(raw) || !raw.length || raw.length > MAX_TEXT_BYTES)
            result.reasons.push('comm-empty-or-oversized');
        else details.command = NAMES.get(decoder.decode(raw).replace(/\n$/, '')) || 'unknown';
    } catch (error) {
        result.reasons.push(`comm-${failureCode(error)}`);
    }
    try {
        const value = io.readlink(`/proc/${expected.pid}/exe`);
        if (typeof value !== 'string' || !value.length || Buffer.byteLength(value) > MAX_TEXT_BYTES)
            result.reasons.push('exe-empty-or-oversized');
        else details.executable = NAMES.get(path.basename(value)) || 'unknown';
    } catch (error) {
        result.reasons.push(`exe-${failureCode(error)}`);
    }
    try {
        const raw = io.readBounded(`/proc/${expected.pid}/cmdline`, MAX_CMDLINE_BYTES);
        if (!Buffer.isBuffer(raw) || !raw.length || raw.length > MAX_CMDLINE_BYTES)
            result.reasons.push('cmdline-empty-or-oversized');
        else if (raw[0] === 0 || raw[raw.length - 1] !== 0) result.reasons.push('cmdline-malformed');
        else {
            const argv = decoder.decode(raw.subarray(0, -1)).split('\0');
            if (CHROMIUM_NAMES.has(details.executable)) chromiumHints(argv, details, result.reasons);
        }
    } catch (error) {
        result.reasons.push(`cmdline-${failureCode(error)}`);
    }
    let after;
    try {
        after = io.readIdentity(expected.pid);
    } catch (error) {
        result.reasons.push(`identity-after-${failureCode(error)}`);
    }
    result.after = safeState(after);
    if (!matches(after) || !result.after) result.reasons.push('identity-after-mismatch-or-missing');
    if (DEAD_STATES.has(after?.state)) result.reasons.push('not-alive-after-read');
    if (!result.reasons.length) {
        result.status = 'observed';
        result.details = details;
    }
    return result;
}
module.exports = { snapshotOwnedProcess, MAX_CMDLINE_BYTES };
