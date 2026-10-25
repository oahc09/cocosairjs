const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const entry = path.join(__dirname, 'check-types.cjs');
test('typecheck requires explicit --dts without automatic SDK fallback', () => {
    for (const args of [[], ['--dts'], ['--unknown', 'file.d.ts']]) {
        const result = spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8' });
        assert.equal(result.status, 2);
        assert.match(result.stderr, /Usage:/);
        assert.doesNotMatch(result.stderr, /Cannot find module/);
    }
});
test('typecheck rejects missing declaration file before loading compiler', () => {
    const result = spawnSync(process.execPath, [entry, '--dts', path.join(__dirname, '__missing_sdk__.d.ts')], {
        encoding: 'utf8',
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Expected an existing SDK declaration file:/);
    assert.doesNotMatch(result.stderr, /Cannot find module/);
});
