const test = require('node:test');
const assert = require('node:assert/strict');
const { EXCLUDED, parseData, select } = require('./profile-probe.cjs');

const required = ['builtin-unlit', 'builtin-standard', 'builtin-clear-stencil', 'builtin-sprite'];
const fixtures = () => {
    const effects = [...EXCLUDED, ...required].map((name) => ({ name, shaders: [{}] }));
    const stages = effects.map(({ name }) => [{ vert: name, frag: name }]);
    return [effects, stages];
};

test('profile keeps matching shader rows and eager effects without changing input', () => {
    const [effects, stages] = fixtures();
    assert.deepEqual(
        select(effects, stages).map((entry) => [entry.name, entry.stages[0].vert]),
        required.map((name) => [name, name]),
    );
    assert.equal(effects.length, EXCLUDED.length + required.length);
});

test('rejects inconsistent row cardinality, duplicate names, and missing defaults', () => {
    let [effects, stages] = fixtures();
    stages[1] = [];
    assert.throws(() => select(effects, stages), /Mismatched/);
    [effects, stages] = fixtures();
    effects[1].name = effects[0].name;
    assert.throws(() => select(effects, stages), /duplicate/);
    [effects, stages] = fixtures();
    effects[effects.length - 1].name = 'unexpected';
    assert.throws(() => select(effects, stages), /Required material/);
});

test('only parses generated data and never evaluates code', () => {
    assert.deepEqual(parseData('/* notice */\nexport const slots = [1];\n', 'slots').data, [1]);
    assert.throws(() => parseData('export const slots = process.exit();', 'slots'), SyntaxError);
});
