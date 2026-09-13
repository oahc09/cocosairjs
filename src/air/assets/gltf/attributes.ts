/** Shared glTF attribute tables: engine mapping and per-semantic component-type rules. */
import { AttributeName } from '../../../cocos/gfx';
import { check } from './schema';

/** glTF semantic → engine attribute + component count. */
export const ATTRIBUTES: Record<string, readonly [AttributeName, number]> = {
    POSITION: [AttributeName.ATTR_POSITION, 3],
    NORMAL: [AttributeName.ATTR_NORMAL, 3],
    TANGENT: [AttributeName.ATTR_TANGENT, 4],
    TEXCOORD_0: [AttributeName.ATTR_TEX_COORD, 2],
    TEXCOORD_1: [AttributeName.ATTR_TEX_COORD1, 2],
    COLOR_0: [AttributeName.ATTR_COLOR, 4],
    JOINTS_0: [AttributeName.ATTR_JOINTS, 4],
    WEIGHTS_0: [AttributeName.ATTR_WEIGHTS, 4],
};

export const BYTE = 5120;
export const UNSIGNED_BYTE = 5121;
export const SHORT = 5122;
export const UNSIGNED_SHORT = 5123;
export const UNSIGNED_INT = 5125;
export const FLOAT = 5126;

/**
 * Component types accepted for one attribute semantic. Integer types listed in
 * `normalizedTypes` are only valid with `normalized: true`: the accessor read path
 * dequantizes them to floating point, which is what `KHR_mesh_quantization` requires.
 */
export interface AttributeTypeRule {
    readonly types: readonly number[];
    readonly normalizedTypes?: readonly number[];
}

const CORE_RULES: Record<string, AttributeTypeRule> = {
    POSITION: { types: [FLOAT] },
    NORMAL: { types: [FLOAT] },
    TANGENT: { types: [FLOAT] },
    // Skin joint indices are raw integers and must never be normalized.
    JOINTS: { types: [UNSIGNED_BYTE, UNSIGNED_SHORT] },
    TEXCOORD: { types: [FLOAT], normalizedTypes: [UNSIGNED_BYTE, UNSIGNED_SHORT] },
    COLOR: { types: [FLOAT], normalizedTypes: [UNSIGNED_BYTE, UNSIGNED_SHORT] },
    WEIGHTS: { types: [FLOAT], normalizedTypes: [UNSIGNED_BYTE, UNSIGNED_SHORT] },
};

/**
 * `KHR_mesh_quantization` allowed types, per the spec table:
 *  - POSITION / TEXCOORD_n: signed *or* unsigned 8/16-bit ints, normalized *or* unnormalized (plus float).
 *  - NORMAL / TANGENT: normalized BYTE or SHORT only (unnormalized float allowed); unsigned and
 *    non-normalized ints are rejected because they cannot represent a unit vector.
 *  - COLOR/WEIGHTS/JOINTS: unchanged by this extension (core rules govern; JOINTS stay raw unsigned).
 */
const QUANTIZED_RULES: Record<string, AttributeTypeRule> = {
    POSITION: { types: [FLOAT, BYTE, UNSIGNED_BYTE, SHORT, UNSIGNED_SHORT], normalizedTypes: [BYTE, UNSIGNED_BYTE, SHORT, UNSIGNED_SHORT] },
    NORMAL: { types: [FLOAT], normalizedTypes: [BYTE, SHORT] },
    TANGENT: { types: [FLOAT], normalizedTypes: [BYTE, SHORT] },
    JOINTS: { types: [UNSIGNED_BYTE, UNSIGNED_SHORT] },
    TEXCOORD: { types: [FLOAT, BYTE, UNSIGNED_BYTE, SHORT, UNSIGNED_SHORT], normalizedTypes: [BYTE, UNSIGNED_BYTE, SHORT, UNSIGNED_SHORT] },
    COLOR: { types: [FLOAT], normalizedTypes: [BYTE, UNSIGNED_BYTE, SHORT, UNSIGNED_SHORT] },
    WEIGHTS: { types: [FLOAT], normalizedTypes: [UNSIGNED_BYTE, UNSIGNED_SHORT] },
};

/** Strips the set index from a semantic: `TEXCOORD_1` → `TEXCOORD`. */
export function attributeSemantic (name: string): string {
    return name.replace(/_\d+$/, '');
}

export function attributeTypeRule (name: string, quantized: boolean): AttributeTypeRule {
    const table = quantized ? QUANTIZED_RULES : CORE_RULES;
    return table[attributeSemantic(name)] ?? { types: [FLOAT], normalizedTypes: [BYTE, UNSIGNED_BYTE, SHORT, UNSIGNED_SHORT] };
}

/** Table-driven component-type validation shared by the core mesh path and the quantization handler. */
export function checkAttributeType (name: string, componentType: number, normalized: boolean, quantized: boolean): void {
    const rule = attributeTypeRule(name, quantized);
    const allowed = rule.types.includes(componentType)
        || (normalized && (rule.normalizedTypes?.includes(componentType) ?? false));
    check(allowed, `invalid ${name} componentType ${componentType}${normalized ? ' (normalized)' : ''}`
        + `${quantized ? ' with KHR_mesh_quantization' : ''}`);
}
