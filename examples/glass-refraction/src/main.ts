import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Color,
    Vec3,
    Vec4,
    Material,
    MeshRenderer,
    DirectionalLight,
    SpotLight,
    AirTransmissionCapture,
    GLTFLoader,
    GLTFAsset,
    GLTFInstance,
    Component,
    utils,
    primitives,
    director,
    Director,
    game,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';
import { gemDocument } from './gem-gltf.js';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const stateLabel = document.querySelector('#state') as HTMLElement;
const palettes = [
    ['diamond', '#e8eef2', [0.93, 0.96, 1]],
    ['ruby', '#d6323f', [0.9, 0.06, 0.1]],
    ['emerald', '#23a96e', [0.07, 0.8, 0.3]],
    ['sapphire', '#2e5fd8', [0.08, 0.2, 0.95]],
    ['amber', '#e8a33d', [1, 0.48, 0.06]],
] as const;
let selectedColor = 'diamond',
    exportCount = 0,
    angle = 0,
    targetDistance = 10,
    zoom = false;
let zoomElapsed = 0.9,
    zoomFrom = 10;
const frameTimes: number[] = [];
let fps = 0;
// Readiness is independent of the externally verified behavior/pixel contract.
const sceneStatus = { id: 'glass-refraction', ready: false };
(window as any).__sceneReadyStatus = sceneStatus;

async function main(): Promise<void> {
    const app = await createAirApp({ canvas });
    (window as any).__airApp = app;
    const scene = new Scene('Optical studio');
    scene.globals.ambient.skyIllum = 8000;
    scene.globals.ambient.skyColor = new Vec4(105 / 255, 115 / 255, 135 / 255, 1);
    const cameraNode = new Node('Studio Camera');
    scene.addChild(cameraNode);
    const camera = cameraNode.addComponent(Camera);
    camera.fov = 38;
    camera.near = 0.1;
    camera.far = 100;
    camera.clearColor = new Color(9, 11, 17, 255);
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    function positionCamera(distance: number): void {
        cameraNode.setPosition(0, Math.sin(0.12) * distance, Math.cos(0.12) * distance);
        cameraNode.lookAt(Vec3.ZERO);
    }
    positionCamera(10);
    const ownedNodes: Node[] = [],
        ownedMaterials: Material[] = [],
        ownedMeshes: any[] = [];
    function object(name: string, geometry: any, color: Color, position: Vec3, scale: Vec3, lit = false): Node {
        const node = new Node(name);
        scene.addChild(node);
        node.setPosition(position);
        node.setScale(scale);
        const mesh = utils.createMesh(geometry);
        const material = new Material();
        material.initialize({ effectName: lit ? 'builtin-standard' : 'builtin-unlit' });
        if (lit) {
            material.setProperty('albedo', color);
            material.setProperty('pbrParams', new Vec4(1, 0.28, 0.7, 0.5));
        } else material.setProperty('mainColor', color);
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = mesh;
        renderer.material = material;
        ownedNodes.push(node);
        ownedMaterials.push(material);
        ownedMeshes.push(mesh);
        return node;
    }
    object('Studio backdrop', primitives.quad(), new Color(17, 21, 30, 255), new Vec3(0, 0, -4), new Vec3(18, 11, 1));
    for (let i = -8; i <= 8; i++)
        object(
            `Background stripe ${i}`,
            primitives.quad(),
            new Color(i % 3 === 0 ? 205 : 105, i % 3 === 0 ? 211 : 116, i % 3 === 0 ? 225 : 133, 255),
            new Vec3(i * 0.48, 0, -3.95),
            new Vec3(0.06, 9, 1),
        );
    object(
        'Turntable',
        primitives.cylinder(1.6, 1.85, 0.45, { radialSegments: 48 }),
        new Color(30, 33, 43, 255),
        new Vec3(0, -1.45, 0),
        new Vec3(1, 1, 1),
        true,
    );
    object(
        'Metal rim',
        primitives.cylinder(1.65, 1.65, 0.06, { radialSegments: 48 }),
        new Color(170, 140, 83, 255),
        new Vec3(0, -1.2, 0),
        new Vec3(1, 1, 1),
        true,
    );
    for (const [name, position, color, luminance] of [
        ['Key', new Vec3(-4, 5, 5), new Color(255, 239, 214, 255), 90000],
        ['Fill', new Vec3(4, 2, 3), new Color(166, 201, 255, 255), 50000],
        ['Rim', new Vec3(0, 4, -3), new Color(238, 222, 255, 255), 110000],
    ] as const) {
        const node = new Node(`${name} light`);
        scene.addChild(node);
        node.setPosition(position);
        node.lookAt(Vec3.ZERO);
        const light = node.addComponent(SpotLight);
        light.color = color;
        light.range = 30;
        light.spotAngle = 70;
        light.luminance = luminance;
    }
    app.run(scene);
    let asset: GLTFAsset,
        instance: GLTFInstance,
        material: Material,
        capture: AirTransmissionCapture,
        captureNode: Node;
    const generated = gemDocument();
    async function acquire(): Promise<void> {
        captureNode = new Node('Scene color capture');
        scene.addChild(captureNode);
        capture = captureNode.addComponent(AirTransmissionCapture);
        capture.mainCamera = camera;
        asset = await new GLTFLoader().parseAsync(generated.json);
        asset.addRef();
        instance = asset.instantiate();
        scene.addChild(instance.root);
        const rendererMaterial = instance.root.getComponentsInChildren(MeshRenderer)[0].getMaterialInstance(0);
        if (!rendererMaterial) throw new Error('Gemstone has no material instance');
        material = rendererMaterial;
    }
    await acquire();
    const uniform = (): Vec4 =>
        material.passes[0].getUniform(material.passes[0].getHandle('airTransmission'), new Vec4());
    function chooseColor(name: string): void {
        const palette = palettes.find((value) => value[0] === name)!;
        selectedColor = name;
        material.setProperty('airAttenuation', new Vec4(...palette[2], 3.4));
        document
            .querySelectorAll('#swatches button')
            .forEach((button) =>
                button.setAttribute('aria-pressed', String((button as HTMLElement).dataset.color === name)),
            );
    }
    for (const [i, palette] of palettes.entries()) {
        const button = document.createElement('button');
        button.dataset.bench = `swatch-${i + 1}`;
        button.dataset.color = palette[0];
        button.setAttribute('aria-label', palette[0]);
        button.style.setProperty('--color', palette[1]);
        button.addEventListener('click', () => chooseColor(palette[0]));
        document.querySelector('#swatches')!.appendChild(button);
    }
    for (const [name, index] of [
        ['ior', 1],
        ['transmission', 0],
        ['dispersion', 3],
    ] as const) {
        document.querySelector(`[aria-label="${name}"]`)!.addEventListener('input', (event) => {
            const value = uniform();
            value[['x', 'y', 'z', 'w'][index] as 'x'] = Number((event.target as HTMLInputElement).value);
            material.setProperty('airTransmission', value);
            if (name === 'ior') {
                const physical = material.passes[0].getUniform(
                    material.passes[0].getHandle('airPhysicalParams'),
                    new Vec4(),
                );
                physical.y = Math.pow((value.y - 1) / (value.y + 1), 2) / 0.04;
                material.setProperty('airPhysicalParams', physical);
            }
        });
    }
    canvas.addEventListener(
        'dblclick',
        () => {
            zoom = !zoom;
            zoomFrom = Vec3.len(cameraNode.position);
            zoomElapsed = 0;
            targetDistance = zoom ? 5.5 : 10;
        },
        { capture: true },
    );
    class Turntable extends Component {
        update(dt: number): void {
            angle += dt * 30;
            if (instance?.root.isValid) instance.root.setRotationFromEuler(0, angle, 0);
            zoomElapsed = Math.min(0.9, zoomElapsed + dt);
            const progress = zoomElapsed / 0.9;
            const eased = progress * progress * (3 - 2 * progress);
            positionCamera(zoomFrom + (targetDistance - zoomFrom) * eased);
        }
    }
    cameraNode.addComponent(Turntable);
    function reset(): void {
        selectedColor = 'diamond';
        exportCount = 0;
        angle = 0;
        zoom = false;
        targetDistance = 10;
        zoomFrom = 10;
        zoomElapsed = 0.9;
        positionCamera(10);
        instance.root.setRotationFromEuler(0, 0, 0);
        chooseColor('diamond');
        material.setProperty('airTransmission', new Vec4(0.95, 2.1, 3, 7));
        const physical = material.passes[0].getUniform(material.passes[0].getHandle('airPhysicalParams'), new Vec4());
        physical.y = Math.pow((2.1 - 1) / (2.1 + 1), 2) / 0.04;
        material.setProperty('airPhysicalParams', physical);
        for (const [name, value] of [
            ['ior', '2.1'],
            ['transmission', '0.95'],
            ['dispersion', '7'],
        ])
            (document.querySelector(`[aria-label="${name}"]`) as HTMLInputElement).value = value;
    }
    function exportPNG(): Promise<void> {
        return new Promise((resolve, reject) => {
            const draw = (): void => {
                director.off(Director.EVENT_AFTER_DRAW, draw);
                try {
                    const copy = document.createElement('canvas');
                    copy.width = canvas.width;
                    copy.height = canvas.height;
                    copy.getContext('2d')!.drawImage(canvas, 0, 0);
                    copy.toBlob((blob) => {
                        if (!blob) {
                            reject(new Error('PNG encoding failed'));
                            return;
                        }
                        const url = URL.createObjectURL(blob);
                        const anchor = document.createElement('a');
                        anchor.href = url;
                        anchor.download = `cocos-air-${selectedColor}-${exportCount + 1}.png`;
                        anchor.click();
                        ++exportCount;
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                        resolve();
                    }, 'image/png');
                } catch (error) {
                    reject(error);
                }
            };
            director.on(Director.EVENT_AFTER_DRAW, draw);
        });
    }
    document
        .querySelector('[data-bench="export-png"]')!
        .addEventListener('click', () => exportPNG().catch(console.error));
    document.querySelector('[data-bench="reset"]')!.addEventListener('click', reset);
    (window as any).__bench = {
        getState: () => ({
            rotationAngle: angle,
            selectedColor,
            cameraDistance: Vec3.len(cameraNode.position),
            exportCount,
            faceCount: generated.faceCount,
            transmission: uniform().x,
            ior: uniform().y,
            thickness: uniform().z,
            dispersion: uniform().w,
            captureBound: !!material.getProperty('cc_sceneColorTex'),
            nativeRotation: instance.root.eulerAngles.y,
            fps,
            fpsSource: 'real-render-loop-2s; not GPU or display-present',
        }),
        reset,
    };
    (window as any).__glassNative = {
        cameraNode,
        renderer: () => instance.root.getComponentsInChildren(MeshRenderer)[0],
        material: () => material,
        capture: () => capture,
    };
    director.on(Director.EVENT_AFTER_DRAW, () => {
        if (!game.isPaused()) {
            const now = performance.now();
            frameTimes.push(now);
            while (frameTimes.length && frameTimes[0] < now - 2000) frameTimes.shift();
            if (frameTimes.length > 1) fps = ((frameTimes.length - 1) * 1000) / (frameTimes.at(-1)! - frameTimes[0]);
        }
        stateLabel.textContent = `${selectedColor.toUpperCase()} · ${generated.faceCount} FACETS · ${Vec3.len(cameraNode.position).toFixed(1)} RANGE · ${exportCount} EXPORTS`;
        if (material.getProperty('cc_sceneColorTex')) {
            sceneStatus.ready = true;
            if (!(window as any).__appReady) (window as any).__appReadyAtMs = performance.now();
            (window as any).__appReady = true;
        }
    });
    chooseColor('diamond');
    const held = (): { name: string; ref: object }[] => [
        { name: 'gem-asset', ref: asset },
        { name: 'gem-root', ref: instance.root },
        { name: 'gem-mesh', ref: asset.meshes[0] },
        { name: 'gem-material', ref: asset.materials[0] },
        { name: 'capture-texture', ref: capture.sceneColor! },
    ];
    installAssetLifecycle({
        label: 'glass-refraction',
        hold: held,
        release: () => {
            captureNode.destroy();
            instance.dispose();
            asset.destroy();
            asset.decRef(false);
        },
        reacquire: async () => {
            await acquire();
            reset();
            return held();
        },
    });
}
main().catch((error) => {
    (window as any).__exampleError = String(error);
    console.error(error);
});
