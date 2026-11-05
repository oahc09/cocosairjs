const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const collector = path.join(__dirname, 'webgl2-buffer-browser.cjs');

function invoke(args, extraEnv = {}) {
    const env = { ...process.env, ...extraEnv };
    delete env.AIR_WEBKIT_EXECUTABLE;
    Object.assign(env, extraEnv);
    return spawnSync(process.execPath, [collector, ...args], { env, encoding: 'utf8', timeout: 15000 });
}
function temporary(run) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-buffer-browser-contract-'));
    try {
        run(path.join(dir, 'report.json'));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test('the native collector requires an explicit fresh output', () => {
    const result = invoke([]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /new --out/);
});

test('missing explicit WebKit configuration is BLOCKED, never PASS', () => {
    temporary((out) => {
        const result = invoke([`--out=${out}`]);
        assert.equal(result.status, 1);
        const report = JSON.parse(fs.readFileSync(out, 'utf8'));
        assert.equal(report.status, 'BLOCKED');
        assert.equal(report.browserClosed, false);
        assert.match(report.error, /Set AIR_WEBKIT_EXECUTABLE/);
        assert.equal(report.results, undefined);
    });
});

test('a missing configured browser is BLOCKED without installing or falling back', () => {
    temporary((out) => {
        const result = invoke([`--out=${out}`], {
            AIR_WEBKIT_EXECUTABLE: path.join(path.dirname(out), 'absent-webkit'),
        });
        assert.equal(result.status, 1);
        const report = JSON.parse(fs.readFileSync(out, 'utf8'));
        assert.equal(report.status, 'BLOCKED');
        assert.match(report.error, /AIR_WEBKIT_EXECUTABLE does not exist/);
        assert.equal(report.results, undefined);
    });
});

test('an existing attempt is not overwritten', () => {
    temporary((out) => {
        const original = '{"status":"original failed attempt"}\n';
        fs.writeFileSync(out, original);
        const result = invoke([`--out=${out}`]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /EEXIST/);
        assert.equal(fs.readFileSync(out, 'utf8'), original);
    });
});
