const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');

function palDeclarations(engine) {
    const vendor = path.resolve(engine, '../vendor/pal-source/pal');
    if (!fs.existsSync(vendor)) throw new Error('Missing frozen PAL declaration source');
    const files = ['system-info', 'screen-adapter'].flatMap((part) => {
        const dir = path.join(vendor, part, 'enum-type');
        return fs
            .readdirSync(dir)
            .filter((file) => file.endsWith('.ts'))
            .map((file) => path.join(dir, file));
    });
    const manifest = JSON.parse(fs.readFileSync(path.join(vendor, '../manifest.json'), 'utf8'));
    if (manifest.typescriptVersion !== ts.version) throw new Error('PAL declaration compiler version drift');
    for (const file of files) {
        const relative = path.relative(path.dirname(vendor), file).split(path.sep).join('/');
        const row = manifest.inputs.find((entry) => entry.source === relative);
        const bytes = fs.readFileSync(file);
        const hash = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
        if (!row || row.sha256 !== hash) throw new Error(`PAL declaration source drift: ${relative}`);
        const js = ts.transpileModule(bytes.toString(), {
            fileName: relative,
            compilerOptions: {
                target: ts.ScriptTarget.ES2020,
                module: ts.ModuleKind.ES2020,
                newLine: ts.NewLineKind.LineFeed,
                removeComments: false,
                useDefineForClassFields: false,
            },
        }).outputText;
        if (fs.readFileSync(path.resolve(engine, '..', row.output), 'utf8') !== js) {
            throw new Error(`PAL declaration/runtime mismatch: ${relative}`);
        }
    }
    const result = new Map();
    const program = ts.createProgram(files, {
        declaration: true,
        emitDeclarationOnly: true,
        strict: true,
        types: [],
        target: ts.ScriptTarget.ES2020,
        rootDir: vendor,
        outDir: path.join(engine, 'pal'),
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length)
        throw new Error(
            ts.formatDiagnosticsWithColorAndContext(diagnostics, {
                getCurrentDirectory: () => process.cwd(),
                getCanonicalFileName: (file) => file,
                getNewLine: () => '\n',
            }),
        );
    program.emit(undefined, (file, text) => result.set(path.resolve(file), text));
    return result;
}

async function withSymbolDeclarations(engine, build) {
    const virtual = palDeclarations(engine);
    const ccRequire = createRequire(require.resolve('@cocos/ccbuild'));
    const compiler = ccRequire('typescript');
    const transformer = require(
        path.resolve(path.dirname(require.resolve('@cocos/ccbuild')), '../../modules/transformer/lib/index.js'),
    );
    if (
        transformer.typescript.core.sys !== compiler.sys ||
        transformer.typescript.core.createProgram !== compiler.createProgram ||
        compiler.version !== ts.version
    ) {
        throw new Error('Unexpected ccbuild declaration compiler instance');
    }
    const originals = { readFile: compiler.sys.readFile, fileExists: compiler.sys.fileExists };
    compiler.sys.readFile = (file, ...args) => virtual.get(path.resolve(file)) ?? originals.readFile(file, ...args);
    compiler.sys.fileExists = (file) => virtual.has(path.resolve(file)) || originals.fileExists(file);
    try {
        return await build(virtual);
    } finally {
        Object.assign(compiler.sys, originals);
    }
}

function stageSymbolDeclarations(options, engine, virtual = palDeclarations(engine)) {
    const root = path.resolve(options.rootDir);
    const input = Array.isArray(options.input) ? [...options.input] : [options.input];
    function stage(relative, text) {
        const target = path.join(root, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, text);
        input.push(target);
    }
    for (const [file, text] of virtual) stage(path.relative(engine, file), text);
    const spark = 'air/spark/generated/spark-runtime.d.ts';
    stage(spark, fs.readFileSync(path.join(engine, spark), 'utf8'));
    // tfig drops namespace re-exports. Materialize the exact original namespace
    // value surface as property-level queries; each symbol is then distributed
    // normally, including non-public exports, without inventing an API alias.
    const index = path.join(root, 'index.d.ts');
    let nativeEngineType;
    let nativeEngineImports;
    if (fs.existsSync(index)) {
        const program = ts.createProgram([index, ...input], {
            noLib: true,
            types: [],
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
        });
        const checker = program.getTypeChecker();
        const symbol = checker.getSymbolAtLocation(program.getSourceFile(index));
        const keys = checker
            .getExportsOfModule(symbol)
            .filter((entry) => {
                const target = entry.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(entry) : entry;
                return !!(target.flags & ts.SymbolFlags.Value);
            })
            .map((entry) => entry.name)
            .sort();
        if (!keys.length) throw new Error('Missing native engine value exports');
        nativeEngineImports = `import { ${keys.map((key, i) => `${key} as __airNativeValue${i}`).join(', ')} } from "../../index";\n`;
        nativeEngineType = `{ ${keys.map((key, i) => `readonly ${JSON.stringify(key)}: typeof __airNativeValue${i};`).join(' ')} }`;
    }
    // tfig does not retain global script aliases, and flattens the DragonBones
    // namespace around ES Map references. Normalize declaration inputs, not output.
    for (const relative of [
        'cocos/tiledmap/tiled-layer.d.ts',
        'cocos/dragon-bones/ArmatureCache.d.ts',
        'cocos/dragon-bones/ArmatureDisplay.d.ts',
        'air/spark/cocos-renderer.d.ts',
    ]) {
        const file = path.join(root, relative);
        if (!fs.existsSync(file)) continue;
        const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
        const changes = [];
        let needsNativeImports = false;
        function visit(node) {
            if (ts.isTypeQueryNode(node) && ts.isIdentifier(node.exprName) && node.exprName.text === 'nativeEngine') {
                if (!nativeEngineType) throw new Error('Missing native engine declaration entry');
                needsNativeImports = true;
                changes.push([node.getStart(source), node.end, nativeEngineType]);
            }
            if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
                if (node.typeName.text === 'SafeArray' && node.typeArguments?.length === 1) {
                    const globalsFile = path.join(engine, '@types/globals.d.ts');
                    const globals = ts.createSourceFile(
                        globalsFile,
                        fs.readFileSync(globalsFile, 'utf8'),
                        ts.ScriptTarget.Latest,
                        true,
                    );
                    const alias = globals.statements.find(
                        (statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === 'SafeArray',
                    );
                    if (!alias || alias.type.getText(globals).replace(/\s/g, '') !== 'Array<T|undefined>') {
                        throw new Error('SafeArray declaration contract drift');
                    }

                    changes.push([
                        node.getStart(source),
                        node.end,
                        `Array<${node.typeArguments[0].getText(source)} | undefined>`,
                    ]);
                } else if (node.typeName.text === 'Map' && node.typeArguments?.length === 2) {
                    changes.push([node.typeName.getStart(source), node.typeName.end, 'globalThis.Map']);
                }
            }
            ts.forEachChild(node, visit);
        }
        visit(source);
        let text = source.text;
        for (const [start, end, replacement] of changes.sort((a, b) => b[0] - a[0]))
            text = text.slice(0, start) + replacement + text.slice(end);
        if (needsNativeImports) {
            if (source.text.includes('__airNativeValue')) throw new Error('Native namespace input name collision');
            text = nativeEngineImports + text;
        }
        fs.writeFileSync(file, text);
    }
    return { ...options, input: [...new Set(input)] };
}
module.exports = { palDeclarations, withSymbolDeclarations, stageSymbolDeclarations };
