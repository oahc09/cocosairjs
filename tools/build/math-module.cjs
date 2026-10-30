/* Build the canonical Cocos math implementation without renderer/DOM initialization.
 * The only source adaptation makes the legacy namespace module-private. Algorithms,
 * ValueType/CCClass registrations and original copyright notices are retained.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const esbuild = require('esbuild');
const ENTRY = [
    "export { Vec2, v2 } from './src/cocos/core/math/vec2';",
    "export { Vec3, v3 } from './src/cocos/core/math/vec3';",
    "export { Vec4, v4 } from './src/cocos/core/math/vec4';",
    "export { Quat, quat } from './src/cocos/core/math/quat';",
    "export { Mat3 } from './src/cocos/core/math/mat3';",
    "export { Mat4, mat4 } from './src/cocos/core/math/mat4';",
    "export { Color, color } from './src/cocos/core/math/color';",
    "export { Size, size } from './src/cocos/core/math/size';",
    "export { Rect, rect } from './src/cocos/core/math/rect';",
    "export * from './src/cocos/core/math/utils';",
].join('\n');
const FLAGS = Object.fromEntries(
    'BUILD NODEJS DEV EDITOR EDITOR_NOT_IN_PREVIEW PREVIEW SUPPORT_JIT TEST JSB DEBUG HTML5 NATIVE MINIGAME RUNTIME_BASED ALIPAY BAIDU BYTEDANCE COCOSPLAY HUAWEI OPPO QTT VIVO WECHAT XIAOMI SERVER_MODE EDITOR_CORE TAOBAO TAOBAO_MINIGAME USE_XR'
        .split(' ')
        .map((name) => [name, name === 'BUILD' || name === 'NODEJS']),
);
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
async function buildMathModule(root = path.resolve(__dirname, '../..'), output = path.join(root, 'build')) {
    root = path.resolve(root);
    output = path.resolve(output);
    const inputs = {},
        notices = new Set();
    function record(file) {
        const relative = path.relative(root, file).split(path.sep).join('/');
        if (!relative.startsWith('src/')) throw Error(`Unexpected math source: ${relative}`);
        const bytes = fs.readFileSync(file);
        inputs[relative] = sha256(bytes);
        return bytes.toString('utf8');
    }
    const result = await esbuild.build({
        absWorkingDir: root,
        stdin: { contents: ENTRY, sourcefile: 'air-math-entry.ts', resolveDir: root, loader: 'ts' },
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        target: 'es2020',
        write: false,
        metafile: true,
        legalComments: 'inline',
        plugins: [
            {
                name: 'canonical-math-isolation',
                setup(build) {
                    build.onResolve({ filter: /^internal:constants$/ }, () => ({
                        path: 'constants',
                        namespace: 'math-flags',
                    }));
                    build.onLoad({ filter: /.*/, namespace: 'math-flags' }, () => ({
                        contents: Object.entries(FLAGS)
                            .map(([name, value]) => `export const ${name} = ${value};`)
                            .join('\n'),
                        loader: 'js',
                    }));
                    build.onLoad({ filter: /\.[jt]s$/ }, ({ path: file }) => {
                        let source = record(file);
                        for (const comment of source.matchAll(/\/\*[\s\S]*?\*\//g)) {
                            if (/Copyright \(c\)/.test(comment[0]) && /Permission is hereby granted/.test(comment[0]))
                                notices.add(comment[0]);
                        }
                        if (
                            path.relative(root, file).split(path.sep).join('/') === 'src/cocos/core/global-exports.ts'
                        ) {
                            const globalLine = "const _global = typeof window === 'undefined' ? global : window;";
                            const windowLine = /const ccwindow: typeof window = [^;]+;/g;
                            if (!source.includes(globalLine) || [...source.matchAll(windowLine)].length !== 1)
                                throw Error(
                                    'Canonical legacy namespace changed; review math isolation before building.',
                                );
                            source = source
                                .replace(globalLine, 'const _global = Object.create(null);')
                                .replace(windowLine, 'const ccwindow: typeof window = Object.create(null);');
                        }
                        // TypeScript emits the canonical static-field order. Direct esbuild TS
                        // lowering can call freezeVec3 before its class alias has initialized.
                        return {
                            contents: ts.transpileModule(source, {
                                compilerOptions: {
                                    target: ts.ScriptTarget.ES2018,
                                    module: ts.ModuleKind.ESNext,
                                    experimentalDecorators: true,
                                    useDefineForClassFields: false,
                                },
                            }).outputText,
                            loader: 'js',
                        };
                    });
                },
            },
        ],
    });
    // JSON dependencies also belong in the reproducible-source receipt.
    for (const input of Object.keys(result.metafile.inputs)) {
        if (input.startsWith('src/')) record(path.join(root, input));
    }
    // Preserve license text while emitting deterministic LF bytes; canonical inputs
    // can contain mixed line endings and their receipt hashes still cover raw bytes.
    const code = ([...notices].sort().join('\n') + '\n' + result.outputFiles[0].text).replace(/\r\n/g, '\n');
    const exports = Object.values(result.metafile.outputs)[0].exports.slice().sort();
    const declarations = (entry) =>
        `// Types share the canonical main-entry declarations; this file has no runtime import.\nexport { ${exports.join(', ')} } from './${entry}';\n`;
    const files = {
        'cocosair.math.js': code,
        'cocosair.math.d.ts': declarations('cocosair.module'),
        'cocosair.math.legacy.d.ts': declarations('cocosair.legacy'),
    };
    fs.mkdirSync(output, { recursive: true });
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(output, name), content);
    if (!fs.existsSync(path.join(output, 'package.json')))
        fs.writeFileSync(path.join(output, 'package.json'), '{"type":"module"}\n');
    const receipt = {
        schema: 'air-math-build/1',
        entry: ENTRY,
        flags: FLAGS,
        adaptation:
            'global-exports.ts: isolate _global and ccwindow in module-private objects; no math algorithm edits',
        inputs: Object.fromEntries(Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b))),
        exports,
        outputs: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, sha256(content)])),
    };
    fs.mkdirSync(path.join(output, 'metadata'), { recursive: true });
    fs.writeFileSync(path.join(output, 'metadata', 'math-build.json'), JSON.stringify(receipt, null, 2) + '\n');
    fs.rmSync(path.join(output, 'math-build.json'), { force: true });
    return receipt;
}
module.exports = { buildMathModule };
if (require.main === module)
    buildMathModule()
        .then((r) => {
            console.log(
                `Math entry: ${r.exports.length} exports from ${Object.keys(r.inputs).length} canonical inputs`,
            );
        })
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
