/* ccbuild's declaration bundler enumerates all feature units and tfig erases
 * type-only exports. Bridge only this build invocation, preserving installed tools.
 * Runtime value exports come from the same default features as the JS build.
 * Preserve the original all-feature declaration graph for existing type-only
 * consumers; optional feature types never manufacture default runtime values.
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

// ccbuild writes absolute imports into its generated all-feature entry. Normalize
// the actual temporary input, not just its receipt: both bundler passes must see
// the same portable source that originalEntrySha256 identifies.
function normalizeCompatibleEntry(options, source, excludedInputs = new Set()) {
    assert(options.rootDir && options.entries?.cc && Array.isArray(options.input), 'missing declaration input scope');
    const root = path.resolve(options.rootDir);
    const realRoot = fs.realpathSync(root);
    const entry = path.resolve(options.entries.cc);
    const within = (base, file) => {
        const relative = path.relative(base, file);
        return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
    };
    assert(within(root, entry) && within(realRoot, fs.realpathSync(entry)), 'declaration entry outside input root');
    const known = new Set(options.input.map((file) => path.resolve(file)));
    assert(known.has(entry), 'unknown declaration entry');
    const ast = ts.createSourceFile(entry, source, ts.ScriptTarget.Latest, true);
    assert.equal(ast.parseDiagnostics.length, 0, 'original declaration entry must parse');
    const replacements = [];
    for (const statement of ast.statements) {
        assert(
            ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement),
            'unsupported original declaration entry statement',
        );
        const specifier = statement.moduleSpecifier;
        if (!specifier) continue;
        assert(ts.isStringLiteral(specifier), 'unsupported declaration module specifier');
        const request = specifier.text;
        assert(
            !/[\\\x00-\x1f]/.test(request) &&
                (path.isAbsolute(request) || request.startsWith('./') || request.startsWith('../')),
            'unsupported declaration module path',
        );
        const resolved = path.resolve(path.dirname(entry), request);
        const target = resolved.endsWith('.d.ts') ? resolved : resolved + '.d.ts';
        assert(within(root, target), 'declaration module outside input root');
        if (excludedInputs.has(target) && !known.has(target) && !fs.existsSync(target)) {
            // ccbuild's original entry includes even the feature roots explicitly
            // excluded by tsconfig. Keep those unresolved imports, but only when
            // their absence is independently derived from the current source config.
            const parent = fs.realpathSync(path.dirname(target));
            assert(parent === realRoot || within(realRoot, parent), 'excluded module outside real input root');
        } else {
            assert(
                known.has(target) && fs.existsSync(target),
                'unknown declaration module input: ' + path.relative(root, target).split(path.sep).join('/'),
            );
            assert(
                fs.statSync(target).isFile() && within(realRoot, fs.realpathSync(target)),
                'declaration module outside real input root',
            );
        }
        let relative = path.relative(path.dirname(entry), target).split(path.sep).join('/').replace(/\.d\.ts$/, '');
        if (!relative.startsWith('.')) relative = './' + relative;
        replacements.push({ start: specifier.getStart(ast), end: specifier.end, text: JSON.stringify(relative) });
    }
    assert(replacements.length, 'original declaration entry has no module inputs');
    let normalized = source;
    for (const replacement of replacements.reverse())
        normalized = normalized.slice(0, replacement.start) + replacement.text + normalized.slice(replacement.end);
    return normalized;
}

function excludedFeatureInputs(stats, declarationRoot) {
    const config = ts.getParsedCommandLineOfConfigFile(stats.tsConfigPath, {}, {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic(diagnostic) {
            throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
        },
    });
    assert(config && !config.errors.length, 'invalid declaration source config');
    const included = new Set(config.fileNames.map((file) => path.resolve(file)));
    const root = path.resolve(stats.path);
    const realRoot = fs.realpathSync(root) + path.sep;
    const excluded = new Set();
    for (const unit of stats.getFeatureUnits()) {
        const source = path.resolve(stats.getFeatureUnitFile(unit));
        if (included.has(source)) continue;
        const relative = path.relative(root, source);
        assert(
            relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative) &&
                source.endsWith('.ts') && fs.statSync(source).isFile() && fs.realpathSync(source).startsWith(realRoot),
            'excluded feature source outside source root',
        );
        const matching = (excludes) => ts.sys.readDirectory(root, ['.ts'], excludes, [relative])
            .some((file) => path.resolve(file) === source);
        assert(
            matching([]) && !matching(config.raw.exclude || []),
            'unemitted feature must be explicitly excluded by source config',
        );
        excluded.add(path.join(declarationRoot, relative.replace(/\.ts$/, '.d.ts')));
    }
    return excluded;
}

/** The original ccbuild entry defines legacy type reachability, not default JS values.
 * Inspect the narrow runtime entry, then restore the original emitted type graph
 * before bundling. Both sources come from the current source tree and installed
 * generator, never a copied historical SDK or hand-maintained Spark whitelist.
 */
function prepareCompatibleGiftOptions(options, entryFiles, excludedInputs = new Set()) {
    assert(options.entries?.cc, 'missing original declaration entry');
    const originalEntry = normalizeCompatibleEntry(options, fs.readFileSync(options.entries.cc, 'utf8'), excludedInputs);
    let configured, surface;
    try {
        configured = prepareGiftOptions(options, entryFiles);
        surface = collectEntrySurface(configured);
    } finally {
        fs.writeFileSync(options.entries.cc, originalEntry);
    }
    return {
        configured,
        surface: { ...surface, preserveDeclaredTypeExports: true },
        originalEntrySha256: require('node:crypto').createHash('sha256').update(originalEntry).digest('hex'),
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

function normalizeSdkSelfReferences(code) {
    // A relative ESM declaration import must include .js for node16 resolution.
    // TypeScript resolves it to the adjacent .d.ts; an extensionless import can
    // silently become any under the published skipLibCheck caller contract.
    return code.replace(/(["'])cc\1/g, '"./cocosair.module.js"');
}

// tfig's @engineInternal filter used to allocate referenced public symbols in
// __private. Removing that filter exposes real runtime values but must not erase
// their formerly legal qualified type names. Derive names from this invocation's
// source symbols, then retain only names actually present in its original bundle.
function collectPrivateAliasCandidates(options) {
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
    const rootSymbol = entry && checker.getSymbolAtLocation(entry);
    assert(rootSymbol, 'compatibility source graph did not resolve');
    const aliases = new Map();
    const identifier = (text) => '_' + text.replace(/[\/\\-]/g, '_').replace(/['":\.@]/g, '');
    function generatedPrivateName(symbol) {
        const declaration = symbol.declarations?.[0];
        if (!declaration) return null;
        const names = ts.isSourceFile(declaration) ? [] : [identifier(symbol.name)];
        let node = ts.isSourceFile(declaration) ? declaration : declaration.parent;
        for (; node; node = node.parent) {
            if (ts.isSourceFile(node)) {
                names.unshift(
                    identifier(path.relative(options.rootDir, node.fileName).replace(/\.(js|ts|d\.ts)$/, '')),
                );
                break;
            }
            if (ts.isModuleDeclaration(node)) {
                names.unshift(ts.isIdentifier(node.name) ? node.name.text : identifier(node.name.text));
                if (
                    ts.isSourceFile(node.parent) &&
                    !(node.flags & ts.NodeFlags.Namespace) &&
                    ts.isStringLiteral(node.name)
                )
                    break;
            }
        }
        return names.join('_');
    }
    function visit(module, prefix, ancestry) {
        if (ancestry.has(module)) return;
        const next = new Set(ancestry).add(module);
        for (const exported of checker.getExportsOfModule(module)) {
            if (!/^[$A-Z_a-z][$\w]*$/.test(exported.name)) continue;
            const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
            const target = [...prefix, exported.name];
            if (symbol.getJsDocTags().some((tag) => tag.name === options.privateJsDocTag)) {
                const name = generatedPrivateName(symbol);
                if (name) {
                    const prior = aliases.get(name);
                    assert(!prior || prior.symbol === symbol, 'ambiguous private source identity: ' + name);
                    if (!prior || target.length < prior.target.length)
                        aliases.set(name, {
                            symbol,
                            target,
                            source: path
                                .relative(options.rootDir, symbol.declarations[0].getSourceFile().fileName)
                                .split(path.sep)
                                .join('/'),
                        });
                }
            }
            if (symbol.flags & ts.SymbolFlags.Module) visit(symbol, target, next);
        }
    }
    visit(rootSymbol, [], new Set());
    return new Map([...aliases].map(([name, { target, source }]) => [name, { target, source }]));
}

function restorePrivateTypeAliases(currentCode, originalCode, candidates) {
    function privateNames(code) {
        const ast = ts.createSourceFile('cc.d.ts', code, ts.ScriptTarget.Latest, true);
        assert.equal(ast.parseDiagnostics.length, 0, 'bundler compatibility output must parse');
        const module = ast.statements.find((node) => ts.isModuleDeclaration(node) && node.name.text === 'cc');
        assert(module?.body && ts.isModuleBlock(module.body), 'expected original cc declaration module');
        const names = new Set();
        for (const node of module.body.statements) {
            if (
                !ts.isModuleDeclaration(node) ||
                node.name.text !== '__private' ||
                !node.body ||
                !ts.isModuleBlock(node.body)
            )
                continue;
            for (const member of node.body.statements) {
                if (member.name && ts.isIdentifier(member.name)) names.add(member.name.text);
                if (ts.isVariableStatement(member))
                    for (const declaration of member.declarationList.declarations)
                        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
            }
        }
        return names;
    }
    const original = privateNames(originalCode),
        current = privateNames(currentCode),
        retained = [];
    for (const name of [...original].sort()) {
        if (current.has(name)) continue;
        const binding = candidates.get(name);
        assert(binding, 'unresolved moved private declaration: ' + name);
        retained.push({ name, ...binding });
    }
    if (!retained.length) return { code: currentCode, retained };
    assert(!currentCode.includes('__AirDtsCompatibility'), 'reserved declaration compatibility alias collision');
    const bridge =
        '\nimport * as __AirDtsCompatibility from "cc";\nexport namespace __private {\n' +
        retained
            .map(({ name, target }) => `export import ${name} = __AirDtsCompatibility.${target.join('.')};`)
            .join('\n') +
        '\n}\n';
    return { code: currentCode.replace(/\}\s*$/, bridge + '}\n'), retained };
}

function reconcileExports(code, surface) {
    const source = ts.createSourceFile('cocosair.module.d.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    assert.equal(source.parseDiagnostics.length, 0, 'generated declaration syntax must parse');
    const names = new Set(surface.names),
        values = new Set(surface.values);
    if (surface.preserveDeclaredTypeExports === true) {
        // These declarations were public in the original unscoped tfig output.
        // Retain legal type imports and generated namespace dependencies while
        // reconcileExports still forbids every non-runtime value constructor.
        for (const statement of source.statements) {
            if (
                ts.isExportDeclaration(statement) &&
                statement.exportClause &&
                ts.isNamedExports(statement.exportClause)
            ) {
                for (const specifier of statement.exportClause.elements) names.add(specifier.name.text);
            } else if (statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
                if (ts.isVariableStatement(statement)) {
                    for (const declaration of statement.declarationList.declarations) {
                        assert(ts.isIdentifier(declaration.name), 'unexpected legacy declaration binding');
                        names.add(declaration.name.text);
                    }
                } else if (statement.name && ts.isIdentifier(statement.name)) names.add(statement.name.text);
            }
        }
    }
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
        const excludedInputs = excludedFeatureInputs(stats, options.rootDir);
        const { configured, surface, originalEntrySha256 } = prepareCompatibleGiftOptions(options, entryFiles, excludedInputs);
        Object.assign(receipt, {
            features: DEFAULT_FEATURES.slice(),
            units,
            surface,
            compatibilityTypeGraph: {
                source: 'original-current-ccbuild-all-feature-entry',
                originalEntrySha256,
                excludedFeatureEntries: [...excludedInputs].map((file) => path.relative(options.rootDir, file).split(path.sep).join('/')).sort(),
                optionalRuntimeValues: false,
                historicalArtifactCopied: false,
            },
        });
        const candidates = collectPrivateAliasCandidates(options);
        const legacy = original(options);
        const result = original(configured);
        for (const group of result.groups) {
            if (!/^\s*declare module "cc" \{/.test(group.code)) continue;
            const prior = legacy.groups.find((item) => item.path === group.path);
            assert(prior, 'missing original declaration group for compatibility');
            const restored = restorePrivateTypeAliases(group.code, prior.code, candidates);
            group.code = restored.code;
            receipt.compatibilityTypeGraph.retainedPrivateAliases = restored.retained;
        }
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
    normalizeCompatibleEntry,
    excludedFeatureInputs,
    prepareCompatibleGiftOptions,
    collectEntrySurface,
    reconcileExports,
    normalizeSdkSelfReferences,
    collectPrivateAliasCandidates,
    restorePrivateTypeAliases,
    withMainDeclarations,
    isCleanupOnlyError,
    runDeclarationBuild,
};
