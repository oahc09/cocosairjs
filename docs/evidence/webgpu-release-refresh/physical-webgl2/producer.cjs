const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const root = process.cwd();
const directory = __dirname;
const { sourceFingerprint } = require(path.join(root, 'tools/verify/webgpu-candidate.cjs'));
const sourceSha256 = sourceFingerprint(root);
const startedAt = new Date().toISOString();
const { launchOptions } = require(path.join(root, 'tools/verify/browser-engines.cjs'));
(async () => {
    const server = spawn(process.execPath, [path.join(root, 'tools/verify/serve-gltf.cjs')], {
        cwd: root, env: { ...process.env, GLTF_PORT: '7462' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('glTF server startup timeout')), 10000);
        server.stdout.on('data', chunk => { if (String(chunk).includes('glTF viewer:')) { clearTimeout(timer); resolve(); } });
        server.once('error', reject);
    });
    let browser;
    const records = [];
    try {
        browser = await require('playwright').chromium.launch({ ...launchOptions('chromium'), executablePath: process.env.AIR_CHROMIUM_PATH });
        fs.mkdirSync(path.join(directory, 'output'), { recursive: true });
        process.chdir(directory);
        for (const name of ['physical','clearcoat','anisotropy','iridescence','bump','transmission']) {
            const page = await browser.newPage();
            const source = fs.readFileSync(path.join(root, `tools/verify/gltf-${name}-browser.js`), 'utf8');
            const probe = new Function('return (' + source + ');')();
            try {
                const value = JSON.parse(await probe(page));
                records.push({ name, ...value });
                console.log(name, value.ok, JSON.stringify(value.failures));
            } catch (error) { records.push({ name, ok: false, error: String(error) }); console.log(name, String(error)); }
            await page.close();
        }
    } finally { await browser?.close(); server.kill(); }
    fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify({ method: 'REAL_WEBGL2_EXISTING_PHYSICAL_PROBES', sourceSha256, sourceUnchanged: sourceSha256 === sourceFingerprint(root), startedAt, finishedAt: new Date().toISOString(), records }, null, 2) + '\n');
    process.exitCode = records.every(row => row.ok) && sourceSha256 === sourceFingerprint(root) ? 0 : 1;
})().catch(error => { console.error(error); process.exitCode = 1; });

