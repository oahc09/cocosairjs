/** Read-only targeted source consumption. No SDK/declaration writes. */
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
// Keep project aliases and ambient/native contracts. The page targets modern WebGL2 browsers.
const options = { ...parsed.options, noEmit: true, lib: ['lib.es2020.d.ts', 'lib.dom.d.ts'] };
const program = ts.createProgram(
    [path.join(__dirname, 'src/main.ts'), ...parsed.fileNames.filter((file) => file.endsWith('.d.ts'))],
    options,
);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
    console.error(
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
            getCanonicalFileName: (value) => value,
            getCurrentDirectory: () => root,
            getNewLine: () => '\n',
        }),
    );
    process.exitCode = 1;
} else console.log('hdr-color-pipeline source typecheck PASS (native source graph, noEmit)');
