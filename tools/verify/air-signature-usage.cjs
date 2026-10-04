/* PG-31: focused JS/TS usage checks using the real Cocos types. Read-only. */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');

function inspect(files, options = {}) {
    const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    const paths = files.map((file) => path.resolve(file));
    for (const file of paths) if (!fs.existsSync(file)) throw new Error(`input does not exist: ${file}`);
    const program = ts.createProgram(paths, { ...parsed.options, allowJs: true, checkJs: true, noEmit: true });
    const checker = program.getTypeChecker();
    const findings = [];
    function nativeType(type, name) {
        if (type.isUnion()) return type.types.some((part) => nativeType(part, name));
        const symbol = type.getSymbol();
        if (symbol?.getName() === name && symbol.declarations?.some((decl) =>
            /(?:cocos\/scene-graph\/(?:scene|node)\.ts|cocos\/3d\/assets\/mesh\.ts|cocos\/primitive\/define\.ts|cocosair\.module\.d\.ts)$/.test(
                decl.getSourceFile().fileName.replace(/\\/g, '/')))) return true;
        return !!type.isClassOrInterface?.() && (type.getBaseTypes() || []).some((base) => nativeType(base, name));
    }
    function add(source, node, code, message) {
        const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
        findings.push({ file: path.relative(root, source.fileName).replace(/\\/g, '/'), line: pos.line + 1, column: pos.character + 1, code, message });
    }
    for (const file of paths) {
        const source = program.getSourceFile(file);
        if (!source) throw new Error(`unsupported input: ${file}`);
        function visit(node) {
            if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
                const method = node.expression.name.text;
                const receiver = checker.getTypeAtLocation(node.expression.expression);
                if (method === 'addComponent' && nativeType(receiver, 'Scene')) {
                    add(source, node, 'AIR_USAGE_SCENE_COMPONENT', 'Scene.addComponent is a compatibility stub that throws; attach components to a child Node.');
                }
                if (method === 'addChild' && nativeType(receiver, 'Node')) {
                    let usage = node;
                    while (ts.isParenthesizedExpression(usage.parent)) usage = usage.parent;
                    if (!ts.isExpressionStatement(usage.parent) && !ts.isVoidExpression(usage.parent)) {
                        add(source, node, 'AIR_USAGE_VOID_CHILD', 'Node.addChild returns void; keep the child reference before adding it.');
                    }
                }
            }
            if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
                && nativeType(checker.getTypeAtLocation(node.left), 'Mesh')
                && nativeType(checker.getTypeAtLocation(node.right), 'IGeometry')) {
                add(source, node, 'AIR_USAGE_GEOMETRY_MESH', 'primitives return IGeometry; convert with utils.createMesh before assigning a renderer mesh.');
            }
            ts.forEachChild(node, visit);
        }
        visit(source);
    }
    const diagnostics = options.types ? ts.getPreEmitDiagnostics(program).filter((entry) =>
        entry.file && paths.includes(path.resolve(entry.file.fileName))).map((entry) => {
        const pos = entry.file.getLineAndCharacterOfPosition(entry.start || 0);
        return { file: path.relative(root, entry.file.fileName).replace(/\\/g, '/'), line: pos.line + 1,
            column: pos.character + 1, code: `TS${entry.code}`, message: ts.flattenDiagnosticMessageText(entry.messageText, '\n') };
    }) : [];
    return { scope: paths.map((file) => path.relative(root, file).replace(/\\/g, '/')), findings, diagnostics,
        status: findings.length || diagnostics.length ? 'FAIL' : 'PASS',
        limitations: ['Only explicit input files are checked.', 'Unresolved/any receivers and dynamic method aliases require runtime validation.',
            'PASS does not establish rendering, resource lifetime, or whole-application correctness.'] };
}

if (require.main === module) {
    try {
        const args = process.argv.slice(2);
        const files = args.filter((arg) => arg !== '--types');
        if (!files.length || files.some((arg) => arg.startsWith('--'))) throw new Error('usage: node tools/verify/air-signature-usage.cjs [--types] <file.ts|file.js> ...');
        const result = inspect(files, { types: args.includes('--types') });
        console.log(JSON.stringify(result, null, 2));
        process.exitCode = result.status === 'PASS' ? 0 : 1;
    } catch (error) { console.error(String(error.message || error)); process.exitCode = 2; }
}
module.exports = { inspect };
