/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
import type { Collider } from '../../../cocos/physics/framework/components/colliders/collider';
import type { ICollisionEvent, IContactEquation } from '../../../cocos/physics/framework/physics-interface';
import type { Box3DContactSnapshot, Box3DStepSnapshot } from './binding/facade.mjs';
import { createContactEquations } from './contact-equation';
import { worldError } from './world-binding';

export interface Box3DCollisionRoster {
    readonly low: number;
    readonly high: number;
    readonly collider: Collider;
    readonly kind: 'box' | 'sphere' | 'capsule' | 'hull' | 'mesh';
    readonly trigger: boolean;
    readonly collisionListener: boolean;
}
export interface Box3DCollisionDelivery {
    readonly event: ICollisionEvent;
}
type Pair = {
    readonly key: string;
    readonly a: Collider;
    readonly b: Collider;
    readonly contacts: readonly Box3DContactSnapshot[];
};
const nativeKey = (id: { low: number; high: number }) => `${id.high}:${id.low}`;

/** Bounded first public collision slice. Touching comes from the real native
 * b3Body_GetContactData touching flag, never AABB overlap or Node distances.
 * No trigger/sweep/joint capability is asserted by this adapter.
 */
export class Box3DCollisionEvents {
    readonly #ids = new WeakMap<Collider, number>();
    #sequence = 0;
    #lastStep = 0;
    #pairs = new Map<string, Pair>();

    private id(collider: Collider): number {
        let value = this.#ids.get(collider);
        if (value === undefined) {
            if (this.#sequence === Number.MAX_SAFE_INTEGER)
                throw worldError('AIR_E_BOX3D_CONFIG', 'collision identity', 'Logical collider identity exhausted.');
            value = ++this.#sequence;
            this.#ids.set(collider, value);
        }
        return value;
    }

    prepare(snapshot: Box3DStepSnapshot, roster: readonly Box3DCollisionRoster[]): readonly Box3DCollisionDelivery[] {
        if (snapshot.stepIndex === this.#lastStep) return Object.freeze([]);
        if (!Number.isSafeInteger(snapshot.stepIndex) || snapshot.stepIndex < this.#lastStep)
            throw worldError('AIR_E_BOX3D_ABI', 'collision events', 'Stale native step snapshot.');
        const shapes = new Map<string, Box3DCollisionRoster>();
        const listeners = new Map<Collider, boolean>();
        for (const row of roster) {
            const key = nativeKey(row);
            if (shapes.has(key)) throw worldError('AIR_E_BOX3D_ABI', 'collision roster', 'Duplicate native shape.');
            shapes.set(key, row);
            listeners.set(row.collider, row.collisionListener);
        }
        const current = new Map<string, Pair & { contacts: Box3DContactSnapshot[] }>();
        for (const contact of snapshot.contactsOfOwnedBodies) {
            const a = shapes.get(nativeKey(contact.shapeA));
            const b = shapes.get(nativeKey(contact.shapeB));
            if (!a || !b) {
                if (a?.collisionListener || b?.collisionListener)
                    throw worldError('AIR_E_BOX3D_ABI', 'collision identity', 'Contact has an unowned peer shape.');
                continue;
            }
            if (a.trigger || b.trigger || a.collider === b.collider) continue;
            if (!a.collisionListener && !b.collisionListener) continue;
            // Exact public descriptors, not the broader native hull tag. Runtime
            // compound bodies dispatch as their individual qualified child pairs.
            const qualified =
                (a.kind === 'sphere' && (b.kind === 'sphere' || b.kind === 'box' || b.kind === 'capsule')) ||
                (b.kind === 'sphere' && (a.kind === 'box' || a.kind === 'capsule')) ||
                (a.kind === 'box' && b.kind === 'box') ||
                (a.kind === 'capsule' && (b.kind === 'box' || b.kind === 'capsule')) ||
                (b.kind === 'capsule' && a.kind === 'box');
            if (!qualified)
                throw worldError(
                    'AIR_E_BOX3D_UNSUPPORTED_GEOMETRY',
                    'collision events',
                    'Contact pair is outside Sphere–Sphere, Sphere–Box, Sphere–Capsule, Box–Box, Capsule–Box and Capsule–Capsule candidates.',
                );
            // readStep is the immutable capture epoch; generation may legitimately be older
            // (sleeping/recycled contacts). Never compare generatedAfterStep to the read step.
            if (contact.geometry?.status === 'AVAILABLE' && contact.geometry.readStepIndex !== snapshot.stepIndex)
                throw worldError(
                    'AIR_E_BOX3D_ABI',
                    'collision geometry epoch',
                    'Geometry read step differs from snapshot.',
                );
            const ia = this.id(a.collider),
                ib = this.id(b.collider);
            const key = ia < ib ? `${ia}:${ib}` : `${ib}:${ia}`;
            const previous = current.get(key);
            if (previous) previous.contacts.push(contact);
            else current.set(key, { key, a: a.collider, b: b.collider, contacts: [contact] });
        }
        const deliveries: Box3DCollisionDelivery[] = [];
        const create = (pair: Pair, type: ICollisionEvent['type'], reason: string): void => {
            for (const self of [pair.a, pair.b]) {
                if (!listeners.get(self)) continue;
                const other = self === pair.a ? pair.b : pair.a;
                const contacts: IContactEquation[] = [];
                if (type !== 'onCollisionExit') {
                    for (const contact of pair.contacts) {
                        const shapeA = shapes.get(nativeKey(contact.shapeA));
                        if (!shapeA)
                            throw worldError('AIR_E_BOX3D_ABI', 'contact snapshot', 'Missing shape A identity.');
                        contacts.push(...createContactEquations(contact, shapeA.collider === self));
                    }
                    if (!contacts.length)
                        throw worldError(
                            'AIR_E_BOX3D_UNSUPPORTED_SNAPSHOT_EPOCH',
                            'collision events',
                            'No qualified contact points; no partial event was delivered.',
                        );
                }
                Object.freeze(contacts);
                const event: ICollisionEvent = Object.freeze({
                    type,
                    selfCollider: self,
                    otherCollider: other,
                    contacts,
                    impl: Object.freeze({
                        backend: 'box3d',
                        stepIndex: snapshot.stepIndex,
                        logicalPair: pair.key,
                        reason,
                        snapshotSemantics: 'CACHED_MANIFOLD_GENERATION',
                    }),
                });
                deliveries.push(Object.freeze({ event }));
            }
        };
        // Validate/copy the ENTIRE batch before any business callback is invoked.
        for (const pair of current.values())
            create(pair, this.#pairs.has(pair.key) ? 'onCollisionStay' : 'onCollisionEnter', 'native-touching');
        for (const pair of this.#pairs.values()) {
            if (current.has(pair.key)) continue;
            // Removed/disabled peers are retired silently, never a manufactured natural exit.
            if (listeners.has(pair.a) && listeners.has(pair.b))
                create(pair, 'onCollisionExit', 'native-no-longer-touching');
        }
        this.#pairs = new Map(
            Array.from(current, ([key, pair]) => [
                key,
                Object.freeze({ ...pair, contacts: Object.freeze(pair.contacts.slice()) }),
            ]),
        );
        this.#lastStep = snapshot.stepIndex;
        return Object.freeze(deliveries);
    }

    clear(): void {
        this.#pairs.clear();
    }
}
