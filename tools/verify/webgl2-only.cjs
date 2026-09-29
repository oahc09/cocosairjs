/* Real-browser regression for the owner-approved WebGL 2-only runtime.
 * Run with NODE_PATH pointing to the configured Playwright installation.
 * Positive rendering, unavailable constructor, failed context and explicit HEADLESS
 * use fresh browser contexts for both the development and minified npm bundles.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const assert = require('assert');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../..');
const variants = ['build/cocosair.module.js', 'build/npm/cocosair.module.min.js'];
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex').slice(0, 16);
const html = `<!doctype html><html><body style="margin:0"><canvas id="GameCanvas" width="320" height="240"></canvas>
<script type="module">
let cc;
try {
  const query = new URLSearchParams(location.search);
  cc = await import('/' + query.get('bundle'));
  const app = await cc.createAirApp({canvas:'#GameCanvas',renderMode:query.get('mode')==='headless'?3:2});
  const device = cc.director.root.device;
  if (query.get('mode') !== 'headless') {
    const scene = new cc.Scene('WebGL2Policy');
    const cam = new cc.Node('Camera'); scene.addChild(cam); cam.setPosition(0,0,5); cam.lookAt(new cc.Vec3()); cam.addComponent(cc.Camera);
    const cube = new cc.Node('Cube'); scene.addChild(cube);
    const renderer = cube.addComponent(cc.MeshRenderer); renderer.mesh = cc.utils.createMesh(cc.primitives.box({}));
    const material = new cc.Material(); material.initialize({effectName:'builtin-unlit'}); material.setProperty('mainColor',new cc.Color(240,80,20,255)); renderer.material=material;
    app.run(scene);
    await new Promise(resolve=>setTimeout(resolve,800));
  }
  const gl = query.get('mode')==='headless'?null:document.getElementById('GameCanvas').getContext('webgl2');
  const pixel = new Uint8Array(4);
  if(gl) gl.readPixels(Math.floor(gl.drawingBufferWidth/2),Math.floor(gl.drawingBufferHeight/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
  window.__result={started:true,api:device.gfxAPI,expectedApi:query.get('mode')==='headless'?cc.gfx.API.UNKNOWN:cc.gfx.API.WEBGL2,pixel:Array.from(pixel),webgl1Export:typeof cc.WebGLDevice};
} catch(error) {
  window.__result={started:false,code:error.code,message:error.message,inited:!!(cc&&cc.game._inited)};
}
</script></body></html>`;

(async () => {
    const results = [];
    let browser;
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const relative = url.pathname.slice(1);
        if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); }
        else if (variants.includes(relative)) { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(path.join(root, relative))); }
        else { res.writeHead(404); res.end(); }
    });
    try {
        assert(!Object.hasOwn(require(path.join(root, 'src/cc.config.json')).features, 'gfx-webgl'));
        const dts = fs.readFileSync(path.join(root, 'build/cocosair.module.d.ts'), 'utf8');
        assert(!/export\s+(?:declare\s+)?class\s+WebGLDevice\b/.test(dts), 'retired WebGLDevice must not be publicly declared');
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const executablePath = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1228/chrome-win64/chrome.exe');
        browser = await chromium.launch({ headless: true, ...(fs.existsSync(executablePath) ? { executablePath } : {}), args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
        for (const bundle of variants) {
            for (const mode of ['webgl2', 'missing-constructor', 'context-failure', 'headless']) {
                const context = await browser.newContext({ viewport: { width: 320, height: 240 } });
                try {
                    const page = await context.newPage();
                    const pageErrors = [];
                    page.on('pageerror', error => pageErrors.push(error.message));
                    await page.addInitScript((mode) => {
                        const original = HTMLCanvasElement.prototype.getContext;
                        window.__nativeWebGL1 = !!original.call(document.createElement('canvas'), 'webgl');
                        window.__requests = [];
                        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
                            if (this.id === 'GameCanvas') {
                                window.__requests.push(type);
                                if (mode === 'context-failure' && type === 'webgl2') return null;
                            }
                            return original.call(this, type, ...args);
                        };
                        if (mode === 'missing-constructor' || mode === 'headless') window.WebGL2RenderingContext = undefined;
                    }, mode);
                    await page.goto(`http://127.0.0.1:${server.address().port}/?bundle=${bundle}&mode=${mode}`);
                    await page.waitForFunction(() => !!window.__result, undefined, { timeout: 30000 });
                    const observed = await page.evaluate(() => ({ ...window.__result, requests: window.__requests, nativeWebGL1: window.__nativeWebGL1 }));
                    const rejected = mode === 'missing-constructor' || mode === 'context-failure';
                    const checks = {
                        noPageError: pageErrors.length === 0,
                        noWebGL1Fallback: !observed.requests.some(type => type === 'webgl' || type === 'experimental-webgl'),
                        outcome: rejected
                            ? observed.started === false && observed.code === 'WEBGL2_REQUIRED' && observed.inited === false && observed.nativeWebGL1 === true
                            : observed.started === true && observed.api === observed.expectedApi && observed.webgl1Export === 'undefined',
                        visibleFrame: mode !== 'webgl2' || observed.pixel.slice(0, 3).some(value => value > 0),
                    };
                    results.push({ bundle, mode, observed, pageErrors, checks, pass: Object.values(checks).every(Boolean) });
                    console.log(`[webgl2-only] ${bundle} ${mode}: ${results.at(-1).pass ? 'PASS' : 'FAIL'}`);
                } finally { await context.close(); }
            }
        }
        const report = { measuredAt: new Date().toISOString(), runner: 'tools/verify/webgl2-only.cjs', bundles: variants.map(file => ({ file, sha256_16: hash(file) })), completed: true, total: results.length, pass: results.filter(result => result.pass).length, results };
        fs.mkdirSync(path.join(root, 'docs/evidence'), { recursive: true });
        fs.writeFileSync(path.join(root, 'docs/evidence/webgl2-only.json'), JSON.stringify(report, null, 2) + '\n');
        process.exitCode = report.pass === report.total ? 0 : 1;
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
