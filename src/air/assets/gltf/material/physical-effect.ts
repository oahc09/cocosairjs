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
 * Physical material effect derivation (KHR_materials_* foundation for ior / specular /
 * emissive_strength). Derives the glTF standard effect and wires three identity-safe
 * physical inputs into the shading model:
 *
 *   vec4 airPhysicalParams = (emissiveStrength, iorF0/0.04, specularFactor0, 1);
 *
 *  - emissive: `s.emissive` scaled by .x
 *  - ior:      specularIntensity scales by .y so the engine base F0 0.04 = 0.08*0.5
 *              becomes iorF0 = ((ior-1)/(ior+1))^2 (ior 1.5 is the identity)
 *  - specular: F0 mix scaled by .z, optionally modulated by specularTexture.A and
 *              specularColorTexture.RGB, sampled with per-slot UV transforms.
 *
 * When no physical extension is active the parameters stay (1,1,1,1), the maps are absent,
 * and the result is bit-for-bit the base standard model, so unaffected materials never need
 * this effect variant.
 */
import { EffectAsset } from '../../../../cocos/asset/assets/effect-asset';
import { Type, Uniform } from '../../../../cocos/gfx';
import { Vec4 } from '../../../../cocos/core/math';
import { check } from '../schema';
import { gltfEffect } from './standard-effect';
import { textureTransform, textureUVExpression } from './texture-slots';

export const PHYSICAL_CONSTANT = 'airPhysicalParams';

/** Scalar specular color factor (rgb in .xyz) so white default stays identity. */
export const PHYSICAL_COLOR_CONSTANT = 'airSpecularColorFactor';
/** (factor, roughness, normalScale, 1) for the KHR_materials_clearcoat second GGX layer. */
export const CLEARCOAT_CONSTANT = 'airClearcoat';
/** (strength, cos(rotation), sin(rotation), 1) for the KHR_materials_anisotropy lobe. */
export const ANISO_CONSTANT = 'airAnisotropy';
/** (factor, filmIor, thicknessMax_nm, substrateIor) for KHR_materials_iridescence thin-film. */
export const IRIDESCENCE_CONSTANT = 'airIridescence';
/** (bumpFactor, 0, 0, 1) for EXT_materials_bump derivative perturbation. */
export const BUMP_CONSTANT = 'airBump';
/** (factor, ior, thicknessFactor, dispersion) for KHR_materials_transmission/volume/dispersion. */
export const TRANSMISSION_CONSTANT = 'airTransmission';
/** (r, g, b, attenuationDistance) Beer-Lambert absorption of the transmitted ray. */
export const ATTENUATION_CONSTANT = 'airAttenuation';
/** (width, height, 1/width, 1/height) of the bound scene-color RT; block member so the
 * capture refreshes it via material.setProperty without disturbing UBO offsets. */
export const SCENE_INFO_CONSTANT = 'airSceneColorInfo';

/** Physical samplers appended after the base standard's bindings 0..14. */
export const PHYSICAL_SAMPLERS = [
    { name: 'specularMap', binding: 15, macro: 'USE_AIR_SPECULAR_MAP' },
    { name: 'specularColorMap', binding: 16, macro: 'USE_AIR_SPECULAR_COLOR_MAP' },
    { name: 'clearcoatMap', binding: 17, macro: 'USE_AIR_CLEARCOAT_MAP' },
    { name: 'clearcoatRoughnessMap', binding: 18, macro: 'USE_AIR_CLEARCOAT_ROUGHNESS_MAP' },
    { name: 'clearcoatNormalMap', binding: 19, macro: 'USE_AIR_CLEARCOAT_NORMAL_MAP' },
    { name: 'anisotropyMap', binding: 20, macro: 'USE_AIR_ANISOTROPY_MAP' },
    { name: 'iridescenceMap', binding: 21, macro: 'USE_AIR_IRIDESCENCE_MAP' },
    { name: 'iridescenceIorMap', binding: 22, macro: 'USE_AIR_IRIDESCENCE_IOR_MAP' },
    { name: 'iridescenceThicknessMap', binding: 23, macro: 'USE_AIR_IRIDESCENCE_THICKNESS_MAP' },
    { name: 'bumpMap', binding: 24, macro: 'USE_AIR_BUMP' },
    { name: 'transmissionMap', binding: 25, macro: 'USE_AIR_TRANSMISSION_MAP' },
    { name: 'volumeThicknessMap', binding: 26, macro: 'USE_AIR_VOLUME_THICKNESS_MAP' },
    { name: 'cc_sceneColorTex', binding: 27, macro: 'USE_AIR_TRANSMISSION' },
] as const;

/** Normalized scalars for the physical uniform (identity when all defaults hold). */
export function physicalParams(ior: number, specularFactor0: number, emissiveStrength: number): Vec4 {
    check(ior >= 1 && Number.isFinite(ior), 'KHR_materials_ior.ior must be finite and >= 1');
    check(specularFactor0 >= 0 && specularFactor0 <= 2, 'KHR_materials_specular.specularFactor[0] must be [0,2]');
    check(
        emissiveStrength >= 1 && Number.isFinite(emissiveStrength),
        'KHR_materials_emissive_strength must be finite and >= 1',
    );
    const iorF0 = Math.pow((ior - 1) / (ior + 1), 2);
    // Engine default F0 is 0.04 (0.08 * specularIntensity 0.5), i.e. exactly ior 1.5.
    return new Vec4(emissiveStrength, iorF0 / 0.04, specularFactor0, 1);
}

/** Whether any physical scalar departs from the identity baseline (skip the variant otherwise). */
export function needsPhysicalEffect(ior: number, factor0: number, strength: number): boolean {
    return Math.abs(ior - 1.5) > 1e-6 || Math.abs(factor0 - 1) > 1e-6 || Math.abs(strength - 1) > 1e-6;
}

export function gltfPhysicalEffect(): EffectAsset {
    const name = 'air-gltf-physical';
    const existing = EffectAsset.get(name);
    if (existing) {
        return existing;
    }
    const base = gltfEffect();
    const effect = new EffectAsset();
    effect.name = name;
    effect.shaders = JSON.parse(JSON.stringify(base.shaders));
    effect.techniques = JSON.parse(JSON.stringify(base.techniques));

    for (const shader of effect.shaders) {
        const oldName = shader.name;
        shader.name = `${name}|${oldName.split('|').slice(1).join('|')}`;
        shader.hash = (shader.hash ^ 0x2f6a19d4) >>> 0;
        shader.defines = [
            ...(shader.defines || []),
            { name: 'USE_AIR_SPECULAR_COLOR', type: 'boolean' },
            { name: 'USE_AIR_SPECULAR_MAP', type: 'boolean' },
            { name: 'USE_AIR_SPECULAR_COLOR_MAP', type: 'boolean' },
            { name: 'SPECULAR_UV', type: 'string', options: ['v_uv', 'v_uv1'] },
            { name: 'SPECULARCOLOR_UV', type: 'string', options: ['v_uv', 'v_uv1'] },
            { name: 'USE_AIR_CLEARCOAT', type: 'boolean' },
            { name: 'USE_AIR_CLEARCOAT_MAP', type: 'boolean' },
            { name: 'USE_AIR_CLEARCOAT_ROUGHNESS_MAP', type: 'boolean' },
            { name: 'USE_AIR_CLEARCOAT_NORMAL_MAP', type: 'boolean' },
            { name: 'CLEARCOAT_UV', type: 'string', options: ['v_uv', 'v_uv1'] },
            { name: 'CLEARCOATROUGHNESS_UV', type: 'string', options: ['v_uv', 'v_uv1'] },
            { name: 'CLEARCOATNORMAL_UV', type: 'string', options: ['v_uv', 'v_uv1'] },
            { name: 'USE_AIR_ANISOTROPY', type: 'boolean' },
            { name: 'USE_AIR_ANISOTROPY_MAP', type: 'boolean' },
            { name: 'ANISOTROPY_UV', type: 'string', options: ['v_uv', 'v_uv1'] },
            { name: 'USE_AIR_IRIDESCENCE', type: 'boolean' },
            { name: 'USE_AIR_IRIDESCENCE_MAP', type: 'boolean' },
            { name: 'USE_AIR_IRIDESCENCE_IOR_MAP', type: 'boolean' },
            { name: 'USE_AIR_IRIDESCENCE_THICKNESS_MAP', type: 'boolean' },
            { name: 'IRIDESCENCE_UV', type: 'string', options: ['v_uv', 'v_uv1'] },
            { name: 'IRIDESCENCEIOR_UV', type: 'string', options: ['v_uv', 'v_uv1'] },
            { name: 'IRIDESCENCETHICKNESS_UV', type: 'string', options: ['v_uv', 'v_uv1'] },
            { name: 'USE_AIR_BUMP', type: 'boolean' },
            { name: 'BUMP_UV', type: 'string', options: ['v_uv', 'v_uv1'] },
            { name: 'USE_AIR_SPECULAR', type: 'boolean' },
            { name: 'USE_AIR_TRANSMISSION', type: 'boolean' },
            { name: 'USE_AIR_TRANSMISSION_MAP', type: 'boolean' },
            { name: 'USE_AIR_VOLUME', type: 'boolean' },
            { name: 'USE_AIR_VOLUME_THICKNESS_MAP', type: 'boolean' },
            { name: 'USE_AIR_DISPERSION', type: 'boolean' },
            { name: 'TRANSMISSION_UV', type: 'string', options: ['v_uv', 'v_uv1'] },
            { name: 'VOLUMETHICKNESS_UV', type: 'string', options: ['v_uv', 'v_uv1'] },
        ];

        // One extra material-block member holding the four physical scalars (vec4, std140-safe).
        const blocks = (shader.blocks as Array<{ name: string; members: Uniform[] }>).slice();
        for (const descriptor of shader.descriptors || []) {
            blocks.push(...(descriptor.blocks || []));
        }
        for (const block of blocks) {
            if (block.name !== 'Constants') {
                continue;
            }
            // UV transform uniforms come from the base effect's slot mechanism; only the
            // two scalar constants are added here.
            if (!block.members.some((m) => m.name === PHYSICAL_CONSTANT)) {
                block.members.push(new Uniform(PHYSICAL_CONSTANT, Type.FLOAT4, 1));
            }
            if (!block.members.some((m) => m.name === PHYSICAL_COLOR_CONSTANT)) {
                block.members.push(new Uniform(PHYSICAL_COLOR_CONSTANT, Type.FLOAT4, 1));
            }
            if (!block.members.some((m) => m.name === CLEARCOAT_CONSTANT)) {
                block.members.push(new Uniform(CLEARCOAT_CONSTANT, Type.FLOAT4, 1));
            }
            if (!block.members.some((m) => m.name === ANISO_CONSTANT)) {
                block.members.push(new Uniform(ANISO_CONSTANT, Type.FLOAT4, 1));
            }
            if (!block.members.some((m) => m.name === IRIDESCENCE_CONSTANT)) {
                block.members.push(new Uniform(IRIDESCENCE_CONSTANT, Type.FLOAT4, 1));
            }
            if (!block.members.some((m) => m.name === BUMP_CONSTANT)) {
                block.members.push(new Uniform(BUMP_CONSTANT, Type.FLOAT4, 1));
            }
            for (const member of [TRANSMISSION_CONSTANT, ATTENUATION_CONSTANT, SCENE_INFO_CONSTANT]) {
                if (!block.members.some((m) => m.name === member)) {
                    block.members.push(new Uniform(member, Type.FLOAT4, 1));
                }
            }
        }

        // Register the two physical samplers (binding 15/16, fragment stage).
        const samplers = (shader.samplerTextures || []) as Array<{ name: string }>;
        for (const sampler of PHYSICAL_SAMPLERS) {
            if (!samplers.some((s) => s.name === sampler.name)) {
                (shader.samplerTextures as unknown[]).push({
                    name: sampler.name,
                    type: Type.SAMPLER2D,
                    count: 1,
                    defines: [sampler.macro],
                    stageFlags: 16,
                    binding: sampler.binding,
                });
            }
        }

        for (const language of ['glsl1', 'glsl3', 'glsl4'] as const) {
            const stage = shader[language];
            if (!stage) {
                continue;
            }
            let frag = stage.frag as string;
            const nl = String.fromCharCode(10);
            // 0. uniform declarations. The block grows in place in BOTH stages (drivers link
            // the shared Constants field count); glsl1 flattens UBOs at load, so the members
            // are added to its declared block metadata only (above) and the frag takes
            // top-level uniforms instead. Sampler declarations bind by name at the top.
            const samplerDecls = PHYSICAL_SAMPLERS.map(
                (s) =>
                    `#if ${s.macro}\n${language === 'glsl4' ? `layout(set = 1, binding = ${s.binding}) ` : ''}uniform lowp sampler2D ${s.name};\n#endif`,
            ).join(nl);
            // Texture modulation happens where v_uv is in scope: inside main, below the
            // in-variable declarations. A file-global carries the product into the shading
            // function, which only references it (declaration before the function is legal).
            const texVar =
                `#if USE_AIR_SPECULAR_MAP\nfloat airSpecScale = 1.0;\n#endif\n` +
                `#if USE_AIR_SPECULAR_COLOR_MAP\nvec3 airSpecColor = vec3(1.0);\n#endif\n` +
                `#if USE_AIR_CLEARCOAT\nfloat airCCFactorTex = 1.0;\nfloat airCCRoughTex = 0.0;\nvec3 airCCNormal = vec3(0.0, 0.0, 1.0);\n#endif\n` +
                `#if USE_AIR_ANISOTROPY\nvec3 airAnisoT = vec3(1.0, 0.0, 0.0);\nvec3 airAnisoB = vec3(0.0, 1.0, 0.0);\nfloat airAnisoStrength = 0.0;\n#endif\n` +
                `#if USE_AIR_IRIDESCENCE\nfloat airIriFactorTex = 1.0;\nfloat airIriIorTex = 1.3;\nfloat airIriThickTex = 400.0;\n#endif\n` +
                `#if USE_AIR_TRANSMISSION\nfloat airTrFactorTex = 0.0;\nfloat airThickTex = 0.0;\n#endif\n`;
            // Insert after the leading `precision` statement: float types need a precision
            // qualifier and the raw shader source starts with one.
            const prependAfterPrecision = (source: string): string => {
                const insert = samplerDecls + nl + texVar;
                const m = /^(\s*precision\s+\w+\s+\w+;)/.exec(source);
                return m
                    ? source.slice(0, m[1].length) + nl + insert + source.slice(m[1].length)
                    : insert + nl + source;
            };
            if (language === 'glsl1') {
                frag = prependAfterPrecision(
                    `uniform highp vec4 ${PHYSICAL_CONSTANT};` +
                        nl +
                        `uniform highp vec4 ${PHYSICAL_COLOR_CONSTANT};` +
                        nl +
                        `uniform highp vec4 ${CLEARCOAT_CONSTANT};` +
                        nl +
                        `uniform highp vec4 ${ANISO_CONSTANT};` +
                        nl +
                        `uniform highp vec4 ${IRIDESCENCE_CONSTANT};` +
                        nl +
                        `uniform highp vec4 ${BUMP_CONSTANT};` +
                        nl +
                        `uniform highp vec4 ${TRANSMISSION_CONSTANT};` +
                        nl +
                        `uniform highp vec4 ${ATTENUATION_CONSTANT};` +
                        nl +
                        `uniform highp vec4 ${SCENE_INFO_CONSTANT};` +
                        nl +
                        frag,
                );
            } else {
                const blockAppendRe = /(uniform\s+\w*\s*Constants\s*\{[^}]*)(\})/;
                const grow = (source: string): string =>
                    source.replace(
                        blockAppendRe,
                        (_m, head, tail) =>
                            head +
                            nl +
                            `vec4 ${PHYSICAL_CONSTANT};` +
                            nl +
                            `vec4 ${PHYSICAL_COLOR_CONSTANT};` +
                            nl +
                            `vec4 ${CLEARCOAT_CONSTANT};` +
                            nl +
                            `vec4 ${ANISO_CONSTANT};` +
                            nl +
                            `vec4 ${IRIDESCENCE_CONSTANT};` +
                            nl +
                            `vec4 ${BUMP_CONSTANT};` +
                            nl +
                            `vec4 ${TRANSMISSION_CONSTANT};` +
                            nl +
                            `vec4 ${ATTENUATION_CONSTANT};` +
                            nl +
                            `vec4 ${SCENE_INFO_CONSTANT};` +
                            nl +
                            tail,
                    );
                stage.vert = grow(stage.vert as string);
                frag = prependAfterPrecision(grow(frag));
            }
            // 2. shading injections apply only to shaders carrying the standard body;
            // shadow-caster variants share the grown declarations but no specular math.
            const specularMix =
                /vec3 diffuse = s\.albedo\.rgb \* \(1\.0 - s\.metallic\);\s*vec3 specular = mix\(vec3\(0\.08 \* s\.specularIntensity\), s\.albedo\.rgb, s\.metallic\);/.exec(
                    frag,
                )?.[0];
            if (!specularMix) {
                stage.frag = frag;
                continue;
            }
            //    emissive strength
            frag = frag.replace(
                's.emissive = emissive.rgb * emissiveScaleParam.xyz',
                `s.emissive = emissive.rgb * emissiveScaleParam.xyz * ${PHYSICAL_CONSTANT}.x`,
            );
            frag = frag.replace(
                's.emissive *= emissiveScaleParam.xyz;',
                `s.emissive *= emissiveScaleParam.xyz * ${PHYSICAL_CONSTANT}.x;`,
            );
            // 3. ior -> dielectric F0 base (was the constant 0.5 * 0.08)
            frag = frag.replace(/s\.specularIntensity = 0\.5;/g, `s.specularIntensity = ${PHYSICAL_CONSTANT}.y * 0.5;`);
            frag = frag.replace('s.specularIntensity = pbr.w;', `s.specularIntensity = ${PHYSICAL_CONSTANT}.y * 0.5;`);
            // 4. specular factor: scalars inside the shading function, texture product applied
            // in main (see texVar), with per-slot UV transforms.
            const tex = (sampler: string, uv: string, prefix: string): string =>
                textureTransform(language, sampler, uv, prefix);
            // Thin-film interference (incoherent Airy, per-RGB spectral): modulates the dielectric
            // F0 base when iridescence is active. Substrate IOR derives from the ior scalar
            // (airPhysicalParams.y = iorF0/0.04), film IOR and thickness come from airIridescence.
            const iriFn = [
                '#if USE_AIR_IRIDESCENCE',
                'vec3 airIridescenceF0 (float NV) {',
                'float filmIor = clamp(airIriIorTex, 1.3, 2.33334);',
                `float n0 = (1.0 + sqrt(clamp(${PHYSICAL_CONSTANT}.y * 0.04, 0.0, 1.0))) / (1.0 - sqrt(clamp(${PHYSICAL_CONSTANT}.y * 0.04, 0.0, 1.0)) + 1e-6);`,
                'float cosT1 = clamp(NV, 0.0, 1.0);',
                'float sinT2sq = (1.0 - cosT1 * cosT1) / (filmIor * filmIor);',
                'float cosT2 = sqrt(max(0.0, 1.0 - sinT2sq));',
                `vec3 lambda = vec3(680.0, 550.0, 450.0);`,
                `vec3 phase = 4.0 * PI * filmIor * max(airIriThickTex, 0.0) * cosT2 / lambda;`,
                'vec3 f01 = vec3(((1.0 - filmIor) / (1.0 + filmIor)) * ((1.0 - filmIor) / (1.0 + filmIor)));',
                'vec3 r12 = (filmIor - vec3(n0)) / (filmIor + vec3(n0));',
                'vec3 f12 = r12 * r12;',
                'vec3 cross12 = sqrt(f01 * f12);',
                'vec3 airy = (f01 + f12 + 2.0 * cross12 * cos(phase)) / (vec3(1.0) + f01 * f12 + 2.0 * cross12 * cos(phase));',
                'return clamp(airy, vec3(0.0), vec3(1.0));',
                '}',
                '#endif',
            ].join(nl);
            // KHR_materials_specular is a DIELECTRIC-only adjustment: the factor/color/texture
            // scale the dielectric F0 base (texture.a per spec), metal F0 (albedo) is untouched,
            // and the Fresnel remainder attenuates diffuse so energy is conserved.
            const airSpec = [
                `float airSpecularWeight = clamp(${PHYSICAL_CONSTANT}.z, 0.0, 1.0);`,
                '#if USE_AIR_SPECULAR_MAP',
                'airSpecularWeight *= airSpecScale;',
                '#endif',
                `vec3 airDielectric = vec3(0.08 * s.specularIntensity);`,
                '#if USE_AIR_SPECULAR_COLOR',
                `airDielectric *= ${PHYSICAL_COLOR_CONSTANT}.rgb;`,
                '#endif',
                '#if USE_AIR_SPECULAR_COLOR_MAP',
                'airDielectric *= airSpecColor;',
                '#endif',
                '#if USE_AIR_IRIDESCENCE',
                `{`,
                `float iriF = clamp(airIriFactorTex, 0.0, 1.0);`,
                `if (iriF > 0.0) { airDielectric = mix(airDielectric, airIridescenceF0(max(dot(s.normal, normalize(cc_cameraPos.xyz - s.position)), 0.0)), iriF); }`,
                `}`,
                `#endif`,
                `airDielectric = clamp(airDielectric, vec3(0.0), vec3(1.0));`,
                `airDielectric *= airSpecularWeight;`,
                // diffuse stays metal-gated; dielectric diffuse loses the reflected fraction (energy).
                `vec3 diffuse = s.albedo.rgb * (1.0 - s.metallic);`,
                `vec3 specular = mix(airDielectric, s.albedo.rgb, s.metallic);`,
            ].join('\n');
            frag = frag.replace(specularMix, airSpec);
            // KHR_materials_specular energy conservation: dielectric diffuse is attenuated by
            // the view-angle Fresnel (Schlick from F0); grazing angles keep less diffuse. The
            // code goes after BRDFApprox where NV is already on the stack.
            frag = frag.replace(
                'specular = BRDFApprox(specular, s.roughness, NV);',
                'specular = BRDFApprox(specular, s.roughness, NV);\n' +
                    '#if USE_AIR_SPECULAR\n' +
                    'vec3 airFresnel = airDielectric + (vec3(airSpecularWeight) - airDielectric) * pow(1.0 - NV, 5.0);\n' +
                    'float airFresnelMax = max(airFresnel.r, max(airFresnel.g, airFresnel.b));\n' +
                    'diffuse *= 1.0 - airFresnelMax;\n' +
                    '#endif',
            );
            // Clearcoat second-lobe direct term (layer F0 0.04, Schlick, GGX via engine helper).
            const ccDirect = [
                '{',
                'float ccF = clamp(airCCFactorTex, 0.0, 1.0);',
                'float ccRough = clamp(airCCRoughTex, 0.002, 1.0);',
                'float ccNL = max(dot(airCCNormal, L), 0.0);',
                'float ccNH = max(dot(airCCNormal, H), 0.0);',
                'float ccNV = max(dot(airCCNormal, V), 0.0);',
                'vec3 ccSpec = vec3(0.04) * CalcSpecular(ccRough, ccNH, H, airCCNormal);',
                '#if CC_RECEIVE_SHADOW',
                'finalColor += cc_mainLitColor.rgb * cc_mainLitColor.w * shadow * ccNL * ccF * ccSpec;',
                '#else',
                'finalColor += cc_mainLitColor.rgb * cc_mainLitColor.w * ccNL * ccF * ccSpec;',
                '#endif',
                '}',
            ].join(nl);
            const ccAnchor = frag.includes('finalColor *= dirlightContrib;')
                ? 'finalColor *= dirlightContrib;'
                : 'finalColor += lightingColor * dirlightContrib;';
            if (!frag.includes(ccAnchor)) {
                throw new Error(`physical effect: '${ccAnchor}' missing in ${shader.name} [${language}]`);
            }
            frag = frag.replace(ccAnchor, `#if USE_AIR_CLEARCOAT\n${ccDirect}\n#endif\n${ccAnchor}`);
            // Clearcoat IBL lobe: low-roughness environment reflection off the layer normal.
            const ccIBL = [
                '#if USE_AIR_CLEARCOAT && CC_USE_IBL',
                '{',
                'float ccF = clamp(airCCFactorTex, 0.0, 1.0);',
                'float ccRough = clamp(airCCRoughTex, 0.002, 1.0);',
                'float ccNV = max(dot(airCCNormal, V), 0.0);',
                'vec3 ccR = normalize(reflect(-V, airCCNormal));',
                'vec4 ccEnv4 = fragTextureLod(cc_environment, ccR, ccRough * cc_ambientGround.w);',
                '#if CC_USE_IBL == 2',
                'vec3 ccEnv = unpackRGBE(ccEnv4);',
                '#else',
                'vec3 ccEnv = SRGBToLinear(ccEnv4.rgb);',
                '#endif',
                'float ccFres = 0.04 + 0.96 * pow(1.0 - ccNV, 5.0);',
                'finalColor += ccEnv * cc_ambientSky.w * ccF * ccFres;',
                '}',
                '#endif',
            ].join(nl);
            // Anisotropic specular: replace the isotropic visibility term with the
            // Kulla-Conty anisotropic GGX when strength > 0 (tangents are world-space,
            // rotated by airAnisoT/airAnisoB built in main).
            const anisoFn = [
                '#if USE_AIR_ANISOTROPY',
                'float airAnisoVisibility (float roughness, vec3 N, vec3 H, vec3 V, vec3 L) {',
                'float anS = clamp(airAnisoStrength, 0.0, 1.0);',
                'float alpha = max(roughness * roughness, 0.002);',
                'float at = max(alpha * (1.0 + anS), 0.002);',
                'float ab = max(alpha / (1.0 + anS), 0.002);',
                'vec3 aT = normalize(airAnisoT); vec3 aB = normalize(airAnisoB);',
                'float tNH = dot(aT, H); float bNH = dot(aB, H); float nNH = max(dot(N, H), 0.0);',
                'float tNV = dot(aT, V); float bNV = dot(aB, V); float nNV = max(dot(N, V), 1e-4);',
                'float tNL = dot(aT, L); float bNL = dot(aB, L); float nNL = max(dot(N, L), 0.0);',
                'float d2 = (bNH * bNH) / (at * at) + (tNH * tNH) / (ab * ab) + nNH * nNH;',
                'float D = 1.0 / (PI * at * ab * d2 * d2);',
                'float v2 = nNV * nNV * ((tNV * tNV) / (at * at) + (bNV * bNV) / (ab * ab) + 1.0);',
                'float vl = nNL * nNL * ((tNL * tNL) / (at * at) + (bNL * bNL) / (ab * ab) + 1.0);',
                'float G = 0.5 / (nNV * sqrt(vl) + nNL * sqrt(v2) + 1e-6);',
                'return D * G * PI * 0.25;',
                '}',
                '#endif',
            ].join(nl);
            const specLine = 'vec3 specularContrib = specular * CalcSpecular(s.roughness, NH, H, N);';
            if (!frag.includes(specLine)) {
                throw new Error(`physical effect: specularContrib missing in ${shader.name} [${language}]`);
            }
            frag = frag.replace(
                specLine,
                '#if USE_AIR_ANISOTROPY\n' +
                    `vec3 specularContrib = specular * mix(CalcSpecular(s.roughness, NH, H, N), airAnisoVisibility(s.roughness, N, H, V, L), clamp(airAnisoStrength, 0.0, 1.0));\n` +
                    '#else\n' +
                    specLine +
                    '\n#endif',
            );
            // Define the helper above the shading function that uses it.
            const shadingDecl = 'vec4 CCStandardShadingBase (StandardSurface s, vec4 shadowPos) {';
            if (!frag.includes(shadingDecl)) {
                throw new Error(`physical effect: shading fn missing in ${shader.name} [${language}]`);
            }
            frag = frag.replace(shadingDecl, `${anisoFn}\n${iriFn}\n${shadingDecl}`);
            const emissiveAnchor = 'finalColor += s.emissive;';
            if (!frag.includes(emissiveAnchor)) {
                throw new Error(`physical effect: '${emissiveAnchor}' missing in ${shader.name} [${language}]`);
            }
            frag = frag.replace(
                emissiveAnchor,
                `${ccIBL}\n#if USE_AIR_CLEARCOAT\nfinalColor += s.emissive * (1.0 - clamp(airCCFactorTex, 0.0, 1.0) * (0.04 + 0.96 * pow(1.0 - max(dot(airCCNormal, V), 0.0), 5.0)));\n#else\n${emissiveAnchor}\n#endif`,
            );
            // Refractive transmission samples the offscreen scene color with a view-offset UV,
            // Beer-Lambert absorption for volume and RGB index-split for dispersion.
            const transmission = [
                '#if USE_AIR_TRANSMISSION',
                '{',
                'float trF = clamp(airTrFactorTex, 0.0, 1.0);',
                'if (trF > 0.0) {',
                `float trIor = max(${TRANSMISSION_CONSTANT}.y, 1.0);`,
                'vec3 trN = normalize(N);',
                'vec3 trV = normalize(V);',
                'float trThick = max(airThickTex, 1e-4);',
                'vec3 trView = (cc_matView * vec4(s.position, 1.0)).xyz;',
                'vec3 trBaseView = (mat3(cc_matView) * refract(-trV, trN, 1.0 / trIor));',
                'vec2 trOffset = trBaseView.xy / max(abs(trView.z), 1.0) * trThick * 0.5;',
                // Screen UV of the surface (project world position); cc_cameraPos.w>0 => GL bottom-left origin so RT needs a Y flip.
                'vec4 trClip0 = cc_matViewProj * vec4(s.position, 1.0);',
                'vec2 trScreen = trClip0.xy / max(abs(trClip0.w), 1e-4) * 0.5 + 0.5;',
                'float trFlip = cc_cameraPos.w > 0.0 ? -1.0 : 1.0;',
                'vec2 trUv = clamp(trScreen + trOffset * trFlip, ' +
                    SCENE_INFO_CONSTANT +
                    '.zw, vec2(1.0) - ' +
                    SCENE_INFO_CONSTANT +
                    '.zw);',
                // Absorption over the path length, then refracted background sample (single tap).
                // Beer-Lambert per spec: transmittance = attenuationColor ^ (d / attenuationDistance)
                // (equivalently exp(-(-ln color) * d / dist); exact for dark media unlike the 1-color approximation).
                'vec3 trAtten = pow(clamp(' +
                    ATTENUATION_CONSTANT +
                    '.rgb, vec3(0.0), vec3(1.0)), vec3(trThick / max(' +
                    ATTENUATION_CONSTANT +
                    '.w, 1e-4)));',
                'vec3 trColor = texture(cc_sceneColorTex, trUv).rgb * trAtten;',
                '#if USE_AIR_DISPERSION',
                `float trDisp = max(${TRANSMISSION_CONSTANT}.w, 0.0);`,
                'if (trDisp > 0.0) {',
                // Spec: stored dispersion = 20/Abbe; halfSpread = (ior - 1) * 0.025 * dispersion,
                // giving iors = vec3(ior - halfSpread, ior, ior + halfSpread) (red lowest, blue highest).
                'float trHalf = (trIor - 1.0) * 0.025 * trDisp;',
                'float trIorR = max(trIor - trHalf, 1.0001);',
                'float trIorB = trIor + trHalf;',
                'vec2 trRV = (mat3(cc_matView) * refract(-trV, trN, 1.0 / trIorR)).xy / max(abs(trView.z), 1.0) * trThick * 0.5;',
                'vec2 trBV = (mat3(cc_matView) * refract(-trV, trN, 1.0 / trIorB)).xy / max(abs(trView.z), 1.0) * trThick * 0.5;',
                'vec2 uvR = clamp(trScreen + trRV * trFlip, ' +
                    SCENE_INFO_CONSTANT +
                    '.zw, vec2(1.0) - ' +
                    SCENE_INFO_CONSTANT +
                    '.zw);',
                'vec2 uvB = clamp(trScreen + trBV * trFlip, ' +
                    SCENE_INFO_CONSTANT +
                    '.zw, vec2(1.0) - ' +
                    SCENE_INFO_CONSTANT +
                    '.zw);',
                'trColor.r = texture(cc_sceneColorTex, uvR).r * trAtten.r;',
                'trColor.b = texture(cc_sceneColorTex, uvB).b * trAtten.b;',
                '}',
                '#endif',
                // Transmission is a dielectric phenomenon: blend over the base by (1-metallic).
                'finalColor = mix(finalColor, trColor, trF * (1.0 - s.metallic));',
                '}',
                '}',
                '#endif',
                'return vec4(finalColor, s.albedo.a);',
            ].join(nl);
            const returnAnchor = 'return vec4(finalColor, s.albedo.a);';
            if (!frag.includes(returnAnchor)) {
                throw new Error(`physical effect: return missing in ${shader.name} [${language}]`);
            }
            frag = frag.replace(returnAnchor, transmission);
            const modulate = [
                '#if USE_AIR_TRANSMISSION',
                `airTrFactorTex = ${TRANSMISSION_CONSTANT}.x;`,
                `airThickTex = ${TRANSMISSION_CONSTANT}.z;`,
                '#if USE_AIR_TRANSMISSION_MAP',
                `airTrFactorTex *= ${tex('transmissionMap', 'TRANSMISSION_UV', 'airTransmission')}.r;`,
                '#endif',
                '#if USE_AIR_VOLUME_THICKNESS_MAP',
                `airThickTex *= ${tex('volumeThicknessMap', 'VOLUMETHICKNESS_UV', 'airVolumeThickness')}.g;`,
                '#endif',
                '#endif',
                '#if USE_AIR_SPECULAR_MAP',
                `airSpecScale = ${tex('specularMap', 'SPECULAR_UV', 'airSpecular')}.a;`, // spec: strength is the ALPHA channel, no 2x
                '#endif',
                '#if USE_AIR_SPECULAR_COLOR_MAP',
                `airSpecColor = SRGBToLinear(${tex('specularColorMap', 'SPECULARCOLOR_UV', 'airSpecularColor')}.rgb);`,
                '#endif',
                '#if USE_AIR_CLEARCOAT',
                `airCCFactorTex = ${CLEARCOAT_CONSTANT}.x;`,
                `airCCRoughTex = ${CLEARCOAT_CONSTANT}.y;`,
                '#endif',
                '#if USE_AIR_CLEARCOAT && USE_AIR_CLEARCOAT_MAP',
                `airCCFactorTex *= ${tex('clearcoatMap', 'CLEARCOAT_UV', 'airClearcoat')}.r;`,
                '#endif',
                '#if USE_AIR_CLEARCOAT && USE_AIR_CLEARCOAT_ROUGHNESS_MAP',
                `airCCRoughTex *= ${tex('clearcoatRoughnessMap', 'CLEARCOATROUGHNESS_UV', 'airClearcoatRoughness')}.g;`,
                '#endif',
                '#if USE_AIR_CLEARCOAT && USE_AIR_CLEARCOAT_NORMAL_MAP',
                '{',
                `vec3 ccT = ${tex('clearcoatNormalMap', 'CLEARCOATNORMAL_UV', 'airClearcoatNormal')}.xyz * 2.0 - 1.0;`,
                `ccT.xy *= ${CLEARCOAT_CONSTANT}.z;`,
                '#if USE_NORMAL_MAP',
                'vec3 ccN0 = normalize(v_normal);',
                'vec3 ccB0 = normalize(cross(v_tangent.xyz, ccN0)) * v_tangent.w;',
                'airCCNormal = normalize(ccT.x * normalize(v_tangent.xyz) + ccT.y * ccB0 + ccT.z * ccN0);',
                '#else',
                'vec3 ccN0 = normalize(v_normal);',
                'vec3 ccUp = abs(ccN0.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);',
                'vec3 ccTg = normalize(cross(ccUp, ccN0));',
                'airCCNormal = normalize(ccT.x * ccTg + ccT.y * cross(ccN0, ccTg) + ccT.z * ccN0);',
                '#endif',
                '}',
                '#endif',
                '#if USE_AIR_ANISOTROPY',
                '{',
                `airAnisoStrength = ${ANISO_CONSTANT}.x;`,
                'vec3 aN0 = normalize(v_normal);',
                '#if USE_NORMAL_MAP',
                'vec3 aT = normalize(v_tangent.xyz);',
                'vec3 aB = normalize(cross(aT, aN0)) * v_tangent.w;',
                '#else',
                'vec3 aUp = abs(aN0.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);',
                'vec3 aT = normalize(cross(aUp, aN0));',
                'vec3 aB = cross(aN0, aT);',
                '#endif',
                `#if USE_AIR_ANISOTROPY_MAP`,
                // Spec: R,G in [-1,1] tangent/bitangent encode the anisotropic direction;
                // B is unremapped [0,1] strength multiplied into anisotropyStrength.
                `vec3 aTex = ${tex('anisotropyMap', 'ANISOTROPY_UV', 'airAnisotropy')}.xyz;`,
                'vec2 aDir = vec2(aTex.x, aTex.y) * 2.0 - 1.0;',
                'vec3 aNewT = aDir.x * aT + aDir.y * aB;',
                'if (dot(aNewT, aNewT) > 1e-8) { aT = normalize(aNewT); aB = cross(aN0, aT); }',
                'airAnisoStrength *= aTex.z;',
                '#endif',
                `float aRotC = ${ANISO_CONSTANT}.y; float aRotS = ${ANISO_CONSTANT}.z;`,
                'airAnisoT = aT * aRotC + aB * aRotS;',
                'airAnisoB = aB * aRotC - aT * aRotS;',
                '}',
                '#endif',
                '#if USE_AIR_IRIDESCENCE',
                `airIriFactorTex = ${IRIDESCENCE_CONSTANT}.x;`,
                `airIriIorTex = ${IRIDESCENCE_CONSTANT}.y;`,
                // No texture: thickness factor 1 -> maximum (the spec default without volume).
                `airIriThickTex = ${IRIDESCENCE_CONSTANT}.w;`,
                '#endif',
                '#if USE_AIR_IRIDESCENCE && USE_AIR_IRIDESCENCE_MAP',
                `airIriFactorTex *= ${tex('iridescenceMap', 'IRIDESCENCE_UV', 'airIridescence')}.r;`,
                '#endif',
                '#if USE_AIR_IRIDESCENCE && USE_AIR_IRIDESCENCE_IOR_MAP',
                `airIriIorTex = mix(${IRIDESCENCE_CONSTANT}.y, 2.33334, ${tex('iridescenceIorMap', 'IRIDESCENCEIOR_UV', 'airIridescenceIor')}.g);`,
                '#endif',
                '#if USE_AIR_IRIDESCENCE && USE_AIR_IRIDESCENCE_THICKNESS_MAP',
                // Without KHR_materials_volume the effective thickness is the maximum (spec fallback);
                // the texture lerps [min,max] over that range.
                `airIriThickTex = mix(${IRIDESCENCE_CONSTANT}.z, ${IRIDESCENCE_CONSTANT}.w, ${tex('iridescenceThicknessMap', 'IRIDESCENCETHICKNESS_UV', 'airIridescenceThickness')}.g);`,
                '#endif',
                '#if USE_AIR_BUMP',
                '{',
                // Height->normal via screen-space derivatives: solve the world position gradient
                // with the UV Jacobian, then push the surface normal against it (bumpFactor scales h).
                `float bh = ${tex('bumpMap', 'BUMP_UV', 'airBump')}.r * ${BUMP_CONSTANT}.x;`,
                `vec2 buv = ${textureUVExpression('BUMP_UV', 'airBump')};`,
                'vec2 dbh = vec2(dFdx(bh), dFdy(bh));',
                'vec2 duvdx = vec2(dFdx(buv.x), dFdy(buv.x));',
                'vec2 duvdy = vec2(dFdx(buv.y), dFdy(buv.y));',
                'vec3 dPdx = dFdx(s.position);',
                'vec3 dPdy = dFdy(s.position);',
                'float bdet = duvdx.x * duvdy.y - duvdx.y * duvdy.x;',
                'if (abs(bdet) > 1e-8) {',
                'float ga = ( dbh.x * duvdy.y - dbh.y * duvdy.x) / bdet;',
                'float gb = (-dbh.x * duvdx.y + dbh.y * duvdx.x) / bdet;',
                's.normal = normalize(s.normal - (ga * dPdx + gb * dPdy));',
                '}',
                '}',
                '#endif',
            ].join(nl);
            const mainAnchor = 'StandardSurface s; surf(s);';
            if (!frag.includes(mainAnchor)) {
                throw new Error(`physical effect: '${mainAnchor}' missing in ${shader.name} [${language}]`);
            }
            // Forward-add, forward-base and deferred paths each have their own main.
            // Replacing only the first anchor leaves the default forward-base path
            // with file-global defaults, despite live uniforms and successful draws.
            frag = frag.split(mainAnchor).join(`${mainAnchor}\n${modulate}`);
            stage.frag = frag;
        }

        for (const technique of effect.techniques) {
            for (const pass of technique.passes) {
                if (pass.program === oldName) {
                    pass.program = shader.name;
                }
            }
        }
    }

    // Default the physical property and samplers on every pass so unused slots bind safely.
    for (const technique of effect.techniques) {
        for (const pass of technique.passes) {
            if (!pass.properties) {
                continue;
            }
            pass.properties[PHYSICAL_CONSTANT] = { type: Type.FLOAT4, value: [1, 1, 1, 1] };
            pass.properties[PHYSICAL_COLOR_CONSTANT] = { type: Type.FLOAT4, value: [1, 1, 1, 1] };
            pass.properties[CLEARCOAT_CONSTANT] = { type: Type.FLOAT4, value: [1, 0, 1, 1] };
            pass.properties[ANISO_CONSTANT] = { type: Type.FLOAT4, value: [0, 1, 0, 1] };
            pass.properties[IRIDESCENCE_CONSTANT] = { type: Type.FLOAT4, value: [0, 1.3, 100, 400] };
            pass.properties[BUMP_CONSTANT] = { type: Type.FLOAT4, value: [1, 0, 0, 1] };
            pass.properties.specularMap = { value: 'white', type: Type.SAMPLER2D };
            pass.properties.specularColorMap = { value: 'white', type: Type.SAMPLER2D };
            pass.properties.clearcoatMap = { value: 'white', type: Type.SAMPLER2D };
            pass.properties.clearcoatRoughnessMap = { value: 'white', type: Type.SAMPLER2D };
            pass.properties.clearcoatNormalMap = { value: 'white', type: Type.SAMPLER2D };
            pass.properties.anisotropyMap = { value: 'white', type: Type.SAMPLER2D };
            pass.properties.iridescenceMap = { value: 'white', type: Type.SAMPLER2D };
            pass.properties.iridescenceIorMap = { value: 'white', type: Type.SAMPLER2D };
            pass.properties.iridescenceThicknessMap = { value: 'white', type: Type.SAMPLER2D };
            pass.properties.bumpMap = { value: 'white', type: Type.SAMPLER2D };
        }
    }
    effect.onLoaded();
    return effect;
}
