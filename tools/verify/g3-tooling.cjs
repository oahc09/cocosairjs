const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sourceFingerprint } = require('./api-trace.cjs');
const { resolveScript } = require('../dev/resolve-script.cjs');
const { evalAssetLoaded } = require('./expectation-checks.cjs');

const canvasModule = { exports: {} };
const canvasCode = require('esbuild').transformSync(
    fs.readFileSync(path.join(__dirname, '../../examples/shared/canvas-texture.js'), 'utf8'),
    { format: 'cjs', loader: 'js' },
).code;
new Function('module', 'exports', canvasCode)(canvasModule, canvasModule.exports);
const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]);
const output = new Uint8Array(rgba.length);
canvasModule.exports.copyCanvasRows({ width: 2, height: 2, data: rgba }, output);
assert.deepStrictEqual(
    [...output],
    [...rgba.slice(8), ...rgba.slice(0, 8)],
    'texture upload must preserve horizontal order and flip vertical order',
);
const assetSpec = { paths: [{ path: 'assets/tone.wav' }] };
const response = { decoded: '/assets/tone.wav', status: 200, size: 256, observation: 'server-response' };
assert.strictEqual(evalAssetLoaded({}, assetSpec, {}, [response]).ok, true);
assert.strictEqual(evalAssetLoaded({}, assetSpec, {}, [{ ...response, status: 404 }]).ok, false);
assert.strictEqual(evalAssetLoaded({}, assetSpec, {}, [{ ...response, size: 0 }]).ok, false);

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cocosair-g3-'));
try {
    const component = path.join(base, 'src', 'components', 'Behavior.ts');
    fs.mkdirSync(path.dirname(component), { recursive: true });
    fs.writeFileSync(path.join(base, 'src', 'main.ts'), "import './components/Behavior.js';\n");
    fs.writeFileSync(component, 'export const speed = 1;\n');
    const before = sourceFingerprint(base);
    fs.writeFileSync(component, 'export const speed = 2;\n');
    assert.notStrictEqual(sourceFingerprint(base), before, 'component changes must invalidate evidence');
    const script = component.replace(/\.ts$/, '.js');
    assert.strictEqual(resolveScript(script), component);
    fs.writeFileSync(script, 'export const speed = 3;\n');
    assert.strictEqual(resolveScript(script), script, 'existing JavaScript takes precedence');
    assert.strictEqual(
        fs.existsSync(resolveScript(path.join(base, 'missing.js'))),
        false,
        'missing imports remain unresolved',
    );
    console.log(
        '[g3-tooling] PASS: nested fingerprints, module serving, texture orientation, response byte/status guards',
    );
} finally {
    if (!path.resolve(base).startsWith(path.resolve(os.tmpdir()) + path.sep + 'cocosair-g3-')) {
        throw new Error('unexpected temporary directory');
    }
    fs.rmSync(base, { recursive: true, force: true });
}
