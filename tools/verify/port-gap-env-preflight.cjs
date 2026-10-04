/*
 * port-gap-env-preflight — S0 环境预检（只读）。
 *
 * 依据（ai/plans/port-gap-remediation.md §12 S0、§13.3 第 1 条）：读本机身份、依赖与
 * 浏览器环境；缺什么如实记 NOT_CONFIGURED/NOT_RUN，绝不代为安装、绝不把历史报告当本轮 PASS。
 *
 * 检查项（全部只读）：
 *   - node / npm 版本
 *   - typescript、jest（从本仓 node_modules 读取；不可用即 NOT_CONFIGURED）
 *   - git 可用性与当前 HEAD
 *   - playwright 模块可 require 性（默认解析 + NODE_PATH，均不触发下载）
 *   - ms-playwright 浏览器二进制缓存（chromium/firefox/webkit/ffmpeg 目录存在性）
 *   - 浏览器实际启动：仅在 playwright 模块可解析时尝试，否则 NOT_RUN（原因：模块不可解析）
 *
 * 用法：
 *   node tools/verify/port-gap-env-preflight.cjs [--out=<file.json>] [--launch-browsers]
 * 退出码：0 = 预检完成（不代表全部可用）；2 = 用法错误。
 * 输出中每个检查项 status ∈ AVAILABLE | NOT_CONFIGURED | NOT_RUN，细节在 detail/reason。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..');
const SCHEMA_VERSION = 'port-gap-env-preflight/1';

function versionOfModule(name) {
    try {
        return { status: 'AVAILABLE', detail: { version: require(`${name}/package.json`).version } };
    } catch (e) {
        return { status: 'NOT_CONFIGURED', reason: `module not resolvable: ${String(e.message).split('\n')[0]}` };
    }
}

function commandVersion(cmd, args) {
    try {
        // Windows 下 npm 是 npm.cmd，须经 shell 解析；版本查询无注入面。
        const out = execFileSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' });
        return { status: 'AVAILABLE', detail: { version: out.trim().split('\n')[0] } };
    } catch (e) {
        return { status: 'NOT_CONFIGURED', reason: `command failed: ${String(e.message).split('\n')[0]}` };
    }
}

/** 枚举 ms-playwright 缓存目录中的浏览器二进制（只列目录，不执行）。 */
function browserBinaries() {
    const base = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
    const result = { cacheDir: base, cacheDirExists: fs.existsSync(base), engines: {} };
    if (!result.cacheDirExists) return result;
    const names = fs.readdirSync(base);
    const classify = (prefix) => names.filter((n) => n.startsWith(prefix)).sort();
    for (const [engine, prefixes] of [
        ['chromium', ['chromium-', 'chromium_headless_shell-']],
        ['firefox', ['firefox-']],
        ['webkit', ['webkit-']],
        ['ffmpeg', ['ffmpeg-']],
    ]) {
        const found = prefixes.flatMap((p) => classify(p));
        result.engines[engine] = found.length
            ? { status: 'AVAILABLE', detail: { revisions: found } }
            : { status: 'NOT_CONFIGURED', reason: `no ${engine} binaries in cache (download step not run)` };
    }
    return result;
}

/** playwright 模块可解析性：默认 require + NODE_PATH，绝不安装。 */
function playwrightModule() {
    const attempts = [];
    try {
        // eslint-disable-next-line global-require
        const pw = require('playwright');
        attempts.push({ via: 'default-resolve', ok: true, version: require('playwright/package.json').version });
    } catch (e) {
        attempts.push({ via: 'default-resolve', ok: false, reason: String(e.message).split('\n')[0] });
    }
    if (process.env.NODE_PATH) {
        try {
            const pw = require(require.resolve('playwright', { paths: process.env.NODE_PATH.split(path.delimiter) }));
            const packagePath = require.resolve('playwright/package.json', { paths: process.env.NODE_PATH.split(path.delimiter) });
            attempts.push({ via: 'NODE_PATH', ok: true, version: require(packagePath).version });
        } catch (e) {
            attempts.push({ via: 'NODE_PATH', ok: false, reason: String(e.message).split('\n')[0] });
        }
    } else {
        attempts.push({ via: 'NODE_PATH', ok: false, reason: 'NODE_PATH is empty' });
    }
    const ok = attempts.find((a) => a.ok);
    return ok
        ? { status: 'AVAILABLE', detail: { resolvedVia: ok.via, version: ok.version, attempts } }
        : { status: 'NOT_CONFIGURED', reason: 'playwright 模块在本仓与 NODE_PATH 均不可解析（按纪律不代为安装）', detail: { attempts } };
}

/**
 * 浏览器实际启动检查。仅在 module AVAILABLE 时有意义；否则如实 NOT_RUN。
 * options.launch=true 才真的拉起浏览器（默认 false：预检只查可用性，不启动引擎）。
 */
async function browserLaunchCheck(playwrightStatus, launch) {
    if (playwrightStatus.status !== 'AVAILABLE') {
        return { status: 'NOT_RUN', reason: `playwright 模块不可解析（${playwrightStatus.reason}），不重复、不安装、不假设历史报告有效` };
    }
    if (!launch) {
        return { status: 'NOT_RUN', reason: '未指定 --launch-browsers：本轮只查环境可用性，不启动浏览器（避免当成证据采集）' };
    }
    // eslint-disable-next-line global-require
    const pw = require('playwright');
    const { launchOptions } = require('./browser-engines.cjs');
    const out = {};
    for (const engine of ['chromium', 'firefox', 'webkit']) {
        try {
            const options = launchOptions(engine);
            const browser = await pw[engine].launch({ ...options, headless: true });
            const version = browser.version();
            await browser.close();
            out[engine] = { status: 'AVAILABLE', detail: { launched: true, version, executablePath: options.executablePath } };
        } catch (e) {
            out[engine] = { status: 'NOT_CONFIGURED', reason: `launch failed: ${String(e.message).split('\n')[0]}` };
        }
    }
    return summarizeBrowserLaunch(out);
}

function summarizeBrowserLaunch(rows) {
    const available = ['chromium', 'firefox', 'webkit'].every((engine) => rows[engine]?.status === 'AVAILABLE');
    return { status: available ? 'AVAILABLE' : 'NOT_CONFIGURED',
        ...(!available ? { reason: 'At least one required browser failed or did not launch; inspect per-engine results' } : {}), detail: rows };
}

async function collect(options = {}) {
    const report = {
        schemaVersion: SCHEMA_VERSION,
        checkedAt: new Date().toISOString(),
        host: { platform: `${os.platform()}/${os.arch()}`, release: os.release(), node: process.version },
        checks: {
            node: { status: 'AVAILABLE', detail: { version: process.version } },
            npm: commandVersion('npm', ['--version']),
            git: commandVersion('git', ['--version']),
            typescript: versionOfModule('typescript'),
            jest: versionOfModule('jest'),
            tsJest: versionOfModule('ts-jest'),
            playwrightModule: null,
            browserBinaries: null,
            browserLaunch: null,
        },
        head: null,
        notes: [
            '本预检只读：不安装依赖、不改 node_modules、不下载浏览器。',
            'AVAILABLE 仅代表环境具备，不构成任何 gate 的 PASS；证据须按 PG-34 schema 另行采集。',
            '缺失项如实记录；历史报告不当作本轮结果。',
        ],
    };
    try {
        report.head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
    } catch (e) {
        report.head = null;
    }
    report.checks.playwrightModule = playwrightModule();
    report.checks.browserBinaries = browserBinaries();
    report.checks.browserLaunch = await browserLaunchCheck(report.checks.playwrightModule, !!options.launch);
    return report;
}

function main(argv) {
    let out = null;
    let launch = false;
    for (const a of argv) {
        const m = a.match(/^--out=(.*)$/);
        if (m) out = m[1];
        else if (a === '--launch-browsers') launch = true;
        else {
            console.error(`[port-gap-env] 用法错误: ${a}`);
            console.error('  node tools/verify/port-gap-env-preflight.cjs [--out=<file.json>] [--launch-browsers]');
            process.exit(2);
        }
    }
    collect({ launch })
        .then((report) => {
            const payload = JSON.stringify(report, null, 2);
            if (out) {
                fs.writeFileSync(path.resolve(out), payload + '\n', { flag: 'wx' });
                console.log(`[port-gap-env] preflight written -> ${path.resolve(out)}`);
            } else {
                console.log(payload);
            }
            const brief = Object.entries(report.checks)
                .map(([k, v]) => `${k}=${v && v.status ? v.status : v && v.cacheDirExists ? 'PRESENT' : 'ABSENT'}`)
                .join(' ');
            console.log(`[port-gap-env] ${brief}`);
            process.exit(0);
        })
        .catch((e) => {
            console.error(`[port-gap-env] 执行失败: ${e.message}`);
            process.exit(2);
        });
}

module.exports = { SCHEMA_VERSION, collect, summarizeBrowserLaunch };

if (require.main === module) main(process.argv.slice(2));
