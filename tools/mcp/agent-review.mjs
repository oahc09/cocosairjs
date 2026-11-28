#!/usr/bin/env node
/** One-shot, development-only evidence. The caller owns the dev server; this tool owns its browser. */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const { verifySourceBinding } = require('../build/source-binding.cjs');
const bundle = join(root, 'build/cocosair.module.js');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const usage = [
    'node tools/mcp/agent-review.mjs doctor',
    'node tools/mcp/agent-review.mjs <inspect|capture|verify> --url http://127.0.0.1:7454/example/',
    'capture / verify require --out NEW_DIRECTORY; verify requires --min-pixels N and --node NAME',
].join('\n');
function fail(code, message) {
    throw Object.assign(new Error(message), { code });
}

function localBuild() {
    const binding = verifySourceBinding(root, bundle);
    if (!binding.matches) fail('SOURCE_BINDING_MISMATCH', binding.reason ?? binding.mismatches.slice(0, 5).join(', '));
    const receiptBytes = readFileSync(bundle + '.sources.json');
    const bundleSha256 = sha256(readFileSync(bundle));
    if (sha256(receiptBytes) !== binding.receiptSha256 || JSON.parse(receiptBytes).bundleSha256 !== bundleSha256)
        fail('SOURCE_BINDING_MISMATCH', 'Bundle or binding changed during review.');
    return { bundleSha256, receiptSha256: binding.receiptSha256, sourceCount: binding.compared };
}

function result(value) {
    if (value?.ok === false) fail(value.error.code, value.error.message);
    return value;
}

export function inspectPng(frame, PNG) {
    const prefix = 'data:image/png;base64,';
    if (
        !Number.isInteger(frame.width) ||
        !Number.isInteger(frame.height) ||
        frame.width < 1 ||
        frame.height < 1 ||
        frame.width > 640 ||
        frame.height > 480 ||
        !frame.png?.startsWith(prefix) ||
        frame.png.length > 1398128
    )
        fail('CAPTURE_INVALID', 'Missing PNG or capture exceeds size limits.');
    const bytes = Buffer.from(frame.png.slice(prefix.length), 'base64');
    if (
        bytes.length > 1024 ** 2 ||
        bytes.length < 33 ||
        bytes.readUInt32BE(16) !== frame.width ||
        bytes.readUInt32BE(20) !== frame.height
    )
        fail('CAPTURE_INVALID', 'Invalid PNG dimensions or payload.');
    const { data } = PNG.sync.read(bytes);
    // A smoke floor, not reference-image parity. Compare against the first RGBA pixel.
    let contrastPixels = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
        if ([0, 1, 2, 3].some((channel) => Math.abs(data[offset + channel] - data[channel]) > 8)) contrastPixels++;
    }
    return { bytes, contrastPixels, sha256: sha256(bytes) };
}

async function main(args) {
    const [command, ...argv] = args;
    if (!command || command === '--help' || command === 'help') return { usage };
    if (!['doctor', 'inspect', 'capture', 'verify'].includes(command)) fail('ARGUMENT_INVALID', usage);
    const { values } = parseArgs({
        args: argv,
        options: {
            url: { type: 'string' },
            out: { type: 'string' },
            'min-pixels': { type: 'string' },
            node: { type: 'string' },
        },
    });
    if (command === 'doctor' && argv.length) fail('ARGUMENT_INVALID', usage);
    if (command === 'inspect' && (!values.url || values.out || values.node || values['min-pixels']))
        fail('ARGUMENT_INVALID', usage);
    if (command === 'capture' && (!values.url || !values.out || values.node || values['min-pixels']))
        fail('ARGUMENT_INVALID', usage);
    const minPixels = Number(values['min-pixels']);
    if (
        command === 'verify' &&
        (!values.url ||
            !values.out ||
            !values.node ||
            !Number.isSafeInteger(minPixels) ||
            minPixels < 1 ||
            minPixels >= 640 * 480)
    )
        fail('ARGUMENT_INVALID', usage);

    const build = localBuild();
    const { chromium } = await import('playwright');
    const executablePath = process.env.AIR_CHROMIUM ?? chromium.executablePath();
    if (!existsSync(executablePath)) fail('BROWSER_MISSING', 'Install Chromium or set AIR_CHROMIUM.');
    if (command === 'doctor') return { build, browserExecutableFound: true, browserLaunched: false };

    const { openBrowser } = await import('./browser.mjs');
    const adapter = await openBrowser({ url: values.url, executablePath, expectedBundleSha256: build.bundleSha256 });
    let report;
    let pixels;
    try {
        const identity = result(await adapter.call('reviewIdentity', {}));
        if (identity.backend !== 'webgl2') fail('BACKEND_UNVERIFIED', 'Pilot requires an observed WebGL 2 device.');
        const scene = result(await adapter.call('inspect', { kind: 'scene' }));
        if (scene.sceneId !== identity.sceneId) fail('STALE_TARGET', 'Scene changed during review.');
        report = {
            build,
            sessionId: randomUUID(),
            page: values.url,
            backend: identity.backend,
            sceneId: scene.sceneId,
        };
        if (command === 'inspect') report.scene = scene;
        else {
            const frame = result(await adapter.call('capture', {}));
            if (
                frame.sceneId !== scene.sceneId ||
                !Number.isSafeInteger(frame.frameIndex) ||
                frame.frameIndex < 1 ||
                !Number.isFinite(Date.parse(frame.sampledAt))
            )
                fail('STALE_TARGET', 'Fresh frame identity cannot be verified.');
            pixels = inspectPng(frame, require('pngjs').PNG);
            const errors = result(await adapter.call('inspect', { kind: 'errors' }));
            const after = result(await adapter.call('reviewIdentity', {}));
            if (
                after.sceneId !== identity.sceneId ||
                after.backend !== identity.backend ||
                localBuild().receiptSha256 !== build.receiptSha256
            )
                fail('STALE_TARGET', 'Scene, backend, or build changed.');
            report.frame = {
                frameIndex: frame.frameIndex,
                sampledAt: frame.sampledAt,
                width: frame.width,
                height: frame.height,
                png: 'frame.png',
                pngSha256: pixels.sha256,
                contrastPixels: pixels.contrastPixels,
            };
            if (command === 'verify') {
                report.checks = {
                    nodePresent: scene.nodes.some((node) => node.name === values.node),
                    contrastFloor: pixels.contrastPixels >= minPixels,
                    observedRuntimeErrorsEmpty: errors.errors.length === 0 && errors.dropped === 0,
                };
                report.criteria = { node: values.node, minPixels };
                report.observedRuntimeErrors = errors;
            }
        }
    } finally {
        await adapter.close();
    }
    if (pixels) {
        mkdirSync(values.out);
        writeFileSync(join(values.out, 'frame.png'), pixels.bytes, { flag: 'wx' });
    }
    return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const schema = 'air-agent-review-v1';
    const command = process.argv[2] ?? 'help';
    try {
        const report = await main(process.argv.slice(2));
        const ok = !report.checks || Object.values(report.checks).every(Boolean);
        console.log(JSON.stringify({ schema, command, ok, ...report }));
        if (!ok) process.exitCode = 1;
    } catch (error) {
        console.log(
            JSON.stringify({
                schema,
                command,
                ok: false,
                error: {
                    code: error.code ?? 'REVIEW_FAILED',
                    message: String(error.message ?? error).slice(0, 2000),
                },
            }),
        );
        process.exitCode = 1;
    }
}
