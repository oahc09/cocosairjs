/* U06: installed-package contract checks. No source imports and no SDK mutations.
 * Modern compiler is explicit and pinned; absence is NOT_RUN, never modern PASS.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const PINNED_COMPILERS = { legacy: '4.9.5', modern: '5.9.3' };

function loadCompiler(compilerBin, expectedVersion) {
    const packageRoot = path.resolve(path.dirname(compilerBin), '..');
    const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    assert.equal(metadata.name, 'typescript', 'compiler must come from an installed TypeScript package');
    assert.equal(metadata.version, expectedVersion, 'consumer compiler version is not the frozen version');
    return require(path.join(packageRoot, 'lib/typescript.js'));
}

function declaredValueExports(ts, program, specifier, sourceFile) {
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(sourceFile);
    assert(source, 'consumer source missing from TypeScript program');
    const declaration = source.statements.find(
        (statement) => ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === specifier,
    );
    assert(declaration, 'consumer must import ' + specifier);
    const symbol = checker.getSymbolAtLocation(declaration.moduleSpecifier);
    assert(symbol, 'installed module did not resolve: ' + specifier);
    return checker
        .getExportsOfModule(symbol)
        .filter((entry) => {
            // A class can be re-exported for type use only. Its target has Value flags,
            // but `export type { Class }` is not a promise of a runtime constructor.
            if (
                entry.declarations?.some(
                    (declaration) =>
                        ts.isExportSpecifier(declaration) &&
                        (declaration.isTypeOnly || declaration.parent.parent.isTypeOnly),
                )
            )
                return false;
            const resolved = entry.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(entry) : entry;
            return !!(resolved.flags & ts.SymbolFlags.Value);
        })
        .map((entry) => entry.name)
        .sort();
}

function compareExports(declared, runtime) {
    return {
        valueExportCount: runtime.length,
        missingRuntime: declared.filter((name) => !runtime.includes(name)),
        missingDeclaration: runtime.filter((name) => !declared.includes(name)),
    };
}

function assertExportParity(declared, runtime, label) {
    const { missingRuntime, missingDeclaration } = compareExports(declared, runtime);
    assert.deepEqual({ missingRuntime, missingDeclaration }, { missingRuntime: [], missingDeclaration: [] }, label);
    return { valueExportCount: runtime.length, missingRuntime, missingDeclaration };
}

function checkTypes({ root, consumerDir, packageDir, modernTsPath, runtimeExports, mathExports }) {
    const fixture = path.join(consumerDir, 'upstream-sdk-contracts.ts');
    fs.copyFileSync(path.join(root, 'test/fixtures/upstream-sdk/contracts.ts'), fixture);
    const compilers = [
        { kind: 'legacy', bin: path.join(root, 'node_modules/typescript/bin/tsc'), modes: ['node', 'node16'] },
    ];
    if (modernTsPath) compilers.push({ kind: 'modern', bin: modernTsPath, modes: ['node16', 'bundler'] });
    const results = [];
    for (const compiler of compilers) {
        const ts = loadCompiler(compiler.bin, PINNED_COMPILERS[compiler.kind]);
        for (const mode of compiler.modes) {
            const options = {
                strict: true,
                strictNullChecks: true,
                noEmit: true,
                skipLibCheck: true,
                target: ts.ScriptTarget.ES2020,
                module: mode === 'node16' ? ts.ModuleKind.Node16 : ts.ModuleKind.ESNext,
                moduleResolution:
                    mode === 'bundler'
                        ? ts.ModuleResolutionKind.Bundler
                        : mode === 'node16'
                          ? ts.ModuleResolutionKind.Node16
                          : ts.ModuleResolutionKind.NodeJs,
                types: [],
                lib: ['lib.es2020.d.ts', 'lib.dom.d.ts'],
            };
            const program = ts.createProgram([fixture], options);
            const diagnostics = ts.getPreEmitDiagnostics(program);
            assert.equal(
                diagnostics.length,
                0,
                `${compiler.kind}/${mode}: ` +
                    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
                        getCanonicalFileName: (file) => file,
                        getCurrentDirectory: () => consumerDir,
                        getNewLine: () => '\n',
                    }),
            );
            const files = program.getSourceFiles().map((file) => path.resolve(file.fileName));
            const installedDts = files.filter((file) => file.startsWith(path.resolve(packageDir) + path.sep));
            assert(installedDts.length, 'type consumer did not resolve installed declarations');
            const legacyLoaded = installedDts.some((file) => /cocosair(?:\.math)?\.legacy\.d\.ts$/.test(file));
            assert.equal(legacyLoaded, compiler.kind === 'legacy', 'wrong declaration version selected');
            assert(
                files.some((file) => file.endsWith('lib.dom.d.ts')),
                'native DOM declarations not loaded',
            );
            assert(!files.some((file) => file.startsWith(path.join(root, 'src') + path.sep)), 'source-import bypass');
            const main = declaredValueExports(ts, program, 'cocosair', fixture);
            const math = declaredValueExports(ts, program, 'cocosair/math', fixture);
            const mainParity = compareExports(main, runtimeExports);
            const mathParity = compareExports(math, mathExports);
            const parityPassed = [mainParity, mathParity].every(
                (entry) => !entry.missingRuntime.length && !entry.missingDeclaration.length,
            );
            results.push({
                compiler: PINNED_COMPILERS[compiler.kind],
                mode,
                strictNullChecks: true,
                skipLibCheck: true,
                declarations: installedDts.map((file) => path.relative(packageDir, file).split(path.sep).join('/')),
                main: mainParity,
                math: mathParity,
                typeStatus: 'PASS',
                negativeCases: (fs.readFileSync(fixture, 'utf8').match(/@ts-expect-error/g) || []).length,
                status: parityPassed ? 'PASS' : 'FAIL',
            });
        }
    }
    if (results.some((entry) => entry.status !== 'PASS')) {
        const error = new Error('Installed JS/d.ts parity failed; all completed compiler results are attached.');
        error.results = results;
        throw error;
    }
    return { results, modern: modernTsPath ? 'PASS' : 'NOT_RUN (supply --modern-ts=<TypeScript 5.9.3 bin/tsc>)' };
}

function checkMathBoundary(consumerDir) {
    const code = `
import assert from 'node:assert/strict';
const names = ['window', 'document', 'cc', 'CocosEngine'];
const before = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const resolved = import.meta.resolve('cocosair/math');
assert.match(resolved, /node_modules\\/cocosair\\/build\\/npm\\/cocosair\\.math\\.js$/);
const math = await import('cocosair/math');
assert.equal(new math.Vec3(3, 4, 12).length(), 13);
assert.equal(math.clamp01(2), 1);
for (const name of names) assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, name), before[name], name);
for (const name of ['createAirApp', 'Node', 'Scene', 'GLTFLoader']) assert.equal(name in math, false, name);
console.log(JSON.stringify({ status: 'PASS', resolved, exports: Object.keys(math).sort(), globalsUnchanged: names }));
`;
    // A separate Node process is intentional: parent jsdom globals cannot mask a CPU-boundary regression.
    return JSON.parse(
        execFileSync(process.execPath, ['--input-type=module', '-e', code], {
            cwd: consumerDir,
            encoding: 'utf8',
            timeout: 30000,
            stdio: ['ignore', 'pipe', 'pipe'],
        }),
    );
}

async function checkRuntimeLifecycle(mod) {
    for (const name of ['GLTFLoader', 'GLTFAsset', 'GLTFError', 'configureGLTFLoaderDefaults', 'instantiate']) {
        assert.equal(typeof mod[name], 'function', 'public runtime symbol missing: ' + name);
    }
    for (const name of ['GLTFInstance', 'GLTFLoaderOptions', 'AirRequestPolicy']) {
        assert.equal(name in mod, false, 'type-only interface must not become a fabricated runtime symbol: ' + name);
    }
    const loader = new mod.GLTFLoader({
        request: { priority: 'auto', httpCache: 'default', credentials: 'same-origin' },
    });
    const pending = loader.parseAsync(
        JSON.stringify({ asset: { version: '2.0' }, scenes: [{ nodes: [0] }], nodes: [{ name: 'Fixture' }] }),
    );
    assert(pending instanceof Promise, 'parseAsync must return a Promise');
    const asset = await pending;
    assert(asset instanceof mod.GLTFAsset);
    const first = asset.instantiate();
    const second = asset.instantiate();
    assert(first.root instanceof mod.Node);
    assert.notEqual(first.root, second.root);
    assert.notEqual(first.root.children[0], second.root.children[0]);
    first.root.children[0].setPosition(3, 0, 0);
    assert.equal(second.root.children[0].position.x, 0);
    const native = mod.instantiate(second.root.children[0]);
    assert(native instanceof mod.Node);
    assert.notEqual(native, second.root.children[0]);
    assert.equal(native.getChildByName('Missing'), null);
    assert.equal(native.getComponent(mod.MeshRenderer), null);
    const renderer = native.addComponent(mod.MeshRenderer);
    assert.equal(renderer.getMaterialInstance(0), null);
    assert.equal(first.setAnimationLoop(false), undefined);
    assert.equal(first.dispose(), undefined);
    assert.equal(first.dispose(), undefined);
    assert.equal(second.dispose(), undefined);
    assert.equal(native.destroy(), true);
    assert.equal(asset.destroy(), true);
    assert.equal(asset.destroy(), false);
    return {
        status: 'PASS',
        gltfInstances: 2,
        independentNodeState: true,
        nativeInstantiate: true,
        nullableMaterialSlot: true,
        deferredDestruction: 'scheduled, not a GPU release claim',
    };
}
module.exports = {
    PINNED_COMPILERS,
    loadCompiler,
    declaredValueExports,
    assertExportParity,
    checkTypes,
    checkMathBoundary,
    checkRuntimeLifecycle,
};
