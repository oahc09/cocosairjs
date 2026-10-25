const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');
const { createRequire } = require('node:module');
const { palDeclarations, withSymbolDeclarations, stageSymbolDeclarations } = require('./dts-symbols.cjs');
const engine = path.resolve(__dirname, '../../src');
const ccRequire = createRequire(require.resolve('@cocos/ccbuild'));
const compiler = ccRequire('typescript');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'air-dts-symbols-'));
const originalRead = compiler.sys.readFile;
const originalExists = compiler.sys.fileExists;
function write(relative, text) {
    const file = path.join(directory, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return file;
}
(async () => {
    const virtual = palDeclarations(engine);
    assert.equal(virtual.size, 11);
    await withSymbolDeclarations(engine, async () => {
        const file = path.join(engine, 'pal/system-info/enum-type/feature.d.ts');
        assert(compiler.sys.fileExists(file));
        assert.match(compiler.sys.readFile(file), /enum Feature/);
        assert.equal(fs.existsSync(file), false);
    });
    await assert.rejects(
        withSymbolDeclarations(engine, async () => {
            throw new Error('intentional failure');
        }),
        /intentional failure/,
    );
    assert.equal(compiler.sys.readFile, originalRead);
    assert.equal(compiler.sys.fileExists, originalExists);
    const source = write(
        'cocos/dragon-bones/ArmatureDisplay.d.ts',
        'export declare class Display { nodes: Map<string, number>; }',
    );
    write('cocos/dragon-bones/ArmatureCache.d.ts', 'export interface Frame { values: SafeArray<number>; }');
    write(
        'air/spark/cocos-renderer.d.ts',
        'import { nativeEngine } from "./engine"; export declare class Renderer { constructor(engine: typeof nativeEngine); } export declare class OverloadedRenderer { constructor(engine: typeof nativeEngine); constructor(engine: { custom: true }, extra: number); }',
    );
    write(
        'index.d.ts',
        'export declare class Scene {} export type OnlyType = string; export declare const version: \"1\"; export declare const options: { enabled: boolean }; export declare function action(value: number): number; export declare function action(value: string): string; export declare namespace Graphics { class Device { active: boolean; } function create(): Device; }',
    );
    const options = stageSymbolDeclarations({ rootDir: directory, input: [source] }, engine, virtual);
    assert(options.input.some((file) => file.endsWith('spark-runtime.d.ts')));
    assert.match(fs.readFileSync(source, 'utf8'), /globalThis.Map<string, number>/);
    assert.match(
        fs.readFileSync(path.join(directory, 'cocos/dragon-bones/ArmatureCache.d.ts'), 'utf8'),
        /Array<number \| undefined>/,
    );
    const gift = ccRequire('@cocos/tfig');
    write(
        'entry.d.ts',
        'export { Scene } from "./index"; export { Renderer, OverloadedRenderer } from "./air/spark/cocos-renderer"; export declare const optionalFeature: number;',
    );
    const bundled = gift.bundle({
        ...options,
        input: [...options.input, path.join(directory, 'entry.d.ts')],
        entries: { cc: path.join(directory, 'entry.d.ts') },
        output: path.join(directory, 'cc.d.ts'),
    });
    const bundle = write('cc.d.ts', bundled.groups[0].code);
    const ctorFixture = write(
        'ctor.ts',
        `
import { Scene, Renderer, OverloadedRenderer } from 'cc';
import * as sourceEngine from './index';
const nativeEngine = sourceEngine;
type EngineArgument = ConstructorParameters<typeof Renderer>[0];
type IsAny<T> = 0 extends (1 & T) ? true : false;
const engineIsNotAny: IsAny<EngineArgument> = false;
const memberIsNotAny: IsAny<EngineArgument['Scene']> = false;
declare const engineArgument: EngineArgument;
const toOriginal: typeof sourceEngine = engineArgument;
const fromOriginal: EngineArgument = sourceEngine;
new Renderer(nativeEngine);
new OverloadedRenderer(nativeEngine);
new OverloadedRenderer({ custom: true }, 1);
// @ts-expect-error wrong second overload value
new OverloadedRenderer({ custom: false }, 1);
// @ts-expect-error private function overload remains typed
engineArgument.action(true);
const actionNumber: number = engineArgument.action(1);
const actionString: string = engineArgument.action('x');
const namespaceMember: boolean = engineArgument.Graphics.create().active;
// @ts-expect-error private namespace member remains typed
const badNamespaceMember: string = engineArgument.Graphics.create().active;
// @ts-expect-error original nativeEngine requires Scene
new Renderer({});
// @ts-expect-error original nativeEngine requires correct Scene constructor
new Renderer({ Scene: 123 });
`,
    );
    const ctorProgram = ts.createProgram([bundle, ctorFixture], {
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        types: [],
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        target: ts.ScriptTarget.ES2020,
    });
    assert.deepEqual(
        ts.getPreEmitDiagnostics(ctorProgram).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
        [],
    );
    const fixture = write(
        'consumer.ts',
        `
import { Feature } from './pal/system-info/enum-type';
import { PalScreenEvent } from './pal/screen-adapter/enum-type';
import { Display } from './cocos/dragon-bones/ArmatureDisplay';
import { Frame } from './cocos/dragon-bones/ArmatureCache';
let event: PalScreenEvent = 'window-resize';
let feature: Feature = Feature.WEBP;
// @ts-expect-error invalid event string must not become any
 event = 'not-a-screen-event';
// @ts-expect-error invalid feature string must not become any
 feature = 'not-a-feature';
declare const frame: Frame;
const value: number | undefined = frame.values[0];
// @ts-expect-error safe array must retain undefined
const unsafe: number = frame.values[0];
declare const display: Display;
display.nodes.set('node', 1);
// @ts-expect-error preserve ES Map value type
 display.nodes.set('node', 'bad');
`,
    );
    const program = ts.createProgram([fixture], {
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        types: [],
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        target: ts.ScriptTarget.ES2020,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.deepEqual(
        diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
        [],
    );
    console.log(
        'PASS: frozen PAL source/runtime parity, virtual host restoration on success/failure, Spark closure, SafeArray undefined, global Map, PAL positive/negative types.',
    );
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
