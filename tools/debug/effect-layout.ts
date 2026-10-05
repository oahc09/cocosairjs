/** Opt-in preflight for unconditional WebGL2 effect JSON. No registration, engine imports or GPU calls. */
export interface AirEffectLayoutIssue {
    code: string;
    shader: string;
    resource?: string;
    stage?: string;
    message: string;
}
export class AirEffectLayoutError extends Error {
    readonly code = 'AIR_E_EFFECT_LAYOUT';
    constructor(readonly issues: readonly AirEffectLayoutIssue[]) {
        super('[AIR_E_EFFECT_LAYOUT] ' + issues.map((issue) => issue.code + ': ' + issue.message).join('; '));
        this.name = 'AirEffectLayoutError';
    }
}
type Resource = {
    name: string;
    set?: number;
    binding?: number;
    count?: number;
    type?: number;
    stageFlags?: number;
    defines?: readonly string[];
    members?: readonly { name: string; type: number; count: number }[];
};
interface Shader {
    name: string;
    blocks?: Resource[];
    samplerTextures?: Resource[];
    buffers?: Resource[];
    images?: Resource[];
    textures?: Resource[];
    samplers?: Resource[];
    subpassInputs?: Resource[];
    glsl4: { vert: string; frag: string };
    glsl3: { vert: string; frag: string };
    builtins?: {
        globals?: { blocks?: Resource[]; samplerTextures?: Resource[] };
        locals?: { blocks?: Resource[]; samplerTextures?: Resource[] };
    };
}
export interface AirEffectLayoutJson {
    name: string;
    shaders: Shader[];
    techniques: { passes: { program: string }[] }[];
}
function clean(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
}
/** Clone, assign missing material slots and reject detectable collisions before EffectAsset.onLoaded().
 * Scope: unconditional vec4/mat4 UBOs and sampler2D, explicit glsl4 layouts. This is not a GLSL compiler.
 */
export function prepareEffectForRegistration<T extends AirEffectLayoutJson>(
    input: T,
): { effect: T; bindings: readonly { shader: string; name: string; kind: string; set: number; binding: number }[] } {
    const effect: T = JSON.parse(JSON.stringify(input));
    const issues: AirEffectLayoutIssue[] = [],
        bindings: { shader: string; name: string; kind: string; set: number; binding: number }[] = [];
    const issue = (shader: string, code: string, message: string, resource?: string, stage?: string): void => {
        issues.push({ shader, code, message, resource, stage });
    };
    if (!Array.isArray(effect.shaders) || !effect.shaders.length || !Array.isArray(effect.techniques))
        throw new AirEffectLayoutError([{ shader: '', code: 'SHAPE', message: 'shaders and techniques required' }]);
    const names = new Set<string>();
    for (const shader of effect.shaders) {
        if (names.has(shader.name)) issue(shader.name, 'PROGRAM_DUPLICATE', 'duplicate shader program');
        names.add(shader.name);
        for (const kind of ['buffers', 'images', 'textures', 'samplers', 'subpassInputs'] as const)
            if (shader[kind]?.length) issue(shader.name, 'UNSUPPORTED', kind + ' are outside this preflight scope');
        const resources = [
            ...(shader.blocks || []).map((r, i) => ({ r, kind: 'block', set: 1, defaultBinding: i })),
            ...(shader.samplerTextures || []).map((r) => ({ r, kind: 'sampler', set: 1, defaultBinding: -1 })),
            ...(shader.builtins?.globals?.blocks || []).map((r) => ({ r, kind: 'block', set: 0, defaultBinding: -1 })),
            ...(shader.builtins?.locals?.blocks || []).map((r) => ({ r, kind: 'block', set: 2, defaultBinding: -1 })),
            ...(shader.builtins?.globals?.samplerTextures || []).map((r) => ({
                r,
                kind: 'sampler',
                set: 0,
                defaultBinding: -1,
            })),
            ...(shader.builtins?.locals?.samplerTextures || []).map((r) => ({
                r,
                kind: 'sampler',
                set: 2,
                defaultBinding: -1,
            })),
        ];
        // Reserve explicit slots and material UBO slots before allocating automatic samplers.
        const reserved = new Set<number>((shader.blocks || []).map((r, i) => r.binding ?? i));
        for (const r of shader.samplerTextures || []) if (r.binding !== undefined) reserved.add(r.binding);
        let next = 0;
        for (const entry of resources) {
            const { r, kind, set, defaultBinding } = entry;
            if (r.defines?.length)
                issue(shader.name, 'UNSUPPORTED', 'conditional resources require a macro-aware compiler', r.name);
            r.set ??= set;
            if (r.binding === undefined && set === 1) {
                if (kind === 'block') r.binding = defaultBinding;
                else {
                    while (reserved.has(next)) next++;
                    r.binding = next;
                    reserved.add(next++);
                }
            }
            if (r.set !== set || !Number.isInteger(r.binding) || r.binding! < 0)
                issue(shader.name, 'BINDING_INVALID', 'invalid descriptor set or binding', r.name);
            if (kind === 'sampler' && r.count !== 1)
                issue(shader.name, 'COUNT', 'sampler count must be 1 in this scope', r.name);
            if (kind === 'sampler' && r.type !== undefined && r.type !== 28)
                issue(shader.name, 'TYPE', 'sampler2D reflection type must be 28', r.name);
            if (kind === 'block' && set === 1 && r.binding !== defaultBinding)
                issue(shader.name, 'BLOCK_ORDER', 'native material UBO slots must be consecutive from zero', r.name);
            if (set === 1 && (!Number.isInteger(r.stageFlags) || !r.stageFlags || (r.stageFlags & ~17) !== 0))
                issue(shader.name, 'STAGES', 'vertex/fragment stageFlags required', r.name);
            if (kind === 'block' && set === 1)
                for (const member of r.members || [])
                    if (![16, 25].includes(member.type) || member.count !== 1)
                        issue(shader.name, 'UNSUPPORTED', 'only scalar vec4/mat4 members supported', r.name);
            bindings.push({ shader: shader.name, name: r.name, kind, set: r.set, binding: r.binding! });
        }
        const slots = new Map<string, string>();
        for (const value of bindings.filter((b) => b.shader === shader.name)) {
            const key = value.set + ':' + value.binding,
                previous = slots.get(key);
            if (previous)
                issue(shader.name, 'BINDING_COLLISION', previous + ' and ' + value.name + ' share ' + key, value.name);
            slots.set(key, value.name);
        }
        for (const stage of ['vert', 'frag'] as const) {
            const source = shader.glsl4?.[stage];
            if (typeof source !== 'string' || typeof shader.glsl3?.[stage] !== 'string') {
                issue(shader.name, 'SOURCE', 'glsl4 and glsl3 sources required', undefined, stage);
                continue;
            }
            const code = clean(source),
                found = new Map<string, { set: number; binding: number; kind: string }>();
            let conditionalDepth = 0;
            for (const line of code.split('\n')) {
                if (/^\s*#\s*(if|ifdef|ifndef)\b/.test(line)) conditionalDepth++;
                if (conditionalDepth && /\buniform\b/.test(line))
                    issue(
                        shader.name,
                        'UNSUPPORTED',
                        'conditional uniform declarations need a macro-aware compiler',
                        undefined,
                        stage,
                    );
                if (/^\s*#\s*endif\b/.test(line)) conditionalDepth--;
            }
            if (/\bsampler2DShadow\b/.test(code) || /\bsampler2DShadow\b/.test(clean(shader.glsl3[stage])))
                issue(
                    shader.name,
                    'DEPTH_COMPARISON_UNAVAILABLE',
                    'WebGL2 backend does not configure texture comparison mode; use sampler2D .r and manual comparison',
                    undefined,
                    stage,
                );
            const pattern =
                /layout\s*\(([^)]*)\)\s*uniform\s+(?:(?:highp|mediump|lowp)\s+)?(?:(sampler2D)\s+([A-Za-z_]\w*)\s*;|([A-Za-z_]\w*)\s*\{)/g;
            for (const match of code.matchAll(pattern)) {
                const set = Number(match[1].match(/\bset\s*=\s*(\d+)/)?.[1] ?? NaN),
                    binding = Number(match[1].match(/\bbinding\s*=\s*(\d+)/)?.[1] ?? NaN);
                const name = match[3] || match[4],
                    declaration = { set, binding, kind: match[2] ? 'sampler' : 'block' };
                if (found.has(name))
                    issue(shader.name, 'DECLARATION_DUPLICATE', 'duplicate uniform declaration', name, stage);
                found.set(name, declaration);
                const reflected = resources.find((entry) => entry.r.name === name);
                if (!reflected) issue(shader.name, 'REFLECTION_MISSING', 'GLSL uniform has no reflection', name, stage);
                else if (
                    reflected.r.set !== set ||
                    reflected.r.binding !== binding ||
                    reflected.kind !== declaration.kind
                )
                    issue(shader.name, 'REFLECTION_MISMATCH', 'GLSL layout differs from reflection', name, stage);
                else if (reflected.set === 1 && !(reflected.r.stageFlags! & (stage === 'vert' ? 1 : 16)))
                    issue(
                        shader.name,
                        'STAGE_MISMATCH',
                        'GLSL declaration absent from reflected stageFlags',
                        name,
                        stage,
                    );
                if (reflected?.kind === 'block' && reflected.set === 1) {
                    const block = code.slice(match.index! + match[0].length).split('}')[0];
                    const members = Array.from(
                        block.matchAll(/(?:\b(?:highp|mediump|lowp)\s+)?\b(vec4|mat4)\s+([A-Za-z_]\w*)\s*;/g),
                        (m) => ({ name: m[2], type: m[1] === 'vec4' ? 16 : 25, count: 1 }),
                    );
                    const expected = (reflected.r.members || []).map(({ name, type, count }) => ({
                        name,
                        type,
                        count,
                    }));
                    const residue = block
                        .replace(/(?:\b(?:highp|mediump|lowp)\s+)?\b(vec4|mat4)\s+[A-Za-z_]\w*\s*;/g, '')
                        .trim();
                    if (residue || JSON.stringify(members) !== JSON.stringify(expected))
                        issue(
                            shader.name,
                            'MEMBERS_MISMATCH',
                            'GLSL UBO member order/type/count differs from reflection',
                            name,
                            stage,
                        );
                }
            }
            for (const entry of resources)
                if (entry.set === 1 && entry.r.stageFlags! & (stage === 'vert' ? 1 : 16) && !found.has(entry.r.name))
                    issue(
                        shader.name,
                        'DECLARATION_MISSING',
                        'reflection has no matching GLSL layout',
                        entry.r.name,
                        stage,
                    );
        }
    }
    for (const technique of effect.techniques)
        for (const pass of technique.passes)
            if (!names.has(pass.program)) issue(pass.program, 'PROGRAM_MISSING', 'pass program does not name a shader');
    if (issues.length) throw new AirEffectLayoutError(Object.freeze(issues.map((i) => Object.freeze(i))));
    return { effect, bindings: Object.freeze(bindings.map((b) => Object.freeze(b))) };
}

export interface AirDepthSamplerOptions {
    name: string;
    binding: number;
    stage?: 'vert' | 'frag';
    mode?: 'raw-depth' | 'manual-compare' | 'hardware-compare';
}
/** Opt-in effect-authoring template. The source texture must be a sampled raw depth attachment.
 * referenceDepth is the projected WebGL depth in [0,1], not view-space Z or clip-space [-1,1].
 * Manual comparison returns visibility (referenceDepth-bias <= storedDepth). It is not PCF.
 */
export function createAirDepthSamplerTemplate(options: AirDepthSamplerOptions): {
    glsl4: string;
    glsl3: string;
    resource: Resource;
    sampleExpression: string;
    comparisonFunction?: string;
} {
    const issue = (code: string, message: string): never => {
        throw new AirEffectLayoutError([{ shader: '', resource: options.name, code, message }]);
    };
    if (!/^[A-Za-z_]\w*$/.test(options.name) || /^gl_/.test(options.name))
        issue('DEPTH_NAME', 'use a GLSL identifier outside the reserved gl_ namespace');
    if (!Number.isInteger(options.binding) || options.binding < 0)
        issue('BINDING_INVALID', 'depth sampler binding must be a nonnegative integer');
    const stage = options.stage ?? 'frag',
        mode = options.mode ?? 'raw-depth';
    if (!['vert', 'frag'].includes(stage)) issue('STAGES', 'depth sampler stage must be vert or frag');
    if (mode === 'hardware-compare')
        issue(
            'DEPTH_COMPARISON_UNAVAILABLE',
            'sampler2DShadow is unavailable in the current WebGL2 backend; use manual-compare',
        );
    if (!['raw-depth', 'manual-compare'].includes(mode)) issue('DEPTH_MODE', 'use raw-depth or manual-compare');
    const declaration = `uniform highp sampler2D ${options.name};`;
    const comparisonFunction =
        mode === 'manual-compare'
            ? `float ${options.name}Visibility(vec2 uv, float referenceDepth, float bias) { return step(referenceDepth - bias, texture(${options.name}, uv).r); }`
            : undefined;
    const helper = comparisonFunction ? '\n' + comparisonFunction : '';
    return {
        glsl4: `layout(set = 1, binding = ${options.binding}) ${declaration}${helper}`,
        glsl3: declaration + helper,
        resource: {
            name: options.name,
            set: 1,
            binding: options.binding,
            count: 1,
            type: 28,
            stageFlags: stage === 'vert' ? 1 : 16,
        },
        sampleExpression: `texture(${options.name}, uv).r`,
        comparisonFunction,
    };
}

/** Resolve a validated descriptor address with exact source declaration locations for diagnosis. */
export function locateAirEffectBinding(
    input: AirEffectLayoutJson,
    shaderName: string,
    resourceName: string,
): {
    shader: string;
    name: string;
    kind: string;
    set: number;
    binding: number;
    declarations: readonly { stage: 'vert' | 'frag'; line: number; source: string }[];
} {
    const prepared = prepareEffectForRegistration(input);
    const binding = prepared.bindings.find((entry) => entry.shader === shaderName && entry.name === resourceName);
    if (!binding)
        throw new AirEffectLayoutError([
            {
                shader: shaderName,
                resource: resourceName,
                code: 'RESOURCE_MISSING',
                message: 'no reflected resource with this shader/name',
            },
        ]);
    const shader = prepared.effect.shaders.find((entry) => entry.name === shaderName)!;
    const declarations: { stage: 'vert' | 'frag'; line: number; source: string }[] = [];
    for (const stage of ['vert', 'frag'] as const) {
        const source = shader.glsl4[stage],
            code = clean(source);
        const identifier = resourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(
            `layout\\s*\\([^)]*\\)\\s*uniform\\s+(?:(?:highp|mediump|lowp)\\s+)?(?:sampler2D\\s+)?${identifier}\\b`,
            'g',
        );
        for (const match of code.matchAll(pattern)) {
            // Match against cleaned lines without comments; line counts are retained by clean().
            const line = code.slice(0, match.index).split('\n').length;
            declarations.push({ stage, line, source: source.split('\n')[line - 1] });
        }
    }
    return { ...binding, declarations: Object.freeze(declarations.map((entry) => Object.freeze(entry))) };
}
