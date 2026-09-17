/**
 * V0.2 Task 7/9/10/13 — Engine Development Loop 增强（验收 L7-L11）。
 *
 * Watch 三频道分类（计划书 §15）:
 *   engine : src/cocos|pal|exports/**  → Engine rebuild  → Browser reload
 *   air    : src/air/**                → Air rebuild     → Browser reload
 *   example: examples/**               → Dev Server only → Browser reload（不触发任何构建）
 *
 * 其他 V0.2 增强:
 *   - example .ts 即时编译（esbuild transform，mtime 缓存）→ starter/main.ts 直接可用
 *   - importmap 注入：example 里 `from 'cocosair'` 解析到 /build/cocosair.module.js
 *   - 构建错误可见性（Task 13）：/__build_status + 浏览器顶部错误横幅
 *   - 频道耗时记录（Task 8/17）：/__stats 暴露 Cold/Warm/Air/Example 计时
 *
 * V0.1 保持不变的部分:
 *   - 不做 HMR：引擎内部 global state / GPU resource 复杂，Full Page Reload（计划书 §17）
 *   - build 走 tools/build/build.cjs 单一管线（不更换 bundler，计划书 §16）
 *
 * 用法: npm run dev [-- --example starter --port 7454]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
function argOf (name, def) {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : def;
}

const EXAMPLES_DIR = path.join(ROOT, 'examples');
// V1.1 §28：Manifest 是 example 枚举的唯一事实源
const MANIFEST_PATH = path.join(EXAMPLES_DIR, 'files.json');
var examples = [];
if (fs.existsSync(MANIFEST_PATH)) {
  try {
    var manifestData = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    examples = manifestData.examples.map(function(e) { return e.dir; });
  } catch(e) { /* fallback below */ }
}
if (!examples.length) {
  examples = fs.readdirSync(EXAMPLES_DIR)
    .filter(function(d) { return fs.existsSync(path.join(EXAMPLES_DIR, d, 'index.html')); });
}
const example = argOf('--example', 'starter');
const port = Number(argOf('--port', '7454'));

if (!example || !examples.includes(example)) {
    console.error(`[dev] example not found: ${example}. Available: ${examples.join(', ')}`);
    process.exit(1);
}

let reloadToken = Date.now();
let building = false;
let pendingChannel = null;
let rebuildTimer;
function scheduleRebuild (channel, reason) {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => rebuild(channel, reason), 200);
}

// ---- Task 8/17：频道耗时记录（进程内存态，/__stats 暴露） ----
const devStats = {
    startedAt: new Date().toISOString(),
    coldBuildMs: null, // dev server 启动后的第一次 engine/air rebuild 记为冷/温基准之外首次
    engineRebuilds: [], // [{ms, at}]
    airRebuilds: [],    // [{ms, at}]
    exampleReloads: 0,
};

// ---- Task 13：构建状态（错误可见性） ----
let lastBuild = { channel: null, ok: null, ms: 0, error: '', at: '' };

function classify (relFile) {
    let f = relFile.replace(/\\/g, '/');
    // fs.watch 的 file 相对于被监听目录（src/ 或 examples/），归一化为仓库相对路径
    if (!f.startsWith('src/') && !f.startsWith('examples/')) f = 'src/' + f;
    if (f.startsWith('src/air/')) return 'air';
    if (f.startsWith('src/cocos/') || f.startsWith('src/pal/') || f.startsWith('src/exports/')) return 'engine';
    if (f.startsWith('examples/')) return 'example';
    if (f.startsWith('src/') && !f.includes('__dts_before_bundle/')) return 'engine';
    return null;
}

function rebuild (channel, reason) {
    if (building) { pendingChannel = channel; return; }
    building = true;
    const started = Date.now();
    console.log(`[dev] ${channel} rebuild (${reason}) ...`);
    const child = spawn('node', [path.join(ROOT, 'tools', 'build', 'build.cjs'), '--format', 'esm'], {
        cwd: ROOT,
        stdio: 'inherit',
    });
    child.on('exit', (code) => {
        building = false;
        const ms = Date.now() - started;
        if (code === 0) {
            reloadToken = Date.now();
            // 记录：本进程第一次 rebuild 与启动即跑的第一致（冷热区分见 docs/05 的独立测量）
            if (devStats.coldBuildMs === null) devStats.coldBuildMs = ms;
            if (channel === 'air') devStats.airRebuilds.push({ ms, at: new Date().toISOString() });
            else devStats.engineRebuilds.push({ ms, at: new Date().toISOString() });
            lastBuild = { channel, ok: true, ms, error: '', at: new Date().toISOString() };
            console.log(`[dev] ${channel} rebuild ok in ${(ms / 1000).toFixed(1)}s (reload browser)`);
        } else {
            // Task 13：构建失败不清 reloadToken（浏览器保留上一个可用 bundle），状态经 /__build_status 暴露
            lastBuild = { channel, ok: false, ms, error: `build.cjs exited with code ${code} (see terminal)`, at: new Date().toISOString() };
            console.error(`[dev] ${channel} rebuild FAILED in ${(ms / 1000).toFixed(1)}s, waiting for next change`);
        }
        if (pendingChannel) { const c = pendingChannel; pendingChannel = null; rebuild(c, 'pending change'); }
    });
}

// ---- Watch 频道 1/2: src/** → engine / air ----
try {
    fs.watch(path.join(ROOT, 'src'), { recursive: true }, (_evt, file) => {
        if (!file) return;
        const f = String(file).replace(/\\/g, '/');
        if (!/\.(ts|json|js)$/.test(f)) return;
        if (f.includes('.tmp')) return;
        const channel = classify(f);
        if (channel === 'engine' || channel === 'air') scheduleRebuild(channel, f);
    });
    console.log('[dev] watching src/** (engine: cocos|pal|exports, air: air)');
} catch (e) {
    console.warn('[dev] fs.watch(recursive) 不可用，仅单次构建:', e.message);
}

// ---- Watch 频道 3: examples/** + tools/debug/** → 仅 bump reload token（绝不触发 engine build） ----
try {
    const onExampleChange = (label) => (_evt, file) => {
        if (!file) return;
        const f = String(file).replace(/\\/g, '/');
        if (!/\.(ts|js|json|html|css)$/.test(f)) return;
        if (f.includes('.tmp')) return;
        devStats.exampleReloads += 1;
        reloadToken = Date.now();
        console.log(`[dev] ${label} change (${f}) → reload only (no engine build)`);
    };
    fs.watch(EXAMPLES_DIR, { recursive: true }, onExampleChange('example'));
    fs.watch(path.join(ROOT, 'tools', 'debug'), { recursive: true }, onExampleChange('debug-tool'));
    console.log('[dev] watching examples/** + tools/debug/** (reload only)');
} catch (e) {
    console.warn('[dev] fs.watch(examples) 不可用:', e.message);
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.ts': 'text/javascript; charset=utf-8', // esbuild transform 后按 JS 服务
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.bin': 'application/octet-stream',
    '.ccon': 'application/octet-stream',
    '.glb': 'model/gltf-binary',
    '.wasm': 'application/wasm',
    '.map': 'application/json',
};

const fileCache = new Map();
function serveFile (res, file) {
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': MIME[ext] || 'application/octet-stream' });
    try {
        // 同步读取 + mtime 缓存：避免大量并发/中止请求下 createReadStream 泄漏 fd（EMFILE）
        const st = fs.statSync(file);
        let entry = fileCache.get(file);
        if (!entry || entry.mtime !== st.mtimeMs || entry.data.length !== st.size) {
            entry = { mtime: st.mtimeMs, data: fs.readFileSync(file) };
            fileCache.set(file, entry);
        }
        res.end(entry.data);
    } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('dev-server error: ' + e.message);
    }
}

// ---- V0.5.1 T3/T4：tools/debug 入口按需 bundle（mtime 缓存，dev-only） ----
const debugBundleCache = new Map();
function serveDebugBundle (res, file) {
    try {
        const st = fs.statSync(file);
        let entry = debugBundleCache.get(file);
        if (!entry || entry.mtime !== st.mtimeMs) {
            const result = esbuild.buildSync({
                entryPoints: [file],
                bundle: true,
                format: 'esm',
                target: 'es2022',
                platform: 'browser',
                sourcemap: 'inline',
                // 'cocosair' 必须留给页面 importmap 解析到 /build/cocosair.module.js：
                // session 与页面共享同一引擎实例（绝不能再打包第二份引擎）。
                external: ['cocosair'],
                outfile: file.replace(/\.ts$/, '.js'),
                write: false,
            });
            entry = { mtime: st.mtimeMs, data: Buffer.from(result.outputFiles[0].contents) };
            debugBundleCache.set(file, entry);
            console.log(`[dev] debug bundle: ${path.relative(ROOT, file)} (${(entry.data.length / 1024).toFixed(0)}KB)`);
        }
        res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': MIME['.js'] });
        res.end(entry.data);
    } catch (e) {
        console.error(`[dev] debug bundle FAILED for ${path.relative(ROOT, file)}:\n${e.message}`);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('debug bundle error: ' + e.message);
    }
}

// ---- example .ts 即时编译（esbuild transform + mtime 缓存） ----
const tsCache = new Map();function serveExampleTs (res, file) {
    try {
        const source = fs.readFileSync(file, 'utf8');
        let entry = tsCache.get(file);
        if (!entry || entry.source !== source) {
            const result = esbuild.transformSync(source, {
                loader: 'ts',
                format: 'esm',
                target: 'es2022', // starter 使用 top-level await
                sourcefile: file,
                sourcemap: 'inline',
            });
            entry = { source, data: Buffer.from(result.code), warnings: result.warnings };
            tsCache.set(file, entry);
        }
        if (entry.warnings && entry.warnings.length) {
            console.warn(`[dev] esbuild warnings in ${path.relative(ROOT, file)}:`,
                entry.warnings.map((w) => w.text).join('; '));
        }
        res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': MIME['.js'] });
        res.end(entry.data);
    } catch (e) {
        // Task 13：TS 编译错误直接回 500 并在终端显示（浏览器 console 可见）
        console.error(`[dev] esbuild transform FAILED for ${path.relative(ROOT, file)}:\n${e.message}`);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('esbuild transform error: ' + e.message);
    }
}

const IMPORT_MAP = JSON.stringify({
    imports: { cocosair: '/build/cocosair.module.js' },
});

const server = http.createServer((req, res) => {
    // 防御 '//'（协议相对形态会让 new URL 抛 Invalid URL 并打死 server）
    const url = new URL(String(req.url || '/').replace(/^\/{2,}/, '/'), `http://127.0.0.1:${port}`);
    const p = decodeURIComponent(url.pathname);

    if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (p === '/__runtime-assets.js') {
        return serveFile(res, path.join(ROOT, 'tools', 'verify', 'runtime-assets.js'));
    }

    if (p === '/__reload_token') {
        res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ token: reloadToken }));
        return;
    }
    if (p === '/__build_status') {
        // Task 13：浏览器轮询，构建失败时显示错误横幅
        res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
        res.end(JSON.stringify(lastBuild));
        return;
    }
    if (p === '/__stats') {
        // Task 8/17：频道耗时统计
        res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
        res.end(JSON.stringify(devStats, null, 2));
        return;
    }
    if (p === '/__reload.js') {
        res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'text/javascript; charset=utf-8' });
        res.end(`(function poll(){
fetch('/__reload_token').then(r=>r.json()).then(function(j){
var t=String(j.token);
if(sessionStorage.__airToken===undefined)sessionStorage.__airToken=t;
if(sessionStorage.__airToken!==t){sessionStorage.__airToken=t;location.reload();}
}).catch(function(){});
fetch('/__build_status').then(r=>r.json()).then(function(s){
var id='__air-build-error';
var el=document.getElementById(id);
if(s&&s.ok===false&&!el){
el=document.createElement('pre');el.id=id;
el.style.cssText='position:fixed;left:0;right:0;top:0;z-index:99999;margin:0;padding:8px 12px;background:#7a1010;color:#ffd7d7;font:12px/1.5 monospace;white-space:pre-wrap;';
el.textContent='[Cocos AIR dev] '+s.channel+' build FAILED ('+(s.ms/1000).toFixed(1)+'s): '+s.error;
(document.body||document.documentElement).appendChild(el);
}else if(s&&s.ok!==false&&el){el.remove();}
}).catch(function(){});
setTimeout(poll,1000);})();`);
        return;
    }
    if (p === '/__air-test.html') {
        // 诊断页：仅 import 引擎 bundle（不初始化设备），结果写入 title
        res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!DOCTYPE html><html><head><title>air-test-start</title></head><body><script>window.__errs=[];window.onerror=function(){window.__errs.push([].slice.call(arguments).map(String).join(" | ").slice(0,400));};window.addEventListener("unhandledrejection",function(e){window.__errs.push("REJ: "+String(e.reason&&(e.reason.stack||e.reason)||e.reason).slice(0,600));});</script><script type="module">import * as m from "/build/cocosair.module.js";document.title="air-test-ok:"+Object.keys(m).length+":"+typeof m.createAirApp;window.onerror=function(e){document.title="air-test-err:"+e;};</script></body></html>');
        return;
    }
    if (p === '/__air-prelude.js') {
        res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'text/javascript; charset=utf-8' });
        res.end(fs.readFileSync(path.join(__dirname, 'air-prelude.js'), 'utf8'));
        return;
    }
    if (p === '/__debug-button.js') {
        // V0.5.1 T5：dev 页面的显式启用入口 —— 仅一个悬浮按钮；点击才动态 import
        // /__debug/panel.js（默认页面加载请求中不含任何 debug/agent 模块）。
        res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'text/javascript; charset=utf-8' });
        res.end(`(function(){
if (document.getElementById('__air-debug-btn')) return;
var b=document.createElement('button');
b.id='__air-debug-btn'; b.title='cocosair debug panel (Alt+D)';
b.textContent='debug';
b.style.cssText='position:fixed;right:10px;bottom:10px;z-index:99997;background:#1c2b4a;color:#9cf;'
 +'border:1px solid #345;border-radius:8px;padding:4px 10px;font:12px system-ui;cursor:pointer;opacity:.75';
b.onclick=function(){
  import('/__debug/panel.js').then(function(m){
    if(!window.__airPanel || !document.querySelector('[data-air-debug-panel]')){ window.__airPanel=m.createDebugPanel({}); }
  }).catch(function(e){ alert('debug panel load failed: '+e.message); });
};
(document.body||document.documentElement).appendChild(b);
})();`);
        return;
    }
    if (p.startsWith('/__debug/')) {
        // V0.5.1 T3/T4：开发期 agent session / debug 面板入口。
        // 按需 esbuild bundle（mtime 缓存）——这些文件不在默认 runtime bundle 内，
        // 仅 dev 页面显式 import('/__debug/...') 时加载。
        const rel = p.slice('/__debug/'.length).replace(/\\/g, '/');
        if (!/^[\w.-]+(\.ts|\.js)$/.test(rel)) { res.writeHead(404); res.end('not found (debug?)'); return; }
        const file = path.join(ROOT, 'tools', 'debug', rel.replace(/\.js$/, '.ts'));
        if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found (debug entry?)'); return; }
        return serveDebugBundle(res, file);
    }
    if (p.startsWith('/source/') && p.endsWith('.ts')) {
      var rawFile = path.join(ROOT, p.replace('/source/', 'examples/'));
      if (fs.existsSync(rawFile)) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(fs.readFileSync(rawFile));
      } else { res.writeHead(404); res.end('not found'); }
      return;
    }
    if (p.startsWith('/build/')) {
        const file = path.join(ROOT, p);
        if (fs.existsSync(file)) return serveFile(res, file);
        res.writeHead(404); res.end('not found (build?)');
        return;
    }
    if (p.startsWith('/builtin-assets/')) {
        const file = path.join(ROOT, p);
        if (fs.existsSync(file)) return serveFile(res, file);
        res.writeHead(404); res.end('not found (builtin-assets?)');
        return;
    }

    // 静态 example 文件: /<example>/<path>
    if (p === '/' || p === '') {
        res.writeHead(302, { 'Cache-Control': 'no-store', Location: `/${example}/` });
        res.end();
        return;
    }
    const rel = p.replace(/^\/+/, '');
    const candidate = rel === ''
        ? path.join(EXAMPLES_DIR, example, 'index.html')
        : path.join(EXAMPLES_DIR, rel);
    const resolved = path.resolve(candidate);
    const resolvedIsDir = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory();
    const finalFile = resolvedIsDir ? path.join(resolved, 'index.html') : resolved;
    if (finalFile.startsWith(EXAMPLES_DIR) && fs.existsSync(finalFile) && fs.statSync(finalFile).isFile()) {
        if (finalFile.endsWith('index.html')) {
            const html = fs.readFileSync(finalFile, 'utf8');
            res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
            // importmap 必须先于任何 module script；再注入 prelude（诊断）、reload 轮询与 debug 入口按钮
            const importMap = /<script\b[^>]*type=["']importmap["']/i.test(html)
                ? '' : `<script type="importmap">${IMPORT_MAP}</script>`;
            res.end(html.replace('</head>',
                `${importMap}<script src="/__air-prelude.js"></script><script src="/__reload.js"></script><script src="/__debug-button.js"></script></head>`));
            return;
        }
        if (/\.m?ts$/.test(finalFile)) return serveExampleTs(res, finalFile);
        return serveFile(res, finalFile);
    }

    res.writeHead(404); res.end('not found');
});

server.listen(port, '127.0.0.1', () => {
    console.log(`[dev] Cocos AIR dev server: http://127.0.0.1:${port}/  (example: ${example})`);
    console.log(`[dev] examples: ${examples.join(', ')}`);
    console.log('[dev] channels: engine(src/cocos|pal|exports) air(src/air) example(examples) — example changes never trigger engine build');
});
