'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');

// Compile complete mother shaders. Only the child sampler is substituted; lighting, SDF,
// blur taps, alpha, and output transfer are inherited byte-for-byte before shader wrapping.
function transformShader(source, effect, fused) {
    if (!fused) return source;
    const diagnostic = effect === 'emboss' ? 'emboss2.z' : 'glass5.z';
    const sampler = `vec4 storedPattern(vec2 coords) {
    if (${diagnostic} > 0.5) return vec4(0.0);
    vec2 uv = (clamp(floor(coords * 256.0), vec2(0.0), vec2(255.0)) + 0.5) / 256.0;
    vec2 cell = floor(uv * 8.0);
    float check = mod(cell.x + cell.y, 2.0) < 0.5 ? 0.35 : 0.65;
    vec3 rgb = vec3(check + uv.x * 0.1, check * 0.8, check * 0.6);
    float alpha = uv.x < 0.5 ? 1.0 : 0.5;
    if (length(uv - vec2(0.75, 0.25)) < 0.08) { rgb = vec3(1.0, 0.437, 0.0); alpha = 0.0; }
    if (length(uv - vec2(0.25, 0.75)) < 0.08) { rgb = vec3(0.9, 0.2, 0.5); alpha = 1.0; }
    return floor(vec4(clamp(rgb, 0.0, 1.0) * alpha, alpha) * 255.0 + 0.5) / 255.0;
}
`;
    const declaration = /layout\(set = 1, binding = 1\) uniform(?: highp)? sampler2D childTexture;/;
    if (!declaration.test(source)) throw new Error('Missing mother sampler declaration');
    const result = source.replace(declaration, sampler).replace(/texture\(childTexture, /g, 'storedPattern(');
    if (/childTexture/.test(result)) throw new Error('Untransformed texture access');
    return result;
}

async function generate() {
    const esbuild = require('esbuild');
    const prettier = require('prettier');
    const code = esbuild.buildSync({
        stdin: { contents: "export * from './examples/shared/shader-blocks.js'", resolveDir: ROOT },
        bundle: true,
        platform: 'node',
        format: 'cjs',
        write: false,
    }).outputFiles[0].text;
    const m = { exports: {} };
    new Function('module', 'exports', 'require', code)(m, m.exports, require);
    const { makeUserEffectJson, standardVert, fragVariants } = m.exports;
    const vert = standardVert();
    for (const key of ['glsl3', 'glsl4'])
        vert[key] = vert[key]
            .replace('cc_matViewProj * cc_matWorld * vec4(a_position, 1.0)', 'vec4(a_position.xy, 0.0, 1.0)')
            .replace('out mediump vec2 v_uv', 'out highp vec2 v_uv');
    const definitions = {};
    const sources = {};
    let hash = 9510500;
    for (const effect of ['emboss', 'glass']) {
        const base = path.join(ROOT, 'examples', 'shader-' + effect);
        const params = JSON.parse(fs.readFileSync(path.join(base, 'parameters.json'), 'utf8'));
        const source = fs.readFileSync(path.join(base, 'src', effect + '.frag'), 'utf8');
        sources[effect] = params;
        for (const mode of ['reference', 'fused', 'pattern']) {
            const pattern = mode === 'pattern';
            const fused = mode === 'fused';
            const fields = pattern
                ? ['pattern0']
                : Array.from({ length: effect === 'emboss' ? 3 : 6 }, (_, i) => effect + i);
            const name = `air-w5-fusion-${effect}-${mode}`;
            const definition = makeUserEffectJson({
                name,
                prog: name + '-program',
                hash: ++hash,
                properties: Object.fromEntries(fields.map((f) => [f, { value: [0, 0, 0, 0] }])),
                members: fields.map((name) => ({ name, type: 16, count: 1 })),
                samplerTextures: !pattern && !fused ? [{ name: 'childTexture', type: 28, binding: 1 }] : [],
                defines: pattern
                    ? []
                    : ['SHAPE_BOX', ...(effect === 'glass' ? ['USE_BLUR', 'USE_ABERRATION'] : [])].map((name) => ({
                          name,
                          type: 'boolean',
                      })),
            });
            const frag = fragVariants(
                pattern
                    ? fs.readFileSync(path.join(base, 'src/pattern.frag'), 'utf8')
                    : transformShader(source, effect, fused),
                'precision highp float; void main(){gl_FragColor=vec4(0.0);}',
            );
            for (const key of ['glsl1', 'glsl3', 'glsl4'])
                definition.shaders[0][key] = { vert: vert[key], frag: frag[key] };
            definitions[effect + ':' + mode] = definition;
        }
    }
    const out = path.join(__dirname, 'src/effect.generated.ts');
    const config = await prettier.resolveConfig(out, { editorconfig: true });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
        out,
        await prettier.format(
            '// Generated from frozen complete E05/E09 shaders.\nexport const definitions = ' +
                JSON.stringify(definitions) +
                ';\nexport const parameterDefinitions = ' +
                JSON.stringify(sources) +
                ';\n',
            { ...config, filepath: out },
        ),
    );
    const motherMain = fs.readFileSync(path.join(ROOT, 'examples/shader-emboss/src/main.ts'), 'utf8');
    const stateStart = motherMain.indexOf('const perf =');
    const stateEnd = motherMain.indexOf('const memory =', stateStart);
    if (stateStart < 0 || stateEnd < stateStart) throw new Error('Missing native performance state anchors');
    const state = motherMain.slice(stateStart, stateEnd);
    const methods = motherMain
        .slice(motherMain.indexOf('function startPerformance()'), motherMain.indexOf('function snapshot()'))
        .replace(/    if \(clock\) \{[\s\S]*?    paused = false;/, '    context.prepare();')
        .replace('listenerAdds += 2;', 'context.listeners(2, 0);')
        .replace('listenerRemoves += 2;', 'context.listeners(0, 2);')
        .replace(
            "passes: 'child RTT pass and emboss pass are both native render passes in every timed frame'",
            "passes: 'native reference two-pass or fused one-pass; verified from actual commands'",
        );
    const perfOut = path.join(__dirname, 'src/performance.generated.ts');
    fs.writeFileSync(
        perfOut,
        await prettier.format(
            '// Native instrumentation adapted from frozen E05; no rendering outside AIR.\n' +
                'export function makePerformance(context: any) {\nconst { director, Director, game, gl, device, canvas, memory, snapshot, ensure } = context;\n' +
                state +
                methods +
                '\nreturn {startPerformance,stopPerformance,isActive:()=>perf.active, recordUpdate:(ms:number)=>{if(perf.active)perf.updateCalls.push({frame:director.getTotalFrames(),ms});}};\n}\n',
            { ...config, filepath: perfOut },
        ),
    );
    return { out, effects: Object.keys(definitions).length };
}
module.exports = { generate, transformShader };
if (require.main === module)
    generate()
        .then((r) => console.log(JSON.stringify(r)))
        .catch((e) => {
            console.error(e);
            process.exitCode = 1;
        });
