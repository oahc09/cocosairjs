import { Mesh } from '../../../cocos/3d/assets/mesh';
import { Attribute, deviceManager, Feature, Format, PrimitiveMode } from '../../../cocos/gfx';
import { Vec3 } from '../../../cocos/core/math';
import { GLTFParserContext } from './parser-context';
import { check, item } from './schema';
import { ATTRIBUTES, checkAttributeType } from './attributes';
import { TEXTURE_SLOTS, slotTextureInfo, TextureSlotName } from './material/features';
import { coreTextureCoordinates, TextureCoordinates, transformTextureUV } from './material/texture-slots';
import { KHR_MESH_QUANTIZATION } from './extensions/geometry/quantization';

const FORMATS = [Format.UNKNOWN, Format.R32F, Format.RG32F, Format.RGB32F, Format.RGBA32F];
interface Channel { name: string; width: number; values: number[]; }
export class BinaryBuilder {
    private chunks: { offset: number; bytes: Uint8Array }[] = [];
    private length = 0;
    public append (values: Float32Array | Uint16Array | Uint32Array, count: number, stride: number): Mesh.IBufferView {
        this.length = Math.ceil(this.length / 4) * 4;
        const offset = this.length;
        const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
        this.chunks.push({ offset, bytes }); this.length += bytes.byteLength;
        return { offset, length: bytes.byteLength, count, stride };
    }
    public finish (): Uint8Array {
        const result = new Uint8Array(this.length);
        this.chunks.forEach(({ offset, bytes }) => result.set(bytes, offset));
        return result;
    }
}

export function createGLTFMesh (context: GLTFParserContext, meshIndex: number): Mesh {
    const source = item(context.json.meshes, meshIndex, 'mesh');
    check(source.primitives?.length, `mesh ${meshIndex}: no primitives`);
    const binary = new BinaryBuilder();
    const struct: Mesh.IStruct = { vertexBundles: [], primitives: [],
        minPosition: new Vec3(Infinity, Infinity, Infinity), maxPosition: new Vec3(-Infinity, -Infinity, -Infinity) };
    const morph: NonNullable<Mesh.IStruct['morph']> = { subMeshMorphs: [], weights: source.weights?.slice() };
    const targetCount = source.primitives[0].targets?.length || 0;
    let morphCount = targetCount;
    if (source.weights) { check(source.weights.length === targetCount && source.weights.every(Number.isFinite), 'invalid mesh morph weights'); }
    // KHR_mesh_quantization widens the accepted component types for mesh attributes.
    const quantized = context.extensionActive(KHR_MESH_QUANTIZATION);
    for (const [primitiveIndex, primitive] of source.primitives.entries()) {
        check((primitive.targets?.length || 0) === targetCount, 'inconsistent primitive morph target counts');
        const decoded = context.decodedPrimitive(meshIndex, primitiveIndex);
        let count: number;
        const channels: Channel[] = [];
        let decodedIndices: number[] | undefined;
        // Read one attribute from a core accessor into a channel (shared by both branches).
        const addAccessorChannel = (name: string, index: number, vertexCount: number): void => {
            if (!(name in ATTRIBUTES)) {
                check(!/^(JOINTS|WEIGHTS)_/.test(name), 'only JOINTS_0/WEIGHTS_0 (four influences) are supported');
                check(!/^TEXCOORD_/.test(name), 'only UV0 and UV1 are supported');
                context.warn(`mesh ${meshIndex}: unused attribute ${name}`); return;
            }
            const accessor = context.accessor(index);
            const width = ATTRIBUTES[name][1];
            check(accessor.count === vertexCount && (accessor.components === width || (name === 'COLOR_0' && accessor.components === 3)), `invalid ${name} shape`);
            checkAttributeType(name, accessor.source.componentType, !!accessor.source.normalized, quantized);
            const values = accessor.values.slice();
            if (name === 'COLOR_0' && accessor.components === 3) {
                values.length = 0;
                for (let i = 0; i < vertexCount; ++i) { values.push(...accessor.values.slice(i * 3, i * 3 + 3), 1); }
            }
            channels.push({ name, width, values });
        };
        if (decoded) {
            const position = decoded.attributes.POSITION;
            check(position && position.length % 3 === 0, `mesh ${meshIndex}: decoded POSITION is missing or invalid`);
            count = position.length / 3;
            const decodedNames = new Set<string>();
            for (const [name, values] of Object.entries(decoded.attributes)) {
                const mapping = ATTRIBUTES[name];
                if (!mapping) {
                    check(!/^(JOINTS|WEIGHTS)_/.test(name), 'only JOINTS_0/WEIGHTS_0 (four influences) are supported');
                    check(!/^TEXCOORD_/.test(name), 'only UV0 and UV1 are supported');
                    context.warn(`mesh ${meshIndex}: unused attribute ${name}`); continue;
                }
                check(values.length === count * mapping[1],
                    `mesh ${meshIndex}: decoded ${name} has ${values.length} components, expected ${count * mapping[1]}`);
                channels.push({ name, width: mapping[1], values: Array.from(values) });
                decodedNames.add(name);
            }
            // Attributes present in the primitive but NOT in the Draco payload are ordinary accessors
            // (KHR_draco_mesh_compression spec) — merge them instead of dropping them.
            for (const [name, index] of Object.entries(primitive.attributes || {})) {
                if (decodedNames.has(name)) { continue; }
                addAccessorChannel(name, index, count);
            }
            if (decoded.indices) { decodedIndices = Array.from(decoded.indices); }
        } else {
            const position = context.accessor(primitive.attributes.POSITION);
            check(position.source.type === 'VEC3', 'POSITION must be VEC3');
            checkAttributeType('POSITION', position.source.componentType, !!position.source.normalized, quantized);
            count = position.count;
            for (const [name, index] of Object.entries(primitive.attributes)) {
                addAccessorChannel(name, index, count);
            }
        }
        const weights = channels.find((c) => c.name === 'WEIGHTS_0');
        const joints = channels.find((c) => c.name === 'JOINTS_0');
        check(!!weights === !!joints, 'JOINTS_0 and WEIGHTS_0 must occur together');
        if (weights) {
            for (let i = 0; i < count; ++i) {
                const sum = weights.values.slice(i * 4, i * 4 + 4).reduce((a, b) => a + b, 0);
                check(sum > 0 && weights.values.slice(i * 4, i * 4 + 4).every((w) => w >= 0), 'invalid skin weights');
                for (let c = 0; c < 4; ++c) { weights.values[i * 4 + c] /= sum; }
            }
        }
        let indices = Array.from({ length: count }, (_, i) => i);
        if (decodedIndices) {
            indices = decodedIndices;
        } else if (primitive.indices !== undefined) {
            const accessor = context.accessor(primitive.indices);
            check(accessor.source.type === 'SCALAR' && !accessor.source.normalized && [5121, 5123, 5125].includes(accessor.source.componentType), 'invalid indices accessor');
            indices = accessor.values.slice();
            const restart = accessor.source.componentType === 5121 ? 255 : accessor.source.componentType === 5123 ? 65535 : 4294967295;
            check(indices.every((i) => i < count && i !== restart), 'index exceeds vertex count or uses reserved restart value');
        }
        const topology = convertTopology(indices, primitive.mode ?? 4);
        indices = topology.indices;
        // Morph target accessors are core glTF data, not part of the Draco payload; always read them.
        const targets = (primitive.targets || []).map((target) => {
            const entries: Record<string, number[]> = {};
            for (const [name, index] of Object.entries(target)) {
                check(['POSITION', 'NORMAL', 'TANGENT'].includes(name), `unsupported morph attribute ${name}`);
                const accessor = context.accessor(index);
                check(accessor.count === count && accessor.components === 3 && accessor.source.componentType === 5126, 'invalid morph accessor');
                entries[name] = accessor.values.slice();
            }
            return entries;
        });
        if (!channels.some((c) => c.name === 'NORMAL') && topology.mode === PrimitiveMode.TRIANGLE_LIST) {
            // Flat normals require splitting vertices, including every morph and skin channel.
            for (const channel of channels) {
                const expanded: number[] = [];
                for (const i of indices) { expanded.push(...channel.values.slice(i * channel.width, (i + 1) * channel.width)); }
                channel.values = expanded;
            }
            for (const target of targets) {
                for (const name of Object.keys(target)) {
                    const expanded: number[] = [];
                    for (const i of indices) { expanded.push(...target[name].slice(i * 3, i * 3 + 3)); }
                    target[name] = expanded;
                }
            }
            count = indices.length;
            indices = Array.from({ length: count }, (_, i) => i);
            const p = channels.find((c) => c.name === 'POSITION')!.values;
            const normals: number[] = [];
            for (let i = 0; i < count; i += 3) {
                const n = triangleNormal(p, i, i + 1, i + 2);
                normals.push(...n, ...n, ...n);
            }
            channels.push({ name: 'NORMAL', width: 3, values: normals });
        }
        const material = primitive.material === undefined ? undefined : item(context.json.materials, primitive.material, 'material');
        const features = primitive.material === undefined ? undefined : context.materialFeatures[primitive.material];
        const slotCoordinates = (slot: TextureSlotName): TextureCoordinates => {
            const info = slotTextureInfo(material ?? {}, slot);
            return features?.uv[slot] ?? coreTextureCoordinates(info);
        };
        for (const slot of TEXTURE_SLOTS) {
            const info = slotTextureInfo(material ?? {}, slot);
            if (info) { check(channels.some((c) => c.name === `TEXCOORD_${slotCoordinates(slot).texCoord}`), 'material references missing UV set'); }
        }
        if (material?.normalTexture && !channels.some((c) => c.name === 'TANGENT')) {
            check(topology.mode === PrimitiveMode.TRIANGLE_LIST, 'normal mapping requires triangles');
            channels.push({ name: 'TANGENT', width: 4, values: tangents(channels, indices, slotCoordinates('normal')) });
        }
        // Standard shaders declare these inputs even when their feature macro is disabled.
        for (const [name, width, defaults] of [['NORMAL', 3, [0, 0, 1]], ['TANGENT', 4, [1, 0, 0, 1]],
            ['TEXCOORD_0', 2, [0, 0]], ['TEXCOORD_1', 2, [0, 0]]] as [string, number, number[]][]) {
            if (!channels.some((c) => c.name === name)) {
                const defaultsValues: number[] = [];
                for (let i = 0; i < count; ++i) { defaultsValues.push(...defaults); }
                channels.push({ name, width, values: defaultsValues });
            }
        }
        const stride = channels.reduce((sum, c) => sum + c.width, 0);
        const vertices = new Float32Array(count * stride);
        let offset = 0;
        for (const channel of channels) {
            for (let i = 0; i < count; ++i) { vertices.set(channel.values.slice(i * channel.width, (i + 1) * channel.width), i * stride + offset); }
            offset += channel.width;
        }
        const p = channels.find((c) => c.name === 'POSITION')!.values;
        for (let i = 0; i < count; ++i) {
            const v = new Vec3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
            Vec3.min(struct.minPosition!, struct.minPosition!, v); Vec3.max(struct.maxPosition!, struct.maxPosition!, v);
        }
        const vertexIndex = struct.vertexBundles.length;
        struct.vertexBundles.push({ view: binary.append(vertices, count, stride * 4),
            attributes: channels.map((c) => new Attribute(ATTRIBUTES[c.name][0], FORMATS[c.width])) });
        const useUint32 = indices.some((i) => i >= 65535);
        check(!useUint32 || deviceManager.gfxDevice.hasFeature(Feature.ELEMENT_INDEX_UINT), 'device does not support 32-bit indices');
        struct.primitives.push({ vertexBundelIndices: [vertexIndex], primitiveMode: topology.mode,
            indexView: binary.append(useUint32 ? new Uint32Array(indices) : new Uint16Array(indices), indices.length, useUint32 ? 4 : 2) });
        if (targets.length) {
            const names = ['POSITION', 'NORMAL', 'TANGENT'].filter((name) => targets.some((t) => t[name]));
            morph.subMeshMorphs.push({ attributes: names.map((name) => ATTRIBUTES[name][0]),
                // MorphRendering interprets count as scalar float count, not vertex count.
                targets: targets.map((t) => ({ displacements: names.map((name) => binary.append(new Float32Array(t[name] || count * 3), count * 3, 4)) })) });
        } else { morph.subMeshMorphs.push(null); }
    }
    if (morphCount) { struct.morph = morph; }
    const mesh = new Mesh(); mesh.name = source.name || `mesh_${meshIndex}`;
    try { mesh.reset({ struct, data: binary.finish() }); return mesh; } catch (error) { mesh.destroy(); throw error; }
}

export function convertTopology (indices: number[], mode: number): { indices: number[]; mode: PrimitiveMode } {
    check(Number.isInteger(mode) && mode >= 0 && mode <= 6, 'invalid primitive mode');
    const output: number[] = [];
    if (mode === 2 || mode === 3) {
        for (let i = 1; i < indices.length; ++i) { output.push(indices[i - 1], indices[i]); }
        if (mode === 2 && indices.length > 1) { output.push(indices[indices.length - 1], indices[0]); }
    } else if (mode === 5 || mode === 6) {
        for (let i = 2; i < indices.length; ++i) { output.push(mode === 6 ? indices[0] : indices[i % 2 ? i - 1 : i - 2], mode === 6 ? indices[i - 1] : indices[i % 2 ? i - 2 : i - 1], indices[i]); }
    } else {
        const primitiveMode = mode === 0 ? PrimitiveMode.POINT_LIST : mode === 1 ? PrimitiveMode.LINE_LIST : PrimitiveMode.TRIANGLE_LIST;
        check(indices.length > 0 && (mode !== 1 || indices.length % 2 === 0) && (mode !== 4 || indices.length % 3 === 0), 'invalid primitive element count');
        return { indices, mode: primitiveMode };
    }
    const primitiveMode = mode <= 3 ? PrimitiveMode.LINE_LIST : PrimitiveMode.TRIANGLE_LIST;
    check(output.length > 0 && (primitiveMode !== PrimitiveMode.TRIANGLE_LIST || output.length % 3 === 0)
        && (primitiveMode !== PrimitiveMode.LINE_LIST || output.length % 2 === 0), 'invalid primitive element count');
    return { indices: output, mode: primitiveMode };
}
function triangleNormal (p: number[], a: number, b: number, c: number): number[] {
    const ab = new Vec3(p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]);
    const ac = new Vec3(p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]);
    Vec3.cross(ab, ab, ac); ab.normalize(); return [ab.x, ab.y, ab.z];
}
function tangents (channels: Channel[], indices: number[], coordinates: TextureCoordinates): number[] {
    const p = channels.find((c) => c.name === 'POSITION')!.values;
    const n = channels.find((c) => c.name === 'NORMAL')!.values;
    const sourceUV = channels.find((c) => c.name === `TEXCOORD_${coordinates.texCoord}`)!.values;
    const uv: number[] = [];
    for (let i = 0; i < sourceUV.length; i += 2) { uv.push(...transformTextureUV(coordinates, sourceUV[i], sourceUV[i + 1])); }
    const tan = new Float32Array(p.length); const bitan = new Float32Array(p.length);
    for (let i = 0; i < indices.length; i += 3) {
        const [a, b, c] = indices.slice(i, i + 3);
        const s1 = uv[b * 2] - uv[a * 2]; const t1 = uv[b * 2 + 1] - uv[a * 2 + 1];
        const s2 = uv[c * 2] - uv[a * 2]; const t2 = uv[c * 2 + 1] - uv[a * 2 + 1];
        const det = s1 * t2 - s2 * t1;
        if (Math.abs(det) < 1e-12) { continue; }
        for (let k = 0; k < 3; ++k) {
            const x1 = p[b * 3 + k] - p[a * 3 + k]; const x2 = p[c * 3 + k] - p[a * 3 + k];
            for (const v of [a, b, c]) { tan[v * 3 + k] += (t2 * x1 - t1 * x2) / det; bitan[v * 3 + k] += (s1 * x2 - s2 * x1) / det; }
        }
    }
    const out: number[] = [];
    for (let i = 0; i < p.length; i += 3) {
        const normal = new Vec3(n[i], n[i + 1], n[i + 2]).normalize();
        const tangent = new Vec3(tan[i], tan[i + 1], tan[i + 2]);
        Vec3.scaleAndAdd(tangent, tangent, normal, -Vec3.dot(normal, tangent));
        if (tangent.lengthSqr() < 1e-12) { Vec3.cross(tangent, Math.abs(normal.x) < 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0), normal); }
        tangent.normalize(); const cross = Vec3.cross(new Vec3(), normal, tangent);
        const sign = Vec3.dot(cross, new Vec3(bitan[i], bitan[i + 1], bitan[i + 2])) < 0 ? -1 : 1;
        out.push(tangent.x, tangent.y, tangent.z, sign);
    }
    return out;
}
