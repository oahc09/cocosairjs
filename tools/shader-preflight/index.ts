/** Standalone authoring diagnostics. No engine registration, DOM or GPU imports. */
import { normalizeEffectShaders, effectShaderSignature } from '../../src/air/rendering/effect-json-contract';
import { reflectGLSLFragmentOutputNames } from '../../src/air/rendering/shader-output-interface';
import { prepareEffectForRegistration } from '../debug/effect-layout';

export interface AirShaderPreflightDiagnostic {
    severity: 'error' | 'unknown';
    code: string;
    effect: string;
    shader: string;
    path: string;
    stage?: 'vert' | 'frag';
    target?: 'glsl3' | 'glsl4';
    line?: number;
    column?: number;
    message: string;
}
/** Tool identity only: use the selected input object as Material.effectAsset at runtime. */
export interface AirEffectReference {
    effectIndex?: number;
    effectName?: string;
    technique?: number;
}
export interface AirShaderPreflightReport {
    schema: 'air-shader-preflight/1';
    analysisScope: 'compiled-json-identity-and-bounded-layout';
    status: 'passed' | 'failed' | 'unknown';
    gpuValidated: false;
    diagnostics: AirShaderPreflightDiagnostic[];
    effects: { name: string; normalized: Record<string, unknown> | null; shaders: { name: string; hash: number }[] }[];
    references: { referenceIndex: number; effectIndex: number; technique: number }[];
}
type Json = Record<string, any>;
function jsonInput(input: unknown): void {
    const active = new Set<object>();
    let nodes = 0,
        characters = 0;
    function visit(value: unknown, depth: number): void {
        if (++nodes > 200000 || depth > 64) throw Error('Compiled effect input exceeds node/depth budget');
        if (typeof value === 'string') characters += value.length;
        if (characters > 8000000) throw Error('Compiled effect input exceeds text budget');
        if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
        if (typeof value === 'number' && Number.isFinite(value)) return;
        if (typeof value !== 'object') throw Error('Expected finite plain JSON values');
        if (active.has(value)) throw Error('Cyclic effect input');
        if (!Array.isArray(value) && ![null, Object.prototype].includes(Object.getPrototypeOf(value)))
            throw Error('Expected compiled plain JSON, not a live engine object');
        if (Object.getOwnPropertySymbols(value).length) throw Error('Symbol properties are not compiled JSON');
        if (Array.isArray(value)) {
            if (value.length > 200000) throw Error('Array exceeds input budget');
            for (let i = 0; i < value.length; ++i)
                if (!Object.prototype.hasOwnProperty.call(value, i)) throw Error('Sparse arrays are not compiled JSON');
        }
        active.add(value);
        for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
            if (Array.isArray(value) && name === 'length') continue;
            if (descriptor.get || descriptor.set) throw Error('Accessors are not compiled JSON');
            characters += name.length;
            visit(descriptor.value, depth + 1);
        }
        active.delete(value);
    }
    visit(input, 0);
}
function clean(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, (text) => text.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, (text) => ' '.repeat(text.length));
}

export function preflightEffects(
    effects: readonly unknown[],
    references: readonly AirEffectReference[] = [],
): AirShaderPreflightReport {
    const result: AirShaderPreflightReport = {
        schema: 'air-shader-preflight/1',
        analysisScope: 'compiled-json-identity-and-bounded-layout',
        status: 'passed',
        gpuValidated: false,
        diagnostics: [],
        effects: [],
        references: [],
    };
    const add = (
        severity: 'error' | 'unknown',
        code: string,
        message: string,
        context: Partial<AirShaderPreflightDiagnostic> = {},
    ): void => {
        result.diagnostics.push({ severity, code, effect: '', shader: '', path: '$', message, ...context });
    };
    const finish = (): AirShaderPreflightReport => {
        result.status = result.diagnostics.some((issue) => issue.severity === 'error')
            ? 'failed'
            : result.diagnostics.length
              ? 'unknown'
              : 'passed';
        return result;
    };
    try {
        jsonInput({ effects, references });
    } catch (error) {
        add('error', 'AIR_E_PREFLIGHT_JSON', String(error));
        return finish();
    }
    if (!Array.isArray(effects) || !effects.length || !Array.isArray(references)) {
        add('error', 'AIR_E_PREFLIGHT_SHAPE', 'Provide a nonempty effects array and a references array');
        return finish();
    }
    const hashes = new Map<number, string>(),
        programs = new Map<string, string>();
    effects.forEach((input, effectIndex) => {
        const path = `effects[${effectIndex}]`;
        const effect = input as Json;
        const name = typeof effect?.name === 'string' ? effect.name : '';
        const context = { effect: name, path };
        const entry = {
            name,
            normalized: null as Record<string, unknown> | null,
            shaders: [] as { name: string; hash: number }[],
        };
        result.effects.push(entry);
        if (
            !effect ||
            typeof effect !== 'object' ||
            Array.isArray(effect) ||
            !name ||
            !Array.isArray(effect.techniques) ||
            !effect.techniques.length
        ) {
            add('error', 'AIR_E_PREFLIGHT_SHAPE', 'Compiled effect requires name, shaders and techniques', context);
            return;
        }
        let shaders: Json[];
        try {
            shaders = normalizeEffectShaders(effect.shaders, name);
        } catch (error) {
            const issue = error as Error & { code?: string; shader?: string; path?: string };
            add('error', issue.code || 'AIR_E_PREFLIGHT_SHAPE', issue.message, {
                ...context,
                shader: issue.shader || '',
                path: `${path}.${issue.path || 'shaders'}`,
            });
            return;
        }
        if (!shaders.length) add('error', 'AIR_E_PREFLIGHT_SHAPE', 'At least one shader is required', context);
        entry.normalized = { ...JSON.parse(JSON.stringify(effect)), shaders };
        const local = new Set<string>();
        let narrow = true;
        shaders.forEach((shader, index) => {
            const shaderPath = `${path}.shaders[${index}]`;
            const sc = { effect: name, shader: shader.name, path: shaderPath };
            let invalidResources = false;
            for (const kind of [
                'blocks',
                'samplerTextures',
                'buffers',
                'images',
                'textures',
                'samplers',
                'subpassInputs',
                'attributes',
                'defines',
            ]) {
                shader[kind].forEach((resource: Json, resourceIndex: number) => {
                    if (
                        !resource ||
                        typeof resource !== 'object' ||
                        Array.isArray(resource) ||
                        typeof resource.name !== 'string' ||
                        !resource.name ||
                        (kind === 'blocks' &&
                            (!Array.isArray(resource.members) ||
                                resource.members.some((member: Json) => !member || typeof member !== 'object')))
                    ) {
                        invalidResources = true;
                        add(
                            'error',
                            'AIR_E_PREFLIGHT_RESOURCE',
                            'Expected named reflected resource and valid block members',
                            { ...sc, path: `${shaderPath}.${kind}[${resourceIndex}]` },
                        );
                    }
                });
            }
            if (invalidResources) {
                narrow = false;
                return;
            }
            for (const group of ['globals', 'locals']) {
                for (const kind of ['blocks', 'samplerTextures', 'buffers', 'images']) {
                    for (const resource of shader.builtins[group][kind]) {
                        if (!resource || typeof resource !== 'object' || typeof resource.name !== 'string') {
                            add('error', 'AIR_E_PREFLIGHT_RESOURCE', 'Expected a named builtin resource reference', sc);
                            narrow = false;
                        } else if (resource.binding === undefined || resource.defines?.length) {
                            add(
                                'unknown',
                                'AIR_U_PREFLIGHT_BUILTIN_BINDINGS',
                                'Builtin descriptor identity requires the runtime registry and macro configuration',
                                sc,
                            );
                            narrow = false;
                        }
                    }
                }
            }
            const signature = effectShaderSignature(shader);
            entry.shaders.push({ name: shader.name, hash: shader.hash });
            if (local.has(shader.name))
                add('error', 'AIR_E_PREFLIGHT_PROGRAM_DUPLICATE', 'Duplicate program identity inside one effect', sc);
            local.add(shader.name);
            if (hashes.has(shader.hash) && hashes.get(shader.hash) !== signature)
                add(
                    'error',
                    'AIR_E_EFFECT_HASH_COLLISION',
                    'The same hash identifies different source/resource layouts',
                    sc,
                );
            if (programs.has(shader.name) && programs.get(shader.name) !== signature)
                add(
                    'error',
                    'AIR_E_EFFECT_PROGRAM_COLLISION',
                    'ProgramLib uses global program names; use distinct names for different sources',
                    sc,
                );
            hashes.set(shader.hash, signature);
            programs.set(shader.name, signature);
            if (
                ['buffers', 'images', 'textures', 'samplers', 'subpassInputs'].some((key) => shader[key].length) ||
                shader.blocks.some(
                    (block: Json) =>
                        block.defines?.length ||
                        block.members?.some((member: Json) => ![16, 25].includes(member.type) || member.count !== 1),
                ) ||
                shader.samplerTextures.some(
                    (sampler: Json) =>
                        sampler.defines?.length ||
                        sampler.count !== 1 ||
                        (sampler.type !== undefined && sampler.type !== 28),
                )
            )
                narrow = false;
            for (const target of ['glsl3', 'glsl4'] as const) {
                if (target === 'glsl4' && shader[target] === undefined) {
                    narrow = false;
                    continue;
                }
                for (const stage of ['vert', 'frag'] as const) {
                    const source = shader[target]?.[stage];
                    const at = { ...sc, target, stage, path: `${shaderPath}.${target}.${stage}` };
                    if (typeof source !== 'string' || !source.trim()) {
                        add('error', 'AIR_E_PREFLIGHT_STAGE', 'Expected a nonempty compiled stage source', at);
                        narrow = false;
                        continue;
                    }
                    if (source.length > 2000000) {
                        add('unknown', 'AIR_U_PREFLIGHT_BUDGET', 'Stage input budget exceeded', at);
                        narrow = false;
                        continue;
                    }
                    const code = clean(source);
                    if (/^\s*#\s*(?:if|ifdef|ifndef|define|include)\b/m.test(code)) {
                        add(
                            'unknown',
                            'AIR_U_PREFLIGHT_MACROS',
                            'Macro expansion/conditional semantics require the runtime compiler',
                            at,
                        );
                        narrow = false;
                        continue;
                    }
                    if (!/\bvoid\s+main\s*\(\s*(?:void\s*)?\)\s*\{/.test(code))
                        add('error', 'AIR_E_PREFLIGHT_ENTRY', 'Compiled stage is missing void main()', {
                            ...at,
                            line: 1,
                            column: 1,
                        });
                    if (stage === 'frag') {
                        const legacy = /\bgl_FragColor\b/.exec(code);
                        if (legacy)
                            add(
                                'error',
                                'AIR_E_PREFLIGHT_FRAGMENT_OUTPUT',
                                'ESSL 300 requires a declared fragment output instead of gl_FragColor',
                                {
                                    ...at,
                                    line: code.slice(0, legacy.index).split('\n').length,
                                    column: legacy.index - code.lastIndexOf('\n', legacy.index),
                                },
                            );
                        const reflected = reflectGLSLFragmentOutputNames(source);
                        if (reflected.status === 'unknown')
                            add('unknown', 'AIR_U_PREFLIGHT_OUTPUTS', reflected.reason, at);
                        const locations = new Set<number>();
                        const pattern =
                            /layout\s*\(\s*location\s*=\s*(\d+)\s*\)\s*out\s+(?:(?:highp|mediump|lowp)\s+)?\w+\s+\w+/g;
                        let match: RegExpExecArray | null;
                        while ((match = pattern.exec(code))) {
                            const location = Number(match[1]);
                            if (locations.has(location))
                                add(
                                    'error',
                                    'AIR_E_PREFLIGHT_OUTPUT_COLLISION',
                                    `Duplicate fragment output location ${location}`,
                                    {
                                        ...at,
                                        line: code.slice(0, match.index).split('\n').length,
                                        column: match.index - code.lastIndexOf('\n', match.index),
                                    },
                                );
                            locations.add(location);
                        }
                    }
                }
            }
        });
        effect.techniques.forEach((technique: Json, index: number) => {
            if (!technique || !Array.isArray(technique.passes) || !technique.passes.length) {
                add('error', 'AIR_E_PREFLIGHT_PASS', 'Technique requires a nonempty passes array', {
                    ...context,
                    path: `${path}.techniques[${index}]`,
                });
                return;
            }
            technique.passes.forEach((pass: Json, passIndex: number) => {
                if (!pass || typeof pass.program !== 'string' || !local.has(pass.program))
                    add(
                        'error',
                        'AIR_E_PREFLIGHT_PROGRAM_REFERENCE',
                        'Pass must reference an exact local program name',
                        { ...context, path: `${path}.techniques[${index}].passes[${passIndex}].program` },
                    );
            });
        });
        if (narrow) {
            try {
                prepareEffectForRegistration(entry.normalized as any);
            } catch (error) {
                const issues = (error as { issues?: Json[] }).issues;
                if (!issues) add('unknown', 'AIR_U_PREFLIGHT_LAYOUT', String(error), context);
                else
                    for (const issue of issues)
                        add(
                            ['UNSUPPORTED', 'DECLARATION_UNSUPPORTED'].includes(issue.code) ? 'unknown' : 'error',
                            `AIR_LAYOUT_${issue.code}`,
                            issue.message,
                            {
                                ...context,
                                shader: issue.shader,
                                stage: issue.stage,
                                target: issue.target,
                                line: issue.line,
                                column: issue.column,
                            },
                        );
            }
        } else
            add(
                'unknown',
                'AIR_U_PREFLIGHT_LAYOUT',
                'Resource layout is outside the existing unconditional vec4/mat4/sampler2D preflight',
                context,
            );
    });
    references.forEach((reference, referenceIndex) => {
        const path = `references[${referenceIndex}]`;
        if (!reference || typeof reference !== 'object' || Array.isArray(reference)) {
            add('error', 'AIR_E_PREFLIGHT_EFFECT_REFERENCE', 'Reference must be an object', { path });
            return;
        }
        let effectIndex = reference.effectIndex;
        if (Object.prototype.hasOwnProperty.call(reference, 'effectIndex')) {
            if (!Number.isSafeInteger(effectIndex) || effectIndex! < 0 || effectIndex! >= result.effects.length) {
                add(
                    'error',
                    'AIR_E_PREFLIGHT_EFFECT_REFERENCE',
                    'Invalid explicit effectIndex; no effectName fallback',
                    { path },
                );
                return;
            }
        } else {
            const matches = result.effects
                .map((effect, index) => ({ effect, index }))
                .filter(({ effect }) => effect.name === reference.effectName);
            if (matches.length !== 1) {
                add(
                    'error',
                    'AIR_E_PREFLIGHT_EFFECT_REFERENCE',
                    'effectName must resolve uniquely; use explicit effectIndex',
                    { path },
                );
                return;
            }
            effectIndex = matches[0].index;
        }
        const technique = reference.technique ?? 0;
        const normalized = result.effects[effectIndex!].normalized as Json | null;
        if (
            !normalized ||
            !Number.isSafeInteger(technique) ||
            technique < 0 ||
            technique >= normalized.techniques.length
        ) {
            add(
                'error',
                'AIR_E_PREFLIGHT_EFFECT_REFERENCE',
                'Explicit reference requires a valid effect and technique',
                { path },
            );
            return;
        }
        result.references.push({ referenceIndex, effectIndex: effectIndex!, technique });
    });
    return finish();
}

export function preflightEffect(effect: unknown): AirShaderPreflightReport {
    return preflightEffects([effect]);
}
