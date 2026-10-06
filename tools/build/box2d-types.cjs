/* Generate declaration-only Box2D inputs so ccbuild never emits dependency TS
 * outside its engine root. Runtime package bytes remain verbatim. */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function generateBox2DTypes(packageDir) {
    const root = path.resolve(packageDir);
    const declarations = new Map();
    const entry = path.join(root, 'index.d.ts');
    const options = {
        declaration: true, emitDeclarationOnly: true, types: [],
        target: ts.ScriptTarget.ES2015, module: ts.ModuleKind.CommonJS,
        newLine: ts.NewLineKind.LineFeed,
        rootDir: root, outDir: path.join(root, '__air_types'),
    };
    const discovery = ts.createProgram([entry], options);
    // Imported node_modules TS files are external-library inputs and otherwise
    // skipped by emit. Make the reachable implementation files explicit roots.
    const roots = discovery.getSourceFiles().filter(f => !f.isDeclarationFile &&
        path.resolve(f.fileName).startsWith(root + path.sep)).map(f => f.fileName);
    const program = ts.createProgram([entry, ...roots], options);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length) throw Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: f => f, getCurrentDirectory: () => root, getNewLine: () => '\n',
    }));
    const result = program.emit(undefined, (name, text) => {
        const rel = path.relative(path.join(root, '__air_types'), name).replace(/\\/g, '/');
        if (rel.startsWith('../') || !rel.endsWith('.d.ts')) throw Error('Invalid Box2D declaration path: ' + name);
        declarations.set('types/' + rel, text);
    });
    if (result.emitSkipped || result.diagnostics.length) throw Error('Box2D declaration emission failed');
    declarations.set('types/index.d.ts', fs.readFileSync(entry, 'utf8').replace(/\r\n/g, '\n').trimEnd() + '\n');
    return declarations;
}

module.exports = { generateBox2DTypes };
