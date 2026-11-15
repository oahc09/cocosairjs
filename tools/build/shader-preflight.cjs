/* Build CPU-only preflight as a separate optional package entry; never imports the runtime. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const esbuild = require('esbuild');
async function buildShaderPreflight(root = path.resolve(__dirname, '../..'), output = path.join(root, 'build')) {
    root = path.resolve(root);
    output = path.resolve(output);
    if (!output.startsWith(root + path.sep)) throw Error('Preflight output must be inside the workspace');
    const entry = path.join(root, 'tools/shader-preflight/index.ts');
    const compiled = await esbuild.build({
        absWorkingDir: root,
        entryPoints: [entry],
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        target: 'es2020',
        write: false,
        metafile: true,
        legalComments: 'inline',
    });
    const allowed = new Set([
        'tools/shader-preflight/index.ts',
        'tools/debug/effect-layout.ts',
        'src/air/rendering/effect-json-contract.ts',
        'src/air/rendering/shader-output-interface.ts',
    ]);
    const inputs = {};
    for (const input of Object.keys(compiled.metafile.inputs)) {
        const logical = input.replace(/\\/g, '/');
        if (!allowed.has(logical)) throw Error('Unexpected preflight dependency: ' + logical);
        inputs[logical] = crypto
            .createHash('sha256')
            .update(fs.readFileSync(path.join(root, input)))
            .digest('hex');
    }
    for (const logical of ['tools/build/shader-preflight.cjs', 'tools/shader-preflight/cli.cjs'])
        inputs[logical] = crypto
            .createHash('sha256')
            .update(fs.readFileSync(path.join(root, logical)))
            .digest('hex');
    const options = {
        declaration: true,
        emitDeclarationOnly: true,
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        strict: true,
        newLine: ts.NewLineKind.LineFeed,
        noImplicitAny: false,
        types: [],
        lib: ['lib.es2020.d.ts'],
        skipLibCheck: true,
    };
    const program = ts.createProgram([entry], options);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length)
        throw Error(
            ts.formatDiagnosticsWithColorAndContext(diagnostics, {
                getCanonicalFileName: (file) => file,
                getCurrentDirectory: () => root,
                getNewLine: () => '\n',
            }),
        );
    let declarations;
    const emitted = program.emit(
        undefined,
        (file, data) => {
            if (file.replace(/\\/g, '/').endsWith('/tools/shader-preflight/index.d.ts')) declarations = data;
        },
        undefined,
        true,
    );
    if (emitted.emitSkipped || !declarations || /^import\b/m.test(declarations))
        throw Error('Expected self-contained preflight declarations');
    fs.mkdirSync(output, { recursive: true });
    const files = {
        'shader-preflight.js': compiled.outputFiles[0].text,
        'shader-preflight.d.ts': declarations,
        'shader-preflight-cli.cjs': fs.readFileSync(path.join(root, 'tools/shader-preflight/cli.cjs'), 'utf8'),
    };
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(output, name), content);
    if (!fs.existsSync(path.join(output, 'package.json')))
        fs.writeFileSync(path.join(output, 'package.json'), '{"type":"module"}\n');
    const receipt = {
        schema: 'air-shader-preflight-build/1',
        typescript: ts.version,
        esbuild: esbuild.version,
        inputs,
        outputs: Object.fromEntries(
            Object.entries(files).map(([name, content]) => [
                name,
                crypto.createHash('sha256').update(content).digest('hex'),
            ]),
        ),
    };
    fs.mkdirSync(path.join(output, 'metadata'), { recursive: true });
    fs.writeFileSync(
        path.join(output, 'metadata/shader-preflight-build.json'),
        JSON.stringify(receipt, null, 2) + '\n',
    );
    return receipt;
}
module.exports = { buildShaderPreflight };
if (require.main === module) {
    const arg = process.argv.find((value) => value.startsWith('--out='));
    buildShaderPreflight(undefined, arg ? path.resolve(arg.slice(6)) : undefined)
        .then(() => console.log('Standalone Shader preflight built'))
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
}
