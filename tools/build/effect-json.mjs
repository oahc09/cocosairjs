/** Build a constrained, WebGL2 effect JSON from GLSL bodies and a declaration table. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const attrFormats = { vec2: 21, vec3: 32, vec4: 44 };
const uniformTypes = { vec4: 16, mat4: 25 };
const topologies = {
    POINT_LIST: 0,
    LINE_LIST: 1,
    LINE_STRIP: 2,
    LINE_LOOP: 3,
    TRIANGLE_LIST: 7,
    TRIANGLE_STRIP: 8,
    TRIANGLE_FAN: 9,
};

function fail(message) {
    throw new Error(`[AIR_EFFECT_SCHEMA] ${message}`);
}

function named(entry, used) {
    if (!entry || typeof entry.name !== 'string' || !identifier.test(entry.name) || /^(gl_|cc_)/.test(entry.name))
        fail('invalid or reserved identifier');
    if (used.has(entry.name)) fail(`duplicate declaration: ${entry.name}`);
    used.add(entry.name);
}

function fields(entry, allowed) {
    for (const key of Object.keys(entry)) if (!allowed.includes(key)) fail(`unsupported declaration field: ${key}`);
}

function body(source, stage) {
    if (typeof source !== 'string' || !/\bvoid\s+main\s*\(/.test(source))
        fail(`${stage}: provide a complete main() body`);
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    if (/^\s*#/m.test(code) || /\b(?:layout|uniform|attribute|varying|in|out|buffer|shared)\b/.test(code)) {
        fail(`${stage}: declarations, preprocessor directives and includes belong outside the supported body subset`);
    }
    return source.trim();
}

// Reuse the existing self-contained, engine-aligned UBO samples as data; do not execute their JS.
function builtinBlocks() {
    const source = readFileSync(new URL('../../examples/shared/shader-blocks.js', import.meta.url), 'utf8');
    const blocks = {};
    for (const name of ['CAMERA', 'LOCAL', 'GLOBAL']) {
        const match = source.match(new RegExp('export const UBO_CC_' + name + '_GLSL4 = `([\\s\\S]*?)`;'));
        if (!match) fail(`missing canonical CC${name} block`);
        blocks[name] = match[1];
    }
    return blocks;
}

/**
 * Supports vec2/3/4 vertex attributes, float-vector varyings, vec4/mat4 material
 * uniforms and sampler2D. No YAML, include, macro, MRT, UBO layout inference or shader compilation.
 */
export function buildEffectJson(spec) {
    if (!spec || typeof spec.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(spec.name))
        fail('name must be a stable effect identifier');
    const allowed = new Set([
        'name',
        'attributes',
        'varyings',
        'uniforms',
        'samplers',
        'primitive',
        'vertex',
        'fragment',
    ]);
    for (const key of Object.keys(spec)) if (!allowed.has(key)) fail(`unsupported field: ${key}`);
    if (!Array.isArray(spec.attributes) || !spec.attributes.length)
        fail('attributes must be a nonempty declaration table');
    for (const key of ['varyings', 'uniforms', 'samplers']) {
        if (spec[key] !== undefined && !Array.isArray(spec[key])) fail(`${key} must be an array`);
    }
    const used = new Set();
    const locations = new Set();
    const attributes = spec.attributes.map((a) => {
        named(a, used);
        fields(a, ['name', 'type', 'location']);
        if (!Object.hasOwn(attrFormats, a.type)) fail(`${a.name}: attributes support vec2/vec3/vec4 only`);
        if (!Number.isInteger(a.location) || a.location < 0 || a.location > 15 || locations.has(a.location))
            fail(`${a.name}: invalid or duplicate attribute location`);
        locations.add(a.location);
        return { name: a.name, type: a.type, defines: [], format: attrFormats[a.type], location: a.location };
    });
    const varyings = (spec.varyings || []).map((v) => {
        named(v, used);
        fields(v, ['name', 'type']);
        if (!['float', 'vec2', 'vec3', 'vec4'].includes(v.type)) fail(`${v.name}: varying must be a float vector`);
        return { name: v.name, type: v.type };
    });
    const uniforms = (spec.uniforms || []).map((u) => {
        named(u, used);
        fields(u, ['name', 'type', 'value']);
        if (!Object.hasOwn(uniformTypes, u.type))
            fail(`${u.name}: use vec4 or mat4; pack scalar parameters into vec4 components`);
        const size = u.type === 'mat4' ? 16 : 4;
        if (!Array.isArray(u.value) || u.value.length !== size || !u.value.every(Number.isFinite))
            fail(`${u.name}: expected ${size} finite default components`);
        return { name: u.name, type: uniformTypes[u.type], count: 1, value: [...u.value], glslType: u.type };
    });
    const samplers = (spec.samplers || []).map((s, i) => {
        named(s, used);
        fields(s, ['name', 'type', 'value']);
        if (s.type !== 'sampler2D') fail(`${s.name}: only sampler2D is supported`);
        if (typeof s.value !== 'string' || !['white', 'black', 'grey', 'normal', 'default'].includes(s.value))
            fail(`${s.name}: provide a builtin default texture name`);
        return {
            name: s.name,
            type: 28,
            count: 1,
            defines: [],
            stageFlags: 16,
            set: 1,
            binding: (uniforms.length ? 1 : 0) + i,
            value: s.value,
        };
    });
    if (spec.primitive !== undefined && !Object.hasOwn(topologies, spec.primitive))
        fail(`unsupported primitive: ${spec.primitive}`);
    const blocks = builtinBlocks();
    const constants = uniforms.length
        ? `layout(set = 1, binding = 0) uniform Constants {\n${uniforms.map((u) => `  ${u.glslType} ${u.name};`).join('\n')}\n};`
        : '';
    const vertex = [
        'precision highp float;',
        blocks.CAMERA,
        blocks.LOCAL,
        constants,
        ...attributes.map((a) => `layout(location = ${a.location}) in ${a.type} ${a.name};`),
        ...varyings.map((v) => `out highp ${v.type} ${v.name};`),
        body(spec.vertex, 'vertex'),
    ]
        .filter(Boolean)
        .join('\n');
    const fragment = [
        'precision highp float;',
        blocks.GLOBAL,
        constants,
        ...samplers.map((s) => `layout(set = 1, binding = ${s.binding}) uniform sampler2D ${s.name};`),
        ...varyings.map((v) => `in highp ${v.type} ${v.name};`),
        'layout(location = 0) out vec4 cc_FragColor;',
        body(spec.fragment, 'fragment'),
    ]
        .filter(Boolean)
        .join('\n');
    const glsl4 = { vert: vertex, frag: fragment };
    const glsl3 = Object.fromEntries(
        Object.entries(glsl4).map(([stage, source]) => [stage, source.replace(/layout\s*\([^)]*\)\s*/g, '')]),
    );
    const properties = Object.fromEntries(
        [...uniforms, ...samplers].map((u) => [u.name, { type: u.type, value: u.value }]),
    );
    // Content-derived program names prevent an edited shader reusing a previously registered template.
    const digest = createHash('sha256')
        .update(JSON.stringify({ glsl4, attributes, uniforms, samplers, primitive: spec.primitive }))
        .digest('hex');
    const program = `${spec.name}|${digest.slice(0, 16)}`;
    const materialBlocks = uniforms.length
        ? [
              {
                  name: 'Constants',
                  defines: [],
                  binding: 0,
                  stageFlags: 17,
                  members: uniforms.map(({ name, type, count }) => ({ name, type, count })),
              },
          ]
        : [];
    const builtinSet = (entries) => ({ blocks: entries, samplerTextures: [], buffers: [], images: [] });
    const pass = {
        program,
        rasterizerState: { cullMode: 0 },
        depthStencilState: { depthTest: true, depthWrite: true },
        blendState: { targets: [{ blend: false }] },
        properties,
    };
    if (spec.primitive !== undefined) pass.primitive = topologies[spec.primitive];
    return {
        name: spec.name,
        techniques: [{ passes: [pass] }],
        shaders: [
            {
                name: program,
                hash: Number.parseInt(digest.slice(0, 8), 16),
                builtins: {
                    statistics: {
                        CC_EFFECT_USED_VERTEX_UNIFORM_VECTORS:
                            47 + uniforms.reduce((n, u) => n + (u.glslType === 'mat4' ? 4 : 1), 0),
                        CC_EFFECT_USED_FRAGMENT_UNIFORM_VECTORS:
                            4 + uniforms.reduce((n, u) => n + (u.glslType === 'mat4' ? 4 : 1), 0),
                    },
                    globals: builtinSet([
                        { name: 'CCGlobal', defines: [], set: 0, binding: 0 },
                        { name: 'CCCamera', defines: [], set: 0, binding: 1 },
                    ]),
                    locals: builtinSet([{ name: 'CCLocal', defines: [], set: 2, binding: 0 }]),
                },
                defines: [],
                attributes: attributes.map(({ type, ...a }) => a),
                blocks: materialBlocks,
                samplerTextures: samplers.map(({ value, ...s }) => s),
                buffers: [],
                images: [],
                textures: [],
                samplers: [],
                subpassInputs: [],
                glsl4,
                glsl3,
            },
        ],
        combinations: [],
        hideInEditor: false,
    };
}

export function generateFile(inputPath, outputPath) {
    const input = resolve(inputPath);
    if (input === resolve(outputPath)) fail('input and output paths must differ');
    const spec = JSON.parse(readFileSync(input, 'utf8'));
    for (const stage of ['vertex', 'fragment']) {
        if (spec[stage] && typeof spec[stage] === 'object' && typeof spec[stage].file === 'string') {
            fields(spec[stage], ['file']);
            spec[stage] = readFileSync(resolve(dirname(input), spec[stage].file), 'utf8');
        }
    }
    const result = buildEffectJson(spec);
    writeFileSync(resolve(outputPath), JSON.stringify(result, null, 2) + '\n');
    return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [, , input, output, ...extra] = process.argv;
    if (!input || !output || extra.length) {
        console.error('Usage: node tools/build/effect-json.mjs <declarations.json> <effect.json>');
        process.exitCode = 1;
    } else {
        try {
            generateFile(input, output);
        } catch (error) {
            console.error(error.message);
            process.exitCode = 1;
        }
    }
}
