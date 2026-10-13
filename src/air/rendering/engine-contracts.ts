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
/** Read-only native contract inspection. Never compiles, starts playback or changes render state. */
import type { Mesh } from '../../cocos/3d/assets/mesh';
import type { Material } from '../../cocos/asset/assets/material';
import type { Node } from '../../cocos/scene-graph/node';
import type { Scene } from '../../cocos/scene-graph/scene';
import type { MeshRenderer } from '../../cocos/3d/framework/mesh-renderer';
import { Animation } from '../../cocos/animation/animation-component';
import { AttributeName, PrimitiveMode } from '../../cocos/gfx';
import { Vec3 } from '../../cocos/core/math';
import { inspectAirMaterial } from './material-diagnostics';

export interface AirContractIssue { readonly code: string; readonly severity: 'info' | 'warning' | 'error'; readonly message: string; }

export function inspectAirMeshMaterial (mesh: Mesh, material: Material, primitiveIndex = 0, renderer?: MeshRenderer) {
    const primitive = mesh.struct.primitives[primitiveIndex];
    if (!primitive) throw Object.assign(new RangeError('[AIR_E_MESH_PRIMITIVE] invalid inspection primitiveIndex'), { code: 'AIR_E_MESH_PRIMITIVE', primitiveIndex });
    const attributes = primitive.vertexBundelIndices.reduce<string[]>((all, index) => all.concat(mesh.struct.vertexBundles[index].attributes.map(a => a.name)), []);
    const issues: AirContractIssue[] = [];
    const builtin = material.effectAsset?.name === 'builtin-unlit' || material.effectAsset?.name.startsWith('air-unlit-fog-');
    const passes = material.passes.map((pass, passIndex) => {
        const defines = { ...pass.defines };
        const variant = renderer?.model?.subModels[primitiveIndex]?.shaders[passIndex];
        const raw = pass as unknown as { _shader?: { _gpuShader?: { glProgram: unknown; glInputs: { name: string }[] } } };
        const reflection = variant ? (variant as unknown as NonNullable<typeof raw._shader>)._gpuShader : raw._shader?._gpuShader;
        const activeAttributes = reflection?.glProgram ? reflection.glInputs.map(a => a.name) : null;
        if (builtin) {
            if (attributes.includes(AttributeName.ATTR_COLOR) && !defines.USE_VERTEX_COLOR)
                issues.push({ code: 'AIR_W_VERTEX_COLOR_DISABLED', severity: 'warning', message: `pass ${passIndex}: mesh colors exist but USE_VERTEX_COLOR is disabled` });
            if (defines.USE_VERTEX_COLOR && !attributes.includes(AttributeName.ATTR_COLOR))
                issues.push({ code: 'AIR_E_VERTEX_COLOR_MISSING', severity: 'error', message: `pass ${passIndex}: USE_VERTEX_COLOR requires a_color` });
            if (defines.USE_VERTEX_COLOR && activeAttributes && !activeAttributes.includes(AttributeName.ATTR_COLOR))
                issues.push({ code: 'AIR_W_VERTEX_COLOR_INACTIVE', severity: 'warning', message: `pass ${passIndex}: compiled WebGL reflection does not consume a_color` });
            if (defines.USE_TEXTURE && !attributes.includes(AttributeName.ATTR_TEX_COORD))
                issues.push({ code: 'AIR_W_TEXTURE_UV_MISSING', severity: 'warning', message: `pass ${passIndex}: missing a_texCoord uses the generic constant attribute; verify intended sampling` });
        }
        return Object.freeze({ passIndex, defines: Object.freeze(defines), reflection: activeAttributes ? 'webgl-active' as const : 'unavailable' as const,
            activeAttributes: activeAttributes && Object.freeze(activeAttributes) });
    });
    return Object.freeze({ primitiveIndex, attributes: Object.freeze(attributes), builtinContractChecked: Boolean(builtin),
        passes: Object.freeze(passes), states: inspectAirMaterial(material), issues: Object.freeze(issues.map(issue => Object.freeze(issue))) });
}

export function inspectAirGeometry (mesh: Mesh, node: Node, material?: Material, primitiveIndex = 0, maxTriangles = 64) {
    if (!Number.isInteger(maxTriangles) || maxTriangles < 1 || maxTriangles > 1024) throw new RangeError('maxTriangles must be 1..1024');
    const primitive = mesh.struct.primitives[primitiveIndex];
    if (!primitive) throw new RangeError('invalid geometry primitiveIndex');
    const matrix = node.getWorldMatrix();
    const determinant = matrix.m00 * (matrix.m05 * matrix.m10 - matrix.m06 * matrix.m09)
        - matrix.m04 * (matrix.m01 * matrix.m10 - matrix.m02 * matrix.m09) + matrix.m08 * (matrix.m01 * matrix.m06 - matrix.m02 * matrix.m05);
    const states = material ? inspectAirMaterial(material) : [];
    const unavailable = primitive.primitiveMode !== PrimitiveMode.TRIANGLE_LIST;
    const positions = unavailable ? null : mesh.readAttribute(primitiveIndex, AttributeName.ATTR_POSITION);
    const normals = positions ? mesh.readAttribute(primitiveIndex, AttributeName.ATTR_NORMAL) : null;
    const indices = positions ? mesh.readIndices(primitiveIndex) : null;
    const triangles: { index: number; normal: readonly number[]; providedNormalDot: number | null; degenerate: boolean }[] = [];
    if (positions) {
        const count = Math.floor((indices?.length ?? positions.length / 3) / 3);
        for (let t = 0; t < Math.min(count, maxTriangles); t++) {
            const ids = [0, 1, 2].map(j => indices ? indices[t * 3 + j] : t * 3 + j);
            const p = ids.map(i => new Vec3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]));
            const a = Vec3.subtract(new Vec3(), p[1], p[0]), b = Vec3.subtract(new Vec3(), p[2], p[0]);
            const normal = Vec3.cross(new Vec3(), a, b), length = normal.length();
            if (length) Vec3.multiplyScalar(normal, normal, 1 / length);
            let dot: number | null = null;
            if (normals) { const average = new Vec3(); for (const i of ids) { average.x += normals[i * 3]; average.y += normals[i * 3 + 1]; average.z += normals[i * 3 + 2]; }
                if (average.length()) { Vec3.normalize(average, average); dot = Vec3.dot(normal, average); } }
            triangles.push({ index: t, normal: Object.freeze([normal.x, normal.y, normal.z]), providedNormalDot: dot, degenerate: length < 1e-8 });
        }
    }
    return Object.freeze({ scope: 'sampled-local-triangle-winding' as const, available: Boolean(positions),
        reason: unavailable ? 'topology is not TRIANGLE_LIST' : !positions ? 'CPU positions unavailable' : null,
        worldMatrix: Object.freeze([matrix.m00, matrix.m01, matrix.m02, matrix.m03, matrix.m04, matrix.m05, matrix.m06, matrix.m07,
            matrix.m08, matrix.m09, matrix.m10, matrix.m11, matrix.m12, matrix.m13, matrix.m14, matrix.m15]),
        determinant, negativeScale: determinant < 0, singular: Math.abs(determinant) < 1e-8,
        states, triangles: Object.freeze(triangles.map(triangle => Object.freeze(triangle))) });
}

export function inspectAirAnimationControllers (root: Node) {
    const claims = new Map<string, { controller: string; clip: string; target: string; channel: string }[]>();
    const unresolved: string[] = [];
    const controllers = root.getComponentsInChildren(Animation);
    for (const animation of controllers) for (const clip of animation.clips) {
        if (!clip) continue;
        for (const track of clip.tracks) {
            let target: Node | null = animation.node; const channel: string[] = [];
            for (let i = 0; i < track.path.length; i++) {
                if (track.path.isHierarchyAt(i)) target = target?.getChildByPath(track.path.parseHierarchyAt(i)) ?? null;
                else if (track.path.isPropertyAt(i)) channel.push('property:' + track.path.parsePropertyAt(i));
                else if (track.path.isComponentAt(i)) channel.push('component:' + track.path.parseComponentAt(i));
                else if (track.path.isElementAt(i)) channel.push('element:' + track.path.parseElementAt(i));
                else { target = null; break; }
            }
            if (!target) { unresolved.push(`${animation.uuid}:${clip.name}`); continue; }
            const key = target.uuid + ':' + channel.join('/'), records = claims.get(key) ?? [];
            records.push({ controller: animation.uuid, clip: clip.name, target: target.uuid, channel: channel.join('/') }); claims.set(key, records);
        }
    }
    const conflicts = [...claims.values()].filter(records => new Set(records.map(r => r.controller)).size > 1);
    return Object.freeze({ scope: 'potential-track-overlap' as const, controllerCount: controllers.length,
        conflicts: Object.freeze(conflicts.map(records => Object.freeze(records.map(record => Object.freeze(record))))), unresolved: Object.freeze(unresolved),
        note: 'Metadata overlaps are potential conflicts, not proof of simultaneous playback. No states were initialized.' });
}

export function inspectAirDirectionalLights (scene: Scene) {
    const native = scene.renderScene;
    if (!native) return Object.freeze({ status: 'unavailable' as const, reason: 'scene has no native render scene', lights: [] });
    return Object.freeze({ status: 'available' as const, scope: 'legacy-forward-main-directional' as const,
        ordinaryDirectionalCapacity: 1, selection: 'native-mainLight' as const,
        lights: Object.freeze(native.directionalLights.map(light => Object.freeze({ node: light.node?.uuid ?? null,
            name: light.node?.name ?? null, effective: light === native.mainLight }))),
        mainLight: native.mainLight?.node?.uuid ?? null,
        note: 'Custom pipeline/ranged directionals are outside this ordinary mainLight contract.' });
}
