/**
 * r48（owner-decisions §5）：docsConsumer 的剩余半边 —— 全局审计将其列为 PARTIAL 的
 * 「docs-as-run 指南在隔离真实浏览器消费端执行 + runtime 代码（非类型）浏览器执行」。
 * F-32 清洁室已证明 tarball 可 npm install、bare specifier 可解析、.d.ts 可编译；
 * 本工具补最后一环：**从 packed tarball 安装的产物驱动一个真实浏览器页面跑起来**。
 *
 * 步骤：npm pack（临时输出）→ 全新目录 npm install <tarball> --offline → 静态服务该
 * node_modules/cocosair.js/ → Chromium 打开消费页（importmap 指 安装产物）→ 断言
 * createAirApp 启动、Scene/Node/Camera/MeshRenderer API 往返、canvas 有非零像素帧。
 *
 * 执行：node tools/verify/tarball-browser-consumer.cjs [--out=<new.json>] [--vite=<installed-vite-package>] [--browser=chromium|firefox|webkit]
 * Chromium: AIR_CHROMIUM_PATH or Playwright's matching default; no silent fallback.
 * Vite, when selected, must be externally installed version 7.1.12.
 * 产物：docs/evidence/tarball-browser-consumer.json
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'; // win32 spawnSync 需要 .cmd 解析

const REPO = path.resolve(__dirname, '..', '..');
const outArg = process.argv.find((arg) => arg.startsWith('--out='))?.slice(6);
const OUT = outArg ? path.resolve(REPO, outArg) : path.join(REPO, 'docs', 'evidence', 'tarball-browser-consumer.json');
if (outArg && fs.existsSync(OUT)) throw new Error('--out must name a new report');
const browserName = process.argv.find((arg) => arg.startsWith('--browser='))?.slice(10) || 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(browserName)) throw Error('Unsupported --browser');
const viteRoot = process.argv.find((arg) => arg.startsWith('--vite='))?.slice(7);
const { verifyInstalledBrowser, vitePackage } = require('./upstream-sdk-browser.cjs');
if (viteRoot) vitePackage(viteRoot);
const artifacts = OUT.replace(/\.json$/, '') + '-artifacts';

(async () => {
    const report = { runner: 'tools/verify/tarball-browser-consumer.cjs', measuredAt: new Date().toISOString() };
    let hardFail = 0;
    const fail = (m) => {
        report.failures = report.failures || [];
        report.failures.push(m);
        hardFail++;
    };
    let tmpRoot = null;
    try {
        // 1) pack（输出到仓库外临时目录，不污染工作树）
        tmpRoot = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cocosair-tarball-consumer-'));
        execFileSync(NPM, ['pack', '--pack-destination', tmpRoot], {
            cwd: REPO,
            stdio: 'pipe',
            shell: process.platform === 'win32',
        });
        const tarball = fs.readdirSync(tmpRoot).find((f) => f.endsWith('.tgz'));
        if (!tarball) {
            throw new Error('npm pack 未产出 tgz');
        }
        report.tarball = tarball;

        // 2) 全新目录安装（--offline 只用本地缓存/本地 tarball；零 registry 调用）
        const consumerDir = path.join(tmpRoot, 'consumer');
        fs.mkdirSync(consumerDir, { recursive: true });
        fs.writeFileSync(
            path.join(consumerDir, 'package.json'),
            JSON.stringify({ name: 'tarball-consumer', private: true, type: 'module' }, null, 2),
        );
        execFileSync(NPM, ['install', path.join(tmpRoot, tarball), '--no-save', '--offline', '--ignore-scripts'], {
            cwd: consumerDir,
            stdio: 'pipe',
            shell: process.platform === 'win32',
        });
        const pkgDir = path.join(consumerDir, 'node_modules', 'cocosair.js');
        const bundle = path.join(pkgDir, 'build', 'npm', 'cocosair.module.js');
        if (!fs.existsSync(bundle)) {
            throw new Error('安装产物缺 build/npm/cocosair.module.js');
        }
        report.installed = {
            files: fs.readdirSync(path.join(pkgDir, 'build')).length,
            entry: 'build/npm/cocosair.module.js',
        };
        report.installed.bundleSha256_16 = crypto
            .createHash('sha256')
            .update(fs.readFileSync(bundle))
            .digest('hex')
            .slice(0, 16);
        const sourceMapPath = bundle + '.map';
        const releaseCode = fs.readFileSync(bundle, 'utf8');
        report.sourceMap = {
            present: fs.existsSync(sourceMapPath),
            linked: /\/\/# sourceMappingURL=/.test(releaseCode),
        };
        if (report.sourceMap.present || report.sourceMap.linked) {
            fail('published bundle must not include or link to a source map');
        }
        const devBundle = path.join(REPO, 'build', 'cocosair.module.js');
        const devMap = `${devBundle}.map`;
        report.developmentSourceMap = {
            present: fs.existsSync(devMap),
            linked:
                fs.existsSync(devBundle) &&
                /sourceMappingURL=cocosair\.module\.js\.map/.test(fs.readFileSync(devBundle, 'utf8')),
        };
        if (!report.developmentSourceMap.present || !report.developmentSourceMap.linked) {
            fail('local development bundle must retain its linked source map');
        }

        // 3) Native import-map, nested CSP, minified, and optional pinned Vite dev/production.
        // All HTML/fixtures live outside the installed package; no package bytes are changed.
        report.browserMatrix = await verifyInstalledBrowser({
            root: REPO,
            pkgDir,
            consumerDir,
            artifacts,
            viteRoot,
            browserName,
        });
        const baseline = report.browserMatrix.results.find((entry) => entry.id === 'importmap-unminified');
        const nested = report.browserMatrix.results.find((entry) => entry.id === 'importmap-nested-csp');
        report.booted = baseline?.booted === true;
        report.probe = baseline?.probe;
        report.pageErrors = report.browserMatrix.results.flatMap((entry) => entry.pageErrors || []);
        report.nested = { booted: nested?.booted === true, cspErrors: nested?.cspErrors || [], status: nested?.status };
        report.browserClosed = report.browserMatrix.browserClosed;
        if (!report.browserMatrix.passed) {
            fail('installed browser matrix did not pass every required case');
            for (const result of report.browserMatrix.results.filter((entry) => entry.status !== 'PASS'))
                fail(result.id + ': ' + result.error);
            if (!report.browserClosed) fail('browser shutdown did not complete');
        }
    } catch (e) {
        fail('runner error: ' + String(e.stack || e));
    }
    if (tmpRoot) {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
    report.ok = hardFail === 0;
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
    console.log(
        `[tarball-consumer] boot=${report.booted} api=${report.probe ? report.probe.apiRoundtrip : 'n/a'} pixels=${report.probe ? report.probe.nonZeroAlphaPixels : 'n/a'} → ${report.ok ? 'PASS' : 'FAIL'}`,
    );
    process.exitCode = hardFail ? 1 : 0;
})();
