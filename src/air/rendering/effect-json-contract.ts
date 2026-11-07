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
/** Internal registration boundary for compiled effect JSON; no device or engine imports. */
const arrays = [
    'defines',
    'attributes',
    'blocks',
    'samplerTextures',
    'samplers',
    'textures',
    'buffers',
    'images',
    'subpassInputs',
    'descriptors',
] as const;
type JsonRecord = Record<string, any>;
const automaticHashes = new WeakMap<object, number>();

function invalid(effect: string, shader: string, path: string, expected: string, missing = false): never {
    const code = missing ? 'AIR_E_EFFECT_JSON_MISSING_FIELD' : 'AIR_E_EFFECT_JSON_TYPE';
    throw Object.assign(
        new TypeError(`[${code}] effect '${effect}', shader '${shader}', ${path}: expected ${expected}`),
        { code, effect, shader, path, expected },
    );
}

function record(value: unknown, effect: string, shader: string, path: string): JsonRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(effect, shader, path, 'object');
    return value as JsonRecord;
}

function copy(value: any): any {
    if (Array.isArray(value)) return value.map(copy);
    if (value && typeof value === 'object') {
        const out = Object.create(null) as JsonRecord;
        for (const key of Object.keys(value)) out[key] = copy(value[key]);
        return out;
    }
    return value;
}

/** Stable semantic identity: names do not change compiled layouts; object key order is immaterial. */
export function effectShaderSignature(shader: JsonRecord): string {
    const stable = (value: any): any => {
        if (Array.isArray(value)) return value.map(stable);
        if (value && typeof value === 'object') {
            const out = Object.create(null) as JsonRecord;
            for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
            return out;
        }
        return value;
    };
    const { hash, name, ...content } = shader;
    return JSON.stringify(stable(content));
}

/** Missing optional arrays are empty; explicit null/wrong types fail before registry/cache mutation. */
export function normalizeEffectShader<T>(input: T, effect = '<direct>', path = 'shader'): T & { hash: number } {
    const source = record(input, effect, '<unnamed>', path);
    const name = source.name;
    if (typeof name !== 'string' || !name)
        invalid(effect, '<unnamed>', `${path}.name`, 'non-empty string', name === undefined);
    for (const key of arrays) {
        if (source[key] !== undefined && !Array.isArray(source[key])) invalid(effect, name, `${path}.${key}`, 'array');
    }
    if (source.hash !== undefined && !Number.isSafeInteger(source.hash))
        invalid(effect, name, `${path}.hash`, 'finite safe integer');
    const normalized = copy(source);
    for (const key of arrays) normalized[key] ??= [];
    const builtins = source.builtins === undefined ? {} : record(source.builtins, effect, name, `${path}.builtins`);
    normalized.builtins = { ...normalized.builtins };
    for (const group of ['globals', 'locals']) {
        const members =
            builtins[group] === undefined ? {} : record(builtins[group], effect, name, `${path}.builtins.${group}`);
        normalized.builtins[group] = copy(members);
        for (const key of ['blocks', 'samplerTextures', 'buffers', 'images']) {
            if (members[key] !== undefined && !Array.isArray(members[key]))
                invalid(effect, name, `${path}.builtins.${group}.${key}`, 'array');
            normalized.builtins[group][key] ??= [];
        }
    }
    normalized.builtins.statistics = copy(
        builtins.statistics === undefined
            ? {}
            : record(builtins.statistics, effect, name, `${path}.builtins.statistics`),
    );
    // Native output helpers keep their old behaviour unless a camera explicitly captures linear HDR.
    let hdrOutput = false;
    for (const variant of ['glsl3', 'glsl4']) {
        const frag = normalized[variant]?.frag;
        if (typeof frag !== 'string') continue;
        let patched = frag;
        if (frag.includes('CC_AIR_LINEAR_HDR')) {
            hdrOutput = true;
        } else {
            patched = patched.replace(
                /(vec4\s+CCFragOutput\s*\(\s*vec4\s+color\s*\)\s*\{)/,
                '$1\n#if CC_AIR_LINEAR_HDR\nreturn color;\n#endif\n',
            );
            if (frag.includes('HDRToLDR') && frag.includes('LinearToSRGB')) {
                patched = patched.replace(
                    /#if\s+(!CC_USE_FLOAT_OUTPUT(?:\s*\|\|\s*CC_IS_TRANSPARENCY_PASS)?)(?=\s*\n)/g,
                    '#if ($1) && !CC_AIR_LINEAR_HDR',
                );
            }
        }
        // The stock skybox returns its color directly instead of calling CCFragOutput.
        // Keep exposure, but defer tone mapping / display encoding to the HDR camera's
        // output stage. Match the skybox radiance expression, not arbitrary RGBE passes.
        patched = patched.replace(
            /(vec4\s+color\s*=\s*vec4\(c\s*\*\s*cc_ambientSky\.w,\s*1\.0\);\s*)(#if\s+CC_USE_RGBE_OUTPUT)/,
            '$1#if CC_AIR_LINEAR_HDR\nreturn color;\n#endif\n$2',
        );
        // HDR readback must retain radiance, not mediump sampler/pow quantization.
        // Scope the higher default precision to the HDR variant; ordinary cameras
        // retain the original shader's precision and display output byte-for-byte.
        if (
            /vec4\s+color\s*=\s*vec4\(c\s*\*\s*cc_ambientSky\.w,\s*1\.0\);\s*#if CC_AIR_LINEAR_HDR\s+return color;\s*#endif\s*#if CC_USE_RGBE_OUTPUT/.test(
                patched,
            ) &&
            !patched.includes('#if CC_AIR_LINEAR_HDR\nprecision highp float;')
        ) {
            patched = patched.replace(
                /precision\s+(?:lowp|mediump|highp)\s+float\s*;/,
                '$&\n#if CC_AIR_LINEAR_HDR\nprecision highp float;\nprecision highp sampler2D;\nprecision highp samplerCube;\n#endif',
            );
        }
        if (patched !== frag) {
            normalized[variant].frag = patched;
            hdrOutput = true;
        }
    }
    if (hdrOutput && !normalized.defines.some((define: JsonRecord) => define.name === 'CC_AIR_LINEAR_HDR')) {
        normalized.defines.push({ name: 'CC_AIR_LINEAR_HDR', type: 'boolean' });
    }
    if (normalized.hash === undefined || automaticHashes.get(source) === normalized.hash) {
        const signature = effectShaderSignature(normalized);
        let hash = 2166136261;
        for (let i = 0; i < signature.length; ++i) hash = Math.imul(hash ^ signature.charCodeAt(i), 16777619);
        normalized.hash = hash >>> 0;
        automaticHashes.set(normalized, normalized.hash);
    }
    return normalized as T & { hash: number };
}

export function normalizeEffectShaders<T>(shaders: T[], effect: string): T[] {
    if (!Array.isArray(shaders)) invalid(effect, '<unnamed>', 'shaders', 'array');
    return shaders.map((shader, index) => normalizeEffectShader(shader, effect, `shaders[${index}]`));
}
