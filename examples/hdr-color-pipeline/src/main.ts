import {
    createAirApp,
    createAirRenderTarget,
    validateAirTextureColorContract,
    validateAirPrefilteredEnvironment,
    bindAirPrefilteredEnvironment,
    inspectAirMaterial,
    Scene,
    Node,
    Camera,
    Color,
    Vec3,
    Vec4,
    Texture2D,
    TextureCube,
    ImageAsset,
    Mesh,
    MeshRenderer,
    Material,
    EffectAsset,
    utils,
    primitives,
    director,
    Director,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

type Target = ReturnType<typeof createAirRenderTarget>;
type Fixture = {
    source: string;
    faces: string[];
    levels: { size: number; roughness: number; offset: number; faceBytes: number }[];
    files: Record<string, { sha256: string; bytes: number }>;
};
const CAPTURE = 1 << 20,
    DISPLAY = 1 << 21;
const state = { exposure: 1, gain: 1, toneMap: true, prefiltered: true, rotation: 0, generation: 0, frames: 0 };
const colors = [
    [128, 90, 50, 255],
    [220, 160, 65, 255],
    [35, 110, 200, 255],
    [175, 75, 155, 255],
];
const decode = (value: number): number => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

async function main(): Promise<void> {
    const app = await createAirApp({ canvas: '#GameCanvas' });
    (window as any).__airApp = app;
    const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
    const scene = new Scene('HDR Color Pipeline');
    const fetchAsset = async (name: string): Promise<Response> => {
        const response = await fetch(new URL(name, document.baseURI));
        if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
        return response;
    };
    const [fixture, originalData, filteredData, colorDefinition, sourceDefinition, outputDefinition] =
        await Promise.all([
            fetchAsset('assets/environment.json').then((r) => r.json() as Promise<Fixture>),
            fetchAsset('assets/environment.bin').then((r) => r.arrayBuffer()),
            fetchAsset('assets/ggx-prefiltered.bin').then((r) => r.arrayBuffer()),
            fetchAsset('color-input.effect.json').then((r) => r.json()),
            fetchAsset('source.effect.json').then((r) => r.json()),
            fetchAsset('output.effect.json').then((r) => r.json()),
        ]);
    if (
        originalData.byteLength !== fixture.files['environment.bin'].bytes ||
        filteredData.byteLength !== fixture.files['ggx-prefiltered.bin'].bytes
    )
        throw new Error('environment byte range mismatch');
    let root: Node, camera: Camera, targets: { hdr: Target; ldr: Target };
    let effects: EffectAsset[] = [],
        materials: Material[] = [],
        meshes: Mesh[] = [],
        textures: (Texture2D | TextureCube)[] = [],
        images: ImageAsset[] = [];
    let detach: (() => void)[] = [],
        source: Material,
        outputs: Material[] = [],
        spheres: Node[] = [],
        environment: TextureCube,
        filtered: TextureCube;
    const labels: { node: Node; element: HTMLElement; height: number }[] = [];
    const metadata = {
        distribution: 'ggx' as const,
        roughnessLevels: fixture.levels.map((level) => level.roughness),
        encoding: 'rgbe' as const,
        source: fixture.source + '; offline generate-assets.mjs / native-rgbe-base1.1',
    };
    const roughnesses = [0.03, 1 / 6, 0.5, 5 / 6];
    function image(bytes: Uint8Array, width: number, height: number): ImageAsset {
        const value = new ImageAsset({
            width,
            height,
            _data: bytes,
            _compressed: false,
            format: Texture2D.PixelFormat.RGBA8888,
        });
        images.push(value);
        return value;
    }
    function cube(data: ArrayBuffer, baked: boolean): TextureCube {
        const value = new TextureCube();
        value.isRGBE = true;
        value.mipmaps = fixture.levels.map(
            (level) =>
                Object.fromEntries(
                    fixture.faces.map((face, index) => [
                        face,
                        image(
                            new Uint8Array(data, level.offset + index * level.faceBytes, level.faceBytes),
                            level.size,
                            level.size,
                        ),
                    ]),
                ) as any,
        );
        // Native public serialized enum: TextureCube MipmapMode.BAKED_CONVOLUTION_MAP = 2.
        // This flag is set only for the genuinely offline-convolved bytes, never ordinary source mips.
        if (baked) value._mipmapMode = 2;
        value.setFilters(TextureCube.Filter.LINEAR, TextureCube.Filter.LINEAR);
        value.setMipFilter(TextureCube.Filter.LINEAR);
        textures.push(value);
        return value;
    }
    function texture(hardware: boolean): Texture2D {
        const format = hardware ? Texture2D.PixelFormat.SRGBA8888 : Texture2D.PixelFormat.RGBA8888;
        validateAirTextureColorContract({ format, usage: 'color', decode: hardware ? 'hardware-srgb' : 'none' });
        const value = new Texture2D();
        value.reset({ width: 2, height: 2, format });
        const bytes = Uint8Array.from(
            colors.flatMap((rgba) =>
                hardware ? rgba : rgba.map((v, i) => (i === 3 ? v : Math.round(decode(v) * 255))),
            ),
        );
        value.uploadData(bytes);
        value.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
        value.setMipFilter(Texture2D.Filter.NONE);
        textures.push(value);
        return value;
    }
    function material(effect: EffectAsset): Material {
        const value = new Material();
        value.initialize({ effectAsset: effect });
        materials.push(value);
        return value;
    }
    function node(name: string, shape: Mesh, value: Material, x: number, y: number, layer = DISPLAY): Node {
        const object = new Node(name);
        root.addChild(object);
        object.layer = layer;
        object.setPosition(x, y, 0);
        const renderer = object.addComponent(MeshRenderer);
        renderer.mesh = shape;
        renderer.setSharedMaterial(value, 0);
        return object;
    }
    function label(object: Node, text: string, height: number): void {
        const element = document.createElement('span');
        element.textContent = text;
        element.className = 'caption';
        document.getElementById('captions')!.appendChild(element);
        labels.push({ node: object, element, height });
    }
    function cameraFor(name: string, mask: number, priority: number): Camera {
        const object = new Node(name);
        root.addChild(object);
        object.setPosition(0, 0, 12);
        object.lookAt(new Vec3());
        const value = object.addComponent(Camera);
        value.projection = Camera.ProjectionType.ORTHO;
        value.orthoHeight = 3.7;
        value.near = 0.1;
        value.far = 30;
        value.priority = priority;
        value.visibility = mask;
        value.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        value.clearColor = new Color(13, 17, 28, 255);
        return value;
    }
    function refresh(): void {
        source.setProperty('params', new Vec4(state.gain, 0, 0, 0));
        outputs.forEach((value) => value.setProperty('params', new Vec4(state.exposure, +state.toneMap, 0, 0)));
        if (state.prefiltered) bindAirPrefilteredEnvironment(scene, filtered, metadata);
        else scene.globals.skybox.reflectionMap = environment;
        camera.node.setRotationFromEuler(0, state.rotation, 0);
        document.getElementById('tone')!.textContent = `Tone map ${state.toneMap ? 'on' : 'off'}`;
        document.getElementById('environment')!.textContent = state.prefiltered
            ? 'GGX prefiltered'
            : 'Unfiltered control';
        (document.getElementById('exposure') as HTMLInputElement).value = String(state.exposure);
        (document.getElementById('gain') as HTMLInputElement).value = String(state.gain);
    }
    function create(): void {
        state.generation++;
        labels.length = 0;
        document.getElementById('captions')!.replaceChildren();
        root = new Node('Color Laboratory');
        scene.addChild(root);
        effects = [colorDefinition, sourceDefinition, outputDefinition].map((definition) => {
            const value = Object.assign(new EffectAsset(), JSON.parse(JSON.stringify(definition)));
            value.onLoaded();
            return value;
        });
        const quad = utils.createMesh(
            {
                positions: [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0],
                uvs: [0, 0, 1, 0, 0, 1, 1, 1],
                normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
                indices: [0, 1, 2, 1, 3, 2],
            },
            undefined,
            { calculateBounds: true },
        );
        const sphere = utils.createMesh(primitives.sphere(0.68, { segments: 48 }), undefined, {
            calculateBounds: true,
        });
        meshes.push(quad, sphere);
        const encoded = texture(true),
            linear = texture(false);
        [-3.25, 0, 3.25].forEach((x, index) => {
            const value = material(effects[0]);
            value.setProperty('colorMap', index === 1 ? linear : encoded);
            value.setProperty('params', new Vec4(index === 2 ? 2 : 0, 0, 0, 0));
            const object = node(
                ['sRGB hardware decode', 'Equivalent linear bytes', 'Double decode negative control'][index],
                quad,
                value,
                x,
                2.1,
            );
            object.setScale(1.3, 0.6, 1);
            label(
                object,
                ['sRGB → hardware decode', 'Equivalent linear → no decode', 'WRONG: hardware + shader decode'][index],
                0.85,
            );
        });
        targets = {
            hdr: createAirRenderTarget({
                name: 'HDR RGBA16F radiance',
                width: 192,
                height: 96,
                colorFormat: 'rgba16f',
                depthFormat: 'none',
                filter: 'nearest',
            }),
            ldr: createAirRenderTarget({
                name: 'RGBA8 clamped radiance',
                width: 192,
                height: 96,
                colorFormat: 'rgba8',
                depthFormat: 'none',
                filter: 'nearest',
            }),
        };
        source = material(effects[1]);
        node('Linear HDR radiance source', quad, source, 0, 0, CAPTURE);
        const hdrCamera = cameraFor('HDR Capture Camera', CAPTURE, -20),
            ldrCamera = cameraFor('LDR Capture Camera', CAPTURE, -10);
        detach.push(targets.hdr.attachCamera(hdrCamera), targets.ldr.attachCamera(ldrCamera));
        outputs = [-2.4, 2.4].map((x, index) => {
            const value = material(effects[2]),
                object = node(index ? 'LDR clamped display' : 'HDR tone mapped display', quad, value, x, 0.15);
            object.setScale(2.1, 0.65, 1);
            label(object, index ? 'RGBA8 clips first → same tone map' : 'RGBA16F preserves >1 → tone map → sRGB', 0.9);
            (index ? targets.ldr : targets.hdr).bindColor(value, 'radianceMap');
            return value;
        });
        scene.globals.skybox.useHDR = false; // Existing native PBR display path remains unchanged.
        environment = cube(originalData, false);
        filtered = cube(filteredData, true);
        validateAirPrefilteredEnvironment(filtered, metadata);
        scene.globals.skybox.envmap = environment;
        scene.globals.skybox.enabled = false;
        scene.globals.skybox.envLightingType = 1; // Native AUTOGEN_HEMISPHERE_DIFFUSE_WITH_REFLECTION.
        scene.globals.ambient.skyIllum = 0.8;
        spheres = roughnesses.map((roughness, index) => {
            const value = new Material();
            value.initialize({ effectName: 'builtin-standard' });
            value.setProperty('mainColor', new Color(255, 255, 255, 255));
            value.setProperty('metallic', 1);
            value.setProperty('roughness', roughness);
            materials.push(value);
            const object = node(`Native GGX sphere ${index}`, sphere, value, -3.3 + index * 2.2, -2.05);
            label(object, `Native PBR · roughness ${roughness.toFixed(3)}`, -1);
            return object;
        });
        camera = cameraFor('Main Camera', DISPLAY, 0);
        resize();
        refresh();
    }
    function resize(): void {
        camera.orthoHeight = Math.max(3.7, 5 / (canvas.clientWidth / canvas.clientHeight));
    }
    function release(): void {
        labels.forEach(({ element }) => element.remove());
        labels.length = 0;
        detach.splice(0).forEach((callback) => callback());
        targets.hdr.dispose();
        targets.ldr.dispose();
        scene.globals.skybox.reflectionMap = null;
        scene.globals.skybox.envmap = null;
        root.destroy();
        materials.forEach((value) => value.destroy());
        textures.forEach((value) => value.destroy());
        images.forEach((value) => value.destroy());
        meshes.forEach((value) => value.destroy());
        effects.forEach((value) => value.destroy());
        materials = [];
        textures = [];
        images = [];
        meshes = [];
        effects = [];
    }
    function held(): any[] {
        const hdr = targets.hdr,
            ldr = targets.ldr;
        return [
            { name: 'Scene root', ref: root },
            ...materials.map((ref) => ({ name: ref.name || 'Material', ref })),
            ...textures.map((ref) => ({ name: 'Native texture', ref })),
            ...images.map((ref) => ({ name: 'Native image', ref })),
            ...meshes.map((ref) => ({ name: 'Mesh', ref })),
            ...effects.map((ref) => ({ name: 'Effect', ref })),
            { name: 'HDR target', ref: hdr, released: () => hdr.info.disposed },
            { name: 'LDR target', ref: ldr, released: () => ldr.info.disposed },
        ];
    }
    create();
    app.run(scene);
    window.addEventListener('resize', resize);
    document.getElementById('exposure')!.addEventListener('input', (event) => {
        state.exposure = +(event.target as HTMLInputElement).value;
        refresh();
    });
    document.getElementById('gain')!.addEventListener('input', (event) => {
        state.gain = +(event.target as HTMLInputElement).value;
        refresh();
    });
    document.getElementById('tone')!.addEventListener('click', () => {
        state.toneMap = !state.toneMap;
        refresh();
    });
    document.getElementById('environment')!.addEventListener('click', () => {
        state.prefiltered = !state.prefiltered;
        refresh();
    });
    document.getElementById('reset')!.addEventListener('click', () => {
        Object.assign(state, { exposure: 1, gain: 1, toneMap: true, prefiltered: true, rotation: 0 });
        refresh();
    });
    director.on(Director.EVENT_AFTER_DRAW, () => {
        state.frames++;
        const rect = canvas.getBoundingClientRect();
        for (const entry of labels) {
            const point = camera.worldToScreen(
                new Vec3(entry.node.position.x, entry.node.position.y + entry.height, 0),
            );
            entry.element.style.left = `${rect.left + (point.x / canvas.width) * rect.width}px`;
            entry.element.style.top = `${rect.top + (1 - point.y / canvas.height) * rect.height}px`;
        }
        document.getElementById('status')!.textContent =
            `Native WebGL2 · HDR ${targets.hdr.info.effective.colorFormat} · 6 offline GGX levels · native RGBE base 1.1 · exposure ${state.exposure.toFixed(2)}`;
    });
    installAssetLifecycle({
        label: 'hdr-color-pipeline',
        hold: held,
        release,
        reacquire: async () => {
            create();
            return held();
        },
    });
    (window as any).__hdr = {
        targets: () => targets,
        spheres: () => spheres,
        materialStates: () => materials.map((value) => inspectAirMaterial(value)),
        sampleRadiance: () => ({
            hdr: Array.from(targets.hdr.readColor({ x: 120, y: 52, width: 1, height: 1 })),
            ldr: Array.from(targets.ldr.readColor({ x: 120, y: 52, width: 1, height: 1 })),
        }),
        setExposure: (value: number) => {
            if (!Number.isFinite(value) || value < 0.1 || value > 4) throw new Error('exposure must be 0.1..4');
            state.exposure = value;
            refresh();
        },
        setGain: (value: number) => {
            if (!Number.isFinite(value) || value < 0.2 || value > 2) throw new Error('gain must be 0.2..2');
            state.gain = value;
            refresh();
        },
        setPrefiltered: (value: boolean) => {
            state.prefiltered = value;
            refresh();
        },
        setToneMap: (value: boolean) => {
            state.toneMap = value;
            refresh();
        },
        sphereSamples: () =>
            spheres.map((object, index) => {
                const point = camera.worldToScreen(new Vec3(object.position.x, object.position.y, 0));
                return {
                    index,
                    roughness: roughnesses[index],
                    units: 'canvas-css',
                    x: (point.x / canvas.width) * canvas.clientWidth,
                    y: (1 - point.y / canvas.height) * canvas.clientHeight,
                };
            }),
        panelSamples: () =>
            [
                [-3.25, 2.1],
                [0, 2.1],
                [3.25, 2.1],
                [-2.4, 0.15],
                [2.4, 0.15],
            ].map(([x, y]) => {
                const points = [-0.4, 0.4].flatMap((offsetY) =>
                    [-0.7, 0.7].map((offsetX) => {
                        const point = camera.worldToScreen(new Vec3(x + offsetX, y + offsetY, 0));
                        return {
                            units: 'canvas-css',
                            x: (point.x / canvas.width) * canvas.clientWidth,
                            y: (1 - point.y / canvas.height) * canvas.clientHeight,
                        };
                    }),
                );
                return points;
            }),
    };
    (window as any).__probe = () => ({
        ...state,
        targets: { hdr: targets.hdr.info, ldr: targets.ldr.info },
        fixture: {
            source: fixture.source,
            files: fixture.files,
            levels: fixture.levels,
            encoding: 'native-rgbe-base1.1',
            samplesPerTexel: 512,
        },
        roughnesses,
        nativeIBL: scene.globals.skybox.useIBL,
        nativeRGBE: environment.isRGBE && filtered.isRGBE,
    });
    await new Promise<void>((resolve) => {
        const done = (): void => {
            if (state.frames < 3) return;
            director.off(Director.EVENT_AFTER_DRAW, done);
            resolve();
        };
        director.on(Director.EVENT_AFTER_DRAW, done);
    });
    (window as any).__appReady = true;
}
main().catch((error) => {
    (window as any).__appReady = false;
    (window as any).__hdrError = String(error);
    console.error(error);
    document.getElementById('status')!.textContent = String(error);
});
