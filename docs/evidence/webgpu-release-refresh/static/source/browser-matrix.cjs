/* V1.2 §12 取证 — 三浏览器矩阵（Chromium / Firefox / WebKit）。
 *
 * 与 V1.1 的 spec-driven 门禁互补：V1.1 矩阵在 Chromium 上验 Example Specification，
 * 本工具把同一份示例在三个引擎上各跑一次，按 tools/verify/browser-matrix-contract.json
 * 的机器可读断言（示例页内 window.__probe() 回读值 + 帧变化 + 截图字节下界）判定通过，
 * 截图与逐引擎记录入库 docs/evidence/browser-matrix/。
 *
 * 断言只来自契约文件，不来自示例自报（示例自证不算证据）。
 * 契约可选步骤：click="x,y"（真实鼠标点击）、resize="WxH"（真实改变视口，自适应类示例用）。
 * resize 步骤会先取一次 probe 与截图（matrix-<engine>-before.png），再把前置 probe 挂成 probe.before，
 * 于是普通 probeEquals 就能同时断言 resize 前（before.*）与 resize 后两套几何。
 * 证据绑定字节：记录 build/cocosair.module.js 与每张截图的 sha256_16（F-86 口径），
 * 只有完整跑完全部契约条目才盖 completed:true（F-72 口径，消费端缺标记即 NOT_RUN）。
 *
 * 执行：NODE_PATH=<playwright> node tools/verify/browser-matrix.cjs [--ids=a,b] [--engines=chromium,firefox,webkit]
 * 产出：docs/evidence/browser-matrix/browser-matrix.json + docs/evidence/browser-matrix/<id>/matrix-<engine>.png
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const esbuild = require('esbuild');
const { resolveScript } = require('../dev/resolve-script.cjs');

const REPO = path.resolve(__dirname, '..', '..');
const TRACE_MEDIA = process.argv.includes('--trace-media');
const CONTRACT_ARG = process.argv.find((a) => a.startsWith('--contract='));
const CONTRACT = CONTRACT_ARG
    ? path.resolve(REPO, CONTRACT_ARG.slice(11))
    : path.join(REPO, 'tools', 'verify', 'browser-matrix-contract.json');
const OUT_DIR = path.join(REPO, 'docs', 'evidence', 'browser-matrix');
const OUT_ARG = process.argv.find((a) => a.startsWith('--out='));
const OUT = OUT_ARG ? path.resolve(REPO, OUT_ARG.slice(6)) : path.join(OUT_DIR, 'browser-matrix.json');
const specCommon = require(path.join(REPO, 'tools', 'verify', 'example-spec-common.cjs'));
const { evaluateProbeRanges } = require('./probe-ranges.cjs');
const { readBrowserProbe } = require('./browser-probe.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const { ENGINES, launchOptions } = require('./browser-engines.cjs');
const { serveStaticFile } = require('./static-file-response.cjs');

// V1.1 全 40 例共同存在的非致命日志，不计入失败（披露在证据 benignConsole 字段）
const BENIGN_CONSOLE = ['[Physics] PhysicsSystem initDefaultMaterial()'];

const EXT = {
    '.js': 'text/javascript',
    '.html': 'text/html',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
    '.png': 'image/png',
    '.glb': 'model/gltf-binary',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.tmx': 'application/xml',
    '.plist': 'application/xml',
    '.txt': 'text/plain',
    '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg',
    '.atlas': 'text/plain',
    '.fnt': 'text/plain',
};

function sha16(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

function serveRepo() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const url = decodeURIComponent(req.url.split('?')[0]);
            if (url === '/favicon.ico') {
                res.writeHead(204);
                res.end();
                return;
            }
            const file = resolveScript(path.resolve(REPO, '.' + (url === '/' ? '/index.html' : url)));
            if (!file.startsWith(REPO + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
                res.writeHead(404);
                res.end('404');
                return;
            }
            if (file.endsWith('.ts')) {
                try {
                    const result = esbuild.transformSync(fs.readFileSync(file, 'utf8'), {
                        loader: 'ts',
                        format: 'esm',
                        target: 'es2022',
                    });
                    res.writeHead(200, { 'Content-Type': 'text/javascript' });
                    res.end(result.code);
                } catch (error) {
                    res.writeHead(500);
                    res.end(String(error));
                }
                return;
            }
            serveStaticFile(req, res, file, EXT[path.extname(file).toLowerCase()] || 'application/octet-stream');
        });
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    });
}

function dig(obj, dotted) {
    return dotted.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

function evalProbe(probe, contract) {
    const out = [];
    for (const [p, want] of Object.entries((contract.checks && contract.checks.probeEquals) || {})) {
        const got = dig(probe, p);
        out.push({ assertion: `probeEquals:${p}`, ok: got === want, expected: want, actual: got });
    }
    for (const p of (contract.checks && contract.checks.probeNonEmpty) || []) {
        const got = dig(probe, p);
        const ok = Array.isArray(got)
            ? got.length > 0
            : typeof got === 'number'
              ? Number.isFinite(got) && got !== 0
              : Boolean(got) && got !== false;
        out.push({ assertion: `probeNonEmpty:${p}`, ok, actual: got });
    }
    for (const p of (contract.checks && contract.checks.probePresent) || []) {
        out.push({ assertion: `probePresent:${p}`, ok: dig(probe, p) !== undefined, actual: dig(probe, p) });
    }
    out.push(...evaluateProbeRanges(probe, contract.checks && contract.checks.probeRanges));
    return out;
}

async function runOne(pw, id, contract, port, engines) {
    const records = [];
    for (const engine of engines) {
        const rec = { engine, example: id, group: contract.group };
        let browser;
        try {
            browser = await pw[engine].launch({
                ...launchOptions(engine),
                ...(engine === 'chromium' && process.env.AIR_CHROMIUM_PATH
                    ? { executablePath: process.env.AIR_CHROMIUM_PATH }
                    : {}),
                env: loopbackBrowserEnv(),
            });
            rec.browserVersion = browser.version();
        } catch (e) {
            records.push({
                ...rec,
                result: 'NOT_RUN',
                reason: 'launch failed: ' + String(e).split('\n')[0].slice(0, 200),
            });
            continue;
        }
        try {
            const page = await browser.newPage({ viewport: { width: 480, height: 360 } });
            if (TRACE_MEDIA)
                await page.addInitScript(() => {
                    const ids = new WeakMap();
                    let serial = 0;
                    const rows = (window.__mediaTrace = []);
                    const record = (kind, media, extra = {}) => {
                        if (!ids.has(media)) ids.set(media, ++serial);
                        if (rows.length < 5000)
                            rows.push({
                                kind,
                                id: ids.get(media),
                                at: performance.now(),
                                time: media.currentTime,
                                paused: media.paused,
                                seeking: media.seeking,
                                loop: media.loop,
                                muted: media.muted,
                                ...extra,
                            });
                    };
                    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
                    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
                        ...descriptor,
                        set(value) {
                            record('set-time', this, { value, stack: new Error().stack });
                            return descriptor.set.call(this, value);
                        },
                    });
                    for (const name of ['play', 'pause', 'load']) {
                        const original = HTMLMediaElement.prototype[name];
                        HTMLMediaElement.prototype[name] = function (...args) {
                            record('call-' + name, this, { stack: new Error().stack });
                            const result = original.apply(this, args);
                            if (name === 'play' && result?.then)
                                result.then(
                                    () => record('play-resolved', this),
                                    (error) => record('play-rejected', this, { error: String(error) }),
                                );
                            return result;
                        };
                    }
                    for (const name of ['play', 'playing', 'pause', 'ended', 'seeking', 'seeked', 'loadedmetadata'])
                        document.addEventListener(
                            name,
                            (event) => {
                                if (event.target instanceof HTMLMediaElement) record('event-' + name, event.target);
                            },
                            true,
                        );
                });
            const consoleErrors = [];
            page.on('console', (m) => {
                if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 240));
            });
            page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).slice(0, 240)));
            const failedRequests = [];
            page.on('response', (r) => {
                if (r.status() >= 400)
                    failedRequests.push(r.status() + ' ' + r.url().replace(`http://127.0.0.1:${port}`, ''));
            });
            await page.goto(`http://127.0.0.1:${port}/examples/${id}/index.html`, {
                waitUntil: 'load',
                timeout: 30000,
            });
            if (contract.startupButtonText)
                await page.getByRole('button', { name: contract.startupButtonText, exact: true }).click();
            await page.waitForTimeout(contract.waitMs || 3000);
            // resize 步骤：真实改变视口（setViewportSize → window resize → 引擎 screenAdapter → widgetManager
            // 全链路），用于自适应类示例。前置 probe 作为 before 挂到最终 probe 上，契约即可用普通
            // probeEquals 断言 before/after 两套几何（如 before.topBar.w 与 topBar.w）。
            let probeBefore = null;
            let shotBefore = null;
            if (contract.resize) {
                probeBefore = await page.evaluate(readBrowserProbe, contract.probePath || '__probe');
                shotBefore = await page.screenshot();
                const [rw, rh] = String(contract.resize).split('x').map(Number);
                await page.setViewportSize({ width: rw, height: rh });
                await page.waitForTimeout(contract.afterResizeMs || 1500);
            }
            const viewports = [{ width: 480, height: 360 }];
            if (contract.resize) {
                const [rw, rh] = String(contract.resize).split('x').map(Number);
                viewports.push({ width: rw, height: rh });
            }
            if (contract.click) {
                const [x, y] = String(contract.click).split(',').map(Number);
                await page.mouse.click(x, y);
                await page.waitForTimeout(contract.afterClickMs || 1200);
            }
            const probe = await page.evaluate(readBrowserProbe, contract.probePath || '__probe');
            if (probe && probeBefore) {
                probe.before = probeBefore;
            }
            const shotA = await page.screenshot();
            await page.waitForTimeout(500);
            let shotB = await page.screenshot();
            // 反 flake 补拍（r53）：firefox headless 偶发合成缓存使 500ms 双帧逐字节同（tiledmap-basic 实测
            // 同码一过一败）。补拍不改断言语义——仍要求最终观测到真实帧间差异；补拍次数入证据。
            let frameShotAttempts = 2;
            while (shotB.equals(shotA) && frameShotAttempts < 6) {
                await page.waitForTimeout(400);
                shotB = await page.screenshot();
                frameShotAttempts++;
            }
            const dir = path.join(OUT_DIR, id);
            fs.mkdirSync(dir, { recursive: true });
            const pngRel = path.join('docs', 'evidence', 'browser-matrix', id, `matrix-${engine}.png`);
            fs.writeFileSync(path.join(REPO, pngRel), shotB);
            let pngBeforeRel = null;
            if (shotBefore) {
                pngBeforeRel = path.join('docs', 'evidence', 'browser-matrix', id, `matrix-${engine}-before.png`);
                fs.writeFileSync(path.join(REPO, pngBeforeRel), shotBefore);
            }
            const benign = consoleErrors.filter((t) => BENIGN_CONSOLE.some((b) => t.includes(b)));
            const fatal = consoleErrors.filter((t) => !BENIGN_CONSOLE.some((b) => t.includes(b)));
            const assertions =
                probe == null ? [{ assertion: 'probeAvailable', ok: false }] : evalProbe(probe, contract);
            // 字节下界可按引擎覆盖：WebKit 在视口变化后不再把 WebGL 画布合成进截图（审计 F-89），
            // 该引擎的 resize 后下界由契约显式豁免，但 resize 前截图仍必须过界——视觉证据不允许整条缺席。
            const byEngine = contract.checks.minPngBytesByEngine || {};
            const postFloor = byEngine[engine] !== undefined ? byEngine[engine] : contract.checks.minPngBytes || 1;
            const beforeFloor = contract.checks.minPngBytesBefore || 1;
            const checks = {
                noConsoleError: fatal.length === 0,
                noFailedRequest: failedRequests.length === 0,
                frameChanged: contract.checks.frameChanged === false ? true : !shotA.equals(shotB),
                pngBytesAboveFloor: shotB.length >= postFloor,
                probeAssertions: assertions.every((a) => a.ok),
            };
            if (shotBefore) {
                checks.beforePngBytesAboveFloor = shotBefore.length >= beforeFloor;
            }
            records.push({
                ...rec,
                frameShotAttempts,
                result: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
                checks,
                failedAssertions: assertions.filter((a) => !a.ok),
                png: pngRel,
                pngBytes: shotB.length,
                pngSha256_16: sha16(shotB),
                pngBefore: pngBeforeRel,
                pngBeforeBytes: shotBefore ? shotBefore.length : undefined,
                pngBeforeSha256_16: shotBefore ? sha16(shotBefore) : undefined,
                pngFloors: {
                    after: postFloor,
                    before: shotBefore ? beforeFloor : undefined,
                    exemptedByEngine: byEngine,
                },
                viewports,
                probe,
                ...(TRACE_MEDIA
                    ? {
                          mediaTrace: await page.evaluate(() => window.__mediaTrace),
                          mediaRuntime: await page.evaluate(async () => {
                              const m = await import('/build/cocosair.module.js');
                              const player = m.director.getScene()?.getComponentsInChildren(m.VideoPlayer)[0];
                              return player
                                  ? {
                                        cachedTime: player._impl._cachedCurrentTime,
                                        bindings: [...player._impl._eventList.keys()],
                                        canPlay: player._impl.canPlay.toString(),
                                        bindEvents: player._impl._bindDomEvent.toString(),
                                    }
                                  : null;
                          }),
                      }
                    : {}),
                consoleErrors: fatal,
                benignConsole: benign,
                failedRequests: [...new Set(failedRequests)],
            });
        } catch (e) {
            records.push({ ...rec, result: 'FAIL', reason: String(e).split('\n')[0].slice(0, 240) });
        } finally {
            await browser.close();
        }
    }
    return records;
}

(async () => {
    const startedAt = new Date().toISOString();
    const args = process.argv.slice(2);
    const idsArg = args.find((a) => a.startsWith('--ids='));
    const enginesArg = args.find((a) => a.startsWith('--engines='));
    const pw = require('playwright');
    const contractAll = JSON.parse(fs.readFileSync(CONTRACT, 'utf8'));
    const bundleFile = path.join(REPO, 'build', 'cocosair.module.js');
    const bundleBuf = fs.readFileSync(bundleFile);
    const identityFiles = [
        bundleFile,
        CONTRACT,
        __filename,
        path.join(__dirname, 'browser-engines.cjs'),
        path.join(__dirname, 'browser-probe.cjs'),
    ];
    const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const fingerprints = Object.fromEntries(
        identityFiles.map((file) => [path.relative(REPO, file).replace(/\\/g, '/'), sha256(file)]),
    );
    const { server, port } = await serveRepo();
    const ids = idsArg ? idsArg.slice(6).split(',') : Object.keys(contractAll);
    const records = [];
    let completed = true;
    for (const id of ids) {
        const contract = contractAll[id];
        if (!contract) {
            console.log(`[browser-matrix] SKIP ${id}: 不在契约文件里（不伪造断言）`);
            completed = false;
            continue;
        }
        const rows = await runOne(
            pw,
            id,
            contract,
            port,
            enginesArg ? enginesArg.slice(10).split(',') : contract.engines,
        );
        records.push(...rows);
        for (const r of rows) {
            if (r.result !== 'PASS') {
                completed = false;
            }
        }
        for (const r of rows) {
            console.log(`[browser-matrix] ${id} ${r.engine} → ${r.result}${r.reason ? ' (' + r.reason + ')' : ''}`);
        }
        for (const r of rows) {
            if (r.result !== 'PASS')
                console.log(
                    '[browser-matrix-detail] ' +
                        JSON.stringify({
                            id,
                            engine: r.engine,
                            reason: r.reason,
                            failedAssertions: r.failedAssertions,
                            consoleErrors: r.consoleErrors,
                            failedRequests: r.failedRequests,
                        }),
                );
        }
    }
    server.close();
    for (const file of identityFiles) {
        if (sha256(file) !== fingerprints[path.relative(REPO, file).replace(/\\/g, '/')]) {
            completed = false;
            records.push({ result: 'FAIL', reason: 'candidate drift: ' + file });
        }
    }
    const pass = records.filter((r) => r.result === 'PASS').length;
    const subset = Boolean(idsArg || enginesArg || TRACE_MEDIA);
    const scopePassed = completed;
    completed = scopePassed && !subset;
    specCommon.writeJsonAtomic(OUT, {
        schema: 'v12-browser-matrix-v1',
        startedAt,
        endedAt: new Date().toISOString(),
        command: process.argv,
        cwd: REPO,
        method: 'REAL_BROWSER',
        completed,
        measuredAt: new Date().toISOString(),
        subset,
        scopePassed,
        fingerprints,
        runPass: pass,
        runTotal: records.length,
        bundle: { path: 'build/cocosair.module.js', bytes: bundleBuf.length, sha256_16: sha16(bundleBuf) },
        contractFile: path.relative(REPO, CONTRACT).replace(/\\/g, '/'),
        contractFingerprint: sha16(fs.readFileSync(CONTRACT)),
        runnerFingerprint: sha16(fs.readFileSync(__filename)),
        probeReaderFingerprint: sha16(fs.readFileSync(path.join(__dirname, 'browser-probe.cjs'))),
        engines: Object.keys(ENGINES),
        benignConsoleAllowlist: BENIGN_CONSOLE,
        records,
    });
    console.log(
        `[browser-matrix] ${pass}/${records.length} PASS across ${new Set(records.map((r) => r.engine)).size} engines → ${path.relative(REPO, OUT)} (completed=${completed})`,
    );
    if (!scopePassed) {
        process.exitCode = 1;
    }
})();
