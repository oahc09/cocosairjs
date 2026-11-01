const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
async function buildSparkModule(outDir = path.join(root, 'build')) {
    const mainSource = path.join(root, 'src/index.ts');
    const result = await esbuild.build({
        entryPoints: [path.join(root, 'src/exports/spark.ts')],
        outfile: path.join(outDir, 'spark.module.js'),
        bundle: true, format: 'esm', platform: 'browser', target: 'es2020',
        sourcemap: true, metafile: true, write: false, keepNames: true,
        plugins: [{
            name: 'borrow-main-engine',
            setup(build) {
                build.onResolve({ filter: /^\.\.?\// }, args => {
                    const absolute = path.resolve(args.resolveDir, args.path);
                    if (absolute === mainSource || absolute + '.ts' === mainSource) {
                        return { path: './cocosair.module.js', external: true };
                    }
                    return undefined;
                });
            },
        }],
    });
    const forbidden = Object.keys(result.metafile.inputs).filter(file => /(?:^|\/)src\/(?:cocos|pal|exports\/base)\//.test(file.replace(/\\/g, '/')));
    if (forbidden.length) throw new Error('Spark must not bundle Cocos: ' + forbidden.join(', '));
    fs.mkdirSync(outDir, { recursive: true });
    for (const file of result.outputFiles) fs.writeFileSync(file.path, file.contents);
    fs.mkdirSync(path.join(outDir, 'metadata'), { recursive: true });
    fs.writeFileSync(path.join(outDir, 'metadata', 'spark.module.meta.json'), JSON.stringify(result.metafile, null, 2) + '\n');
    fs.rmSync(path.join(outDir, 'spark.module.meta.json'), { force: true });
    buildSparkTypes(outDir);
    // Retire only the former all-in-one Spark bundle, never the main engine.
    for (const file of ['cocosair.module.spark.js', 'cocosair.module.spark.js.map']) {
        fs.rmSync(path.join(outDir, file), { force: true });
    }
    console.log('[spark] independent JS/map and declarations; main engine remains external');
}

function buildSparkTypes(outDir) {
    const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    const program = ts.createProgram([path.join(root, 'src/exports/spark.ts'),
        ...parsed.fileNames.filter(file => file.endsWith('.d.ts'))], {
        ...parsed.options, noEmit: false, declaration: true, emitDeclarationOnly: true,
        newLine: ts.NewLineKind.LineFeed,
        module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.NodeJs,
        rootDir: path.join(root, 'src'),
        outDir: path.join(outDir, '.spark-types'),
    });
    const errors = ts.getPreEmitDiagnostics(program).filter(diagnostic => diagnostic.file
        && diagnostic.file.fileName.replace(/\\/g, '/').includes('/src/air/spark/'));
    if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
        getCurrentDirectory: () => root, getCanonicalFileName: file => file, getNewLine: () => '\n',
    }));
    const files = new Map();
    for (const source of program.getSourceFiles()) {
        if (source.isDeclarationFile || !source.fileName.replace(/\\/g, '/').includes('/src/air/spark/')) continue;
        const emitted = program.emit(source, (file, text) => files.set(file, text));
        if (emitted.emitSkipped) throw new Error('Cannot emit Spark declaration: ' + source.fileName
            + '\n' + ts.formatDiagnosticsWithColorAndContext(emitted.diagnostics, {
                getCurrentDirectory: () => root, getCanonicalFileName: file => file, getNewLine: () => '\n',
            }));
    }
    const typesDir = path.join(outDir, 'spark-types');
    fs.mkdirSync(typesDir, { recursive: true });
    for (const [file, text] of files) {
        if (file.replace(/\\/g, '/').includes('/air/spark/')) {
            const rewritten = text.replace(/(['"])\.\.\/\.\.\/index\1/g, "'../cocosair.module.js'")
                .replace(/(['"])\.\.\/\.\.\/cocos\/gfx(?:\/webgl2\/[\w-]+)?\1/g, "'./native-gfx.js'")
                .replace("typeof import('./native-gfx.js')", "typeof import('../cocosair.module.js').gfx");
            if (/from ['"]\.\.\/\.\.\//.test(rewritten)) throw new Error('Unmapped native type import: ' + file);
            fs.writeFileSync(path.join(typesDir, path.basename(file)), rewritten);
        }
    }
    // The frozen JS subtree already provides its deliberately limited declaration surface.
    fs.mkdirSync(path.join(typesDir, 'generated'), { recursive: true });
    fs.copyFileSync(path.join(root, 'src/air/spark/generated/spark-runtime.d.ts'), path.join(typesDir, 'generated/spark-runtime.d.ts'));
    const gfxNames = ['Attribute', 'BlendFactor', 'BlendOp', 'Buffer', 'CommandBuffer', 'ComparisonFunc',
        'DescriptorSet', 'DescriptorSetLayout', 'Framebuffer', 'Format', 'InputAssembler', 'PipelineLayout',
        'PipelineState', 'RenderPass', 'Sampler', 'Shader', 'StencilOp', 'Texture', 'TextureType'];
    fs.writeFileSync(path.join(typesDir, 'native-gfx.d.ts'),
        "import type { gfx } from '../cocosair.module.js';\n"
        + gfxNames.map(name => `export type ${name} = gfx.${name};`).join('\n') + '\n'
        + 'export type WebGL2Device = gfx.Device;\nexport type WebGL2Framebuffer = gfx.Framebuffer;\n');
    fs.writeFileSync(path.join(outDir, 'spark.module.d.ts'),
        "export { CocosRenderer } from './spark-types/cocos-renderer.js';\n"
        + "export { CocosSparkLayer } from './spark-types/cocos-spark-layer.js';\n"
        + "export { PMREMGenerator, pmremLayout, CUBEUV_SAMPLING_GLSL } from './spark-types/pmrem.js';\n"
        + "export * as sparkRuntime from './spark-types/generated/spark-runtime.js';\n");
    fs.appendFileSync(path.join(outDir, 'spark.module.d.ts'),
        "export * as sparkMath from './spark-types/spark-math.js';\n");
}

module.exports = { buildSparkModule };
if (require.main === module) buildSparkModule().catch(error => { console.error(error); process.exitCode = 1; });
