const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const test = require('node:test');
const ts = require('typescript');
const esbuild = require('esbuild');
const { spawnSync } = require('node:child_process');
const { buildShaderPreflight } = require('../build/shader-preflight.cjs');
const root = path.resolve(__dirname, '../..');
const directory = fs.mkdtempSync(path.join(root, 'output/wa05-tests-'));
let api;
test.before(async () => {
    await buildShaderPreflight(root, directory);
    api = await import(pathToFileURL(path.join(directory, 'shader-preflight.js')).href);
});
const effect = (program = 'example') => ({
    name: 'test',
    techniques: [{ passes: [{ program }] }],
    shaders: [
        {
            name: program,
            glsl3: {
                vert: 'in vec3 a_position;void main(){gl_Position=vec4(a_position,1.0);}',
                frag: 'precision highp float;out vec4 color;void main(){color=vec4(1.0);}',
            },
            glsl4: {
                vert: 'layout(location=0) in vec3 a_position;void main(){gl_Position=vec4(a_position,1.0);}',
                frag: 'precision highp float;layout(location=0) out vec4 color;void main(){color=vec4(1.0);}',
            },
        },
    ],
});
test('missing optional arrays normalize without mutating caller data; source identities differ', () => {
    const first = effect('a'),
        second = effect('b');
    second.shaders[0].glsl3.frag = second.shaders[0].glsl3.frag.replace('1.0', '0.5');
    const before = JSON.stringify([first, second]);
    const result = api.preflightEffects([first, second]);
    assert.equal(result.status, 'passed');
    assert.equal(result.gpuValidated, false);
    assert.notEqual(result.effects[0].shaders[0].hash, result.effects[1].shaders[0].hash);
    assert.deepEqual(result.effects[0].normalized.shaders[0].samplerTextures, []);
    result.effects[0].normalized.techniques[0].passes[0].program = 'mutated';
    assert.equal(JSON.stringify([first, second]), before);
});
test('hash and global program collisions fail before registration, independent of input order', () => {
    const first = effect(),
        second = effect();
    first.shaders[0].hash = second.shaders[0].hash = 7;
    second.shaders[0].glsl3.frag = second.shaders[0].glsl3.frag.replace('1.0', '0.5');
    for (const inputs of [
        [first, second],
        [second, first],
    ]) {
        const result = api.preflightEffects(inputs);
        assert.equal(result.status, 'failed');
        assert(result.diagnostics.some((issue) => issue.code === 'AIR_E_EFFECT_HASH_COLLISION'));
        assert(result.diagnostics.some((issue) => issue.code === 'AIR_E_EFFECT_PROGRAM_COLLISION'));
    }
});
test('explicit effect identity wins; invalid identity never falls back to a name', () => {
    const inputs = [effect('one'), effect('two')];
    const result = api.preflightEffects(inputs, [{ effectIndex: 0 }, { effectIndex: 1 }]);
    assert.equal(result.status, 'passed');
    assert.deepEqual(
        result.references.map((row) => row.effectIndex),
        [0, 1],
    );
    assert.equal(api.preflightEffects(inputs, [{ effectName: 'test' }]).status, 'failed');
    const failed = api.preflightEffects(inputs, [{ effectIndex: 99, effectName: 'test' }]);
    assert.equal(failed.status, 'failed');
    assert.deepEqual(failed.references, []);
});
test('definite stage/output errors retain stage, path and source line', () => {
    const input = effect();
    input.shaders[0].glsl3.frag = 'precision highp float;\nvoid main(){gl_FragColor=vec4(1.0);}';
    const issue = api
        .preflightEffect(input)
        .diagnostics.find((value) => value.code === 'AIR_E_PREFLIGHT_FRAGMENT_OUTPUT');
    assert.equal(issue.stage, 'frag');
    assert.equal(issue.target, 'glsl3');
    assert.equal(issue.line, 2);
    assert.equal(issue.path, 'effects[0].shaders[0].glsl3.frag');
    input.shaders[0].glsl3.frag =
        'layout(location=0) out vec4 a;layout(location=0) out vec4 b;void main(){a=vec4(1);b=a;}';
    assert(api.preflightEffect(input).diagnostics.some((value) => value.code === 'AIR_E_PREFLIGHT_OUTPUT_COLLISION'));
    input.techniques[0].passes[0].program = 'missing';
    assert(api.preflightEffect(input).diagnostics.some((value) => value.code === 'AIR_E_PREFLIGHT_PROGRAM_REFERENCE'));
});
test('conditional uncertainty is not PASS or a definite source error', () => {
    const input = effect();
    input.shaders[0].glsl3.frag =
        '#if OLD_BACKEND\nvoid main(){gl_FragColor=vec4(1);}\n#else\nout vec4 color;void main(){color=vec4(1);}\n#endif';
    const result = api.preflightEffect(input);
    assert.equal(result.status, 'unknown');
    assert(result.diagnostics.every((issue) => issue.severity === 'unknown'));
});
test('malformed resources, cycles, getters and sparse arrays are bounded refusals, not crashes', () => {
    const bad = effect();
    assert.equal(api.preflightEffect({ ...bad, techniques: [] }).status, 'failed');
    bad.shaders[0].blocks = [null];
    assert.equal(api.preflightEffect(bad).status, 'failed');
    const cycle = effect();
    cycle.self = cycle;
    assert.equal(api.preflightEffect(cycle).diagnostics[0].code, 'AIR_E_PREFLIGHT_JSON');
    const getter = effect();
    Object.defineProperty(getter, 'trap', {
        get() {
            assert.fail('must not evaluate accessors');
        },
    });
    assert.equal(api.preflightEffect(getter).status, 'failed');
    assert.equal(api.preflightEffects(new Array(2)).status, 'failed');
    assert.equal(api.preflightEffects([effect()], [null]).status, 'failed');
});
test('accepted builtin payloads assembled through canonical toGlsl3 produce no false definite errors', () => {
    function load(file) {
        const module = { exports: {} };
        vm.runInNewContext(esbuild.transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
            module,
            exports: module.exports,
        });
        return JSON.parse(JSON.stringify(module.exports));
    }
    const effects = load(path.join(root, 'src/air/builtin/builtin-effects.ts')).effects;
    const stages = load(path.join(root, 'src/air/builtin/builtin-glsl4.ts')).glsl4;
    const file = path.join(root, 'src/air/builtin/register.ts');
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const convert = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'toGlsl3');
    assert(convert, 'canonical runtime source conversion must exist');
    const module = { exports: {} };
    vm.runInNewContext(
        ts.transpileModule(convert.getText(source) + '\nmodule.exports = toGlsl3;', {
            compilerOptions: { target: ts.ScriptTarget.ES2020 },
        }).outputText,
        { module },
    );
    effects.forEach((value, i) =>
        value.shaders.forEach((shader, j) => {
            shader.glsl4 = stages[i][j];
            shader.glsl3 = { vert: module.exports(shader.glsl4.vert), frag: module.exports(shader.glsl4.frag) };
        }),
    );
    const result = api.preflightEffects(effects);
    fs.writeFileSync(path.join(directory, 'builtin-report.json'), JSON.stringify(result, null, 2));
    assert.equal(effects.length, 22);
    assert.deepEqual(
        result.diagnostics.filter((issue) => issue.severity === 'error'),
        [],
    );
    assert.equal(result.status, 'unknown', 'unexpanded builtin macros must not be called PASS');
});
test('installed-shaped CLI returns distinct pass/error/unknown exits without DOM', () => {
    const input = path.join(directory, 'input.json');
    const cli = path.join(directory, 'shader-preflight-cli.cjs');
    for (const [value, expected] of [
        [effect(), 0],
        [{ name: 'missing' }, 1],
        [
            {
                ...effect(),
                shaders: [
                    {
                        ...effect().shaders[0],
                        glsl3: { ...effect().shaders[0].glsl3, frag: '#define FOO 1\nvoid main(){}' },
                    },
                ],
            },
            2,
        ],
    ]) {
        fs.writeFileSync(input, JSON.stringify(value));
        const run = spawnSync(process.execPath, [cli, input], { encoding: 'utf8' });
        assert.equal(run.status, expected, run.stderr + run.stdout);
        assert.equal(JSON.parse(run.stdout).gpuValidated, false);
    }
});

test('standalone generator emits identical bytes in two clean checkout roots', async () => {
    const roots = ['checkout-a', 'checkout-b'].map((name) => path.join(directory, name));
    const inputs = [
        'tools/shader-preflight/index.ts',
        'tools/shader-preflight/cli.cjs',
        'tools/debug/effect-layout.ts',
        'tools/build/shader-preflight.cjs',
        'src/air/rendering/effect-json-contract.ts',
        'src/air/rendering/shader-output-interface.ts',
    ];
    const receipts = [];
    for (const checkout of roots) {
        for (const file of inputs) {
            const destination = path.join(checkout, file);
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            fs.copyFileSync(path.join(root, file), destination);
        }
        receipts.push(await buildShaderPreflight(checkout, path.join(checkout, 'build')));
    }
    assert.deepEqual(receipts[0], receipts[1]);
    for (const file of ['shader-preflight.js', 'shader-preflight.d.ts', 'shader-preflight-cli.cjs']) {
        const first = fs.readFileSync(path.join(roots[0], 'build', file));
        assert(first.equals(fs.readFileSync(path.join(roots[1], 'build', file))), file);
        assert(!first.toString().includes(roots[0]), 'generated artifacts must not contain checkout identities');
    }
});
