/* Current-bundle physical pixel regression; no builds or canonical evidence writes.
 * NODE_PATH=<configured Playwright runtime> node tools/verify/competitive-physical-browser.cjs
 * Requires serve-gltf.cjs on GLTF_PORT=7483; defaults to all three installed browsers.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const playwright = require('playwright');
const root = path.resolve(__dirname, '../..');
const outArg = process.argv.find((value) => value.startsWith('--out='));
const outFile = path.resolve(root, outArg ? outArg.slice(6) : 'output/competitive-benchmark/transmission-pixels.json');
const engines = process.argv.find((value) => value.startsWith('--engines='))?.slice(10).split(',') || ['chromium', 'firefox', 'webkit'];
const binary = {
    chromium: ['chromium-1228', 'chrome-win64/chrome.exe'],
    firefox: ['firefox-1543', 'firefox/firefox.exe'],
    webkit: ['webkit-2336', 'Playwright.exe'],
};
const script = fs.readFileSync(path.join(__dirname, 'competitive-transmission-browser.js'), 'utf8');
const run = vm.runInThisContext(`(${script})`, { filename: 'competitive-transmission-browser.js' });
const bytes = fs.readFileSync(path.join(root, 'build/cocosair.module.js'));
fs.mkdirSync(path.join(root, 'output/playwright'), { recursive: true });
(async () => {
    const records = [];
    for (const engine of engines) {
        if (!binary[engine]) throw new Error(`Unknown browser ${engine}`);
        const browser = await playwright[engine].launch({ headless: true,
            executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright', ...binary[engine]),
            args: engine === 'chromium' ? ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] : [] });
        try {
            const page = await browser.newPage();
            const result = JSON.parse(await run(page));
            await page.screenshot({ path: path.join(root, `output/playwright/competitive-transmission-${engine}.png`) });
            records.push({ engine, browserVersion: browser.version(), ...result });
        } finally { await browser.close(); }
    }
    const report = { measuredAt: new Date().toISOString(), bundleSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        scope: 'CB-01 rendered transmission, volume and dispersion parameter A/B with manual engine frames',
        sourceSha256: crypto.createHash('sha256').update(script).digest('hex'),
        runnerSha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
        fixture: { path: 'examples/gltf-viewer/assets/physical.glb',
            sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'examples/gltf-viewer/assets/physical.glb'))).digest('hex') },
        records, ok: records.every((row) => row.ok) };
    const currentSha = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'build/cocosair.module.js'))).digest('hex');
    if (currentSha !== report.bundleSha256) {
        report.ok = false;
        report.candidateDrift = { start: report.bundleSha256, end: currentSha };
    }
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
