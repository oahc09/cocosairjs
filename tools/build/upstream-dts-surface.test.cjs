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
    collectEntrySurface,
    reconcileExports,
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
