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
/**
 * Cocos AIR — 运行期装配的全屏效果 EffectAsset（AIR 原创，上游无同名文件）。
 *
 * 引擎快照的运行期按 gfxAPI 选源码变体（`src/cocos/render-scene/core/program-lib.ts:592-600`，
 * WebGL2 → `glsl3`），并且没有 chunk include 系统，所以自定义 effect 必须自带完整源码。
 * 这里把这套样板（set/binding 约定、`Constants` 块 + 采样器布局）
 * 收在一处，调用方只写片元主体。布局与 `examples/shader-emboss` 里已在浏览器验证过的
 * 版本一致：MATERIAL set=1，`Constants` 块 binding 0，采样器从 binding 1 顺延。
 *
 * 只提供 `glsl3`/`glsl4`：`AirRenderTarget` 本身要求 WebGL2（见
 * `src/air/rendering/render-target.ts:109`），GLSL ES 1.00 分支永远走不到，
 * 为其手写第二方言只会产生一份无人验证的死代码。
 */
import { EffectAsset } from '../../cocos/asset/assets/effect-asset';
import { cclegacy } from '../../cocos/core/global-exports';
import { ShaderStageFlagBit, Type } from '../../cocos/gfx';

// The quad uses clip-space coordinates and has no camera or model UBOs. Declaring
// unused blocks is unsafe: drivers may retain them as active, and a first-frame
// full-screen pass has no model-local descriptor to bind.
const VERT_BODY = `in vec3 a_position;
in vec2 a_texCoord;
out highp vec2 v_uv;
void main () {
  v_uv = a_texCoord;
  gl_Position = vec4(a_position.xy, 0.0, 1.0);
}`;

/** @en Body that strips `layout(...)` qualifiers to turn a GLSL 4 source into the GLSL 3 one. */
function toGlsl3(source: string): string {
    return source.replace(/layout\s*\([^)]*\)\s*/g, '');
}

function hashSource(text: string): number {
    let hash = 2166136261;
    for (let i = 0; i < text.length; ++i) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return hash >>> 0;
}

export interface AirScreenEffectOptions {
    /** @en Effect name; must be unique, registration keeps it until the asset is destroyed. @zh effect 名，必须唯一，注册后直到资产销毁才释放。 */
    name: string;
    /**
     * @en GLSL ES 3.00 fragment body (helper functions plus `void main()`), written after the
     *  generated preamble that declares `v_uv`, the `Constants` block, the samplers and
     *  `cc_FragColor`.
     * @zh 片元主体（辅助函数 + `void main()`），接在自动生成的声明之后：`v_uv`、`Constants`
     *  块、采样器和 `cc_FragColor` 都已声明好，主体只需写它们并使用 `cc_FragColor` 输出。
     */
    body: string;
    /** @en `vec4` members of the generated `Constants` block, in declaration order. @zh 生成的 `Constants` 块的 vec4 成员，按声明顺序。 */
    constants: readonly string[];
    /** @en `sampler2D` names, bound after the `Constants` block. @zh sampler2D 名称，接在 `Constants` 块之后绑定。 */
    samplers?: readonly string[];
    /** @en Boolean macro names the material can switch on through `initialize({ defines })`. @zh 可通过 material `initialize({ defines })` 打开的布尔宏名。 */
    defines?: readonly string[];
    /** @en Initial values for the pass properties; every key must be a declared constant. @zh pass 属性初值，键必须是已声明的常量。 */
    defaults?: Readonly<Record<string, readonly number[]>>;
}

function fail(code: string, message: string): never {
    const error = new Error(`[${code}] ${message}`);
    Object.assign(error, { code });
    throw error;
}

/**
 * @en Assemble and register a full-screen effect asset at runtime. Returns an asset the caller
 *  owns (addRef while a material uses it, destroy when done).
 * @zh 运行期装配并注册一个全屏 effect 资产。返回的资产由调用方持有（材质使用期间 addRef，用完
 *  destroy）；调用时机与 `createAirRenderTarget` 一样必须在 `createAirApp()` 之后。
 */
export function createAirScreenEffect(options: AirScreenEffectOptions): EffectAsset {
    if (!options || typeof options !== 'object') fail('AIR_E_SCREEN_EFFECT_OPTIONS', 'provide effect options');
    const { name, body, constants } = options;
    if (typeof name !== 'string' || !name) fail('AIR_E_SCREEN_EFFECT_NAME', 'name must be a non-empty string');
    if (EffectAsset.get(name))
        fail(
            'AIR_E_SCREEN_EFFECT_NAME',
            `${name} is already registered; destroy the previous effect or pass a unique name`,
        );
    if (typeof body !== 'string' || !body.includes('void main'))
        fail('AIR_E_SCREEN_EFFECT_BODY', 'body must be GLSL containing void main');
    if (!Array.isArray(constants) || constants.length === 0)
        fail('AIR_E_SCREEN_EFFECT_CONSTANTS', 'declare at least one vec4 constant');
    const samplers = options.samplers ?? [];
    const identifiers = [...constants, ...samplers];
    for (const id of identifiers)
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id))
            fail('AIR_E_SCREEN_EFFECT_MEMBER', `${String(id)} must be a GLSL identifier`);
    if (new Set(identifiers).size !== identifiers.length)
        fail('AIR_E_SCREEN_EFFECT_MEMBER', 'constant and sampler names must be unique');
    for (const define of options.defines ?? [])
        if (!/^[A-Z][A-Z0-9_]*$/.test(define))
            fail('AIR_E_SCREEN_EFFECT_DEFINE', `${String(define)} must be an upper-case macro name`);
    const defaults = options.defaults ?? {};
    for (const [key, value] of Object.entries(defaults)) {
        if (!constants.includes(key)) fail('AIR_E_SCREEN_EFFECT_DEFAULT', `${key} is not a declared constant`);
        if (!Array.isArray(value) || value.length !== 4 || !value.every((component) => Number.isFinite(component)))
            fail('AIR_E_SCREEN_EFFECT_DEFAULT', `${key} must be four finite numbers`);
    }

    const frag4 = `precision highp float;
in highp vec2 v_uv;
layout(set = 1, binding = 0) uniform Constants {
${constants.map((member) => `    vec4 ${member};`).join('\n')}
};
${samplers.map((sampler, index) => `layout(set = 1, binding = ${index + 1}) uniform highp sampler2D ${sampler};`).join('\n')}
out vec4 cc_FragColor;
${body}
`;
    const vert4 = `precision highp float;\n${VERT_BODY}`;
    const sources = { glsl3: { vert: toGlsl3(vert4), frag: toGlsl3(frag4) }, glsl4: { vert: vert4, frag: frag4 } };
    const program = `${name}-program`;
    const hash = hashSource(JSON.stringify(sources));
    const properties: Record<string, { value: number[]; type: Type }> = {};
    for (const [key, value] of Object.entries(defaults)) properties[key] = { value: value.slice(), type: Type.FLOAT4 };

    const effect = Object.assign(new EffectAsset(), {
        name,
        techniques: [
            {
                passes: [
                    {
                        program,
                        rasterizerState: { cullMode: 0 },
                        depthStencilState: { depthTest: false, depthWrite: false },
                        blendState: { targets: [{ blend: false }] },
                        properties,
                    },
                ],
            },
        ],
        shaders: [
            {
                name: program,
                hash,
                builtins: {
                    statistics: {
                        CC_EFFECT_USED_VERTEX_UNIFORM_VECTORS: 0,
                        CC_EFFECT_USED_FRAGMENT_UNIFORM_VECTORS: constants.length + samplers.length * 4,
                    },
                    globals: {
                        blocks: [],
                        samplerTextures: [],
                        buffers: [],
                        images: [],
                    },
                    locals: { blocks: [], samplerTextures: [], buffers: [], images: [] },
                },
                defines: (options.defines ?? []).map((define) => ({ name: define, type: 'boolean' })),
                attributes: [
                    { name: 'a_position', defines: [], format: 32, location: 0 },
                    { name: 'a_texCoord', defines: [], format: 21, location: 2 },
                ],
                blocks: [
                    {
                        name: 'Constants',
                        defines: [],
                        binding: 0,
                        stageFlags: ShaderStageFlagBit.FRAGMENT,
                        members: constants.map((member) => ({ name: member, type: Type.FLOAT4, count: 1 })),
                    },
                ],
                samplerTextures: samplers.map((sampler, index) => ({
                    name: sampler,
                    type: Type.SAMPLER2D,
                    count: 1,
                    defines: [],
                    stageFlags: ShaderStageFlagBit.FRAGMENT,
                    set: 1,
                    binding: index + 1,
                })),
                buffers: [],
                images: [],
                textures: [],
                samplers: [],
                subpassInputs: [],
            },
        ],
        combinations: [],
        hideInEditor: false,
    } as unknown as Partial<EffectAsset>);
    Object.assign(effect.shaders[0], sources);
    effect.onLoaded();
    // Owned effects carry no precompile combinations; drop the deferred callback so a creation
    // that happened before RENDERER_INITED cannot re-register against a destroyed asset.
    const precompile = (effect as unknown as { _precompile: () => void })._precompile;
    cclegacy.game.off(cclegacy.Game.EVENT_RENDERER_INITED, precompile, effect);
    return effect;
}
