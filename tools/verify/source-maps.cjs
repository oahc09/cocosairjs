// Actual ECMAScript line counting, not LF-only URL/source-content checks.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { TraceMap, originalPositionFor } = require('@jridgewell/trace-mapping');
const { normalizeLineEndings } = require('../build/line-endings.cjs');
const root = path.resolve(__dirname, '../..');
const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
if (out && fs.existsSync(out)) throw Error('Refusing to overwrite evidence');
const position = (code, offset) => {
    const lines = code.slice(0, offset).split(/\r\n|[\n\r\u2028\u2029]/);
    return { line: lines.length, column: lines.at(-1).length };
};
function checkMarker(code, map, marker, expectedSource) {
    const offset = code.indexOf(marker);
    assert.ok(offset >= 0, 'marker missing: ' + marker);
    const generated = position(code, offset);
    const trace = new TraceMap(map);
    const original = originalPositionFor(trace, generated);
    assert.ok(original.source?.endsWith(expectedSource), 'wrong mapped source: ' + marker);
    const contents = trace.sourcesContent[trace.resolvedSources.indexOf(original.source)];
    const sourceLine = contents.split(/\r\n|[\n\r\u2028\u2029]/)[original.line - 1];
    assert.ok(sourceLine?.includes(marker), 'wrong mapped source line: ' + marker);
    return { marker, generated, original };
}
// Real VM stacks prove bare CR adds a line, CRLF does not. Normalization preserves
// logical lines and runtime template values; the map embeds original frozen bytes.
const source = 'const value = `a\r\nb\rc`;\r\n/* original\r\r\n*/\rthrow Error("MAP_SENTINEL");';
const normalized = normalizeLineEndings(source, 'fixture.js');
for (const separator of ['\u2028', '\u2029']) {
    assert.throws(
        () => normalizeLineEndings(`const x=1;${separator}const y=2;\r\nthrow Error('SENTINEL')`, 'unicode.js'),
        /CR mixed with Unicode/,
    );
}
assert.ok(normalized && !normalized.code.includes('\r'));
assert.equal(JSON.parse(normalized.map.toString()).sourcesContent[0], source);
const stackLine = (code) => {
    try {
        vm.runInNewContext(code, {}, { filename: 'fixture.js' });
    } catch (error) {
        return Number(error.stack.match(/fixture\.js:(\d+)/)[1]);
    }
    throw Error('VM fixture did not throw');
};
assert.equal(stackLine(source), stackLine(normalized.code));
assert.equal(
    vm.runInNewContext(source.slice(0, source.indexOf('throw')) + 'value'),
    vm.runInNewContext(normalized.code.slice(0, normalized.code.indexOf('throw')) + 'value'),
);
const fixture = checkMarker(normalized.code, JSON.parse(normalized.map.toString()), 'MAP_SENTINEL', 'fixture.js');
assert.equal(fixture.original.line, stackLine(source));
assert.throws(() =>
    checkMarker(
        normalized.code,
        { ...JSON.parse(normalized.map.toString()), mappings: '' },
        'MAP_SENTINEL',
        'fixture.js',
    ),
);
const rows = [];
for (const name of [
    'cocosair.module.js',
    'cocosair.module.min.js',
    'cocosair.module.spark.js',
    'bootstrap.js',
    'html-source.js',
]) {
    const code = fs.readFileSync(path.join(root, 'build', name), 'utf8');
    const map = JSON.parse(fs.readFileSync(path.join(root, 'build', name + '.map')));
    assert.equal(code.match(/sourceMappingURL=([^\s]+)/)?.[1], name + '.map');
    if (map.file) assert.equal(map.file, name);
    assert.equal(map.sources.length, map.sourcesContent.length);
    assert.ok(
        map.sourcesContent.every((source) => !/[\u2028\u2029]/.test(source || '')),
        'current emitted graph has no Unicode line separators',
    );
    if (['cocosair.module.js', 'cocosair.module.min.js'].includes(name)) {
        // Preserve the existing relocation and utility-source contract.
        assert.equal(map.file, name);
        const missing = map.sources.filter(
            (source) => !/^[a-z]+:/i.test(source) && !fs.existsSync(path.resolve(root, 'build', source)),
        );
        assert.deepEqual(missing, [], 'Relocated map sources must resolve from build/');
        assert.ok(map.sources.some((source) => source.endsWith('src/air/utils/frame-object.ts')));
    }
    const markers =
        name === 'html-source.js'
            ? [['AIR_E_HTML_SOURCE_DISPOSED', '/air/html-source.ts']]
            : [
                  ['AIR_E_APP_CONFLICT', '/air/app-config.ts'],
                  ['AIR_E_PIXEL_RATIO_CAP', '/air/app-config.ts'],
                  ['AIR_E_HTML_SOURCE_DISPOSED', '/air/html-source.ts'],
              ];
    const checks = markers.map(([marker, file]) => checkMarker(code, map, marker, file));
    assert.throws(() => checkMarker(code, { ...map, mappings: '' }, ...markers[0]));
    const npmPath = path.join(root, 'build/npm', name);
    if (fs.existsSync(npmPath)) {
        const published = fs.readFileSync(npmPath, 'utf8');
        assert.ok(
            published === code.replace(/\n?\/\/# sourceMappingURL=.*?(?:\r?\n)?$/, '\n'),
            'npm copy differs beyond its map URL: ' + name,
        );
        assert.ok(!published.includes('sourceMappingURL='));
    }
    rows.push({ name, checks, corruptMappingRejected: true });
}
const result = { ok: true, vmOriginalLine: stackLine(source), fixture, rows };
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result));
