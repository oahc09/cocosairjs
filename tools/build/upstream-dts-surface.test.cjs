const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const gift = require('@cocos/tfig');
const { DEFAULT_FEATURES } = require('./default-features.cjs');
const {
    prepareGiftOptions,
    normalizeCompatibleEntry,
    excludedFeatureInputs,
    prepareCompatibleGiftOptions,
    collectEntrySurface,
    reconcileExports,
    normalizeSdkSelfReferences,
    collectPrivateAliasCandidates,
    restorePrivateTypeAliases,
    runDeclarationBuild,
    isCleanupOnlyError,
} = require('./upstream-dts-surface.cjs');
const { declaredValueExports } = require('../verify/upstream-sdk-contracts.cjs');

function generate() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'air-dts-surface-test-'));
    const write = (name, source) => fs.writeFileSync(path.join(directory, name), source);
    write(
        'native.d.ts',
        `
export declare class RuntimeClass { value: number; }
export declare class TypeOnlyClass { value: string; }
export declare namespace TypeOnlyNamespace { class Nested { value: number; } }
/** @engineInternal Already observable in the runtime namespace. */
export declare function internalButExported(value: string): number;
declare class PrivateInstance { readonly parent: RuntimeClass; }
export declare function getNativeInstance(): PrivateInstance | null;
export interface Contract { value: RuntimeClass; }
export {};
`,
    );
    write(
        'main.d.ts',
        `
export { RuntimeClass, internalButExported, getNativeInstance } from './native';
export type { TypeOnlyClass, TypeOnlyNamespace, Contract, RuntimeClass as DualAlias } from './native';
export * from './compat';
`,
    );
    write('compat.d.ts', "export { RuntimeClass as DualAlias } from './native';");
    write('optional.d.ts', 'export declare class OptionalFeature { excluded: true; }');
    write('virtual-cc.d.ts', "export * from './main'; export * from './optional';\n");
    const options = prepareGiftOptions(
        {
            rootDir: directory,
            input: ['native.d.ts', 'main.d.ts', 'compat.d.ts', 'optional.d.ts', 'virtual-cc.d.ts'].map((name) =>
                path.join(directory, name),
            ),
            entries: { cc: path.join(directory, 'virtual-cc.d.ts') },
            name: 'cc',
            rootModule: 'index',
            privateJsDocTag: 'engineInternal',
            priority: [path.join(directory, 'virtual-cc.d.ts')],
            groups: [{ test: /^cc$/, path: path.join(directory, 'cc.d.ts') }],
            nonExportedSymbolDistribution: [{ sourceModule: /.*/, targetModule: 'cc' }],
        },
        [path.join(directory, 'main.d.ts')],
    );
    const surface = collectEntrySurface(options);
    const ambient = gift.bundle(options).groups[0].code;
    const external = ambient
        .replace(/^\s*declare module "cc" \{\s*/, '')
        .replace(/\}\s*$/, '')
        .replace(/(["'])cc\1/g, '"./sdk"');
    const code = reconcileExports(external, surface);
    write('sdk.d.ts', code);
    return { directory, code, surface, close: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

test('JS and DTS consume one immutable default feature list without optional Spark', () => {
    assert(Object.isFrozen(DEFAULT_FEATURES));
    assert(DEFAULT_FEATURES.includes('air'));
    assert(DEFAULT_FEATURES.includes('gfx-webgl2'));
    assert.equal(
        DEFAULT_FEATURES.some((name) => name.includes('spark')),
        false,
    );
    assert.equal(new Set(DEFAULT_FEATURES).size, DEFAULT_FEATURES.length);
    const builder = fs.readFileSync(path.join(__dirname, 'build.cjs'), 'utf8');
    assert.match(builder, /require\('\.\/default-features\.cjs'\)\.DEFAULT_FEATURES\.slice\(\)/);
});

test('generated declarations keep runtime exports, type-only classes/namespaces, and private reference types distinct', () => {
    const fixture = generate();
    try {
        assert.deepEqual(fixture.surface.values, [
            'DualAlias',
            'RuntimeClass',
            'getNativeInstance',
            'internalButExported',
        ]);
        assert.equal(fixture.surface.names.includes('OptionalFeature'), false);
        const consumer = path.join(fixture.directory, 'consumer.ts');
        fs.writeFileSync(
            consumer,
            `
import { RuntimeClass, internalButExported, getNativeInstance, TypeOnlyClass, TypeOnlyNamespace, DualAlias } from './sdk';
const runtime = new RuntimeClass();
const dualAlias: RuntimeClass = new DualAlias();
const number: number = internalButExported('value');
const native = getNativeInstance();
if (native) { const parent: RuntimeClass = native.parent; void parent; }
declare const typeOnly: TypeOnlyClass;
declare const nested: TypeOnlyNamespace.Nested;
// @ts-expect-error type-only class is not a runtime constructor
new TypeOnlyClass();
// @ts-expect-error type-only namespace is not a runtime object
new TypeOnlyNamespace.Nested();
// @ts-expect-error internal helper namespace is not a public runtime export
import { __private } from './sdk';
// @ts-expect-error unselected optional feature is not an SDK export
import { OptionalFeature } from './sdk';
// @ts-expect-error the native instance is nullable
const parent: RuntimeClass = native.parent;
void [runtime, number, typeOnly, nested];
`,
        );
        const program = ts.createProgram([consumer], {
            strict: true,
            noEmit: true,
            skipLibCheck: false,
            target: ts.ScriptTarget.ES2020,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
            types: [],
        });
        const errors = ts.getPreEmitDiagnostics(program);
        assert.equal(
            errors.length,
            0,
            ts.formatDiagnosticsWithColorAndContext(errors, {
                getCanonicalFileName: (file) => file,
                getCurrentDirectory: () => fixture.directory,
                getNewLine: () => '\n',
            }),
        );
        assert.deepEqual(declaredValueExports(ts, program, './sdk', consumer), fixture.surface.values);
        assert.match(fixture.code, /declare namespace __private/);
        assert(!fixture.code.includes(fixture.directory));
    } finally {
        fixture.close();
    }
});

test('declaration normalization is byte-identical in separate clean directories', () => {
    const first = generate(),
        second = generate();
    try {
        assert.equal(first.code, second.code);
        assert.deepEqual(first.surface, second.surface);
    } finally {
        first.close();
        second.close();
    }
});

function compatibleEntryFixture(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'air-dts-portable-entry-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const entry = path.join(directory, 'virtual-cc.d.ts');
    const main = path.join(directory, 'main.d.ts');
    const optional = path.join(directory, 'optional.d.ts');
    fs.writeFileSync(main, 'export declare class Main { value: number; }');
    fs.writeFileSync(optional, 'export declare class Optional { value: string; }');
    fs.writeFileSync(
        entry,
        `// Auto-generated\nexport * from ${JSON.stringify(main.slice(0, -5))};\nimport * as optional from ${JSON.stringify(optional.slice(0, -5))};\nexport { optional };\n`,
    );
    const options = {
        rootDir: directory,
        input: [main, optional, entry],
        entries: { cc: entry },
        name: 'cc',
        rootModule: 'index',
        privateJsDocTag: 'engineInternal',
        priority: [entry],
        groups: [{ test: /^cc$/, path: path.join(directory, 'cc.d.ts') }],
        nonExportedSymbolDistribution: [{ sourceModule: /.*/, targetModule: 'cc' }],
    };
    return { directory, entry, main, optional, options };
}

test('all-feature entry, actual bundles and receipt are byte-identical across input roots', (t) => {
    const results = [compatibleEntryFixture(t), compatibleEntryFixture(t)].map((fixture) => {
        const { configured, surface, originalEntrySha256 } = prepareCompatibleGiftOptions(fixture.options, [fixture.main]);
        const entry = fs.readFileSync(fixture.entry, 'utf8');
        assert(!entry.includes(fixture.directory));
        assert.match(entry, /export \* from "\.\/main"/);
        assert.match(entry, /import \* as optional from "\.\/optional"/);
        assert.equal(normalizeCompatibleEntry(fixture.options, entry), entry, 'normalization is idempotent');
        assert.equal(originalEntrySha256, crypto.createHash('sha256').update(entry).digest('hex'));
        const legacy = gift.bundle(fixture.options).groups[0].code;
        const current = gift.bundle(configured).groups[0].code;
        assert.match(legacy, /class Optional/);
        assert.match(current, /class Optional/);
        assert.deepEqual(surface.values, ['Main']);
        return { entry, legacy, current, receipt: { surface, originalEntrySha256 } };
    });
    assert.deepEqual(results[0], results[1]);
});

function loadCommonJsWithOverrides(file, overrides) {
    const module = { exports: {} };
    const actualRequire = createRequire(file);
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
        module,
        exports: module.exports,
        require: (name) => overrides[name] || actualRequire(name),
        __dirname: path.dirname(file),
        __filename: file,
    }, { filename: file });
    return module.exports;
}

// Execute the installed generator's actual path utilities and virtual-entry
// expressions under path.win32. This is a path/filesystem simulation, not a
// native Windows declaration build or a Windows filesystem acceptance result.
function windowsEntryFixture(root) {
    const packageRoot = path.resolve(path.dirname(require.resolve('@cocos/ccbuild')), '../..');
    const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package-lock.json'), 'utf8'));
    assert.equal(metadata.version, lock.packages['node_modules/@cocos/ccbuild'].version);
    const windowsPath = loadCommonJsWithOverrides(path.join(packageRoot, 'modules/utils/lib/path.js'), { path: path.win32 });
    const generatorPath = path.join(packageRoot, 'modules/dts-bundler/lib/index.js');
    const generator = ts.createSourceFile(generatorPath, fs.readFileSync(generatorPath, 'utf8'), ts.ScriptTarget.Latest, true);
    const modulePath = [];
    const virtualEntry = [];
    function find(node) {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
            if (node.name.text === 'getModuleNameInTsOutFile') modulePath.push(node.initializer.getText(generator));
            if (node.name.text === 'code' && node.initializer.getText(generator).includes('evaluateIndexModuleSource'))
                virtualEntry.push(node.initializer.getText(generator));
        }
        ts.forEachChild(node, find);
    }
    find(generator);
    assert.equal(modulePath.length, 1, 'expected one installed declaration module-path generator');
    assert.equal(virtualEntry.length, 1, 'expected one installed virtual-entry generator');
    const sourceRoot = path.win32.dirname(root);
    const statsQuery = {
        path: sourceRoot,
        _index: { modules: {} },
        getFeatureUnitFile: (unit) => path.win32.join(sourceRoot, 'exports', unit + '.ts'),
        evaluateIndexModuleSource: require('@cocos/ccbuild').StatsQuery.prototype.evaluateIndexModuleSource,
    };
    const source = vm.runInNewContext(`const getModuleNameInTsOutFile = ${modulePath[0]};\n${virtualEntry[0]}`, {
        utils_1: { ps: windowsPath },
        statsQuery,
        featureUnits: ['main'],
        unbundledOutDirNormalized: windowsPath.resolve(root),
    });
    assert(!source.includes('\\'), 'installed ccbuild must publish forward-slash Windows module paths');
    const entry = path.win32.join(root, 'virtual-cc.d.ts');
    const main = path.win32.join(root, 'exports/main.d.ts');
    const files = new Map();
    const key = (file) => path.win32.resolve(file).toLowerCase();
    const add = (file, directory = false, real = file) => files.set(key(file), { directory, real });
    add(root, true);
    add(path.win32.join(root, 'exports'), true);
    add(entry);
    add(main);
    const get = (file) => {
        const result = files.get(key(file));
        if (!result) throw Object.assign(new Error('Missing Windows fixture path: ' + file), { code: 'ENOENT' });
        return result;
    };
    const filesystem = {
        realpathSync: (file) => get(file).real,
        existsSync: (file) => files.has(key(file)),
        statSync: (file) => ({ isFile: () => !get(file).directory }),
    };
    const normalizer = loadCommonJsWithOverrides(path.join(__dirname, 'upstream-dts-surface.cjs'), {
        'node:path': path.win32,
        'node:fs': filesystem,
    }).normalizeCompatibleEntry;
    const options = { rootDir: root, entries: { cc: entry }, input: [entry, main] };
    return { source, options, normalize: (text = source) => normalizer(options, text), add };
}

test('installed ccbuild Windows paths with drive letters and spaces normalize identically (win32 simulation)', () => {
    const roots = [
        'C:\\Work Spaces\\Cocos AIR\\src\\__dts_before_bundle',
        'D:\\Other Work Spaces\\Cocos AIR\\src\\__dts_before_bundle',
    ];
    const fixtures = roots.map(windowsEntryFixture);
    for (const [index, fixture] of fixtures.entries()) {
        assert(fixture.source.includes(roots[index].replace(/\\/g, '/')));
        assert.equal(fixture.normalize(), '// Auto-generated\nexport * from "./exports/main";\n');
    }
    assert.equal(fixtures[0].normalize(), fixtures[1].normalize());
    assert.equal(
        crypto.createHash('sha256').update(fixtures[0].normalize()).digest('hex'),
        crypto.createHash('sha256').update(fixtures[1].normalize()).digest('hex'),
    );
});

test('Windows declaration paths reject cross-drive, parent, prefix and realpath escapes (win32 simulation)', () => {
    const root = 'C:\\Work Spaces\\Cocos AIR\\src\\__dts_before_bundle';
    const fixture = windowsEntryFixture(root);
    const portable = root.replace(/\\/g, '/');
    const requests = [
        ['D:/Other/exports/main', /outside input root/],
        [portable + '-outside/exports/main', /outside input root/],
        ['../outside', /outside input root/],
        ['./exports/../../outside', /outside input root/],
        ['/rooted-without-drive/main', /outside input root/],
        ['//other-server/share/main', /outside input root/],
        ['C:exports/main', /unsupported declaration module path/],
        [root + '\\exports\\main', /unsupported declaration module path/],
        [portable + '/exports/missing', /unknown declaration module input/],
    ];
    for (const [request, error] of requests)
        assert.throws(() => fixture.normalize(`export * from ${JSON.stringify(request)};`), error, request);
    const alias = path.win32.join(root, 'exports/alias.d.ts');
    fixture.add(alias, false, 'D:\\Outside\\alias.d.ts');
    fixture.options.input.push(alias);
    assert.throws(() => fixture.normalize('export * from "./exports/alias";'), /outside real input root/);
});

test('all-feature graph changes alter the bound entry and actual bundle, not the default runtime surface', (t) => {
    const fixture = compatibleEntryFixture(t);
    const before = prepareCompatibleGiftOptions(fixture.options, [fixture.main]);
    const originalEntry = fs.readFileSync(fixture.entry, 'utf8');
    const originalBundle = gift.bundle(before.configured).groups[0].code;
    const additional = path.join(fixture.directory, 'additional.d.ts');
    fs.writeFileSync(additional, 'export declare class AdditionalFeature { changed: true; }');
    fixture.options.input.push(additional);
    fs.appendFileSync(fixture.entry, `export * from ${JSON.stringify(additional.slice(0, -5))};\n`);
    const after = prepareCompatibleGiftOptions(fixture.options, [fixture.main]);
    const changedEntry = fs.readFileSync(fixture.entry, 'utf8');
    const changedBundle = gift.bundle(after.configured).groups[0].code;
    assert.notEqual(originalEntry, changedEntry);
    assert.notEqual(before.originalEntrySha256, after.originalEntrySha256);
    assert.notEqual(originalBundle, changedBundle);
    assert.match(changedBundle, /class AdditionalFeature/);
    assert.deepEqual(before.surface, after.surface);
    assert.equal(after.originalEntrySha256, crypto.createHash('sha256').update(changedEntry).digest('hex'));
});

test('entry normalization rejects unknown, malformed and out-of-scope module paths without rewriting input', (t) => {
    const fixture = compatibleEntryFixture(t);
    const unlisted = path.join(fixture.directory, 'unlisted.d.ts');
    fs.writeFileSync(unlisted, 'export declare class Unlisted {}');
    const outside = fs.mkdtempSync(fixture.directory + '-outside-');
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    const escaped = path.join(outside, 'escaped.d.ts');
    fs.writeFileSync(escaped, 'export declare class Escaped {}');
    fixture.options.input.push(escaped);
    const original = fs.readFileSync(fixture.entry, 'utf8');
    const cases = [
        ['missing', './missing', /unknown declaration module/],
        ['unlisted existing file', './unlisted', /unknown declaration module/],
        ['absolute sibling prefix', escaped, /outside input root/],
        ['relative escape', path.relative(fixture.directory, escaped).split(path.sep).join('/'), /outside input root/],
        ['bare dependency', 'typescript', /unsupported declaration module path/],
        ['URL', 'file:///untrusted.d.ts', /unsupported declaration module path/],
        ['backslash', '.\\main', /unsupported declaration module path/],
        ['control character', './main\u0000', /unsupported declaration module path/],
    ];
    for (const [label, request, error] of cases) {
        assert.throws(
            () => normalizeCompatibleEntry(fixture.options, `export * from ${JSON.stringify(request)};`),
            error,
            label,
        );
        assert.equal(fs.readFileSync(fixture.entry, 'utf8'), original);
    }
    assert.throws(() => normalizeCompatibleEntry(fixture.options, 'export * from ;'), /must parse/);
    assert.throws(() => normalizeCompatibleEntry(fixture.options, 'export {};'), /no module inputs/);
    assert.throws(
        () => normalizeCompatibleEntry(fixture.options, 'import dependency = require("./main");'),
        /unsupported original declaration entry statement/,
    );
    const missingKnown = path.join(fixture.directory, 'known-but-missing.d.ts');
    fixture.options.input.push(missingKnown);
    assert.throws(
        () => normalizeCompatibleEntry(fixture.options, 'export * from "./known-but-missing";'),
        /unknown declaration module input/,
    );
    const linkedDirectory = path.join(fixture.directory, 'linked');
    fs.symlinkSync(outside, linkedDirectory, process.platform === 'win32' ? 'junction' : 'dir');
    const linked = path.join(linkedDirectory, 'escaped.d.ts');
    fixture.options.input.push(linked);
    assert.throws(
        () => normalizeCompatibleEntry(fixture.options, 'export * from "./linked/escaped";'),
        /outside real input root/,
    );
    const externalEntry = { ...fixture.options, entries: { cc: escaped } };
    assert.throws(() => normalizeCompatibleEntry(externalEntry, original), /entry outside input root/);
    const rejected = 'export * from "./known-but-missing";\n';
    fs.writeFileSync(fixture.entry, rejected);
    assert.throws(() => prepareCompatibleGiftOptions(fixture.options, [fixture.main]), /unknown declaration module input/);
    assert.equal(fs.readFileSync(fixture.entry, 'utf8'), rejected, 'failed validation must not replace the input');
});

test('only current-config excluded feature roots may retain unresolved imports', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'air-dts-excluded-feature-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const source = path.join(directory, 'source');
    const emitted = path.join(directory, 'emitted');
    fs.mkdirSync(source);
    fs.mkdirSync(emitted);
    for (const name of ['main', 'optional'])
        fs.writeFileSync(path.join(source, name + '.ts'), `export class ${name} {}`);
    fs.writeFileSync(path.join(emitted, 'main.d.ts'), 'export declare class Main {}');
    const configFile = path.join(source, 'tsconfig.json');
    const config = { include: ['*.ts'], exclude: ['optional.ts'] };
    const writeConfig = () => fs.writeFileSync(configFile, JSON.stringify(config));
    writeConfig();
    const stats = {
        path: source,
        tsConfigPath: configFile,
        getFeatureUnits: () => ['main', 'optional'],
        getFeatureUnitFile: (unit) => path.join(source, unit + '.ts'),
    };
    const exclusions = excludedFeatureInputs(stats, emitted);
    assert.deepEqual([...exclusions], [path.join(emitted, 'optional.d.ts')]);
    const entry = path.join(emitted, 'virtual-cc.d.ts');
    const original = ['main', 'optional'].map((name) => `export * from ${JSON.stringify(path.join(emitted, name))};`).join('\n');
    fs.writeFileSync(entry, original);
    const options = { rootDir: emitted, entries: { cc: entry }, input: [entry, path.join(emitted, 'main.d.ts')] };
    assert.throws(() => normalizeCompatibleEntry(options, original), /unknown declaration module input/);
    assert.equal(
        normalizeCompatibleEntry(options, original, exclusions),
        'export * from "./main";\nexport * from "./optional";',
    );
    config.exclude = [];
    writeConfig();
    assert.equal(excludedFeatureInputs(stats, emitted).size, 0, 'enabling the feature removes the absence exemption');
    assert.throws(
        () => normalizeCompatibleEntry(options, original, excludedFeatureInputs(stats, emitted)),
        /unknown declaration module input/,
    );
    config.include = ['main.ts'];
    writeConfig();
    assert.throws(() => excludedFeatureInputs(stats, emitted), /must be explicitly excluded/);
});

test('unexpected emitter shape and missing selected entry fail closed', () => {
    assert.throws(() => prepareGiftOptions({}, []), /unexpected ccbuild/);
    assert.throws(
        () => prepareGiftOptions({ rootDir: os.tmpdir(), entries: { cc: 'unused' } }, ['missing-file.d.ts']),
        /missing emitted main entry/,
    );
    assert.throws(() => reconcileExports('export class {', { names: [], values: [] }), /syntax must parse/);
});

test('existing output never recovers a semantic/false generator failure; only verified cleanup may recover', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'air-dts-failure-test-'));
    try {
        const outDir = path.join(directory, 'output'),
            temporaryDir = path.join(directory, 'temporary');
        fs.mkdirSync(outDir);
        fs.writeFileSync(path.join(outDir, 'cc.d.ts'), 'declare module "cc" { export class Existing {} }');
        const receipt = {
            bundleCalls: 1,
            phase: 'bundle-complete',
            surface: { names: ['Existing'], values: ['Existing'] },
        };
        const context = { receipt, temporaryDir, outDir };
        await assert.rejects(
            runDeclarationBuild(async () => {
                throw new Error('synthetic semantic failure');
            }, context),
            /semantic failure/,
        );
        await assert.rejects(
            runDeclarationBuild(async () => false, context),
            /did not succeed/,
        );
        const cleanupError = Object.assign(new Error('cleanup denied'), {
            code: 'EACCES',
            syscall: 'rmdir',
            path: temporaryDir,
        });
        assert.equal(isCleanupOnlyError(cleanupError, context), true);
        assert.equal(
            (
                await runDeclarationBuild(async () => {
                    throw cleanupError;
                }, context)
            ).recoveredCleanup,
            true,
        );
        assert.equal(isCleanupOnlyError({ ...cleanupError, path: outDir }, context), false);
        assert.equal(
            isCleanupOnlyError(cleanupError, { ...context, receipt: { ...receipt, phase: 'bundling' } }),
            false,
        );
        assert.equal(isCleanupOnlyError(cleanupError, { ...context, receipt: { ...receipt, bundleCalls: 2 } }), false);
        const { spawnSync } = require('node:child_process');
        const child = spawnSync(
            process.execPath,
            [
                '-e',
                `
            const { runDeclarationBuild } = require(process.argv[1]);
            const context = JSON.parse(process.argv[2]);
            runDeclarationBuild(async () => { throw new Error('semantic failure with output present'); }, context)
                .catch(() => { process.exitCode = 1; });
        `,
                path.join(__dirname, 'upstream-dts-surface.cjs'),
                JSON.stringify(context),
            ],
            { encoding: 'utf8' },
        );
        assert.equal(child.status, 1, 'semantic failure must remain a failed process even if output already exists');
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('legacy optional root types and generated private return dependencies remain legal types, never phantom values', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'air-dts-compatibility-test-'));
    try {
        const runtimeEntry = path.join(directory, 'main.d.ts');
        const optional = path.join(directory, 'optional.d.ts');
        const entry = path.join(directory, 'virtual-cc.d.ts');
        fs.writeFileSync(runtimeEntry, 'export declare class Actual { value: number; }');
        fs.writeFileSync(optional, 'export declare class OptionalSpark { width: number; }');
        const original = 'export * from "./main"; export * from "./optional";';
        fs.writeFileSync(entry, original);
        const { surface, configured } = prepareCompatibleGiftOptions(
            { rootDir: directory, entries: { cc: entry }, input: [runtimeEntry, optional, entry] },
            [runtimeEntry],
        );
        assert.equal(fs.readFileSync(entry, 'utf8'), original);
        assert.equal(configured.entries.cc, entry);
        assert.deepEqual(surface.values, ['Actual']);
        assert.equal(surface.names.includes('OptionalSpark'), false);
        const emitted = `export class Actual { value: number; }
export class OptionalSpark { width: number; }
export namespace sparkMath { class Matrix { readonly elements: number[]; } }
export namespace __private { class Returned { readonly owner: Actual; readonly count: number; } }
export function getReturned(): __private.Returned | null;`;
        const sdk = reconcileExports(emitted, {
            ...surface,
            values: [...surface.values, 'getReturned'],
            names: [...surface.names, 'getReturned'],
        });
        fs.writeFileSync(path.join(directory, 'sdk.d.ts'), sdk);
        const consumer = path.join(directory, 'consumer.ts');
        fs.writeFileSync(
            consumer,
            `import { Actual, getReturned } from './sdk';
import type { OptionalSpark, sparkMath, __private } from './sdk';
declare const optional: OptionalSpark;
const width: number = optional.width;
declare const matrix: sparkMath.Matrix;
const elements: number[] = matrix.elements;
const result = getReturned();
if (result) { const owner: Actual = result.owner; const count: number = result.count; const explicit: __private.Returned = result;
// @ts-expect-error typed private return must not degrade to any
const wrong: string = result.count;
// @ts-expect-error nonexistent member must stay rejected
result.missing;
void [owner, count, explicit, wrong]; }
// @ts-expect-error optional runtime does not exist in default SDK
new OptionalSpark();
// @ts-expect-error optional namespace is not a default runtime object
new sparkMath.Matrix();
void [width, elements];`,
        );
        const program = ts.createProgram([consumer], {
            strict: true,
            skipLibCheck: false,
            noEmit: true,
            types: [],
            target: ts.ScriptTarget.ES2020,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
        });
        const diagnostics = ts.getPreEmitDiagnostics(program);
        assert.deepEqual(
            diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
            [],
        );
        assert.deepEqual(declaredValueExports(ts, program, './sdk', consumer), ['Actual', 'getReturned']);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('node16 self-references retain exact function types under the published skipLibCheck contract', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'air-dts-node16-self-'));
    try {
        fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ type: 'module' }));
        const input = `export function isCCClassOrFastDefined(ctor: Function): boolean;
import { isCCClassOrFastDefined as alias } from "cc";
export namespace CCClass { export { alias as isCCClassOrFastDefined }; }`;
        const fixed = normalizeSdkSelfReferences(input);
        assert.match(fixed, /from "\.\/cocosair\.module\.js"/);
        const sdk = path.join(directory, 'cocosair.module.d.ts');
        const consumer = path.join(directory, 'consumer.ts');
        fs.writeFileSync(
            consumer,
            `import { CCClass } from './cocosair.module.js';
type IsAny<T> = 0 extends (1 & T) ? true : false;
const precise: IsAny<typeof CCClass.isCCClassOrFastDefined> = false;
const result: boolean = CCClass.isCCClassOrFastDefined(class Actual {});
// @ts-expect-error a numeric input must remain rejected
CCClass.isCCClassOrFastDefined(42);
// @ts-expect-error return must not silently become any
const invalid: string = CCClass.isCCClassOrFastDefined(class Actual {});
void [precise, result, invalid];`,
        );
        const options = {
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            types: [],
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.Node16,
            moduleResolution: ts.ModuleResolutionKind.Node16,
        };
        fs.writeFileSync(sdk, fixed.replace('cocosair.module.js', 'cocosair.module'));
        const before = ts.getPreEmitDiagnostics(ts.createProgram([consumer], options));
        assert(
            before.some((d) => d.code === 2322),
            'negative control must expose any',
        );
        assert(
            before.some((d) => d.code === 2578),
            'negative controls must become unused for any',
        );
        fs.writeFileSync(sdk, fixed);
        const after = ts.getPreEmitDiagnostics(ts.createProgram([consumer], options));
        assert.deepEqual(
            after.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
            [],
        );
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('moved engineInternal types retain source-qualified aliases and nominal identity without historical declarations', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'air-dts-private-alias-'));
    try {
        for (const name of ['left', 'right'])
            fs.writeFileSync(
                path.join(directory, name + '.d.ts'),
                `/** @engineInternal */\nexport declare class Internal<T> { protected brand: void; readonly origin: "${name}"; value: T; }\nexport declare function get(): Internal<string>;`,
            );
        const entry = path.join(directory, 'virtual-cc.d.ts');
        fs.writeFileSync(entry, `export * as left from './left'; export * as right from './right';`);
        const options = {
            rootDir: directory,
            input: ['left.d.ts', 'right.d.ts', 'virtual-cc.d.ts'].map((name) => path.join(directory, name)),
            entries: { cc: entry },
            name: 'cc',
            rootModule: 'index',
            priority: [entry],
            privateJsDocTag: 'engineInternal',
            groups: [{ test: /^cc$/, path: path.join(directory, 'cc.d.ts') }],
            nonExportedSymbolDistribution: [{ sourceModule: /.*/, targetModule: 'cc' }],
        };
        const original = gift.bundle(options).groups[0].code;
        const current = gift.bundle({ ...options, privateJsDocTag: undefined }).groups[0].code;
        const restored = restorePrivateTypeAliases(current, original, collectPrivateAliasCandidates(options));
        assert.deepEqual(
            restored.retained.map(({ name, target }) => [name, target]),
            [
                ['_left__Internal', ['left', 'Internal']],
                ['_right__Internal', ['right', 'Internal']],
            ],
        );
        const code = normalizeSdkSelfReferences(
            restored.code.replace(/^\s*declare module "cc" \{\s*/, '').replace(/\}\s*$/, ''),
        );
        const sdk = reconcileExports(code, {
            names: ['left', 'right'],
            values: ['left', 'right'],
            preserveDeclaredTypeExports: true,
        });
        fs.writeFileSync(path.join(directory, 'cocosair.module.d.ts'), sdk);
        fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}');
        const caller = path.join(directory, 'caller.ts');
        fs.writeFileSync(
            caller,
            `import { left, right } from './cocosair.module.js'; import type { __private } from './cocosair.module.js';
const a: __private._left__Internal<string> = left.get();
const b: left.Internal<string> = a;
// @ts-expect-error different source classes must keep distinct nominal identity
const wrong: __private._left__Internal<string> = right.get();
// @ts-expect-error private compatibility types do not create a runtime namespace
new __private._left__Internal();
void [a,b,wrong];`,
        );
        const program = ts.createProgram([caller], {
            strict: true,
            skipLibCheck: false,
            noEmit: true,
            types: [],
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.Node16,
            moduleResolution: ts.ModuleResolutionKind.Node16,
        });
        assert.deepEqual(
            ts.getPreEmitDiagnostics(program).map((d) => ({
                message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
                line: d.file && d.file.getLineAndCharacterOfPosition(d.start).line + 1,
            })),
            [],
        );
        assert.deepEqual(declaredValueExports(ts, program, './cocosair.module.js', caller), ['left', 'right']);
        assert.throws(() => restorePrivateTypeAliases(current, original, new Map()), /unresolved moved private/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
