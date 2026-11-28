/** Drive the shipped CLI and use controlled faults in isolated loopback responses. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const base = new URL(process.env.AIR_REVIEW_BASE ?? 'http://127.0.0.1:7454/');
assert.equal(base.hostname, '127.0.0.1');
const path = '/glass-refraction/';
const cli = fileURLToPath(new URL('./agent-review.mjs', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'air-glass-passes-'));
const exec = promisify(execFile);
async function review(name, url, expected) {
    const folder = join(output, name);
    const run = await exec(process.execPath, [cli, 'glass-passes', '--url', url, '--out', folder], {
        timeout: 50000,
    }).catch((error) => {
        if (!Number.isInteger(error.code)) throw error;
        return { stdout: error.stdout, exitCode: error.code };
    });
    const receipt = JSON.parse(run.stdout);
    await writeFile(join(output, name + '.json'), run.stdout);
    assert.equal(run.exitCode ?? 0, expected === 'TRANSMISSION_OBSERVED' ? 0 : 1, run.stdout);
    const { active, control, diagnosis, comparison } = receipt.passes ?? {};
    assert.equal(diagnosis, expected, run.stdout);
    assert.equal(receipt.checks.observedRuntimeErrorsEmpty, true);
    assert.equal(active.frame.frameIndex, control.frame.frameIndex + 1);
    for (const { frame, pass } of [control, active]) {
        for (const artifact of [frame, pass.background].filter(Boolean)) {
            const bytes = await readFile(join(folder, artifact.png));
            assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256);
        }
    }
    if (expected === 'BACKGROUND_NOT_CAPTURED') {
        assert.equal(active.pass.background, undefined);
        assert.equal(active.pass.readback, 'MISSING_CAPTURE');
    } else {
        assert.equal(active.pass.bindingMatches, true);
        assert.equal(active.pass.attachment.format, 'RGBA8');
        assert.equal(active.pass.background.sha256, control.pass.background.sha256);
        assert.ok(Math.abs(active.pass.transmission - 0.95) < 1e-5);
    }
    return { diagnosis, changedPixels: comparison.changedPixels };
}

async function fault(name, inject, expected) {
    const server = createServer(async (req, res) => {
        try {
            const upstreamUrl = new URL(req.url, base);
            if (upstreamUrl.origin !== base.origin) return res.writeHead(403).end();
            const response = await fetch(upstreamUrl, { redirect: 'error' });
            const headers = { 'Content-Type': response.headers.get('content-type') ?? 'application/octet-stream' };
            if (req.url === path) {
                // The actual example still runs. Change its native owner at the publication point,
                // before the CLI can observe the frame. The SDK bundle and bridge stay unmodified.
                const original = await response.text();
                const hook = `<script>Object.defineProperty(window, '__glassNative', {
                  configurable: true, set(native) {
                    ${inject}
                    Object.defineProperty(window, '__glassNative', {value: native, configurable: true});
                  }
                });</script>`;
                assert.ok(original.includes('</head>'));
                return res.writeHead(response.status, headers).end(original.replace('</head>', hook + '</head>'));
            }
            res.writeHead(response.status, headers).end(Buffer.from(await response.arrayBuffer()));
        } catch {
            res.writeHead(502).end();
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    try {
        return await review(name, `http://127.0.0.1:${server.address().port}${path}`, expected);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}
const real = await review('real', new URL(path, base).href, 'TRANSMISSION_OBSERVED');
const noBackground = await fault('no-background', 'native.capture().enabled = false;', 'BACKGROUND_NOT_CAPTURED');
const noComposite = await fault(
    'no-composite',
    'native.renderer().node.setPosition(1000, 0, 0);',
    'COMPOSITE_NO_EFFECT',
);
console.log(JSON.stringify({ real, noBackground, noComposite, output }));
