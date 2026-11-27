/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
import { Sprite } from '../../cocos/2d/components/sprite';
import { Mask } from '../../cocos/2d/components/mask';
import { Graphics } from '../../cocos/2d/components/graphics';
import { SpriteFrame } from '../../cocos/2d/assets/sprite-frame';
import { UITransform } from '../../cocos/2d/framework/ui-transform';
import { Texture2D } from '../../cocos/asset/assets/texture-2d';
import { createBone2dTintEffect } from './two-color';
import { bone2dImageHeader, bone2dImageBudget } from './image';
import type { EffectAsset } from '../../cocos/asset/assets/effect-asset';
import { Material } from '../../cocos/asset/assets/material';
import { BlendFactor, BlendOp } from '../../cocos/gfx';
import { ImageAsset } from '../../cocos/asset/assets/image-asset';
import { Color, Rect, Size, Vec4 } from '../../cocos/core/math';
import { Filter } from '../../cocos/asset/assets/asset-enum';
import { isValid } from '../../cocos/core/data/object';
import { Layers } from '../../cocos/scene-graph/layers';
import { Node } from '../../cocos/scene-graph/node';
import { spriteNode } from '../ui-kit';
import { AirUIMesh } from '../ui-mesh';
import type { AirAtlasHandle } from '../assets/atlas/atlas-factory';
import { factorBone2dBasis } from './affine';
import { convexClipOutline, hasNonCollinearPoints } from './polygon';
import type { Bone2dPhysicsState, PhysicsStep } from './physics';
import { bone2dKeysInWindow, makeBone2dPlayback, playbackBudget, traverseBone2dPlayback } from './playback';
import type { Bone2dPlaybackOptions, Bone2dSavedPlayback, Playback, PlaybackCursor } from './playback';
import { parseBone2dProject, sampleBone2dFrame, bone2dWorldMatrices, bone2dMeshPositions, bone2dPicture, resolveBone2dAttachment, bone2dShapeGeometry } from './project';
import type { Bone2dAttachmentGeometry, Bone2dBlend, Bone2dClipAttachment, Bone2dImage, Bone2dMarker, Bone2dPose, Bone2dProjectOptions, Bone2dSample } from './project';

export interface AirBone2dOptions extends Bone2dProjectOptions {
    /** If specified, borrow exact-name frames rather than decoding embedded pictures. The caller owns the atlas. */
    readonly atlas?: AirAtlasHandle;
    /** Source packing convention for rotated atlas entries; defaults to Bone-2D export. */
    readonly atlasRotation?: 'bone2d' | 'air';
    /** AIR extension. Leave off to match Bone-2D's editor, which skins mask vertices but ignores their deform keys. */
    readonly deformClipping?: boolean;
    readonly layer?: number;
    readonly signal?: AbortSignal;
}
export interface Bone2dCrossfadeOptions {
    /** Defaults to the saved pair or default mix duration, in real seconds. */
    readonly duration?: number;
    readonly holdPrevious?: boolean;
    readonly playback?: boolean | Bone2dPlaybackOptions;
}
export interface Bone2dLayerOptions {
    readonly id: string;
    /** Initial local time. Extra layers advance with the main player's speed and do not emit markers. */
    readonly time?: number;
    readonly weight?: number;
    readonly additive?: boolean;
    readonly loop?: boolean;
}
type Layer = Required<Bone2dLayerOptions> & { length: number };
type LocalPose = Pick<Bone2dSample, 'bones' | 'shears'>;
type Transition = {
    source: { id: string; time: number; direction: 1 | -1; lo: number; hi: number } | { frozen: LocalPose };
    duration: number;
    elapsed: number;
    holdPrevious: boolean;
};
export interface AirBone2dPlayer {
    readonly node: Node;
    readonly skeletonIndex: number;
    readonly skeletonNames: readonly string[];
    readonly skins: readonly { readonly id: string; readonly name: string }[];
    /** Ordered overlays on the project's default skin (last overlay wins). */
    setSkins(ids: readonly string[]): void;
    readonly animations: readonly { readonly id: string; readonly name: string; readonly duration: number; readonly play: Bone2dSavedPlayback }[];
    readonly time: number;
    readonly animation: string | null;
    readonly playing: boolean;
    readonly direction: 1 | -1;
    /** A boolean preserves legacy full-span forward playback; an options object can select saved settings. */
    play(id: string, options?: boolean | Bone2dPlaybackOptions): void;
    /** Crossfade main bone channels, switching non-bone timelines to the destination immediately. */
    crossfade(id: string, options?: Bone2dCrossfadeOptions): void;
    /** Replaces the ordered preview layers and resets their clocks to the supplied times. */
    setLayers(layers: readonly Bone2dLayerOptions[]): void;
    pause(): void;
    resume(): void;
    /** Updates the pose without emitting or replaying markers. */
    seek(seconds: number): void;
    /** Advances using caller-owned scene time and returns inert marker records, not method calls. */
    advance(deltaSeconds: number): readonly Bone2dMarker[];
    /** Current active point, bounding box or path in player-root coordinates; null for sprites, meshes and empty slots. */
    getAttachmentGeometry(slotId: string): Bone2dAttachmentGeometry | null;
    dispose(): void;
}

function error(reason: string): never {
    throw new Error(`AIR_E_BONE2D_PLAYER: ${reason}`);
}
function poseNode(node: Node, [x, y, r, sx, sy]: Bone2dPose): void {
    node.setPosition(x, y, 0);
    node.angle = r;
    node.setScale(sx, sy, 1);
}
function embeddedPicture(name: string, source: Bone2dImage): string {
    const [width, height] = bone2dImageHeader(source.dataUrl, name, error);
    if (width !== source.width || height !== source.height) error(`embedded dimensions differ from project: ${name}`);
    return source.dataUrl!;
}
function decode(url: string, name: string, signal?: AbortSignal): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const done = (): void => {
            img.onload = img.onerror = null;
            signal?.removeEventListener('abort', aborted);
        };
        const aborted = (): void => {
            done();
            img.removeAttribute('src');
            reject(new Error('AIR_E_BONE2D_ABORTED'));
        };
        if (signal?.aborted) {
            aborted();
            return;
        }
        signal?.addEventListener('abort', aborted, { once: true });
        img.onload = (): void => {
            done();
            resolve(img);
        };
        img.onerror = (): void => {
            done();
            reject(new Error(`AIR_E_BONE2D_PLAYER: PNG decode failed: ${name}`));
        };
        img.src = url;
    });
}

/** Create the optional AIR-native UI player from a Bone-2D Save Project document. */
export async function createAirBone2dPlayer(
    parent: Node,
    text: string,
    options: AirBone2dOptions = {},
): Promise<AirBone2dPlayer> {
    const project = parseBone2dProject(text, options);
    const { atlas, signal } = options;
    if (options.atlasRotation !== undefined && options.atlasRotation !== 'air' && options.atlasRotation !== 'bone2d') {
        error('invalid atlas rotation convention');
    }
    if (options.deformClipping !== undefined && typeof options.deformClipping !== 'boolean')
        error('invalid clipping deformation option');
    const layer = options.layer ?? Layers.Enum.UI_2D;
    const used = new Set<string>();
    const meshImages = new Set<string>();
    const meshSlots = new Set<string>();
    for (const skin of project.skins.values()) {
        for (const [slot, regions] of skin.regions)
            for (const region of regions.values()) {
                if (region.kind !== 'mesh' && region.kind !== 'region') continue;
                for (const name of region.sequence?.frames ?? [region.path]) {
                    used.add(name);
                    if (region.kind === 'mesh') meshImages.add(name);
                }
                if (region.kind === 'mesh') meshSlots.add(slot);
            }
    }
    if (signal?.aborted) throw new Error('AIR_E_BONE2D_ABORTED');
    const frames = new Map<string, SpriteFrame>();
    const retained = new Set<SpriteFrame>();
    const blendMaterials = new Map<Bone2dBlend, Material>();
    let tintEffect: EffectAsset | undefined;
    const tintedSlots = new Map<string, { material: Material; values: Vec4 }>();
    const materialFor = (mode: Bone2dBlend, darkSlot?: string): Material => {
        if (darkSlot === undefined) {
            const existing = blendMaterials.get(mode);
            if (existing) return existing;
        }
        const material = new Material();
        if (darkSlot === undefined) blendMaterials.set(mode, material);
        else {
            tintedSlots.set(darkSlot, { material, values: new Vec4(-1, -1, -1, 0) });
            tintEffect ??= createBone2dTintEffect();
        }
        const colorSrc = mode === 'multiply' ? BlendFactor.DST_COLOR :
            mode === 'screen' ? BlendFactor.ONE : BlendFactor.SRC_ALPHA;
        const colorDst = mode === 'additive' ? BlendFactor.ONE :
            mode === 'screen' ? BlendFactor.ONE_MINUS_SRC_COLOR : BlendFactor.ONE_MINUS_SRC_ALPHA;
        material.initialize({
            ...(darkSlot === undefined ? { effectName: 'builtin-sprite' } : { effectAsset: tintEffect }),
            defines: { USE_TEXTURE: true, USE_ALPHA_TEST: false, CC_USE_EMBEDDED_ALPHA: false },
            states: { blendState: { targets: [{
                blend: true, blendEq: BlendOp.ADD, blendAlphaEq: BlendOp.ADD,
                blendSrc: colorSrc, blendDst: colorDst, blendSrcAlpha: BlendFactor.ONE,
                blendDstAlpha: mode === 'additive' ? BlendFactor.ONE : BlendFactor.ONE_MINUS_SRC_ALPHA,
            }] } },
        });
        return material;
    };
    const adapted = new Set<SpriteFrame>();
    const owned: { image: ImageAsset; texture: Texture2D; frame: SpriteFrame }[] = [];
    const root = new Node('Bone2D');
    root.layer = layer;
    const slots = new Map<
        string,
        { root: Node; bones: Map<string, Node>; affine?: readonly [Node, Node]; leaf: Node; sprite: Sprite; transform: UITransform; mesh?: AirUIMesh }
    >();
    const masks = new Map<string, { node: Node; mask: Mask; graphics: Graphics; outline: number[] }>();
    let disposed = false;
    const release = (destroyNode: boolean): void => {
        if (disposed) return;
        disposed = true;
        for (const s of slots.values()) {
            if (s.sprite.isValid) s.sprite.spriteFrame = null;
            if (s.mesh?.isValid) s.mesh.dispose();
        }
        for (const { node } of masks.values()) if (node.parent !== root && isValid(node, true)) node.destroy();
        masks.clear();
        for (const material of blendMaterials.values()) material.destroy();
        blendMaterials.clear();
        for (const { material } of tintedSlots.values()) material.destroy();
        tintedSlots.clear();
        tintEffect?.destroy();
        if (destroyNode && isValid(root, true)) root.destroy();
        for (const f of retained) f.decRef(false);
        for (const f of adapted) f.destroy();
        for (const o of owned) {
            o.frame.destroy();
            o.texture.decRef(false);
            o.texture.destroy();
            o.image.destroy();
        }
        slots.clear();
        frames.clear();
        retained.clear();
        adapted.clear();
        owned.length = 0;
    };
    const slotDefinitions = new Map(project.slots.map((slot) => [slot.id, slot] as const));
    const getMask = (id: string, attachment: Bone2dClipAttachment, outline: number[]): Node => {
        let entry = masks.get(id);
        if (!entry) {
            const node = new Node(`Clip:${id}`);
            node.layer = layer;
            const mask = node.addComponent(Mask);
            mask.type = Mask.Type.GRAPHICS_STENCIL;
            entry = { node, mask, graphics: node.getComponent(Graphics)!, outline: [] };
            masks.set(id, entry);
        }
        if (entry.mask.inverted !== attachment.inverse) entry.mask.inverted = attachment.inverse;
        if (outline.length !== entry.outline.length || outline.some((v, i) => v !== entry!.outline[i])) {
            const graphics = entry.graphics;
            graphics.clear();
            graphics.moveTo(outline[0], outline[1]);
            for (let i = 2; i < outline.length; i += 2) graphics.lineTo(outline[i], outline[i + 1]);
            graphics.close();
            graphics.fill();
            entry.outline = outline;
        }
        return entry.node;
    };
    const lookup = new Map(project.bones.map((bone) => [bone.id, bone] as const));
    const defaultSkin = project.skins.values().next().value!;
    let selectedSkins = [defaultSkin];
    let activeOverlays: string[] = [];
    const physics: Bone2dPhysicsState = new Map();
    const hasPhysics = [...project.constraints.values()].some((c) => c.kind === 'physics');
    let transition: Transition | null = null;
    let layers: readonly Layer[] = [];
    const transitionFrame = (value: Transition | null) => {
        if (!value) return undefined;
        const source = value.source;
        const from = 'frozen' in source ? source.frozen :
            sampleBone2dFrame(project, source.id, source.time, activeOverlays, undefined, undefined, true);
        return { from, alpha: value.elapsed / value.duration, holdPrevious: value.holdPrevious };
    };
    const sampleFor = (clip: string | null, time: number, seconds = 0, intervals: PhysicsStep['intervals'] = [],
        mixing = transition, overlays = layers): Bone2dSample =>
        sampleBone2dFrame(project, clip, time, activeOverlays, hasPhysics ? { state: physics, seconds, intervals } : undefined,
            mixing || overlays.length ? { transition: transitionFrame(mixing), layers: overlays } : undefined,
        );
    let currentSample: Bone2dSample;
    const apply = (sample: Bone2dSample): void => {
        let world: ReturnType<typeof bone2dWorldMatrices> | null = null;
        const active = new Map(project.slots.map((s) =>
            [s.id, resolveBone2dAttachment(selectedSkins, s.id, sample.slots.get(s.id)!.attachment)] as const,
        ));
        const suppressed = new Set<string>();
        if (masks.size || Array.from(active.values()).some((a) => a?.kind === 'clipping')) {
            const clipNodes = new Set<Node>();
            const ordered = new Map<Node, Node[]>([[root, []]]);
            const add = (parent: Node, child: Node): void => {
                const group = ordered.get(parent);
                if (group) group.push(child);
                else ordered.set(parent, [child]);
            };
            let scope: { end: string | null; parent: Node; empty: boolean } | null = null;
            for (const id of sample.order) {
                const attachment = active.get(id);
                const slot = slots.get(id)!.root;
                if (attachment?.kind !== 'clipping') {
                    if (scope?.empty) suppressed.add(id);
                    add(scope?.parent ?? root, slot);
                    if (scope?.end === id) scope = null;
                    continue;
                }
                add(root, slot);
                if (scope?.end === id) scope = null;
                if (scope) continue; // A nested mask does not replace the current one.
                world ??= bone2dWorldMatrices(project, sample);
                const clip = attachment;
                const bone = slotDefinitions.get(id)!.bone;
                const deltas = options.deformClipping ? (sample.slotDeform ? sample.slotDeform.get(id) : sample.shapeDeltas.get(clip)) : undefined;
                const vertices = bone2dMeshPositions(clip, bone, world, deltas);
                const outline = clip.convex || clip.inverse ? convexClipOutline(vertices) : vertices;
                if (outline.length < 6 || !hasNonCollinearPoints(outline)) {
                    if (!clip.inverse) scope = { end: clip.end, parent: root, empty: true };
                    continue;
                }
                const mask = getMask(id, clip, outline);
                clipNodes.add(mask);
                add(root, mask);
                scope = { end: clip.end, parent: mask, empty: false };
            }
            for (const [parent, children] of ordered) {
                for (const child of children) if (child.parent !== parent) child.setParent(parent);
            }
            for (const { node } of masks.values()) {
                if (!clipNodes.has(node) && node.parent === root) node.setParent(null);
            }
            for (const [, children] of ordered) {
                children.forEach((child, index) => {
                    if (child.getSiblingIndex() !== index) child.setSiblingIndex(index);
                });
            }
        } else {
            sample.order.forEach((id, index) => {
                const node = slots.get(id)!.root;
                if (node.getSiblingIndex() !== index) node.setSiblingIndex(index);
            });
        }
        for (const def of project.slots) {
            const s = slots.get(def.id)!,
                p = sample.slots.get(def.id)!;
            const region = active.get(def.id);
            const drawable = !suppressed.has(def.id) && (region?.kind === 'region' || region?.kind === 'mesh');
            s.root.active = drawable;
            if (!drawable) {
                s.sprite.spriteFrame = null;
                if (s.mesh) s.mesh.spriteFrame = null;
                continue;
            }
            const newFrame = frames.get(bone2dPicture(region, sample, def.id))!;
            if (p.dark) {
                const { material, values } = tintedSlots.get(def.id)!;
                if (p.dark[0] !== values.x || p.dark[1] !== values.y || p.dark[2] !== values.z) {
                    values.set(p.dark[0], p.dark[1], p.dark[2], 0);
                    material.setProperty('bone2dDark', values);
                }
            }
            const c = p.color.map((v, i) => Math.round(255 * v * region.color[i]));
            const tint = (renderer: Sprite | AirUIMesh): void => {
                const { r, g, b, a } = renderer.color;
                if (r !== c[0] || g !== c[1] || b !== c[2] || a !== c[3])
                    renderer.color = new Color(c[0], c[1], c[2], c[3]);
            };
            if (region.kind === 'mesh') {
                s.sprite.spriteFrame = null;
                const mesh = s.mesh!;
                mesh.node.active = true;
                if (mesh.spriteFrame !== newFrame) mesh.spriteFrame = newFrame;
                world ??= bone2dWorldMatrices(project, sample);
                mesh.setGeometry({
                    positions: bone2dMeshPositions(
                        region,
                        def.bone,
                        world,
                        sample.slotDeform ? sample.slotDeform.get(def.id) : sample.meshDeltas.get(region.deformParent ?? region),
                    ),
                    uvs: region.uvs,
                    indices: region.indices,
                });
                tint(mesh);
                continue;
            }
            if (s.mesh) {
                s.mesh.spriteFrame = null;
                s.mesh.node.active = false;
            }
            if (s.affine) {
                world ??= bone2dWorldMatrices(project, sample);
                const frame = world.get(def.bone)!;
                const [outer, inner] = s.affine;
                const [a, b, sx, sy] = factorBone2dBasis(frame);
                poseNode(outer, [frame[4], frame[5], a, sx, sy]);
                inner.angle = b;
            } else {
                for (const [id, node] of s.bones) poseNode(node, sample.bones.get(id)!);
            }
            poseNode(s.leaf, region.pose);
            s.transform.setContentSize(region.width, region.height);
            if (s.sprite.spriteFrame !== newFrame) s.sprite.spriteFrame = newFrame;
            tint(s.sprite);
        }
        currentSample = sample;
    };
    try {
        let pixels = 0;
        for (const name of used) {
            const spec = project.images.get(name)!;
            if (atlas) {
                if (atlas.disposed) error('atlas is disposed');
                const frame = atlas.getFrame(name);
                if (
                    !frame?.isValid ||
                    frame.originalSize.width !== spec.width ||
                    frame.originalSize.height !== spec.height
                ) {
                    error(`missing atlas frame or mismatched original dimensions: ${name}`);
                }
                if (meshImages.has(name) && (frame.rect.width !== spec.width || frame.rect.height !== spec.height))
                    error(`mesh needs untrimmed atlas UVs: ${name}`);
                if (!retained.has(frame)) {
                    frame.addRef();
                    retained.add(frame);
                }
                if (frame.rotated && (options.atlasRotation ?? 'bone2d') === 'bone2d') {
                    // Bone-2D writes the opposite quarter-turn from AIR's native
                    // rotated frame. A local copy flips both UV axes while the
                    // original handle remains unchanged and pinned.
                    const rotated = frame.clone();
                    rotated.packable = false;
                    rotated.flipUVX = !frame.flipUVX;
                    rotated.flipUVY = !frame.flipUVY;
                    adapted.add(rotated);
                    frames.set(name, rotated);
                } else frames.set(name, frame);
                continue;
            }
            pixels += spec.width * spec.height;
            if (pixels > bone2dImageBudget) error('embedded image pixel budget exceeded');
            const decoded = await decode(embeddedPicture(name, spec), name, signal);
            if (decoded.naturalWidth !== spec.width || decoded.naturalHeight !== spec.height)
                error(`decoded dimensions differ: ${name}`);
            const image = new ImageAsset(),
                texture = new Texture2D(),
                frame = new SpriteFrame();
            texture.addRef();
            owned.push({ image, texture, frame });
            image.reset(decoded);
            texture.image = image;
            const filter = project.smooth ? Filter.LINEAR : Filter.NEAREST;
            texture.setFilters(filter, filter);
            frame.packable = false;
            frame.reset({
                texture,
                rect: new Rect(0, 0, spec.width, spec.height),
                originalSize: new Size(spec.width, spec.height),
            });
            frame.addRef();
            retained.add(frame);
            frames.set(name, frame);
        }
        if (signal?.aborted) throw new Error('AIR_E_BONE2D_ABORTED');
        if (!isValid(parent, true)) error('parent is invalid');
        for (const slot of project.slots) {
            // Flat slot order × retained bone hierarchy: allows interleaving
            // without decomposing the composed affine matrix (which can shear).
            const slotRoot = new Node(slot.id);
            slotRoot.layer = layer;
            root.addChild(slotRoot);
            let branch = slotRoot;
            const nodes = new Map<string, Node>();
            let affine: readonly [Node, Node] | undefined;
            const childOf = (parentNode: Node, name: string): Node => {
                const node = new Node(name);
                node.layer = layer;
                parentNode.addChild(node);
                return node;
            };
            if (project.affineSprites) {
                const outer = childOf(slotRoot, 'Affine');
                branch = childOf(outer, slot.bone);
                affine = [outer, branch];
            } else {
                const chain: string[] = [];
                for (let id: string | null = slot.bone; id !== null; id = lookup.get(id)!.parent) chain.unshift(id);
                for (const id of chain) {
                    branch = childOf(branch, id);
                    nodes.set(id, branch);
                }
            }
            const leaf = spriteNode(branch, 'Region', { layer });
            const sprite = leaf.getComponent(Sprite)!;
            sprite.trim = false;
            const material = slot.dark ? materialFor(slot.blend, slot.id) :
                slot.blend !== 'normal' ? materialFor(slot.blend) : null;
            if (material) sprite.customMaterial = material;
            let mesh: AirUIMesh | undefined;
            if (meshSlots.has(slot.id)) {
                const meshNode = new Node('Mesh');
                meshNode.layer = layer;
                slotRoot.addChild(meshNode);
                mesh = meshNode.addComponent(AirUIMesh);
                if (material) mesh.customMaterial = material;
                meshNode.active = false;
            }
            slots.set(slot.id, {
                mesh,
                root: slotRoot,
                bones: nodes,
                affine,
                leaf,
                sprite,
                transform: leaf.getComponent(UITransform)!,
            });
        }
        apply(sampleFor(null, 0));
        root.once(Node.EventType.NODE_DESTROYED, () => release(false));
        parent.addChild(root);
    } catch (failure) {
        release(true);
        throw failure;
    }
    let selected: string | null = null;
    let playback: Playback | null = null;
    let cursor: PlaybackCursor = { time: 0, direction: 1, first: false };
    let playing = false;
    const ensure = (): void => {
        if (disposed || !isValid(root, true)) error('player is disposed');
    };
    const begin = (id: string, options: boolean | Bone2dPlaybackOptions, fade: Transition | null): void => {
        const clip = project.clips.get(id);
        if (!clip) error(`unknown animation: ${id}`);
        const mode = makeBone2dPlayback(clip.duration, clip.play, options, error);
        const time = mode.initialDirection > 0 ? mode.lo : mode.hi;
        physics.clear();
        apply(sampleFor(id, time, 0, [], fade));
        selected = id;
        playback = mode;
        cursor = { time, direction: mode.initialDirection, first: true };
        transition = fade;
        playing = true;
    };
    const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
    const animations = Object.freeze(
        Array.from(project.clips.values(), ({ id, name, duration, play }) => Object.freeze({
            id, name, duration, play: Object.freeze({
                ...play, range: play.range ? Object.freeze([play.range[0], play.range[1]] as const) : null,
            }),
        })),
    );
    return {
        node: root,
        skeletonIndex: project.skeletonIndex,
        skeletonNames: Object.freeze(project.skeletonNames.slice()),
        skins: Object.freeze(Array.from(project.skins.values(), ({ id, name }) => Object.freeze({ id, name }))),
        setSkins(ids): void {
            ensure();
            if (!Array.isArray(ids) || ids.length > project.skins.size) error('invalid skin list');
            const next = new Set([defaultSkin]);
            for (const id of ids) {
                const skin = project.skins.get(id);
                if (!skin) error(`unknown skin: ${id}`);
                next.add(skin);
            }
            selectedSkins = Array.from(next);
            activeOverlays = selectedSkins.slice(1).map((skin) => skin.id);
            apply(sampleFor(selected, cursor.time));
        },
        getAttachmentGeometry(slotId): Bone2dAttachmentGeometry | null {
            ensure();
            const slot = slotDefinitions.get(slotId);
            if (!slot) error(`unknown slot: ${slotId}`);
            const attachment = resolveBone2dAttachment(selectedSkins, slotId, currentSample.slots.get(slotId)!.attachment);
            if (!attachment || attachment.kind === 'mesh' || attachment.kind === 'region' || attachment.kind === 'clipping') return null;
            return bone2dShapeGeometry(attachment, slot.bone, currentSample, bone2dWorldMatrices(project, currentSample), slotId);
        },
        animations,
        get time() {
            return cursor.time;
        },
        get direction() {
            return cursor.direction;
        },
        get animation() {
            return selected;
        },
        get playing() {
            return !disposed && playing;
        },
        play(id, options = false): void {
            ensure();
            begin(id, options, null);
        },
        crossfade(id, options = {}): void {
            ensure();
            if (!options || typeof options !== 'object' || Array.isArray(options)) error('invalid crossfade options');
            if (options.holdPrevious !== undefined && typeof options.holdPrevious !== 'boolean') error('invalid hold option');
            const saved = selected === null || selected === id ? 0 :
                project.mixPairs.get(selected)?.get(id) ?? project.mixDefault;
            const duration = options.duration === undefined ? saved : options.duration;
            if (!Number.isFinite(duration) || duration < 0 || duration > 10) error('invalid crossfade duration');
            let fade: Transition | null = null;
            if (duration > 0) {
                const source: Transition['source'] = transition !== null || selected === null || playback === null
                    ? { frozen: sampleBone2dFrame(project, selected, cursor.time, activeOverlays, undefined,
                        { transition: transitionFrame(transition) }, true) }
                    : { id: selected, time: cursor.time, direction: cursor.direction, lo: playback.lo, hi: playback.hi };
                fade = { source, duration, elapsed: 0, holdPrevious: options.holdPrevious ?? false };
            }
            begin(id, options.playback ?? false, fade);
        },
        setLayers(next): void {
            ensure();
            if (!Array.isArray(next) || next.length > 8) error('invalid layer list');
            const checked: Layer[] = Array.from(next, (def: Bone2dLayerOptions) => {
                if (def == null || typeof def !== 'object') error('invalid layer');
                const clip = project.clips.get(def.id);
                if (!clip) error(`unknown layer animation: ${def.id}`);
                const { weight = 1, additive = false, loop = true, time = 0 } = def;
                if (!Number.isFinite(weight) || weight < 0 || weight > 1 ||
                    typeof additive !== 'boolean' || typeof loop !== 'boolean' || !Number.isFinite(time) || time < 0) {
                    error('invalid layer options');
                }
                const length = clip.duration;
                return { id: def.id, weight, additive, loop, length,
                    time: length > 0 && loop ? time % length : Math.min(time, length),
                };
            });
            apply(sampleFor(selected, cursor.time, 0, [], transition, checked));
            layers = checked;
        },
        pause(): void {
            ensure();
            playing = false;
        },
        resume(): void {
            ensure();
            if (selected !== null) playing = true;
        },
        seek(seconds): void {
            ensure();
            if (!Number.isFinite(seconds)) error('invalid seek time');
            const time = Math.max(playback?.lo ?? 0, Math.min(seconds, playback?.hi ?? 0));
            physics.clear();
            apply(sampleFor(selected, time, 0, [], null));
            transition = null;
            cursor = { ...cursor, time, first: false };
        },
        advance(delta): readonly Bone2dMarker[] {
            ensure();
            if (!Number.isFinite(delta) || delta < 0) error('advance requires a finite nonnegative delta');
            if (!playing || selected === null || playback === null || delta === 0) return [];
            const clip = project.clips.get(selected)!;
            const next = traverseBone2dPlayback(playback, cursor, delta, error);
            const out: Bone2dMarker[] = [];
            for (const window of next.windows) {
                const hits = bone2dKeysInWindow(clip.markers, window);
                if (out.length + hits.length > playbackBudget) error('advance crosses too many markers');
                for (const k of hits) out.push(k.value);
            }
            if (next.windows.some(([from, to]) => to < from)) physics.clear();
            const spent = delta * playback.speed;
            let fade = transition;
            if (fade) {
                const elapsed = fade.elapsed + delta;
                if (elapsed >= fade.duration) fade = null;
                else {
                    const { source } = fade;
                    fade = { ...fade, elapsed, source: 'frozen' in source ? source :
                        { ...source, time: clamp(source.time + source.direction * spent, source.lo, source.hi) },
                    };
                }
            }
            const overlays = layers.map((layer) => {
                const time = layer.length === 0 ? 0 : layer.loop ?
                    (layer.time + spent % layer.length) % layer.length : Math.min(layer.time + spent, layer.length);
                return { ...layer, time };
            });
            apply(sampleFor(selected, next.cursor.time, next.elapsed, next.windows, fade, overlays));
            cursor = next.cursor;
            transition = fade;
            layers = overlays;
            if (next.stopped && !transition) playing = false;
            return out;
        },
        dispose: () => release(true),
    };
}
