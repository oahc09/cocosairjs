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
import { inheritBasis, poseBasis } from './affine';
import type { Bone2dInheritance, Matrix2D, Shears } from './affine';
import { aimBone2d, aimBone2dPair } from './ik';
import type { Bone2dAimOptions } from './ik';
import { transformApplied, transformProperties, transformReadLocal, transformReadWorld, transformWriteLocal, transformWriteWorld } from './transform';
import type { AppliedPose, Bone2dTransform, TransformProperty } from './transform';

/** Strict reader for the supported subset of Bone-2D Save Project v1. No editor or Spine dependency. */
type Obj = Record<string, unknown>;
export type Bone2dPose = readonly [number, number, number, number, number];
type RGB = readonly [number, number, number];
type RGBA = readonly [number, number, number, number];
interface PictureSequence {
    readonly frames: readonly string[];
    readonly setup: number;
}
const sequenceModes = ['hold', 'once', 'loop', 'pingpong', 'onceReverse', 'loopReverse', 'pingpongReverse'] as const;
type SequenceKey = { mode: typeof sequenceModes[number]; index: number; delay: number };

export interface Bone2dRegion {
    kind: 'region';
    path: string;
    sequence?: PictureSequence;
    pose: Bone2dPose;
    width: number;
    height: number;
    color: RGBA;
}
type Influence = readonly [bone: string, x: number, y: number, weight: number];
export interface Bone2dMesh {
    kind: 'mesh';
    path: string;
    sequence?: PictureSequence;
    color: RGBA;
    readonly xy: readonly number[];
    readonly uvs: readonly number[];
    readonly indices: readonly number[];
    readonly weights: readonly (readonly Influence[])[] | null;
    readonly deformSize: number;
    readonly link?: {
        readonly source: string;
        readonly slot: string | null;
        readonly skin: string | null;
        readonly deform: boolean;
    };
    readonly deformParent?: Bone2dMesh;
}
type Visual = Bone2dRegion | Bone2dMesh;
type Positioned = Pick<Bone2dMesh, 'xy' | 'weights' | 'deformSize'>;
type PointAttachment = { kind: 'point'; x: number; y: number; rotation: number };
type BoundsAttachment = Positioned & { kind: 'boundingbox' };
type PathAttachment = Positioned & { kind: 'path'; closed: boolean; constantSpeed: boolean };
export type Bone2dClipAttachment = Positioned & {
    kind: 'clipping'; end: string | null; convex: boolean; inverse: boolean;
};
type Shape = PointAttachment | BoundsAttachment | PathAttachment;
type PolygonAttachment = BoundsAttachment | PathAttachment | Bone2dClipAttachment;
type VertexAttachment = Bone2dMesh | PolygonAttachment;
type Attachment = Visual | Shape | Bone2dClipAttachment;
/** The active non-rendering attachment in player-root coordinates. XY lists are packed. */
export type Bone2dAttachmentGeometry =
    | { readonly kind: 'point'; readonly x: number; readonly y: number; readonly rotation: number }
    | { readonly kind: 'boundingbox'; readonly vertices: readonly number[] }
    | { readonly kind: 'path'; readonly vertices: readonly number[]; readonly closed: boolean; readonly constantSpeed: boolean };

interface Bone {
    id: string;
    parent: string | null;
    pose: Bone2dPose;
    shear: Shears;
    inherit: Bone2dInheritance;
    skinRequired: boolean;
    length: number;
}
export type Bone2dBlend = 'normal' | 'additive' | 'multiply' | 'screen';
interface Slot {
    blend: Bone2dBlend;
    dark: RGB | null;
    id: string;
    bone: string;
    attachment: string | null;
    color: RGBA;
}
interface AimConstraint extends Bone2dAimOptions {
    kind: 'ik';
    id: string;
    bone: string;
    child: string | null;
    target: string;
    skinRequired: boolean;
}
type AimKey = ValueKey & Pick<Bone2dAimOptions, 'compress' | 'stretch' | 'bendPositive'>;
interface Skin {
    id: string;
    name: string;
    bones: readonly string[];
    constraints: readonly string[];
    regions: ReadonlyMap<string, ReadonlyMap<string, Attachment>>;
}
export interface Bone2dProjectOptions {
    /** Zero-based editor skeleton order. The saved active skeleton is the default. */
    readonly skeletonIndex?: number;
}
interface Folder {
    id: string;
    members: readonly string[];
}
interface Key<T> {
    time: number;
    value: T;
}
interface ValueKey extends Key<number[]> {
    curve: 'linear' | 'stepped' | number[][];
}
interface Clip {
    id: string;
    name: string;
    duration: number;
    bones: ReadonlyMap<string, ReadonlyMap<string, ValueKey[]>>;
    slots: ReadonlyMap<string, { attachment: Key<string | null>[]; rgba: ValueKey[]; rgba2: ValueKey[] }>;
    order: Key<string[]>[];
    folderOrder: ReadonlyMap<string, Key<string[]>[]>;
    deform: ReadonlyMap<VertexAttachment, ValueKey[]>;
    sequences: ReadonlyMap<Visual, Key<SequenceKey>[]>;
    markers: Key<Bone2dMarker>[];
    ik: ReadonlyMap<string, AimKey[]>;
    transform: ReadonlyMap<string, ValueKey[]>;
}
export interface Bone2dMarker {
    readonly id: string;
    readonly name: string;
    readonly time: number;
    readonly int: number;
    readonly float: number;
    readonly string: string;
}
export interface Bone2dImage {
    readonly width: number;
    readonly height: number;
    readonly dataUrl?: string;
}
export interface Bone2dProject {
    readonly skeletonIndex: number;
    readonly skeletonNames: readonly string[];
    readonly skins: ReadonlyMap<string, Skin>;
    readonly folders: ReadonlyMap<string, Folder>;
    readonly bones: readonly Bone[];
    readonly affineSprites: boolean;
    readonly constraints: ReadonlyMap<string, AimConstraint | Bone2dTransform>;
    readonly slots: readonly Slot[];
    readonly clips: ReadonlyMap<string, Clip>;
    readonly images: ReadonlyMap<string, Bone2dImage>;
}
export interface Bone2dSlotPose {
    readonly attachment: string | null;
    readonly color: RGBA;
    readonly dark: RGB | null;
}
export interface Bone2dSample {
    readonly bones: ReadonlyMap<string, Bone2dPose>;
    readonly shears: ReadonlyMap<string, Shears>;
    readonly activeBones: ReadonlySet<string>;
    readonly ik: ReadonlyMap<string, Bone2dAimOptions>;
    readonly transforms: ReadonlyMap<string, readonly number[]>;
    readonly slots: ReadonlyMap<string, Bone2dSlotPose>;
    readonly order: readonly string[];
    readonly sequenceFrames: ReadonlyMap<Visual, number>;
    readonly shapeDeltas: ReadonlyMap<PolygonAttachment, readonly number[]>;
    readonly meshDeltas: ReadonlyMap<Bone2dMesh, readonly number[]>;
}

function fail(detail: string, unsupported = false): never {
    const code = unsupported ? 'AIR_E_BONE2D_UNSUPPORTED' : 'AIR_E_BONE2D_FORMAT';
    throw Object.assign(new Error(`${code}: ${detail}`), { code });
}
function obj(x: unknown, label: string): Obj {
    if (!x || typeof x !== 'object' || Array.isArray(x)) fail(label);
    return x as Obj;
}
function entries(x: unknown, label: string): [string, unknown][] {
    return Object.entries(obj(x ?? {}, label));
}
function list(x: unknown, max: number, label: string): unknown[] {
    if (!Array.isArray(x) || x.length > max) fail(label);
    return x;
}
function str(x: unknown, label: string): string {
    if (typeof x !== 'string' || !x || x.length > 512) fail(label);
    return x;
}
function num(x: unknown, label: string, min = -1000000, max = 1000000): number {
    if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max) fail(label);
    return x;
}
function integer(x: unknown, label: string, min: number, max: number): number {
    const v = num(x, label, min, max);
    if (!Number.isInteger(v)) fail(label);
    return v;
}
function pictureSequence(raw: unknown, path: string, images: ReadonlyMap<string, Bone2dImage>): PictureSequence | undefined {
    if (raw == null) return undefined;
    const sequence = obj(raw, 'picture sequence');
    const count = integer(sequence.count, 'sequence count', 1, images.size);
    const start = integer(sequence.start, 'sequence start', 0, 1000000);
    const digits = integer(sequence.digits, 'sequence digits', 0, 9);
    const setup = integer(sequence.setupIndex, 'sequence setup', 0, count - 1);
    const frames = Array.from({ length: count }, (_, i) => path + String(start + i).padStart(digits, '0'));
    for (const name of frames) if (!images.has(name)) fail(`unknown sequence image: ${name}`);
    return { frames, setup };
}
export function bone2dPicture(visual: Visual, sample: Bone2dSample): string {
    const sequence = visual.sequence;
    return sequence ? sequence.frames[sample.sequenceFrames.get(visual) ?? sequence.setup] : visual.path;
}
function optionalStr(x: unknown, label: string): string | null {
    return x == null ? null : str(x, label);
}
// Editor-only visibility, locks, play ranges and comments are intentionally not runtime state.
function none(x: unknown, label: string): void {
    if (x != null && (Array.isArray(x) ? x.length > 0 : entries(x, label).length > 0)) fail(label, true);
}
function pose(o: Obj, label: string): Bone2dPose {
    return [
        num(o.x, label),
        num(o.y, label),
        num(o.rotation, label),
        num(o.scaleX, label, -32, 32),
        num(o.scaleY, label, -32, 32),
    ];
}
function color(x: unknown, label: string): RGBA {
    const a = list(x, 4, label);
    if (a.length !== 4) fail(label);
    return a.map((v) => num(v, label, 0, 1)) as unknown as RGBA;
}
function index<T extends { id: string }>(items: readonly T[], label: string): Map<string, T> {
    const out = new Map<string, T>();
    for (const i of items) {
        if (out.has(i.id)) fail(label);
        out.set(i.id, i);
    }
    return out;
}
function keys<T>(x: unknown, maxTime: number, label: string, fn: (o: Obj, time: number) => T, ties = false): Key<T>[] {
    let previous = -1;
    return list(x ?? [], 4096, label).map((raw) => {
        const o = obj(raw, label);
        const time = num(o.time, label, 0, maxTime);
        if (time < previous || (!ties && time === previous)) fail(`${label}: non-increasing time`);
        previous = time;
        return { time, value: fn(o, time) };
    });
}
function values(x: unknown, count: number, end: number, label: string, shared = false): ValueKey[] {
    // Evaluate the same ten t-intervals as the editor. Store the sampled
    // polyline per channel once; playback inverts the x-axis in that table.
    return keys(x, end, label, (o) => {
        const v = list(o.value, count, label);
        if (v.length !== count) fail(label);
        let curve: ValueKey['curve'] = 'linear';
        if (o.curve === 'stepped') curve = 'stepped';
        else if (o.curve !== undefined) {
            const groups = shared ? 1 : count;
            const control = list(o.curve, 4 * groups, label);
            if (control.length !== 4 * groups) fail(label);
            curve = Array.from({ length: groups }, (_, channel) => {
                const [x1, y1, x2, y2] = control
                    .slice(channel * 4, channel * 4 + 4)
                    .map((n, i) => num(n, label, i % 2 ? -10 : 0, i % 2 ? 10 : 1));
                const poly = [0, 0];
                for (let i = 1; i < 10; ++i) {
                    const t = i / 10;
                    const a = 3 * t * (1 - t) * (1 - t),
                        b = 3 * t * t * (1 - t),
                        c = t * t * t;
                    poly.push(a * x1 + b * x2 + c, a * y1 + b * y2 + c);
                }
                poly.push(1, 1);
                return poly;
            });
        }
        return { value: v.map((n) => num(n, label)), curve };
    }).map(({ time, value }) => ({ time, ...value }));
}

const channels = new Map([
    ['shear', 2], ['shearx', 1], ['sheary', 1],
    ['rotate', 1],
    ['translate', 2],
    ['translatex', 1],
    ['translatey', 1],
    ['scale', 2],
    ['scalex', 1],
    ['scaley', 1],
]);

/** Parse the native editor file (JSON, not the optional ZIP container). Reject unsupported rendering semantics. */
export function parseBone2dProject(text: string, options: Bone2dProjectOptions = {}): Bone2dProject {
    if (typeof text !== 'string' || text.length > 16 * 1024 * 1024) fail('project exceeds 16 Mi characters');
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        fail('invalid native .bone2d JSON');
    }
    const file = obj(data, 'project file');
    if (file.bone2d !== 1) fail('unsupported project signature', true);
    const p = obj(file.project, 'project');
    if (p.format !== 'bone2d' || p.version !== 1) fail('unsupported project version', true);
    const docs = list(p.others ?? [], 63, 'additional skeletons').map((v) => obj(v, 'skeleton'));
    const active = num(p.activeAt ?? 0, 'active skeleton index', 0, docs.length);
    const selected = num(options.skeletonIndex ?? active, 'skeleton index', 0, docs.length);
    if (!Number.isInteger(active) || !Number.isInteger(selected)) fail('skeleton index must be an integer');
    docs.splice(active, 0, obj(p.skeleton, 'skeleton'));
    const skeletonNames = docs.map((d) => str(d.name, 'skeleton name'));
    const sk = docs[selected];

    const bones = list(sk.bones, 128, 'bones').map((raw): Bone => {
        const b = obj(raw, 'bone');
        const id = str(b.id, 'bone id');
        const mode = b.inherit;
        if (mode !== 'normal' && mode !== 'onlyTranslation' && mode !== 'noRotationOrReflection' &&
            mode !== 'noScale' && mode !== 'noScaleOrReflection') fail(`invalid inheritance: ${id}`);
        if (b.skinRequired != null && typeof b.skinRequired !== 'boolean') fail(`invalid skin-required flag: ${id}`);
        return {
            id, parent: optionalStr(b.parent, 'parent'), pose: pose(b, id), inherit: mode, skinRequired: b.skinRequired === true,
            length: num(b.length ?? 0, 'bone length', 0),
            shear: [num(b.shearX, 'bone shearX'), num(b.shearY, 'bone shearY')],
        };
    });
    if (!bones.length) fail('no bones');
    const byBone = index(bones, 'duplicate bone id');
    for (const bone of bones) {
        const seen = new Set<string>([bone.id]);
        for (let id = bone.parent; id !== null;) {
            const parent = byBone.get(id);
            if (!parent || seen.has(id)) fail(`invalid parent chain: ${bone.id}`);
            if (seen.size >= 32) fail(`bone depth exceeds 32: ${bone.id}`, true);
            seen.add(id);
            // A descendant cannot be sampled before the skin enables its parent chain.
            bone.skinRequired ||= parent.skinRequired;
            id = parent.parent;
        }
    }
    let mappingWrites = 0;
    const constraints = index(list(sk.constraints ?? [], 128, 'constraints').map((raw): AimConstraint | Bone2dTransform => {
        const o = obj(raw, 'constraint');
        if (o.type === 'transform') {
            const id = str(o.id, 'transform id'), source = str(o.source, 'transform source');
            const targets = list(o.bones, bones.length, 'transform bones').map((v) => str(v, 'transform bone'));
            if (!byBone.has(source) || !targets.length || targets.some((b) => !byBone.has(b)) ||
                new Set(targets).size !== targets.length) fail('invalid transform bone reference');
            const { localSource, localTarget, additive, clamp, skinRequired } = o;
            if (typeof localSource !== 'boolean' || typeof localTarget !== 'boolean' || typeof additive !== 'boolean' ||
                typeof clamp !== 'boolean' || typeof skinRequired !== 'boolean') fail('invalid transform flags');
            const prop = (v: unknown): TransformProperty => {
                if (!transformProperties.includes(v as TransformProperty)) fail('invalid transform property');
                return v as TransformProperty;
            };
            const offsets = obj(o.offsets, 'transform offsets'), mix = obj(o.mix, 'transform mix');
            const mappings = list(o.properties, 64, 'transform mappings').map((item) => {
                const from = obj(item, 'transform from');
                return { prop: prop(from.prop), offset: num(from.offset, 'transform from offset'),
                    to: list(from.to, 64, 'transform targets').map((entry) => {
                        const to = obj(entry, 'transform to');
                        return { prop: prop(to.prop), offset: num(to.offset, 'transform to offset'),
                            max: num(to.max, 'transform max'), scale: num(to.scale, 'transform multiplier') };
                    }),
                };
            });
            mappingWrites += targets.length * mappings.reduce((sum, map) => sum + map.to.length, 0);
            if (mappingWrites > 8192) fail('transform mapping budget exceeded', true);
            return { kind: 'transform', id, source, bones: targets, localSource, localTarget, additive, clamp, skinRequired, mappings,
                offsets: transformProperties.map((p) => num(offsets[p === 'rotate' ? 'rotation' : p], 'transform source offset')),
                mix: transformProperties.map((p) => num(mix[p], 'transform mix', 0, 1)),
            };
        }
        if (o.type !== 'ik') fail('unsupported constraint type', true);
        const [idOfBone, idOfChild] = list(o.bones, 2, 'IK bones');
        const child = idOfChild === undefined ? null : str(idOfChild, 'IK child bone');
        const id = str(o.id, 'IK constraint id'), bone = str(idOfBone, 'IK bone'), target = str(o.target, 'IK target');
        const scaleY = o.scaleY;
        if (!byBone.has(bone) || !byBone.has(target)) fail('unknown IK bone or target');
        if (child !== null && byBone.get(child)?.parent !== bone) fail('IK chain needs a direct child');
        if (scaleY !== 'none' && scaleY !== 'uniform' && scaleY !== 'volume') fail('invalid IK scaleY mode');
        if (typeof o.bendPositive !== 'boolean' || typeof o.compress !== 'boolean' || typeof o.stretch !== 'boolean' ||
            typeof o.skinRequired !== 'boolean') fail('invalid IK flags');
        return { kind: 'ik', id, bone, child, target, mix: num(o.mix, 'IK mix', 0, 1), scaleY, compress: o.compress, stretch: o.stretch,
            skinRequired: o.skinRequired, softness: num(o.softness, 'IK softness', 0), bendPositive: o.bendPositive };

    }), 'duplicate constraint id');
    const images = new Map<string, Bone2dImage>();
    const pictures = new Map(entries(file.images, 'embedded images'));
    for (const raw of list(p.images, 256, 'image references')) {
        const x = obj(raw, 'image');
        const name = str(x.name, 'image name');
        const width = num(x.width, name, 1, 4096),
            height = num(x.height, name, 1, 4096);
        if (images.has(name) || !Number.isInteger(width) || !Number.isInteger(height))
            fail(`invalid/duplicate image: ${name}`);
        const dataUrl = pictures.get(name);
        if (dataUrl != null && typeof dataUrl !== 'string') fail(`invalid embedded image: ${name}`);
        images.set(name, { width, height, dataUrl: dataUrl as string | undefined });
    }
    const slots = list(sk.slots, 128, 'slots').map((raw): Slot => {
        const o = obj(raw, 'slot');
        const id = str(o.id, 'slot id'),
            bone = str(o.bone, 'slot bone');
        if (!byBone.has(bone)) fail(`unknown slot bone: ${id}`);
        const blend = o.blend;
        if (blend !== 'normal' && blend !== 'additive' && blend !== 'multiply' && blend !== 'screen')
            fail(`invalid slot blend: ${id}`);
        const darkValues = o.dark == null ? null : list(o.dark, 3, 'slot dark tint');
        if (darkValues && darkValues.length !== 3) fail('slot dark tint');
        const dark = darkValues?.map((v) => num(v, 'slot dark tint', 0, 1)) as unknown as RGB | undefined;
        return { id, bone, blend, dark: dark ?? null, attachment: optionalStr(o.attachment, 'setup attachment'), color: color(o.color, id) };
    });
    const bySlot = index(slots, 'duplicate slot id');
    const slotIds = slots.map((s) => s.id);
    const folders = index(
        list(sk.drawOrderFolders ?? [], 128, 'draw order folders').map((raw): Folder => {
            const folder = obj(raw, 'draw order folder');
            const id = str(folder.id, 'folder id');
            const members = list(folder.slots, slotIds.length, 'folder slots').map((v) => str(v, 'folder slot'));
            if (new Set(members).size !== members.length || members.some((sid) => !bySlot.has(sid)))
                fail('invalid folder membership');
            return { id, members };
        }),
        'duplicate folder id',
    );
    const skins = index(
        list(sk.skins, 128, 'skins').map((raw): Skin => {
            const o = obj(raw, 'skin');
            const id = str(o.id, 'skin id'),
                name = str(o.name, 'skin name');
            const skinBones = list(o.bones ?? [], bones.length, 'skin bones').map((b) => str(b, 'skin bone'));
            if (new Set(skinBones).size !== skinBones.length || skinBones.some((b) => !byBone.has(b)))
                fail(`invalid skin bones: ${id}`);
            const skinConstraints = list(o.constraints ?? [], constraints.size, 'skin constraints').map((c) => str(c, 'skin constraint'));
            if (new Set(skinConstraints).size !== skinConstraints.length || skinConstraints.some((c) => !constraints.has(c))) {
                fail(`invalid skin constraints: ${id}`);
            }
            const bySlotRegion = new Map<string, Map<string, Attachment>>();
            for (const [slotId, rawRegions] of entries(o.attachments, 'skin attachments')) {
                if (!bySlot.has(slotId)) fail(`unknown skin slot: ${slotId}`);
                const regions = new Map<string, Attachment>();
                for (const [attachment, rawRegion] of entries(rawRegions, 'regions')) {
                    const r = obj(rawRegion, 'attachment');
                    if (r.type === 'point' || r.type === 'boundingbox' || r.type === 'path' || r.type === 'clipping') {
                        const shape = parseShape(r, byBone);
                        if (shape.kind === 'clipping' && shape.end !== null && !bySlot.has(shape.end))
                            fail(`unknown clipping end slot: ${shape.end}`);
                        regions.set(attachment, shape);
                        continue;
                    }
                    if (r.type !== 'region' && r.type !== 'mesh')
                        fail(`unsupported attachment: ${slotId}/${attachment}`, true);
                    const path = str(r.path, 'attachment image name');
                    const sequence = pictureSequence(r.sequence, path, images);
                    if (!sequence && !images.has(path)) fail(`unknown image: ${path}`);
                    if (r.type === 'mesh') {
                        regions.set(attachment, { ...parseMesh(r, path, byBone), sequence });
                        continue;
                    }
                    regions.set(attachment, {
                        kind: 'region',
                        path,
                        sequence,
                        pose: pose(r, path),
                        width: num(r.width, path, 0.001, 32768),
                        height: num(r.height, path, 0.001, 32768),
                        color: color(r.color, path),
                    });
                }
                bySlotRegion.set(slotId, regions);
            }
            return { id, name, bones: skinBones, constraints: skinConstraints, regions: bySlotRegion };
        }),
        'duplicate skin id',
    );
    if (!skins.size) fail('expected a default skin');
    const firstSkin = skins.values().next().value!;
    for (const skin of skins.values()) {
        for (const [slotId, regions] of skin.regions)
            for (const [key, mesh] of regions) {
                if (mesh.kind !== 'mesh' || !mesh.link) continue;
                const link = mesh.link;
                const sourceSkin = link.skin === null ? firstSkin : skins.get(link.skin);
                const source = sourceSkin?.regions.get(link.slot ?? slotId)?.get(link.source);
                if (source?.kind !== 'mesh' || source.link || source === mesh)
                    fail(`invalid linked mesh: ${skin.id}/${slotId}/${key}`);
                (regions as Map<string, Attachment>).set(key, {
                    ...source,
                    path: mesh.path,
                    sequence: mesh.sequence,
                    color: mesh.color,
                    link,
                    deformParent: link.deform ? source : undefined,
                });
            }
    }
    const hasRegion = (slot: string, key: string): boolean =>
        Array.from(skins.values()).some((skin) => skin.regions.get(slot)?.has(key));
    for (const slot of slots) {
        if (slot.attachment !== null && !hasRegion(slot.id, slot.attachment))
            fail(`unknown setup attachment: ${slot.id}/${slot.attachment}`);
    }
    const defs = index(
        list(sk.events ?? [], 256, 'events').map((raw) => {
            const o = obj(raw, 'event definition');
            return {
                id: str(o.id, 'event id'),
                name: str(o.name, 'event name'),
                int: num(o.int ?? 0, 'event int'),
                float: num(o.float ?? 0, 'event float'),
                string: o.string ?? '',
            };
        }),
        'duplicate event id',
    );
    const clips = index(
        list(sk.animations, 128, 'animations').map((raw): Clip => {
            const o = obj(raw, 'animation');
            const id = str(o.id, 'animation id'),
                name = str(o.name, 'animation name');
            const duration = num(o.duration, 'animation duration', 0, 3600);
            for (const k of ['slider', 'path', 'physics']) none(o[k], k);
            const transform = new Map<string, ValueKey[]>();
            for (const [id, raw] of entries(o.transform, 'transform timelines')) {
                if (constraints.get(id)?.kind !== 'transform') fail(`unknown transform timeline: ${id}`);
                const track = values(raw, 6, duration, 'transform key');
                for (const key of track) key.value.forEach((mix) => num(mix, 'transform key mix', 0, 1));
                transform.set(id, track);
            }
            const ik = new Map<string, AimKey[]>();
            for (const [id, raw] of entries(o.ik, 'IK timelines')) {
                if (constraints.get(id)?.kind !== 'ik') fail(`unknown IK timeline: ${id}`);
                const numbers = values(raw, 2, duration, 'IK key');
                const flags = keys(raw, duration, 'IK key', (k) => {
                    if (typeof k.bendPositive !== 'boolean' || typeof k.compress !== 'boolean' || typeof k.stretch !== 'boolean') {
                        fail('invalid IK key flags');
                    }
                    return { compress: k.compress, stretch: k.stretch, bendPositive: k.bendPositive };
                });
                ik.set(id, numbers.map((key, j) => {
                    num(key.value[0], 'IK key mix', 0, 1);
                    num(key.value[1], 'IK key softness', 0);
                    return { ...key, ...flags[j].value };
                }));
            }
            const boneTracks = new Map<string, Map<string, ValueKey[]>>();
            for (const [boneId, rawTrack] of entries(o.bones, 'bone timelines')) {
                if (!byBone.has(boneId)) fail(`unknown animated bone: ${boneId}`);
                const track = new Map<string, ValueKey[]>();
                for (const [k, v] of entries(rawTrack, 'bone timeline')) {
                    const n = channels.get(k);
                    if (!n) fail(`bone timeline: ${k}`, true);
                    track.set(k, values(v, n, duration, k));
                }
                boneTracks.set(boneId, track);
            }
            const slotTracks = new Map<string, { attachment: Key<string | null>[]; rgba: ValueKey[]; rgba2: ValueKey[] }>();
            for (const [slotId, rawTrack] of entries(o.slots, 'slot timelines')) {
                const slot = bySlot.get(slotId);
                if (!slot) fail(`unknown animated slot: ${slotId}`);
                const t = obj(rawTrack, 'slot timeline');
                for (const k of Object.keys(t))
                    if (k !== 'attachment' && k !== 'rgba' && k !== 'rgba2') fail(`slot timeline: ${k}`, true);
                slotTracks.set(slotId, {
                    attachment: keys(t.attachment, duration, 'attachment keys', (k) => {
                        const a = optionalStr(k.name, 'attachment key');
                        if (a !== null && !hasRegion(slotId, a)) fail(`unknown attachment key: ${slotId}/${a}`);
                        return a;
                    }),
                    rgba: values(t.rgba, 4, duration, 'slot tint'),
                    rgba2: values(t.rgba2, 7, duration, 'slot two-color tint'),
                });
            }
            const order = keys(o.drawOrder, duration, 'draw order', (k) => arrangement(k.order, slotIds));
            const folderOrder = new Map<string, Key<string[]>[]>();
            for (const [id, raw] of entries(o.drawOrderFolder, 'folder order tracks')) {
                const folder = folders.get(id);
                if (!folder) fail(`unknown draw order folder: ${id}`);
                folderOrder.set(
                    id,
                    keys(raw, duration, 'folder order', (k) => arrangement(k.order, folder.members)),
                );
            }
            const markers = keys(
                o.events,
                duration,
                'event keys',
                (k, time): Bone2dMarker => {
                    const def = defs.get(str(k.event, 'event id'));
                    if (!def) fail('unknown event id');
                    const string = k.string ?? def.string;
                    if (typeof string !== 'string' || string.length > 4096) fail('event string');
                    const int = num(k.int ?? def.int, 'event int');
                    if (!Number.isInteger(int)) fail('event int must be an integer');
                    return Object.freeze({
                        id: def.id,
                        name: def.name,
                        time,
                        int,
                        float: num(k.float ?? def.float, 'event float'),
                        string,
                    });
                },
                true,
            );
            const deform = new Map<VertexAttachment, ValueKey[]>();
            for (const [skinId, rawSlots] of entries(o.deform, 'deform skins')) {
                const skin = skins.get(skinId);
                if (!skin) fail(`unknown deform skin: ${skinId}`);
                for (const [slotId, rawMeshes] of entries(rawSlots, 'deform slots')) {
                    if (!bySlot.has(slotId)) fail(`unknown deform slot: ${slotId}`);
                    for (const [key, rawKeys] of entries(rawMeshes, 'deform attachments')) {
                        const target = skin.regions.get(slotId)?.get(key);
                        if (!target || target.kind === 'region' || target.kind === 'point')
                            fail(`unknown deform attachment: ${skinId}/${slotId}/${key}`);
                        const track = values(rawKeys, target.deformSize, duration, 'deform curve', true);
                        if (target.kind !== 'mesh' || !target.deformParent) deform.set(target, track);
                    }
                }
            }
            const sequences = new Map<Visual, Key<SequenceKey>[]>();
            for (const [skinId, rawSlots] of entries(o.sequence, 'sequence skins')) {
                const skin = skins.get(skinId);
                if (!skin) fail(`unknown sequence skin: ${skinId}`);
                for (const [slotId, rawAttachments] of entries(rawSlots, 'sequence slots')) {
                    if (!bySlot.has(slotId)) fail(`unknown sequence slot: ${slotId}`);
                    for (const [name, rawKeys] of entries(rawAttachments, 'sequence attachments')) {
                        const visual = skin.regions.get(slotId)?.get(name);
                        if (!visual || (visual.kind !== 'region' && visual.kind !== 'mesh') || !visual.sequence) fail(`unknown sequenced attachment: ${skinId}/${slotId}/${name}`);
                        sequences.set(visual, keys(rawKeys, duration, 'sequence key', (key): SequenceKey => {
                            const mode = key.mode as SequenceKey['mode'];
                            if (!sequenceModes.includes(mode)) fail('invalid sequence mode');
                            return {
                                mode,
                                index: integer(key.index, 'sequence key index', 0, Number.MAX_SAFE_INTEGER),
                                delay: num(key.delay, 'sequence delay', 0),
                            };
                        }));
                    }
                }
            }
            return { id, name, duration, order, folderOrder, markers, bones: boneTracks, slots: slotTracks, deform, sequences, ik, transform };
        }),
        'duplicate animation id',
    );
    const affineSprites = constraints.size > 0 || bones.some((bone) => bone.skinRequired || bone.inherit !== 'normal' || bone.shear[0] !== 0 || bone.shear[1] !== 0) ||
        Array.from(clips.values()).some((clip) => Array.from(clip.bones.values()).some(
            (track) => ['shear', 'shearx', 'sheary'].some((channel) => track.has(channel)),
        ));
    return { skeletonIndex: selected, skeletonNames, bones, affineSprites, constraints, slots, clips, images, skins, folders };
}
function arrangement(raw: unknown, setup: readonly string[]): string[] {
    const desired = list(raw, setup.length, 'slot order').map((entry) => str(entry, 'slot id'));
    const seen = new Set(desired),
        members = new Set(setup);
    if (seen.size !== desired.length || desired.some((id) => !members.has(id))) fail('invalid draw order');
    return desired.concat(setup.filter((id) => !seen.has(id)));
}
function parseMesh(r: Obj, path: string, byBone: ReadonlyMap<string, Bone>): Bone2dMesh {
    let link: Bone2dMesh['link'];
    if (r.link != null) {
        const o = obj(r.link, 'linked mesh');
        if (typeof o.deform !== 'boolean') fail('linked mesh deform mode');
        link = {
            source: str(o.source, 'linked source'),
            slot: optionalStr(o.slot, 'linked slot'),
            skin: optionalStr(o.skin, 'linked skin'),
            deform: o.deform,
        };
    }
    const uvs = list(r.uvs, 2048, 'mesh UVs').map((v, i) => {
        const uv = num(v, 'mesh UV', 0, 1);
        return i % 2 ? 1 - uv : uv;
    });
    const vertexCount = uvs.length / 2;
    if (!Number.isInteger(vertexCount) || vertexCount < 3) fail('mesh needs at least three XY/UV pairs');
    const indices = list(r.triangles, 4095, 'mesh triangles').map((v) => {
        const index = num(v, 'triangle index', 0, vertexCount - 1);
        if (!Number.isInteger(index)) fail('non-integer triangle index');
        return index;
    });
    if (indices.length < 3 || indices.length % 3) fail('invalid triangle index count');
    return { kind: 'mesh', path, color: color(r.color, path), ...parsePositions(r, vertexCount, byBone), uvs, indices, link };
}
function parseShape(r: Obj, byBone: ReadonlyMap<string, Bone>): Shape | Bone2dClipAttachment {
    if (r.sequence != null) fail('picture sequence requires a visual attachment');
    if (r.type === 'point') {
        return { kind: 'point', x: num(r.x, 'point x'), y: num(r.y, 'point y'), rotation: num(r.rotation, 'point rotation') };
    }
    const count = r.weights == null
        ? list(r.vertices, 2048, 'shape vertices').length / 2
        : list(r.weights, 1024, 'shape weights').length;
    if (!Number.isInteger(count) || count < 3) fail('shape needs at least three XY pairs');
    const positions = parsePositions(r, count, byBone);
    if (r.type === 'boundingbox') return { kind: 'boundingbox', ...positions };
    if (r.type === 'clipping') {
        if (typeof r.convex !== 'boolean' || typeof r.inverse !== 'boolean') fail('invalid clipping mode');
        return { kind: 'clipping', ...positions, end: optionalStr(r.end, 'clipping end'), convex: r.convex, inverse: r.inverse };
    }
    if (typeof r.closed !== 'boolean' || typeof r.constantSpeed !== 'boolean' || count % 3 || (!r.closed && count < 6))
        fail('path needs complete in-handle, anchor and out-handle triplets');
    return { kind: 'path', ...positions, closed: r.closed, constantSpeed: r.constantSpeed };
}
function parsePositions(r: Obj, vertexCount: number, byBone: ReadonlyMap<string, Bone>): Positioned {
    const xy = list(r.vertices, vertexCount * 2, 'attachment vertices').map((v) => num(v, 'attachment coordinate'));
    let weights: Influence[][] | null = null;
    let deformSize = vertexCount * 2;
    if (r.weights != null) {
        const values = list(r.weights, vertexCount, 'weighted vertices');
        if (values.length !== vertexCount || xy.length)
            fail('provide one weight list per vertex and no plain vertices');
        weights = values.map((raw) => {
            const influences = list(raw, 16, 'vertex influences').map((tuple): Influence => {
                const a = list(tuple, 4, 'influence');
                if (a.length !== 4) fail('influence requires [bone, x, y, weight]');
                const bone = str(a[0], 'influence bone');
                if (!byBone.has(bone)) fail(`unknown influence bone: ${bone}`);
                return [bone, num(a[1], 'bind x'), num(a[2], 'bind y'), num(a[3], 'influence weight', 0, 1)];
            });
            if (!influences.length || Math.abs(influences.reduce((sum, a) => sum + a[3], 0) - 1) > 1e-4)
                fail('invalid influence weights');
            return influences;
        });
        deformSize = 2 * weights.reduce((n, influence) => n + influence.length, 0);
    } else if (xy.length !== vertexCount * 2) fail('incorrect number of plain XY pairs');
    return { xy, weights, deformSize };
}
function last<T>(track: readonly Key<T>[], time: number): number {
    let lo = 0,
        hi = track.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (track[mid].time <= time) lo = mid + 1;
        else hi = mid;
    }
    return lo - 1;
}
function sampled(track: ValueKey[] = [], time: number): number[] | undefined {
    const i = last(track, time);
    if (i < 0) return undefined;
    const a = track[i],
        b = track[i + 1];
    if (!b || a.curve === 'stepped') return a.value;
    const u = (time - a.time) / (b.time - a.time);
    const curve = a.curve;
    return a.value.map((v, j) => {
        let progress = u;
        if (curve !== 'linear') {
            const p = curve[curve.length === 1 ? 0 : j];
            for (let k = 2; k < p.length; k += 2)
                if (p[k] >= u) {
                    const fraction = (u - p[k - 2]) / (p[k] - p[k - 2]);
                    progress = p[k - 1] + fraction * (p[k + 1] - p[k - 1]);
                    break;
                }
        }
        return v + progress * (b.value[j] - v);
    });
}
// Model picture selection as travel along a line, a ring or a reflected line.
function sequenceFrame({ mode, index, delay }: SequenceKey, elapsed: number, count: number): number {
    if (mode === 'hold') return Math.min(count - 1, index);
    if (count === 1) return 0;
    // The editor uses a 32-bit step counter with a small tolerance at a frame boundary.
    const steps = delay === 0 ? 0 : (elapsed / delay + 1e-5) | 0;
    const position = index + steps;
    const end = count - 1;
    let frame: number;
    if (mode === 'once' || mode === 'onceReverse') frame = mode === 'once' ? position : Math.max(0, end - position);
    else if (mode === 'loop' || mode === 'loopReverse') {
        const phase = position % count;
        frame = mode === 'loop' ? phase : end - phase;
    } else {
        const phase = (position + (mode === 'pingpongReverse' ? end : 0)) % (2 * end);
        frame = phase <= end ? phase : 2 * end - phase;
    }
    return frame === -1 ? -1 : Math.max(0, Math.min(end, frame));
}
export function sampleBone2dProject(
    project: Bone2dProject, clipId: string | null, seconds: number, overlays: readonly string[] = [],
): Bone2dSample {
    const clip = clipId === null ? undefined : project.clips.get(clipId);
    if (clipId !== null && !clip) fail(`unknown animation: ${clipId}`);
    if (!Number.isFinite(seconds)) fail('invalid sample time');
    const time = Math.max(0, Math.min(seconds, clip?.duration ?? 0));
    const activeBones = new Set(project.bones.filter((bone) => !bone.skinRequired).map((bone) => bone.id));
    const skinConstraints = new Set<string>();
    if (overlays.length) {
        const byId = new Map(project.bones.map((bone) => [bone.id, bone] as const));
        const fallback = project.skins.values().next().value!;
        for (const id of overlays) {
            const skin = project.skins.get(id);
            if (!skin) fail(`unknown skin: ${id}`);
            if (skin === fallback) continue;
            for (const constraint of skin.constraints) skinConstraints.add(constraint);
            for (const listed of skin.bones) {
                for (let current: string | null = listed; current !== null; current = byId.get(current)!.parent) {
                    activeBones.add(current);
                }
            }
        }
    }
    const bones = new Map(
        project.bones.map((b): [string, Bone2dPose] => {
            const track = activeBones.has(b.id) ? clip?.bones.get(b.id) : undefined;
            if (!track) return [b.id, b.pose];
            const [x, y, rotation, sx, sy] = b.pose;
            const v = (name: string): number[] | undefined => sampled(track.get(name), time);
            const xy = v('translate'),
                scale = v('scale');
            return [
                b.id,
                [
                    x + (v('translatex')?.[0] ?? xy?.[0] ?? 0),
                    y + (v('translatey')?.[0] ?? xy?.[1] ?? 0),
                    rotation + (v('rotate')?.[0] ?? 0),
                    sx * (v('scalex')?.[0] ?? scale?.[0] ?? 1),
                    sy * (v('scaley')?.[0] ?? scale?.[1] ?? 1),
                ],
            ];
        }),
    );
    const shears = new Map<string, Shears>();
    for (const bone of project.bones) {
        const [x, y] = bone.shear;
        const track = activeBones.has(bone.id) ? clip?.bones.get(bone.id) : undefined;
        const pair = sampled(track?.get('shear'), time);
        shears.set(bone.id, [
            x + (sampled(track?.get('shearx'), time)?.[0] ?? pair?.[0] ?? 0),
            y + (sampled(track?.get('sheary'), time)?.[0] ?? pair?.[1] ?? 0),
        ]);
    }
    const slots = new Map(
        project.slots.map((s): [string, Bone2dSlotPose] => {
            const track = clip?.slots.get(s.id);
            const key = track ? last(track.attachment, time) : -1;
            const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
            const twoColor = sampled(track?.rgba2, time);
            const tint = twoColor ?? sampled(track?.rgba, time);
            const dark = twoColor && s.dark ? twoColor.slice(4).map(clamp01) as unknown as RGB : s.dark;
            const attachment = activeBones.has(s.bone) ? (key >= 0 ? track!.attachment[key].value : s.attachment) : null;
            return [
                s.id,
                {
                    attachment,
                    color: tint ? (tint.slice(0, 4).map(clamp01) as unknown as RGBA) : s.color,
                    dark,
                },
            ];
        }),
    );
    const i = clip ? last(clip.order, time) : -1;
    const meshDeltas = new Map<Bone2dMesh, readonly number[]>();
    const shapeDeltas = new Map<PolygonAttachment, readonly number[]>();
    for (const [target, track] of clip?.deform ?? []) {
        const deltas = sampled(track, time);
        if (!deltas) continue;
        if (target.kind === 'mesh') meshDeltas.set(target, deltas);
        else shapeDeltas.set(target, deltas);
    }
    let order = i >= 0 ? clip!.order[i].value : project.slots.map((s) => s.id);
    if (clip)
        for (const [id, folder] of project.folders) {
            const track = clip.folderOrder.get(id);
            if (!track?.length) continue;
            const j = last(track, time),
                next = j < 0 ? folder.members : track[j].value;
            const seats = new Set(folder.members);
            let at = 0;
            order = order.map((slot) => (seats.has(slot) ? next[at++] : slot));
        }
    const sequenceFrames = new Map<Visual, number>();
    for (const [visual, track] of clip?.sequences ?? []) {
        const j = last(track, time);
        if (j < 0) continue;
        const key = track[j];
        const sequence = visual.sequence!;
        const frame = sequenceFrame(key.value, time - key.time, sequence.frames.length);
        sequenceFrames.set(visual, frame === -1 ? sequence.setup : frame);
    }
    const ik = new Map<string, Bone2dAimOptions>(), transforms = new Map<string, readonly number[]>();
    for (const [id, c] of project.constraints) {
        if (c.skinRequired && !skinConstraints.has(id)) continue;
        if (c.kind === 'transform') {
            if (activeBones.has(c.source)) transforms.set(id, sampled(clip?.transform.get(id), time) ?? c.mix);
            continue;
        }
        if (!activeBones.has(c.target) || !activeBones.has(c.bone)) continue;
        const track = clip?.ik.get(id);
        const i = track ? last(track, time) : -1;
        if (i < 0) ik.set(id, c);
        else {
            const { compress, stretch, bendPositive } = track![i];
            const [mix, softness] = sampled(track, time)!;
            ik.set(id, { mix, softness, scaleY: c.scaleY, compress, stretch, bendPositive });
        }
    }
    return { bones, shears, activeBones, ik, transforms, slots, meshDeltas, shapeDeltas, order, sequenceFrames };
}

/** Resolve ordered parent/local 2D affine products without decomposing shear. */
export function bone2dWorldMatrices(project: Bone2dProject, sample: Bone2dSample): ReadonlyMap<string, Matrix2D> {
    const out = new Map<string, Matrix2D>();
    const solved = new Map<string, AppliedPose>();
    const explicitWorld = new Set<string>();
    const byId = new Map(project.bones.map((b) => [b.id, b] as const));
    const compute = (id: string): Matrix2D => {
        const cached = out.get(id);
        if (cached) return cached;
        if (!sample.activeBones.has(id)) {
            const identity: Matrix2D = [1, 0, 0, 1, 0, 0];
            out.set(id, identity);
            return identity;
        }
        const bone = byId.get(id)!;
        const local = solved.get(id);
        const [x, y, degrees, sx, sy] = local?.pose ?? sample.bones.get(id)!;
        const shear = local?.shear ?? sample.shears.get(id)!;
        let m: Matrix2D;
        if (bone.parent === null) {
            m = [...poseBasis(degrees, sx, sy, shear), x, y];
        } else {
            const parent = compute(bone.parent);
            const [pa, pb, pc, pd, px, py] = parent;
            m = [...inheritBasis(parent, bone.inherit, degrees, sx, sy, shear), pa*x+pb*y+px, pc*x+pd*y+py];
        }
        if (!m.every(Number.isFinite)) fail(`non-finite solved bone: ${id}`);
        out.set(id, m);
        return m;
    };
    if (sample.ik.size || sample.transforms.size) {
        const children = new Map<string, string[]>();
        for (const { id, parent } of project.bones) {
            if (parent === null) continue;
            const siblings = children.get(parent);
            if (siblings) siblings.push(id);
            else children.set(parent, [id]);
        }
        const readLocal = (id: string): AppliedPose => {
            const bone = byId.get(id)!;
            if (explicitWorld.delete(id)) {
                solved.set(id, transformApplied(out.get(id)!, bone.parent === null ? null : compute(bone.parent), bone.inherit));
            }
            return solved.get(id) ?? { pose: sample.bones.get(id)!, shear: sample.shears.get(id)! };
        };
        const invalidate = (id: string): void => {
            if (!out.has(id)) return;
            // Convert descendants against the old parent before dropping
            // either matrix; subsequent reads inherit the updated parent.
            for (const child of children.get(id) ?? []) invalidate(child);
            if (explicitWorld.has(id)) readLocal(id);
            out.delete(id);
        };
        const writeLocal = (id: string, pose: AppliedPose): void => {
            invalidate(id);
            solved.set(id, pose);
        };
        for (const [id, c] of project.constraints) {
            if (c.kind === 'transform') {
                const mix = sample.transforms.get(id);
                if (!mix?.some((amount) => amount !== 0)) continue;
                let worldSource = c.localSource ? null : compute(c.source);
                let localSource = c.localSource ? readLocal(c.source) : null;
                const targets = c.bones.filter((bone) => sample.activeBones.has(bone));
                const previous = c.localTarget ? [] : targets.map(compute);
                for (let i = 0; i < targets.length; i++) {
                    const targetId = targets[i];
                    let world = previous[i];
                    let local = c.localTarget ? readLocal(targetId) : null;
                    for (const from of c.mappings) {
                        const value = (localSource !== null ? transformReadLocal(from.prop, localSource, c.offsets) :
                            transformReadWorld(from.prop, worldSource!, c.offsets)) - from.offset;
                        for (const to of from.to) {
                            const weight = mix[transformProperties.indexOf(to.prop)];
                            if (weight === 0) continue;
                            const wanted = to.offset + value * to.scale;
                            const mapped = c.clamp ? Math.min(Math.max(to.offset, to.max), Math.max(Math.min(to.offset, to.max), wanted)) : wanted;
                            if (local !== null) {
                                local = transformWriteLocal(to.prop, local, mapped, weight, c.additive);
                                if (targetId === c.source && localSource !== null) localSource = local;
                            } else {
                                world = transformWriteWorld(to.prop, world, mapped, weight, c.additive);
                                if (targetId === c.source && worldSource !== null) worldSource = world;
                            }
                        }
                    }
                    if (local !== null) writeLocal(targetId, local);
                    else {
                        for (const child of children.get(targetId) ?? []) invalidate(child);
                        if (!world.every(Number.isFinite)) fail(`non-finite world transform: ${targetId}`);
                        out.set(targetId, world);
                        explicitWorld.add(targetId);
                    }
                }
                continue;
            }
            const options = sample.ik.get(id);
            if (!options || options.mix === 0) continue;
            const bone = byId.get(c.bone)!;
            // The pinned editor does not aim an unparented bone.
            if (bone.parent === null) continue;
            // Read the current target before changing this subtree. Targets
            // downstream of an earlier constraint must see its new matrix.
            const target = compute(c.target);
            const current = compute(c.bone);
            const { pose: local, shear } = readLocal(c.bone);
            const frame = compute(bone.parent);
            if (c.child === null) {
                writeLocal(c.bone, { pose: aimBone2d(local, shear, bone.inherit, bone.length, frame, current, target, options), shear });
            } else {
                const child = byId.get(c.child)!;
                if (bone.inherit !== 'normal' || child.inherit !== 'normal') continue;
                // Even an inactive child contributes its setup offset to the
                // upper bone's solve; inactive descendants still do not render.
                const lowerLocal = readLocal(c.child);
                const [upper, lower] = aimBone2dPair(
                    local, lowerLocal.pose, shear, lowerLocal.shear, bone.length, child.length, frame, current, target, options,
                );
                writeLocal(c.bone, { pose: upper, shear });
                writeLocal(c.child, { pose: lower, shear: lowerLocal.shear });
            }
        }
    }
    for (const bone of project.bones) compute(bone.id);
    return out;
}

/** Build a mesh in player-root coordinates. Weighted deform offsets are per influence, not per final vertex. */
export function bone2dMeshPositions(
    mesh: Positioned,
    slotBone: string,
    world: ReadonlyMap<string, Matrix2D>,
    delta: readonly number[] = [],
): number[] {
    const transform = (id: string, x: number, y: number): [number, number] => {
        const [a, b, c, d, tx, ty] = world.get(id)!;
        return [a * x + b * y + tx, c * x + d * y + ty];
    };
    const out: number[] = [];
    if (mesh.weights) {
        let index = 0;
        for (const row of mesh.weights) {
            let x = 0,
                y = 0;
            for (const [bone, bx, by, weight] of row) {
                const [px, py] = transform(bone, bx + (delta[index++] ?? 0), by + (delta[index++] ?? 0));
                x += px * weight;
                y += py * weight;
            }
            out.push(x, y);
        }
    } else
        for (let i = 0; i < mesh.xy.length; i += 2) {
            out.push(...transform(slotBone, mesh.xy[i] + (delta[i] ?? 0), mesh.xy[i + 1] + (delta[i + 1] ?? 0)));
        }
    return out;
}

export function resolveBone2dAttachment(skins: readonly Skin[], slot: string, name: string | null): Attachment | undefined {
    if (name === null) return undefined;
    for (let i = skins.length - 1; i >= 0; --i) {
        const attachment = skins[i].regions.get(slot)?.get(name);
        if (attachment) return attachment;
    }
    return undefined;
}

export function bone2dShapeGeometry(
    attachment: Shape,
    slotBone: string,
    sample: Bone2dSample,
    world: ReadonlyMap<string, Matrix2D>,
): Bone2dAttachmentGeometry {
    if (attachment.kind === 'point') {
        const [a, b, c, d, tx, ty] = world.get(slotBone)!;
        const r = attachment.rotation * Math.PI / 180, x = Math.cos(r), y = Math.sin(r);
        return {
            kind: 'point',
            x: a * attachment.x + b * attachment.y + tx,
            y: c * attachment.x + d * attachment.y + ty,
            rotation: Math.atan2(c * x + d * y, a * x + b * y) * 180 / Math.PI,
        };
    }
    const vertices = bone2dMeshPositions(attachment, slotBone, world, sample.shapeDeltas.get(attachment));
    if (attachment.kind === 'boundingbox') return { kind: 'boundingbox', vertices };
    return { kind: 'path', vertices, closed: attachment.closed, constantSpeed: attachment.constantSpeed };
}
