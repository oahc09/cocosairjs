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
import { Vec2, Vec3, Rect, Quat, Color } from '../../cocos/core';
import type { IVec2Like } from '../../cocos/core';
import {
    PhysicsSystem2D,
    RigidBody2D,
    Collider2D,
    BoxCollider2D,
    CircleCollider2D,
    PolygonCollider2D,
    Joint2D,
    MouseJoint2D,
    ERigidBody2DType,
    ERaycast2DType,
    Contact2DType,
    PHYSICS_2D_PTM_RATIO,
} from '../../cocos/physics-2d/framework';
import { selector } from '../../cocos/physics-2d/framework/physics-selector';
import { ConvexPartition } from '../../cocos/physics-2d/framework/utils/polygon-partition';
import { Graphics } from '../../cocos/2d/components/graphics';
import { Node } from '../../cocos/scene-graph';
import { Canvas } from '../../cocos/2d/framework/canvas';
import { UITransform } from '../../cocos/2d/framework/ui-transform';
import { director } from '../../cocos/game';
import { input, Input } from '../../cocos/input';
import { EventTouch } from '../../cocos/input/types/event';

const PTM = PHYSICS_2D_PTM_RATIO;
const RAD = Math.PI / 180;
const defaultAssetBase = '__AIR_BOX2D_ASSET_BASE__';
type XY = { x: number; y: number };
type Config = Record<string, unknown>;
interface Observation {
    a: number;
    b: number;
    id?: string;
    /** Present on post-step snapshots; sleeping contacts are retained but were not solved. */
    solved?: boolean;
    normal: XY;
    points: {
        x: number;
        y: number;
        separation: number;
        normalImpulse: number;
        tangentImpulse: number;
        localA: XY;
        localB: XY;
    }[];
}
interface BodyState {
    x: number;
    y: number;
    angle: number;
    vx: number;
    vy: number;
    av: number;
    awake: boolean;
    enabled: boolean;
    mass: number;
    inertia: number;
    localCenter: XY;
    worldCenter: XY;
}
/** @internal Native module contract; handles are monotonic and scoped to this module instance. */
export interface Box2D3Module {
    createWorld(gravity: XY, pre: (data: Observation, continuous: boolean) => Config): number;
    destroyWorld(world: number): void;
    createBody(world: number, config: Config): number;
    destroyBody(body: number): void;
    bodyState(body: number): BodyState;
    bodyCommand(body: number, command: string, config: Config): void;
    createShape(body: number, kind: string, config: Config): number;
    destroyShape(shape: number): void;
    shapeFilter(shape: number, category: number, mask: number): void;
    shapeBounds(shape: number): { lower: XY; upper: XY };
    createJoint(world: number, kind: string, a: number, b: number, config: Config): number;
    destroyJoint(joint: number): void;
    jointValid(joint: number): boolean;
    jointTarget(joint: number, x: number, y: number): void;
    step(world: number, delta: number, subSteps: number): void;
    contacts(world: number): Observation[];
    events(world: number): { begin: { a: number; b: number }[]; end: { a: number; b: number }[] };
    query(world: number, kind: string, config: Config): any[];
    worldCommand(world: number, command: string, config: Config): void;
    stats(world: number): { bodies: number; shapes: number; joints: number; contacts: number; worlds: number };
}
export interface Box2D3Options {
    /** Directory containing air-box2d.mjs and air-box2d.wasm. Defaults beside the main runtime. */
    assetBaseUrl?: string;
    /** Solver subdivisions per fixed physics tick, independent of PhysicsSystem2D.maxSubSteps. Default 4. */
    subStepCount?: number;
}
/** A scoped application acquisition; direct loadBox2D3 consumers retain a persistent module pin. */
export interface Box2D3Lease {
    readonly generation: number;
    /** Selects the lease's backend; the subsequently constructed world belongs only to this lease. */
    select(): void;
    /** Drops only this lease's references after its world is destroyed; native memory is GC-managed. */
    dispose(): Promise<Readonly<{ retained: readonly string[] }>>;
}
interface Box2D3LeaseState {
    state: Box2D3LoadState;
    world?: Box2D3World;
    released: boolean;
}
interface Box2D3LoadState {
    generation: number;
    base: string;
    count: number;
    pinned: boolean;
    waiters: number;
    leases: Set<Box2D3LeaseState>;
    promise: Promise<void>;
    module?: Box2D3Module;
    cleanupFailure?: string;
}
let native: Box2D3Module | undefined;
let activeLoad: Box2D3LoadState | undefined;
let selectedLease: Box2D3LeaseState | undefined;
let loadGeneration = 0;
let subSteps = 4;

function prepareBox2D3(options: Box2D3Options, pin: boolean): Box2D3LoadState {
    const count = options.subStepCount ?? 4;
    if (!Number.isInteger(count) || count < 1 || count > 64) throw new Error('BOX2D3_SUBSTEPS: expected integer 1..64');
    const base = new URL(
        options.assetBaseUrl ?? (defaultAssetBase.startsWith('__') ? 'build/box2d3/' : defaultAssetBase),
        document.baseURI,
    ).href;
    if (activeLoad) {
        if (activeLoad.base !== base || activeLoad.count !== count) throw new Error('BOX2D3_CONFIG_CONFLICT');
        if (activeLoad.cleanupFailure) throw new Error('BOX2D3_CLEANUP_FAILED: retained native references');
        // A direct consumer may arrive while the shared load is still pending.
        if (pin) activeLoad.pinned = true;
        return activeLoad;
    }
    const state: Box2D3LoadState = {
        generation: ++loadGeneration,
        base,
        count,
        pinned: pin,
        waiters: 0,
        leases: new Set(),
        promise: undefined as unknown as Promise<void>,
    };
    activeLoad = state;
    state.promise = Promise.resolve()
        .then(async () => {
            const wasm = new URL('air-box2d.wasm', base).href;
            const response = await fetch(wasm);
            if (!response.ok) throw new Error(`BOX2D3_LOAD: HTTP ${response.status}: ${wasm}`);
            const module = await import(new URL('air-box2d.mjs', base).href);
            const instance = await module.default({ wasmBinary: await response.arrayBuffer() });
            if (typeof instance.createWorld !== 'function' || typeof instance.createJoint !== 'function')
                throw new Error('BOX2D3_ABI: invalid module');
            if (activeLoad !== state) throw new Error('BOX2D3_STALE_LOAD');
            state.module = instance;
            native = instance;
            subSteps = count;
        })
        .catch((error) => {
            if (activeLoad === state) activeLoad = undefined;
            throw error;
        });
    return state;
}

/** Load and persistently pin the optional module. Does not select a backend or create a world. */
export function loadBox2D3(options: Box2D3Options = {}): Promise<void> {
    try {
        return prepareBox2D3(options, true).promise;
    } catch (error) {
        return Promise.reject(error);
    }
}

/** Independent leases share one in-flight module but never dispose another lease's world. */
export function acquireBox2D3(options: Box2D3Options = {}): Promise<Box2D3Lease> {
    let state: Box2D3LoadState;
    try {
        state = prepareBox2D3(options, false);
    } catch (error) {
        return Promise.reject(error);
    }
    state.waiters++;
    return state.promise.then(
        () => {
            state.waiters--;
            const owner: Box2D3LeaseState = { state, released: false };
            state.leases.add(owner);
            let closing: Promise<Readonly<{ retained: readonly string[] }>> | undefined;
            return Object.freeze({
                generation: state.generation,
                select() {
                    if (owner.released || closing || activeLoad !== state) throw new Error('BOX2D3_LEASE_CLOSED');
                    if (selectedLease && selectedLease !== owner) throw new Error('BOX2D3_WORLD_OWNER_CONFLICT');
                    selectOwnedPhysics2DBackend('box2d-v3-wasm', owner);
                },
                dispose() {
                    if (closing) return closing;
                    closing = Promise.resolve().then(() => {
                        try {
                            owner.world?.destroy();
                        } catch (error) {
                            state.cleanupFailure = String(error);
                            throw error;
                        }
                        owner.released = true;
                        owner.world = undefined;
                        state.leases.delete(owner);
                        if (selectedLease === owner) selectedLease = undefined;
                        const retained: string[] = [];
                        if (state.pinned) retained.push('box2d3-module:direct-consumer-pin');
                        if (state.leases.size || state.waiters) retained.push('box2d3-module:other-acquisitions');
                        if (state.cleanupFailure) retained.push('box2d3-module:cleanup-failed');
                        if (!retained.length && activeLoad === state) {
                            // No explicit native heap destructor exists. These drops only make GC possible.
                            native = undefined;
                            state.module = undefined;
                            activeLoad = undefined;
                        }
                        return Object.freeze({ retained: Object.freeze(retained) });
                    });
                    return closing;
                },
            });
        },
        (error) => {
            state.waiters--;
            throw error;
        },
    );
}

/** Internal lifecycle diagnostics; reference release is not evidence of immediate WASM heap reclamation. */
export function getBox2D3PreparationInfo(): Readonly<{
    generation: number;
    pinned: boolean;
    leases: number;
    pendingAcquisitions: number;
    moduleReferenced: boolean;
    cleanupFailure: string | null;
}> {
    return Object.freeze({
        generation: activeLoad?.generation ?? loadGeneration,
        pinned: activeLoad?.pinned ?? false,
        leases: activeLoad?.leases.size ?? 0,
        pendingAcquisitions: activeLoad?.waiters ?? 0,
        moduleReferenced: !!native,
        cleanupFailure: activeLoad?.cleanupFailure ?? null,
    });
}
function api(): Box2D3Module {
    if (!native) throw new Error('BOX2D3_NOT_READY: await loadBox2D3 before initialization');
    return native;
}
function world(): Box2D3World {
    return PhysicsSystem2D.instance.physicsWorld as unknown as Box2D3World;
}
function angle(node: Node): number {
    const out = new Vec3();
    Quat.toEulerInYXZOrder(out, node.worldRotation);
    return out.z * RAD;
}
function rotate(p: XY, a: number): XY {
    return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) };
}
function pair(a: number, b: number): string {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Select once, before the 2D system creates its world. Called by createAirApp. */
export function selectPhysics2DBackend(backend: 'box2d' | 'box2d-v3-wasm'): void {
    selectOwnedPhysics2DBackend(backend);
}
function selectOwnedPhysics2DBackend(backend: 'box2d' | 'box2d-v3-wasm', owner?: Box2D3LeaseState): void {
    if (selector.physicsWorld) throw new Error('BOX2D3_LATE_SELECTION: backend selection requires a fresh runtime');
    if (selectedLease && selectedLease !== owner) throw new Error('BOX2D3_WORLD_OWNER_CONFLICT');
    if (backend === 'box2d') {
        const wrapper = selector.backend.box2d;
        if (!wrapper) throw new Error('BOX2D_BACKEND_MISSING');
        selector.register('box2d', wrapper);
        return;
    }
    api();
    selectedLease = owner;
    selector.register('box2d-v3-wasm', {
        PhysicsWorld: Box2D3World,
        RigidBody: Box2D3Body,
        BoxShape: Box2D3Shape,
        CircleShape: Box2D3Shape,
        PolygonShape: Box2D3Shape,
        DistanceJoint: DistanceJoint,
        SpringJoint: SpringJoint,
        FixedJoint: FixedJoint,
        RelativeJoint: RelativeJoint,
        MouseJoint: MouseJoint,
        SliderJoint: SliderJoint,
        WheelJoint: WheelJoint,
        HingeJoint: HingeJoint,
    });
}
/** Release native worlds after scene components have been destroyed. Idempotent. */
export function disposeBox2D3(): void {
    if (selector.id === 'box2d-v3-wasm' && selector.physicsWorld)
        (selector.physicsWorld as unknown as Box2D3World).destroy();
}
/** Backend-specific observability for diagnostics and resource acceptance. */
export function getBox2D3Stats(): ReturnType<Box2D3Module['stats']> | null {
    return selector.id === 'box2d-v3-wasm' && selector.physicsWorld
        ? (selector.physicsWorld as unknown as Box2D3World).stats()
        : null;
}

class Box2D3World {
    impl: number;
    groundBodyImpl: number;
    private drawFlags = 0;
    get debugDrawFlags(): number {
        return this.drawFlags;
    }
    set debugDrawFlags(value: number) {
        this.drawFlags = value;
        if (this.debug?.isValid) {
            this.debug.node.active = !!value;
            if (!value) this.debug.clear();
        }
    }
    bodies = new Set<Box2D3Body>();
    shapes = new Map<number, Box2D3Shape>();
    joints = new Set<BaseJoint>();
    private contacts = new Map<string, Contact>();
    private seen = new Set<string>();
    private disabledStep = new Set<string>();
    private deferred: (() => void)[] = [];
    private stepping = false;
    private debug?: Graphics;
    constructor() {
        this.impl = api().createWorld({ x: 0, y: -10 }, (o, continuous) => this.preSolve(o, continuous));
        // Capture actual acquisition before ground-body creation can fail.
        if (selectedLease && !selectedLease.released) selectedLease.world = this;
        this.groundBodyImpl = api().createBody(this.impl, { type: 0 });
    }
    mutate(action: () => void): void {
        if (this.stepping) this.deferred.push(action);
        else action();
    }
    stats(): ReturnType<Box2D3Module['stats']> {
        return this.impl ? api().stats(this.impl) : { bodies: 0, shapes: 0, joints: 0, contacts: 0, worlds: 0 };
    }
    setGravity(v: XY): void {
        this.mutate(() => api().worldCommand(this.impl, 'gravity', { ...v }));
    }
    setAllowSleep(v: boolean): void {
        this.mutate(() => api().worldCommand(this.impl, 'allowSleep', { value: v }));
    }
    private contact(o: Observation): Contact {
        const key = pair(o.a, o.b);
        let c = this.contacts.get(key);
        if (!c) {
            c = new Contact(this, o);
            this.contacts.set(key, c);
            c.emit(Contact2DType.BEGIN_CONTACT);
        }
        c.observation = o;
        return c;
    }
    private preSolve(o: Observation, continuous: boolean): Config {
        if (!this.shapes.has(o.a) || !this.shapes.has(o.b)) return {};
        this.seen.add(pair(o.a, o.b));
        const c = this.contact(o);
        if (!continuous) c.emit(Contact2DType.PRE_SOLVE);
        const key = pair(o.a, o.b);
        if (c.disabledOnce) this.disabledStep.add(key);
        const disabled = c.disabled || c.disabledOnce || this.disabledStep.has(key);
        if (!continuous) c.disabledOnce = false;
        return { disabled, friction: c.friction ?? -1, restitution: c.restitution ?? -1, tangentSpeed: c.tangentSpeed };
    }
    step(dt: number): void {
        if (!this.impl) throw new Error('BOX2D3_WORLD_CLOSED');
        this.seen.clear();
        this.disabledStep.clear();
        for (const b of this.bodies) b.animate(dt);
        this.stepping = true;
        try {
            api().step(this.impl, dt, subSteps);
            for (const o of api().contacts(this.impl)) {
                this.seen.add(pair(o.a, o.b));
                if (!this.shapes.has(o.a) || !this.shapes.has(o.b)) continue;
                const c = this.contact(o);
                if (!o.solved) continue;
                c.post = true;
                c.emit(Contact2DType.POST_SOLVE);
                c.post = false;
            }
            const events = api().events(this.impl);
            for (const e of events.begin)
                if (this.shapes.has(e.a) && this.shapes.has(e.b))
                    this.contact({ ...e, normal: { x: 0, y: 0 }, points: [] });
            for (const e of events.end) this.end(pair(e.a, e.b));
            for (const [key, c] of this.contacts) {
                if (c.colliderA?.sensor || c.colliderB?.sensor) continue;
                if (!this.seen.has(key)) this.end(key);
            }
        } finally {
            this.stepping = false;
        }
        const actions = this.deferred.splice(0);
        for (const action of actions) action();
    }
    end(key: string): void {
        const c = this.contacts.get(key);
        if (c) {
            this.contacts.delete(key);
            c.touching = false;
            c.emit(Contact2DType.END_CONTACT);
        }
    }
    removeShape(id: number): void {
        for (const [key, c] of this.contacts) if (c.observation.a === id || c.observation.b === id) this.end(key);
        this.shapes.delete(id);
        api().destroyShape(id);
    }
    syncSceneToPhysics(): void {
        for (const b of this.bodies) b.syncSceneToPhysics();
        for (const s of new Set(this.shapes.values())) s.sync();
    }
    syncPhysicsToScene(): void {
        for (const b of this.bodies) b.syncPhysicsToScene();
    }
    raycast(p1: XY, p2: XY, type: ERaycast2DType, mask: number): any[] {
        const rows = api().query(this.impl, 'ray', {
            x: p1.x / PTM,
            y: p1.y / PTM,
            dx: (p2.x - p1.x) / PTM,
            dy: (p2.y - p1.y) / PTM,
            mask: mask >>> 0,
        });
        const found = rows
            .filter((r) => this.shapes.has(r.shape))
            .sort((a, b) => a.fraction - b.fraction)
            .map((r) => ({
                collider: this.shapes.get(r.shape)!.collider,
                fixtureIndex: this.shapes.get(r.shape)!.impl.indexOf(r.shape),
                point: new Vec2(r.point.x * PTM, r.point.y * PTM),
                normal: new Vec2(r.normal.x, r.normal.y),
                fraction: r.fraction,
            }));
        if (type === ERaycast2DType.Closest || type === ERaycast2DType.Any) return found.slice(0, 1);
        return type === ERaycast2DType.AllClosest
            ? found.filter((r, i) => found.findIndex((v) => v.collider === r.collider) === i)
            : found;
    }
    testPoint(p: XY): Collider2D[] {
        return this.query('point', { x: p.x / PTM, y: p.y / PTM });
    }
    testAABB(r: Rect): Collider2D[] {
        return this.query('aabb', {
            x: r.x / PTM,
            y: r.y / PTM,
            maxX: (r.x + r.width) / PTM,
            maxY: (r.y + r.height) / PTM,
        });
    }
    private query(kind: string, o: Config): Collider2D[] {
        return [
            ...new Set(
                api()
                    .query(this.impl, kind, o)
                    .map((id: number) => this.shapes.get(id)?.collider)
                    .filter(Boolean),
            ),
        ] as Collider2D[];
    }
    clearContacts(): void {
        this.contacts.clear();
    }
    drawDebug(): void {
        const scene = director.getScene();
        if (!scene) return;
        if (!this.debug?.isValid) {
            const canvas = scene.getComponentInChildren(Canvas);
            if (!canvas) return;
            const node = new Node('Box2D3 Debug');
            node.layer = canvas.node.layer;
            canvas.node.addChild(node);
            node.addComponent(UITransform);
            this.debug = node.addComponent(Graphics);
        }
        const g = this.debug;
        g.node.active = true;
        g.clear();
        g.lineWidth = 3;
        g.strokeColor = Color.GREEN;
        const transform = g.node.getComponent(UITransform)!;
        const line = (a: XY, b: XY) => {
            const p = transform.convertToNodeSpaceAR(new Vec3(a.x, a.y, 0)),
                q = transform.convertToNodeSpaceAR(new Vec3(b.x, b.y, 0));
            g.moveTo(p.x, p.y);
            g.lineTo(q.x, q.y);
            g.stroke();
        };
        const polygon = (points: XY[]) => {
            for (let i = 0; i < points.length; i++) line(points[i], points[(i + 1) % points.length]);
        };
        for (const s of this.drawFlags & 1 ? new Set(this.shapes.values()) : []) {
            if (s.collider instanceof CircleCollider2D) {
                const p = transform.convertToNodeSpaceAR(new Vec3(s.worldPosition.x, s.worldPosition.y, 0));
                g.circle(p.x, p.y, s.worldRadius);
                g.stroke();
            } else {
                const p = s.worldPoints;
                if (!p.length) continue;
                for (let i = 0; i < p.length; i++) {
                    const q = transform.convertToNodeSpaceAR(new Vec3(p[i].x, p[i].y, 0));
                    if (i === 0) g.moveTo(q.x, q.y);
                    else g.lineTo(q.x, q.y);
                }
                g.close();
                g.stroke();
            }
        }
        if (this.drawFlags & 2)
            for (const joint of this.joints) {
                const ends = joint.debugAnchors();
                if (ends) line(ends[0], ends[1]);
            }
        if (this.drawFlags & 4)
            for (const shape of this.shapes.keys()) {
                const a = api().shapeBounds(shape);
                polygon([
                    { x: a.lower.x * PTM, y: a.lower.y * PTM },
                    { x: a.upper.x * PTM, y: a.lower.y * PTM },
                    { x: a.upper.x * PTM, y: a.upper.y * PTM },
                    { x: a.lower.x * PTM, y: a.upper.y * PTM },
                ]);
            }
        if (this.drawFlags & 8)
            for (const c of this.contacts.values()) {
                const center = (collider: Collider2D | null) => {
                    const r = collider?.worldAABB;
                    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : { x: 0, y: 0 };
                };
                line(center(c.colliderA), center(c.colliderB));
            }
        if (this.drawFlags & 16)
            for (const b of this.bodies) {
                if (!b.impl) continue;
                const s = api().bodyState(b.impl),
                    p = { x: s.worldCenter.x * PTM, y: s.worldCenter.y * PTM },
                    x = rotate({ x: 16, y: 0 }, s.angle),
                    y = rotate({ x: 0, y: 16 }, s.angle);
                g.strokeColor = Color.RED;
                line(p, { x: p.x + x.x, y: p.y + x.y });
                g.strokeColor = Color.GREEN;
                line(p, { x: p.x + y.x, y: p.y + y.y });
            }
    }
    destroy(): void {
        if (!this.impl) return;
        this.clearContacts();
        this.debug?.node?.destroy();
        this.debug = undefined;
        api().destroyWorld(this.impl);
        this.impl = 0;
        this.groundBodyImpl = 0;
        for (const b of this.bodies) b.impl = 0;
        for (const s of new Set(this.shapes.values())) s.impl = [];
        for (const j of this.joints) j.impl = 0;
        this.bodies.clear();
        this.shapes.clear();
        this.joints.clear();
        this.deferred = [];
    }
}

class Box2D3Body {
    impl = 0;
    rigidBody!: RigidBody2D;
    private target?: { x: number; y: number; angle: number };
    private lastScale = '';
    get isAwake(): boolean {
        return !!this.impl && api().bodyState(this.impl).awake;
    }
    get isSleeping(): boolean {
        return !this.isAwake;
    }
    initialize(c: RigidBody2D): void {
        this.rigidBody = c;
        world().mutate(() => {
            if (this.impl || !c.isValid) return;
            const p = c.node.worldPosition;
            const privateComp = c as unknown as { _linearVelocity: XY; _angularVelocity: number };
            this.impl = api().createBody(world().impl, {
                type: c.type === ERigidBody2DType.Animated ? 1 : c.type,
                x: p.x / PTM,
                y: p.y / PTM,
                angle: angle(c.node),
                vx: privateComp._linearVelocity.x,
                vy: privateComp._linearVelocity.y,
                av: privateComp._angularVelocity,
                linearDamping: c.linearDamping,
                angularDamping: c.angularDamping,
                gravityScale: c.gravityScale,
                fixedRotation: c.fixedRotation,
                allowSleep: c.allowSleep,
                awake: c.awakeOnLoad,
                bullet: c.bullet,
            });
            world().bodies.add(this);
            this.lastScale = `${c.node.worldScale.x}:${c.node.worldScale.y}`;
            this.cmd('active', { value: c.enabledInHierarchy ? 1 : 0 });
        });
    }
    onEnable(): void {
        world().mutate(() => this.setActive(true));
    }
    onDisable(): void {
        world().mutate(() => this.setActive(false));
    }
    onDestroy(): void {
        world().mutate(() => {
            if (!this.impl) return;
            for (const s of new Set(world().shapes.values())) if (s.body === this) s.destroy();
            api().destroyBody(this.impl);
            world().bodies.delete(this);
            this.impl = 0;
        });
    }
    private cmd(op: string, value: Config): void {
        world().mutate(() => {
            if (this.impl) api().bodyCommand(this.impl, op, value);
        });
    }
    setType(v: number): void {
        if (v !== ERigidBody2DType.Animated) this.target = undefined;
        this.cmd('type', { value: v === ERigidBody2DType.Animated ? 1 : v });
    }
    setLinearDamping(v: number): void {
        this.cmd('linearDamping', { value: v });
    }
    setAngularDamping(v: number): void {
        this.cmd('angularDamping', { value: v });
    }
    setGravityScale(v: number): void {
        this.cmd('gravityScale', { value: v });
    }
    setFixedRotation(v: boolean): void {
        this.cmd('fixedRotation', { value: +v });
    }
    setAllowSleep(v: boolean): void {
        this.cmd('allowSleep', { value: +v });
    }
    isActive(): boolean {
        return !!this.impl && api().bodyState(this.impl).enabled;
    }
    setActive(v: boolean): void {
        this.cmd('active', { value: +v });
    }
    wakeUp(): void {
        this.cmd('awake', { value: 1 });
    }
    sleep(): void {
        this.cmd('awake', { value: 0 });
    }
    getMass(): number {
        return this.impl ? api().bodyState(this.impl).mass : 0;
    }
    getInertia(): number {
        return this.impl ? api().bodyState(this.impl).inertia : 0;
    }
    getLinearVelocity<T extends IVec2Like>(out: T): T {
        const s = api().bodyState(this.impl);
        out.x = s.vx;
        out.y = s.vy;
        return out;
    }
    setLinearVelocity(v: XY): void {
        this.cmd('velocity', { x: v.x, y: v.y });
    }
    getAngularVelocity(): number {
        return api().bodyState(this.impl).av;
    }
    setAngularVelocity(v: number): void {
        this.cmd('angularVelocity', { value: v });
    }
    getLocalVector<T extends IVec2Like>(p: XY, out: T): T {
        const v = rotate(p, -api().bodyState(this.impl).angle);
        out.x = v.x;
        out.y = v.y;
        return out;
    }
    getWorldVector<T extends IVec2Like>(p: XY, out: T): T {
        const v = rotate(p, api().bodyState(this.impl).angle);
        out.x = v.x;
        out.y = v.y;
        return out;
    }
    getLocalPoint<T extends IVec2Like>(p: XY, out: T): T {
        const s = api().bodyState(this.impl);
        return this.getLocalVector({ x: p.x - s.x * PTM, y: p.y - s.y * PTM }, out);
    }
    getWorldPoint<T extends IVec2Like>(p: XY, out: T): T {
        const s = api().bodyState(this.impl);
        this.getWorldVector(p, out);
        out.x += s.x * PTM;
        out.y += s.y * PTM;
        return out;
    }
    getLocalCenter<T extends IVec2Like>(out: T): T {
        const p = api().bodyState(this.impl).localCenter;
        out.x = p.x * PTM;
        out.y = p.y * PTM;
        return out;
    }
    getWorldCenter<T extends IVec2Like>(out: T): T {
        const p = api().bodyState(this.impl).worldCenter;
        out.x = p.x * PTM;
        out.y = p.y * PTM;
        return out;
    }
    getLinearVelocityFromWorldPoint<T extends IVec2Like>(p: XY, out: T): T {
        const s = api().bodyState(this.impl);
        out.x = (s.vx - s.av * (p.y / PTM - s.worldCenter.y)) * PTM;
        out.y = (s.vy + s.av * (p.x / PTM - s.worldCenter.x)) * PTM;
        return out;
    }
    applyForce(v: XY, p: XY, wake: boolean): void {
        this.cmd('force', { ...v, px: p.x / PTM, py: p.y / PTM, wake });
    }
    applyForceToCenter(v: XY, wake: boolean): void {
        this.cmd('forceCenter', { ...v, wake });
    }
    applyTorque(value: number, wake: boolean): void {
        this.cmd('torque', { value, wake });
    }
    applyLinearImpulse(v: XY, p: XY, wake: boolean): void {
        this.cmd('impulse', { ...v, px: p.x / PTM, py: p.y / PTM, wake });
    }
    applyLinearImpulseToCenter(v: XY, wake: boolean): void {
        this.cmd('impulseCenter', { ...v, wake });
    }
    applyAngularImpulse(value: number, wake: boolean): void {
        this.cmd('angularImpulse', { value, wake });
    }
    syncSceneToPhysics(): void {
        if (!this.impl) return;
        const node = this.rigidBody.node,
            s = api().bodyState(this.impl),
            p = node.worldPosition,
            a = angle(node);
        if (this.rigidBody.type === ERigidBody2DType.Animated) {
            this.target = { x: p.x / PTM, y: p.y / PTM, angle: a };
        } else if (
            Math.abs(s.x * PTM - p.x) > 0.0001 ||
            Math.abs(s.y * PTM - p.y) > 0.0001 ||
            Math.abs(Math.atan2(Math.sin(a - s.angle), Math.cos(a - s.angle))) > 0.00001
        )
            this.cmd('transform', { x: p.x / PTM, y: p.y / PTM, angle: a });
        const scale = `${node.worldScale.x}:${node.worldScale.y}`;
        if (scale !== this.lastScale) {
            this.lastScale = scale;
            for (const c of node.getComponents(Collider2D)) c.apply();
        }
    }
    animate(dt: number): void {
        if (!this.target || !this.impl || dt <= 0) return;
        const s = api().bodyState(this.impl),
            t = this.target;
        api().bodyCommand(this.impl, 'velocity', { x: (t.x - s.x) / dt, y: (t.y - s.y) / dt });
        api().bodyCommand(this.impl, 'angularVelocity', {
            value: Math.atan2(Math.sin(t.angle - s.angle), Math.cos(t.angle - s.angle)) / dt,
        });
    }
    syncPhysicsToScene(): void {
        if (!this.impl || this.rigidBody.type === ERigidBody2DType.Animated) return;
        const s = api().bodyState(this.impl),
            node = this.rigidBody.node;
        node.setWorldPosition(s.x * PTM, s.y * PTM, node.worldPosition.z);
        const q = new Quat();
        Quat.fromEuler(q, 0, 0, s.angle / RAD);
        node.setWorldRotation(q);
    }
}

class Box2D3Shape {
    impl: number[] = [];
    collider!: Collider2D;
    body?: Box2D3Body;
    private ownBody = 0;
    private signature = '';
    initialize(c: Collider2D): void {
        this.collider = c;
    }
    onEnable(): void {
        world().mutate(() => this.create());
    }
    onDisable(): void {
        world().mutate(() => this.destroy());
    }
    onDestroy(): void {
        world().mutate(() => this.destroy());
    }
    apply(): void {
        world().mutate(() => {
            this.destroy();
            if (this.collider.enabledInHierarchy) this.create();
        });
    }
    onGroupChanged(): void {
        const [category, mask] = this.filter();
        world().mutate(() => {
            for (const h of this.impl) api().shapeFilter(h, category, mask);
        });
    }
    private filter(): [number, number] {
        const c = this.collider,
            category = c.group === 1 && c.body ? c.body.group : c.group;
        return [category >>> 0, (PhysicsSystem2D.instance.collisionMatrix[category] ?? 0) >>> 0];
    }
    private create(): void {
        if (this.impl.length || !this.collider.isValid || !this.collider.enabledInHierarchy) return;
        const c = this.collider;
        this.body = c.getComponent(RigidBody2D)?.impl as Box2D3Body | undefined;
        const p = c.node.worldPosition;
        if (!this.body?.impl)
            this.ownBody = api().createBody(world().impl, {
                type: 0,
                x: p.x / PTM,
                y: p.y / PTM,
                angle: angle(c.node),
            });
        const body = this.body?.impl || this.ownBody;
        const [category, mask] = this.filter();
        const config = {
            density: c.density,
            friction: c.friction,
            restitution: c.restitution,
            sensor: c.sensor,
            category,
            mask,
        };
        const sx = c.node.worldScale.x,
            sy = c.node.worldScale.y;
        if (Math.abs(sx) < 1e-8 || Math.abs(sy) < 1e-8) return;
        if (c instanceof CircleCollider2D)
            this.impl.push(
                api().createShape(body, 'circle', {
                    ...config,
                    x: (c.offset.x * sx) / PTM,
                    y: (c.offset.y * sy) / PTM,
                    radius: (c.radius * Math.abs(sx)) / PTM,
                }),
            );
        else {
            let polygons: Vec2[][];
            if (c instanceof BoxCollider2D) {
                const x = c.size.width / 2,
                    y = c.size.height / 2;
                polygons = [[new Vec2(-x, -y), new Vec2(x, -y), new Vec2(x, y), new Vec2(-x, y)]];
            } else {
                const partition = ConvexPartition((c as PolygonCollider2D).points.map((p) => new Vec2(p.x, p.y)));
                if (!partition) throw new Error('BOX2D3_POLYGON: polygon cannot be partitioned');
                polygons = partition as Vec2[][];
            }
            for (const points of polygons) {
                const scaled = points.map((p) => ({
                    x: ((p.x + c.offset.x) * sx) / PTM,
                    y: ((p.y + c.offset.y) * sy) / PTM,
                }));
                // Fan split retains complete convex geometry when the upstream eight-vertex limit is exceeded.
                for (let start = 1; start < scaled.length - 1; start += 6) {
                    const vertices = [scaled[0], ...scaled.slice(start, Math.min(start + 7, scaled.length))];
                    if (vertices.length >= 3)
                        this.impl.push(api().createShape(body, 'polygon', { ...config, points: vertices }));
                }
            }
        }
        for (const h of this.impl) world().shapes.set(h, this);
        this.signature = this.transformSignature();
    }
    destroy(): void {
        for (const h of this.impl) world().removeShape(h);
        this.impl = [];
        if (this.ownBody) {
            api().destroyBody(this.ownBody);
            this.ownBody = 0;
        }
    }
    private transformSignature(): string {
        const c = this.collider.node,
            p = c.worldPosition,
            s = c.worldScale;
        return `${p.x}:${p.y}:${angle(c)}:${s.x}:${s.y}`;
    }
    sync(): void {
        if (!this.body && this.ownBody && this.signature !== this.transformSignature()) this.apply();
    }
    private toWorld(p: XY): Vec2 {
        const node = this.collider.node,
            s = node.worldScale,
            v = rotate(
                { x: (p.x + this.collider.offset.x) * s.x, y: (p.y + this.collider.offset.y) * s.y },
                angle(node),
            );
        return new Vec2(v.x + node.worldPosition.x, v.y + node.worldPosition.y);
    }
    get worldPoints(): Vec2[] {
        const c = this.collider;
        if (c instanceof CircleCollider2D) return [];
        if (c instanceof BoxCollider2D) {
            const x = c.size.width / 2,
                y = c.size.height / 2;
            return [
                { x: -x, y: -y },
                { x: x, y: -y },
                { x: x, y: y },
                { x: -x, y: y },
            ].map((p) => this.toWorld(p));
        }
        return (c as PolygonCollider2D).points.map((p) => this.toWorld(p));
    }
    get worldPosition(): Vec2 {
        return this.toWorld({ x: 0, y: 0 });
    }
    get worldRadius(): number {
        return (this.collider as CircleCollider2D).radius * Math.abs(this.collider.node.worldScale.x);
    }
    get worldAABB(): Readonly<Rect> {
        if (!this.impl.length) return new Rect();
        if (this.collider instanceof CircleCollider2D) {
            const p = this.worldPosition,
                r = this.worldRadius;
            return new Rect(p.x - r, p.y - r, 2 * r, 2 * r);
        }
        // Native broad-phase bounds contain a speculative margin; the Cocos API exposes geometry bounds.
        const points = this.worldPoints;
        const x = Math.min(...points.map((p) => p.x)),
            y = Math.min(...points.map((p) => p.y));
        return new Rect(x, y, Math.max(...points.map((p) => p.x)) - x, Math.max(...points.map((p) => p.y)) - y);
    }
}

class Contact {
    disabled = false;
    disabledOnce = false;
    touching = true;
    post = false;
    friction: number | undefined;
    restitution: number | undefined;
    tangentSpeed = 0;
    colliderA: Collider2D | null;
    colliderB: Collider2D | null;
    constructor(
        w: Box2D3World,
        public observation: Observation,
    ) {
        this.colliderA = w.shapes.get(observation.a)?.collider ?? null;
        this.colliderB = w.shapes.get(observation.b)?.collider ?? null;
    }
    emit(type: string): void {
        const a = this.colliderA,
            b = this.colliderB,
            la = a?.body?.enabledContactListener,
            lb = b?.body?.enabledContactListener;
        if (la) a!.emit(type, a, b, this);
        if (lb) b!.emit(type, b, a, this);
        if (la || lb) PhysicsSystem2D.instance.emit(type, a, b, this);
    }
    getWorldManifold(): { points: Vec2[]; normal: Vec2; separations: number[] } {
        const o = this.observation;
        return {
            points: o.points.map((p) => new Vec2(p.x * PTM, p.y * PTM)),
            normal: new Vec2(o.normal.x, o.normal.y),
            separations: o.points.map((p) => p.separation * PTM),
        };
    }
    getManifold(): any {
        const o = this.observation;
        const normal = this.colliderA ? rotate(o.normal, -angle(this.colliderA.node)) : o.normal;
        return {
            type: 1,
            localNormal: new Vec2(normal.x, normal.y),
            localPoint: o.points.length ? new Vec2(o.points[0].localA.x * PTM, o.points[0].localA.y * PTM) : new Vec2(),
            points: o.points.map((p) => ({
                localPoint: new Vec2(p.localB.x * PTM, p.localB.y * PTM),
                normalImpulse: p.normalImpulse * PTM,
                tangentImpulse: p.tangentImpulse,
            })),
        };
    }
    getImpulse(): { normalImpulses: number[]; tangentImpulses: number[] } | null {
        return this.post
            ? {
                  normalImpulses: this.observation.points.map((p) => p.normalImpulse * PTM),
                  tangentImpulses: this.observation.points.map((p) => p.tangentImpulse),
              }
            : null;
    }
    isTouching(): boolean {
        return this.touching;
    }
    setEnabled(v: boolean): void {
        this.disabledOnce = !v;
    }
    setFriction(v: number): void {
        if (!Number.isFinite(v) || v < 0) throw new Error('BOX2D3_FRICTION');
        this.friction = v;
    }
    getFriction(): number {
        return this.friction ?? Math.sqrt((this.colliderA?.friction ?? 0) * (this.colliderB?.friction ?? 0));
    }
    resetFriction(): void {
        this.friction = undefined;
    }
    setRestitution(v: number): void {
        if (!Number.isFinite(v) || v < 0) throw new Error('BOX2D3_RESTITUTION');
        this.restitution = v;
    }
    getRestitution(): number {
        return this.restitution ?? Math.max(this.colliderA?.restitution ?? 0, this.colliderB?.restitution ?? 0);
    }
    resetRestitution(): void {
        this.restitution = undefined;
    }
    setTangentSpeed(v: number): void {
        if (!Number.isFinite(v)) throw new Error('BOX2D3_TANGENT_SPEED');
        this.tangentSpeed = v;
    }
    getTangentSpeed(): number {
        return this.tangentSpeed;
    }
}

class BaseJoint {
    impl = 0;
    comp!: Joint2D;
    kind = '';
    protected overrides: Config = {};
    debugAnchors(): [XY, XY] | null {
        if (!this.impl || !api().jointValid(this.impl)) return null;
        const config = this.config(),
            body = this.comp.getComponent(RigidBody2D);
        if (!body?.impl?.impl || (this.comp.connectedBody && !this.comp.connectedBody.impl?.impl)) return null;
        const a = body.getWorldPoint(new Vec2(Number(config.ax) * PTM, Number(config.ay) * PTM), new Vec2());
        const local = new Vec2(Number(config.bx) * PTM, Number(config.by) * PTM);
        const b = this.comp.connectedBody?.getWorldPoint(local, new Vec2()) ?? local;
        return [a, b];
    }
    initialize(c: Joint2D): void {
        this.comp = c;
    }
    onEnable(): void {
        world().mutate(() => this.create());
    }
    start(): void {
        world().mutate(() => this.create());
    }
    onDisable(): void {
        world().mutate(() => this.destroy());
    }
    onDestroy(): void {
        world().mutate(() => this.destroy());
    }
    apply(): void {
        world().mutate(() => {
            this.destroy();
            if (this.comp.enabledInHierarchy) this.create();
        });
    }
    protected config(): Config {
        const c = this.comp as any;
        const a = (c.angle ?? 0) * RAD;
        return {
            ax: c.anchor.x / PTM,
            ay: c.anchor.y / PTM,
            bx: c.connectedAnchor.x / PTM,
            by: c.connectedAnchor.y / PTM,
            angleA: a,
            angleB: a,
            collideConnected: c.collideConnected,
            length: (c.maxLength ?? c.distance ?? 1) / PTM,
            frequency: c.frequency ?? 0,
            dampingRatio: c.dampingRatio ?? 0.7,
            enableLimit: c.enableLimit ?? false,
            lower: this.kind === 'hinge' ? (c.lowerAngle ?? 0) * RAD : (c.lowerLimit ?? 0) / PTM,
            upper: this.kind === 'hinge' ? (c.upperAngle ?? 0) * RAD : (c.upperLimit ?? 0) / PTM,
            enableMotor: c.enableMotor ?? false,
            motorSpeed: this.kind === 'slider' ? (c.motorSpeed ?? 0) : (c.motorSpeed ?? 0) * RAD,
            maxMotorTorque: c.maxMotorTorque ?? 0,
            maxMotorForce: c.maxMotorForce ?? 0,
            maxForce: c.maxForce ?? 1000,
            maxTorque: c.maxTorque ?? 1000,
            ...this.overrides,
        };
    }
    protected create(): void {
        if (this.impl || !this.comp.isValid || !this.comp.enabledInHierarchy) return;
        const a = this.comp.getComponent(RigidBody2D)?.impl as Box2D3Body | undefined,
            b = this.comp.connectedBody?.impl as Box2D3Body | undefined;
        if (!a?.impl || (this.comp.connectedBody && (!b?.impl || !this.comp.connectedBody.enabledInHierarchy))) return;
        this.impl = api().createJoint(
            world().impl,
            this.kind,
            a.impl,
            b?.impl || world().groundBodyImpl,
            this.config(),
        );
        world().joints.add(this);
    }
    protected destroy(): void {
        if (this.impl) {
            api().destroyJoint(this.impl);
            this.impl = 0;
            world().joints.delete(this);
        }
    }
    protected update(key: string, value: unknown): void {
        this.overrides[key] = value;
        if (this.impl) this.apply();
    }
    setMaxLength(v: number): void {
        this.update('length', v / PTM);
    }
    setDistance(v: number): void {
        this.update('length', v / PTM);
    }
    setFrequency(v: number): void {
        this.update('frequency', v);
    }
    setDampingRatio(v: number): void {
        this.update('dampingRatio', v);
    }
    setMaxForce(v: number): void {
        this.update('maxForce', v);
    }
    setMaxTorque(v: number): void {
        this.update('maxTorque', v);
    }
    enableMotor(v: boolean): void {
        this.update('enableMotor', v);
    }
    setMaxMotorForce(v: number): void {
        this.update('maxMotorForce', v);
    }
    setMaxMotorTorque(v: number): void {
        this.update('maxMotorTorque', v);
    }
    setMotorSpeed(v: number): void {
        this.update('motorSpeed', this.kind === 'slider' ? v : v * RAD);
    }
    enableLimit(v: boolean): void {
        this.update('enableLimit', v);
    }
    setLowerLimit(v: number): void {
        this.update('lower', v / PTM);
    }
    setUpperLimit(v: number): void {
        this.update('upper', v / PTM);
    }
    setLowerAngle(v: number): void {
        this.update('lower', v * RAD);
    }
    setUpperAngle(v: number): void {
        this.update('upper', v * RAD);
    }
    setLinearOffset(v: XY): void {
        this.update('ax', v.x / PTM);
        this.update('ay', v.y / PTM);
    }
    setAngularOffset(v: number): void {
        this.update('angleA', v * RAD);
    }
    setCorrectionFactor(v: number): void {
        if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error('BOX2D3_CORRECTION_FACTOR');
        this.update('frequency', Math.max(0.01, v * 60));
    }
}
class DistanceJoint extends BaseJoint {
    kind = 'distance';
}
class SpringJoint extends BaseJoint {
    kind = 'spring';
}
class FixedJoint extends BaseJoint {
    kind = 'fixed';
}
class RelativeJoint extends BaseJoint {
    kind = 'relative';
    protected config(): Config {
        const c = this.comp as any;
        return {
            ...super.config(),
            ax: c.linearOffset.x / PTM,
            ay: c.linearOffset.y / PTM,
            angleA: c.angularOffset * RAD,
            frequency: Math.max(0.01, c.correctionFactor * 60),
            ...this.overrides,
        };
    }
}
class SliderJoint extends BaseJoint {
    kind = 'slider';
}
class WheelJoint extends BaseJoint {
    kind = 'wheel';
}
class HingeJoint extends BaseJoint {
    kind = 'hinge';
}
class MouseJoint extends BaseJoint {
    kind = 'mouse';
    private target = new Vec2();
    private mouseBody = 0;
    private dragging = false;
    private pointerPosition(e: EventTouch): Vec2 {
        const camera = director.getScene()?.getComponentInChildren(Canvas)?.cameraComponent;
        if (camera) {
            const p = e.getLocation(),
                ray = camera.screenPointToRay(p.x, p.y);
            if (Math.abs(ray.d.z) > 1e-8) {
                const t = -ray.o.z / ray.d.z;
                return new Vec2(ray.o.x + ray.d.x * t, ray.o.y + ray.d.y * t);
            }
        }
        return e.getUILocation();
    }
    debugAnchors(): [XY, XY] | null {
        if (!this.impl || !api().jointValid(this.impl) || !this.comp.connectedBody?.impl?.impl) return null;
        const center = this.comp.connectedBody?.getWorldCenter(new Vec2());
        return center ? [this.target, center] : null;
    }
    onEnable(): void {
        input.on(Input.EventType.TOUCH_START, this.onTouchBegan, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }
    start(): void {}
    update(): void {
        if (this.dragging) this.setTarget(this.target);
    }
    onDisable(): void {
        input.off(Input.EventType.TOUCH_START, this.onTouchBegan, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        super.onDisable();
    }
    onDestroy(): void {
        this.onDisable();
    }
    protected create(): void {
        if (this.impl || !this.dragging || !this.comp.enabledInHierarchy) return;
        const body = this.comp.connectedBody?.impl as Box2D3Body | undefined;
        if (!body?.impl) return;
        this.mouseBody = api().createBody(world().impl, {
            type: 1,
            x: this.target.x / PTM,
            y: this.target.y / PTM,
            allowSleep: false,
        });
        const local = body.getLocalPoint(this.target, new Vec2());
        const c = this.comp as MouseJoint2D;
        this.impl = api().createJoint(world().impl, this.kind, this.mouseBody, body.impl, {
            ...this.config(),
            ax: 0,
            ay: 0,
            bx: local.x / PTM,
            by: local.y / PTM,
            maxForce: c.maxForce * body.getMass(),
        });
        world().joints.add(this);
    }
    protected destroy(): void {
        super.destroy();
        if (this.mouseBody) {
            api().destroyBody(this.mouseBody);
            this.mouseBody = 0;
        }
    }
    setTarget(v: XY): void {
        this.target.set(v.x, v.y);
        const x = v.x / PTM,
            y = v.y / PTM;
        world().mutate(() => {
            if (this.mouseBody) api().bodyCommand(this.mouseBody, 'transform', { x, y, angle: 0 });
        });
    }
    onTouchBegan(e: EventTouch): void {
        this.target.set(this.pointerPosition(e));
        const c = world()
            .testPoint(this.target)
            .find((c) => c.body?.type === ERigidBody2DType.Dynamic);
        if (!c?.body) return;
        this.comp.connectedBody = c.body;
        this.dragging = true;
        world().mutate(() => this.create());
    }
    onTouchMove(e: EventTouch): void {
        this.setTarget(this.pointerPosition(e));
    }
    onTouchEnd(): void {
        this.dragging = false;
        world().mutate(() => this.destroy());
    }
}
