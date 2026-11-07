import {
    createAirApp,
    createAirPostProcess,
    createAirRenderTarget,
    createStepClock,
    Scene,
    Node,
    Camera,
    Vec3,
    Color,
    TextureCube,
    ImageAsset,
    EffectAsset,
    Material,
    MeshRenderer,
    utils,
    gfx,
} from '/engine.js';

const result = (window.__hdrSkybox = { state: 'starting', checks: [], cases: [], errors: [] });
const radiance = [4, 2, 1];
const encoded = [244, 122, 61, 143];
const decoded = encoded.slice(0, 3).map((v) => (v / 255) * 1.1 ** (encoded[3] - 128));
const display = decoded.map((x) => {
    x = Math.min(x, 8);
    return Math.sqrt((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14));
});
const MAIN = 1 << 20;
const OTHER = 1 << 21;
function check(name, actual, expected, tolerance) {
    const pass =
        actual.length === expected.length &&
        actual.every((v, i) => Number.isFinite(v) && Math.abs(v - expected[i]) <= tolerance);
    result.checks.push({ name, pass, actual, expected, tolerance });
}
addEventListener('error', (e) => result.errors.push(String(e.message)));
addEventListener('unhandledrejection', (e) => result.errors.push(String(e.reason)));

try {
    const app = await createAirApp({ canvas: '#GameCanvas', pixelRatioCap: 1, diagnostics: 'warnings' });
    const scene = new Scene('Asset-free RGBE skybox HDR regression');
    scene.globals.skybox.useHDR = true;
    scene.globals.skybox.envLightingType = 0;
    scene.globals.postSettings.toneMappingType = 0;
    const cube = new TextureCube('Constant linear radiance [4,2,1]');
    cube.isRGBE = true;
    cube.setMipFilter(TextureCube.Filter.NONE);
    const mip = {};
    for (const name of ['right', 'left', 'top', 'bottom', 'front', 'back']) {
        mip[name] = new ImageAsset({
            _data: new Uint8Array(encoded),
            _compressed: false,
            width: 1,
            height: 1,
            format: TextureCube.PixelFormat.RGBA8888,
        });
    }
    cube.mipmaps = [mip];
    cube.setFilters(TextureCube.Filter.NEAREST, TextureCube.Filter.NEAREST);
    scene.globals.skybox.envmap = cube;
    scene.globals.skybox.enabled = true;
    function makeCamera(name, layer, priority) {
        const node = new Node(name);
        scene.addChild(node);
        node.lookAt(new Vec3(0, 0, -1));
        const camera = node.addComponent(Camera);
        camera.visibility = layer;
        camera.priority = priority;
        camera.clearFlags = Camera.ClearFlag.SKYBOX;
        camera.clearColor = new Color(0, 0, 0, 255);
        camera.iso = Camera.ISO.ISO100;
        return camera;
    }
    const camera = makeCamera('HDR post camera', MAIN, 0);
    const ordinary = makeCamera('Unmarked ordinary camera', OTHER, -10);
    const ordinaryTarget = createAirRenderTarget({
        name: 'ordinary-sky-display-values',
        width: 4,
        height: 4,
        colorFormat: 'rgba32f',
        depthFormat: 'depth24-stencil8',
        filter: 'nearest',
    });
    const detachOrdinary = ordinaryTarget.attachCamera(ordinary);
    const effectName = 'hdr-skybox-independent-linear-reference';
    const vert = 'precision highp float; in vec3 a_position; void main(){ gl_Position=vec4(a_position.xy,0.0,1.0); }';
    const frag = 'precision highp float; out vec4 fragColor; void main(){ fragColor=vec4(4.0,2.0,1.0,1.0); }';
    const effect = Object.assign(new EffectAsset(), {
        name: effectName,
        techniques: [
            {
                passes: [
                    {
                        program: effectName,
                        properties: {},
                        rasterizerState: { cullMode: 0 },
                        depthStencilState: { depthTest: false, depthWrite: false },
                        blendState: { targets: [{ blend: false }] },
                    },
                ],
            },
        ],
        shaders: [
            {
                name: effectName,
                glsl3: { vert, frag },
                glsl4: { vert, frag },
                defines: [],
                attributes: [{ name: 'a_position', format: gfx.Format.RGB32F, location: 0, defines: [] }],
                blocks: [],
                samplerTextures: [],
                buffers: [],
                images: [],
                textures: [],
                samplers: [],
                subpassInputs: [],
                builtins: {
                    globals: { blocks: [], samplerTextures: [] },
                    locals: { blocks: [], samplerTextures: [] },
                    statistics: {},
                },
            },
        ],
    });
    effect.onLoaded();
    const material = new Material();
    material.initialize({ effectAsset: effect });
    const referenceNode = new Node('Independent linear mesh, no skybox in this camera');
    referenceNode.layer = MAIN;
    referenceNode.setPosition(0, 0, -2);
    scene.addChild(referenceNode);
    const renderer = referenceNode.addComponent(MeshRenderer);
    const mesh = utils.createMesh(
        {
            positions: [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0],
            indices: [0, 1, 2, 0, 2, 3],
        },
        undefined,
        { calculateBounds: true },
    );
    renderer.mesh = mesh;
    renderer.setSharedMaterial(material, 0);
    referenceNode.active = false;
    app.run(scene);
    const clock = createStepClock({ stepTimeoutMs: 10000 });
    clock.begin();
    scene.globals.ambient.skyIllum = 1 / camera.camera.exposure;
    const step = async () => {
        for (let i = 0; i < 4; i++) await clock.step();
    };
    const read = (target) => {
        const info = target.info;
        return Array.from(
            target.readColor({ x: Math.floor(info.width / 2), y: Math.floor(info.height / 2), width: 1, height: 1 }),
        );
    };
    let post = null;
    const readCase = (name, expectedLinear = null) => {
        const normal = read(ordinaryTarget);
        check(`${name}: ordinary camera remains ACES then gamma`, normal.slice(0, 3), display, 0.004);
        const row = {
            name,
            ordinary: normal,
            ordinaryPriority: ordinary.priority,
            exposure: camera.camera.exposure,
            ordinaryExposure: ordinary.camera.exposure,
            skyIllum: scene.globals.ambient.skyIllum,
            effectiveSky: scene.globals.ambient.skyIllum * camera.camera.exposure,
            mainTargetIsNull: camera.targetTexture === null,
        };
        if (expectedLinear) {
            row.source = read(post.source);
            row.sourceInfo = post.source.info;
            check(`${name}: post source preserves linear HDR`, row.source.slice(0, 3), expectedLinear, 0.006);
            check(`${name}: source alpha`, [row.source[3]], [1], 0.001);
        }
        result.cases.push(row);
        return row;
    };
    Object.assign(result, { radiance, encodedRGBE: encoded, decodedRGB: decoded, expectedOrdinary: display });
    window.__hdrSkyboxStep = async (name) => {
        if (name === 'baseline') {
            await step();
            return readCase(name);
        }
        if (name === 'post-active') {
            post = createAirPostProcess(camera, {
                levels: 1,
                resolutionScale: 0.25,
                exposure: 1,
                toneMapping: 'aces',
                bloom: { enabled: false },
            });
            await step();
            return readCase(name, decoded);
        }
        if (name === 'ordinary-after-post') {
            ordinary.priority = 10;
            await step();
            return readCase(name, decoded);
        }
        if (name === 'post-disabled') {
            post.setEnabled(false);
            await step();
            check(`${name}: main target restored`, [Number(camera.targetTexture === null)], [1], 0);
            return readCase(name);
        }
        if (name === 'post-reenabled') {
            post.setEnabled(true);
            await step();
            return readCase(name, decoded);
        }
        if (name === 'linear-mesh-control') {
            referenceNode.active = true;
            camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
            await step();
            return readCase(name, radiance);
        }
        if (name === 'stock-sky-restored') {
            referenceNode.active = false;
            camera.clearFlags = Camera.ClearFlag.SKYBOX;
            await step();
            return readCase(name, decoded);
        }
        if (name === 'post-disposed') {
            post.dispose();
            await step();
            check(`${name}: main target restored`, [Number(camera.targetTexture === null)], [1], 0);
            check(`${name}: handle disposed`, [Number(post.info.disposed)], [1], 0);
            return readCase(name);
        }
        throw Error('Unknown case ' + name);
    };
    window.__hdrSkyboxFinish = () => {
        const gl = document.querySelector('canvas').getContext('webgl2');
        result.glError = gl.getError();
        check('WebGL has no error', [result.glError], [0], 0);
        if (post && !post.info.disposed) post.dispose();
        detachOrdinary();
        ordinaryTarget.dispose();
        referenceNode.destroy();
        mesh.destroy();
        material.destroy();
        EffectAsset.remove(effect);
        cube.destroy();
        clock.end();
        result.passed = result.checks.every((c) => c.pass) && result.errors.length === 0;
        result.state = 'completed';
        return result;
    };
    await step();
    result.state = 'ready';
} catch (error) {
    result.state = 'failed';
    result.failure = String(error.stack || error);
}
