/* ccbuild's declaration bundler enumerates all feature units and tfig erases
 * type-only exports. Bridge only this build invocation, preserving installed tools.
 * The public surface comes from the same default features as the runtime build,
 * never from a hand-maintained exclusion list or a patched installed SDK.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { DEFAULT_FEATURES } = require('./default-features.cjs');

function isTypeOnlyAlias(symbol) {
    return symbol.declarations?.some(
        (declaration) =>
            ts.isExportSpecifier(declaration) && (declaration.isTypeOnly || declaration.parent.parent.isTypeOnly),
    );
}

function prepareGiftOptions(options, entryFiles) {
    assert(options.entries?.cc && options.rootDir, 'unexpected ccbuild declaration invocation');
    for (const file of entryFiles) assert(fs.existsSync(file), 'missing emitted main entry: ' + file);
    const entry = options.entries.cc;
    const source =
        entryFiles
            .map((file) => {
                let relative = path
                    .relative(path.dirname(entry), file)
                    .split(path.sep)
                    .join('/')
                    .replace(/\.d\.ts$/, '');
                if (!relative.startsWith('.')) relative = './' + relative;
                return `export * from ${JSON.stringify(relative)};`;
            })
            .join('\n') + '\n';
    fs.writeFileSync(entry, source);
    return {
        ...options,
        // An @engineInternal tag cannot hide a value already exported by the runtime.
        // Non-exported dependencies remain private through normal reachability.
        privateJsDocTag: undefined,
        priority: [entry, ...(options.priority || []).filter((file) => file !== entry)],
    };
}

function collectEntrySurface(options) {
    const compilerOptions = { moduleResolution: ts.ModuleResolutionKind.NodeJs, skipLibCheck: true };
    const host = ts.createCompilerHost(compilerOptions);
    host.resolveModuleNames = (names, importer) =>
        names.map((name) =>
            options.moduleMap?.[name]
                ? { resolvedFileName: options.moduleMap[name] }
                : ts.resolveModuleName(name, importer, compilerOptions, host).resolvedModule,
        );
    const program = ts.createProgram([options.entries.cc, ...[].concat(options.input)], compilerOptions, host);
    const checker = program.getTypeChecker();
    const entry = program.getSourceFile(options.entries.cc);
    const symbol = entry && checker.getSymbolAtLocation(entry);
    assert(symbol, 'main declaration entry did not resolve');
    const names = new Set(checker.getExportsOfModule(symbol).map((exported) => exported.name));
    const values = new Set();
    const visited = new Set();
    function collectValues(module) {
        if (visited.has(module)) return;
        visited.add(module);
        for (const exported of checker.getExportsOfModule(module)) {
            const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
            if (target.flags & ts.SymbolFlags.Value && !isTypeOnlyAlias(exported)) values.add(exported.name);
        }
        // A type-only named re-export may coexist with a real compatibility value
        // re-exported through `export *`. TypeScript's type table selects the named
        // type, while emitted JavaScript still exposes the wildcard value.
        for (const declaration of module.declarations || []) {
            if (!ts.isSourceFile(declaration)) continue;
            for (const statement of declaration.statements) {
                if (
                    !ts.isExportDeclaration(statement) ||
                    statement.isTypeOnly ||
                    statement.exportClause ||
                    !statement.moduleSpecifier
                )
                    continue;
                const child = checker.getSymbolAtLocation(statement.moduleSpecifier);
                if (child) collectValues(child);
            }
        }
    }
    collectValues(symbol);
    for (const name of values) names.add(name);
    assert(values.size, 'main declaration entry has no runtime values');
    return {
        names: [...names].sort(),
        values: [...values].sort(),
        typeOnly: [...names].filter((name) => !values.has(name)).sort(),
    };
}

function reconcileExports(code, surface) {
    const source = ts.createSourceFile('cocosair.module.d.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    assert.equal(source.parseDiagnostics.length, 0, 'generated declaration syntax must parse');
    const names = new Set(surface.names),
        values = new Set(surface.values);
    const typeExports = new Set();
    const changed = [];
    const modifiersFor = (node, name) => {
        const modifiers = (node.modifiers || []).filter(
            (modifier) =>
                modifier.kind !== ts.SyntaxKind.ExportKeyword && modifier.kind !== ts.SyntaxKind.DeclareKeyword,
        );
        if (values.has(name)) modifiers.unshift(ts.factory.createModifier(ts.SyntaxKind.ExportKeyword));
        else {
            modifiers.unshift(ts.factory.createModifier(ts.SyntaxKind.DeclareKeyword));
            if (names.has(name)) typeExports.add(name);
        }
        return modifiers;
    };
    for (const statement of source.statements) {
        if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
            const elements = statement.exportClause.elements
                .filter((entry) => names.has(entry.name.text))
                .map((entry) =>
                    ts.factory.updateExportSpecifier(
                        entry,
                        !values.has(entry.name.text),
                        entry.propertyName,
                        entry.name,
                    ),
                );
            changed.push(
                ts.factory.updateExportDeclaration(
                    statement,
                    statement.modifiers,
                    false,
                    ts.factory.updateNamedExports(statement.exportClause, elements),
                    statement.moduleSpecifier,
                    statement.assertClause,
                ),
            );
        } else if (ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) {
                assert(ts.isIdentifier(declaration.name), 'unexpected destructuring in generated public declaration');
                changed.push(
                    ts.factory.updateVariableStatement(
                        statement,
                        modifiersFor(statement, declaration.name.text),
                        ts.factory.updateVariableDeclarationList(statement.declarationList, [declaration]),
                    ),
                );
            }
        } else if (
            ts.isClassDeclaration(statement) ||
            ts.isEnumDeclaration(statement) ||
            ts.isFunctionDeclaration(statement) ||
            (ts.isModuleDeclaration(statement) && ts.isIdentifier(statement.name))
        ) {
            assert(statement.name, 'unnamed public declaration');
            changed.push(ts.factory.updateModifiers(statement, modifiersFor(statement, statement.name.text)));
        } else if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
            const modifiers = (statement.modifiers || []).filter(
                (modifier) => modifier.kind !== ts.SyntaxKind.ExportKeyword,
            );
            if (names.has(statement.name.text))
                modifiers.unshift(ts.factory.createModifier(ts.SyntaxKind.ExportKeyword));
            changed.push(ts.factory.updateModifiers(statement, modifiers));
        } else changed.push(statement);
    }
    if (typeExports.size)
        changed.push(
            ts.factory.createExportDeclaration(
                undefined,
                true,
                ts.factory.createNamedExports(
                    [...typeExports].sort().map((name) => ts.factory.createExportSpecifier(false, undefined, name)),
                ),
            ),
        );
    // Keep explicit external-module semantics: otherwise declaration files implicitly export locals.
    changed.push(ts.factory.createExportDeclaration(undefined, false, ts.factory.createNamedExports([])));
    return ts
        .createPrinter({ newLine: ts.NewLineKind.LineFeed })
        .printFile(ts.factory.updateSourceFile(source, changed));
}

async function withMainDeclarations(root, build, receipt) {
    const ccbuildEntry = require.resolve('@cocos/ccbuild');
    const { StatsQuery } = require(ccbuildEntry);
    const stats = await StatsQuery.create(path.join(root, 'src'));
    const units = stats.getUnitsOfFeatures(DEFAULT_FEATURES.slice());
    const gift = require(require.resolve('@cocos/tfig', { paths: [path.dirname(ccbuildEntry)] }));
    const original = gift.bundle;
    let calls = 0;
    gift.bundle = (options) => {
        calls++;
        receipt.bundleCalls = calls;
        receipt.phase = 'bundling';
        assert.equal(calls, 1, 'unexpected repeated declaration bundle invocation');
        const entryFiles = units.map((unit) =>
            path.join(
                options.rootDir,
                path.relative(path.join(root, 'src'), stats.getFeatureUnitFile(unit)).replace(/\.ts$/, '.d.ts'),
            ),
        );
        const configured = prepareGiftOptions(options, entryFiles);
        Object.assign(receipt, { features: DEFAULT_FEATURES.slice(), units, surface: collectEntrySurface(configured) });
        const result = original(configured);
        receipt.phase = 'bundle-complete';
        return result;
    };
    try {
        const result = await build();
        assert.equal(calls, 1, 'ccbuild did not invoke the configured declaration bundler');
        return result;
    } finally {
        gift.bundle = original;
    }
}
function isCleanupOnlyError(error, { receipt, temporaryDir, outDir }) {
    if (receipt.bundleCalls !== 1 || receipt.phase !== 'bundle-complete' || !receipt.surface) return false;
    if (!['EACCES', 'EPERM', 'EBUSY'].includes(error?.code) || !['rmdir', 'unlink', 'rm'].includes(error?.syscall))
        return false;
    if (typeof error.path !== 'string' || !path.isAbsolute(error.path)) return false;
    const target = path.resolve(error.path),
        temporary = path.resolve(temporaryDir);
    if (target !== temporary && !target.startsWith(temporary + path.sep)) return false;
    const output = path.join(outDir, 'cc.d.ts');
    if (!fs.existsSync(output)) return false;
    const code = fs.readFileSync(output, 'utf8');
    return (
        /^\s*declare module "cc" \{/.test(code) &&
        /\}\s*$/.test(code) &&
        ts.createSourceFile(output, code, ts.ScriptTarget.Latest, true).parseDiagnostics.length === 0
    );
}

async function runDeclarationBuild(build, context) {
    try {
        const result = await build();
        if (result !== true) throw new Error('ccbuild declaration bundling did not succeed');
        return { recoveredCleanup: false };
    } catch (error) {
        if (!isCleanupOnlyError(error, context)) throw error;
        return { recoveredCleanup: true, code: error.code, syscall: error.syscall };
    }
}

module.exports = {
    isTypeOnlyAlias,
    prepareGiftOptions,
    collectEntrySurface,
    reconcileExports,
    withMainDeclarations,
    isCleanupOnlyError,
    runDeclarationBuild,
};
