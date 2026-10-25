const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const { patchDragonBonesDeclaration, stageExternalDeclarationTypes } = require('./dts-external-types.cjs');
const root = path.resolve(__dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'air-external-types-'));
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
function fixture(name, content) {
    const file = path.join(tmp, name);
    fs.writeFileSync(file, content);
    return file;
}
const spine = path.join(root, 'src/cocos/spine/lib/spine-core');
const spineTest = fixture(
    'spine.ts',
    `
import spine from ${JSON.stringify(spine)};
declare const instance: spine.SkeletonInstance;
declare const data: spine.SkeletonData;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type VoidMethod = 'destroy' | 'setSkin' | 'setPremultipliedAlpha' | 'setColor' | 'setMix' | 'updateAnimation' | 'setUseTint' | 'clearEffect' | 'setJitterEffect' | 'setSwirlEffect' | 'setListener' | 'setDebugMode' | 'resizeSlotRegion' | 'setSlotTexture';
type ExactVoidMethods = Assert<Equal<{ [K in VoidMethod]: ReturnType<spine.SkeletonInstance[K]> }, { [K in VoidMethod]: void }>>;
type ExactSkeleton = Assert<Equal<ReturnType<spine.SkeletonInstance['initSkeleton']>, spine.Skeleton>>;
type ExactState = Assert<Equal<ReturnType<spine.SkeletonInstance['getAnimationState']>, spine.AnimationState | null>>;
type ExactModel = Assert<Equal<ReturnType<spine.SkeletonInstance['updateRenderData']>, spine.SpineModel>>;
type ExactShapes = Assert<Equal<ReturnType<spine.SkeletonInstance['getDebugShapes']>, spine.VectorView<spine.SpineDebugShape>>>;
type ExactCoordinate = Assert<Equal<spine.SwirlEffect['worldX'], number>>;
const skeleton: spine.Skeleton = instance.initSkeleton(data);
const state: spine.AnimationState | null = instance.getAnimationState();
// @ts-expect-error state is nullable before initialization
const nonnull: spine.AnimationState = instance.getAnimationState();
// Internal caller may assert only immediately after a successful valid-data initialization.
instance.initSkeleton(data);
const initialized: spine.AnimationState = instance.getAnimationState()!;
const model: spine.SpineModel = instance.updateRenderData();
const count: number = model.vCount + model.iCount + model.vPtr + model.iPtr;
const value: number = model.getData().get(0);
const texture: string = model.getTextures().get(0);
// @ts-expect-error vector is not a JS array
model.getData().map(x => x);
// @ts-expect-error string conversion is performed by embind
const wrappedString: spine.String = model.getTextures().get(0);
const shape: spine.SpineDebugShape = instance.getDebugShapes().get(0);
const shapeNumbers: number = shape.type + shape.vOffset + shape.vCount + shape.iOffset + shape.iCount;
// @ts-expect-error byteStride exists natively but is not bound to JS
model.byteStride;
const world: number = new spine.SwirlEffect(2).worldX;
// @ts-expect-error numeric coordinate
new spine.SwirlEffect(2).worldY = 'wrong';
const vector = new spine.SPVectorFloat();
const resized: void = vector.resize(1, 0);
const set: void = vector.set(0, 1);
const deleted: void = vector.delete();
const deletedPhysics: void = new spine.SPVectorPhysicsConstraintPtr().delete();
const deletedPhysicsData: void = new spine.SPVectorPhysicsConstraintDataPtr().delete();
const voidResults: void[] = [instance.destroy(), instance.setSkin(''), instance.setPremultipliedAlpha(true), instance.setColor(1,1,1,1), instance.setMix('a','b',1), instance.updateAnimation(1), instance.setUseTint(true), instance.clearEffect(), instance.setJitterEffect(new spine.JitterEffect(1,1)), instance.setSwirlEffect(new spine.SwirlEffect(1)), instance.setListener(0), instance.setDebugMode(true), instance.resizeSlotRegion('',1,1,false), instance.setSlotTexture('',''), spine.wasmUtil.registerSpineSkeletonDataWithUUID(data,''), spine.wasmUtil.destroySpineSkeletonDataWithUUID('')];
// @ts-expect-error mutation has no returned boolean
const result: boolean = instance.setSkin('');
`,
);
assert.deepEqual(
    diagnostics(spineTest).map((d) => [d.code, ts.flattenDiagnosticMessageText(d.messageText, '\n')]),
    [],
);
const fakeRoot = path.join(tmp, 'wrong-package');
fs.mkdirSync(fakeRoot);
assert.throws(() => stageExternalDeclarationTypes({ rootDir: tmp }, fakeRoot), /ENOENT/);
fs.writeFileSync(path.join(fakeRoot, 'package-lock.json'), JSON.stringify({ packages: {} }));
assert.throws(() => stageExternalDeclarationTypes({ rootDir: tmp }, fakeRoot), /lock version\/SRI mismatch/);
const original = fs.readFileSync(require.resolve('@cocos/dragonbones-js/out/dragonBones.d.ts'));
const patched = patchDragonBonesDeclaration(original);
assert.throws(() => patchDragonBonesDeclaration(Buffer.concat([original, Buffer.from('\n')])), /hash mismatch/);
const options = stageExternalDeclarationTypes({ rootDir: tmp, moduleMap: { untouched: '/sentinel.d.ts' } }, root);
assert.equal(options.moduleMap.untouched, '/sentinel.d.ts');
const dragon = options.moduleMap['@cocos/dragonbones-js'];
assert.equal(fs.readFileSync(dragon, 'utf8'), patched);
assert.deepEqual(fs.readFileSync(require.resolve('@cocos/dragonbones-js/out/dragonBones.d.ts')), original);
const dragonTest = fixture(
    'dragon.ts',
    `
import { Armature, Bone, Animation } from ${JSON.stringify(dragon.replace(/\.d\.ts$/, ''))};
declare const armature: Armature;
const bones: Bone[] = armature._bones;
const animation: Animation | null = armature._animation;
armature._animation = null;
// @ts-expect-error lifecycle includes null
const nonnull: Animation = armature._animation;
// @ts-expect-error bone list is readonly as a field
armature._bones = [];
// @ts-expect-error wrong element type
armature._bones.push('wrong');
// @ts-expect-error wrong animation type
armature._animation = 1;
`,
);
const remaining = diagnostics(dragonTest);
assert.equal(remaining.length, 0);
const baseline = fixture('dragon-baseline.d.ts', original);
assert.deepEqual(
    diagnostics(baseline)
        .map((d) => d.code)
        .sort(),
    [7008, 7008],
);
console.log(
    'PASS: strict Spine positive/negative contracts; DragonBones source 2 -> 0 diagnostics; exact input hash, module-map preservation, installed bytes unchanged',
);
