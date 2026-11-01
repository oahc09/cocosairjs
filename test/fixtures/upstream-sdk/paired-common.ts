// AU12 paired-common/1: installed native SDK behavior shared by fixed main and candidate.
// Candidate-only request policy checks remain unchanged in contracts.ts (U06 extension).
import {
    GLTFLoader,
    GLTFAsset,
    GLTFError,
    configureGLTFLoaderDefaults,
    Node,
    MeshRenderer,
    Material,
    AnimationClip,
    instantiate,
} from 'cocosair';
import type { GLTFLoaderOptions, GLTFInstance, AirApp, Scene } from 'cocosair';
import { Vec3 as MathVec3, Mat4, clamp01 } from 'cocosair/math';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type LoadIsPromise = Expect<Equal<ReturnType<GLTFLoader['loadAsync']>, Promise<GLTFAsset>>>;
type ParseIsPromise = Expect<Equal<ReturnType<GLTFLoader['parseAsync']>, Promise<GLTFAsset>>>;
type InstantiateIsSynchronous = Expect<Equal<ReturnType<GLTFAsset['instantiate']>, GLTFInstance>>;
type DisposeIsVoid = Expect<Equal<ReturnType<GLTFInstance['dispose']>, void>>;
type DestroyIsBoolean = Expect<Equal<ReturnType<GLTFAsset['destroy']>, boolean>>;
type DefaultsAreVoid = Expect<Equal<ReturnType<typeof configureGLTFLoaderDefaults>, void>>;

{
    const options: GLTFLoaderOptions = { signal: new AbortController().signal };
    configureGLTFLoaderDefaults(options);
    const loader = new GLTFLoader(options);
    const loaded: Promise<GLTFAsset> = loader.loadAsync('/fixture.glb');
    const parsed: Promise<GLTFAsset> = loader.parseAsync('{"asset":{"version":"2.0"}}', '/assets/');
    const parsedBytes: Promise<GLTFAsset> = loader.parseAsync(new ArrayBuffer(0));
    const chained: GLTFLoader = loader.setMeshoptDecoder(null).setDRACODecoder(null).setKTX2Transcoder(null);
    void [loaded, parsed, parsedBytes, chained];
}
new GLTFLoader();
new GLTFLoader(undefined);
// @ts-expect-error existing URL signature must not widen to any
new GLTFLoader().loadAsync(null);
// @ts-expect-error existing parse signature requires string or ArrayBuffer
new GLTFLoader().parseAsync({ asset: { version: '2.0' } });

declare const asset: GLTFAsset;
const instance: GLTFInstance = asset.instantiate();
const sceneInstance: GLTFInstance = asset.instantiate(0);
const root: Node = instance.root;
const clips: readonly AnimationClip[] = instance.animations;
const disposed: void = instance.dispose();
const destroyed: boolean = asset.destroy();
const loopConfigured: void = sceneInstance.setAnimationLoop(false, 'Walk');
sceneInstance.setAnimationLoop(true);
// @ts-expect-error scene selection is numeric
asset.instantiate('Scene');
// @ts-expect-error instantiate is not asynchronous
const pendingInstance: Promise<GLTFInstance> = asset.instantiate();
// @ts-expect-error dispose is synchronous void, not a boolean success flag
const disposedFlag: boolean = instance.dispose();
// @ts-expect-error asset destroy is not an asynchronous resource-completion receipt
const pendingDestroy: Promise<void> = asset.destroy();
// @ts-expect-error shared animation list is readonly
instance.animations.push(new AnimationClip());
// @ts-expect-error root ownership reference is readonly
instance.root = new Node();
// @ts-expect-error loop selection is boolean, not truthiness
instance.setAnimationLoop('true');
// @ts-expect-error clip name is optional, not null
instance.setAnimationLoop(true, null);

const nativeClone: Node = instantiate(root);
const maybeChild: Node | null = nativeClone.getChildByName('Missing');
const maybeRenderer: MeshRenderer | null = nativeClone.getComponent(MeshRenderer);
// @ts-expect-error missing child is nullable
const requiredChild: Node = nativeClone.getChildByName('Missing');
// @ts-expect-error missing component is nullable
const requiredRenderer: MeshRenderer = nativeClone.getComponent(MeshRenderer);
if (maybeRenderer) {
    const materialInstance = maybeRenderer.getMaterialInstance(0);
    // No named MaterialInstance export is assumed: use the native renderer's inferred instance type.
    const nullableMaterial: Material | null = materialInstance;
    // @ts-expect-error an empty slot has no material instance
    const requiredMaterial: Material = materialInstance;
    if (materialInstance) {
        const parent: Material = materialInstance.parent;
        materialInstance.setProperty('mainColor', [1, 0, 0, 1]);
        maybeRenderer.setMaterialInstance(materialInstance, 0);
        void parent;
    }
    maybeRenderer.setMaterialInstance(null, 0);
    void nullableMaterial;
}

declare const app: AirApp;
const currentScene: Scene | null = app.getScene();
// @ts-expect-error getScene is nullable before run and after release
const requiredScene: Scene = app.getScene();
// @ts-expect-error compatibility handles may omit close
app.close();
// @ts-expect-error compatibility handles may omit releaseScene
app.releaseScene();
if (app.close) {
    const receipt = app.close();
    // @ts-expect-error close is asynchronous, not synchronous void
    const immediateReceipt: void = receipt;
    void receipt;
}
const error = new GLTFError('GLTF_DECODE_FAILED', 'synthetic fixture');
const optionalExtension: string | undefined = error.extension;
// @ts-expect-error extension information can be absent
const requiredExtension: string = error.extension;
// @ts-expect-error errors have a finite public code set
new GLTFError('ARBITRARY_FAILURE', 'synthetic fixture');

const vector: MathVec3 = new MathVec3(3, 4, 12);
const matrix: Mat4 = new Mat4();
const normalized: number = clamp01(2);
// @ts-expect-error CPU-only math entry never exposes engine startup
import { createAirApp as mathStartup } from 'cocosair/math';
// @ts-expect-error CPU-only math entry never exposes scene graph types
import { Node as MathNode } from 'cocosair/math';
void [
    root,
    clips,
    disposed,
    destroyed,
    loopConfigured,
    maybeChild,
    currentScene,
    optionalExtension,
    vector,
    matrix,
    normalized,
];
export type ContractAssertions = [
    LoadIsPromise,
    ParseIsPromise,
    InstantiateIsSynchronous,
    DisposeIsVoid,
    DestroyIsBoolean,
    DefaultsAreVoid,
];
