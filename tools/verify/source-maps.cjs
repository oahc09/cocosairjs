const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '../..');
const results = [];
for (const file of ['cocosair.module.js', 'cocosair.module.min.js']) {
    const map = JSON.parse(fs.readFileSync(path.join(root, 'build', file + '.map'), 'utf8'));
    const code = fs.readFileSync(path.join(root, 'build', file), 'utf8');
    assert.strictEqual(map.file, file);
    assert(code.includes(`sourceMappingURL=${file}.map`));
    assert.strictEqual(map.sources.length, map.sourcesContent.length);
    const missing = map.sources.filter((source) => !/^[a-z]+:/i.test(source)
        && !fs.existsSync(path.resolve(root, 'build', source)));
    assert.deepStrictEqual(missing, [], 'Relocated map sources must resolve from build/');
    assert(map.sources.some((source) => source.endsWith('src/air/utils/frame-object.ts')));
    results.push({ file, sources: map.sources.length, missing });
}
console.log(JSON.stringify({ ok: true, results }));
