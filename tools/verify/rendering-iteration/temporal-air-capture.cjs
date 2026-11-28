/* Capture the independent temporal micro-fixture with the actual AIR SDK. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { PNG } = require('pngjs');
const { webkit } = require('playwright');
const WIDTH = 160;
const HEIGHT = 96;
const SAMPLE = 4;

const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,">
<style>html,body{margin:0;background:black}canvas{display:block;width:640px;height:384px}</style></head>
<body><div id="GameDiv"><div id="Cocos3dGameContainer"><canvas id="GameCanvas" width="640" height="384"></canvas></div></div>
<script type="module" src="/main.mjs"></script></body></html>`;
const hash = (data) => createHash('sha256').update(data).digest('hex');
const toLinear = Array.from({ length: 256 }, (_, i) => {
    const s = i / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
});

function downsample(bytes) {
    const { width, height, data } = PNG.sync.read(bytes);
    if (width !== WIDTH * SAMPLE || height !== HEIGHT * SAMPLE) throw new Error('Unexpected capture dimensions');
    const linear = Buffer.alloc(WIDTH * HEIGHT * 12);
    let offset = 0;
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            for (let c = 0; c < 3; c++) {
                let sum = 0;
                for (let yy = 0; yy < SAMPLE; yy++) {
                    for (let xx = 0; xx < SAMPLE; xx++) {
                        const i = ((y * SAMPLE + yy) * width + x * SAMPLE + xx) * 4;
                        if (data[i + 3] !== 255) throw new Error('Unexpected alpha in capture');
                        sum += toLinear[data[i + c]];
                    }
                }
                linear.writeFloatLE(sum / SAMPLE ** 2, offset);
                offset += 4;
            }
        }
    }
    return linear;
}

async function main([sdkPath, executable, output, ...rest]) {
    if (!sdkPath || !executable || !output || rest.length)
        throw new Error('Usage: node temporal-air-capture.cjs <rebuilt-sdk.js> <WPE-executable> <new-output-dir>');
    const sdk = fs.readFileSync(sdkPath);
    const mainSource = fs.readFileSync(path.join(__dirname, 'temporal-air-page.mjs'));
    fs.mkdirSync(output);
    const receipt = {
        scope: 'WPE browser correctness, not device or E12 delivery',
        sdkSha256: hash(sdk),
        browser: null,
        frames: [],
        errors: [],
    };
    const server = http.createServer((req, res) => {
        const data = new Map([
            ['/', ['text/html', html]],
            ['/sdk.mjs', ['text/javascript', sdk]],
            ['/main.mjs', ['text/javascript', mainSource]],
        ]).get(req.url);
        if (!data) return res.writeHead(404).end();
        res.writeHead(200, { 'Content-Type': data[0], 'Cache-Control': 'no-store' });
        res.end(data[1]);
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    let browser;
    try {
        browser = await webkit.launch({ executablePath: path.resolve(executable) });
        receipt.browser = browser.version();
        const page = await browser.newPage({
            viewport: { width: WIDTH * SAMPLE, height: HEIGHT * SAMPLE },
            deviceScaleFactor: 1,
        });
        page.setDefaultTimeout(15000);
        page.on('pageerror', (error) => receipt.errors.push(error.message));
        page.on('console', (event) => {
            if (event.type() === 'error') receipt.errors.push(event.text());
        });
        page.on('requestfailed', (request) =>
            receipt.errors.push(`Request failed: ${new URL(request.url()).pathname}`),
        );
        page.on('response', (response) => {
            if (response.status() >= 400) receipt.errors.push(`HTTP ${response.status()}`);
        });
        await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'commit' });
        await page.waitForFunction(() => typeof window.renderTemporalFrame === 'function');
        for (let index = 0; index < 16; index++) {
            const state = await page.evaluate((i) => window.renderTemporalFrame(i), index);
            if (state.index !== index || state.dpr !== 1 || state.framebuffer.join(',') !== '640,384')
                throw new Error('Wrong frame state or framebuffer');
            const png = await page.screenshot({ type: 'png' });
            const linear = downsample(png);
            const name = `frame-${String(index).padStart(3, '0')}`;
            fs.writeFileSync(path.join(output, name + '.rgb32f'), linear, { flag: 'wx' });
            fs.writeFileSync(path.join(output, name + '.png'), png, { flag: 'wx' });
            receipt.frames.push({ index, pngSha256: hash(png), linearSha256: hash(linear) });
        }
    } catch (error) {
        receipt.errors.push(error.message);
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (error) {
                receipt.errors.push(error.message);
            }
        }
        await new Promise((resolve) => server.close(resolve));
        fs.writeFileSync(path.join(output, 'capture.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    }
    if (receipt.errors.length || receipt.frames.length !== 16)
        throw new Error(`AIR capture failed: ${receipt.errors.join('; ')}`);
}

main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
