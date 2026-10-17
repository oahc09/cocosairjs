/* V0.6 T7c — BrowserRuntime：真实浏览器 Trial 通道。
 *
 * start(workspace, benchmark):
 *  1. Fresh Build：esbuild transform src/main.ts（语法/编译错误 → 抛出带 diagnostics）
 *  2. 每 Trial 独立静态服务（随机端口）：workspace 文件 + /build/cocosair.module.js（仓库构建产物）
 *     + /__debug/agent-session.js（tools/debug 会话，cocosair external 走 importmap 共享引擎实例）
 *  3. Fresh Browser Context（Playwright chromium）+ 页面等待 __benchReady
 *  4. channel：inspect/captureFrame/errorReport/executeReference 经 page.evaluate 桥接
 *
 * 执行：node 侧脚本使用（playwright 从 NODE_PATH 提供）。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { serveStaticFile } = require('../../verify/static-file-response.cjs');

const REPO = path.resolve(__dirname, '..', '..', '..');
const DEBUG_BUNDLE_CACHE = new Map();
// esbuild 由调用方注入（本文件会被打包到临时目录，彼处 require 无法解析仓库依赖）。

const BENCH_PRELUDE = `(async function(){
  const cc = await import('/build/cocosair.module.js');
  const deadline = Date.now() + 30000;
  while (!window.__airApp && !window.__apiTrace?.app && Date.now() < deadline) { await new Promise(r => setTimeout(r, 50)); }
  const app = window.__airApp || window.__apiTrace?.app;
  if (!app) { throw new Error('no real AirApp observed from the example (benchmark contract)'); }
  const { createAgentSession } = await import('/__debug/agent-session.js');
  const sceneNow = app.getScene ? app.getScene() : null;
  const session = createAgentSession({ app, writableScenes: sceneNow ? [sceneNow] : [] });
  const canvas = document.getElementById('GameCanvas');
  window.__benchSession = {
    inspectScene: () => session.inspectScene(),
    inspectNode: (id) => session.inspectNode(id),
    inspectAsset: () => session.inspectAsset(),
    getRuntimeErrors: (q) => session.getRuntimeErrors(q),
    dispatch: (req) => session.dispatch(req),
    close: () => session.close(),
    canvasSize: () => ({ width: canvas.width, height: canvas.height }),
    capture: () => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cc.director.off(cc.Director.EVENT_AFTER_DRAW, onDraw); reject(new Error('no rendered frame')); }, 8000);
      function onDraw() {
        cc.director.off(cc.Director.EVENT_AFTER_DRAW, onDraw); clearTimeout(timer);
        try {
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
          const px = new Uint8Array(4);
          gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          resolve({ png: canvas.toDataURL('image/png'), center: [px[0], px[1], px[2]] });
        } catch (e) { reject(e); }
      }
      cc.director.on(cc.Director.EVENT_AFTER_DRAW, onDraw);
    }),
  };
  window.__benchReady = true;
})().catch(e => { window.__benchError = String(e && e.stack || e); });`;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.ts': 'text/javascript',
    '.json': 'application/json',
    '.glb': 'model/gltf-binary',
    '.png': 'image/png',
    '.txt': 'text/plain',
    '.wasm': 'application/wasm',
    '.bin': 'application/octet-stream',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.wav': 'audio/wav',
};

function serveTs(esbuild, res, file) {
    try {
        const out = esbuild.transformSync(fs.readFileSync(file, 'utf8'), {
            loader: 'ts',
            format: 'esm',
            target: 'es2022',
            sourcefile: file,
        });
        res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
        res.end(out.code);
    } catch (error) {
        const err = new Error(`compile failed for ${path.basename(file)}: ${error.message.split('\n')[0]}`);
        err.diagnostics = [String(error.message).slice(0, 500)];
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(err.message);
        throw err;
    }
}

function bundleDebugSession(repo, esbuild) {
    const file = path.join(repo, 'tools', 'debug', 'agent-session.ts');
    const st = fs.statSync(file);
    let entry = DEBUG_BUNDLE_CACHE.get(file);
    if (!entry || entry.mtime !== st.mtimeMs) {
        const result = esbuild.buildSync({
            entryPoints: [file],
            bundle: true,
            format: 'esm',
            target: 'es2022',
            platform: 'browser',
            sourcemap: 'inline',
            external: ['cocosair'],
            outfile: file.replace(/\.ts$/, '.js'),
            write: false,
        });
        entry = { mtime: st.mtimeMs, data: Buffer.from(result.outputFiles[0].contents) };
        DEBUG_BUNDLE_CACHE.set(file, entry);
    }
    return entry.data;
}

class BrowserRuntime {
    constructor({ viewport = { width: 480, height: 360 }, esbuild, repo, browserType, browserLaunch } = {}) {
        if (!esbuild) {
            throw new Error('BrowserRuntime requires esbuild injection');
        }
        if (!repo) {
            throw new Error('BrowserRuntime requires repo injection');
        }
        this.esbuild = esbuild;
        this.REPO = repo;
        this.browserType = browserType || 'chromium';
        // browserLaunch 由调用方显式给出时整体接管 executablePath/args（三引擎铺开用）。
        this.browserLaunch = browserLaunch || null;
        this.viewport = viewport;
        this.generation = 0;
        this.pageErrors = [];
        this.server = null;
        this.browser = null;
        this.context = null;
        this.page = null;
        this.port = 0;
    }

    /** Fresh Build：语法检查 + import 解析（Recipe scenario 不做 strict 类型检查）。 */
    build(workspace) {
        const entry = ['src/main.ts', 'main.ts', 'src/main.js', 'main.js']
            .map((rel) => path.join(workspace.paths.workspace, rel))
            .find((p) => fs.existsSync(p));
        if (!entry) {
            return Promise.resolve({ success: false, diagnostics: ['main.ts/main.js missing'] });
        }
        try {
            const ts = require(require.resolve('typescript', { paths: [this.REPO] }));
            // 纯 JS 示例没有类型合同：跳过 tsc 程序检查，仍走 esbuild bundle 验证语法/解析。
            const diagnostics = path.extname(entry) === '.js' ? [] : this.typecheck(entry, ts, workspace);
            if (diagnostics.length) {
                return Promise.resolve({ success: false, diagnostics });
            }
            const built = this.esbuild.buildSync({
                entryPoints: [entry],
                bundle: true,
                write: false,
                format: 'esm',
                target: 'es2022',
                platform: 'browser',
                loader: { '.ts': 'ts' },
                external: [
                    'cocosair',
                    'cocosair',
                    '/build/cocosair.module.js',
                    '/output/responsive-host/baseline/cocosair.module.js',
                ],
                sourcemap: false,
                logLevel: 'silent',
            });
            this.compiledEntry = { path: entry, code: built.outputFiles[0].text };
            return Promise.resolve({ success: true, diagnostics: [] });
        } catch (error) {
            const diag = String(error.message).split('\n').slice(0, 4).join(' | ').slice(0, 400);
            return Promise.resolve({ success: false, diagnostics: [diag] });
        }
    }

    typecheck(entry, ts, workspace) {
        const options = {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
            strict: false,
            noImplicitAny: false,
            strictNullChecks: false,
            noEmit: true,
            skipLibCheck: true,
            skipDefaultLibCheck: true,
            types: [],
            lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
            baseUrl: workspace.paths.workspace,
            paths: {
                cocosair: [path.join(this.REPO, 'build/cocosair.module.d.ts')],
            },
        };
        // 注入 bench 合同的全局声明（__airApp/__benchSession），不写入 workspace。
        const host = ts.createCompilerHost(options, /* setParentNodes */ false);
        const ambientName = '__air_bench_globals.d.ts';
        const ambientText =
            'declare global {\n  interface Window {\n    __airApp?: unknown;\n    __benchSession?: unknown;\n    __benchReady?: boolean;\n    __benchError?: string;\n    __recipeState?: unknown;\n    __recipeDispose?: unknown;\n  }\n}\nexport {};\n';
        const baseGetSourceFile = host.getSourceFile.bind(host);
        host.getSourceFile = (fileName, languageVersion, onError, shouldCreate, ...rest) => {
            if (fileName === ambientName) {
                return ts.createSourceFile(fileName, ambientText, languageVersion, /* setParentNodes */ true);
            }
            return baseGetSourceFile(fileName, languageVersion, onError, shouldCreate, ...rest);
        };
        const program = ts.createProgram([entry, ambientName], options, host);
        return ts
            .getPreEmitDiagnostics(program)
            .filter((d) => d.code < 2000000 && d.code !== 2307 && d.code !== 2308)
            .filter((d) => !d.file || path.basename(d.file.fileName) !== ambientName)
            .map((d) => {
                const pos = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : null;
                return `${d.file ? path.relative(workspace.paths.workspace, d.file.fileName) : ''}${pos ? ':' + (pos.line + 1) : ''} TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`;
            });
    }

    async start(workspace) {
        try {
            return await this._start(workspace);
        } catch (error) {
            error.message = '[browser-runtime] ' + error.message;
            throw error;
        }
    }
    async _start(workspace) {
        void this.page;
        const generation = this.generation;
        const check = await this.build(workspace);
        if (!check.success) {
            const error = new Error(check.diagnostics.join('\n'));
            error.diagnostics = check.diagnostics;
            throw error;
        }
        const assertActive = () => {
            if (generation !== this.generation) {
                throw new Error('runtime start cancelled');
            }
        };
        assertActive();
        // 2) 静态服务
        const workspaceDir = workspace.paths.workspace;
        this.resourceResponses = [];
        this.server = http.createServer((req, res) => {
            // WebKit media loads can bypass both ResourceTiming and Playwright's
            // response events. Record bytes actually sent for the browser's request.
            if (/\.(wav|mp3|ogg|mp4|glb|gltf|bin|json|png|jpe?g|webp|ktx2|basis)(?:[?#]|$)/i.test(req.url || '')) {
                let writtenBytes = 0;
                const write = res.write;
                res.write = (chunk, ...args) => {
                    writtenBytes +=
                        Buffer.isBuffer(chunk) || chunk instanceof Uint8Array
                            ? chunk.length
                            : typeof chunk === 'string'
                              ? Buffer.byteLength(chunk)
                              : 0;
                    return write.call(res, chunk, ...args);
                };
                const end = res.end;
                res.end = (...args) => {
                    const body = args[0];
                    const size =
                        Buffer.isBuffer(body) || body instanceof Uint8Array
                            ? body.length
                            : typeof body === 'string'
                              ? Buffer.byteLength(body)
                              : 0;
                    res.once('finish', () =>
                        this.resourceResponses.push({
                            url: `http://127.0.0.1:${this.port}${req.url}`,
                            status: res.statusCode,
                            size: writtenBytes + size,
                            observation: 'server-response',
                        }),
                    );
                    return end.apply(res, args);
                };
            }
            try {
                const p = decodeURIComponent((req.url || '/').split('?')[0]);
                if (p === '/__bench-prelude.js') {
                    res.writeHead(200, { 'Content-Type': MIME['.js'] });
                    res.end(BENCH_PRELUDE);
                    return;
                }
                if (p === '/__debug/agent-session.js') {
                    res.writeHead(200, { 'Content-Type': MIME['.js'] });
                    res.end(bundleDebugSession(this.REPO, this.esbuild));
                    return;
                }
                if (p === '/favicon.ico') {
                    res.writeHead(204);
                    res.end();
                    return;
                }
                if (p.startsWith('/build/')) {
                    const buildFile = path.join(this.REPO, p);
                    if (fs.existsSync(buildFile)) {
                        res.writeHead(200, {
                            'Content-Type': MIME[path.extname(buildFile)] || 'application/octet-stream',
                        });
                        res.end(fs.readFileSync(buildFile));
                        return;
                    }
                    console.error('[bench-404]', p);
                    res.writeHead(404);
                    res.end('not found');
                    return;
                }
                let rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
                let file = path.join(workspaceDir, rel);
                if (!fs.existsSync(file) && /\.js$/.test(file) && fs.existsSync(file.replace(/\.js$/, '.ts'))) {
                    file = file.replace(/\.js$/, '.ts');
                }
                if (!fs.existsSync(file) && !path.extname(rel)) {
                    file = path.join(workspaceDir, rel, 'index.html');
                }
                if (!fs.existsSync(file) || !file.startsWith(workspaceDir)) {
                    console.error('[bench-404]', p, file);
                    res.writeHead(404);
                    res.end('not found');
                    return;
                }
                if (file === this.compiledEntry.path) {
                    res.writeHead(200, { 'Content-Type': MIME['.js'] });
                    res.end(this.compiledEntry.code);
                    return;
                }
                if (/\.ts$/.test(file)) {
                    serveTs(this.esbuild, res, file);
                    return;
                }
                serveStaticFile(req, res, file, MIME[path.extname(file)] || 'application/octet-stream');
            } catch (error) {
                console.error('[bench-serve]', req && req.url, '→', String(error.message || error).slice(0, 200));
                if (!res.headersSent) {
                    res.writeHead(500);
                    res.end(String(error.message || error));
                }
            }
        });
        await new Promise((resolve) => {
            this.server.listen(0, '127.0.0.1', resolve);
        });
        this.port = this.server.address().port;
        // 3) Fresh Browser Context
        var pw = require('playwright');
        var launcher = pw[this.browserType] || pw.chromium;
        var launchOpts = { headless: true };
        if (this.browserLaunch) {
            Object.assign(launchOpts, this.browserLaunch);
        } else if (this.browserType === 'chromium') {
            // chromium-1228 是已安装的旧版但可与当前 Playwright 版本配合使用
            launchOpts.executablePath =
                process.env.AIR_CHROMIUM_PATH ||
                [
                    'C:',
                    'Users',
                    'caosh',
                    'AppData',
                    'Local',
                    'ms-playwright',
                    'chromium-1228',
                    'chrome-win64',
                    'chrome.exe',
                ].join('\\');
            launchOpts.args = ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'];
        }
        const browser = await launcher.launch(launchOpts);
        if (generation !== this.generation) {
            await browser.close();
            throw new Error('runtime start cancelled');
        }
        this.browser = browser;
        const context = await browser.newContext({ viewport: this.viewport });
        if (generation !== this.generation) {
            await context.close();
            await browser.close();
            throw new Error('runtime start cancelled');
        }
        this.context = context;
        this.pageErrors = [];
        this.consoleErrors = [];
        this.page = await this.context.newPage();
        // 页面错误可见性（dev server Task 13 同语义）：诊断 Benchmark 页面加载失败
        this.page.on('console', (m) => {
            if (m.type() === 'error') {
                this.consoleErrors.push(m.text());
                console.error('[bench-page]', m.text().slice(0, 300));
            }
        });
        this.page.on('pageerror', (e) => {
            this.pageErrors.push({
                seq: this.pageErrors.length + 1,
                category: 'window-error',
                message: String(e).slice(0, 1000),
            });
        });
        const query = workspace.entryQuery ? '?' + new URLSearchParams(workspace.entryQuery).toString() : '';
        await this.page.goto(`http://127.0.0.1:${this.port}/index.html${query}`, { waitUntil: 'load', timeout: 30000 });
        // Some applications intentionally defer engine startup until a real user action.
        if (workspace.startupButtonText) {
            await this.page.getByRole('button', { name: workspace.startupButtonText, exact: true }).click();
        }
        await this.page.waitForFunction(() => window.__benchReady === true || !!window.__benchError, undefined, {
            timeout: 45000,
        });
        const benchError = await this.page.evaluate(() => window.__benchError || null);
        if (benchError) {
            throw new Error(`bench prelude failed: ${benchError.slice(0, 300)}`);
        }
        assertActive();
        return this.channel();
    }

    channel() {
        const page = this.page;
        const channel = {
            inspect: async (query) =>
                page.evaluate(async (q) => {
                    const s = window.__benchSession;
                    if (q.kind === 'inspectNode') {
                        return s.inspectNode(q.id);
                    }
                    if (q.kind === 'inspectScene') {
                        return s.inspectScene();
                    }
                    if (q.kind === 'custom') {
                        const fn = window[q.query];
                        return fn ? fn() : null;
                    }
                    if (q.kind === 'dispatch') {
                        const response = await s.dispatch({
                            requestId: q.requestId,
                            action: q.action,
                            targetId: q.targetId,
                            params: q.params,
                        });
                        if (!response.ok) {
                            throw new Error(q.action + ' failed: ' + response.error.code);
                        }
                        return response.result;
                    }
                    return s.inspectAsset();
                }, query),
            captureFrame: async () => {
                const cap = await page.evaluate(() => window.__benchSession.capture());
                const size = await page.evaluate(() => window.__benchSession.canvasSize());
                return { png: cap.png, width: size.width, height: size.height, sceneId: 'page', frameIndex: 0 };
            },
            errorReport: async (query) => page.evaluate((q) => window.__benchSession.getRuntimeErrors(q), query ?? {}),
            executeReference: async (op) =>
                page.evaluate(async (operation) => {
                    const s = window.__benchSession;
                    if (operation.op === 'inspectScene') {
                        const summary = s.inspectScene();
                        if (operation.expect) {
                            for (const [type, count] of Object.entries(operation.expect.componentsByType || {})) {
                                if ((summary.componentsByType[type] || 0) < count) {
                                    throw new Error(
                                        `expect ${type}>=${count}, got ${summary.componentsByType[type] || 0}`,
                                    );
                                }
                            }
                        }
                        return summary;
                    }
                    if (operation.op === 'inspectNode') {
                        const summary = s.inspectScene();
                        const hit = summary.nodes.find((n) => n.name === operation.name);
                        if (!hit) {
                            throw new Error(`node ${operation.name} not found`);
                        }
                        const view = s.inspectNode(hit.id);
                        if (operation.expect && operation.expect.position) {
                            const p = view.local.position;
                            operation.expect.position.forEach((v, i) => {
                                if (Math.abs(p[i] - v) > 1e-3) {
                                    throw new Error(
                                        `position ${JSON.stringify(p)} != ${JSON.stringify(operation.expect.position)}`,
                                    );
                                }
                            });
                        }
                        return view;
                    }
                    if (operation.op === 'dispatch') {
                        const response = await s.dispatch(operation);
                        if (!response.ok) {
                            throw new Error(
                                operation.action + ' failed: ' + response.error.code + ' ' + response.error.message,
                            );
                        }
                        return response.result;
                    }
                    if (operation.op === 'captureFrame') {
                        return s.capture();
                    }
                    throw new Error(`unknown reference op: ${operation.op}`);
                }, op),
            snapshot: async () => {
                const data = await page.evaluate(async () => {
                    const s = window.__benchSession;
                    const scene = s.inspectScene();
                    const nodes = {};
                    for (const entry of scene.nodes.slice(0, 100)) {
                        nodes[entry.id] = s.inspectNode(entry.id);
                    }
                    const assets = s.inspectAsset();
                    const errors = s.getRuntimeErrors({ limit: 50 });
                    const cap = await s.capture();
                    return { scene, nodes, assets, errors, cap };
                });
                const size = await page.evaluate(() => window.__benchSession.canvasSize());
                // 能力合同：页面出现稳定错误码 decoder-required → 该环境缺对应 decoder 配置
                const runtimeErrors = [
                    ...data.errors.errors,
                    ...this.pageErrors.filter((e) => !data.errors.errors.some((x) => x.message.includes(e.message))),
                ];
                const decoderRequired = runtimeErrors.some((e) => /decoder-required/.test(e.message));
                return {
                    capability: decoderRequired
                        ? { name: 'draco-decoder', status: 'unsupported' }
                        : { name: 'webgl2', status: 'supported' },
                    scene: data.scene,
                    nodes: data.nodes,
                    assets: data.assets,
                    capture: {
                        png: data.cap.png,
                        width: size.width,
                        height: size.height,
                        sceneId: data.scene.sceneId,
                        frameIndex: 1,
                    },
                    centerPixel: data.cap.center,
                    runtimeErrors,
                };
            },
        };
        return channel;
    }

    async stop() {
        ++this.generation;
        try {
            if (this.context) {
                await this.context.close();
            }
        } catch {
            /* 已关闭 */
        }
        try {
            if (this.browser) {
                await this.browser.close();
            }
        } catch {
            /* 已关闭 */
        }
        await new Promise((resolve) => {
            if (this.server) {
                this.server.close(resolve);
                this.server.closeAllConnections?.();
            } else {
                resolve();
            }
        });
        this.context = this.browser = this.page = this.server = null;
    }
}

module.exports = { BrowserRuntime };
