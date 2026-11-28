const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { deferredGltfEffect } = require('./deferred-gltf-effect.cjs');

test('deferred profile keeps the frozen row pairing and binds the exact emitted sidecar', (t) => {
    const root = path.resolve(__dirname, '../..');
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'air-profile-test-'));
    t.after(() => fs.rmSync(output, { recursive: true, force: true }));
    const { plugin, publish } = deferredGltfEffect(root);
    assert.throws(() => publish(output), /Incomplete/);
    const [effects, stages, entry] = ['builtin-effects.ts', 'builtin-glsl4.ts', 'register.ts'].map((p) => {
        const file = path.join(root, 'src/air/builtin', p);
        const code = fs.readFileSync(file, 'utf8');
        return [code, plugin.transform(code.replace(/\r\n/g, '\n'), file).code];
    });
    const array = (code, symbol) => JSON.parse(code.split(`export const ${symbol} = `)[1].trim().slice(0, -1));
    const index = array(effects[0], 'effects').findIndex((item) => item.name === 'air-gltf-template');
    assert.ok(index >= 0);
    publish(output);
    const [name] = fs.readdirSync(output);
    const bytes = fs.readFileSync(path.join(output, name));
    const hash = createHash('sha256').update(bytes);
    assert.equal(name, `air-gltf-effect-${hash.copy().digest('hex')}.json`);
    assert.ok(entry[1].includes(name));
    assert.ok(entry[1].includes(`sha256-${hash.digest('base64')}`));
    assert.deepEqual(JSON.parse(bytes), {
        effect: array(effects[0], 'effects')[index],
        stages: array(stages[0], 'glsl4')[index],
    });
    for (const [[original, transformed], symbol] of [[effects, 'effects'], [stages, 'glsl4']]) {
        assert.deepEqual(array(transformed, symbol), array(original, symbol).filter((_, i) => i !== index));
    }
});
