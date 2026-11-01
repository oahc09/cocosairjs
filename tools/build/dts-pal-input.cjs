const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// The frozen PAL ambient contract uses bare engine type imports, while tfig only
// resolves its explicit module map. Adapt temporary inputs, never vendor sources
// or the finished bundle. Three old ambient methods also omit their runtime void.
function stagePalInputDeclarations(options, repositoryRoot) {
    const file = path.join(options.rootDir, '@types/pal/input.d.ts');
    if (!fs.existsSync(file)) throw new Error('Missing staged PAL input declarations');
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const expected = new Map([
        ['HandleInputDevice', 'handle-input.ts'],
        ['HMDInputDevice', 'hmd-input.ts'],
        ['HandheldInputDevice', 'handheld-input.ts'],
    ]);
    const changes = [];
    function visit(node) {
        if (ts.isClassDeclaration(node) && expected.has(node.name?.text)) {
            const name = node.name.text;
            const runtimeFile = path.join(repositoryRoot, 'vendor/pal-source/pal/input/web', expected.get(name));
            const runtime = ts.createSourceFile(runtimeFile, fs.readFileSync(runtimeFile, 'utf8'), ts.ScriptTarget.Latest, true);
            const runtimeClass = runtime.statements.find((item) => ts.isClassDeclaration(item) && item.name?.text === name);
            const method = runtimeClass?.members.find((item) => ts.isMethodDeclaration(item) && item.name.getText(runtime) === '_on');
            if (method?.type?.kind !== ts.SyntaxKind.VoidKeyword) throw new Error(`PAL ${name}._on return contract drift`);
            const ambient = node.members.filter((item) => ts.isMethodDeclaration(item) && item.name.getText(source) === '_on');
            if (ambient.length !== 1 || ambient[0].type || !ambient[0].getText(source).endsWith(';')) {
                throw new Error(`PAL ${name}._on declaration contract drift`);
            }
            changes.push([ambient[0].end - 1, ': void']);
            expected.delete(name);
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
    if (expected.size) throw new Error('Missing PAL input method declarations');
    let text = source.text;
    for (const [position, replacement] of changes.sort((a, b) => b[0] - a[0])) {
        text = text.slice(0, position) + replacement + text.slice(position);
    }
    const moduleMap = { ...options.moduleMap };
    for (const name of ['cocos/input/types', 'cocos/input/types/event', 'cocos/input/types/event-enum']) {
        const target = path.join(options.rootDir, name + (name.endsWith('/event-enum') ? '.d.ts' : '/index.d.ts'));
        if (!fs.existsSync(target)) throw new Error(`Missing emitted PAL type dependency: ${name}`);
        if (moduleMap[name] && path.resolve(moduleMap[name]) !== path.resolve(target)) {
            throw new Error(`Conflicting PAL input module mapping: ${name}`);
        }
        moduleMap[name] = target;
    }
    fs.writeFileSync(file, text);
    return { ...options, moduleMap };
}
module.exports = { stagePalInputDeclarations };
