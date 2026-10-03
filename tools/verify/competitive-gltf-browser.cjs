/* Read-only CB-05 workspace/frozen tarball comparison with one pinned offline Fox.
 * NODE_PATH=<configured Playwright runtime> node tools/verify/competitive-gltf-browser.cjs
 * Requires tools/verify/serve-gltf.cjs on GLTF_PORT=7483. Reports and screenshots stay in output/.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'output/competitive-benchmark');
fs.mkdirSync(output, { recursive: true });
const fingerprint = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const candidates = [
    { name: 'workspace', bundle: path.join(root, 'build/cocosair.module.js') },
    { name: 'frozen-workspace', bundle: path.join(output, 'baseline/cocosair.module.js') },
    { name: 'frozen-tarball', bundle: path.join(output, 'baseline/package/package/build/npm/cocosair.module.js') },
    { name: 'pilot-k0-tarball', bundle: path.join(output, 'k0/package/build/npm/cocosair.module.js') },
];

(async () => {
    const browser = await chromium.launch({ headless: true,
        executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1228/chrome-win64/chrome.exe'),
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
    const records = [];
    try {
        for (const candidate of candidates) {
            const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
            const errors = [];
            page.on('pageerror', (error) => errors.push(String(error)));
            page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
            await page.route('**/build/cocosair.module.js', (route) => route.fulfill({ path: candidate.bundle,
                contentType: 'application/javascript' }));
            await page.goto('http://127.0.0.1:7483/gltf-viewer/');
            await page.getByRole('combobox', { name: '模型', exact: true }).selectOption('official/Fox.glb');
            await page.waitForFunction(() => window.gltfViewer?.name === 'official/Fox.glb');
            const pixels = await page.evaluate(async () => {
                const { game, MeshRenderer } = await import('/build/cocosair.module.js');
                const viewer = window.gltfViewer;
                game.pause();
                viewer.sample(0);
                const canvas = document.querySelector('canvas');
                const gl = canvas.getContext('webgl2');
                const read = () => {
                    for (let frame = 0; frame < 3; ++frame) game.step();
                    const data = new Uint8Array(canvas.width * canvas.height * 4);
                    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
                    return data;
                };
                viewer.instance.root.active = false;
                const background = read();
                viewer.instance.root.active = true;
                const frame = read();
                let visible = 0, lit = 0;
                const rgb = [0, 0, 0];
                for (let index = 0; index < frame.length; index += 4) {
                    const delta = Math.abs(frame[index] - background[index]) + Math.abs(frame[index + 1] - background[index + 1]) + Math.abs(frame[index + 2] - background[index + 2]);
                    if (delta <= 12) continue;
                    ++visible;
                    const sum = frame[index] + frame[index + 1] + frame[index + 2];
                    if (sum > 60) ++lit;
                    for (let channel = 0; channel < 3; ++channel) rgb[channel] += frame[index + channel];
                }
                return { visible, lit, litRatio: lit / Math.max(visible, 1), meanRGB: rgb.map((value) => value / Math.max(visible, 1)),
                    meshes: viewer.asset.meshes.length, textures: viewer.asset.textures.length, animations: viewer.asset.animations.length,
                    effects: [...new Set(viewer.instance.root.getComponentsInChildren(MeshRenderer)
                        .flatMap((renderer) => renderer.sharedMaterials.map((material) => material?.effectAsset?.name)))],
                    glError: gl.getError() };
            });
            await page.screenshot({ path: path.join(output, `fox-${candidate.name}.png`) });
            records.push({ candidate: candidate.name, bundleSha256: fingerprint(candidate.bundle), pixels, errors,
                ok: errors.length === 0 && pixels.glError === 0 && pixels.visible > 1000 && pixels.litRatio > 0.7 });
            await page.close();
        }
    } finally { await browser.close(); }
    const report = { scope: 'CB-05 pinned Fox workspace/frozen package pixels; not a general glTF or performance claim',
        measuredAt: new Date().toISOString(), modelSha256: fingerprint(path.join(root, 'examples/gltf-viewer/assets/official/Fox.glb')),
        records, ok: records.every((record) => record.ok) };
    fs.writeFileSync(path.join(output, 'gltf-consumer-pixels.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
