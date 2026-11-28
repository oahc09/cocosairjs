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

/** An explicit scalar channel. Authoring data names channels, never object paths. */
export interface AirMotionChannel {
    read(): number;
    write(value: number): void;
    /** Return false once this target must no longer be touched. */
    alive?(): boolean;
}

export type AirMotionPosition =
    number | { readonly label: string; readonly offset?: number } | { readonly afterEnd: number };
export type AirMotionEase = 'linear' | 'smooth' | 'outCubic' | 'spring';
export type AirMotionEntry =
    | { readonly label: string; readonly at?: AirMotionPosition }
    | { readonly group: readonly AirMotionEntry[]; readonly at?: AirMotionPosition }
    | {
          readonly channel: string;
          readonly to: number;
          readonly from?: number;
          readonly duration: number;
          readonly at?: AirMotionPosition;
          readonly ease?: AirMotionEase;
      };

export interface AirMotionTimeline {
    readonly duration: number;
    readonly time: number;
    readonly playing: boolean;
    readonly disposed: boolean;
    /** Absolute, clamped, no finish event. Does not change play/pause state. */
    seek(seconds: number): void;
    play(): void;
    pause(): void;
    /** Host-provided frame delta in seconds. This type has no scheduler. */
    advance(seconds: number): void;
    /** Pause and restore the values captured at creation (while targets are alive). */
    revert(): void;
    /** Stop and drop references without changing the visible state. */
    dispose(): void;
}

type Segment = { start: number; end: number; order: number; from?: number; to: number; ease: AirMotionEase };
type Lane = { channel: AirMotionChannel; initial: number; segments: Segment[] };
const eases = new Set<AirMotionEase>(['linear', 'smooth', 'outCubic', 'spring']);
const validName = (name: string): boolean => typeof name === 'string' && /^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/.test(name);

function finite(value: number, label: string): number {
    if (!Number.isFinite(value)) throw new RangeError(`Invalid motion ${label}`);
    return value;
}

function easeAt(ease: AirMotionEase, t: number): number {
    if (t <= 0 || t >= 1) return t;
    switch (ease) {
        case 'smooth':
            return t * t * (3 - 2 * t);
        case 'outCubic':
            return 1 - (1 - t) ** 3;
        // A damped, slightly overshooting response. Taper the residual to zero at the endpoint.
        case 'spring':
            return 1 - (1 - t) ** 2 * Math.exp(-4 * t) * Math.cos(11 * t);
        default:
            return t;
    }
}

/** Select the last-started segment (later declaration wins a tie); it holds even after ending. */
function valueAt(lane: Lane, time: number): number {
    const { segments, initial } = lane;
    let left = 0,
        right = segments.length;
    while (left < right) {
        const mid = (left + right) >>> 1;
        if (segments[mid].start <= time) left = mid + 1;
        else right = mid;
    }
    if (!left) return initial;
    const winner = segments[left - 1];
    if (time >= winner.end) return winner.to;
    const a = easeAt(winner.ease, (time - winner.start) / (winner.end - winner.start));
    return winner.from! * (1 - a) + winner.to * a;
}

/**
 * Compile a bounded, deterministic scalar timeline. Nested groups use local labels and
 * local offsets; references must name an earlier label within that group.
 */
export function createAirMotionTimeline(
    entries: readonly AirMotionEntry[],
    channels: Readonly<Record<string, AirMotionChannel>>,
    options: { readonly reducedMotion?: boolean; readonly onFinish?: () => void } = {},
): AirMotionTimeline {
    const planned = new Map<string, Segment[]>();
    let order = 0;
    const compile = (group: readonly AirMotionEntry[], base: number, depth: number): number => {
        if (!Array.isArray(group) || depth > 24) throw new RangeError('Invalid motion group');
        const labels = new Map<string, number>();
        let end = 0;
        for (const entry of group as readonly AirMotionEntry[]) {
            if (++order > 16384) throw new RangeError('Motion entry limit exceeded');
            if (!entry || typeof entry !== 'object') throw new TypeError('Invalid motion entry');
            const at = entry.at;
            let position = end;
            if (typeof at === 'number') position = at;
            else if (at !== undefined) {
                if (!at || typeof at !== 'object') throw new TypeError('Invalid motion position');
                if ('label' in at) {
                    const target = labels.get(at.label);
                    if (target === undefined) throw new Error(`Unknown motion label: ${at.label}`);
                    position = target + (at.offset ?? 0);
                } else position = end + at.afterEnd;
            }
            if (finite(position, 'position') < 0) throw new RangeError('Motion position cannot precede its group');
            const start = finite(base + position, 'start');
            if ('label' in entry) {
                if (!validName(entry.label) || labels.has(entry.label))
                    throw new Error('Invalid or duplicate motion label');
                labels.set(entry.label, position);
                end = Math.max(end, position);
            } else if ('group' in entry) {
                end = Math.max(end, finite(position + compile(entry.group, start, depth + 1), 'group end'));
            } else {
                if (!validName(entry.channel) || !Object.prototype.hasOwnProperty.call(channels, entry.channel)) {
                    throw new Error(`Unknown motion channel: ${entry.channel}`);
                }
                const ease = entry.ease ?? 'linear';
                if (!eases.has(ease) || finite(entry.duration, 'duration') < 0)
                    throw new RangeError('Invalid motion segment');
                const segment = {
                    start,
                    end: finite(start + entry.duration, 'end'),
                    order,
                    ease,
                    to: finite(entry.to, 'target'),
                    from: entry.from === undefined ? undefined : finite(entry.from, 'start value'),
                };
                const list = planned.get(entry.channel) ?? [];
                list.push(segment);
                planned.set(entry.channel, list);
                end = Math.max(end, finite(position + entry.duration, 'local end'));
            }
        }
        return end;
    };
    const duration = compile(entries, 0, 0);
    const lanes: Lane[] = [];
    for (const [name, segments] of planned) {
        const channel = channels[name];
        if (!channel || (channel.alive && !channel.alive())) throw new Error(`Unavailable motion channel: ${name}`);
        const lane = { channel, initial: finite(channel.read(), 'baseline'), segments: [] } as Lane;
        segments.sort((a, b) => a.start - b.start || a.order - b.order);
        for (const segment of segments) {
            segment.from ??= valueAt(lane, segment.start);
            lane.segments.push(segment);
        }
        lanes.push(lane);
    }

    let time = 0,
        playing = false,
        disposed = false;
    let finish = options.onFinish;
    const reducedMotion = options.reducedMotion === true;
    const sample = (t: number): void => {
        for (const lane of lanes) {
            if (!lane.channel.alive || lane.channel.alive()) lane.channel.write(finite(valueAt(lane, t), 'sample'));
        }
    };
    const complete = (): void => {
        playing = false;
        finish?.();
    };
    return {
        duration,
        get time() {
            return time;
        },
        get playing() {
            return playing;
        },
        get disposed() {
            return disposed;
        },
        seek(seconds) {
            if (disposed) return;
            time = Math.max(0, Math.min(duration, finite(seconds, 'seek')));
            sample(time);
        },
        play() {
            if (disposed || playing) return;
            if (reducedMotion || duration === 0) {
                time = duration;
                sample(time);
                complete();
                return;
            }
            if (time >= duration) time = 0;
            playing = true;
            sample(time);
        },
        pause() {
            playing = false;
        },
        advance(seconds) {
            if (!playing) return;
            if (finite(seconds, 'frame delta') < 0) throw new RangeError('Negative motion frame delta');
            time = Math.min(duration, time + seconds);
            sample(time);
            if (time >= duration && playing) complete();
        },
        revert() {
            if (disposed) return;
            playing = false;
            time = 0;
            for (const lane of lanes) {
                if (!lane.channel.alive || lane.channel.alive()) lane.channel.write(lane.initial);
            }
        },
        dispose() {
            playing = false;
            disposed = true;
            lanes.length = 0;
            finish = undefined;
        },
    };
}
