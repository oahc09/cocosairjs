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
import { director } from '../../cocos/game/director';
import { API, Format, FormatFeatureBit } from '../../cocos/gfx';
import { Texture2D } from '../../cocos/asset/assets/texture-2d';
import { TextureFilter, WrapMode } from '../../cocos/asset/assets/asset-enum';
import { Material } from '../../cocos/asset/assets/material';
import { Mesh } from '../../cocos/3d/assets/mesh';
import { Mat4, Vec3, Vec4 } from '../../cocos/core/math';
import { geometry } from '../../cocos/core';
import { createMesh } from '../../cocos/3d/misc/create-mesh';
import box from '../../cocos/primitive/box';
import quad from '../../cocos/primitive/quad';
import { createAirInstanceBatch, AirInstanceBatch } from './instance-batch';
import { createMorphMaterial } from './morph-material';
import { packMorphShapes, morphError } from './morph-data';
import type { AirPointShape } from './point-shapes';

export type AirMorphSurface = 'unlit' | 'polished';

export interface AirMorphFieldOptions {
    parent: Node;
    targets: readonly AirPointShape[];
    mode?: 'points' | 'voxels';
    /** Local diameter/edge length; fixed for the lifetime of this field. */
    size?: number;
    intensity?: number;
    /** Procedural studio reflections, independent of native scene lights. Defaults to unlit. */
    surface?: AirMorphSurface;
    roughness?: number;
    name?: string;
    /** Shape textures plus instance stream; defaults to 256 MiB. Excludes fixed geometry and driver allocations. */
    maxGpuBytes?: number;
}
export interface AirMorphField {
    readonly node: Node;
    readonly info: Readonly<{
        count: number;
        targetCount: number;
        mode: 'points' | 'voxels';
        surface: AirMorphSurface;
        roughness: number;
        from: number;
        to: number;
        progress: number;
        disposed: boolean;
        gpuBytes: number;
        cpuBytes: number;
        /** Resource payload, not a measurement of all initialization/driver transfers. */
        initialDataBytes: number;
        /** Shape/instance data only. Native uniform uploads still occur. */
        transitionDataBytes: 0;
    }>;
    setTransition(from: number, to: number, progress: number): void;
    setIntensity(intensity: number): void;
    setSurface(surface: AirMorphSurface, roughness?: number): void;
    getWorldBounds(out?: geometry.AABB): geometry.AABB | null;
    dispose(): void;
}

/** Indexed instancing with immutable shape atlases; transition updates only material uniforms. WebGL2. */
export function createAirMorphField(options: AirMorphFieldOptions): AirMorphField {
    const device = director.root?.device;
    if (!device || device.gfxAPI !== API.WEBGL2) morphError('initialized WebGL2 createAirApp is required');
    if (
        device.capabilities.maxVertexTextureUnits < 2 ||
        !(device.getFormatFeatures(Format.RGBA32F) & FormatFeatureBit.SAMPLED_TEXTURE)
    )
        morphError('two vertex texture units and RGBA32F sampling are required');
    const mode = options.mode ?? 'points',
        size = options.size ?? 0.05,
        intensity = options.intensity ?? 1;
    let surface = options.surface ?? 'unlit',
        roughness = options.roughness ?? 0.2;
    const validateSurface = (value: AirMorphSurface, r: number) => {
        if ((value !== 'unlit' && value !== 'polished') || !Number.isFinite(r) || r < 0.04 || r > 1)
            morphError('surface must be unlit/polished and roughness in [0.04,1]');
    };
    validateSurface(surface, roughness);
    if (mode !== 'points' && mode !== 'voxels') morphError('mode must be points or voxels');
    if (!(options.parent instanceof Node) || !options.parent.isValid) morphError('valid parent required');
    if (!Number.isFinite(Math.fround(intensity)) || intensity < 0) morphError('finite nonnegative intensity required');
    const packed = packMorphShapes(
        options.targets,
        size,
        mode === 'points',
        device.capabilities.maxTextureSize,
        options.maxGpuBytes ?? 256 * 1024 * 1024,
    );
    const { count, width, height, textureBytes } = packed,
        targetCount = options.targets.length;
    let positions: Texture2D | null = null,
        colors: Texture2D | null = null,
        material: Material | null = null,
        mesh: Mesh | null = null,
        batch: AirInstanceBatch | null = null;
    const makeTexture = (data: Float32Array): Texture2D => {
        const texture = new Texture2D();
        try {
            texture.setFilters(TextureFilter.NEAREST, TextureFilter.NEAREST);
            texture.setWrapMode(WrapMode.CLAMP_TO_EDGE, WrapMode.CLAMP_TO_EDGE);
            texture.reset({ width, height, format: Texture2D.PixelFormat.RGBA32F, mipmapLevel: 1 });
            texture.uploadData(data);
            return texture;
        } catch (error) {
            texture.destroy();
            throw error;
        }
    };
    try {
        positions = makeTexture(packed.positions);
        colors = makeTexture(packed.colors);
        material = createMorphMaterial();
        material.setProperty('shapePositions', positions);
        material.setProperty('shapeColors', colors);
        const control = new Vec4(0, 0, 0, size);
        material.setProperty('morphControl', control);
        material.setProperty('atlasInfo', new Vec4(width, height, count, mode === 'points' ? 0 : 1));
        const display = new Vec4(intensity, surface === 'polished' ? 1 : 0, roughness, 0);
        material.setProperty('display', display);
        const source = mode === 'points' ? quad() : box();
        // Billboard offsets can occupy all three local axes, including after parent non-uniform scaling.
        source.minPos = new Vec3(-0.5, -0.5, -0.5);
        source.maxPos = new Vec3(0.5, 0.5, 0.5);
        mesh = createMesh(source);
        batch = createAirInstanceBatch({
            parent: options.parent,
            mesh,
            material,
            capacity: count,
            name: options.name ?? 'Morph field',
        });
        const matrix = new Mat4(),
            color = new Vec4(0, 0, 0, 1),
            e = packed.envelopes;
        for (let i = 0; i < count; i++) {
            Mat4.identity(matrix);
            matrix.m00 = e[i * 6 + 3];
            matrix.m05 = e[i * 6 + 4];
            matrix.m10 = e[i * 6 + 5];
            matrix.m12 = e[i * 6];
            matrix.m13 = e[i * 6 + 1];
            matrix.m14 = e[i * 6 + 2];
            color.x = i;
            batch.setMatrix(i, matrix);
            batch.setColor(i, color);
        }
        batch.commit();
        batch.setCount(count);
        // Do not retain upload scratch arrays or caller-owned targets in the live field closure.
        packed.positions = packed.colors = packed.envelopes = new Float32Array(0);
        let disposed = false;
        const ownedBatch = batch,
            ownedMaterial = material,
            ownedMesh = mesh,
            ownedPositions = positions,
            ownedColors = colors;
        const geometryBytes = ownedMesh.renderingSubMeshes.reduce(
            (n, s) => n + s.vertexBuffers.reduce((sum, b) => sum + b.size, 0) + (s.indexBuffer?.size ?? 0),
            0,
        );
        const alive = () => {
            if (disposed) morphError('field is disposed');
        };
        const dispose = () => {
            if (disposed) return;
            disposed = true;
            ownedBatch.node.off(NodeEventType.NODE_DESTROYED, dispose);
            ownedBatch.dispose();
            ownedMaterial.destroy();
            ownedMesh.destroy();
            ownedPositions.destroy();
            ownedColors.destroy();
        };
        ownedBatch.node.on(NodeEventType.NODE_DESTROYED, dispose);
        return {
            node: ownedBatch.node,
            get info() {
                return Object.freeze({
                    count: disposed ? 0 : count,
                    targetCount,
                    mode,
                    surface,
                    roughness,
                    from: control.x,
                    to: control.y,
                    progress: control.z,
                    disposed,
                    gpuBytes: disposed ? 0 : textureBytes + ownedBatch.info.gpuBytes + geometryBytes,
                    cpuBytes: ownedBatch.info.cpuBytes,
                    initialDataBytes: textureBytes + count * 64 + geometryBytes,
                    transitionDataBytes: 0 as const,
                });
            },
            setTransition(from, to, progress) {
                alive();
                if (
                    ![from, to].every((v) => Number.isInteger(v) && v >= 0 && v < targetCount) ||
                    !Number.isFinite(progress) ||
                    progress < 0 ||
                    progress > 1
                )
                    morphError('valid target indices and progress in [0,1] required');
                control.x = from;
                control.y = to;
                control.z = progress;
                ownedMaterial.setProperty('morphControl', control);
            },
            setIntensity(value) {
                alive();
                if (!Number.isFinite(Math.fround(value)) || value < 0)
                    morphError('finite nonnegative intensity required');
                display.x = value;
                ownedMaterial.setProperty('display', display);
            },
            setSurface(value, r = roughness) {
                alive();
                validateSurface(value, r);
                surface = value;
                roughness = r;
                display.y = value === 'polished' ? 1 : 0;
                display.z = r;
                ownedMaterial.setProperty('display', display);
            },
            getWorldBounds(out) {
                alive();
                return ownedBatch.getWorldBounds(out);
            },
            dispose,
        };
    } catch (error) {
        batch?.dispose();
        material?.destroy();
        mesh?.destroy();
        positions?.destroy();
        colors?.destroy();
        throw error;
    }
}
