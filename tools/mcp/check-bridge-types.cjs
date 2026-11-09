/** Reuse the root TypeScript contract with its original relative type roots and exclusions. Read-only. */
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram([...parsed.fileNames, path.join(root, 'tools/debug/mcp-bridge.ts')], parsed.options);
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
console.log(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => root,
        getNewLine: () => '\n',
    }),
);
if (diagnostics.length) process.exitCode = 1;
else console.log('Root source + MCP bridge types passed.');
