/* V1.1 G1 — Gallery 发布 Artifact：build/examples 自包含静态部署物 + 嵌套部署 + 路由回归。
 *
 * 1) build：node tools/verify/gallery-artifact.cjs build
 *    产出 build/examples/（引擎 + 解码器 + 全部示例 + files.json + gallery + thumbnails/<id>.png），
 *    全部路径改写为相对路径（支持嵌套挂载部署）。
 * 2) 验证：node tools/verify/gallery-artifact.cjs verify
 *    仅预检静态依赖：node tools/verify/gallery-artifact.cjs scan（只读，输出 JSON，不启动浏览器）。
 *    以 /apps/gallery/ 嵌套前缀静态服务 artifact，Playwright 做独立部署验收：
 *      · 交付物字节扫描（无仓库根 /build/ 绝对引用、无根绝对 fetch/src/href/import）
 *      · 引擎字节货币（F-86）：build/examples/cocosair.module.js 必须与 build/cocosair.module.js 逐字节相同，
 *        否则 mode verify 会在认证两天前的旧引擎（证据里同时落双方 sha256_16）
 *      · 解码器发布集（meshopt/draco/basis 文件必须在包内）
 *      · 静态入口与全量非 DevTools 示例缩略图 200
 *      · Gallery 列表、#deep-link、Source 源码查看
 *      · 全部非 DevTools 示例按 ex.dir 真实启动（不是 3 个样本）
 *      · §25 资源释放合同在部署物内成立（window.__lifecycle 全跑）
 *      · 压缩示例确实请求解码文件 + 稳定状态（meshopt wasm / draco 缺失码）
 *      · 零 4xx/5xx 与失败请求、零 page error、零外部 origin 请求（不依赖 DevTools/agent）
 *    证据：docs/evidence/gallery-artifact.json
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { serveStaticFile } = require('./static-file-response.cjs');
const REPO = path.resolve(__dirname, '..', '..');
const esbuild = require(path.join(REPO, 'node_modules', 'esbuild'));
const overrideArtifact = process.env.COCOSAIR_GALLERY_ARTIFACT;
const ARTIFACT = overrideArtifact ? path.resolve(overrideArtifact) : path.join(REPO, 'build', 'examples');
if (overrideArtifact) {
    const tempRoot = path.resolve(os.tmpdir());
    if (!ARTIFACT.toLowerCase().startsWith((tempRoot + path.sep).toLowerCase())) {
        throw new Error('COCOSAIR_GALLERY_ARTIFACT must be a child directory of the system temp directory');
    }
}
const EVIDENCE_PATH = path.join(REPO, 'docs', 'evidence', 'gallery-artifact.json');

async function buildArtifact() {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'examples', 'files.json'), 'utf8'));
    const selected = process.env.COCOSAIR_GALLERY_EXAMPLES?.split(',')
        .map((id) => id.trim())
        .filter(Boolean);
    if (selected) {
        for (const id of selected)
            if (!manifest.examples.some((ex) => ex.id === id)) throw new Error(`Unknown Gallery example: ${id}`);
        manifest.examples = manifest.examples.filter((ex) => selected.includes(ex.id));
        manifest.categories = Object.fromEntries(
            Object.entries(manifest.categories)
                .map(([category, ids]) => [category, ids.filter((id) => selected.includes(id))])
                .filter(([, ids]) => ids.length),
        );
        manifest.subset = true;
    }
    const selectedDirs = new Set(manifest.examples.map((ex) => ex.dir.split('/')[0]));
    fs.rmSync(ARTIFACT, { recursive: true, force: true });
    fs.mkdirSync(ARTIFACT, { recursive: true });
    // 引擎与解码器（根相对）
    fs.copyFileSync(path.join(REPO, 'build', 'cocosair.module.js'), path.join(ARTIFACT, 'cocosair.module.js'));
    if (manifest.examples.some((ex) => ex.id === 'spark-splats')) {
        const moduleFile = path.join(REPO, 'build', 'spark.module.js');
        if (!fs.existsSync(moduleFile)) throw new Error('Spark example requires npm run build:spark');
        fs.copyFileSync(moduleFile, path.join(ARTIFACT, 'spark.module.js'));
    }

    fs.cpSync(path.join(REPO, 'build', 'gltf-decoders'), path.join(ARTIFACT, 'gltf-decoders'), { recursive: true });
    if (manifest.examples.some((ex) => ex.id === 'webgpu-basic'))
        fs.cpSync(path.join(REPO, 'build', 'webgpu'), path.join(ARTIFACT, 'webgpu'), { recursive: true });
    // 示例（manifest 登记目录 + 共享库）。未登记实验页不混入静态交付物。
    // shared/bench.* 是 V0.5.1 的 DevTools/基准测量台：
    // 它的 importmap 写死仓库根 /build/ 且需要 agent 通道，不属于静态交付物，故不随包发布。
    fs.cpSync(path.join(REPO, 'examples'), ARTIFACT, {
        recursive: true,
        filter: (src) => {
            const relative = path.relative(path.join(REPO, 'examples'), src),
                first = relative.split(path.sep)[0];
            if (
                relative &&
                fs.statSync(src).isDirectory() &&
                !['shared', 'assets'].includes(first) &&
                !selectedDirs.has(first)
            )
                return false;
            return (
                !src.includes(`${path.sep}node_modules`) &&
                !src.endsWith('files.json') &&
                !/(^|[\\/])verify\.cjs$/.test(relative) &&
                !/[\\/]shared[\\/]bench\.(html|ts)$/.test(src)
            );
        },
    });
    fs.writeFileSync(path.join(ARTIFACT, 'files.json'), JSON.stringify(manifest, null, 2) + '\n');
    // 示例 index.html importmap → 相对引擎；示例源内 /build/ 引用 → 相对
    let rewrites = 0;
    for (const ex of manifest.examples) {
        const exDir = path.join(ARTIFACT, ex.dir);
        const htmlPath = path.join(exDir, 'index.html');
        if (fs.existsSync(htmlPath)) {
            const html = fs.readFileSync(htmlPath, 'utf8');
            fs.writeFileSync(
                htmlPath,
                html
                    .split('"/build/cocosair.module.js"')
                    .join('"../cocosair.module.js"')
                    .split('"/build/spark.module.js"')
                    .join('"../spark.module.js"')
                    .replace(/(\bhref\s*=\s*)(["'])\/\2/g, '$1$2../gallery.html$2'),
            );
            rewrites++;
        }
        for (const entry of ['src/main.ts', 'src/main.js', 'main.ts', 'main.js']) {
            const srcPath = path.join(exDir, entry);
            if (fs.existsSync(srcPath)) {
                const code = fs.readFileSync(srcPath, 'utf8');
                // 示例用字符串拼接藏 decoder URL（避免 bundler 静态解析），因此这里必须按前缀匹配：
                // 旧实现要求 '/build/gltf-decoders/' 带尾斜杠，`'/build/gltf-decoders' + '/meshopt/…'`
                // 永不命中，导致 meshopt 部署物仍指向仓库根（静态挂载下必然 404 而门禁无感）。
                const fixed = code
                    .replace(
                        /(["'])\/build\/gltf-decoders([^"']*)\1/g,
                        (m, q, suffix) => `new URL(${q}../gltf-decoders${suffix}${q}, document.baseURI).href`,
                    )
                    .replace(/(["'])\/build\/cocosair\.module\.js/g, (m, q) => q + '../cocosair.module.js');
                if (fixed !== code) {
                    fs.writeFileSync(srcPath, fixed);
                    rewrites++;
                }
            }
        }
    }
    // gallery.html → 相对路径 + 缩略图挂载
    const galleryPath = path.join(ARTIFACT, 'gallery.html');
    let gallery = fs.readFileSync(galleryPath, 'utf8');
    gallery = gallery.split("fetch('/files.json')").join("fetch('files.json')");
    gallery = gallery
        .split("document.getElementById('preview-frame').src = '/' + ex.dir + '/';")
        .join("document.getElementById('preview-frame').src = './' + ex.dir + '/';");
    gallery = gallery
        .split(
            "    '/' + currentExample.dir + '/src/main.ts',\n    '/' + currentExample.dir + '/src/main.js',\n    '/' + currentExample.dir + '/main.js',\n    '/' + currentExample.dir + '/main.ts'",
        )
        .join(
            "    './' + currentExample.dir + '/src/main.ts',\n    './' + currentExample.dir + '/src/main.js',\n    './' + currentExample.dir + '/main.js',\n    './' + currentExample.dir + '/main.ts'",
        );
    gallery = gallery
        .split('  <div id="spec-panel">')
        .join(
            '  <img id="spec-thumb" alt="" style="display:none;max-height:120px;border:1px solid #334;border-radius:4px;margin:6px 0">\n  <div id="spec-panel">',
        );
    gallery = gallery
        .split("  document.getElementById('spec-expected').textContent =")
        .join(
            "  var thumb = document.getElementById('spec-thumb');\n  thumb.src = './thumbnails/' + ex.id + '.png';\n  thumb.style.display = 'none';\n  thumb.onload = function () { thumb.style.display = ''; };\n  document.getElementById('spec-expected').textContent =",
        );
    fs.writeFileSync(galleryPath, gallery);
    // 入口编译：静态部署物无法即时转译 TS —— 每个示例入口 esbuild bundle 成 main.boot.js
    let compiled = 0;
    for (const ex of manifest.examples) {
        const exDir = path.join(ARTIFACT, ex.dir);
        let entry = null;
        for (const cand of ['src/main.ts', 'src/main.js', 'main.ts', 'main.js']) {
            const p = path.join(exDir, cand);
            if (fs.existsSync(p)) {
                entry = p;
                break;
            }
        }
        if (!entry) {
            continue;
        }
        await esbuild.build({
            entryPoints: [entry],
            bundle: true,
            format: 'esm',
            target: 'es2022',
            platform: 'browser',
            external: ['cocosair'],
            plugins: [
                {
                    name: 'gallery-runtime-dependencies',
                    setup(build) {
                        build.onResolve({ filter: /cocosair\.module\.js$/ }, (args) => {
                            if (args.path.startsWith('/output/'))
                                return { path: args.path, namespace: 'gallery-diagnostic-only' };
                            if (args.path === '../cocosair.module.js' || args.path === '/build/cocosair.module.js')
                                return { path: 'cocosair', external: true };
                        });
                        build.onResolve({ filter: /tools\/recipes\/board-state\.js$/ }, (args) => ({
                            path: require('../dev/resolve-script.cjs').resolveScript(
                                path.join(REPO, 'tools/recipes/board-state.js'),
                            ),
                        }));
                        build.onLoad({ filter: /.*/, namespace: 'gallery-diagnostic-only' }, () => ({
                            contents:
                                'throw new Error("Legacy baseline comparison requires repository diagnostics and is unavailable in the standalone Gallery.");',
                            loader: 'js',
                        }));
                    },
                },
            ],
            loader: { '.ts': 'ts' },
            outfile: path.join(path.dirname(entry), 'main.boot.js'),
            logLevel: 'silent',
        });
        const htmlPath = path.join(exDir, 'index.html');
        const bootUrl = './' + path.relative(exDir, path.join(path.dirname(entry), 'main.boot.js')).replace(/\\/g, '/');
        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html
            .split('./src/main.ts')
            .join(bootUrl)
            .split('./src/main.js')
            .join(bootUrl)
            .split('./main.ts')
            .join(bootUrl)
            .split('./main.js')
            .join(bootUrl);
        fs.writeFileSync(htmlPath, html);
        compiled++;
    }
    console.log('[gallery-artifact] compiled entries:', compiled);

    // 缩略图（截图生命周期：artifact 内随包发布当期验证截图）
    const thumbDir = path.join(ARTIFACT, 'thumbnails');
    fs.mkdirSync(thumbDir, { recursive: true });
    const evidenceDir = path.join(REPO, 'docs', 'evidence', 'examples');
    let thumbs = 0;
    if (fs.existsSync(evidenceDir)) {
        for (const file of fs.readdirSync(evidenceDir)) {
            if (file.endsWith('.png')) {
                fs.copyFileSync(path.join(evidenceDir, file), path.join(thumbDir, file));
                thumbs++;
            }
        }
    }
    console.log(
        `[gallery-artifact] built ${path.relative(REPO, ARTIFACT)}: ${manifest.examples.length} examples, ${thumbs} thumbnails, ${rewrites} path rewrites`,
    );
    return { examples: manifest.examples.length, thumbnails: thumbs, rewrites };
}

function serve(rootDir, mount) {
    const MIME = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.ts': 'text/javascript',
        '.json': 'application/json',
        '.glb': 'model/gltf-binary',
        '.png': 'image/png',
        '.gltf': 'model/gltf+json',
        '.bin': 'application/octet-stream',
        '.wasm': 'application/wasm',
        '.css': 'text/css',
    };
    const server = http.createServer((req, res) => {
        try {
            let p = decodeURIComponent((req.url || '/').split('?')[0]);
            if (!p.startsWith(mount + '/')) {
                res.writeHead(404);
                res.end();
                return;
            }
            p = p.slice(mount.length + 1) || 'index.html';
            let file = path.join(rootDir, p);
            if (!fs.existsSync(file) || !file.startsWith(rootDir)) {
                res.writeHead(404);
                res.end();
                return;
            }
            if (fs.statSync(file).isDirectory()) {
                file = path.join(file, 'index.html');
            } // 目录 URL → index.html
            if (!fs.existsSync(file)) {
                res.writeHead(404);
                res.end();
                return;
            }
            serveStaticFile(req, res, file, MIME[path.extname(file)] || 'application/octet-stream');
        } catch (e) {
            try {
                res.writeHead(500);
                res.end();
            } catch (e2) {
                /* ignore */
            }
        }
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    });
}

/** 交付物字节扫描：静态部署物不得依赖仓库布局或宿主服务。
 *  命中即缺陷（不是"风格问题"）：根绝对路径在嵌套挂载（/apps/gallery）下 404，
 *  ws:// / localhost: 意味着部署物仍要求 DevTools/agent 通道在线。 */
function scanArtifactBytes() {
    // 只扫会被浏览器取用/解析的字节：.json 里同样有引用源码行文本的 provenance，
    // 那是审计元数据而非运行时依赖，混进来只会制造假阳性。
    const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.cjs', '.ts', '.css', '.gltf']);
    const SKIP_DIR = new Set(['node_modules', 'thumbnails', 'gltf-decoders']);
    const PATTERNS = [
        { id: 'root-absolute-build', re: /["'`]\/build\//, why: '根绝对 /build/ 引用（部署物内需相对化）' },
        { id: 'root-absolute-fetch', re: /fetch\s*\(\s*["'`]\/(?!\/)/, why: '根绝对 fetch（嵌套挂载下 404）' },
        { id: 'root-absolute-attr', re: /(?:src|href)\s*=\s*["']\/(?!\/)/, why: '根绝对 src/href 属性' },
        { id: 'root-absolute-import', re: /^\s*import[^;\n]*["']\/(?!\/)/m, why: '根绝对 import' },
    ];
    const hits = [];
    (function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const abs = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!SKIP_DIR.has(entry.name)) {
                    walk(abs);
                }
                continue;
            }
            if (!TEXT_EXT.has(path.extname(entry.name))) {
                continue;
            }
            const rel = path.relative(ARTIFACT, abs).split(path.sep).join('/');
            let text = '';
            try {
                text = fs.readFileSync(abs, 'utf8');
            } catch (e) {
                continue;
            }
            if (text.includes('\u0000')) {
                continue;
            }
            const lines = text.split('\n');
            for (const pat of PATTERNS) {
                for (let i = 0; i < lines.length; i++) {
                    if (pat.re.test(lines[i])) {
                        hits.push({
                            pattern: pat.id,
                            why: pat.why,
                            file: rel,
                            line: i + 1,
                            snippet: lines[i].trim().slice(0, 120),
                        });
                        break;
                    }
                }
            }
        }
    })(ARTIFACT);
    return hits;
}

/** 字节货币绑定（F-86）：部署物里的引擎必须与本次构建的引擎逐字节相同，
 *  否则 `mode verify` 会认证一份陈旧的 build/examples（历史读数曾测到 F-70 之前的引擎）。 */
function engineCopyState() {
    const artifactCopy = path.join(ARTIFACT, 'cocosair.module.js');
    const liveBundle = path.join(REPO, 'build', 'cocosair.module.js');
    const sha = (file) =>
        fs.existsSync(file)
            ? require('crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16)
            : null;
    const artifact = sha(artifactCopy);
    const live = sha(liveBundle);
    return { artifact, live, identical: artifact !== null && artifact === live };
}

/** 解码器发布集：build/gltf-decoders 必须整体随 artifact 走，否则压缩示例在静态部署必然失败。 */
function checkDecoderSet() {
    const root = path.join(ARTIFACT, 'gltf-decoders');
    const required = [
        'meshopt/meshopt_decoder.mjs',
        // Draco ships the Node/CommonJS entry and wasm. Presence is packaging evidence,
        // not browser decode evidence; apps must inject their own browser decoder factory.
        'draco/draco3d.js',
        'draco/draco_decoder.wasm',
        'basis/basis_transcoder.js',
    ];
    const missing = required.filter((rel) => !fs.existsSync(path.join(root, rel)));
    const present = fs.existsSync(root)
        ? fs.readdirSync(root, { recursive: true }).filter((p) => !fs.statSync(path.join(root, p)).isDirectory())
        : [];
    return { missing, present: present.length };
}

async function verifyArtifact() {
    const runnerSha256 = require('crypto').createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
    var pw = require('playwright');
    const mount = '/apps/gallery';
    const { server, port } = await serve(ARTIFACT, mount);
    const base = `http://127.0.0.1:${port}${mount}`;
    const results = [];
    const check = (id, ok, detail) => {
        results.push({ id, ok, detail: String(detail || '').slice(0, 200) });
        console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail || ''}`);
        return ok;
    };
    let browser;
    try {
        browser = await pw.chromium.launch({
            headless: true,
            ...require('./browser-engines.cjs').launchOptions('chromium'),
            ...(process.env.AIR_CHROMIUM_PATH ? { executablePath: process.env.AIR_CHROMIUM_PATH } : {}),
        });
        const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
        const pageErrors = [];
        const gpuValidationErrors = [];
        const failedRequests = [];
        const externalRequests = [];
        let currentUrl = '';
        page.on('console', (message) => {
            if (message.type() === 'error' && message.text().includes('[WEBGPU_VALIDATION_ERROR]'))
                gpuValidationErrors.push(`${currentUrl}: ${message.text()}`);
        });
        page.on('pageerror', (e) =>
            pageErrors.push(
                `${path.basename(currentUrl)}: ${String(e).slice(0, 150)} :: stack=${String(e.stack || '')
                    .split('\n')
                    .slice(1, 3)
                    .join(' | ')
                    .slice(0, 260)}`,
            ),
        );
        page.on('response', (res) => {
            const url = res.url();
            // favicon 是浏览器默认探测，不是交付资产；其余 4xx/5xx 一律算部署缺陷。
            if (res.status() >= 400 && !/\/favicon\.ico$/.test(url)) {
                failedRequests.push(`${res.status()} ${url.replace(base, '')}`);
            }
        });
        page.on('requestfailed', (req) => {
            // ERR_ABORTED = 本 verify 自身的页面导航把在途请求取消（boot 循环逐例 goto 的必然副产品），
            // 不是部署缺陷；其余网络级失败（DNS/拒绝连接/证书）仍如实计数。
            const et = (req.failure() && req.failure().errorText) || '';
            if (/ERR_ABORTED/i.test(et)) {
                return;
            }
            failedRequests.push(`FAILED ${req.url().replace(base, '')}`);
        });
        page.on('request', (req) => {
            const url = req.url();
            if (url.startsWith(base) || /^(data|blob):/.test(url)) {
                return;
            }
            externalRequests.push(url.slice(0, 120));
        });

        const manifest = JSON.parse(fs.readFileSync(path.join(ARTIFACT, 'files.json'), 'utf8'));
        const boottable = manifest.examples.filter((e) => !e.requiresDevTools);
        const devToolsOnly = manifest.examples.filter((e) => e.requiresDevTools);
        if (manifest.examples.some((e) => e.id === 'webgpu-basic')) {
            const reference = path.join(REPO, 'build/webgpu');
            const mismatches = fs.readdirSync(reference).filter((name) => {
                const output = path.join(ARTIFACT, 'webgpu', name);
                return (
                    !fs.existsSync(output) ||
                    !fs.readFileSync(path.join(reference, name)).equals(fs.readFileSync(output))
                );
            });
            check(
                'artifact:webgpu-assets-current',
                mismatches.length === 0,
                mismatches.length
                    ? `missing/changed: ${mismatches.join(',')}`
                    : 'all WebGPU assets match the live build',
            );
        }

        // 1) 部署物字节：无仓库绝对路径、无 agent 端点
        const scans = scanArtifactBytes();
        check(
            'artifact:no-absolute-path-dependency',
            scans.length === 0,
            scans.length
                ? `${scans.length} 处：${scans
                      .slice(0, 3)
                      .map((s) => `${s.file}:${s.line}[${s.pattern}]`)
                      .join(' | ')}`
                : 'no repo-absolute / agent-endpoint references in shipped bytes',
        );
        // 2) 解码器发布集
        const dec = checkDecoderSet();
        check(
            'artifact:decoder-set',
            dec.missing.length === 0,
            dec.missing.length ? `missing: ${dec.missing.join(',')}` : `${dec.present} decoder files shipped`,
        );
        // 2b) 字节货币（F-86）：本门禁测的是哪份引擎字节必须自证，否则陈旧 artifact 与新鲜 artifact 读数不可区分
        const engine = engineCopyState();
        check(
            'artifact:engine-copy-current',
            engine.identical,
            engine.artifact === null
                ? 'build/examples/cocosair.module.js 不存在，先跑 build（或整轮 all）'
                : `artifact ${engine.artifact} vs live build ${engine.live}`,
        );

        // 3) 静态入口 200
        for (const route of ['index.html', 'gallery.html', 'files.json', 'cocosair.module.js']) {
            const res = await page.request.get(`${base}/${route}`);
            check(`static:${route}`, res.status() === 200, `status=${res.status()}`);
        }
        // 4) 缩略图：全量非 DevTools 示例（样本 3 张不足以证明发布完整）
        let thumbsOk = 0;
        const thumbMissing = [];
        for (const ex of boottable) {
            const res = await page.request.get(`${base}/thumbnails/${ex.id}.png`);
            if (res.status() === 200) {
                thumbsOk++;
            } else {
                thumbMissing.push(`${ex.id}=${res.status()}`);
            }
        }
        check(
            `artifact:thumbnails-all`,
            thumbMissing.length === 0,
            thumbMissing.length
                ? `missing: ${thumbMissing.slice(0, 5).join(',')}`
                : `${thumbsOk}/${boottable.length} thumbnails reachable`,
        );
        // 4b) DevTools 示例的页面文件仍在包内，但其启动依赖 agent 通道：单独记 NOT_RUN 而非混入 PASS
        for (const ex of devToolsOnly) {
            const res = await page.request.get(`${base}/${ex.dir}/index.html`);
            check(
                `artifact:devtools-page-served:${ex.id}`,
                res.status() === 200,
                `status=${res.status()}（仅静态可访问；agent 通道启动不在本门禁范围）`,
            );
        }
        // 5) Gallery 列表渲染（嵌套路径下 fetch 相对 files.json）
        currentUrl = 'gallery.html';
        await page.goto(`${base}/gallery.html`, { waitUntil: 'load' });
        await page.waitForFunction(() => document.querySelectorAll('.example-link').length > 0, undefined, {
            timeout: 15000,
        });
        const listCount = await page.evaluate(() => document.querySelectorAll('.example-link').length);
        check(
            'gallery:list-rendered',
            listCount === manifest.examples.length,
            `links=${listCount} expected=${manifest.examples.length}`,
        );

        // 6) 深链路由 #id → 选择 + iframe 指向示例
        await page.goto(`${base}/gallery.html#mesh-sphere`, { waitUntil: 'load' });
        await page.waitForFunction(
            () =>
                document.getElementById('current-title') &&
                document.getElementById('current-title').textContent.includes('mesh-sphere'),
            undefined,
            { timeout: 15000 },
        );
        const frameSrc = await page.evaluate(() => document.getElementById('preview-frame').src);
        check('gallery:deep-link', /\/mesh-sphere\/$/.test(frameSrc), `iframe src=${frameSrc}`);

        // 7) Gallery 源码查看：点 Source 必须真的取回入口源码，而不是 "// source not available"
        await page.click('#btn-source');
        await page
            .waitForFunction(() => document.getElementById('source-view').style.display !== 'none', undefined, {
                timeout: 10000,
            })
            .catch(() => {});
        const sourceText = await page.evaluate(() => document.getElementById('source-code').textContent || '');
        check(
            'gallery:source-view',
            sourceText.length > 200 &&
                !/source not available/.test(sourceText) &&
                /import|function|createAirApp/.test(sourceText),
            `source chars=${sourceText.length} head=${JSON.stringify(sourceText.slice(0, 40))}`,
        );

        // 8) 全部非 DevTools 示例在嵌套部署下真实启动（ex.dir 而非 ex.id：两者可以不同）
        const bootFail = [];
        const lifecycleSeen = [];
        for (const ex of boottable) {
            currentUrl = `${ex.dir}/`;
            const spec = JSON.parse(fs.readFileSync(path.join(ARTIFACT, ex.dir, 'example.json'), 'utf8'));
            // 引擎示例以 __airApp 为就绪探针；非引擎页（gltf-catalog 目录页）以 __bootReady 为准——
            // 两者都表示「页面完成自举」，目录页不该为了过探针去伪造一个引擎实例。
            // Wait in the new document; the previous example may already expose __airApp.
            await page.goto(`${base}/${ex.dir}/`, { waitUntil: 'load' });
            if (spec.bench?.startupButtonText) {
                // Inline module imports can still be evaluating after the load event.
                // Wait for finite static imports before activating an already-visible button.
                await page.waitForLoadState('networkidle', { timeout: 15000 });
                await page.getByRole('button', { name: spec.bench.startupButtonText, exact: true }).click();
            }
            const bootPath = fs.existsSync(path.join(ARTIFACT, ex.dir, 'src/main.boot.js'))
                ? 'src/main.boot.js'
                : 'main.boot.js';
            await page.evaluate(async (url) => {
                await Promise.race([
                    import(url),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Gallery entry module did not finish')), 45000),
                    ),
                ]);
            }, `${base}/${ex.dir}/${bootPath}`);
            await page.evaluate(async (url) => {
                window.__galleryRuntime = await import(url);
            }, `${base}/cocosair.module.js`);
            const booted = await page
                .waitForFunction(
                    () => !!(window.__bootReady || window.__galleryRuntime.director.getScene()),
                    undefined,
                    { timeout: 30000, polling: 50 },
                )
                .then(() => 'booted')
                .catch(() => 'boot-failed');
            if (booted !== 'booted') {
                bootFail.push(ex.id);
            }
            check(`example-boot:${ex.id}`, booted === 'booted', `${booted} via /${ex.dir}/`);
            // 8b) 资源释放在独立部署下同样必须成立（§25 合同示例）
            if (((spec.validation && spec.validation.lifecycle) || []).includes('resource-released')) {
                // __lifecycle 由示例在异步资产就绪后才安装：立即 evaluate 会把加载竞态读成"钩子不存在"
                // （同一部署物连续两次跑出 gltf-basic / gltf-skin 互换的假 FAIL）。r46：等待改用
                // __lifecycleHold()>0（非消费型探针，见 examples/shared/asset-lifecycle.js）——
                // 直接轮询 __lifecycle() 会把首调用即运行的拆建轮烧在"资产未就绪"上（幂等报告不可重跑，
                // video-basic 的 held=0 即此根因）；重资产示例（video 演示序列 ≥15s）由此整段吸收进等待窗口。
                await page
                    .waitForFunction(
                        () => {
                            const hold = window.__lifecycleHold;
                            return typeof hold === 'function' && hold() > 0;
                        },
                        undefined,
                        { timeout: 45000 },
                    )
                    .catch(() => null);
                const lc = await page
                    .evaluate(() => (window.__lifecycle ? window.__lifecycle() : null))
                    .catch((e) => ({ error: String(e).slice(0, 80) }));
                const ok = !!lc && lc.released === true && !(lc.errors || []).length;
                lifecycleSeen.push(ex.id);
                check(
                    `lifecycle:${ex.id}`,
                    ok,
                    lc
                        ? `held=${lc.held} leaked=${(lc.leaked || []).length} reloaded=${lc.reloaded}${lc.error ? ' ' + lc.error : ''}`
                        : 'window.__lifecycle 不存在于部署物',
                );
            }
            // 8c) 解码器示例：解码文件必须真的被这次启动请求过
            if (/gltf-(meshopt|draco)/.test(ex.id)) {
                // __airApp is published before these examples' async fetch/parse completes. Wait for
                // the terminal decoder state before sampling resource timing, or fast page navigation
                // can turn a successful request into a false missing-decoder failure.
                await page
                    .waitForFunction(() => typeof window.__decoderState === 'string', undefined, { timeout: 15000 })
                    .catch(() => null);
                const seen = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
                const want = ex.id === 'gltf-meshopt' ? 'meshopt/meshopt_decoder.mjs' : 'draco.glb';
                const hit = seen.some((u) => decodeURIComponent(u).indexOf(want) >= 0);
                check(`decoder-request:${ex.id}`, hit, hit ? `${want} 已被部署页请求` : `${want} 未出现在资源计时里`);
                if (ex.id === 'gltf-meshopt') {
                    // meshopt 的发布形制是 wasm 内嵌（meshopt_decoder.mjs 内含 base64 wasm，无独立 .wasm
                    // 网络请求，资源计时里永远数不到）⇒ "wasm 可用"的机器证明 = 部署页用配置了解码器的
                    // loader 真实完成一次 decode（示例在 acquire() 成功后置 __meshoptConfigured，r46 起
                    // 以形制对齐的断言替代此前的资源计数）。
                    const configured = await page.evaluate(() => window.__meshoptConfigured === true);
                    check(
                        'decoder-wasm:meshopt',
                        configured,
                        configured
                            ? '配置解码器完成真实 decode（wasm 内嵌形制，无独立 .wasm 请求）'
                            : '__meshoptConfigured !== true',
                    );
                }
                const state = await page.evaluate(() => window.__decoderState || null);
                check(`decoder-state:${ex.id}`, state !== null, `__decoderState=${state}`);
            }
        }
        check(
            'artifact:all-boottable-examples',
            bootFail.length === 0,
            bootFail.length
                ? `boot failures: ${bootFail.join(',')}`
                : `${boottable.length}/${boottable.length} booted under nested mount`,
        );
        check(
            'artifact:lifecycle-covered',
            lifecycleSeen.length > 0,
            `${lifecycleSeen.length} §25 合同示例在部署物内完成释放核对`,
        );
        check(
            'artifact:no-http-errors',
            failedRequests.length === 0,
            failedRequests.length
                ? `${failedRequests.length} 次 4xx/5xx/失败请求：${failedRequests.slice(0, 4).join(' | ')}`
                : 'zero non-2xx response',
        );
        // 部署自治性：所有请求都落在本 artifact 的挂载前缀内 → 不需要 DevTools/agent/仓库根服务。
        check(
            'artifact:no-external-requests',
            externalRequests.length === 0,
            externalRequests.length
                ? `越界请求 ${externalRequests.length} 次：${[...new Set(externalRequests)].slice(0, 3).join(' | ')}`
                : 'every request served from the artifact mount',
        );
        check(
            'gallery:no-page-errors',
            pageErrors.length === 0,
            `${pageErrors.length} page errors${pageErrors.length ? ': ' + pageErrors.slice(0, 3).join(' | ') : ''}`,
        );
        check(
            'collector:source-unchanged',
            runnerSha256 === require('crypto').createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
            'collector bytes remain unchanged',
        );
        check(
            'artifact:no-webgpu-validation-errors',
            gpuValidationErrors.length === 0,
            `${gpuValidationErrors.length} native WebGPU validation errors`,
        );
        const pass = results.every((r) => r.ok);
        const evidence = {
            measuredAt: new Date().toISOString(),
            mount,
            base: '<self-hosted>',
            runner: 'tools/verify/gallery-artifact.cjs',
            runnerSha256,
            browserVersion: browser.version(),
            gpuValidationErrors,
            // 整轮检查跑完才落盘并盖章；中断路径不写文件，旧证据留给消费端按指纹陈旧判定（F-72）。
            completed: true,
            scope: {
                examples: manifest.examples.length,
                booted: boottable.length,
                devToolsPagesServed: devToolsOnly.length,
                lifecycle: lifecycleSeen.length,
            },
            // F-86：证据必须自述它测到的是哪份字节，消费端才可能把陈旧读数与新鲜读数区分开。
            artifactBytes: {
                engineCopySha256_16: engine.artifact,
                liveBundleSha256_16: engine.live,
                identical: engine.identical,
            },
            total: results.length,
            pass: results.filter((r) => r.ok).length,
            results,
            absolutePathHits: scans.slice(0, 40),
            failedRequests: failedRequests.slice(0, 40),
        };
        require(path.join(REPO, 'tools', 'verify', 'example-spec-common.cjs')).writeJsonAtomic(EVIDENCE_PATH, evidence);
        console.log(
            `[gallery-artifact] verify: ${results.filter((r) => r.ok).length}/${results.length} PASS → ${path.relative(REPO, EVIDENCE_PATH)}`,
        );
        return pass;
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
        await new Promise((resolve) => {
            server.close(resolve);
        });
    }
}

(async () => {
    const mode = process.argv[2] || 'all';
    if (mode === 'scan') {
        const hits = scanArtifactBytes();
        console.log(JSON.stringify({ passed: hits.length === 0, hits }, null, 2));
        process.exitCode = hits.length ? 1 : 0;
        return;
    }
    if (mode === 'build') {
        await buildArtifact();
        return;
    }
    if (mode === 'verify') {
        process.exit((await verifyArtifact()) ? 0 : 1);
        return;
    }
    await buildArtifact();
    process.exit((await verifyArtifact()) ? 0 : 1);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
