/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
import type { Collider } from '../../../cocos/physics/framework/components/colliders/collider';
import type { ITriggerEvent } from '../../../cocos/physics/framework/physics-interface';
import type { Box3DStepSnapshot } from './binding/facade.mjs';
import type { Box3DCollisionRoster } from './collision-events';
import { worldError } from './world-binding';

interface Roster extends Box3DCollisionRoster {
    readonly triggerListener: boolean;
    readonly eventGeneration: number;
    readonly filterKey: string;
}
type NativePair = { readonly sensor: string; readonly visitor: string };
type Pair = {
    readonly key: string;
    readonly a: Roster;
    readonly b: Roster;
    readonly nativePairs: readonly NativePair[];
    readonly recipients: ReadonlySet<Collider>;
};
const nativeKey = (id: { low: number; high: number }): string => `${id.high}:${id.low}`;
const nativePairKey = (sensor: string, visitor: string): string => `${sensor}/${visitor}`;
const sameChannel = (a: Roster, b: Roster): boolean =>
    a.collider === b.collider && a.eventGeneration === b.eventGeneration && a.trigger === b.trigger;

/** Native begin/end drives membership. No endpoint overlap/AABB reconstruction:
 * this also retains native transient begins, without claiming CCD qualification.
 * Stable logical channels survive same-type geometry rebuilds, but not disable /
 * enable or trigger type transitions. Complete copied batches precede callbacks.
 */
export class Box3DTriggerEvents {
    readonly #ids = new WeakMap<Collider, number>();
    #sequence = 0;
    #lastStep = 0;
    #native = new Map<string, NativePair>();
    #pairs = new Map<string, Pair>();

    private id(collider: Collider): number {
        let value = this.#ids.get(collider);
        if (value === undefined) {
            if (this.#sequence === Number.MAX_SAFE_INTEGER)
                throw worldError('AIR_E_BOX3D_CONFIG', 'trigger identity', 'Logical identity exhausted.');
            value = ++this.#sequence;
            this.#ids.set(collider, value);
        }
        return value;
    }

    prepare(snapshot: Box3DStepSnapshot, roster: readonly Roster[]): readonly { readonly event: ITriggerEvent }[] {
        if (snapshot.stepIndex === this.#lastStep) return Object.freeze([]);
        if (!Number.isSafeInteger(snapshot.stepIndex) || snapshot.stepIndex < this.#lastStep)
            throw worldError('AIR_E_BOX3D_ABI', 'trigger events', 'Stale native step snapshot.');
        const shapes = new Map<string, Roster>(),
            colliders = new Map<Collider, Roster>();
        for (const row of roster) {
            const key = nativeKey(row);
            if (shapes.has(key) || !Number.isSafeInteger(row.eventGeneration) || row.eventGeneration < 1)
                throw worldError('AIR_E_BOX3D_ABI', 'trigger roster', 'Invalid generation or duplicate native shape.');
            const old = colliders.get(row.collider);
            if (old && !sameChannel(old, row))
                throw worldError('AIR_E_BOX3D_ABI', 'trigger roster', 'Inconsistent logical collider channel.');
            shapes.set(key, row);
            colliders.set(row.collider, row);
        }
        const active = new Map<string, NativePair>();
        for (const [key, pair] of this.#native) {
            const a = shapes.get(pair.sensor),
                b = shapes.get(pair.visitor);
            if (a?.trigger && b) active.set(key, pair);
        }
        // Ends may carry invalid full-generation IDs after native removal. They
        // retire only that exact native pair, never a newly reused shape index.
        for (const event of snapshot.sensorEnds)
            active.delete(nativePairKey(nativeKey(event.sensor), nativeKey(event.visitor)));
        for (const event of snapshot.sensorBegins) {
            const sensor = nativeKey(event.sensor),
                visitor = nativeKey(event.visitor);
            const a = shapes.get(sensor),
                b = shapes.get(visitor);
            if (event.validFlags !== 3) continue;
            if (!a || !b || !a.trigger)
                throw worldError(
                    'AIR_E_BOX3D_ABI',
                    'trigger identity',
                    'Valid native begin has an unowned sensor or visitor.',
                );
            if (a.collider !== b.collider)
                active.set(nativePairKey(sensor, visitor), Object.freeze({ sensor, visitor }));
        }
        const current = new Map<string, Pair & { nativePairs: NativePair[] }>();
        for (const pair of active.values()) {
            let a = shapes.get(pair.sensor)!,
                b = shapes.get(pair.visitor)!;
            if (
                (a.kind === 'hull' || b.kind === 'hull' || a.kind === 'mesh' || b.kind === 'mesh') &&
                (a.triggerListener || b.triggerListener)
            )
                throw worldError(
                    'AIR_E_BOX3D_UNSUPPORTED_GEOMETRY',
                    'trigger events',
                    'Public trigger qualification is limited to Box, Sphere and Capsule participants.',
                );
            const ia = this.id(a.collider),
                ib = this.id(b.collider);
            if (ia > ib) [a, b] = [b, a];
            const key = ia < ib ? `${ia}:${ib}` : `${ib}:${ia}`;
            const old = current.get(key);
            if (old) old.nativePairs.push(pair);
            else
                current.set(key, {
                    key,
                    a,
                    b,
                    nativePairs: [pair],
                    recipients: new Set([a, b].filter((row) => row.triggerListener).map((row) => row.collider)),
                });
        }
        const deliveries: { readonly event: ITriggerEvent }[] = [];
        const emit = (pair: Pair, self: Roster, type: ITriggerEvent['type'], reason: string): void => {
            const other = self.collider === pair.a.collider ? pair.b : pair.a;
            const event: ITriggerEvent = Object.freeze({
                type,
                selfCollider: self.collider,
                otherCollider: other.collider,
                impl: Object.freeze({
                    backend: 'box3d',
                    stepIndex: snapshot.stepIndex,
                    logicalPair: pair.key,
                    reason,
                    nativePairs: Object.freeze(pair.nativePairs.slice()),
                    snapshotSemantics: 'COPIED_NATIVE_SENSOR_MEMBERSHIP',
                }),
            });
            deliveries.push(Object.freeze({ event }));
        };
        // Close old channels before opening new ones. Removed/disabled channels
        // retire silently, including disable+enable between two native ticks.
        for (const pair of this.#pairs.values()) {
            const a = colliders.get(pair.a.collider),
                b = colliders.get(pair.b.collider);
            if (!a || !b) continue;
            const typeChanged = a.trigger !== pair.a.trigger || b.trigger !== pair.b.trigger;
            const continuous = sameChannel(a, pair.a) && sameChannel(b, pair.b);
            if (!typeChanged && (!continuous || current.has(pair.key))) continue;
            const reason = typeChanged
                ? 'typeChanged'
                : a.filterKey !== pair.a.filterKey || b.filterKey !== pair.b.filterKey
                  ? 'filterChanged'
                  : 'separated';
            for (const self of [a, b])
                if (self.triggerListener && pair.recipients.has(self.collider))
                    emit(pair, self, 'onTriggerExit', reason);
        }
        for (const pair of current.values()) {
            const previous = this.#pairs.get(pair.key);
            const continuous = previous && sameChannel(previous.a, pair.a) && sameChannel(previous.b, pair.b);
            for (const self of [pair.a, pair.b]) {
                if (!self.triggerListener) continue;
                emit(
                    pair,
                    self,
                    continuous && previous.recipients.has(self.collider) ? 'onTriggerStay' : 'onTriggerEnter',
                    'native-sensor-membership',
                );
            }
        }
        this.#native = active;
        this.#pairs = new Map(
            Array.from(current, ([key, pair]) => [
                key,
                Object.freeze({ ...pair, nativePairs: Object.freeze(pair.nativePairs.slice()) }),
            ]),
        );
        this.#lastStep = snapshot.stepIndex;
        return Object.freeze(deliveries);
    }

    clear(): void {
        this.#native.clear();
        this.#pairs.clear();
    }
}
