/* Mocked collector control-flow checks. Run from the repository root; no real browser is launched. */
const fs = require('fs'),
    path = require('path'),
    vm = require('vm'),
    assert = require('assert');
const root = process.cwd(),
    file = path.join(root, 'tools/verify/hdr-empty-post.cjs'),
    source = fs.readFileSync(file, 'utf8');
async function test(mode) {
    let timer,
        report,
        launched = false,
        exited;
    const proc = {
        argv: ['node', file, '--out=output/hdr-empty-post/mock-' + mode],
        exitCode: 0,
        exit(c) {
            exited = c;
        },
    };
    const fakefs = {
        ...fs,
        mkdirSync() {},
        writeFileSync(p, v) {
            report = JSON.parse(v);
        },
        readFileSync(p, ...args) {
            let data = fs.readFileSync(p, ...args);
            if (String(p).endsWith('.sources.json') && mode.startsWith('bad-')) {
                let m = JSON.parse(data);
                if (mode === 'bad-bundle') m.bundleSha256 = 'bad';
                if (mode === 'bad-map') m.mapSha256 = 'bad';
                if (mode === 'bad-source')
                    m.sources.find((s) => s.path === 'src/air/rendering/screen-effect.ts').sha256 = 'bad';
                data = JSON.stringify(m);
            }
            return data;
        },
    };
    const server = {
        listen(port, host, cb) {
            cb();
        },
        address() {
            return { port: 123 };
        },
        close(cb) {
            if (mode === 'server-close-error') cb(Error('server close diagnostic'));
            else cb();
        },
    };
    const page = {
        on() {},
        async goto() {},
        async waitForFunction() {},
        async evaluate() {
            return { state: 'done', passed: true, checks: [] };
        },
        async screenshot() {},
    };
    const browser = {
        version() {
            return 'test';
        },
        async newPage() {
            return page;
        },
        async close() {
            if (mode === 'close-error') throw Error('close diagnostic');
            if (mode === 'close-hang') {
                timer();
                return new Promise(() => {});
            }
        },
    };
    vm.runInNewContext(source, {
        require(name) {
            if (name === 'fs') return fakefs;
            if (name === 'http')
                return {
                    createServer() {
                        return server;
                    },
                };
            if (name === './browser-engines.cjs')
                return {
                    launchOptions() {
                        return {};
                    },
                };
            if (name === './loopback-browser-env.cjs')
                return {
                    loopbackBrowserEnv() {
                        return {};
                    },
                };
            if (name === './static-file-response.cjs') return {};
            if (name === 'playwright')
                return {
                    chromium: {
                        async launch() {
                            launched = true;
                            return browser;
                        },
                    },
                };
            return require(name);
        },
        __dirname: path.dirname(file),
        __filename: file,
        process: proc,
        console: { log() {} },
        setTimeout(cb) {
            timer = cb;
            return 1;
        },
        clearTimeout() {},
    });
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    assert(report, mode + ' persists report');
    assert.equal(report.passed, false, mode);
    assert.equal(report.completed, false, mode);
    assert(exited === 1 || proc.exitCode === 1, mode + ' exit nonzero');
    if (mode.startsWith('bad-')) assert(!launched, mode + ' prelaunch rejected');
    return {
        mode,
        passed: true,
        completed: report.completed,
        collectorPassed: report.passed,
        nonzero: true,
        launched,
        failure: report.failure || report.shutdownFailure || report.serverShutdownFailure,
    };
}
(async () => {
    let results = [];
    for (const mode of ['close-error', 'close-hang', 'server-close-error', 'bad-bundle', 'bad-map', 'bad-source'])
        results.push(await test(mode));
    const out = process.argv[2] || 'output/hdr-empty-post/collector-check-' + Date.now() + '.json';
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
        out,
        JSON.stringify(
            { runnerSHA256: require('crypto').createHash('sha256').update(source).digest('hex'), results },
            null,
            2,
        ) + '\n',
        { flag: 'wx' },
    );
    console.log('Report: ' + out);
    console.log(results.map((r) => r.mode + ': PASS').join('\n'));
})().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
