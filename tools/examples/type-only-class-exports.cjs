// Declaration inventory support: an exported class type is not a runtime constructor.
const ts = require('typescript');
function typeOnlyClassExports(ast) {
    const result = new Map();
    for (const node of ast.statements) {
        if (
            !ts.isExportDeclaration(node) ||
            node.moduleSpecifier ||
            !node.exportClause ||
            !ts.isNamedExports(node.exportClause)
        )
            continue;
        for (const element of node.exportClause.elements)
            if (node.isTypeOnly || element.isTypeOnly) {
                const local = element.propertyName?.text || element.name.text;
                if (
                    ast.statements.some(
                        (statement) =>
                            ts.isClassDeclaration(statement) &&
                            statement.name?.text === local &&
                            !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
                    )
                )
                    result.set(local, element.name.text);
            }
    }
    return result;
}
// Namespace-local named re-exports are public value aliases, not new declarations.
function namespaceValueAliases(ast) {
    const aliases = [];
    function visit(statements, prefix = '') {
        for (const node of statements) {
            if (
                ts.isModuleDeclaration(node) &&
                node.body &&
                ts.isModuleBlock(node.body) &&
                node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
            ) {
                visit(node.body.statements, `${prefix}${node.name.text}.`);
            } else if (
                prefix &&
                ts.isExportDeclaration(node) &&
                !node.isTypeOnly &&
                !node.moduleSpecifier &&
                node.exportClause &&
                ts.isNamedExports(node.exportClause)
            ) {
                for (const element of node.exportClause.elements)
                    if (!element.isTypeOnly)
                        aliases.push({
                            alias: prefix + element.name.text,
                            target: element.propertyName?.text || element.name.text,
                            scope: prefix.slice(0, -1),
                            node,
                        });
            }
        }
    }
    visit(ast.statements);
    return aliases;
}
function resolveAliasTarget(alias, units) {
    const parts = (alias.scope || '').split('.').filter(Boolean);
    for (let length = parts.length; length >= 0; length--) {
        const name = [...parts.slice(0, length), alias.target].join('.');
        if (Object.hasOwn(units, name)) return name;
    }
    return null;
}
module.exports = { typeOnlyClassExports, namespaceValueAliases, resolveAliasTarget };
