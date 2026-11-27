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
import { SpriteFrame } from '../../cocos/2d/assets/sprite-frame';
import { UITransform } from '../../cocos/2d/framework/ui-transform';
import { Texture2D } from '../../cocos/asset/assets/texture-2d';
import { ImageAsset } from '../../cocos/asset/assets/image-asset';
import { Color, Rect, Size } from '../../cocos/core/math';
import { Filter } from '../../cocos/asset/assets/asset-enum';
import { isValid } from '../../cocos/core/data/object';
import { Layers } from '../../cocos/scene-graph/layers';
import { Node } from '../../cocos/scene-graph/node';
import { spriteNode } from '../ui-kit';
import { AirUIMesh } from '../ui-mesh';
import type { AirAtlasHandle } from '../assets/atlas/atlas-factory';
import { parseBone2dProject, sampleBone2dProject, bone2dWorldMatrices, bone2dMeshPositions } from './project';
import type { Bone2dImage, Bone2dMarker, Bone2dPose, Bone2dProjectOptions, Bone2dSample } from './project';

export interface AirBone2dOptions extends Bone2dProjectOptions {
    /** If specified, borrow exact-name frames instead of decoding embedded PNGs. The caller owns the atlas. */
    readonly atlas?: AirAtlasHandle;
    /** Source packing convention for rotated atlas entries; defaults to Bone-2D export. */
    readonly atlasRotation?: 'bone2d' | 'air';
    readonly layer?: number;
    readonly signal?: AbortSignal;
}
export interface AirBone2dPlayer {
    readonly node: Node;
    readonly skeletonIndex: number;
    readonly skeletonNames: readonly string[];
    readonly skins: readonly { readonly id: string; readonly name: string }[];
    /** Ordered overlays on the project's default skin (last overlay wins). */
    setSkins(ids: readonly string[]): void;
    readonly animations: readonly { readonly id: string; readonly name: string; readonly duration: number }[];
    readonly time: number;
    readonly animation: string | null;
    readonly playing: boolean;
    /** Starts a clip at zero. It will emit time-zero markers on the first positive advance. */
    play(id: string, loop?: boolean): void;
    pause(): void;
    resume(): void;
    /** Updates the pose without emitting or replaying markers. */
    seek(seconds: number): void;
    /** Advances using caller-owned scene time and returns inert marker records, not method calls. */
    advance(deltaSeconds: number): readonly Bone2dMarker[];
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
function embeddedPng(name: string, source: Bone2dImage): string {
    const url = source.dataUrl;
    if (!url || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(url)) error(`expected embedded PNG: ${name}`);
    let prefix: string;
    try {
        prefix = window.atob(url.slice(22, 54));
    } catch {
        error(`invalid PNG header: ${name}`);
    }
    if (!prefix.startsWith('\x89PNG\r\n\x1a\n\0\0\0\rIHDR')) error(`invalid PNG header: ${name}`);
    const word = (i: number): number =>
        prefix.charCodeAt(i) * 16777216 +
        prefix.charCodeAt(i + 1) * 65536 +
        prefix.charCodeAt(i + 2) * 256 +
        prefix.charCodeAt(i + 3);
    if (word(16) !== source.width || word(20) !== source.height) error(`PNG dimensions differ from project: ${name}`);
    return url;
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
    const layer = options.layer ?? Layers.Enum.UI_2D;
    const used = new Set<string>();
    const meshImages = new Set<string>();
    const meshSlots = new Set<string>();
    for (const skin of project.skins.values()) {
        for (const [slot, regions] of skin.regions)
            for (const region of regions.values()) {
                used.add(region.path);
                if (region.kind === 'mesh') {
                    meshImages.add(region.path);
                    meshSlots.add(slot);
                }
            }
    }
    if (signal?.aborted) throw new Error('AIR_E_BONE2D_ABORTED');
    const frames = new Map<string, SpriteFrame>();
    const retained = new Set<SpriteFrame>();
    const adapted = new Set<SpriteFrame>();
    const owned: { image: ImageAsset; texture: Texture2D; frame: SpriteFrame }[] = [];
    const root = new Node('Bone2D');
    root.layer = layer;
    const slots = new Map<
        string,
        { root: Node; bones: Map<string, Node>; leaf: Node; sprite: Sprite; transform: UITransform; mesh?: AirUIMesh }
    >();
    let disposed = false;
    const release = (destroyNode: boolean): void => {
        if (disposed) return;
        disposed = true;
        for (const s of slots.values()) {
            if (s.sprite.isValid) s.sprite.spriteFrame = null;
            if (s.mesh?.isValid) s.mesh.dispose();
        }
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
    const lookup = new Map(project.bones.map((bone) => [bone.id, bone] as const));
    const defaultSkin = project.skins.values().next().value!;
    let selectedSkins = [defaultSkin];
    const apply = (sample: Bone2dSample): void => {
        let world: ReturnType<typeof bone2dWorldMatrices> | null = null;
        for (let index = 0; index < sample.order.length; index++) {
            const id = sample.order[index],
                s = slots.get(id)!;
            if (s.root.getSiblingIndex() !== index) s.root.setSiblingIndex(index);
        }
        for (const def of project.slots) {
            const s = slots.get(def.id)!,
                p = sample.slots.get(def.id)!;
            let region;
            if (p.attachment !== null) {
                for (let i = selectedSkins.length - 1; i >= 0 && !region; i--) {
                    region = selectedSkins[i].regions.get(def.id)?.get(p.attachment);
                }
            }
            s.root.active = !!region;
            if (!region) {
                s.sprite.spriteFrame = null;
                if (s.mesh) s.mesh.spriteFrame = null;
                continue;
            }
            const newFrame = frames.get(region.path)!;
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
                    positions: bone2dMeshPositions(region, def.bone, world, sample.meshDeltas.get(region)),
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
            for (const [id, node] of s.bones) poseNode(node, sample.bones.get(id)!);
            poseNode(s.leaf, region.pose);
            s.transform.setContentSize(region.width, region.height);
            if (s.sprite.spriteFrame !== newFrame) s.sprite.spriteFrame = newFrame;
            tint(s.sprite);
        }
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
            if (pixels > 16 * 1024 * 1024) error('embedded image pixel budget exceeded');
            const decoded = await decode(embeddedPng(name, spec), name, signal);
            if (decoded.naturalWidth !== spec.width || decoded.naturalHeight !== spec.height)
                error(`decoded dimensions differ: ${name}`);
            const image = new ImageAsset(),
                texture = new Texture2D(),
                frame = new SpriteFrame();
            texture.addRef();
            owned.push({ image, texture, frame });
            image.reset(decoded);
            texture.image = image;
            texture.setFilters(Filter.NEAREST, Filter.NEAREST);
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
            const chain: string[] = [];
            for (let id: string | null = slot.bone; id !== null; id = lookup.get(id)!.parent) chain.unshift(id);
            let branch = slotRoot;
            const nodes = new Map<string, Node>();
            for (const id of chain) {
                const bone = new Node(id);
                bone.layer = layer;
                branch.addChild(bone);
                branch = bone;
                nodes.set(id, bone);
            }
            const leaf = spriteNode(branch, 'Region', { layer });
            const sprite = leaf.getComponent(Sprite)!;
            sprite.trim = false;
            let mesh: AirUIMesh | undefined;
            if (meshSlots.has(slot.id)) {
                const meshNode = new Node('Mesh');
                meshNode.layer = layer;
                slotRoot.addChild(meshNode);
                mesh = meshNode.addComponent(AirUIMesh);
                meshNode.active = false;
            }
            slots.set(slot.id, {
                mesh,
                root: slotRoot,
                bones: nodes,
                leaf,
                sprite,
                transform: leaf.getComponent(UITransform)!,
            });
        }
        apply(sampleBone2dProject(project, null, 0));
        root.once(Node.EventType.NODE_DESTROYED, () => release(false));
        parent.addChild(root);
    } catch (failure) {
        release(true);
        throw failure;
    }
    let selected: string | null = null,
        time = 0,
        playing = false,
        loop = false,
        first = false;
    const ensure = (): void => {
        if (disposed || !isValid(root, true)) error('player is disposed');
    };
    const animations = Object.freeze(
        Array.from(project.clips.values(), ({ id, name, duration }) => Object.freeze({ id, name, duration })),
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
            apply(sampleBone2dProject(project, selected, time));
        },
        animations,
        get time() {
            return time;
        },
        get animation() {
            return selected;
        },
        get playing() {
            return !disposed && playing;
        },
        play(id, repeat = false): void {
            ensure();
            if (!project.clips.has(id)) error(`unknown animation: ${id}`);
            apply(sampleBone2dProject(project, id, 0));
            selected = id;
            time = 0;
            playing = true;
            loop = repeat;
            first = true;
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
            time = Math.max(0, Math.min(seconds, selected === null ? 0 : project.clips.get(selected)!.duration));
            apply(sampleBone2dProject(project, selected, time));
            first = false;
        },
        advance(delta): readonly Bone2dMarker[] {
            ensure();
            if (!Number.isFinite(delta) || delta < 0) error('advance requires a finite nonnegative delta');
            if (!playing || selected === null || delta === 0) return [];
            const clip = project.clips.get(selected)!;
            const end = time + delta,
                d = clip.duration;
            const wraps = loop && d > 0 ? Math.floor(end / d) : 0;
            if (!Number.isSafeInteger(wraps) || (clip.markers.length > 0 && wraps > 8192 / clip.markers.length)) {
                error('advance crosses too many marker loops');
            }
            const to = wraps > 0 ? Math.max(0, end - wraps * d) : Math.min(d, end);
            const out: Bone2dMarker[] = [];
            const emit = (from: number, through: number): void => {
                for (const k of clip.markers) if (k.time > from && k.time <= through) out.push(k.value);
            };
            const start = first ? -1 : time;
            if (wraps > 0 && clip.markers.length > 0) {
                emit(start, d);
                for (let i = 1; i < wraps; ++i) emit(-1, d);
                emit(-1, to);
            } else emit(start, to);
            apply(sampleBone2dProject(project, selected, to));
            first = false;
            time = to;
            if (d === 0 || (!loop && time >= d)) playing = false;
            return out;
        },
        dispose: () => release(true),
    };
}
