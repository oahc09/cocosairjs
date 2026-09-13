import { Vec4 } from '../../../../cocos/core/math';
import { check, TextureInfo } from '../schema';

export interface TextureCoordinates { texCoord: number; row0: Vec4; row1: Vec4; }

/**
 * Core UV set selection (identity transform): texCoord comes from the TextureInfo only.
 * KHR_texture_transform handling lives in the texture-transform extension handler.
 */
export function coreTextureCoordinates (info?: TextureInfo): TextureCoordinates {
    const texCoord = info?.texCoord === undefined ? 0 : info.texCoord;
    check(texCoord === 0 || texCoord === 1, 'only UV0/UV1 are supported');
    return { texCoord, row0: new Vec4(1, 0, 0, 0), row1: new Vec4(0, 1, 0, 0) };
}

/** The transformed-UV GLSL expression a slot samples with (shared with the sampler declaration). */
export function textureUVExpression (uv: string, prefix: string): string {
    return `vec2(dot(${prefix}UV0.xyz, vec3(${uv}, 1.0)), dot(${prefix}UV1.xyz, vec3(${uv}, 1.0)))`;
}

/** T * R * S around the top-left UV origin, matching Khronos Sample Renderer's UV rotation convention. */
export function textureCoordinates (info?: TextureInfo): TextureCoordinates {
    const extension = info?.extensions?.KHR_texture_transform;
    check(extension === undefined || (extension !== null && typeof extension === 'object' && !Array.isArray(extension)), 'invalid KHR_texture_transform');
    const transform = extension as { offset?: number[]; scale?: number[]; rotation?: number; texCoord?: number } | undefined;
    const offset = transform?.offset === undefined ? [0, 0] : transform.offset;
    const scale = transform?.scale === undefined ? [1, 1] : transform.scale;
    const rotation = transform?.rotation === undefined ? 0 : transform.rotation;
    check(Array.isArray(offset) && offset.length === 2 && offset.every(Number.isFinite), 'KHR_texture_transform.offset must contain two finite numbers');
    check(Array.isArray(scale) && scale.length === 2 && scale.every(Number.isFinite), 'KHR_texture_transform.scale must contain two finite numbers');
    check(typeof rotation === 'number' && Number.isFinite(rotation), 'KHR_texture_transform.rotation must be finite');
    const texCoord = transform?.texCoord !== undefined ? transform.texCoord : info?.texCoord === undefined ? 0 : info.texCoord;
    check(texCoord === 0 || texCoord === 1, 'only UV0/UV1 are supported (including KHR_texture_transform.texCoord)');
    const c = Math.cos(rotation); const s = Math.sin(rotation);
    return { texCoord, row0: new Vec4(c * scale[0], s * scale[1], offset[0], 0),
        row1: new Vec4(-s * scale[0], c * scale[1], offset[1], 0) };
}

export function transformTextureUV (coordinates: TextureCoordinates, u: number, v: number): [number, number] {
    const { row0, row1 } = coordinates;
    return [row0.x * u + row0.y * v + row0.z, row1.x * u + row1.y * v + row1.z];
}

/**
 * Source-level sampling expression that applies a texture slot's UV transform matrix, mirroring
 * the string-injection form used by the glTF standard effect (language-aware texture() call).
 */
export function textureTransform (language: 'glsl1' | 'glsl3' | 'glsl4', sampler: string, uv: string, prefix: string): string {
    const expr = `vec2(dot(${prefix}UV0.xyz, vec3(${uv}, 1.0)), dot(${prefix}UV1.xyz, vec3(${uv}, 1.0)))`;
    return `${language === 'glsl1' ? 'texture2D' : 'texture'}(${sampler}, ${expr})`;
}
