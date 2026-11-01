const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const gift = require('@cocos/tfig');
const { DEFAULT_FEATURES } = require('./default-features.cjs');
const {
    prepareGiftOptions,
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
