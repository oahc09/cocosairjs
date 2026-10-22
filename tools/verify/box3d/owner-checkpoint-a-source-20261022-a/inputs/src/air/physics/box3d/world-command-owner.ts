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
import { Node } from '../../../cocos/scene-graph/node';
import { PhysicsSystem } from '../../../cocos/physics/framework/physics-system';
import type { RigidBody } from '../../../cocos/physics/framework/components/rigid-body';
import type { Collider } from '../../../cocos/physics/framework/components/colliders/collider';
import type { PhysicsMaterial } from '../../../cocos/physics/framework/assets/physics-material';
import { registerMutationGuard } from '../../../cocos/core/data/mutation-guard';
import type { MutationGuardLease } from '../../../cocos/core/data/mutation-guard';
import { registerNodeTransformGuard } from '../../../cocos/scene-graph/node-transform-validation';
import type {
    NodeTransformGuardLease,
    NodeTransformWriteOperation,
} from '../../../cocos/scene-graph/node-transform-validation';
import type { Box3DBodyState, Box3DId } from './binding/facade.mjs';
import { Box3DCommandQueue } from './command-queue';
import { worldError } from './world-binding';

/** Internal environment only. Not an AIR app option, singleton lookup or public capability. */
export interface Box3DWorldOwnerEnvironment {
    readonly physicsSystem: () => PhysicsSystem;
}
export interface Box3DOwnedBodySeed {
    readonly node: Node;
    readonly ancestry: readonly Node[];
    readonly preflight: () => void;
    readonly readCommitted: () => Readonly<Box3DBodyState>;
    readonly resolveNative: () => Box3DId;
}
export interface Box3DOwnedComponentSeed {
    readonly adapter: object;
    readonly component: RigidBody | Collider;
    readonly kind: 'rigid-body' | 'collider';
    readonly material: PhysicsMaterial | null;
}
export interface Box3DOwnerFenceScope {
    advance(next: 'solving' | 'writeback'): void;
    write(node: Node, operation: NodeTransformWriteOperation, expected: readonly number[], perform: () => void): void;
    dispose(): void;
}
type Phase = 'idle' | 'preflight' | 'solving' | 'writeback' | 'dispatch' | 'faulted' | 'closed';
type BodyRecord = Readonly<Box3DOwnedBodySeed>;
type ComponentRecord = {
    readonly body: object;
    readonly component: RigidBody | Collider;
    readonly kind: 'rigid-body' | 'collider';
    material: PhysicsMaterial | null;
    initialized: boolean;
    enabled: boolean;
};
const rejection = Object.freeze({
    code: 'AIR_E_BOX3D_REENTRANT',
    message: 'A Box3D-owned temporary step or dispatch scope forbids this mutation',
});
const activationBlockers = Object.freeze([
    'command-consumer-not-installed',
    'material-cache-and-clone-identity-notifications',
    'immediate-system-pause-notification',
    'complete-early-entry-qualification',
    'persistent-target-grant-budget',
]);
function object(value: unknown, operation: string): asserts value is object {
    if (!value || typeof value !== 'object')
        throw worldError('AIR_E_BOX3D_CONFIG', operation, 'Expected object identity.');
}

/** Checkpoint A: logical ownership and temporary fences only. No command submit,
 * native execution, public handles or successful unified-transaction activation.
 * Stored native resolver closures remain private and are not called in this phase.
 */
export class Box3DWorldCommandOwner {
    readonly #system: PhysicsSystem;
    readonly #queue: Box3DCommandQueue;
    readonly #bodies = new Map<object, BodyRecord>();
    readonly #components = new Map<object, ComponentRecord>();
    #defaultMaterial: PhysicsMaterial | null = null;
    #phase: Phase = 'idle';
    #scope: Box3DOwnerFenceScope | null = null;

    constructor(generation: number, system: PhysicsSystem) {
        if (!(system instanceof PhysicsSystem))
            throw worldError('AIR_E_BOX3D_CONFIG', 'world owner', 'Expected the actual Cocos PhysicsSystem instance.');
        this.#system = system;
        this.#queue = new Box3DCommandQueue({ generation });
    }
    assertConfiguration(operation: string): void {
        if (this.#phase !== 'idle')
            throw worldError(
                this.#phase === 'faulted'
                    ? 'AIR_E_BOX3D_WORLD_FAULTED'
                    : this.#phase === 'closed'
                      ? 'AIR_E_BOX3D_DISPOSED'
                      : 'AIR_E_BOX3D_REENTRANT',
                operation,
                `Owner configuration is unavailable during ${this.#phase}.`,
            );
    }
    assertCommittedRead(operation: string): void {
        if (this.#phase === 'solving' || this.#phase === 'faulted' || this.#phase === 'closed')
            throw worldError(
                this.#phase === 'faulted'
                    ? 'AIR_E_BOX3D_WORLD_FAULTED'
                    : this.#phase === 'closed'
                      ? 'AIR_E_BOX3D_DISPOSED'
                      : 'AIR_E_BOX3D_REENTRANT',
                operation,
                `Committed native reads are unavailable during ${this.#phase}.`,
            );
    }
    adoptBody(seed: Box3DOwnedBodySeed): object {
        this.assertConfiguration('adopt body');
        const node = seed.node;
        if (!(node instanceof Node) || !Array.isArray(seed.ancestry) || !seed.ancestry.includes(node))
            throw worldError('AIR_E_BOX3D_CONFIG', 'adopt body', 'Expected original Node ancestry.');
        const ancestry = Object.freeze(Array.from(new Set(seed.ancestry)));
        if (ancestry.some((value) => !(value instanceof Node)))
            throw worldError('AIR_E_BOX3D_CONFIG', 'adopt body', 'Invalid ancestor identity.');
        const preflight = seed.preflight,
            readCommitted = seed.readCommitted,
            resolveNative = seed.resolveNative;
        if ([preflight, readCommitted, resolveNative].some((fn) => typeof fn !== 'function'))
            throw worldError('AIR_E_BOX3D_CONFIG', 'adopt body', 'Expected private body accessors.');
        const record = Object.freeze({ node, ancestry, preflight, readCommitted, resolveNative });
        const key = Object.freeze({});
        this.#queue.registerBody(key);
        this.#bodies.set(key, record);
        return key;
    }
    attachComponent(body: object, seed: Box3DOwnedComponentSeed): void {
        this.assertConfiguration('attach component identity');
        const owned = this.#bodies.get(body);
        const adapter = seed.adapter,
            component = seed.component,
            kind = seed.kind,
            material = seed.material;
        object(adapter, 'component adapter');
        object(component, 'actual component');
        if (
            !owned ||
            this.#components.has(adapter) ||
            component.node !== owned.node ||
            !['rigid-body', 'collider'].includes(kind)
        )
            throw worldError(
                'AIR_E_BOX3D_CONFIG',
                'attach component identity',
                'Invalid or duplicate body/component ownership.',
            );
        if (material !== null) object(material, 'component material identity');
        this.#components.set(adapter, { body, component, kind, material, initialized: false, enabled: false });
    }
    #component(adapter: object): ComponentRecord {
        const value = this.#components.get(adapter);
        if (!value) throw worldError('AIR_E_BOX3D_DISPOSED', 'component identity', 'Unknown component adapter.');
        return value;
    }
    completeComponent(adapter: object): void {
        this.assertConfiguration('complete component identity');
        this.#component(adapter).initialized = true;
    }
    commitComponentEnabled(adapter: object, enabled: boolean): void {
        if (!enabled && (this.#phase === 'faulted' || this.#phase === 'closed')) return;
        this.assertConfiguration('component activity');
        if (typeof enabled !== 'boolean')
            throw worldError('AIR_E_BOX3D_CONFIG', 'component activity', 'Expected boolean.');
        const record = this.#component(adapter);
        if (!record.initialized)
            throw worldError('AIR_E_BOX3D_CONFIG', 'component activity', 'Initialization is incomplete.');
        record.enabled = enabled;
    }
    /** Adapter-observed input, NOT proof of the later public cache/listener commit. */
    observeColliderMaterial(adapter: object, material: PhysicsMaterial | null): void {
        this.assertConfiguration('observe material identity');
        const record = this.#component(adapter);
        if (record.kind !== 'collider')
            throw worldError('AIR_E_BOX3D_CONFIG', 'observe material identity', 'Expected Collider.');
        if (material !== null) object(material, 'material identity');
        record.material = material;
    }
    observeDefaultMaterial(material: PhysicsMaterial): void {
        this.assertConfiguration('observe default material identity');
        object(material, 'default material identity');
        this.#defaultMaterial = material;
    }
    releaseComponentAfterCleanup(adapter: object): void {
        if (this.#phase === 'closed') return;
        if (this.#phase !== 'faulted') this.assertConfiguration('release component identity');
        this.#components.delete(adapter);
    }
    retireBodyAfterDestroy(body: object): void {
        this.assertConfiguration('retire body identity');
        if (!this.#bodies.has(body) || [...this.#components.values()].some((value) => value.body === body))
            throw worldError(
                'AIR_E_BOX3D_CONFIG',
                'retire body identity',
                'Body is foreign or still has component ownership.',
            );
        this.#queue.releaseBodyAfterTeardown(body);
        this.#bodies.delete(body);
    }
    #materials(): Set<PhysicsMaterial> {
        const result = new Set<PhysicsMaterial>();
        if (this.#defaultMaterial) result.add(this.#defaultMaterial);
        for (const component of this.#components.values()) if (component.material) result.add(component.material);
        return result;
    }
    #begin(phase: 'preflight' | 'dispatch'): Box3DOwnerFenceScope {
        this.assertConfiguration('begin temporary scope');
        // Private records only: no component/material getter or caller iterator executes here.
        const nodes = new Set<Node>();
        for (const body of this.#bodies.values()) for (const node of body.ancestry) nodes.add(node);
        const targets = Object.freeze([
            this.#system,
            Node.prototype,
            ...nodes,
            ...Array.from(this.#components.values(), (value) => value.component),
            ...this.#materials(),
        ]);
        let mutation: MutationGuardLease | undefined;
        let transform: NodeTransformGuardLease | undefined;
        this.#phase = phase;
        try {
            mutation = registerMutationGuard(targets, rejection);
            if (nodes.size) transform = registerNodeTransformGuard(Object.freeze(Array.from(nodes)), rejection);
        } catch (error) {
            try {
                mutation?.dispose();
            } finally {
                this.#phase = 'idle';
            }
            throw error;
        }
        const owned = this;
        let disposed = false;
        const scope: Box3DOwnerFenceScope = Object.freeze({
            advance(next: 'solving' | 'writeback'): void {
                if (
                    disposed ||
                    owned.#scope !== scope ||
                    !(
                        (owned.#phase === 'preflight' && next === 'solving') ||
                        (owned.#phase === 'solving' && next === 'writeback')
                    )
                )
                    throw worldError('AIR_E_BOX3D_REENTRANT', 'scope phase', 'Invalid private phase transition.');
                owned.#phase = next;
            },
            write(
                node: Node,
                operation: NodeTransformWriteOperation,
                expected: readonly number[],
                perform: () => void,
            ): void {
                if (
                    disposed ||
                    owned.#scope !== scope ||
                    owned.#phase !== 'writeback' ||
                    !transform ||
                    !nodes.has(node)
                )
                    throw worldError(
                        'AIR_E_BOX3D_REENTRANT',
                        'owned write',
                        'No active exact-write scope for this Node.',
                    );
                transform.write(node, operation, expected, perform);
            },
            dispose(): void {
                if (disposed) return;
                let failed = false,
                    failure: unknown;
                try {
                    transform?.dispose();
                } catch (error) {
                    failed = true;
                    failure = error;
                }
                try {
                    mutation?.dispose();
                } catch (error) {
                    if (!failed) failure = error;
                    failed = true;
                }
                if (failed) {
                    owned.#phase = 'faulted';
                    throw failure;
                }
                disposed = true;
                if (owned.#scope === scope) owned.#scope = null;
                if (owned.#phase !== 'faulted' && owned.#phase !== 'closed') owned.#phase = 'idle';
            },
        });
        this.#scope = scope;
        return scope;
    }
    beginStep(): Box3DOwnerFenceScope {
        return this.#begin('preflight');
    }
    beginDispatch(): Box3DOwnerFenceScope {
        return this.#begin('dispatch');
    }
    fault(): void {
        if (this.#phase !== 'closed') this.#phase = 'faulted';
    }
    closeAfterWorldTeardown(): void {
        this.#scope?.dispose();
        this.#queue.close();
        this.#components.clear();
        this.#bodies.clear();
        this.#defaultMaterial = null;
        this.#phase = 'closed';
    }
    diagnostics() {
        return Object.freeze({
            phase: this.#phase,
            bodies: this.#bodies.size,
            components: this.#components.size,
            disabledComponents: [...this.#components.values()].filter((value) => !value.enabled).length,
            materials: this.#materials().size,
            activeTemporaryScopes: this.#scope ? 1 : 0,
            pendingCommands: this.#queue.diagnostics().pending.length,
            stagedCommandsSupported: false,
            unifiedTransactionsSupported: false,
            materialIdentityTracking: 'adapter-observed-only',
            activationBlockers,
        });
    }
}
