const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { stagePalInputDeclarations } = require('./dts-pal-input.cjs');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'air-pal-dts-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const stage = path.join(root, 'emitted');
    const write = (file, text) => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text);
    };
    const methods = [['HandleInputDevice', 'handle'], ['HMDInputDevice', 'hmd'], ['HandheldInputDevice', 'handheld']];
    for (const [name, stem] of methods) {
        write(path.join(root, `vendor/pal-source/pal/input/web/${stem}-input.ts`), `export class ${name} { _on(event: string): void {} }`);
    }
    const file = path.join(stage, '@types/pal/input.d.ts');
    write(file, `declare module 'pal/input' { ${methods.map(([name]) => `export class ${name} { _on(event: string); }`).join('\n')} }`);
    for (const name of ['index', 'event/index', 'event-enum']) write(path.join(stage, `cocos/input/types/${name}.d.ts`), 'export {};');
    return { root, stage, file, write, options: { rootDir: stage, input: [file], moduleMap: { unrelated: 'untouched' } } };
}

test('stages only PAL temporary input and resolves all emitted engine type imports', (t) => {
    const f = fixture(t);
    const result = stagePalInputDeclarations(f.options, f.root);
    assert.equal((fs.readFileSync(f.file, 'utf8').match(/: void;/g) || []).length, 3);
    assert.equal(result.moduleMap.unrelated, 'untouched');
    assert.equal(result.moduleMap['cocos/input/types'], path.join(f.stage, 'cocos/input/types/index.d.ts'));
    assert.equal(result.moduleMap['cocos/input/types/event'], path.join(f.stage, 'cocos/input/types/event/index.d.ts'));
    assert.equal(result.moduleMap['cocos/input/types/event-enum'], path.join(f.stage, 'cocos/input/types/event-enum.d.ts'));
    assert.equal(Object.keys(f.options.moduleMap).length, 1);
});

test('rejects changed runtime return contract without modifying staged declarations', (t) => {
    const f = fixture(t);
    const original = fs.readFileSync(f.file, 'utf8');
    f.write(path.join(f.root, 'vendor/pal-source/pal/input/web/handle-input.ts'), 'export class HandleInputDevice { _on(): number { return 1; } }');
    assert.throws(() => stagePalInputDeclarations(f.options, f.root), /return contract drift/);
    assert.equal(fs.readFileSync(f.file, 'utf8'), original);
});

test('rejects missing emitted dependency and conflicting maps', (t) => {
    const f = fixture(t);
    assert.throws(() => stagePalInputDeclarations({ ...f.options, moduleMap: { 'cocos/input/types': '/wrong.d.ts' } }, f.root), /Conflicting PAL/);
    fs.rmSync(path.join(f.stage, 'cocos/input/types/event/index.d.ts'));
    assert.throws(() => stagePalInputDeclarations(f.options, f.root), /Missing emitted PAL/);
});

test('rejects stale or already adapted ambient signatures', (t) => {
    const f = fixture(t);
    f.write(f.file, fs.readFileSync(f.file, 'utf8').replace('_on(event: string);', '_on(event: string): number;'));
    assert.throws(() => stagePalInputDeclarations(f.options, f.root), /declaration contract drift/);
});
