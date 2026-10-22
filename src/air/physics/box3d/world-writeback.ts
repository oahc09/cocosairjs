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
import type { Node } from '../../../cocos/scene-graph/node';
import { Mat4 } from '../../../cocos/core/math/mat4';
import { Quat } from '../../../cocos/core/math/quat';
import { Vec3 } from '../../../cocos/core/math/vec3';
import { isValid } from '../../../cocos/core/data/object';
import { registerNodeTransformGuard } from '../../../cocos/scene-graph/node-transform-validation';
import { worldError } from './world-binding';

/** Internal qualification only. Never an AIR app option or mutable epoch escape hatch. */
export interface Box3DWritebackQualification {
    readonly epochLimit: number;
}
export function copyWritebackQualification(value?: Box3DWritebackQualification): Box3DWritebackQualification {
    const limit = value === undefined ? Number.MAX_SAFE_INTEGER : value?.epochLimit;
    if (!Number.isSafeInteger(limit) || limit < 1)
        throw worldError(
            'AIR_E_BOX3D_CONFIG',
            'writeback qualification',
            'Expected a positive safe integer epochLimit.',
        );
    return Object.freeze({ epochLimit: limit });
}
interface LocalRecord {
    readonly node: Node;
    readonly parent: Node | null;
    readonly position: readonly number[];
    readonly rotation: readonly number[];
    readonly scale: readonly number[];
}
const vector = (v: Readonly<{ x: number; y: number; z: number }>) => Object.freeze([v.x, v.y, v.z]);
const quaternion = (v: Readonly<{ x: number; y: number; z: number; w: number }>) => Object.freeze([v.x, v.y, v.z, v.w]);
const vec = (v: readonly number[]) => new Vec3(v[0], v[1], v[2]);
const quat = (v: readonly number[]) => new Quat(v[0], v[1], v[2], v[3]);
function reject(reason: string): never {
    throw worldError('AIR_E_BOX3D_CONFIG', 'owned writeback', reason);
}
function local(node: Node): LocalRecord {
    if (!isValid(node, true)) reject('Node ownership is destroyed or pending destruction.');
    const result = Object.freeze({
        node,
        parent: node.parent,
        position: vector(node.position),
        rotation: quaternion(node.rotation),
        scale: vector(node.scale),
    });
    if (
        [...result.position, ...result.rotation, ...result.scale].some((v) => !Number.isFinite(v)) ||
        result.scale.some((v) => v <= 0)
    )
        reject('Expected finite local TRS and positive scale.');
    return result;
}
function chain(node: Node): readonly LocalRecord[] {
    const result: LocalRecord[] = [],
        seen = new Set<Node>();
    for (let current: Node | null = node; current; current = current.parent) {
        if (seen.has(current)) reject('Cyclic Node ancestry.');
        seen.add(current);
        result.unshift(local(current));
    }
    return Object.freeze(result);
}
function same(a: readonly number[], b: readonly number[]): boolean {
    return a.length === b.length && a.every((n, i) => Object.is(n, b[i]));
}
function sameLocal(a: LocalRecord, b: LocalRecord): boolean {
    return (
        a.node === b.node &&
        a.parent === b.parent &&
        same(a.position, b.position) &&
        same(a.rotation, b.rotation) &&
        same(a.scale, b.scale)
    );
}
function assertLocals(expected: ReadonlyMap<Node, LocalRecord>): void {
    // Raw local values and parent identity are checked BEFORE any world getter can refresh a cache.
    for (const item of expected.values())
        if (!sameLocal(item, local(item.node))) reject('Unowned local TRS or ancestor change.');
}
function near(a: readonly number[], b: readonly number[]): boolean {
    return (
        a.length === b.length &&
        a.every(
            (n, i) =>
                Number.isFinite(n) &&
                Number.isFinite(b[i]) &&
                Math.abs(n - b[i]) <= 1e-7 * Math.max(1, Math.abs(n), Math.abs(b[i])),
        )
    );
}
function sameOrientation(a: readonly number[], b: readonly number[]): boolean {
    const an = Math.hypot(...a),
        bn = Math.hypot(...b);
    if (!Number.isFinite(an) || !Number.isFinite(bn) || an < 1e-12 || bn < 1e-12) return false;
    const x = a.map((v) => v / an),
        y = b.map((v) => v / bn);
    return Math.min(Math.hypot(...x.map((v, i) => v - y[i])), Math.hypot(...x.map((v, i) => v + y[i]))) <= 1e-6;
}
function scratchMatrices(expected: ReadonlyMap<Node, LocalRecord>): ReadonlyMap<Node, Mat4> {
    const result = new Map<Node, Mat4>();
    const visit = (node: Node): Mat4 => {
        const previous = result.get(node);
        if (previous) return previous;
        const item = expected.get(node);
        if (!item) reject('Missing frozen ancestor basis.');
        const matrix = Mat4.fromSRT(new Mat4(), quat(item.rotation), vec(item.position), vec(item.scale));
        if (item.parent) Mat4.multiply(matrix, visit(item.parent), matrix);
        result.set(node, matrix);
        return matrix;
    };
    for (const node of expected.keys()) visit(node);
    return result;
}
function verify(expected: ReadonlyMap<Node, LocalRecord>): void {
    assertLocals(expected);
    const scratch = scratchMatrices(expected);
    for (const [node, matrix] of scratch) {
        const actual = node.worldMatrix;
        if (!near(Mat4.toArray([], matrix), Mat4.toArray([], actual)))
            reject('Cached world affine differs from independent local-chain affine.');
        const p = node.worldPosition;
        if (!near([p.x, p.y, p.z], [matrix.m12, matrix.m13, matrix.m14]))
            reject('Cached world origin differs from local-chain origin.');
        const rotation = new Quat();
        Mat4.toSRT(matrix, rotation, null, null);
        if (!sameOrientation(quaternion(node.worldRotation), quaternion(rotation)))
            reject('Cached world orientation differs from local-chain orientation.');
    }
    assertLocals(expected);
}
/** Per-body baseline only. No native capability, Node property or global bypass is exposed. */
export class Box3DSceneTransform {
    readonly node: Node;
    #baseline: readonly LocalRecord[];
    constructor(node: Node) {
        this.node = node;
        this.#baseline = chain(node);
        verify(new Map(this.#baseline.map((item) => [item.node, item])));
    }
    preflight(): void {
        const current = chain(this.node);
        if (current.length !== this.#baseline.length || current.some((item, i) => !sameLocal(item, this.#baseline[i])))
            reject('External Node pose/parent/scale synchronization is not enabled.');
        verify(new Map(this.#baseline.map((item) => [item.node, item])));
    }
    /** Frozen records used only by this module's world batch. */
    records(): readonly LocalRecord[] {
        return this.#baseline;
    }
    commit(expected: ReadonlyMap<Node, LocalRecord>): void {
        this.#baseline = Object.freeze(this.#baseline.map((item) => expected.get(item.node)!));
    }
}
export interface Box3DWritebackBody {
    readonly scene: Box3DSceneTransform;
    readonly origin: readonly number[];
    readonly writable: boolean;
    readonly assertOwner: () => void;
}
/** Internal exact-write authority only; never a blanket transform exemption. */
export interface Box3DExactWriteAuthority {
    write(
        node: Node,
        operation: 'setWorldPosition' | 'setWorldRotation',
        expected: readonly number[],
        perform: () => void,
    ): void;
}
/** All immutable native origins must already be copied before calling this function. */
export function writebackSceneBatch(
    bodies: readonly Box3DWritebackBody[],
    assertWorldOwners: () => void,
    authority?: Box3DExactWriteAuthority,
): void {
    const expected = new Map<Node, LocalRecord>();
    for (const body of bodies)
        for (const item of body.scene.records()) {
            const previous = expected.get(item.node);
            if (previous && !sameLocal(previous, item)) reject('Shared ancestor baselines disagree.');
            expected.set(item.node, item);
        }
    const owners = () => {
        assertWorldOwners();
        for (const body of bodies) body.assertOwner();
    };
    owners();
    verify(expected);
    if (!expected.size) return;
    const lease = authority
        ? null
        : registerNodeTransformGuard(Array.from(expected.keys()), {
              code: 'AIR_E_BOX3D_CONFIG',
              message: 'The current Box3D writeback batch owns this Node or its descendant',
          });
    const writer = authority ?? lease!;
    const ordered = Array.from(bodies).sort((a, b) => a.scene.records().length - b.scene.records().length);
    try {
        for (const body of ordered) {
            owners();
            verify(expected);
            if (!body.writable) continue;
            const node = body.scene.node,
                old = expected.get(node)!,
                p = vec(body.origin),
                q = quat(body.origin.slice(3, 7));
            const localPosition = old.parent
                ? Vec3.transformMat4(new Vec3(), p, Mat4.invert(new Mat4(), Mat4.clone(old.parent.worldMatrix)))
                : p;
            const localRotation = old.parent
                ? Quat.multiply(new Quat(), Quat.conjugate(new Quat(), Quat.clone(old.parent.worldRotation)), q)
                : q;
            const position = Object.freeze(body.origin.slice(0, 3)),
                rotation = Object.freeze(body.origin.slice(3, 7));
            // Expected locals are derived BEFORE callbacks; never adopt readback as a new baseline.
            expected.set(node, Object.freeze({ ...old, position: vector(localPosition) }));
            writer.write(node, 'setWorldPosition', position, () =>
                node.setWorldPosition(position[0], position[1], position[2]),
            );
            owners();
            verify(expected);
            if (!near(vector(node.worldPosition), position))
                reject('Position setter did not retain expected native origin.');
            expected.set(node, Object.freeze({ ...expected.get(node)!, rotation: quaternion(localRotation) }));
            writer.write(node, 'setWorldRotation', rotation, () =>
                node.setWorldRotation(rotation[0], rotation[1], rotation[2], rotation[3]),
            );
            owners();
            verify(expected);
            if (
                !near(vector(node.worldPosition), position) ||
                !sameOrientation(quaternion(node.worldRotation), rotation)
            )
                reject('Rotation setter did not retain the original expected native pose.');
        }
        owners();
        verify(expected);
        for (const body of bodies) {
            if (
                !near(vector(body.scene.node.worldPosition), body.origin.slice(0, 3)) ||
                !sameOrientation(quaternion(body.scene.node.worldRotation), body.origin.slice(3, 7))
            )
                reject(
                    'Final batch differs from a frozen native origin pose; unsupported parent effects are not synchronized.',
                );
        }
        // No fallible callback/getter remains between the final verification and all baseline commits.
        for (const body of bodies) body.scene.commit(expected);
    } finally {
        lease?.dispose();
    }
}
