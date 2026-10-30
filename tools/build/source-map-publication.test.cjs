const test = require('node:test');
const assert = require('node:assert/strict');
const { externalizeSources } = require('./source-map-publication.cjs');

test('external source maps preserve every field except optional embedded text', () => {
    const map = {
        version: 3,
        file: 'cocosair.module.js',
        sources: ['../src/a.ts'],
        names: ['value'],
        mappings: 'AAAA,IAAIA',
        sourcesContent: ['const value = 1;\r\n'],
        sourceRoot: '',
        x_google_ignoreList: [0],
    };
    const before = JSON.stringify(map);
    const expected = { ...map };
    delete expected.sourcesContent;
    assert.deepEqual(externalizeSources(map), expected);
    assert.equal(JSON.stringify(map), before);
    assert.equal(
        new URL(map.sources[0], 'https://example.test/project/build/cocosair.module.js.map').href,
        'https://example.test/project/src/a.ts',
    );
});

test('externalization is deterministic and idempotent with no embedded sources', () => {
    const map = { version: 3, sources: [], names: [], mappings: '' };
    assert.equal(JSON.stringify(externalizeSources(externalizeSources(map))), JSON.stringify(map));
});

test('malformed and indexed inputs fail closed rather than losing source text', () => {
    for (const map of [
        null,
        {},
        { version: 3, sources: [], names: [], mappings: '', sections: [] },
        { version: 3, sources: ['a'], names: [], mappings: '', sourcesContent: [] },
    ]) {
        assert.throws(() => externalizeSources(map));
    }
});
