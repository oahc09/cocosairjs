const fs = require('fs');
const path = require('path');
const { resolveScript } = require('../dev/resolve-script.cjs');
const ts = require('typescript');

/** Local JS/TS import closure within the examples root, with real deploy resolution. */
function collectSources(absDir, rootForRel) {
    const out = [];
    const visited = new Set();
    const root = path.resolve(rootForRel);
    function visit(file) {
        const full = path.resolve(file);
        const rel = path.relative(root, full);
        if (
            rel === '..' ||
            rel.startsWith('..' + path.sep) ||
            path.isAbsolute(rel) ||
            visited.has(full) ||
            !fs.existsSync(full) ||
            !/\.(?:ts|js)$/.test(full)
        )
            return;
        visited.add(full);
        const code = fs.readFileSync(full, 'utf8');
        const lines = code.split(/\r?\n/);
        out.push({ file: full, rel, lines });
        const ast = ts.createSourceFile(full, code, ts.ScriptTarget.Latest, true);
        function imports(node) {
            let specifier;
            if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) specifier = node.moduleSpecifier;
            if (ts.isExportDeclaration(node) && !node.isTypeOnly) specifier = node.moduleSpecifier;
            if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
                specifier = node.arguments[0];
            if (specifier && ts.isStringLiteral(specifier) && /^(?:\.\/|\.\.\/)/.test(specifier.text)) {
                visit(resolveScript(path.resolve(path.dirname(full), specifier.text)));
            }
            ts.forEachChild(node, imports);
        }
        imports(ast);
    }
    function walk(dir) {
        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
            if (item.name === 'node_modules') continue;
            const full = path.join(dir, item.name);
            if (item.isDirectory()) walk(full);
            else visit(full);
        }
    }
    walk(absDir);
    return out;
}
function hasLifecycleInstallation(source) {
    const ast = ts.createSourceFile(source.file, source.lines.join('\n'), ts.ScriptTarget.Latest, true);
    let installed = false;
    function visit(node) {
        if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'installAssetLifecycle'
        )
            installed = true;
        if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isPropertyAccessExpression(node.left) &&
            node.left.name.text === '__lifecycle' &&
            (ts.isArrowFunction(node.right) || ts.isFunctionExpression(node.right))
        )
            installed = true;
        if (!installed) ts.forEachChild(node, visit);
    }
    visit(ast);
    return installed;
}
module.exports = { collectSources, hasLifecycleInstallation };
