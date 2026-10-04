/*
 * air-texture-orientation-browser — PG-24 纹理源方向三浏览器验证 runner。
 *
 * 执行（Playwright 经 NODE_PATH 指向独立工具链，勿装项目依赖）：
 *   NODE_PATH=output/playwright/tooling/node_modules node tools/verify/air-texture-orientation-browser.cjs \
 *     --browser=all --out=docs/evidence/texture-orientation/<name>.json
 *
 * 合同：同一自产非对称四角标记图样，经公开 ImageAsset/Texture2D/原生渲染链比较
 * HTMLImageElement/HTMLCanvasElement/ImageBitmap/ImageData/原始 TypedArray 五类源；
 * gl.readPixels 四象限采样证明 UV/上下/左右；3D plane（MeshRenderer + builtin-unlit）
 * 对照；资源释放计数如实记录；不使用 gl.pixelStore、不做替身算法、不改 glTF。
 * GPU 物理内存量不可测 → 报告内 GPU_MEMORY: unavailable。
 * 报告 subset=true / completed=false：本 runner 只覆盖纹理方向子集，不是全量验收。
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');

const root = path.resolve(__dirname, '..', '..');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');

// fixture 的方向合同单源（Jest 回归直接 require 本函数；浏览器页由 esbuild 打包同一份）。
function loadContract () {
    const code = esbuild.transformSync(
        fs.readFileSync(path.join(root, 'test/fixtures/texture-orientation/contract.ts'), 'utf8'),
        { format: 'cjs', loader: 'ts' },
    ).code;
    const module = { exports: {} };
    new Function('module', 'exports', code)(module, module.exports);
    return module.exports;
}

async function main () {
    const startedAt = new Date().toISOString();
    const args = process.argv.slice(2);
    if (args.some((arg) => !/^--(?:browser|out)=/.test(arg))) {
        throw new Error('usage: node tools/verify/air-texture-orientation-browser.cjs --browser=chromium|firefox|webkit|all --out=<new.json>');
    }
    const selected = args.find((arg) => arg.startsWith('--browser='))?.split('=')[1] || 'all';
    const engines = selected === 'all' ? ['chromium', 'firefox', 'webkit'] : [selected];
    if (engines.some((engine) => !['chromium', 'firefox', 'webkit'].includes(engine))) throw new Error('unknown browser');
    const out = args.find((arg) => arg.startsWith('--out='))?.slice(6);
    if (out && fs.existsSync(path.resolve(root, out))) throw new Error('report already exists; choose a new output path');

    const contract = loadContract();
    const files = [
        'build/cocosair.module.js',
        'test/fixtures/texture-orientation/index.html',
        'test/fixtures/texture-orientation/main.ts',
        'test/fixtures/texture-orientation/contract.ts',
        'test/fixtures/texture-orientation/quad.gltf',
        'test/fixtures/texture-orientation/quad.bin',
        'test/fixtures/texture-orientation/quad-pattern.png',
        'tools/verify/air-texture-orientation-browser.cjs',
        'examples/shared/canvas-texture.js',
    ];
    const fingerprints = Object.fromEntries(files.map((file) => [file, hash(file)]));

    const server = await startExampleServer(root);
    const results = [];
    const screenshots = [];
    let playwright;
    try {
        playwright = require('playwright');
        for (const engine of engines) {
            let browser;
            let stage = 'infrastructure';
            try {
                console.error(`[tex-orient] ${engine}: launch`);
                browser = await playwright[engine].launch({ ...launchOptions(engine), headless: true });
                const context = await browser.newContext({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
                const page = await context.newPage();
                const pageErrors = [];
                page.on('pageerror', (error) => pageErrors.push(String(error.stack || error)));
                // fixture main.ts 经 esbuild 编译后按路由交付（importmap 解析 cocosair → 共享 bundle）
                const built = esbuild.buildSync({
                    entryPoints: [path.join(root, 'test/fixtures/texture-orientation/main.ts')],
                    bundle: true, write: false, format: 'esm', target: 'es2022', platform: 'browser', external: ['cocosair'],
                });
                await page.route('**/main.ts', (route) => route.fulfill({ contentType: 'text/javascript', body: built.outputFiles[0].text }));
                stage = 'engine';
                await page.goto(`${server.origin}/test/fixtures/texture-orientation/index.html`);
                await page.waitForFunction(() => window.__texProbe?.ready === true, null, { timeout: 60000 });
                const probe = await page.evaluate(() => window.__texProbe.snapshot());
                assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);

                const sourceResults = probe.results.map((result) => {
                    const contractEntry = contract.SOURCE_CONTRACT.find((entry) => entry.source === result.source);
                    return {
                        source: result.source,
                        acceptedByPublicType: result.acceptedByPublicType,
                        samples: result.samples,
                        observedTexels: result.observedTexels,
                        classify: result.classify,
                        release: result.release,
                        error: result.error ?? null,
                        contract: contractEntry ?? null,
                    };
                });
                const threeDBySource = probe.threeDBySource ?? {};
                const gltf = probe.gltf ?? null;
                const interleave = probe.interleave ?? null;

                const screenshotPath = path.resolve(root, `output/playwright/texture-orientation-${engine}.png`);
                fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
                await page.screenshot({ path: screenshotPath });
                screenshots.push(path.relative(root, screenshotPath).replace(/\\/g, '/'));

                results.push({
                    engine,
                    browserVersion: browser.version(),
                    status: 'PASS',
                    stage,
                    sources: sourceResults,
                    interleave,
                    threeDBySource,
                    gltf,
                    pageErrors,
                    screenshot: path.relative(root, screenshotPath).replace(/\\/g, '/'),
                    rawLog: path.relative(root, screenshotPath).replace(/\.png$/, '.log'),
                });
                fs.writeFileSync(
                    path.resolve(root, `output/playwright/texture-orientation-${engine}.log`),
                    JSON.stringify({ engine, probe, pageErrors }, null, 2) + '\n',
                );
                await context.close();
            } catch (error) {
                results.push({ engine, status: 'FAIL', stage, error: String(error.stack || error) });
            } finally {
                if (browser) await browser.close();
                stage = 'infrastructure';
            }
        }
        for (const file of files) {
            assert.equal(hash(file), fingerprints[file], `source or bundle drift: ${file}`);
        }
        const report = {
            schemaVersion: 'air-texture-orientation/2',
            startedAt,
            endedAt: new Date().toISOString(),
            command: process.argv,
            cwd: root,
            nodeVersion: process.version,
            playwrightVersion: require('playwright/package.json').version,
            fingerprints,
            scope: [
                'PG-24 texture source orientation: five source kinds via public ImageAsset/Texture2D/native render chain',
                'per-source UV/vertical/horizontal pixel assertions via gl.readPixels quadrant sampling',
                '3D plane (MeshRenderer + builtin-unlit) convention probe',
                'resource release ref-count evidence per source',
            ],
            gpuMemory: 'unavailable（当前引擎/管线无公开 GPU 物理内存计数器，如实记录不推断）',
            subset: true,
            completed: false,
            unverified: [
                'glTF sampler/UV 补偿层不改动、仅引用既有证据（NP01/CB-16）',
                '物理设备显示差异、color space 联动（CB-16）',
                '完整 35 项计划范围',
            ],
            results,
            screenshots,
        };
        if (out) {
            const target = path.resolve(root, out);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        }
        console.log(JSON.stringify(report, null, 2));
        const failures = results.filter((result) => result.status !== 'PASS');
        console.error(`[tex-orient] engines=${results.length} failures=${failures.length}`);
        process.exitCode = failures.length ? 1 : 0;
    } finally {
        await server.close();
    }
}

main().catch((error) => {
    console.error(String(error.stack || error));
    process.exitCode = 1;
});
