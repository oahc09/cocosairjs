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
/** Strict reader for the supported subset of Bone-2D Save Project v1. No editor or Spine dependency. */
type Obj = Record<string, unknown>;
export type Bone2dPose = readonly [number, number, number, number, number];
type RGBA = readonly [number, number, number, number];
export interface Bone2dRegion {
    kind: 'region';
    path: string;
    pose: Bone2dPose;
    width: number;
    height: number;
    color: RGBA;
}
type Influence = readonly [bone: string, x: number, y: number, weight: number];
type Matrix2D = readonly [a: number, b: number, c: number, d: number, tx: number, ty: number];
export interface Bone2dMesh {
    kind: 'mesh';
    path: string;
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
interface Bone {
    id: string;
    parent: string | null;
    pose: Bone2dPose;
}
interface Slot {
    id: string;
    bone: string;
    attachment: string | null;
    color: RGBA;
}
interface Skin {
    id: string;
    name: string;
    regions: ReadonlyMap<string, ReadonlyMap<string, Visual>>;
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
    slots: ReadonlyMap<string, { attachment: Key<string | null>[]; rgba: ValueKey[] }>;
    order: Key<string[]>[];
    folderOrder: ReadonlyMap<string, Key<string[]>[]>;
    deform: ReadonlyMap<Bone2dMesh, ValueKey[]>;
    markers: Key<Bone2dMarker>[];
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
    readonly slots: readonly Slot[];
    readonly clips: ReadonlyMap<string, Clip>;
    readonly images: ReadonlyMap<string, Bone2dImage>;
}
export interface Bone2dSlotPose {
    readonly attachment: string | null;
    readonly color: RGBA;
}
export interface Bone2dSample {
    readonly bones: ReadonlyMap<string, Bone2dPose>;
    readonly slots: ReadonlyMap<string, Bone2dSlotPose>;
    readonly order: readonly string[];
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
    none(sk.constraints, 'constraints');

    const bones = list(sk.bones, 128, 'bones').map((raw): Bone => {
        const b = obj(raw, 'bone');
        const id = str(b.id, 'bone id');
        if (b.inherit !== 'normal' || b.shearX !== 0 || b.shearY !== 0 || b.skinRequired)
            fail(`inheritance or shear: ${id}`, true);
        return { id, parent: optionalStr(b.parent, 'parent'), pose: pose(b, id) };
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
            id = parent.parent;
        }
    }
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
        if (o.blend !== 'normal' || o.dark != null) fail(`slot blend or two-color tint: ${id}`, true);
        return { id, bone, attachment: optionalStr(o.attachment, 'setup attachment'), color: color(o.color, id) };
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
            none(o.bones, 'skin-required bones');
            none(o.constraints, 'skin-required constraints');
            const bySlotRegion = new Map<string, Map<string, Visual>>();
            for (const [slotId, rawRegions] of entries(o.attachments, 'skin attachments')) {
                if (!bySlot.has(slotId)) fail(`unknown skin slot: ${slotId}`);
                const regions = new Map<string, Visual>();
                for (const [attachment, rawRegion] of entries(rawRegions, 'regions')) {
                    const r = obj(rawRegion, 'attachment');
                    if ((r.type !== 'region' && r.type !== 'mesh') || r.sequence != null)
                        fail(`unsupported or sequence attachment: ${slotId}/${attachment}`, true);
                    const path = str(r.path, 'attachment image name');
                    if (!images.has(path)) fail(`unknown image: ${path}`);
                    if (r.type === 'mesh') {
                        regions.set(attachment, parseMesh(r, path, byBone));
                        continue;
                    }
                    regions.set(attachment, {
                        kind: 'region',
                        path,
                        pose: pose(r, path),
                        width: num(r.width, path, 0.001, 32768),
                        height: num(r.height, path, 0.001, 32768),
                        color: color(r.color, path),
                    });
                }
                bySlotRegion.set(slotId, regions);
            }
            return { id, name, regions: bySlotRegion };
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
                (regions as Map<string, Visual>).set(key, {
                    ...source,
                    path: mesh.path,
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
            for (const k of ['ik', 'transform', 'slider', 'path', 'physics', 'sequence']) none(o[k], k);
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
            const slotTracks = new Map<string, { attachment: Key<string | null>[]; rgba: ValueKey[] }>();
            for (const [slotId, rawTrack] of entries(o.slots, 'slot timelines')) {
                const slot = bySlot.get(slotId);
                if (!slot) fail(`unknown animated slot: ${slotId}`);
                const t = obj(rawTrack, 'slot timeline');
                for (const k of Object.keys(t))
                    if (k !== 'attachment' && k !== 'rgba') fail(`slot timeline: ${k}`, true);
                slotTracks.set(slotId, {
                    attachment: keys(t.attachment, duration, 'attachment keys', (k) => {
                        const a = optionalStr(k.name, 'attachment key');
                        if (a !== null && !hasRegion(slotId, a)) fail(`unknown attachment key: ${slotId}/${a}`);
                        return a;
                    }),
                    rgba: values(t.rgba, 4, duration, 'slot tint'),
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
            const deform = new Map<Bone2dMesh, ValueKey[]>();
            for (const [skinId, rawSlots] of entries(o.deform, 'deform skins')) {
                const skin = skins.get(skinId);
                if (!skin) fail(`unknown deform skin: ${skinId}`);
                for (const [slotId, rawMeshes] of entries(rawSlots, 'deform slots')) {
                    if (!bySlot.has(slotId)) fail(`unknown deform slot: ${slotId}`);
                    for (const [key, rawKeys] of entries(rawMeshes, 'deform attachments')) {
                        const mesh = skin.regions.get(slotId)?.get(key);
                        if (mesh?.kind !== 'mesh') fail(`unknown deform mesh: ${skinId}/${slotId}/${key}`);
                        const track = values(rawKeys, mesh.deformSize, duration, 'deform curve', true);
                        if (!mesh.deformParent) deform.set(mesh, track);
                    }
                }
            }
            return { id, name, duration, order, folderOrder, markers, bones: boneTracks, slots: slotTracks, deform };
        }),
        'duplicate animation id',
    );
    return { skeletonIndex: selected, skeletonNames, bones, slots, clips, images, skins, folders };
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
    const xy = list(r.vertices, uvs.length, 'mesh vertices').map((v) => num(v, 'mesh coordinate'));
    let weights: Influence[][] | null = null;
    let deformSize = uvs.length;
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
    } else if (xy.length !== uvs.length) fail('one plain XY pair required for each UV');
    return { kind: 'mesh', path, color: color(r.color, path), xy, uvs, indices, weights, deformSize, link };
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
export function sampleBone2dProject(project: Bone2dProject, clipId: string | null, seconds: number): Bone2dSample {
    const clip = clipId === null ? undefined : project.clips.get(clipId);
    if (clipId !== null && !clip) fail(`unknown animation: ${clipId}`);
    if (!Number.isFinite(seconds)) fail('invalid sample time');
    const time = Math.max(0, Math.min(seconds, clip?.duration ?? 0));
    const bones = new Map(
        project.bones.map((b): [string, Bone2dPose] => {
            const track = clip?.bones.get(b.id);
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
    const slots = new Map(
        project.slots.map((s): [string, Bone2dSlotPose] => {
            const track = clip?.slots.get(s.id);
            const key = track ? last(track.attachment, time) : -1;
            const tint = sampled(track?.rgba, time);
            const attachment = key >= 0 ? track!.attachment[key].value : s.attachment;
            return [
                s.id,
                {
                    attachment,
                    color: tint ? (tint.map((v) => Math.max(0, Math.min(1, v))) as unknown as RGBA) : s.color,
                },
            ];
        }),
    );
    const i = clip ? last(clip.order, time) : -1;
    const meshDeltas = new Map<Bone2dMesh, readonly number[]>();
    for (const [mesh, track] of clip?.deform ?? []) {
        const deltas = sampled(track, time);
        if (deltas) meshDeltas.set(mesh, deltas);
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
    return { bones, slots, meshDeltas, order };
}

/** Resolve ordered parent/local 2D affine products without decomposing shear. */
export function bone2dWorldMatrices(project: Bone2dProject, sample: Bone2dSample): ReadonlyMap<string, Matrix2D> {
    const out = new Map<string, Matrix2D>(),
        parents = new Map(project.bones.map((b) => [b.id, b.parent] as const));
    const compute = (id: string): Matrix2D => {
        const known = out.get(id);
        if (known) return known;
        const [x, y, degrees, sx, sy] = sample.bones.get(id)!;
        const r = (degrees * Math.PI) / 180,
            cos = Math.cos(r),
            sin = Math.sin(r);
        const a = cos * sx,
            b = -sin * sy,
            c = sin * sx,
            d = cos * sy;
        const parent = parents.get(id);
        let m: Matrix2D = [a, b, c, d, x, y];
        if (parent != null) {
            const [pa, pb, pc, pd, px, py] = compute(parent);
            m = [
                pa * a + pb * c,
                pa * b + pb * d,
                pc * a + pd * c,
                pc * b + pd * d,
                pa * x + pb * y + px,
                pc * x + pd * y + py,
            ];
        }
        out.set(id, m);
        return m;
    };
    for (const bone of project.bones) compute(bone.id);
    return out;
}

/** Build a mesh in player-root coordinates. Weighted deform offsets are per influence, not per final vertex. */
export function bone2dMeshPositions(
    mesh: Bone2dMesh,
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
