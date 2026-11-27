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
export interface Bone2dSavedPlayback {
    readonly loop: boolean;
    readonly pingPong: boolean;
    readonly range: readonly [number, number] | null;
}
export interface Bone2dPlaybackOptions {
    /** Start from the settings recorded in the editor, then apply any explicit overrides below. */
    readonly useSavedSettings?: boolean;
    readonly loop?: boolean;
    readonly pingPong?: boolean;
    readonly range?: readonly [number, number] | null;
    readonly speed?: number;
    readonly direction?: 1 | -1;
}
export interface Playback {
    readonly lo: number;
    readonly hi: number;
    readonly loop: boolean;
    readonly pingPong: boolean;
    readonly speed: number;
    readonly initialDirection: 1 | -1;
}
export interface PlaybackCursor {
    readonly time: number;
    readonly direction: 1 | -1;
    readonly first: boolean;
}
export type PlaybackWindow = readonly [from: number, to: number, includeStart: boolean];
export const playbackBudget = 8192;

export function makeBone2dPlayback(
    duration: number,
    saved: Bone2dSavedPlayback,
    options: boolean | Bone2dPlaybackOptions,
    fail: (message: string) => never,
): Playback {
    const full = { lo: 0, hi: duration, loop: false, pingPong: false, speed: 1, initialDirection: 1 } as const;
    if (typeof options === 'boolean') return { ...full, loop: options };
    if (options == null || typeof options !== 'object' || Array.isArray(options))
        return fail('invalid playback options');
    for (const flag of ['useSavedSettings', 'loop', 'pingPong'] as const) {
        if (options[flag] !== undefined && typeof options[flag] !== 'boolean')
            return fail('invalid playback flag: ' + flag);
    }
    const range = options.range !== undefined ? options.range : options.useSavedSettings ? saved.range : null;
    const speed = options.speed === undefined ? 1 : options.speed;
    const direction = options.direction === undefined ? 1 : options.direction;
    if (!Number.isFinite(speed) || speed <= 0) return fail('invalid playback speed');
    if (direction !== 1 && direction !== -1) return fail('invalid playback direction');
    if (
        range !== null &&
        (!Array.isArray(range) ||
            range.length !== 2 ||
            !Number.isFinite(range[0]) ||
            !Number.isFinite(range[1]) ||
            range[0] >= range[1])
    ) {
        return fail('invalid playback range');
    }
    const lo = Math.max(0, Math.min(duration, range?.[0] ?? 0));
    const hi = Math.max(0, Math.min(duration, range?.[1] ?? duration));
    return {
        lo: hi - lo >= 0.001 ? lo : 0,
        hi: hi - lo >= 0.001 ? hi : duration,
        loop: options.loop ?? (options.useSavedSettings ? saved.loop : false),
        pingPong: options.pingPong ?? (options.useSavedSettings ? saved.pingPong : false),
        speed,
        initialDirection: direction,
    };
}

export function traverseBone2dPlayback(
    playback: Playback,
    cursor: PlaybackCursor,
    deltaSeconds: number,
    fail: (message: string) => never,
): { cursor: PlaybackCursor; windows: readonly PlaybackWindow[]; stopped: boolean; elapsed: number } {
    const { lo, hi, loop, pingPong, initialDirection } = playback;
    const span = hi - lo;
    let remaining = deltaSeconds * playback.speed;
    if (!Number.isFinite(remaining)) return fail('invalid playback delta');
    if (remaining === 0) return { cursor, windows: [], stopped: false, elapsed: 0 };
    let time = cursor.time,
        direction = cursor.direction,
        include = cursor.first;
    const result = (stopped: boolean, windows: PlaybackWindow[], elapsed: number) => ({
        cursor: { time, direction, first: false },
        windows,
        stopped,
        elapsed,
    });
    if (span === 0) return result(true, [[lo, lo, include]], 0);
    const windows: PlaybackWindow[] = [];
    let elapsed = 0;
    for (;;) {
        if (windows.length >= playbackBudget) return fail('advance crosses too many playback boundaries');
        const end = direction > 0 ? hi : lo;
        const distance = Math.abs(end - time);
        // Snap only errors at the scale of the arithmetic used to compute a boundary.
        const tolerance = Number.EPSILON * 8 * Math.max(1, Math.abs(time), Math.abs(end), distance, remaining);
        if (remaining < distance - tolerance) {
            const next = time + direction * remaining;
            windows.push([time, next, include]);
            time = next;
            elapsed += remaining;
            return result(false, windows, elapsed);
        }
        if (distance > 0 || include) windows.push([time, end, include]);
        time = end;
        elapsed += distance;
        remaining = Math.max(0, remaining - distance);
        if (!pingPong) {
            if (!loop) return result(true, windows, elapsed);
            time = direction > 0 ? lo : hi;
            include = true;
            if (remaining <= tolerance) {
                windows.push([time, time, true]);
                return result(false, windows, elapsed);
            }
        } else {
            if (!loop && direction !== initialDirection) return result(true, windows, elapsed);
            direction = direction > 0 ? -1 : 1;
            include = false;
            if (remaining <= tolerance) return result(false, windows, elapsed);
        }
    }
}

export function bone2dKeysInWindow<T extends { time: number }>(keys: readonly T[], window: PlaybackWindow): T[] {
    const [from, to, include] = window;
    const bound = (time: number, equal: boolean): number => {
        let l = 0,
            r = keys.length;
        while (l < r) {
            const m = (l + r) >>> 1;
            if (keys[m].time < time || (equal && keys[m].time === time)) l = m + 1;
            else r = m;
        }
        return l;
    };
    if (to >= from) return keys.slice(bound(from, !include), bound(to, true));
    // Preserve authoring order within equal-time groups even on the return leg.
    const l = bound(to, false);
    const out: T[] = [];
    for (let r = bound(from, include); r > l;) {
        let group = r - 1;
        while (group > l && keys[group - 1].time === keys[r - 1].time) group--;
        for (let j = group; j < r; j++) out.push(keys[j]);
        r = group;
    }
    return out;
}
