const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const {
    collectSurface,
    makeProbes,
    makeStaticProbes,
    compile,
    classifyRemoved,
    runtimeExportNames,
    optionsFor,
    isAnyRegression,
} = require('./upstream-sdk-compatibility.cjs');
function temporary(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-sdk-compatibility-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}
test('type-only classes and namespace aliases remain part of the type contract', (t) => {
    const dir = temporary(t);
    const file = path.join(dir, 'index.d.ts');
    fs.writeFileSync(
        file,
        `declare class Parent { value: number; protected hidden: number; }
        declare class Key<T> extends Parent { item: T; private secret; }
        export type { Key };
        export function find(path: string): Parent | null;
        export namespace utils { export { find }; }
        export namespace nested { export interface Options { enabled: boolean; } }
        export {};`,
    );
    const surface = collectSurface(ts, file);
    const key = surface.find((item) => item.name === 'Key');
    assert.equal(key.type, true);
    assert.equal(key.value, false);
    assert.equal(key.genericCount, 1);
    assert.deepEqual(key.members.sort(), ['item', 'value']);
    assert(surface.some((item) => item.name === 'utils.find' && item.value));
    assert(surface.some((item) => item.name === 'nested.Options' && item.type));
    assert(makeProbes(surface).some((probe) => probe.expression === 'SDK.Key<any>["value"]'));
});
test('unsupported inventory units are not silently waived by coverageRequired=false', () => {
    const old = { coverageRequired: false };
    assert.equal(classifyRemoved('Unknown', old, []), 'UNCLASSIFIED');
    assert.match(classifyRemoved('__private.Thing', old, []), /type-consumption-break/);
    assert.match(classifyRemoved('CocosRenderer', old, []), /type-consumption-break/);
    assert.match(classifyRemoved('AirAssetError.constructor', old, []), /type-preserved/);
    assert.equal(
        classifyRemoved('utils.find', old, [{ name: 'utils.find', value: true }]),
        'inventory-representation-loss-api-retained',
    );
});
test('strict callers catch unresolved inferred types even with skipLibCheck', (t) => {
    const dir = temporary(t);
    const pkg = path.join(dir, 'node_modules/cocosair.js');
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ types: 'index.d.ts' }));
    fs.writeFileSync(path.join(pkg, 'index.d.ts'), 'export function get(): MissingPrivateDependency;');
    const result = compile(
        ts,
        dir,
        'caller.ts',
        `import { get } from 'cocosair.js';
        type IsAny<T> = 0 extends (1 & T) ? true : false;
        type Assert<T extends false> = T;
        type NotAny = Assert<IsAny<ReturnType<typeof get>>>;
        // @ts-expect-error missing internal declarations must not silently widen members
        get().notARealMember;
    `,
        'node',
    );
    assert.equal(result.status, 'FAIL');
    assert(result.diagnostics.some((item) => item.code === 2344));
    assert(result.diagnostics.some((item) => item.code === 2578));
    assert.equal(optionsFor(ts, 'node').skipLibCheck, true);
});
test('runtime export extraction checks actual bundle aliases without SSR import', (t) => {
    const dir = temporary(t);
    const file = path.join(dir, 'runtime.js');
    fs.writeFileSync(file, 'const Actual = 1; export { Actual as Public, Actual };');
    assert.deepEqual(runtimeExportNames(ts, file), ['Actual', 'Public']);
});
test('protected static namespace members are excluded from legal historical probes', (t) => {
    const dir = temporary(t);
    const file = path.join(dir, 'index.d.ts');
    fs.writeFileSync(
        file,
        'export class Pass { protected static hidden(): void; static shown(): void; } export namespace Pass { export type Config = {}; }',
    );
    const surface = collectSurface(ts, file);
    assert(!surface.some((item) => item.name === 'Pass.hidden'));
    assert(!makeProbes(surface).some((item) => item.id.endsWith('.hidden')));
    assert(!makeStaticProbes(surface).some((item) => item.id.endsWith('.hidden')));
    assert(makeStaticProbes(surface).some((item) => item.id === 'static:Pass.shown'));
});
test('probe metadata catches declaration return-any leakage hidden by skipLibCheck', (t) => {
    const dir = temporary(t);
    const pkg = path.join(dir, 'node_modules/cocosair.js');
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ types: 'index.d.ts' }));
    fs.writeFileSync(path.join(pkg, 'index.d.ts'), 'export interface Factory { get(): MissingDependency; }');
    const probes = [{ id: 'member:Factory.get', expression: 'SDK.Factory["get"]' }];
    const result = compile(
        ts,
        dir,
        'caller.ts',
        'import type * as SDK from "cocosair.js";\nexport type Probe0 = SDK.Factory["get"];\n',
        'node',
        probes,
    );
    assert.equal(result.status, 'PASS');
    assert.deepEqual(result.anyTypes, [{ probe: 'member:Factory.get', any: false, anyReturn: 1 }]);
});

test('refining an old unresolved any alias is not mistaken for a new any-return regression', () => {
    assert.equal(isAnyRegression({ any: true, anyReturn: 0 }, { any: false, anyReturn: 1 }), false);
    assert.equal(isAnyRegression(undefined, { any: true, anyReturn: 0 }), true);
    assert.equal(isAnyRegression(undefined, { any: false, anyReturn: 1 }), true);
    assert.equal(isAnyRegression({ any: false, anyReturn: 1 }, { any: false, anyReturn: 1 }), false);
});
