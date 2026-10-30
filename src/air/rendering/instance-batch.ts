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
import { Node } from '../../cocos/scene-graph/node';
import { NodeEventType } from '../../cocos/scene-graph/node-event';
import { Mesh } from '../../cocos/3d/assets/mesh';
import { Material } from '../../cocos/asset/assets/material';
import { RenderingSubMesh } from '../../cocos/asset/assets/rendering-sub-mesh';
import { Model } from '../../cocos/render-scene/scene/model';
import { director, Director } from '../../cocos/game/director';
import { Mat4, Vec3, Vec4 } from '../../cocos/core/math';
import * as geometry from '../../cocos/core/geometry';
import '../../cocos/misc/intersect';
import { API, Attribute, BufferInfo, BufferUsageBit, MemoryUsageBit, Format, PrimitiveMode } from '../../cocos/gfx';
import { WebGL2Buffer } from '../../cocos/gfx/webgl2/webgl2-buffer';
import { WebGL2Device } from '../../cocos/gfx/webgl2/webgl2-device';
import { WebGL2CmdFuncUpdateBuffer } from '../../cocos/gfx/webgl2/webgl2-commands';
import { BatchingSchemes } from '../../cocos/render-scene/core/pass';
import { InstanceData, INSTANCE_BYTES, instanceError, instanceInteger } from './instance-data';
import { AIR_INSTANCE_ATTRIBUTES, createAirInstanceMaterial } from './instance-material';

export interface AirInstanceBatchOptions {
    parent: Node;
    mesh: Mesh;
    material?: Material;
    capacity?: number;
    count?: number;
    name?: string;
}
export interface AirInstanceHit {
    instanceIndex: number;
    distance: number;
    point: Vec3;
}
export interface AirInstanceBatch {
    readonly node: Node;
    readonly info: Readonly<{
        capacity: number;
        count: number;
        pendingInstances: number;
        gpuBytes: number;
        cpuBytes: number;
        lastUploadBytes: number;
        subMeshes: number;
        attached: boolean;
        disposed: boolean;
        maxVertexAttributes: number;
    }>;
    setMatrix(index: number, matrix: Readonly<Mat4>): void;
    setColor(index: number, color: Readonly<Vec4>): void;
    getMatrix(index: number, out: Mat4): Mat4;
    setCount(count: number): void;
    reserve(capacity: number): void;
    commit(start?: number, count?: number): number;
    getWorldBounds(out?: geometry.AABB): geometry.AABB | null;
    raycast(ray: geometry.Ray, maxDistance?: number): AirInstanceHit | null;
    dispose(): void;
}

/** One native node/model, shared geometry, and one explicit instance stream. Call commit after staged edits.
 * Static indexed TRIANGLE_LIST meshes only. Custom materials must declare AIR_INSTANCE_ATTRIBUTES as instanced
 * RGBA32F attributes and use ordinary (non-native-auto-batched) passes. WebGL2 only in this first implementation.
 */
export function createAirInstanceBatch(options: AirInstanceBatchOptions): AirInstanceBatch {
    const root = director.root;
    if (!root || root.device.gfxAPI !== API.WEBGL2) instanceError('requires initialized WebGL2 createAirApp');
    if (
        !options ||
        !(options.parent instanceof Node) ||
        !options.parent.isValid ||
        !(options.mesh instanceof Mesh) ||
        !options.mesh.isValid
    )
        instanceError('valid parent and mesh required');
    const data = new InstanceData(options.capacity ?? 32);
    instanceInteger(options.count ?? 0, 'count', 0, data.capacity);
    data.count = options.count ?? 0;
    const mesh = options.mesh;
    mesh.initialize();
    const source = mesh.renderingSubMeshes;
    if (!source.length || source.some((s) => !s.indexBuffer || s.primitiveMode !== PrimitiveMode.TRIANGLE_LIST))
        instanceError('static indexed triangle submeshes required');
    if (source.some((s) => s.attributes.some((a) => a.isInstanced)))
        instanceError('source mesh must not already contain instance streams');
    if (mesh.struct.dynamic || mesh.struct.morph) instanceError('dynamic/morph mesh is not supported');
    const min = mesh.struct.minPosition,
        max = mesh.struct.maxPosition;
    if (!min || !max || [min.x, min.y, min.z, max.x, max.y, max.z].some((v) => !Number.isFinite(v)))
        instanceError('finite mesh bounds required');
    const baseBounds = geometry.AABB.fromPoints(new geometry.AABB(), min, max);
    const material = options.material ?? createAirInstanceMaterial();
    const ownedMaterial = !options.material;
    try {
        if (!material.isValid || !material.passes.length) instanceError('valid compiled material required');
        for (const pass of material.passes) {
            if (pass.batchingScheme !== BatchingSchemes.NONE)
                instanceError('material must not enable native USE_INSTANCING auto-batching');
            const attrs = pass.getShaderVariant()?.attributes;
            if (
                !attrs ||
                AIR_INSTANCE_ATTRIBUTES.some(
                    (name) => !attrs.some((a) => a.name === name && a.isInstanced && a.format === Format.RGBA32F),
                )
            )
                instanceError('material must declare the four AIR instance attributes');
            if (attrs.some((a) => a.isInstanced && !AIR_INSTANCE_ATTRIBUTES.some((name) => name === a.name)))
                instanceError('extra per-instance attributes are not supported by this layout');
            if (attrs.some((a) => a.location >= root.device.capabilities.maxVertexAttributes))
                instanceError('device vertex attribute limit exceeded');
        }
    } catch (error) {
        if (ownedMaterial) material.destroy();
        throw error;
    }
    const device = root.device as WebGL2Device;
    const buffer = device.createBuffer(
        new BufferInfo(
            BufferUsageBit.VERTEX | BufferUsageBit.TRANSFER_DST,
            MemoryUsageBit.DEVICE,
            data.capacity * INSTANCE_BYTES,
            INSTANCE_BYTES,
        ),
    ) as WebGL2Buffer;
    buffer.update(data.committed);
    const views = source.map((s) => {
        const stream = s.vertexBuffers.length;
        const attributes = [
            ...s.attributes.map((a) => new Attribute().copy(a)),
            ...AIR_INSTANCE_ATTRIBUTES.map(
                (name, i) => new Attribute(name, Format.RGBA32F, false, stream, true, 8 + i),
            ),
        ];
        const view = new RenderingSubMesh([...s.vertexBuffers, buffer], attributes, s.primitiveMode, s.indexBuffer);
        view.drawInfo = s.drawInfo;
        return view;
    });
    mesh.addRef();
    material.addRef();
    const node = new Node(options.name ?? 'Instance batch');
    node.layer = options.parent.layer;
    options.parent.addChild(node);
    let model: Model | null = null,
        disposed = false,
        lastUploadBytes = data.committed.byteLength;
    const localBounds = new geometry.AABB(),
        oneBounds = new geometry.AABB(),
        matrix = new Mat4();
    let hasBounds = false;
    const alive = () => {
        if (disposed) instanceError('batch is disposed');
    };
    const updateBounds = () => {
        hasBounds = data.count > 0;
        if (!hasBounds) return;
        const lower = new Vec3(Infinity, Infinity, Infinity),
            upper = new Vec3(-Infinity, -Infinity, -Infinity);
        for (let i = 0; i < data.count; i++) {
            data.readMatrix(i, matrix);
            geometry.AABB.transform(oneBounds, baseBounds, matrix);
            const c = oneBounds.center,
                h = oneBounds.halfExtents;
            lower.x = Math.min(lower.x, c.x - h.x);
            lower.y = Math.min(lower.y, c.y - h.y);
            lower.z = Math.min(lower.z, c.z - h.z);
            upper.x = Math.max(upper.x, c.x + h.x);
            upper.y = Math.max(upper.y, c.y + h.y);
            upper.z = Math.max(upper.z, c.z + h.z);
        }
        geometry.AABB.fromPoints(localBounds, lower, upper);
        if (model) {
            model.createBoundingShape(lower, upper);
            model.updateWorldBound();
        }
    };
    const sync = () => {
        if (disposed) return;
        const scene = node.scene?.renderScene;
        if (model && model.scene !== scene) model.scene?.removeModel(model);
        if (scene && !model) {
            model = root.createModel(Model);
            model.node = node;
            model.transform = node;
            views.forEach((view, i) => model!.initSubModel(i, view, material));
            updateBounds();
        }
        if (model) {
            if (scene && model.scene !== scene) scene.addModel(model);
            model.visFlags = node.layer;
            model.enabled = !!scene && node.activeInHierarchy && data.count > 0;
            model.subModels.forEach((s) => (s.inputAssembler.instanceCount = data.count));
        }
    };
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        director.off(Director.EVENT_BEFORE_DRAW, sync);
        node.off(NodeEventType.NODE_DESTROYED, dispose);
        if (model) {
            model.scene?.removeModel(model);
            root.destroyModel(model);
            model = null;
        }
        // Native views borrow source buffers: never call view.destroy(), which would destroy those buffers.
        buffer.destroy();
        data.release();
        views.length = 0;
        mesh.decRef(false);
        material.decRef(false);
        if (ownedMaterial) material.destroy();
        node.destroy();
    };
    const handle: AirInstanceBatch = {
        node,
        get info() {
            return Object.freeze({
                capacity: data.capacity,
                count: data.count,
                pendingInstances: data.pendingInstances,
                gpuBytes: disposed ? 0 : buffer.size,
                cpuBytes: data.byteLength,
                lastUploadBytes,
                subMeshes: views.length,
                attached: !!model?.scene,
                disposed,
                maxVertexAttributes: device.capabilities.maxVertexAttributes,
            });
        },
        setMatrix(index, m) {
            alive();
            data.setMatrix(index, m);
        },
        setColor(index, c) {
            alive();
            data.setColor(index, c);
        },
        getMatrix(index, out) {
            alive();
            return data.readMatrix(index, out);
        },
        setCount(count) {
            alive();
            instanceInteger(count, 'count', 0, data.capacity);
            data.count = count;
            updateBounds();
            sync();
        },
        reserve(capacity) {
            alive();
            instanceInteger(capacity, 'capacity', data.capacity, 1048576);
            if (capacity === data.capacity) return;
            data.reserve(capacity);
            buffer.resize(capacity * INSTANCE_BYTES);
            buffer.update(data.committed);
            lastUploadBytes = data.committed.byteLength;
        },
        commit(start, count) {
            alive();
            const range = data.range(start, count);
            if (!range) {
                lastUploadBytes = 0;
                return 0;
            }
            const bytes = data.staged.subarray(range.start * 16, (range.start + range.count) * 16);
            WebGL2CmdFuncUpdateBuffer(
                device,
                buffer.getGpuBuffer(),
                bytes,
                range.start * INSTANCE_BYTES,
                bytes.byteLength,
            );
            const transformsChanged = data.publish(range.start, range.count);
            lastUploadBytes = bytes.byteLength;
            if (transformsChanged) updateBounds();
            return lastUploadBytes;
        },
        getWorldBounds(out = new geometry.AABB()) {
            alive();
            if (!hasBounds) return null;
            node.updateWorldTransform();
            return geometry.AABB.transform(out, localBounds, node.worldMatrix);
        },
        raycast(ray, maxDistance = Infinity) {
            alive();
            if (
                !ray ||
                [ray.o.x, ray.o.y, ray.o.z, ray.d.x, ray.d.y, ray.d.z].some((v) => !Number.isFinite(v)) ||
                !(maxDistance >= 0) ||
                Vec3.lengthSqr(ray.d) === 0
            )
                instanceError('valid ray and nonnegative maxDistance required');
            if (!node.activeInHierarchy) return null;
            node.updateWorldTransform();
            let nearest: AirInstanceHit | null = null;
            const world = new Mat4(),
                inverse = new Mat4(),
                localRay = new geometry.Ray(),
                end = new Vec3(),
                point = new Vec3();
            const direction = new Vec3();
            Vec3.normalize(direction, ray.d);
            Vec3.add(end, ray.o, direction);
            for (let i = 0; i < data.count; i++) {
                data.readMatrix(i, matrix);
                Mat4.multiply(world, node.worldMatrix, matrix);
                if (Math.abs(Mat4.determinant(world)) < 1e-12) continue;
                Mat4.invert(inverse, world);
                Vec3.transformMat4(localRay.o, ray.o, inverse);
                Vec3.transformMat4(localRay.d, end, inverse);
                Vec3.subtract(localRay.d, localRay.d, localRay.o);
                Vec3.normalize(localRay.d, localRay.d);
                const distance = geometry.intersect.rayMesh(localRay, mesh, {
                    mode: geometry.ERaycastMode.CLOSEST,
                    distance: Infinity,
                    doubleSided: true,
                });
                if (distance > 0) {
                    Vec3.scaleAndAdd(point, localRay.o, localRay.d, distance);
                    Vec3.transformMat4(point, point, world);
                    const worldDistance = Vec3.distance(ray.o, point);
                    if (worldDistance <= maxDistance && (!nearest || worldDistance < nearest.distance))
                        nearest = { instanceIndex: i, distance: worldDistance, point: point.clone() };
                }
            }
            return nearest;
        },
        dispose,
    };
    updateBounds();
    node.on(NodeEventType.NODE_DESTROYED, dispose);
    director.on(Director.EVENT_BEFORE_DRAW, sync);
    sync();
    return handle;
}
