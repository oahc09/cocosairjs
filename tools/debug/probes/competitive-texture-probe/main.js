import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Color,
    Vec4,
    Material,
    EffectAsset,
    MeshRenderer,
    Texture2D,
    utils,
    primitives,
    director,
    Director,
    gfx,
    game,
} from 'cocosair';

const probe = { done: false, checks: [], samples: [], errors: [] };
window.__competitiveTextureProbe = probe;
const check = (name, ok, detail) => probe.checks.push({ name, ok: Boolean(ok), detail });
const close = (a, b, tolerance = 2) =>
    a.length === b.length && a.every((value, i) => Math.abs(value - b[i]) <= tolerance);
const srgbDecode = (byte) => {
    const value = byte / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const srgbEncode = (value) => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055) * 255;

function makeEffect() {
    const vert = `precision highp float;
in vec3 a_position; in vec2 a_texCoord;
out highp vec2 v_uv;
void main(){ gl_Position=vec4(a_position.xy*2.0,0.0,1.0); v_uv=a_texCoord; }`;
    const frag = `precision highp float;
layout(set=1,binding=0) uniform Constants { vec4 mode; };
uniform sampler2D colorTexture;
in highp vec2 v_uv; layout(location=0) out vec4 outputColor;
vec3 linearToSRGB(vec3 value){ return mix(value*12.92,1.055*pow(max(value,vec3(0.0)),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),value)); }
void main(){ vec4 sampleValue=texture(colorTexture,v_uv); outputColor=mode.x>1.5?vec4(sampleValue.aaa,1.0):vec4(mode.x>0.5?linearToSRGB(sampleValue.rgb):sampleValue.rgb,sampleValue.a); }`;
    const name = 'competitive-explicit-texture';
    const effect = Object.assign(new EffectAsset(), {
        name,
        techniques: [
            {
                passes: [
                    {
                        program: name,
                        rasterizerState: { cullMode: 0 },
                        depthStencilState: { depthTest: false, depthWrite: false },
                        properties: {
                            mode: { type: gfx.Type.FLOAT4, value: [0, 0, 0, 0] },
                            colorTexture: { type: gfx.Type.SAMPLER2D, value: 'white' },
                        },
                    },
                ],
            },
        ],
        shaders: [
            {
                name,
                hash: 947700,
                defines: [],
                builtins: {
                    statistics: {},
                    globals: { blocks: [], samplerTextures: [], buffers: [], images: [] },
                    locals: { blocks: [], samplerTextures: [], buffers: [], images: [] },
                },
                attributes: [
                    { name: 'a_position', defines: [], format: gfx.Format.RGB32F, location: 0 },
                    { name: 'a_texCoord', defines: [], format: gfx.Format.RG32F, location: 1 },
                ],
                blocks: [
                    {
                        name: 'Constants',
                        defines: [],
                        binding: 0,
                        stageFlags: gfx.ShaderStageFlagBit.FRAGMENT,
                        members: [{ name: 'mode', type: gfx.Type.FLOAT4, count: 1 }],
                    },
                ],
                samplerTextures: [
                    {
                        name: 'colorTexture',
                        type: gfx.Type.SAMPLER2D,
                        count: 1,
                        stageFlags: gfx.ShaderStageFlagBit.FRAGMENT,
                        binding: 1,
                        defines: [],
                    },
                ],
                buffers: [],
                images: [],
                textures: [],
                samplers: [],
                subpassInputs: [],
                glsl4: { vert, frag },
                glsl3: {
                    vert: vert.replace(/layout\s*\([^)]*\)\s*/g, ''),
                    frag: frag.replace(/layout\s*\([^)]*\)\s*/g, ''),
                },
            },
        ],
        combinations: [],
    });
    effect.onLoaded();
    return effect;
}

function texture(format, bytes, width = 2, height = 2) {
    const value = new Texture2D();
    value.reset({ width, height, format });
    value.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
    value.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
    value.uploadData(new Uint8Array(bytes));
    return value;
}

function sample() {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            director.off(Director.EVENT_AFTER_DRAW, draw);
            reject(new Error('frame timeout'));
        }, 8000);
        function draw() {
            clearTimeout(timeout);
            director.off(Director.EVENT_AFTER_DRAW, draw);
            const canvas = game.canvas,
                gl = director.root.device.gl;
            const values = [];
            for (const [x, y] of [
                [0.25, 0.25],
                [0.75, 0.25],
                [0.25, 0.75],
                [0.75, 0.75],
            ]) {
                const pixel = new Uint8Array(4);
                gl.readPixels(
                    Math.floor(canvas.width * x),
                    Math.floor(canvas.height * y),
                    1,
                    1,
                    gl.RGBA,
                    gl.UNSIGNED_BYTE,
                    pixel,
                );
                values.push(Array.from(pixel));
            }
            resolve(values);
        }
        director.on(Director.EVENT_AFTER_DRAW, draw);
    });
}

async function main() {
    check(
        'public SRGB888 maps to GFX SRGB8',
        Texture2D.PixelFormat.SRGB888 === gfx.Format.SRGB8,
        Texture2D.PixelFormat.SRGB888,
    );
    check(
        'public SRGBA8888 maps to GFX SRGB8_A8',
        Texture2D.PixelFormat.SRGBA8888 === gfx.Format.SRGB8_A8,
        Texture2D.PixelFormat.SRGBA8888,
    );
    const app = await createAirApp({ canvas: '#GameCanvas' });
    window.__airApp = app;
    const scene = new Scene('explicit-color-space');
    const cameraNode = new Node('Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(0, 0, 2);
    const camera = cameraNode.addComponent(Camera);
    camera.clearColor = new Color(0, 0, 0, 255);
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    const node = new Node('Quad');
    scene.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.quad());
    const effect = makeEffect();
    const material = new Material();
    material.initialize({ effectAsset: effect });
    renderer.material = material;
    app.run(scene);
    const encoded = [
        [128, 0, 0, 64],
        [0, 128, 0, 128],
        [0, 0, 128, 192],
        [128, 128, 128, 255],
    ];
    const linear = encoded.map((pixel) =>
        pixel.map((value, index) => (index < 3 ? Math.round(srgbDecode(value) * 255) : value)),
    );
    const encodedTexture = texture(Texture2D.PixelFormat.SRGBA8888, encoded.flat());
    const linearTexture = texture(Texture2D.PixelFormat.RGBA8888, linear.flat());
    check(
        'sRGB GPU allocation uses sRGB internal format',
        encodedTexture.getGFXTexture().format === gfx.Format.SRGB8_A8,
        encodedTexture.getGFXTexture().format,
    );
    const rgbTexture = texture(
        Texture2D.PixelFormat.SRGB888 ?? Texture2D.PixelFormat.RGB888,
        encoded.flatMap((pixel) => pixel.slice(0, 3)),
    );
    check(
        'sRGB RGB GPU allocation uses SRGB8',
        rgbTexture.getGFXTexture().format === gfx.Format.SRGB8,
        rgbTexture.getGFXTexture().format,
    );
    material.setProperty('mode', new Vec4(0, 0, 0, 0));
    material.setProperty('colorTexture', rgbTexture);
    const rgbPixels = await sample();
    for (let i = 0; i < 4; ++i) {
        check(`SRGB888 RGB/UV texel ${i}`, close(rgbPixels[i], [...linear[i].slice(0, 3), 255]), rgbPixels[i]);
    }
    const sampled = {};
    for (const outputMode of [0, 1]) {
        material.setProperty('mode', new Vec4(outputMode, 0, 0, 0));
        for (const [name, value] of [
            ['srgb', encodedTexture],
            ['linear', linearTexture],
        ]) {
            material.setProperty('colorTexture', value);
            const pixels = await sample();
            sampled[`${name}-${outputMode}`] = pixels;
            probe.samples.push({ name, outputMode, pixels });
            const expected =
                outputMode === 0
                    ? linear
                    : linear.map((pixel) => pixel.map((v, i) => (i < 3 ? srgbEncode(v / 255) : v)));
            for (let i = 0; i < 4; i++) {
                check(
                    `${name} mode ${outputMode} texel ${i} RGB/UV`,
                    close(pixels[i].slice(0, 3), expected[i].slice(0, 3)),
                    { actual: pixels[i], expected: expected[i] },
                );
            }
        }
        check(
            `equivalent linear/sRGB inputs agree in output mode ${outputMode}`,
            sampled[`srgb-${outputMode}`].every((pixel, i) => close(pixel, sampled[`linear-${outputMode}`][i])),
            sampled,
        );
    }
    // The engine's default framebuffer is opaque. Route sampled alpha into RGB,
    // otherwise readPixels would always expose framebuffer alpha=255.
    material.setProperty('mode', new Vec4(2, 0, 0, 0));
    for (const [name, value] of [
        ['srgb', encodedTexture],
        ['linear', linearTexture],
    ]) {
        material.setProperty('colorTexture', value);
        const pixels = await sample();
        probe.samples.push({ name, outputMode: 'alpha-to-rgb', pixels });
        for (let i = 0; i < 4; ++i) {
            check(
                `${name} texel ${i} alpha stays linear`,
                close(pixels[i].slice(0, 3), [encoded[i][3], encoded[i][3], encoded[i][3]], 1),
                pixels[i],
            );
        }
    }
    const paint = document.createElement('canvas');
    paint.width = paint.height = 2;
    paint.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(encoded.flat()), 2, 2), 0, 0);
    probe.canvasSource = Array.from(paint.getContext('2d').getImageData(0, 0, 2, 2).data);
    const canvasTexture = new Texture2D();
    canvasTexture.reset({ width: 2, height: 2, format: Texture2D.PixelFormat.SRGBA8888 });
    canvasTexture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
    canvasTexture.uploadData(paint);
    material.setProperty('colorTexture', canvasTexture);
    for (const outputMode of [0, 2]) {
        material.setProperty('mode', new Vec4(outputMode, 0, 0, 0));
        const pixels = await sample();
        probe.samples.push({ name: 'canvas-srgb', outputMode, pixels });
        for (let i = 0; i < 4; ++i) {
            const sourcePixel = probe.canvasSource.slice(i * 4, i * 4 + 4);
            const expected =
                outputMode === 0
                    ? sourcePixel.slice(0, 3).map((byte) => srgbDecode(byte) * 255)
                    : [sourcePixel[3], sourcePixel[3], sourcePixel[3]];
            check(
                `canvas sRGB ${outputMode === 0 ? 'RGB/UV' : 'linear alpha'} texel ${i}`,
                close(pixels[i].slice(0, 3), expected),
                pixels[i],
            );
        }
    }
    const normalBytes = [128, 128, 255, 255];
    const normal = texture(Texture2D.PixelFormat.RGBA8888, normalBytes, 1, 1);
    material.setProperty('mode', new Vec4(0, 0, 0, 0));
    material.setProperty('colorTexture', normal);
    const normals = await sample();
    check(
        'normal/data texture retains linear bytes',
        normals.every((pixel) => close(pixel, normalBytes)),
        normals,
    );
    check('texture contracts produce no WebGL errors', director.root.device.gl.getError() === 0);
    renderer.material = null;
    material.destroy();
    effect.destroy();
    for (const value of [encodedTexture, linearTexture, rgbTexture, canvasTexture, normal]) value.destroy();
    probe.ok = probe.checks.every((value) => value.ok);
    probe.done = true;
    game.pause();
}
main().catch((error) => {
    probe.errors.push(error.stack || String(error));
    probe.ok = false;
    probe.done = true;
    console.error(error);
});
