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
 *  - specular: F0 mix scaled by .z, optionally modulated by specularTexture.G (x2) and
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
import { gltfEffect } from '../material';
import { textureTransform } from './texture-slots';

export const PHYSICAL_CONSTANT = 'airPhysicalParams';

/** Scalar specular color factor (rgb in .xyz) so white default stays identity. */
export const PHYSICAL_COLOR_CONSTANT = 'airSpecularColorFactor';
/** (factor, roughness, normalScale, 1) for the KHR_materials_clearcoat second GGX layer. */
export const CLEARCOAT_CONSTANT = 'airClearcoat';

/** Physical samplers appended after the base standard's bindings 0..14. */
export const PHYSICAL_SAMPLERS = [
    { name: 'specularMap', binding: 15, macro: 'USE_AIR_SPECULAR_MAP' },
    { name: 'specularColorMap', binding: 16, macro: 'USE_AIR_SPECULAR_COLOR_MAP' },
    { name: 'clearcoatMap', binding: 17, macro: 'USE_AIR_CLEARCOAT_MAP' },
    { name: 'clearcoatRoughnessMap', binding: 18, macro: 'USE_AIR_CLEARCOAT_ROUGHNESS_MAP' },
    { name: 'clearcoatNormalMap', binding: 19, macro: 'USE_AIR_CLEARCOAT_NORMAL_MAP' },
] as const;

/** Normalized scalars for the physical uniform (identity when all defaults hold). */
export function physicalParams (ior: number, specularFactor0: number, emissiveStrength: number): Vec4 {
    check(ior >= 1 && Number.isFinite(ior), 'KHR_materials_ior.ior must be finite and >= 1');
    check(specularFactor0 >= 0 && specularFactor0 <= 2, 'KHR_materials_specular.specularFactor[0] must be [0,2]');
    check(emissiveStrength >= 1 && Number.isFinite(emissiveStrength), 'KHR_materials_emissive_strength must be finite and >= 1');
    const iorF0 = Math.pow((ior - 1) / (ior + 1), 2);
    // Engine default F0 is 0.04 (0.08 * specularIntensity 0.5), i.e. exactly ior 1.5.
    return new Vec4(emissiveStrength, iorF0 / 0.04, specularFactor0, 1);
}

/** Whether any physical scalar departs from the identity baseline (skip the variant otherwise). */
export function needsPhysicalEffect (ior: number, factor0: number, strength: number): boolean {
    return Math.abs(ior - 1.5) > 1e-6 || Math.abs(factor0 - 1) > 1e-6 || Math.abs(strength - 1) > 1e-6;
}

export function gltfPhysicalEffect (): EffectAsset {
    const name = 'air-gltf-physical';
    const existing = EffectAsset.get(name);
    if (existing) { return existing; }
    const base = gltfEffect();
    const effect = new EffectAsset();
    effect.name = name;
    effect.shaders = JSON.parse(JSON.stringify(base.shaders));
    effect.techniques = JSON.parse(JSON.stringify(base.techniques));

    for (const shader of effect.shaders) {
        const oldName = shader.name;
        shader.name = `${name}|${oldName.split('|').slice(1).join('|')}`;
        shader.hash = (shader.hash ^ 0x2f6a19d4) >>> 0;
        shader.defines = [...(shader.defines || []),
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
            { name: 'CLEARCOATNORMAL_UV', type: 'string', options: ['v_uv', 'v_uv1'] }];

        // One extra material-block member holding the four physical scalars (vec4, std140-safe).
        const blocks = (shader.blocks as Array<{ name: string; members: Uniform[] }>).slice();
        for (const descriptor of shader.descriptors || []) { blocks.push(...(descriptor.blocks || [])); }
        for (const block of blocks) {
            if (block.name !== 'Constants') { continue; }
            // UV transform uniforms come from the base effect's slot mechanism; only the
            // two scalar constants are added here.
            if (!block.members.some((m) => m.name === PHYSICAL_CONSTANT)) { block.members.push(new Uniform(PHYSICAL_CONSTANT, Type.FLOAT4, 1)); }
            if (!block.members.some((m) => m.name === PHYSICAL_COLOR_CONSTANT)) { block.members.push(new Uniform(PHYSICAL_COLOR_CONSTANT, Type.FLOAT4, 1)); }
            if (!block.members.some((m) => m.name === CLEARCOAT_CONSTANT)) { block.members.push(new Uniform(CLEARCOAT_CONSTANT, Type.FLOAT4, 1)); }
        }

        // Register the two physical samplers (binding 15/16, fragment stage).
        const samplers = (shader.samplerTextures || []) as Array<{ name: string }>;
        for (const sampler of PHYSICAL_SAMPLERS) {
            if (!samplers.some((s) => s.name === sampler.name)) {
                (shader.samplerTextures as unknown[]).push({ name: sampler.name, type: Type.SAMPLER2D, count: 1,
                    defines: [sampler.macro], stageFlags: 16, binding: sampler.binding });
            }
        }

        for (const language of ['glsl1', 'glsl3', 'glsl4'] as const) {
            const stage = shader[language];
            if (!stage) { continue; }
            let frag = stage.frag as string;
            const nl = String.fromCharCode(10);
            // 0. uniform declarations. The block grows in place in BOTH stages (drivers link
            // the shared Constants field count); glsl1 flattens UBOs at load, so the members
            // are added to its declared block metadata only (above) and the frag takes
            // top-level uniforms instead. Sampler declarations bind by name at the top.
            const samplerDecls = PHYSICAL_SAMPLERS.map((s) => `#if ${s.macro}\nuniform lowp sampler2D ${s.name};\n#endif`).join(nl);
            // Texture modulation happens where v_uv is in scope: inside main, below the
            // in-variable declarations. A file-global carries the product into the shading
            // function, which only references it (declaration before the function is legal).
            const texVar = `#if USE_AIR_SPECULAR_MAP || USE_AIR_SPECULAR_COLOR_MAP\nvec3 airSpecTex = vec3(1.0);\n#endif\n`
                + `#if USE_AIR_CLEARCOAT\nfloat airCCFactorTex = 1.0;\nfloat airCCRoughTex = 0.0;\nvec3 airCCNormal = vec3(0.0, 0.0, 1.0);\n#endif\n`;
            // Insert after the leading `precision` statement: float types need a precision
            // qualifier and the raw shader source starts with one.
            const prependAfterPrecision = (source: string): string => {
                const insert = samplerDecls + nl + texVar;
                const m = /^(\s*precision\s+\w+\s+\w+;)/.exec(source);
                return m ? source.slice(0, m[1].length) + nl + insert + source.slice(m[1].length)
                    : insert + nl + source;
            };
            if (language === 'glsl1') {
                frag = prependAfterPrecision(`uniform highp vec4 ${PHYSICAL_CONSTANT};` + nl
                    + `uniform highp vec4 ${PHYSICAL_COLOR_CONSTANT};` + nl + `uniform highp vec4 ${CLEARCOAT_CONSTANT};` + nl + frag);
            } else {
                const blockAppendRe = /(uniform\s+\w*\s*Constants\s*\{[^}]*)(\})/;
                const grow = (source: string): string => source.replace(blockAppendRe,
                    (_m, head, tail) => head + nl + `vec4 ${PHYSICAL_CONSTANT};` + nl
                        + `vec4 ${PHYSICAL_COLOR_CONSTANT};` + nl + `vec4 ${CLEARCOAT_CONSTANT};` + nl + tail);
                stage.vert = grow(stage.vert as string);
                frag = prependAfterPrecision(grow(frag));
            }
            // 2. shading injections apply only to shaders carrying the standard body;
            // shadow-caster variants share the grown declarations but no specular math.
            const specularMix = 'vec3 specular = mix(vec3(0.08 * s.specularIntensity), s.albedo.rgb, s.metallic);';
            if (!frag.includes(specularMix)) { stage.frag = frag; continue; }
            //    emissive strength
            frag = frag.replace('s.emissive = emissive.rgb * emissiveScaleParam.xyz',
                `s.emissive = emissive.rgb * emissiveScaleParam.xyz * ${PHYSICAL_CONSTANT}.x`);
            // 3. ior -> dielectric F0 base (was the constant 0.5 * 0.08)
            frag = frag.replace(/s\.specularIntensity = 0\.5;/g, `s.specularIntensity = ${PHYSICAL_CONSTANT}.y * 0.5;`);
            // 4. specular factor: scalars inside the shading function, texture product applied
            // in main (see texVar), with per-slot UV transforms.
            const tex = (sampler: string, uv: string, prefix: string): string => textureTransform(language, sampler, uv, prefix);
            const airSpec = [
                `vec3 airSpec = mix(vec3(0.08 * s.specularIntensity * ${PHYSICAL_CONSTANT}.z), s.albedo.rgb, s.metallic);`,
                `#if USE_AIR_SPECULAR_COLOR\nairSpec *= ${PHYSICAL_COLOR_CONSTANT}.rgb;\n#endif`,
                `#if USE_AIR_SPECULAR_MAP || USE_AIR_SPECULAR_COLOR_MAP\nairSpec *= airSpecTex;\n#endif`,
                'vec3 specular = airSpec;',
            ].join('\n');
            frag = frag.replace(specularMix, airSpec);
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
            const ccAnchor = 'finalColor *= dirlightContrib;';
            if (!frag.includes(ccAnchor)) { throw new Error(`physical effect: '${ccAnchor}' missing in ${shader.name} [${language}]`); }
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
            const emissiveAnchor = 'finalColor += s.emissive;';
            if (!frag.includes(emissiveAnchor)) { throw new Error(`physical effect: '${emissiveAnchor}' missing in ${shader.name} [${language}]`); }
            frag = frag.replace(emissiveAnchor,
                `${ccIBL}\n#if USE_AIR_CLEARCOAT\nfinalColor += s.emissive * (1.0 - clamp(airCCFactorTex, 0.0, 1.0) * (0.04 + 0.96 * pow(1.0 - max(dot(airCCNormal, V), 0.0), 5.0)));\n#else\n${emissiveAnchor}\n#endif`);
            const modulate = [
                '#if USE_AIR_SPECULAR_MAP',
                `airSpecTex *= 2.0 * ${tex('specularMap', 'SPECULAR_UV', 'airSpecular')}.g;`,
                '#endif',
                '#if USE_AIR_SPECULAR_COLOR_MAP',
                `airSpecTex *= ${tex('specularColorMap', 'SPECULARCOLOR_UV', 'airSpecularColor')}.rgb;`,
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
            ].join(nl);
            const mainAnchor = 'StandardSurface s; surf(s);';
            if (!frag.includes(mainAnchor)) { throw new Error(`physical effect: '${mainAnchor}' missing in ${shader.name} [${language}]`); }
            frag = frag.replace(mainAnchor, `${mainAnchor}\n${modulate}`);
            stage.frag = frag;
        }

        for (const technique of effect.techniques) {
            for (const pass of technique.passes) { if (pass.program === oldName) { pass.program = shader.name; } }
        }
    }

    // Default the physical property and samplers on every pass so unused slots bind safely.
    for (const technique of effect.techniques) {
        for (const pass of technique.passes) {
            if (!pass.properties) { continue; }
            pass.properties[PHYSICAL_CONSTANT] = { type: Type.FLOAT4, value: [1, 1, 1, 1] };
            pass.properties[PHYSICAL_COLOR_CONSTANT] = { type: Type.FLOAT4, value: [1, 1, 1, 1] };
            pass.properties[CLEARCOAT_CONSTANT] = { type: Type.FLOAT4, value: [1, 0, 1, 1] };
            pass.properties.specularMap = { value: 'white', type: Type.SAMPLER2D };
            pass.properties.specularColorMap = { value: 'white', type: Type.SAMPLER2D };
            pass.properties.clearcoatMap = { value: 'white', type: Type.SAMPLER2D };
            pass.properties.clearcoatRoughnessMap = { value: 'white', type: Type.SAMPLER2D };
            pass.properties.clearcoatNormalMap = { value: 'white', type: Type.SAMPLER2D };

        }
    }
    effect.onLoaded();
    return effect;
}
