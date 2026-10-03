import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Color,
    Vec3,
    Vec4,
    Material,
    EffectAsset,
    MeshRenderer,
    DirectionalLight,
    Texture2D,
    GLTFLoader,
    AirTransmissionCapture,
    primitives,
    utils,
    director,
    Director,
    game,
} from 'cocosair';

const probe = { done: false, checks: [], frames: [], errors: [] };
window.__transmissionChannelProbe = probe;
const check = (name, ok, detail) => probe.checks.push({ name, ok: Boolean(ok), detail });

function documentForSphere() {
    const geometry = primitives.sphere(1, { segments: 24 });
    const attributes = [
        new Float32Array(geometry.positions),
        new Float32Array(geometry.normals),
        new Float32Array(geometry.uvs),
    ];
    const indices = new Uint16Array(geometry.indices);
    const length = attributes.reduce((size, data) => size + data.byteLength, 0) + indices.byteLength;
    const bytes = new Uint8Array(length);
    const views = [];
    let offset = 0;
    for (const data of [...attributes, indices]) {
        bytes.set(new Uint8Array(data.buffer), offset);
        views.push({ buffer: 0, byteOffset: offset, byteLength: data.byteLength });
        offset += data.byteLength;
    }
    let binary = '';
    for (const value of bytes) binary += String.fromCharCode(value);
    return JSON.stringify({
        asset: { version: '2.0' },
        extensionsUsed: ['KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_ior'],
        buffers: [{ byteLength: length, uri: `data:application/octet-stream;base64,${btoa(binary)}` }],
        bufferViews: views,
        accessors: [
            {
                bufferView: 0,
                type: 'VEC3',
                componentType: 5126,
                count: attributes[0].length / 3,
                min: [-1, -1, -1],
                max: [1, 1, 1],
            },
            { bufferView: 1, type: 'VEC3', componentType: 5126, count: attributes[1].length / 3 },
            { bufferView: 2, type: 'VEC2', componentType: 5126, count: attributes[2].length / 2 },
            { bufferView: 3, type: 'SCALAR', componentType: 5123, count: indices.length },
        ],
        materials: [
            {
                name: 'channel-test-glass',
                alphaMode: 'BLEND',
                pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.08 },
                extensions: {
                    KHR_materials_transmission: { transmissionFactor: 1 },
                    KHR_materials_volume: {
                        thicknessFactor: 3,
                        attenuationColor: [0.35, 0.85, 0.55],
                        attenuationDistance: 1,
                    },
                    KHR_materials_ior: { ior: 2.4 },
                },
            },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
        nodes: [{ name: 'Channel sphere', mesh: 0 }],
        scenes: [{ nodes: [0] }],
        scene: 0,
    });
}

const frame = () =>
    new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            director.off(Director.EVENT_AFTER_DRAW, done);
            reject(new Error('render timeout'));
        }, 8000);
        function done() {
            clearTimeout(timeout);
            director.off(Director.EVENT_AFTER_DRAW, done);
            resolve();
        }
        director.on(Director.EVENT_AFTER_DRAW, done);
    });
const compare = (a, b) => {
    let changedPixels = 0,
        absoluteDifference = 0,
        maximumChannelDifference = 0;
    for (let i = 0; i < a.length; i += 4) {
        let difference = 0;
        for (let c = 0; c < 3; c++) {
            const channelDifference = Math.abs(a[i + c] - b[i + c]);
            difference += channelDifference;
            maximumChannelDifference = Math.max(maximumChannelDifference, channelDifference);
        }
        absoluteDifference += difference;
        if (difference > 12) changedPixels++;
    }
    return { changedPixels, absoluteDifference, maximumChannelDifference };
};
// Native framebuffer quantization may move an edge by one RGB LSB. Keep raw
// differences and require that every channel stays within that single LSB.
const invariant = (metric) => metric.changedPixels === 0 && metric.maximumChannelDifference <= 1;

async function main() {
    const app = await createAirApp({ canvas: '#GameCanvas' });
    window.__airApp = app;
    const scene = new Scene('independent texture channels');
    scene.globals.ambient.skyIllum = 10000;
    const cameraNode = new Node('Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(0, 0, 5);
    cameraNode.lookAt(Vec3.ZERO);
    const camera = cameraNode.addComponent(Camera);
    camera.fov = 36;
    camera.near = 0.1;
    camera.far = 30;
    camera.clearColor = new Color(4, 7, 12, 255);
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    const lightNode = new Node('Light');
    scene.addChild(lightNode);
    lightNode.setRotationFromEuler(-25, -20, 0);
    lightNode.addComponent(DirectionalLight).illuminance = 40000;
    const plane = utils.createMesh(primitives.quad());
    const colors = [new Color(230, 220, 210, 255), new Color(18, 35, 70, 255)];
    const materials = colors.map((color) => {
        const material = new Material();
        material.initialize({ effectName: 'builtin-unlit' });
        material.setProperty('mainColor', color);
        return material;
    });
    for (let y = -4; y <= 4; y++)
        for (let x = -5; x <= 5; x++) {
            const node = new Node(`checker-${x}-${y}`);
            scene.addChild(node);
            node.setPosition(x * 0.55, y * 0.55, -2);
            node.setScale(0.55, 0.55, 1);
            const renderer = node.addComponent(MeshRenderer);
            renderer.mesh = plane;
            renderer.material = materials[(x + y + 20) % 2];
        }
    app.run(scene);
    const captureNode = new Node('Capture');
    scene.addChild(captureNode);
    const capture = captureNode.addComponent(AirTransmissionCapture);
    capture.mainCamera = camera;
    const fixture = documentForSphere();
    const asset = await new GLTFLoader().parseAsync(fixture);
    asset.addRef();
    const instance = asset.instantiate();
    scene.addChild(instance.root);
    const renderer = instance.root.getComponentsInChildren(MeshRenderer)[0],
        material = renderer.getMaterialInstance(0);
    material.recompileShaders({
        USE_AIR_TRANSMISSION_MAP: true,
        USE_AIR_VOLUME_THICKNESS_MAP: true,
        TRANSMISSION_UV: 'v_uv',
        VOLUMETHICKNESS_UV: 'v_uv',
    });
    const texture = () => {
        const value = new Texture2D();
        value.reset({ width: 1, height: 1, format: Texture2D.PixelFormat.RGBA8888 });
        value.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
        value.uploadData(new Uint8Array([255, 255, 0, 255]));
        return value;
    };
    const transmission = texture(),
        thickness = texture();
    material.setProperty('transmissionMap', transmission);
    material.setProperty('volumeThicknessMap', thickness);
    material.setProperty('airTransmission', new Vec4(1, 2.4, 3, 0));
    for (let i = 0; i < 4; i++) await frame();
    check(
        'native captured background is bound',
        !!material.getProperty('cc_sceneColorTex') && capture.sceneColor.width > 1,
        capture.sceneColor.width,
    );
    const gl = director.root.device.gl;
    game.pause();
    director.pause();
    gl.disable(gl.DITHER);
    const read = (r, g, slot) => {
        const value = slot === 'transmission' ? transmission : thickness;
        value.uploadData(new Uint8Array([r, g, 0, 255]));
        for (let i = 0; i < 3; i++) game.step();
        const bytes = new Uint8Array(game.canvas.width * game.canvas.height * 4);
        gl.readPixels(0, 0, game.canvas.width, game.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        probe.frames.push({ slot, rgba: [r, g, 0, 255], pixelSum: bytes.reduce((sum, value) => sum + value, 0) });
        return bytes;
    };
    const t00 = read(0, 0, 'transmission'),
        t01 = read(0, 255, 'transmission'),
        t10 = read(255, 0, 'transmission'),
        t11 = read(255, 255, 'transmission');
    const transmissionMetrics = {
        unusedGWhenR0: compare(t00, t01),
        unusedGWhenR1: compare(t10, t11),
        requiredRWhenG0: compare(t00, t10),
        requiredRWhenG1: compare(t01, t11),
    };
    check(
        'transmission ignores G with R=0',
        invariant(transmissionMetrics.unusedGWhenR0),
        transmissionMetrics.unusedGWhenR0,
    );
    check(
        'transmission ignores G with R=1',
        invariant(transmissionMetrics.unusedGWhenR1),
        transmissionMetrics.unusedGWhenR1,
    );
    check(
        'transmission responds to R with G=0 (reject G-only and R*G)',
        transmissionMetrics.requiredRWhenG0.changedPixels >= 50 &&
            transmissionMetrics.requiredRWhenG0.absoluteDifference >= 1000,
        transmissionMetrics.requiredRWhenG0,
    );
    check(
        'transmission responds to R with G=1',
        transmissionMetrics.requiredRWhenG1.changedPixels >= 50 &&
            transmissionMetrics.requiredRWhenG1.absoluteDifference >= 1000,
        transmissionMetrics.requiredRWhenG1,
    );
    const v00 = read(0, 0, 'thickness'),
        v10 = read(255, 0, 'thickness'),
        v01 = read(0, 255, 'thickness'),
        v11 = read(255, 255, 'thickness');
    const thicknessMetrics = {
        unusedRWhenG0: compare(v00, v10),
        unusedRWhenG1: compare(v01, v11),
        requiredGWhenR0: compare(v00, v01),
        requiredGWhenR1: compare(v10, v11),
    };
    check('thickness ignores R with G=0', invariant(thicknessMetrics.unusedRWhenG0), thicknessMetrics.unusedRWhenG0);
    check('thickness ignores R with G=1', invariant(thicknessMetrics.unusedRWhenG1), thicknessMetrics.unusedRWhenG1);
    check(
        'thickness responds to G with R=0 (reject R-only and R*G)',
        thicknessMetrics.requiredGWhenR0.changedPixels >= 50 &&
            thicknessMetrics.requiredGWhenR0.absoluteDifference >= 1000,
        thicknessMetrics.requiredGWhenR0,
    );
    check(
        'thickness responds to G with R=1',
        thicknessMetrics.requiredGWhenR1.changedPixels >= 50 &&
            thicknessMetrics.requiredGWhenR1.absoluteDifference >= 1000,
        thicknessMetrics.requiredGWhenR1,
    );
    const actualShader = renderer.model.subModels[0].shaders[0],
        program = actualShader.gpuShader.glProgram;
    check(
        'both samplers are active in actual shader',
        gl.getUniformLocation(program, 'transmissionMap') !== null &&
            gl.getUniformLocation(program, 'volumeThicknessMap') !== null,
    );
    check('no WebGL error', gl.getError() === 0);
    probe.transmission = transmissionMetrics;
    probe.thickness = thicknessMetrics;
    probe.fixture = JSON.parse(fixture);
    probe.fixtureBytes = fixture.length;
    probe.counterexamples = {
        GOnlyTransmissionRejected:
            transmissionMetrics.requiredRWhenG0.changedPixels >= 50 && invariant(transmissionMetrics.unusedGWhenR0),
        ROnlyThicknessRejected:
            thicknessMetrics.requiredGWhenR0.changedPixels >= 50 && invariant(thicknessMetrics.unusedRWhenG0),
    };
    // Clone only this probe's effect for rendered negative controls. The SDK
    // and original native effect stay frozen. Wrong channel shaders must fail
    // the same invariance assertions, not merely a source-text comparison.
    probe.negativeControls = [];
    const nativeEffect = material.effectAsset;
    const nativeDefines = { ...material.passes[0].defines };
    const nativeBlend = JSON.parse(JSON.stringify(material.passes[0].blendState));
    const nativePass = material.passes[0];
    const constantNames = nativeEffect.shaders[0].blocks
        .find((block) => block.name === 'Constants')
        .members.map((member) => member.name);
    const nativeProperties = Object.fromEntries(
        constantNames.map((name) => [name, nativePass.getUniform(nativePass.getHandle(name), new Vec4())]),
    );
    nativeProperties.transmissionMap = transmission;
    nativeProperties.volumeThicknessMap = thickness;
    nativeProperties.cc_sceneColorTex = capture.sceneColor;
    for (const [name, pattern, replacement] of [
        ['transmission-G-only', /(airTrFactorTex\s*\*=[^;]+)\.r;/g, '$1.g;'],
        ['thickness-R-only', /(airThickTex\s*\*=[^;]+)\.g;/g, '$1.r;'],
    ]) {
        const effect = new EffectAsset();
        effect.name = `channel-negative-${name}`;
        effect.shaders = JSON.parse(JSON.stringify(nativeEffect.shaders));
        effect.techniques = JSON.parse(JSON.stringify(nativeEffect.techniques));
        effect.combinations = JSON.parse(JSON.stringify(nativeEffect.combinations));
        let replacements = 0;
        for (const shader of effect.shaders) {
            const previous = shader.name;
            shader.name = `${effect.name}|${previous}`;
            shader.hash = (shader.hash ^ (name === 'transmission-G-only' ? 0x6a310 : 0x6a320)) >>> 0;
            for (const technique of effect.techniques)
                for (const pass of technique.passes) if (pass.program === previous) pass.program = shader.name;
            for (const language of ['glsl3', 'glsl4']) {
                const before = shader[language].frag;
                const after = before.replace(pattern, replacement);
                if (after !== before) ++replacements;
                shader[language].frag = after;
            }
        }
        effect.onLoaded();
        const negative = new Material();
        negative.initialize({
            effectAsset: effect,
            defines: nativeDefines,
            states: {
                depthStencilState: { depthTest: true, depthWrite: false },
                blendState: nativeBlend,
            },
        });
        for (const [property, value] of Object.entries(nativeProperties)) {
            if (value !== null) negative.setProperty(property, value);
        }
        renderer.setSharedMaterial(negative, 0);
        const negativeShader = renderer.model.subModels[0].shaders[0];
        const samplerActive =
            gl.getUniformLocation(
                negativeShader.gpuShader.glProgram,
                name === 'transmission-G-only' ? 'transmissionMap' : 'volumeThicknessMap',
            ) !== null;
        transmission.uploadData(new Uint8Array([255, 0, 0, 255]));
        thickness.uploadData(new Uint8Array([255, 255, 0, 255]));
        const slot = name === 'transmission-G-only' ? 'transmission' : 'thickness';
        const first = read(0, 0, slot),
            wrong = read(name === 'transmission-G-only' ? 0 : 255, name === 'transmission-G-only' ? 255 : 0, slot);
        const invalidDifference = compare(first, wrong);
        const rejected =
            replacements > 0 && invalidDifference.changedPixels >= 50 && invalidDifference.absoluteDifference >= 1000;
        probe.negativeControls.push({
            name,
            replacements,
            originalInvarianceWouldPass: invariant(invalidDifference),
            rejected: rejected && samplerActive,
            invalidDifference,
        });
        check(`rendered ${name} negative control is rejected`, rejected && samplerActive, invalidDifference);
    }
    probe.done = true;
    probe.ok = probe.checks.length === 13 && probe.checks.every((value) => value.ok);
}
main().catch((error) => {
    probe.errors.push(error.stack || String(error));
    probe.ok = false;
    probe.done = true;
    console.error(error);
});
