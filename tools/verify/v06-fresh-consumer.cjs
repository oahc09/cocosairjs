/* V0.6 §67-71 — Runtime / DevTools 分发与 Fresh Consumer Gate。
 *
 * 产物：
 *   build/devtools/  — 独立 DevTools 工件（agent-session + panel bundle，cocosair external）
 * 两路验收（§70）：
 *   1) Runtime Only：runtime tarball —— 普通应用工作，零 debug/agent 依赖（复用 consumer-acceptance）
 *   2) Runtime + DevTools：runtime tarball + build/devtools 工件 —— inspection/session/capture/error 全可用
 * 两路都不访问 cocosair.js 源码仓库（本脚本自身在仓库内执行，被测目录为独立临时目录）。
 *
 * 执行：node tools/verify/v06-fresh-consumer.cjs
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { pathToFileURL } = require('url');

const REPO = path.resolve(__dirname, '..', '..');
const failures = [];
const report = { runtimeOnly: { ok: false }, runtimePlusDevtools: { ok: false }, devtoolsArtifact: {} };

function run (cmd, opts) {
    return execSync(cmd, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, ...opts });
}

(async () => {
    // ---- 0) 产出 DevTools 工件：build/devtools/{agent-session.js, panel.js, package.json, README.md}
    const devtoolsDir = path.join(REPO, 'build', 'devtools');
    fs.mkdirSync(devtoolsDir, { recursive: true });
    for (const entry of ['agent-session', 'panel']) {
        const result = esbuildBundle(path.join(REPO, 'tools', 'debug', entry + '.ts'));
        fs.writeFileSync(path.join(devtoolsDir, entry + '.js'), result);
    }
    fs.writeFileSync(path.join(devtoolsDir, 'package.json'), JSON.stringify({
        name: 'cocosair-devtools', version: '0.6.0', type: 'module',
        description: 'Cocos AIR DevTools artifact: agent development session + debug panel (requires cocosair runtime via importmap).',
        main: 'agent-session.js',
    }, null, 2) + '\n');
    fs.writeFileSync(path.join(devtoolsDir, 'README.md'),
        '# cocosair devtools\n\n显式启用：页面 importmap 解析 `cocosair` 后 `import(\'./agent-session.js\')`。\n'
        + '合同见仓库 docs/v051-agent-development.md。不属于默认 runtime 包。\n');
    report.devtoolsArtifact = { files: fs.readdirSync(devtoolsDir) };
    const sessionJs = fs.readFileSync(path.join(devtoolsDir, 'agent-session.js'), 'utf8');
    for (const marker of ['createAgentSession', 'STALE_TARGET', 'SESSION_CLOSED']) {
        if (!sessionJs.includes(marker)) { failures.push(`devtools artifact missing marker: ${marker}`); }
    }
    if (/node_modules/.test(path.join(devtoolsDir, 'agent-session.js')) === false && sessionJs.length < 10000) {
        failures.push('devtools agent-session bundle implausibly small');
    }

    // ---- 1) Runtime tarball（复用 npm pack）----
    const tarball = JSON.parse(run('npm pack --json', { cwd: REPO }))[0].filename;
    const tarballPath = path.join(REPO, tarball);
    const packDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'v06-fresh-'));

    const makeConsumer = (name, withDevtools) => {
        const dir = path.join(packDir, name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
            name, version: '1.0.0', private: true, type: 'module',
            dependencies: { cocosair: `file:${tarballPath}` },
        }, null, 2));
        run('npm install --no-audit --no-fund', { cwd: dir, stdio: 'pipe' });
        if (withDevtools) {
            fs.mkdirSync(path.join(dir, 'devtools'), { recursive: true });
            for (const f of fs.readdirSync(devtoolsDir)) { fs.copyFileSync(path.join(devtoolsDir, f), path.join(dir, 'devtools', f)); }
        }
        return dir;
    };

    // ---- 2) Runtime Only Consumer：普通应用可用；默认入口无 debug/agent 依赖 ----
    try {
        const rtDir = makeConsumer('runtime-only', false);
        const jsdom = require(path.join(REPO, 'node_modules', 'jsdom'));
        const dom = new JSDOM('<!DOCTYPE html><html><body><canvas id="GameCanvas"></canvas></body></html>', { url: 'http://localhost/validate/' });
        globalThis.window = dom.window;
        for (const key of ['document', 'navigator', 'location', 'CustomEvent', 'Event', 'HTMLElement', 'HTMLCanvasElement', 'HTMLImageElement', 'HTMLVideoElement', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'matchMedia']) {
            if (dom.window[key] !== undefined && globalThis[key] === undefined) { Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true }); }
        }
        dom.window.HTMLCanvasElement.prototype.getContext = function () { return null; };
        dom.window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,'; };
        const mod = await import(pathToFileURL(path.join(rtDir, 'node_modules', 'cocosair', 'build', 'cocosair.module.js')).href);
        const okExports = ['createAirApp', 'GLTFLoader', 'Scene', 'Node', 'MeshRenderer'].every((k) => typeof mod[k] !== 'undefined');
        // 默认入口不得包含 debug/agent 模块
        const bundle = fs.readFileSync(path.join(rtDir, 'node_modules', 'cocosair', 'build', 'cocosair.module.js'), 'utf8');
        const noDebug = !bundle.includes('createAgentSession') && !bundle.includes('SESSION_CLOSED');
        if (!okExports) { failures.push('[runtime-only] key exports missing'); }
        if (!noDebug) { failures.push('[runtime-only] default bundle contains debug/agent code'); }
        report.runtimeOnly = { ok: okExports && noDebug, exportCount: Object.keys(mod).length, noDebug };
    } catch (e) {
        failures.push('[runtime-only] ' + String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e).slice(0, 300));
    }

    // ---- 3) Runtime + DevTools Consumer：inspection / session / capture / error 可用 ----
    try {
        const dtDir = makeConsumer('runtime-devtools', true);
        const devtools = await import(pathToFileURL(path.join(dtDir, 'devtools', 'agent-session.js')).href);
        const { JSDOM } = require(path.join(REPO, 'node_modules', 'jsdom'));
        const dom = new JSDOM('<!DOCTYPE html><html><body><canvas id="GameCanvas"></canvas></body></html>', { url: 'http://localhost/validate/' });
        globalThis.window = dom.window;
        for (const key of ['document', 'navigator', 'location', 'CustomEvent', 'Event', 'HTMLElement', 'HTMLCanvasElement', 'HTMLImageElement', 'HTMLVideoElement', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'matchMedia']) {
            if (dom.window[key] !== undefined && globalThis[key] === undefined) { Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true }); }
        }
        dom.window.HTMLCanvasElement.prototype.getContext = function () { return null; };
        dom.window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,'; };
        // 合同四能力（§70）在工件上可调用：
        const session = devtools.createAgentSession({
            app: {
                canvas: dom.window.document.getElementById('GameCanvas'),
                getScene: () => null,
                run: () => undefined,
            },
        });
        const capabilities = {
            inspection: typeof session.inspectScene === 'function' && typeof session.inspectNode === 'function',
            agentSession: typeof session.dispatch === 'function',
            capture: typeof session.captureFrame === 'function',
            errorCollection: typeof session.getRuntimeErrors === 'function',
        };
        // 关闭后 SESSION_CLOSED 合同仍然成立（不依赖引擎运行时）
        session.close();
        const closed = await session.dispatch({ requestId: 'x1', action: 'createNode', params: {} });
        capabilities.sessionClosed = !closed.ok && closed.error.code === 'SESSION_CLOSED';
        const ok = Object.values(capabilities).every(Boolean);
        if (!ok) { failures.push('[runtime+devtools] capabilities incomplete: ' + JSON.stringify(capabilities)); }
        report.runtimePlusDevtools = { ok, capabilities };
    } catch (e) {
        failures.push('[runtime+devtools] ' + String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e).slice(0, 300));
    }

    // ---- 4) 版本匹配记录（§71）----
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
    report.versionMatch = { runtimeRevision: 'f519d86+', devtoolsRevision: pkg.version, contractVersion: 'v051-agent-contract' };

    fs.rmSync(packDir, { recursive: true, force: true });
    fs.rmSync(tarballPath, { force: true });

    report.ok = failures.length === 0;
    report.failures = failures;
    console.log(JSON.stringify(report, null, 2));
    process.exit(failures.length ? 1 : 0);
})();

function esbuildBundle (entry) {
    const esbuild = require(path.join(REPO, 'node_modules', 'esbuild'));
    const result = esbuild.buildSync({
        entryPoints: [entry], bundle: true, format: 'esm', target: 'es2022', platform: 'browser',
        sourcemap: false, external: ['cocosair'], write: false,
    });
    return result.outputFiles[0].text;
}
