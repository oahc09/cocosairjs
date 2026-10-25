const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const gift = createRequire(require.resolve('@cocos/ccbuild'))('@cocos/tfig');
const { relocateDeclarationInputs, withDeclarationInputs } = require('./dts-inputs.cjs');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'air-dts-inputs-'));
const engine = path.join(directory, 'src');
const emitted = path.join(engine, '__dts_before_bundle');
function write(file, contents) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
}
function diagnostics(file) {
    const program = ts.createProgram([file], {
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        types: [],
        target: ts.ScriptTarget.ES2020,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
    });
    return ts.getPreEmitDiagnostics(program);
}
async function test() {
    write(
        path.join(engine, 'math.ts'),
        `
export class Base { clone(): Base { return new Base(); } }
export class Vector extends Base {
    static readonly ZERO = Object.freeze(new Vector());
    constructor(public x = 0, public y = 0) { super(); }
    clone(): Vector { return new Vector(this.x, this.y); }
    set(value: number): this;
    set(value: Vector): this;
    set(value: number | Vector, optional = 1): this { return this; }
    scale(value = 1): this { this.x *= value; return this; }
}
`,
    );
    write(
        path.join(engine, 'pal/input.d.ts'),
        `import { Vector } from '../math';
export interface InputPosition { value: Vector; }
`,
    );
    const ambient = path.join(engine, '@types/input.d.ts');
    write(ambient, `declare module 'pal/input' { export type Position = import('../pal/input').InputPosition; }`);
    write(
        path.join(engine, 'index.ts'),
        `export { Vector } from './math';
import { Position } from 'pal/input';
export interface Controller { position: Position; }
`,
    );
    const program = ts.createProgram([path.join(engine, 'index.ts'), ambient], {
        declaration: true,
        emitDeclarationOnly: true,
        rootDir: engine,
        outDir: emitted,
        types: [],
        strict: true,
        target: ts.ScriptTarget.ES2020,
    });
    assert.deepEqual(ts.getPreEmitDiagnostics(program), []);
    assert.equal(program.emit().emitSkipped, false);
    write(path.join(emitted, 'pal/input.d.ts'), fs.readFileSync(path.join(engine, 'pal/input.d.ts')));
    const options = {
        input: [ambient, path.join(emitted, 'index.d.ts'), path.join(emitted, 'math.d.ts')],
        rootDir: emitted,
        entries: { fixture: path.join(emitted, 'index.d.ts') },
        groups: [{ test: /.*/, path: path.join(directory, 'bundle.d.ts') }],
    };
    const original = gift.bundle(options).groups[0].code;
    write(path.join(directory, 'before.d.ts'), original);
    assert.ok(diagnostics(path.join(directory, 'before.d.ts')).length > 0, 'Original source leak must reproduce');
    const relocated = relocateDeclarationInputs(options, engine);
    assert.equal(relocated.input[0], path.join(emitted, '@types/input.d.ts'));
    assert.equal(fs.readFileSync(relocated.input[0], 'utf8'), fs.readFileSync(ambient, 'utf8'));
    const closed = ts.createProgram(relocated.input, { rootDir: emitted });
    assert.ok(
        closed.getSourceFiles().every((file) => file.isDeclarationFile),
        'Closure must contain declarations only',
    );
    const result = gift.bundle(relocated).groups[0].code;
    write(path.join(directory, 'after.d.ts'), result);
    write(
        path.join(directory, 'consumer.ts'),
        `/// <reference path="./after.d.ts" />
import { Vector, Controller } from 'fixture';
const vector = new Vector();
vector.scale(); vector.set(1); vector.set(vector);
const controller: Controller = { position: { value: vector } };
const cloned: Vector = controller.position.value.clone();
const zero: Readonly<Vector> = Vector.ZERO;
// @ts-expect-error The implementation signature is not public.
vector.set(1, 2);
// @ts-expect-error The inferred default parameter remains numeric.
vector.scale('wrong');
void [cloned, zero];
`,
    );
    const errors = diagnostics(path.join(directory, 'consumer.ts'));
    assert.deepEqual(
        errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')),
        [],
    );
    assert.ok(!result.includes('Bad expression'));
    assert.equal(relocateDeclarationInputs({ ...options, input: relocated.input }, engine).input.length, 3);
    const external = path.join(directory, 'external.d.ts');
    write(external, 'export {};');
    assert.deepEqual(relocateDeclarationInputs({ ...options, input: [external] }, engine).input, [external]);
    assert.throws(() => relocateDeclarationInputs({ ...options, input: [path.join(engine, 'math.ts')] }, engine));
    write(path.join(emitted, '@types/input.d.ts'), 'conflicting declaration');
    assert.throws(() => relocateDeclarationInputs(options, engine), /Conflicting declaration input/);
    const bundle = gift.bundle;
    assert.equal(await withDeclarationInputs(engine, async () => 'complete'), 'complete');
    assert.equal(gift.bundle, bundle, 'Adapter restores tfig after success');
    await assert.rejects(
        withDeclarationInputs(engine, async () => {
            throw new Error('fixture failure');
        }),
    );
    assert.equal(gift.bundle, bundle, 'Adapter restores tfig after failure');
    console.log(
        'PASS: reproduced source leakage; declaration-only closure and strict consumer (defaults, overload, constants, inheritance); adapter restoration.',
    );
}
test()
    .finally(() => fs.rmSync(directory, { recursive: true, force: true }))
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
