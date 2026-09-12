import { Asset } from '../../../cocos/asset/assets/asset';
import { Mesh } from '../../../cocos/3d/assets/mesh';
import { Material } from '../../../cocos/asset/assets/material';
import { Texture2D } from '../../../cocos/asset/assets/texture-2d';
import { ImageAsset } from '../../../cocos/asset/assets/image-asset';
import { Skeleton } from '../../../cocos/3d/assets/skeleton';
import { AnimationClip } from '../../../cocos/animation/animation-clip';
import { Animation } from '../../../cocos/animation/animation-component';
import { Node } from '../../../cocos/scene-graph/node';
import { MeshRenderer } from '../../../cocos/3d/framework/mesh-renderer';
import { SkinnedMeshRenderer } from '../../../cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer';
import { AttributeName } from '../../../cocos/gfx';
import { assets } from '../../../cocos/asset/asset-manager/shared';
import { GLTFContext } from './context';
import { check, item } from './schema';
import { makeNodes, NodeLayout } from './nodes';
import { GLTFWinding } from './winding';

let parsedAssetId = 0;

export interface GLTFInstance {
    readonly root: Node;
    readonly animations: readonly AnimationClip[];
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
    public get document (): Readonly<GLTFContext['json']> { return this.context.json; }
    public get warnings (): readonly string[] { return this.context.warnings; }
    /** @internal */ public readonly images: ImageAsset[] = [];
    /** @internal */ public readonly meshMaterials: Material[][] = [];
    private readonly sceneClips = new Map<number, AnimationClip[]>();
    private instances = 0;
    private destroyRequested = false;
    private resourcesReleased = false;

    constructor (private readonly context: GLTFContext, private readonly layout: NodeLayout) {
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
        try {
            const nodes = makeNodes(this.layout, included, root);
            const winding = root.addComponent(GLTFWinding);
            for (const i of visible) {
                const source = json.nodes![i];
                if (source.mesh === undefined) { check(source.skin === undefined, 'skin node must reference a mesh'); continue; }
                const node = nodes.get(i)!;
                const mesh = item(this.meshes, source.mesh, 'mesh');
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
            const animation = root.addComponent(Animation);
            winding.lateUpdate();
            animation.clips = clips.slice(); animation.playOnLoad = false;
            ++this.instances; this.addRef();
            let disposed = false;
            // Also handles scene destruction by the application, not only instance.dispose().
            root.once(Node.EventType.NODE_DESTROYED, () => {
                // NODE_DESTROYED precedes child/component teardown. Release GPU assets afterwards.
                void Promise.resolve().then(() => {
                    --this.instances;
                    this.decRef(!this.destroyRequested);
                    if (this.destroyRequested && this.instances === 0) { this.releaseResources(); }
                });
            });
            return { root, animations: clips, dispose: (): void => {
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
