const path = require('node:path');
const esbuild = require('esbuild');
const ts = require('typescript');
exports.buildHTMLSourceEntry = async (outDir) => {
    const source = path.resolve(__dirname, '../../src/air/html-source.ts');
    const built = await esbuild.build({ entryPoints: [source], outfile: path.join(outDir, 'html-source.js'),
        bundle: true, format: 'esm', platform: 'browser', target: 'es2020', sourcemap: true, metafile: true });
    if (Object.keys(built.metafile.inputs).length !== 1) throw new Error('html-source must remain engine-free');
    const program = ts.createProgram([source], { declaration: true, emitDeclarationOnly: true, outDir,
        target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020, newLine: ts.NewLineKind.LineFeed, strict: true, skipLibCheck: true });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: file => file, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
    }));
    if (program.emit().emitSkipped) throw new Error('html-source declarations were not emitted');
};
