/** Read-only EX03 typecheck against one explicitly selected existing SDK declaration entry. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../..');
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--dts' || !args[1]) {
    console.error('Usage: node tools/verify/box3d/trigger-lifecycle/check-types.cjs --dts <existing SDK declaration file>');
    process.exit(2);
}
const dts = path.resolve(process.cwd(), args[1]);
if (!fs.existsSync(dts) || !fs.statSync(dts).isFile() || !/\.d\.(?:ts|mts|cts)$/.test(dts)) {
    console.error(`Expected an existing SDK declaration file: ${dts}`);
    process.exit(2);
}
const ts = require('typescript');
const entry = path.join(root, 'examples/box3d-trigger-lifecycle/src/main.ts');
const program = ts.createProgram([entry], {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    allowJs: true,
    checkJs: false,
    baseUrl: root,
    paths: { cocosair: [dts] },
});
const diagnostics = ts.getPreEmitDiagnostics(program);
console.log(`Selected SDK declarations: ${dts}`);
console.log(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => root,
        getNewLine: () => '\n',
    }),
);
console.log(`EX03 noEmit diagnostics: ${diagnostics.length}`);
process.exitCode = diagnostics.length ? 1 : 0;
