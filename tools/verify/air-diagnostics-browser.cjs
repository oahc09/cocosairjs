const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const esbuild = require('esbuild');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { collectSnapshot } = require('./port-gap-candidate-snapshot.cjs');
const root = path.resolve(__dirname, '../..');
const hashFile = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function main() {
    const args = process.argv.slice(2);
    const out = args.find((arg) => arg.startsWith('--out='))?.slice(6);
    if (args.some((arg) => !arg.startsWith('--out=')) || !out) throw new Error('usage: node tools/verify/air-diagnostics-browser.cjs --out=<new.json>');
    const output = path.resolve(root, out);
    if (fs.existsSync(output)) throw new Error('report exists; choose a new output path');
    const startedAt = new Date().toISOString();
    const candidate = collectSnapshot();
    const sourceFiles = ['src/cocos/core/platform/debug.ts', 'src/air/diagnostics.ts', 'src/air/bootstrap.ts',
        'tools/debug/agent-session.ts', 'test/fixtures/air-diagnostics/main.ts', 'tools/verify/air-diagnostics-browser.cjs'];
    const fingerprints = Object.fromEntries(sourceFiles.map((file) => [file, hashFile(path.join(root, file))]));
    fingerprints.bundle = hashFile(path.join(root, 'build/cocosair.module.js'));
    const results = [];
    const server = await startExampleServer(root);
    try {
        const playwright = require('playwright');
        for (const engine of ['chromium', 'firefox', 'webkit']) {
            let browser;
            let stage = 'infrastructure';
            try {
                if (engine === 'webkit') assert(fs.existsSync(playwright.webkit.executablePath()), 'matching WebKit binary required');
                browser = await playwright[engine].launch({ ...launchOptions(engine), headless: true });
                for (const mode of ['errors', 'warnings']) {
                    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
                    const pageErrors = [], warnings = [];
                    page.on('pageerror', (error) => pageErrors.push(String(error)));
                    page.on('console', (entry) => { if (entry.type() === 'warning') warnings.push(entry.text()); });
                    const built = esbuild.buildSync({ entryPoints: [path.join(root, 'tools/debug/agent-session.ts')],
                        bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022', external: ['cocosair'] });
                    await page.route('**/tools/debug/agent-session.js', (route) => route.fulfill({ contentType: 'text/javascript', body: built.outputFiles[0].text }));
                    const url = `${server.origin}/test/fixtures/air-diagnostics/?mode=${mode}`;
                    await page.goto(url);
                    await page.waitForFunction(() => window.__airDiagnosticProbe?.ready, null, { timeout: 30000 });
                    stage = 'engine';
                    const probe = await page.evaluate(() => window.__airDiagnosticProbe);
                    assert.equal(probe.validCount, 0, 'legal property must not produce warnings');
                    assert.equal(probe.consoleUnwrapped, true);
                    assert.equal(probe.closedCode, 'SESSION_CLOSED');
                    assert(probe.webglVersion.startsWith('WebGL 2.0'));
                    const unknown = warnings.filter((entry) => entry.includes('portUnknownUniform'));
                    const toolWarnings = probe.collected.errors.filter((entry) => entry.category === 'engine-warning');
                    if (mode === 'errors') {
                        assert.equal(unknown.length, 0);
                        assert.deepEqual(probe.diagnostics, []);
                        assert.deepEqual(toolWarnings, []);
                    } else {
                        assert.equal(unknown.length, 2, 'native console output is retained');
                        assert.equal(probe.diagnostics.length, 1);
                        assert.equal(probe.diagnostics[0].id, 16373);
                        assert.equal(probe.diagnostics[0].occurrences, 2);
                        assert.equal(toolWarnings.length, 1);
                        assert.equal(toolWarnings[0].source, 'cocos:16373');
                        assert(toolWarnings[0].message.includes('portUnknownUniform'));
                        assert.equal(probe.lastHistory.length, 2, 'channel remains usable after tool closes');
                    }
                    assert.deepEqual(pageErrors, []);
                    const artifacts = output.replace(/\.json$/, '') + '-artifacts';
                    fs.mkdirSync(artifacts, { recursive: true });
                    const screenshot = path.join(artifacts, `${engine}-${mode}.png`);
                    await page.screenshot({ path: screenshot });
                    results.push({ engine, mode, status: 'PASS', browserVersion: browser.version(), url,
                        screenshot: path.relative(root, screenshot).replace(/\\/g, '/'), probe, consoleUnknownCount: unknown.length });
                    console.error(`[air-diagnostics] ${engine}/${mode} PASS`);
                    await page.close(); stage = 'infrastructure';
                }
            } catch (error) { results.push({ engine, status: 'FAIL', stage, error: String(error.stack || error) }); }
            finally { if (browser) await browser.close(); }
        }
        for (const file of sourceFiles) assert.equal(hashFile(path.join(root, file)), fingerprints[file], `source drift: ${file}`);
        assert.equal(hashFile(path.join(root, 'build/cocosair.module.js')), fingerprints.bundle, 'loaded bundle drift');
        const report = { startedAt, endedAt: new Date().toISOString(), command: process.argv, cwd: root, candidate,
            fingerprints, scope: ['PG-18 native material warnings/default logs/debug session'], subset: true,
            completed: results.length === 6 && results.every((result) => result.status === 'PASS'),
            unverified: ['weighted joints/root-path/finite bounds checks', 'UBO capacity/culling explanation', 'other rendering subsystems'], results };
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.log(JSON.stringify(report, null, 2));
        process.exitCode = report.completed ? 0 : 1;
    } finally { await server.close(); }
}
main().catch((error) => { console.error(String(error.stack || error)); process.exitCode = 1; });
