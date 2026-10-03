import { Asset } from '../../../cocos/asset/assets/asset';
import { Mesh } from '../../../cocos/3d/assets/mesh';
import { Material } from '../../../cocos/asset/assets/material';
import { Texture2D } from '../../../cocos/asset/assets/texture-2d';
import { ImageAsset } from '../../../cocos/asset/assets/image-asset';
import { Skeleton } from '../../../cocos/3d/assets/skeleton';
import { AnimationClip } from '../../../cocos/animation/animation-clip';
import { Animation } from '../../../cocos/animation/animation-component';
import { Node } from '../../../cocos/scene-graph/node';
import { Vec3 } from '../../../cocos/core/math';
import { MeshRenderer } from '../../../cocos/3d/framework/mesh-renderer';
import { SkinnedMeshRenderer } from '../../../cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer';
import { AttributeName } from '../../../cocos/gfx';
import { assets } from '../../../cocos/asset/asset-manager/shared';
import { GLTFParserContext } from './parser-context';
import { check, item } from './schema';
import { makeNodes, NodeLayout } from './nodes';
import { GLTFWinding } from './winding';
import { Component } from '../../../cocos/scene-graph/component';
import { ccclass, executionOrder } from 'cc.decorator';
import type { GLTFInstantiationContext } from './extension-registry';

let parsedAssetId = 0;

/** Reapply instance overrides after native Animation.onLoad rebuilds its state table. */
@ccclass('air.GLTFAnimationPolicy')
// Native Animation uses executionOrder(99); policy initialization must follow it.
@executionOrder(100)
class GLTFAnimationPolicy extends Component {
    public declare animation: Animation;
    public readonly loops = new Map<string, boolean>();
    public onLoad (): void {
        this.loops.forEach((loop, name) => {
            const state = this.animation.getState(name);
            if (state) { state.wrapMode = loop ? AnimationClip.WrapMode.Loop : AnimationClip.WrapMode.Normal; }
        });
    }
}

export interface GLTFInstance {
    readonly root: Node;
    readonly animations: readonly AnimationClip[];
    /** Configures native instance states without modifying shared clips. Resets selected state times. */
    setAnimationLoop(loop: boolean, clipName?: string): void;
    /** Stops and destroys this instance. GPU resources follow Cocos deferred destruction. */
    dispose(): void;
}

/** Shared native assets; instantiate creates independent node/animation/morph state. */
export class GLTFAsset extends Asset {
    /** @internal Resource builder; public accessors expose readonly collections. */
    public readonly owned = { meshes: [] as Mesh[], materials: [] as Material[], textures: [] as Texture2D[],
        skeletons: [] as Skeleton[], animations: [] as AnimationClip[] };
    public get meshes (): readonly Mesh[] { return this.owned.meshes; }
    public get materials (): readonly Material[] { return this.owned.materials; }
    public get textures (): readonly Texture2D[] { return this.owned.textures; }
    public get skeletons (): readonly Skeleton[] { return this.owned.skeletons; }
    public get animations (): readonly AnimationClip[] { return this.owned.animations; }
    public readonly sceneNames: readonly string[];
    /** Original glTF metadata, including camera/light descriptions and original node names. */
    public get document (): Readonly<GLTFParserContext['json']> { return this.context.json; }
    public get warnings (): readonly string[] { return this.context.warnings; }
    /** @internal */ public readonly images: ImageAsset[] = [];
    /** @internal */ public readonly meshMaterials: Material[][] = [];
    private readonly sceneClips = new Map<number, AnimationClip[]>();
    private instances = 0;
    private destroyRequested = false;
    private resourcesReleased = false;

    constructor (private readonly context: GLTFParserContext, private readonly layout: NodeLayout) {
        super();
        this._uuid = `air-gltf-parsed-${++parsedAssetId}`;
        this.sceneNames = context.json.scenes?.length ? context.json.scenes.map((s, i) => s.name || `scene_${i}`) : ['scene_0'];
    }

    public instantiate (sceneIndex = this.context.json.scene ?? 0): GLTFInstance {
        check(!this.destroyRequested && this.isValid, 'asset is destroyed');
        item(this.sceneNames, sceneIndex, 'scene');
        const json = this.context.json;
        const roots = json.scenes?.length ? json.scenes[sceneIndex].nodes || [] : this.layout.parents.map((p, i) => p === -1 ? i : -1).filter((i) => i >= 0);
        const visible = new Set<number>();
        const visit = (i: number): void => { if (visible.has(i)) { return; } visible.add(i); for (const child of json.nodes![i].children || []) { visit(child); } };
        roots.forEach(visit);
        const included = new Set(visible);
        const includeAncestors = (index: number): void => { for (let i = index; i !== -1; i = this.layout.parents[i]) { included.add(i); } };
        for (const i of visible) {
            const skinIndex = json.nodes![i].skin;
            if (skinIndex !== undefined) { item(json.skins, skinIndex, 'skin').joints.forEach(includeAncestors); }
        }
        let clips = this.sceneClips.get(sceneIndex);
        if (!clips) {
            const paths = new Set(Array.from(included, (i) => this.layout.paths[i]));
            clips = this.animations.map((source) => {
                const clip = new AnimationClip(); clip.name = source.name; clip.duration = source.duration; clip.wrapMode = source.wrapMode;
                for (const track of source.tracks) {
                    if (paths.has(track.path.parseHierarchyAt(0))) { clip.addTrack(track); }
                }
                return clip;
            });
            this.sceneClips.set(sceneIndex, clips);
        }
        const root = new Node(this.sceneNames[sceneIndex]);
        const mounts = new Map<number, Node[]>();
        let instCtx: GLTFInstantiationContext = {
            json,
            nodes: new Map<number, Node>(),
            accessor: (index: number) => this.context.accessor(index),
            renderTargets: new Map<Node, Node[]>(),
        };
        try {
            const nodes = makeNodes(this.layout, included, root, (i, node) => {
                for (const handler of this.context.handlers) {
                    const result = handler.buildNode?.(i, node, instCtx);
                    if (result) {
                        mounts.set(i, Array.isArray(result) ? result : [result]);
                        return result;
                    }
                }
                return null;
            });
            instCtx = { ...instCtx, nodes };
            const rendererTargets = (i: number): Node[] => {
                const original = nodes.get(i)!;
                return instCtx.renderTargets.get(original) ?? mounts.get(i) ?? [original];
            };
            const winding = root.addComponent(GLTFWinding);
            for (const i of visible) {
                const source = json.nodes![i];
                if (source.mesh === undefined) { check(source.skin === undefined, 'skin node must reference a mesh'); continue; }
                const mesh = item(this.meshes, source.mesh, 'mesh');
                for (const node of rendererTargets(i)) {
                    let renderer: MeshRenderer;
                    if (source.skin !== undefined) {
                        const skin = item(this.skeletons, source.skin, 'skin');
                        for (let sub = 0; sub < mesh.struct.primitives.length; ++sub) {
                            const joints = mesh.readAttribute(sub, AttributeName.ATTR_JOINTS);
                            check(joints && Array.from(joints).every((j) => j < skin.joints.length), 'mesh has missing/out-of-range skin joints');
                        }
                        const skinned = node.addComponent(SkinnedMeshRenderer);
                        skinned.setUseBakedAnimation(false);
                        skinned.skinningRoot = root; skinned.skeleton = skin;
                        renderer = skinned;
                    } else { renderer = node.addComponent(MeshRenderer); }
                    renderer.mesh = mesh;
                    winding.renderers.push(renderer);
                    this.meshMaterials[source.mesh].forEach((material, slot) => renderer.setSharedMaterial(material, slot));
                    const weights = source.weights || json.meshes![source.mesh].weights;
                    if (weights) {
                        check(weights.length === (json.meshes![source.mesh].primitives[0].targets?.length || 0) && weights.every(Number.isFinite), 'invalid node morph weights');
                        for (let sub = 0; sub < mesh.struct.primitives.length; ++sub) { renderer.setWeights(weights.slice(), sub); }
                    }
                }
            }
            for (const i of visible) {
                for (const handler of this.context.handlers) {
                    handler.instantiate?.(i, mounts.get(i)?.[0] ?? nodes.get(i)!, instCtx);
                }
            }
            const animation = root.addComponent(Animation);
            const animationPolicy = root.addComponent(GLTFAnimationPolicy);
            animationPolicy.animation = animation;
            winding.lateUpdate();
            animation.clips = clips.slice(); animation.playOnLoad = false;
            ++this.instances; this.addRef();
            let disposed = false;
            const instanceClips = clips;
            // Also handles scene destruction by the application, not only instance.dispose().
            root.once(Node.EventType.NODE_DESTROYED, () => {
                // NODE_DESTROYED precedes child/component teardown. Release GPU assets afterwards.
                void Promise.resolve().then(() => {
                    --this.instances;
                    this.decRef(!this.destroyRequested);
                    if (this.destroyRequested && this.instances === 0) { this.releaseResources(); }
                });
            });
            return { root, animations: instanceClips, setAnimationLoop: (loop: boolean, clipName?: string): void => {
                const invalid = (message: string): TypeError => Object.assign(new TypeError(`[AIR_E_GLTF_ANIMATION_OPTIONS] ${message}`), {
                    code: 'AIR_E_GLTF_ANIMATION_OPTIONS', clipName,
                });
                if (disposed || !root.isValid) { throw invalid('The glTF instance has been disposed.'); }
                if (typeof loop !== 'boolean' || (clipName !== undefined && typeof clipName !== 'string')) {
                    throw invalid('setAnimationLoop expects a boolean and an optional clip name.');
                }
                const selected = clipName === undefined ? instanceClips : instanceClips.filter((clip) => clip.name === clipName);
                if (clipName !== undefined && !selected.length) { throw invalid(`Unknown animation clip "${clipName}"; available clips: ${instanceClips.map((clip) => clip.name).join(', ')}.`); }
                // getState initializes the native evaluator before applying the per-instance override.
                const states = selected.map((clip) => animation.getState(clip.name));
                if (states.some((state) => !state)) { throw invalid('A selected native animation state was removed; restore the clip before configuring it.'); }
                selected.forEach((clip) => { animationPolicy.loops.set(clip.name, loop); });
                states.forEach((state) => { state.wrapMode = loop ? AnimationClip.WrapMode.Loop : AnimationClip.WrapMode.Normal; });
            }, dispose: (): void => {
                if (disposed) { return; } disposed = true;
                animation.stop(); root.active = false; root.destroy();
            } };
        } catch (error) { root.destroy(); throw error; }
    }

    public destroy (): boolean {
        if (!this.isValid || this.destroyRequested) { return false; }
        this.destroyRequested = true;
        if (assets.get(this._uuid) === this) { assets.remove(this._uuid); }
        if (!this.instances) { this.releaseResources(); }
        return true;
    }
    private releaseResources (): void {
        if (this.resourcesReleased) { return; } this.resourcesReleased = true;
        const owned = new Set<Asset>([...this.materials, ...this.meshes, ...this.skeletons, ...this.animations,
            ...this.textures, ...this.images]);
        this.sceneClips.forEach((clips) => clips.forEach((clip) => owned.add(clip)));
        for (const asset of owned) { asset.destroy(); }
        super.destroy();
    }
}
