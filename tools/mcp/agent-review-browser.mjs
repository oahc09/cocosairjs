/** End-to-end CLI acceptance. Requires the source-bound development bundle and a local dev server. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const tool = fileURLToPath(new URL('./agent-review.mjs', import.meta.url));
const base = new URL(process.env.AIR_REVIEW_BASE ?? 'http://127.0.0.1:7454/');
assert.equal(base.hostname, '127.0.0.1');
const evidence = await mkdtemp(join(tmpdir(), 'air-agent-review-'));
async function verify(name, url, node, success) {
    const output = join(evidence, name);
    const invocation = ['verify', '--url', url, '--node', node, '--min-pixels', '1000', '--out', output];
    const execution = await exec(process.execPath, [tool, ...invocation], { timeout: 45000 }).catch((error) => {
        if (!Number.isInteger(error.code)) throw error;
        return { ...error, stdout: error.stdout, exitCode: error.code };
    });
    const receipt = JSON.parse(execution.stdout);
    await writeFile(join(evidence, name + '.json'), execution.stdout);
    assert.equal(execution.exitCode ?? 0, success ? 0 : 1, execution.stdout);
    assert.equal(receipt.ok, success, execution.stdout);
    assert.equal(receipt.schema, 'air-agent-review-v1');
    if (receipt.frame) {
        const png = await readFile(join(output, receipt.frame.png));
        assert.equal(createHash('sha256').update(png).digest('hex'), receipt.frame.pngSha256);
    }
    return receipt;
}
const gltf = await verify('gltf', new URL('/gltf-viewer/', base).href, 'node__0', true);
const glass = await verify('glass', new URL('/glass-refraction/', base).href, 'Gemstone__0', true);
assert.equal(gltf.backend, 'webgl2');
assert.equal(glass.backend, 'webgl2');
assert.equal(gltf.build.bundleSha256, glass.build.bundleSha256);
assert.notEqual(gltf.sessionId, glass.sessionId);
assert.notEqual(gltf.frame.pngSha256, glass.frame.pngSha256);

// Serve the real bundle/bridge but an intentionally blank camera-only scene, and a separate
// origin presenting an altered bundle to model a stale dev server without touching worktree files.
const blankPage = `<!doctype html><canvas id="GameCanvas" width="320" height="240"></canvas>
<script type="importmap">{"imports":{"cocosair":"/build/cocosair.module.js"}}</script>
<script type="module">
import { createAirApp, Camera, Color, Node, Scene } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('blank');
const node = new Node('Proof Camera');
scene.addChild(node);
const cam = node.addComponent(Camera);
cam.clearColor = new Color(0, 0, 0, 255);
cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
cam.visibility = 0;
await app.run(scene);
window.__airApp = app;
</script>`;
async function fixture(stale) {
    const server = createServer(async (req, res) => {
        try {
            if (req.url === '/') {
                res.writeHead(200, { 'Content-Type': 'text/html' }).end(blankPage);
                return;
            }
            if (stale && req.url === '/build/cocosair.module.js') {
                res.writeHead(200, { 'Content-Type': 'text/javascript' }).end('export const stale = true;');
                return;
            }
            if (!['/build/cocosair.module.js', '/__debug/mcp-bridge.js'].includes(req.url)) {
                res.writeHead(404).end();
                return;
            }
            const upstream = await fetch(new URL(req.url, base), { redirect: 'error' });
            res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') });
            res.end(Buffer.from(await upstream.arrayBuffer()));
        } catch {
            res.writeHead(502).end();
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    try {
        return await verify(
            stale ? 'stale' : 'blank',
            `http://127.0.0.1:${server.address().port}/`,
            'Proof Camera',
            false,
        );
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}
const blank = await fixture(false);
assert.deepEqual(blank.checks, { nodePresent: true, contrastFloor: false, observedRuntimeErrorsEmpty: true });
assert.equal(blank.frame.contrastPixels, 0);
const stale = await fixture(true);
assert.equal(stale.error.code, 'BUNDLE_MISMATCH');
assert.equal(stale.frame, undefined);
console.log(
    JSON.stringify({
        evidence,
        gltfPixels: gltf.frame.contrastPixels,
        glassPixels: glass.frame.contrastPixels,
        blankPixels: blank.frame.contrastPixels,
        stale: stale.error.code,
    }),
);
