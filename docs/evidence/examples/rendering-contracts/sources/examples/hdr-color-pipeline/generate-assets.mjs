/** Offline only. Original analytic environment + deterministic GGX split-sum radiance convolution.
 * Math reference: https://google.github.io/filament/main/filament.html#annex/importancesamplingfortheibl
 * The runtime consumes the resulting bytes; this script is never imported by the page.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEffectJson } from '../../tools/build/effect-json.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const assetDirectory = join(directory, 'assets');
mkdirSync(assetDirectory, { recursive: true });
const SIZE = 32,
    LEVELS = 6,
    SAMPLES = 512;
const faces = ['right', 'left', 'top', 'bottom', 'front', 'back'];
const normalize = (v) => {
    const l = Math.hypot(...v);
    return v.map((x) => x / l);
};
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lights = [
    { direction: normalize([0.8, 0.6, 1]), color: [4.6, 2.1, 0.4], exponent: 90 },
    { direction: normalize([-0.9, 0.2, 0.5]), color: [0.3, 1.2, 3.4], exponent: 34 },
    { direction: normalize([0.1, -0.6, -1]), color: [1.4, 0.15, 0.65], exponent: 24 },
];
function environment(direction) {
    const color = [0.04 + 0.06 * (direction[1] + 1), 0.06 + 0.07 * (direction[1] + 1), 0.1 + 0.09 * (direction[1] + 1)];
    for (const light of lights) {
        const value = Math.pow(Math.max(0, dot(direction, light.direction)), light.exponent);
        light.color.forEach((c, i) => {
            color[i] += value * c;
        });
    }
    return color;
}
function direction(face, x, y, size) {
    const u = (2 * (x + 0.5)) / size - 1,
        v = (2 * (y + 0.5)) / size - 1;
    return normalize(
        [
            [1, -v, -u],
            [-1, -v, u],
            [u, 1, v],
            [u, -1, -v],
            [u, -v, 1],
            [-u, -v, -1],
        ][face],
    );
}
function radicalInverse(index) {
    let bits = index >>> 0;
    bits = ((bits << 16) | (bits >>> 16)) >>> 0;
    bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0;
    bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0;
    bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0;
    bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0;
    return bits / 4294967296;
}
function prefilter(normal, roughness) {
    if (roughness === 0) return environment(normal);
    const alpha = roughness * roughness;
    const tangent = normalize(cross(Math.abs(normal[2]) < 0.99 ? [0, 0, 1] : [1, 0, 0], normal));
    const bitangent = cross(normal, tangent),
        sum = [0, 0, 0];
    let weights = 0;
    for (let i = 0; i < SAMPLES; i++) {
        const phi = (2 * Math.PI * i) / SAMPLES,
            xi = radicalInverse(i);
        const cosTheta = Math.sqrt((1 - xi) / (1 + (alpha * alpha - 1) * xi));
        const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
        const h = normal.map(
            (v, j) => tangent[j] * Math.cos(phi) * sinTheta + bitangent[j] * Math.sin(phi) * sinTheta + v * cosTheta,
        );
        const voh = dot(normal, h),
            light = normal.map((v, j) => 2 * voh * h[j] - v),
            nol = Math.max(0, dot(normal, light));
        if (!nol) continue;
        const radiance = environment(light);
        radiance.forEach((value, j) => {
            sum[j] += value * nol;
        });
        weights += nol;
    }
    return sum.map((v) => v / weights);
}
function encode(color) {
    // Pinned native shader unpackRGBE uses base 1.1, not Radiance RGBE's base 2.
    const e = Math.ceil(Math.log(Math.max(...color)) / Math.log(1.1)),
        scale = Math.pow(1.1, e);
    return [...color.map((value) => Math.round(Math.min(1, value / scale) * 255)), e + 128];
}
const source = [],
    filtered = [],
    levels = [],
    stats = [];
let offset = 0;
for (let level = 0; level < LEVELS; level++) {
    const size = SIZE >> level,
        roughness = level / LEVELS;
    let difference = 0,
        count = 0;
    const values = [];
    for (let face = 0; face < 6; face++)
        for (let y = 0; y < size; y++)
            for (let x = 0; x < size; x++) {
                const ray = direction(face, x, y, size),
                    original = environment(ray),
                    baked = prefilter(ray, roughness);
                source.push(...encode(original));
                filtered.push(...encode(baked));
                original.forEach((v, j) => {
                    difference += Math.abs(v - baked[j]);
                    count++;
                });
                values.push(...baked);
            }
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    stats.push({
        roughness,
        meanAbsoluteDifferenceFromUnfiltered: difference / count,
        variance: values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length,
    });
    levels.push({ size, roughness, offset, faceBytes: size * size * 4 });
    offset += size * size * 4 * 6;
}
if (!(
    stats[0].meanAbsoluteDifferenceFromUnfiltered === 0 &&
    stats[2].meanAbsoluteDifferenceFromUnfiltered > 0.01 &&
    stats[5].variance < stats[0].variance
))
    throw new Error('GGX convolution controls failed');
const binaries = { 'environment.bin': Buffer.from(source), 'ggx-prefiltered.bin': Buffer.from(filtered) };
for (const [name, bytes] of Object.entries(binaries)) writeFileSync(join(assetDirectory, name), bytes);
writeFileSync(
    join(assetDirectory, 'environment.json'),
    JSON.stringify(
        {
            schema: 'air-native-ggx-fixture/1',
            generator: 'generate-assets.mjs',
            source: 'Original analytic directional light environment, CC0-1.0',
            distribution: 'ggx',
            alphaMapping: 'perceptualRoughness^2',
            integration: 'V=N, normalized sum Li(L)*NdotL; Hammersley GGX NDF sampling',
            samplesPerTexel: SAMPLES,
            encoding: 'native-rgbe-base1.1',
            faces,
            levels,
            stats,
            files: Object.fromEntries(
                Object.entries(binaries).map(([name, bytes]) => [
                    name,
                    { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
                ]),
            ),
        },
        null,
        2,
    ) + '\n',
);

const attributes = [
    { name: 'a_position', type: 'vec3', location: 0 },
    { name: 'a_texCoord', type: 'vec2', location: 2 },
];
const varyings = [{ name: 'v_uv', type: 'vec2' }];
const vertex = 'void main() { v_uv=a_texCoord; gl_Position=cc_matViewProj*cc_matWorld*vec4(a_position,1.0); }';
const transfer =
    'vec3 decodeSRGB(vec3 c) { return mix(c/12.92,pow((c+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),c)); }\nvec3 encodeSRGB(vec3 c) { c=max(c,vec3(0)); return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c)); }';
const specs = [
    {
        name: 'air-hdr-color-input',
        attributes,
        varyings,
        uniforms: [{ name: 'params', type: 'vec4', value: [0, 1, 0, 0] }],
        samplers: [{ name: 'colorMap', type: 'sampler2D', value: 'white' }],
        vertex,
        fragment:
            transfer +
            '\nvoid main() { vec3 c=texture(colorMap,v_uv).rgb; if(params.x>1.5)c=decodeSRGB(c); cc_FragColor=vec4(encodeSRGB(c),1); }',
    },
    {
        name: 'air-hdr-source',
        attributes,
        varyings,
        uniforms: [{ name: 'params', type: 'vec4', value: [1, 0, 0, 0] }],
        samplers: [],
        vertex: 'void main() { v_uv=a_texCoord; gl_Position=vec4(a_position.xy,0,1); }',
        fragment:
            'void main() { float glow=exp(-dot(v_uv-vec2(0.63,0.55),v_uv-vec2(0.63,0.55))*20.0); vec3 radiance=(mix(vec3(0.1,0.04,0.3),vec3(3.5,1.7,0.15),v_uv.x)+vec3(5,3,1)*glow)*params.x; cc_FragColor=vec4(radiance,1); }',
    },
    {
        name: 'air-hdr-output',
        attributes,
        varyings,
        uniforms: [{ name: 'params', type: 'vec4', value: [1, 1, 0, 0] }],
        samplers: [{ name: 'radianceMap', type: 'sampler2D', value: 'black' }],
        vertex,
        fragment:
            transfer +
            '\nvoid main() { vec3 c=texture(radianceMap,v_uv).rgb*params.x; if(params.y>0.5)c=c/(vec3(1)+c); cc_FragColor=vec4(encodeSRGB(c),1); }',
    },
];
for (const spec of specs) {
    const id = spec.name.replace('air-hdr-', '');
    writeFileSync(join(directory, `${id}.effect.json`), JSON.stringify(buildEffectJson(spec), null, 2) + '\n');
}
console.log(JSON.stringify({ bytesPerCube: offset, levels, convolutionControls: stats }, null, 2));
