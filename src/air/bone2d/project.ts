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
/** Strict reader for the rigid subset of Bone-2D Save Project v1. No editor or Spine dependency. */
type Obj = Record<string, unknown>;
export type Bone2dPose = readonly [number, number, number, number, number];
type RGBA = readonly [number, number, number, number];
interface Region {
    path: string;
    pose: Bone2dPose;
    width: number;
    height: number;
    color: RGBA;
}
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
    regions: ReadonlyMap<string, ReadonlyMap<string, Region>>;
}
export interface Bone2dProjectOptions {
    /** Zero-based editor skeleton order. The saved active skeleton is the default. */
    readonly skeletonIndex?: number;
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
function values(x: unknown, count: number, end: number, label: string): ValueKey[] {
    // Evaluate the same ten t-intervals as the editor. Store the sampled
    // polyline per channel once; playback inverts the x-axis in that table.
    return keys(x, end, label, (o) => {
        const v = list(o.value, count, label);
        if (v.length !== count) fail(label);
        let curve: ValueKey['curve'] = 'linear';
        if (o.curve === 'stepped') curve = 'stepped';
        else if (o.curve !== undefined) {
            const control = list(o.curve, 4 * count, label);
            if (control.length !== 4 * count) fail(label);
            curve = Array.from({ length: count }, (_, channel) => {
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
    none(sk.drawOrderFolders, 'draw order folders');
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
    const skins = index(
        list(sk.skins, 128, 'skins').map((raw): Skin => {
            const o = obj(raw, 'skin');
            const id = str(o.id, 'skin id'),
                name = str(o.name, 'skin name');
            none(o.bones, 'skin-required bones');
            none(o.constraints, 'skin-required constraints');
            const bySlotRegion = new Map<string, Map<string, Region>>();
            for (const [slotId, rawRegions] of entries(o.attachments, 'skin attachments')) {
                if (!bySlot.has(slotId)) fail(`unknown skin slot: ${slotId}`);
                const regions = new Map<string, Region>();
                for (const [attachment, rawRegion] of entries(rawRegions, 'regions')) {
                    const r = obj(rawRegion, 'attachment');
                    if (r.type !== 'region' || r.sequence != null)
                        fail(`non-rigid or sequence attachment: ${slotId}/${attachment}`, true);
                    const path = str(r.path, 'region image name');
                    if (!images.has(path)) fail(`unknown image: ${path}`);
                    regions.set(attachment, {
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
            for (const k of ['ik', 'transform', 'slider', 'path', 'physics', 'deform', 'sequence', 'drawOrderFolder'])
                none(o[k], k);
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
            const order = keys(o.drawOrder, duration, 'draw order', (k) => {
                const ids = list(k.order, slots.length, 'slot order').map((v) => str(v, 'slot id'));
                const set = new Set(ids);
                if (set.size !== ids.length || ids.some((slotId) => !bySlot.has(slotId))) fail('invalid draw order');
                return ids.concat(slots.filter((s) => !set.has(s.id)).map((s) => s.id));
            });
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
            return { id, name, duration, order, markers, bones: boneTracks, slots: slotTracks };
        }),
        'duplicate animation id',
    );
    return { skeletonIndex: selected, skeletonNames, bones, slots, clips, images, skins };
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
            const p = (curve as number[][])[j];
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
    return { bones, slots, order: i >= 0 ? clip!.order[i].value : project.slots.map((s) => s.id) };
}
