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
import { buildBone2dAtlasMesh, projectBone2dAtlasMesh } from './mesh-atlas';
import type { Bone2dAtlasCrop } from './mesh-atlas';
import type { AirAtlasHandle } from '../assets/atlas/atlas-factory';
import { factorBone2dBasis } from './affine';
import { convexClipOutline, hasNonCollinearPoints } from './polygon';
import type { Bone2dPhysicsState, PhysicsStep } from './physics';
import { bone2dKeysInWindow, makeBone2dPlayback, playbackBudget, traverseBone2dPlayback } from './playback';
import type { Bone2dPlaybackOptions, Bone2dSavedPlayback, Playback, PlaybackCursor } from './playback';
import { parseBone2dProject, sampleBone2dFrame, bone2dWorldMatrices, bone2dMeshPositions, bone2dPicture, resolveBone2dAttachment, bone2dShapeGeometry } from './project';
import type { Bone2dAttachmentGeometry, Bone2dBlend, Bone2dClipAttachment, Bone2dImage, Bone2dMarker, Bone2dMesh, Bone2dPose, Bone2dProjectOptions, Bone2dSample } from './project';

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
type QueuedClip = { id: string; options: Bone2dCrossfadeOptions };
type Layer = Required<Bone2dLayerOptions> & { length: number };
type Transition = {
    source: { id: string; time: number; direction: 1 | -1; lo: number; hi: number; playback?: Playback; cursor?: PlaybackCursor } | { frozen: Bone2dSample };
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
    /** Crossfade the native preview bones, or the full continuous pose for Web Game data. */
    crossfade(id: string, options?: Bone2dCrossfadeOptions): void;
    /** Queue a transition at the next natural end or loop-round boundary. */
    playNext(id: string, options?: Bone2dCrossfadeOptions): void;
    /** Invoked after pose application, once per natural non-looping end. */
    onEnd: ((id: string) => void) | null;
    /** Replaces the ordered preview layers and resets their clocks to the supplied times. */
    setLayers(layers: readonly Bone2dLayerOptions[]): void;
    pause(): void;
    resume(): void;
    /** Updates the pose without emitting or replaying markers. */
    seek(seconds: number): void;
    /** Advances using caller-owned scene time and returns inert marker records, not method calls. */
    advance(deltaSeconds: number): readonly Bone2dMarker[];
    /** Override this slot by attachment ID; null hides it and undefined restores animation. */
    setAttachment(slotId: string, attachment: string | null | undefined): void;
    /** Solved bone placement in player-root coordinates, or null for missing/inactive bones. */
    bone(id: string): { x: number; y: number; rotation: number; length: number } | null;
    /** Hold a Web Game bone's position in player-root coordinates while still solving constraints. */
    moveBone(id: string, x: number, y: number): void;
    releaseBone(id: string): void;
    /** Current picture geometry bounds in player-root coordinates, before clipping and tint. */
    bounds(): { x: number; y: number; width: number; height: number } | null;
    resetPhysics(): void;
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
    for (const skin of project.skins.values()) {
        for (const regions of skin.regions.values())
            for (const region of regions.values()) {
                if (region.kind !== 'mesh' && region.kind !== 'region') continue;
                for (const name of region.sequence?.frames ?? [region.path]) {
                    used.add(name);
                }
            }
    }
    if (signal?.aborted) throw new Error('AIR_E_BONE2D_ABORTED');
    const frames = new Map<string, SpriteFrame>();
    const premultiplied = new Set<SpriteFrame>();
    const crops = new Map<SpriteFrame, { polygon: Bone2dAtlasCrop; uvClamp: Vec4 }>();
    const meshPlans = new WeakMap<Bone2dMesh, WeakMap<SpriteFrame, ReturnType<typeof buildBone2dAtlasMesh>>>();
    const disableMesh = (mesh: AirUIMesh): void => {
        if (!mesh.node.active) return;
        mesh.node.active = false;
        mesh.spriteFrame = null;
        mesh.clear();
    };
    const retained = new Set<SpriteFrame>();
    const blendMaterials = new Map<Bone2dBlend, Material>();
    let tintEffect: EffectAsset | undefined;
    const atlasEffects = new Map<number, EffectAsset>();
    const atlasMaterials = new Map<string, { material: Material; crop: Vec4 | null; dark: Vec4 }>();
    const tintedSlots = new Map<string, { material: Material; values: Vec4 }>();
    const materialFor = (mode: Bone2dBlend, effect?: EffectAsset): Material => {
        const material = new Material();
        const colorSrc = mode === 'multiply' ? BlendFactor.DST_COLOR :
            mode === 'screen' ? BlendFactor.ONE : BlendFactor.SRC_ALPHA;
        const colorDst = mode === 'additive' ? BlendFactor.ONE :
            mode === 'screen' ? BlendFactor.ONE_MINUS_SRC_COLOR : BlendFactor.ONE_MINUS_SRC_ALPHA;
        material.initialize({
            ...(effect ? { effectAsset: effect } : { effectName: 'builtin-sprite' }),
            defines: { USE_TEXTURE: true, USE_ALPHA_TEST: false, CC_USE_EMBEDDED_ALPHA: false },
            states: { blendState: { targets: [{
                blend: true, blendEq: BlendOp.ADD, blendAlphaEq: BlendOp.ADD,
                blendSrc: colorSrc, blendDst: colorDst, blendSrcAlpha: BlendFactor.ONE,
                blendDstAlpha: mode === 'additive' ? BlendFactor.ONE : BlendFactor.ONE_MINUS_SRC_ALPHA,
            }] } },
        });
        return material;
    };
    const materialForFrame = (
        slot: string,
        mode: Bone2dBlend,
        base: Material | null,
        frame: SpriteFrame,
        dark: Vec4 | undefined,
        crop?: Vec4,
    ): Material | null => {
        const pma = premultiplied.has(frame);
        if (!crop && !pma) return base;
        const flag = (crop ? 1 : 0) | (pma ? 2 : 0);
        const key = `${flag}:${slot}`;
        let entry = atlasMaterials.get(key);
        if (!entry) {
            let effect = atlasEffects.get(flag);
            if (!effect) {
                effect = createBone2dTintEffect(!!crop, pma);
                atlasEffects.set(flag, effect);
            }
            entry = { material: materialFor(mode, effect), crop: null, dark: new Vec4() };
            atlasMaterials.set(key, entry);
        }
        if (crop && entry.crop !== crop) {
            entry.crop = crop;
            entry.material.setProperty('bone2dCrop', crop);
        }
        if (dark && (dark.x !== entry.dark.x || dark.y !== entry.dark.y || dark.z !== entry.dark.z)) {
            entry.dark.set(dark);
            entry.material.setProperty('bone2dDark', dark);
        }
        return entry.material;
    };
    const adapted = new Set<SpriteFrame>();
    const owned: { image: ImageAsset; texture: Texture2D; frame: SpriteFrame }[] = [];
    const root = new Node('Bone2D');
    root.layer = layer;
    const slots = new Map<
        string,
        { root: Node; bones: Map<string, Node>; affine?: readonly [Node, Node]; leaf: Node; sprite: Sprite; transform: UITransform; meshes: AirUIMesh[]; meshMaterial: Material | null }
    >();
    const masks = new Map<string, { node: Node; mask: Mask; graphics: Graphics; outline: number[] }>();
    let disposed = false;
    const release = (destroyNode: boolean): void => {
        if (disposed) return;
        disposed = true;
        for (const s of slots.values()) {
            if (s.sprite.isValid) s.sprite.spriteFrame = null;
            for (const mesh of s.meshes) if (mesh.isValid) mesh.dispose();
        }
        for (const { node } of masks.values()) if (node.parent !== root && isValid(node, true)) node.destroy();
        masks.clear();
        for (const material of blendMaterials.values()) material.destroy();
        blendMaterials.clear();
        for (const { material } of tintedSlots.values()) material.destroy();
        tintedSlots.clear();
        tintEffect?.destroy();
        for (const { material } of atlasMaterials.values()) material.destroy();
        atlasMaterials.clear();
        for (const effect of atlasEffects.values()) effect.destroy();
        atlasEffects.clear();
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
        crops.clear();
        premultiplied.clear();
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
    const attachments = new Map<string, string | null>();
    const heldPositions = new Map<string, readonly [number, number]>();
    const controls = { attachments, heldPositions };
    const hasPhysics = [...project.constraints.values()].some((c) => c.kind === 'physics');
    let transition: Transition | null = null;
    let layers: readonly Layer[] = [];
    const transitionFrame = (value: Transition | null) => {
        if (!value) return undefined;
        const source = value.source;
        const from = 'frozen' in source ? source.frozen :
            sampleBone2dFrame(project, source.id, source.time, activeOverlays, undefined, undefined, true);
        return { from, alpha: value.elapsed / value.duration, holdPrevious: value.holdPrevious,
            ...(project.source === 'web-game' ? { game: from } : {}) };
    };
    const sampleFor = (clip: string | null, time: number, seconds = 0, intervals: PhysicsStep['intervals'] = [],
        mixing = transition, overlays = layers): Bone2dSample =>
        sampleBone2dFrame(project, clip, time, activeOverlays, hasPhysics ? { state: physics, seconds, intervals } : undefined,
            mixing || overlays.length ? { transition: transitionFrame(mixing), layers: overlays } : undefined,
            false, attachments.size || heldPositions.size ? controls : undefined,
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
                for (const mesh of s.meshes) disableMesh(mesh);
                continue;
            }
            const newFrame = frames.get(bone2dPicture(region, sample, def.id))!;
            let dark: Vec4 | undefined;
            if (p.dark) {
                const { material, values } = tintedSlots.get(def.id)!;
                if (p.dark[0] !== values.x || p.dark[1] !== values.y || p.dark[2] !== values.z) {
                    values.set(p.dark[0], p.dark[1], p.dark[2], 0);
                    material.setProperty('bone2dDark', values);
                }
                dark = values;
            }
            const c = p.color.map((v, i) => Math.round(255 * v * region.color[i]));
            const tint = (renderer: Sprite | AirUIMesh): void => {
                const { r, g, b, a } = renderer.color;
                if (r !== c[0] || g !== c[1] || b !== c[2] || a !== c[3])
                    renderer.color = new Color(c[0], c[1], c[2], c[3]);
            };
            if (region.kind === 'mesh') {
                s.sprite.spriteFrame = null;
                world ??= bone2dWorldMatrices(project, sample);
                const crop = crops.get(newFrame);
                let chunks: ReturnType<typeof buildBone2dAtlasMesh> | undefined;
                if (crop) {
                    let byFrame = meshPlans.get(region);
                    if (!byFrame) meshPlans.set(region, byFrame = new WeakMap());
                    chunks = byFrame.get(newFrame);
                    if (!chunks) {
                        chunks = buildBone2dAtlasMesh(region.uvs, region.indices, crop.polygon);
                        byFrame.set(newFrame, chunks);
                    }
                }
                const count = chunks?.length ?? 1;
                if (count) {
                    const material = materialForFrame(def.id, def.blend, s.meshMaterial, newFrame, dark, crop?.uvClamp);
                    const positions = bone2dMeshPositions(
                        region, def.bone, world,
                        sample.slotDeform ? sample.slotDeform.get(def.id) : sample.meshDeltas.get(region.deformParent ?? region),
                    );
                    for (let i = 0; i < count; i++) {
                        let mesh = s.meshes[i];
                        if (!mesh) {
                            const node = new Node('Mesh');
                            node.layer = layer;
                            node.active = false;
                            s.root.addChild(node);
                            mesh = node.addComponent(AirUIMesh);
                            s.meshes.push(mesh);
                        }
                        if (mesh.customMaterial !== material) mesh.customMaterial = material;
                        if (mesh.spriteFrame !== newFrame) mesh.spriteFrame = newFrame;
                        mesh.setGeometry(chunks ? projectBone2dAtlasMesh(chunks[i], positions) : {
                            positions, uvs: region.uvs, indices: region.indices,
                        });
                        tint(mesh);
                        mesh.node.active = true;
                    }
                }
                for (let i = count; i < s.meshes.length; i++) disableMesh(s.meshes[i]);
                continue;
            }
            for (const mesh of s.meshes) disableMesh(mesh);
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
            const material = materialForFrame(def.id, def.blend, s.meshMaterial, newFrame, dark);
            if (s.sprite.customMaterial !== material) s.sprite.customMaterial = material;
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
                const { width, height } = frame.rect;
                const left = frame.offset.x + (spec.width - width) / 2;
                const bottom = frame.offset.y + (spec.height - height) / 2;
                if (width <= 0 || height <= 0 || left < 0 || bottom < 0 || left + width > spec.width || bottom + height > spec.height)
                    error(`atlas trim lies outside the original image: ${name}`);
                if (!retained.has(frame)) {
                    frame.addRef();
                    retained.add(frame);
                }
                const trim = width !== spec.width || height !== spec.height;
                const reverse = frame.rotated && (options.atlasRotation ?? 'bone2d') === 'bone2d';
                const pageIndex = atlas.document.getRegion(name)?.pageIndex;
                const pma = pageIndex !== undefined && atlas.document.pages[pageIndex]?.pma === true;
                const selected = reverse || trim || pma ? frame.clone() : frame;
                if (pma) premultiplied.add(selected);
                if (selected !== frame) {
                    // Crop shader bounds address this fixed atlas page. Do not
                    // dynamically repack the clone or mutate the borrowed frame.
                    selected.packable = false;
                    if (reverse) {
                        selected.flipUVX = !frame.flipUVX;
                        selected.flipUVY = !frame.flipUVY;
                    }
                    adapted.add(selected);
                }
                frames.set(name, selected);
                if (trim) {
                    const { x, y } = frame.rect;
                    const packedW = frame.rotated ? height : width, packedH = frame.rotated ? width : height;
                    const tw = frame.texture.width, th = frame.texture.height;
                    crops.set(selected, {
                        polygon: [left / spec.width, bottom / spec.height,
                            (left + width) / spec.width, (bottom + height) / spec.height],
                        // A multisampled edge can shade at a pixel center outside
                        // its triangle. Clamp at texel centers in the fragment,
                        // not at vertices where interpolation can extrapolate.
                        uvClamp: new Vec4((x + 0.5) / tw, (y + 0.5) / th,
                            (x + packedW - 0.5) / tw, (y + packedH - 0.5) / th),
                    });
                }
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
            const filter = project.smooth ? Filter.LINEAR : Filter.NEAREST;
            texture.setFilters(filter, filter);
            if (project.source === 'web-game' && project.smooth) texture.setMipFilter(Filter.LINEAR);
            texture.image = image;
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
            if (project.affineSprites || project.source === 'web-game') {
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
            let material: Material | null = null;
            if (slot.dark) {
                tintEffect ??= createBone2dTintEffect();
                material = materialFor(slot.blend, tintEffect);
                tintedSlots.set(slot.id, { material, values: new Vec4(-1, -1, -1, 0) });
            } else if (slot.blend !== 'normal') {
                material = blendMaterials.get(slot.blend) ?? materialFor(slot.blend);
                blendMaterials.set(slot.blend, material);
            }
            slots.set(slot.id, {
                meshes: [],
                meshMaterial: material,
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
    let finished = false;
    const queue: QueuedClip[] = [];
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
        finished = false;
    };
    const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
    const animations = Object.freeze(
        Array.from(project.clips.values(), ({ id, name, duration, play }) => Object.freeze({
            id, name, duration, play: Object.freeze({
                ...play, range: play.range ? Object.freeze([play.range[0], play.range[1]] as const) : null,
            }),
        })),
    );
    const fadeOptions = (id: string, options: Bone2dCrossfadeOptions) => {
        if (!options || typeof options !== 'object' || Array.isArray(options)) error('invalid crossfade options');
        if (options.holdPrevious !== undefined && typeof options.holdPrevious !== 'boolean') error('invalid hold option');
        const clip = project.clips.get(id);
        if (!clip) error(`unknown animation: ${id}`);
        const mode = options.playback ?? (project.source === 'web-game' ? { useSavedSettings: true } : false);
        makeBone2dPlayback(clip.duration, clip.play, mode, error);
        const saved = selected === null ? 0 :
            project.source === 'web-game' ? 0.2 :
                selected === id ? 0 : project.mixPairs.get(selected)?.get(id) ?? project.mixDefault;
        const duration = options.duration === undefined ? saved : options.duration;
        if (!Number.isFinite(duration) || duration < 0 || duration > 10) error('invalid crossfade duration');
        return { mode, duration };
    };
    const crossfadeTo = (id: string, options: Bone2dCrossfadeOptions): void => {
        const { mode, duration } = fadeOptions(id, options);
        let fade: Transition | null = null;
        if (duration > 0) {
            const source: Transition['source'] = transition !== null || selected === null || playback === null
                ? { frozen: sampleBone2dFrame(project, selected, cursor.time, activeOverlays, undefined,
                    { transition: transitionFrame(transition) }, true) }
                : { id: selected, time: cursor.time, direction: cursor.direction, lo: playback.lo, hi: playback.hi,
                    ...(project.source === 'web-game' ? { playback, cursor } : {}) };
            fade = { source, duration, elapsed: 0, holdPrevious: options.holdPrevious ?? false };
        }
        begin(id, mode, fade);
    };
    const player: AirBone2dPlayer = {
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
        setAttachment(slotId, name): void {
            ensure();
            if (!slotDefinitions.has(slotId)) error(`unknown slot: ${slotId}`);
            if (name !== undefined && name !== null &&
                (typeof name !== 'string' || ![...project.skins.values()].some((skin) =>
                    resolveBone2dAttachment([skin], slotId, name)))) error(`unknown attachment: ${name}`);
            if (name === undefined) attachments.delete(slotId);
            else attachments.set(slotId, name);
            apply(sampleFor(selected, cursor.time));
        },
        bone(id) {
            ensure();
            if (!currentSample.activeBones.has(id)) return null;
            const [a, , c, , x, y] = bone2dWorldMatrices(project, currentSample).get(id)!;
            return { x, y, rotation: Math.atan2(c, a) * 180 / Math.PI, length: Math.hypot(a, c) * lookup.get(id)!.length };
        },
        moveBone(id, x, y): void {
            ensure();
            if (project.source !== 'web-game') error('bone holds require Web Game data');
            if (!lookup.has(id)) error(`unknown bone: ${id}`);
            if (!Number.isFinite(x) || !Number.isFinite(y)) error('invalid bone position');
            heldPositions.set(id, [x, y]);
            apply(sampleFor(selected, cursor.time));
        },
        releaseBone(id): void {
            ensure();
            if (heldPositions.delete(id)) apply(sampleFor(selected, cursor.time));
        },
        resetPhysics(): void {
            ensure();
            physics.clear();
            apply(sampleFor(selected, cursor.time));
        },
        bounds() {
            ensure();
            const world = bone2dWorldMatrices(project, currentSample);
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const include = (x: number, y: number): void => {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            };
            for (const def of project.slots) {
                if (!currentSample.activeBones.has(def.bone)) continue;
                const name = currentSample.slots.get(def.id)!.attachment;
                const art = resolveBone2dAttachment(selectedSkins, def.id, name);
                if (art?.kind === 'mesh') {
                    const points = bone2dMeshPositions(art, def.bone, world,
                        currentSample.slotDeform ? currentSample.slotDeform.get(def.id) :
                            currentSample.meshDeltas.get(art.deformParent ?? art));
                    for (let i = 0; i < points.length; i += 2) include(points[i], points[i + 1]);
                } else if (art?.kind === 'region') {
                    const [x, y, rotation, sx, sy] = art.pose;
                    const t = rotation * Math.PI / 180, cos = Math.cos(t), sin = Math.sin(t);
                    const [a, b, c, d, ox, oy] = world.get(def.bone)!;
                    for (const dx of [-art.width * sx / 2, art.width * sx / 2]) {
                        for (const dy of [-art.height * sy / 2, art.height * sy / 2]) {
                            const px = x + cos * dx - sin * dy, py = y + sin * dx + cos * dy;
                            include(a * px + b * py + ox, c * px + d * py + oy);
                        }
                    }
                }
            }
            return Number.isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
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
            queue.length = 0;
        },
        crossfade(id, options = {}): void {
            ensure();
            crossfadeTo(id, options);
            queue.length = 0;
        },
        playNext(id, options = {}): void {
            ensure();
            fadeOptions(id, options);
            if (selected === null || finished) {
                crossfadeTo(id, options);
                return;
            }
            if (queue.length >= 32) error('playback queue is full');
            const { playback, ...settings } = options;
            const snapshot = typeof playback !== 'object' || playback === null
                ? playback
                : { ...playback, range: playback.range ? [playback.range[0], playback.range[1]] as const : playback.range };
            queue.push({ id, options: { ...settings, playback: snapshot } });
        },
        onEnd: null,
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
            if (selected !== null && !finished) playing = true;
        },
        seek(seconds): void {
            ensure();
            if (!Number.isFinite(seconds)) error('invalid seek time');
            const time = Math.max(playback?.lo ?? 0, Math.min(seconds, playback?.hi ?? 0));
            physics.clear();
            apply(sampleFor(selected, time, 0, [], null));
            transition = null;
            cursor = { time, direction: cursor.direction, first: false };
            if (finished && playback && time !== (cursor.direction > 0 ? playback.hi : playback.lo)) finished = false;
        },
        advance(delta): readonly Bone2dMarker[] {
            ensure();
            if (!Number.isFinite(delta) || delta < 0) error('advance requires a finite nonnegative delta');
            if (!playing || selected === null || playback === null || delta === 0) return [];
            const out: Bone2dMarker[] = [];
            const ended: string[] = [];
            const collect = (id: string, window: Parameters<typeof bone2dKeysInWindow>[1]): void => {
                const hits = bone2dKeysInWindow(project.clips.get(id)!.markers, window);
                if (out.length + hits.length > playbackBudget) error('advance crosses too many markers');
                for (const k of hits) out.push(k.value);
            };
            let remaining = delta;
            // Each immediate handoff removes one bounded queue entry.
            while (playing && selected !== null && playback !== null && remaining > 0) {
                const next = traverseBone2dPlayback(playback, cursor, remaining, error, queue.length > 0);
                for (const window of next.windows) collect(selected, window);
                if (next.windows.some(([from, to]) => to < from)) physics.clear();
                const handoff = next.roundEnded && queue.length > 0;
                const tick = handoff ? Math.min(remaining, next.elapsed / playback.speed) : remaining;
                const spent = tick * playback.speed;
                let fade = transition;
                if (fade) {
                    const elapsed = fade.elapsed + tick;
                    if (elapsed >= fade.duration) fade = null;
                    else {
                        const { source } = fade;
                        if ('frozen' in source) fade = { ...fade, elapsed };
                        else if (source.playback && source.cursor) {
                            const { cursor } = traverseBone2dPlayback(source.playback, source.cursor, tick, error);
                            fade = { ...fade, elapsed, source: { ...source, time: cursor.time, cursor } };
                        } else {
                            fade = { ...fade, elapsed, source: {
                                ...source, time: clamp(source.time + source.direction * spent, source.lo, source.hi),
                            } };
                        }
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
                if (next.stopped && !finished) {
                    if (!playback.loop) ended.push(selected);
                    finished = true;
                }
                if (handoff) {
                    const upcoming = queue.shift()!;
                    crossfadeTo(upcoming.id, upcoming.options);
                    remaining = Math.max(0, remaining - tick);
                    if (remaining <= Number.EPSILON * 8 * Math.max(1, delta)) {
                        collect(upcoming.id, [cursor.time, cursor.time, true]);
                        cursor = { ...cursor, first: false };
                        break;
                    }
                } else {
                    if (next.stopped && !transition) playing = false;
                    break;
                }
            }
            const end = player.onEnd;
            for (const id of ended) end?.(id);
            return out;
        },
        dispose: () => release(true),
    };
    return player;
}
