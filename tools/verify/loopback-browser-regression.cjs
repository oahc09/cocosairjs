/* Controlled local-only negative test; does not change system proxy or download browsers. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const { launchOptions } = require('./browser-engines.cjs');

async function main() {
    const pw = require('playwright');
    const server = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><title>loopback diagnostic</title>local</html>');
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const url = `http://127.0.0.1:${server.address().port}/`;
    const rows = [];
    const invalid = {
        ...process.env,
        HTTP_PROXY: 'http://127.0.0.1:9',
        HTTPS_PROXY: 'http://127.0.0.1:9',
        ALL_PROXY: 'http://127.0.0.1:9',
        http_proxy: 'http://127.0.0.1:9',
        https_proxy: 'http://127.0.0.1:9',
        all_proxy: 'http://127.0.0.1:9',
        NO_PROXY: '',
        no_proxy: '',
    };
    try {
        for (const engine of ['chromium', 'firefox', 'webkit']) {
            for (const mode of ['unavailable-proxy-control', 'local-bypass']) {
                let browser;
                const row = {
                    engine,
                    mode,
                    expected:
                        mode === 'local-bypass' || engine === 'chromium'
                            ? 'local page loads'
                            : 'Firefox/WebKit expose proxy failure',
                };
                try {
                    browser = await pw[engine].launch({
                        ...launchOptions(engine),
                        env: mode === 'local-bypass' ? loopbackBrowserEnv(invalid) : invalid,
                    });
                    const page = await browser.newPage();
                    await page.goto(url, { timeout: 8000 });
                    row.title = await page.title();
                    row.loaded = row.title === 'loopback diagnostic';
                } catch (error) {
                    row.loaded = false;
                    row.error = String(error.message).split('\n')[0];
                } finally {
                    if (browser) await browser.close();
                }
                row.ok =
                    mode === 'local-bypass'
                        ? row.loaded
                        : engine === 'chromium'
                          ? row.loaded
                          : !row.loaded && /PROXY_CONNECTION_REFUSED|Could not connect to server/.test(row.error || '');
                rows.push(row);
                console.log(JSON.stringify(row));
            }
        }
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
    const out = path.resolve(__dirname, '..', '..', 'output', 'playwright', 'loopback-browser-regression.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
        out,
        JSON.stringify(
            { measuredAt: new Date().toISOString(), result: rows.every((r) => r.ok) ? 'PASS' : 'FAIL', rows },
            null,
            2,
        ) + '\n',
    );
    process.exitCode = rows.every((r) => r.ok) ? 0 : 1;
}
main().catch((error) => {
    console.error(String(error.message));
    process.exitCode = 1;
});
