/**
 * Phase 12 — Engine Development Loop（验收 L11 / npm run dev）。
 *
 *   Engine Watch（src/** 变化 → 重 build）
 * + Example Dev Server（静态服务 examples/ 与 build/，浏览器自动 reload）
 *
 * 用法: npm run dev [-- --example hello-cube --port 7454]
 * V0.1 不做 HMR：引擎内部状态复杂，接受 Full Page Reload（计划书 §19）。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
function argOf (name, def) {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : def;
}

const EXAMPLES_DIR = path.join(ROOT, 'examples');
const examples = fs.readdirSync(EXAMPLES_DIR)
    .filter((d) => fs.existsSync(path.join(EXAMPLES_DIR, d, 'index.html')));
const example = argOf('--example', examples.includes('hello-cube') ? 'hello-cube' : examples[0]);
const port = Number(argOf('--port', '7454'));

if (!example || !examples.includes(example)) {
    console.error(`[dev] example not found: ${example}. Available: ${examples.join(', ')}`);
    process.exit(1);
}

let reloadToken = Date.now();
let building = false;
let pendingRebuild = false;

function rebuild (reason) {
    if (building) { pendingRebuild = true; return; }
    building = true;
    const started = Date.now();
    console.log(`[dev] rebuild (${reason}) ...`);
    const child = spawn('node', [path.join(ROOT, 'tools', 'build', 'build.cjs'), '--format', 'esm'], {
        cwd: ROOT,
        stdio: 'inherit',
    });
    child.on('exit', (code) => {
        building = false;
        if (code === 0) {
            reloadToken = Date.now();
            console.log(`[dev] rebuild ok in ${((Date.now() - started) / 1000).toFixed(1)}s (reload browser)`);
        } else {
            console.error('[dev] rebuild failed, waiting for next change');
        }
        if (pendingRebuild) { pendingRebuild = false; rebuild('pending change'); }
    });
}

// watch src/**（Windows recursive 支持）
try {
    fs.watch(path.join(ROOT, 'src'), { recursive: true }, (_evt, file) => {
        if (!file) return;
        const f = String(file).replace(/\\/g, '/');
        if (!/\.(ts|json|js)$/.test(f)) return;
        if (f.includes('.tmp')) return;
        rebuild(f);
    });
    console.log('[dev] watching src/**');
} catch (e) {
    console.warn('[dev] fs.watch(recursive) 不可用，仅单次构建:', e.message);
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.bin': 'application/octet-stream',
    '.ccon': 'application/octet-stream',
    '.glb': 'model/gltf-binary',
    '.wasm': 'application/wasm',
};

const fileCache = new Map();
function serveFile (res, file) {
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': MIME[ext] || 'application/octet-stream' });
    try {
        // 同步读取 + mtime 缓存：避免大量并发/中止请求下 createReadStream 泄漏 fd（EMFILE）
        const st = fs.statSync(file);
        let entry = fileCache.get(file);
        if (!entry || entry.mtime !== st.mtimeMs) {
            entry = { mtime: st.mtimeMs, data: fs.readFileSync(file) };
            fileCache.set(file, entry);
        }
        res.end(entry.data);
    } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('dev-server error: ' + e.message);
    }
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const p = decodeURIComponent(url.pathname);

    if (p === '/__reload_token') {
        res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ token: reloadToken }));
        return;
    }
    if (p === '/__reload.js') {
        res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'text/javascript; charset=utf-8' });
        res.end(`(function poll(){fetch('/__reload_token').then(r=>r.json()).then(j=>{var t=String(j.token);if(sessionStorage.__airToken===undefined)sessionStorage.__airToken=t;if(sessionStorage.__airToken!==t){sessionStorage.__airToken=t;location.reload();}else{setTimeout(poll,1000);}}).catch(()=>setTimeout(poll,2000));})();`);
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
            res.end(html.replace('</head>', '<script src="/__air-prelude.js"></script><script src="/__reload.js"></script></head>'));
            return;
        }
        return serveFile(res, finalFile);
    }

    res.writeHead(404); res.end('not found');
});

server.listen(port, '127.0.0.1', () => {
    console.log(`[dev] Cocos AIR dev server: http://127.0.0.1:${port}/  (example: ${example})`);
    console.log(`[dev] examples: ${examples.join(', ')}`);
    console.log('[dev] engine watch: edit src/** → auto rebuild → browser auto reload');
});
