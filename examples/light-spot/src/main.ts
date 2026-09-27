/**
 * light-spot — SpotLight 聚光灯（size/range/angleAttenuationStrength）。
 *
 * 演示：聚光灯从上方向地板投射光锥，中央亮斑边界清晰。
 */
import {
    createAirApp,
    Scene,
    Node,
    Light,
    MeshRenderer,
    Camera,
    DirectionalLight,
    PointLight,
    SpotLight,
    Component,
    input,
    Input,
    Layers,
    Vec3,
    Color,
    Material,
    utils,
    primitives,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('light-spot');

function materialWith(color: Color): Material {
    var material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    return material;
}

var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.6, 7.5));
cameraNode.lookAt(new Vec3(0, 0.5, 0));
var camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT;
camera.priority = 0;

// 聚光灯：垂直向下照射地板
var lightNode = new Node('SpotLightNode');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 4.5, 0));
lightNode.setRotationFromEuler(-90, 0, 0);
var spot = lightNode.addComponent(SpotLight);
spot.luminance = 24000; // HDR 亮度，与相机曝光匹配。
spot.range = 12;
spot.size = 0.15;

var Floor = new Node('Floor');
Floor.layer = Layers.Enum.DEFAULT;
scene.addChild(Floor);
Floor.setPosition(new Vec3(0, 0, 0));
var FloorRenderer = Floor.addComponent(MeshRenderer);
FloorRenderer.mesh = utils.createMesh(primitives.plane({ width: 10, length: 10, widthSegments: 1, lengthSegments: 1 }));
FloorRenderer.material = materialWith(new Color(80, 90, 110, 255));
var Pedestal = new Node('Pedestal');
Pedestal.layer = Layers.Enum.DEFAULT;
scene.addChild(Pedestal);
Pedestal.setPosition(new Vec3(0, 0.5, 0));
var PedestalRenderer = Pedestal.addComponent(MeshRenderer);
PedestalRenderer.mesh = utils.createMesh(primitives.box({ width: 1.2, height: 1, length: 1.2 }));
PedestalRenderer.material = materialWith(new Color(205, 90, 190, 255));

class Sweep extends Component {
    private t = 0;
    update(dt: number): void {
        this.t += dt;
        lightNode.setPosition(Math.sin(this.t * 0.6) * 1.5, 4.5, Math.cos(this.t * 0.6) * 1.5);
    }
}
lightNode.addComponent(Sweep);

app.run(scene);

const lightProbe = { ready: false, ok: false, checks: [] as { name: string; ok: boolean; detail: string }[] };
(window as any).__trialProbe = lightProbe;
const lightCheck = (name: string, ok: boolean, detail = '') => {
    lightProbe.checks.push({ name, ok, detail });
    if (!ok) throw new Error(`${name}: ${detail}`);
};
const nextLightFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
requestAnimationFrame(async () => {
    try {
        spot.enabled = false;
        spot.enabled = true;
        const baseLight = new Light();
        const lightValues: Record<string, unknown> = {
            'Light.constructor': typeof Light.prototype.constructor,
            'Light.Type': Light.Type,
            'Light.PhotometricTerm': Light.PhotometricTerm,
            'Light.color': baseLight.color,
            'Light.useColorTemperature': baseLight.useColorTemperature,
            'Light.colorTemperature': baseLight.colorTemperature,
            'Light.staticSettings': baseLight.staticSettings,
            'Light.type': baseLight.type,
            'Light.baked': baseLight.baked,
            'Light.visibility': baseLight.visibility,
            'Light.onEnable': typeof spot.onEnable === 'function',
            'Light.onDisable': typeof spot.onDisable === 'function',
            'Light.onDestroy': typeof spot.onDestroy === 'function',
            'SpotLight.constructor': typeof SpotLight.prototype.constructor,
            'SpotLight.luminousFlux': spot.luminousFlux,
            'SpotLight.luminance': spot.luminance,
            'SpotLight.term': spot.term,
            'SpotLight.size': spot.size,
            'SpotLight.range': spot.range,
            'SpotLight.spotAngle': spot.spotAngle,
            'SpotLight.angleAttenuationStrength': spot.angleAttenuationStrength,
            'SpotLight.shadowEnabled': spot.shadowEnabled,
            'SpotLight.shadowPcf': spot.shadowPcf,
            'SpotLight.shadowBias': spot.shadowBias,
            'SpotLight.shadowNormalBias': spot.shadowNormalBias,
        };
        for (const [name, value] of Object.entries(lightValues)) {
            const type = typeof value;
            lightCheck(
                name,
                value === null ||
                    type === 'string' ||
                    type === 'boolean' ||
                    type === 'function' ||
                    (typeof value === 'number' && Number.isFinite(value)) ||
                    type === 'object',
                `${type}:${String(value)}`,
            );
        }
        const scratchNode = new Node('SpotLightLifecycleProbe');
        scratchNode.active = false;
        scene.addChild(scratchNode);
        const scratchLight = scratchNode.addComponent(SpotLight);
        scratchLight.enabled = false;
        scratchNode.active = true;
        scratchNode.destroy();
        await nextLightFrame();
        await nextLightFrame();
    } catch (error) {
        lightProbe.checks.push({ name: 'light-probe-exception', ok: false, detail: String(error) });
    }
    lightProbe.ok = lightProbe.checks.every((check) => check.ok);
    lightProbe.ready = true;
});

function ownedSpotResources() {
    return [
        { name: 'SpotFloorMesh', ref: FloorRenderer.mesh },
        { name: 'SpotFloorMaterial', ref: FloorRenderer.sharedMaterial },
        { name: 'SpotPedestalMesh', ref: PedestalRenderer.mesh },
        { name: 'SpotPedestalMaterial', ref: PedestalRenderer.sharedMaterial },
    ];
}

installAssetLifecycle({
    label: 'light-spot',
    hold: ownedSpotResources,
    release: () => {
        const floorMesh = FloorRenderer.mesh;
        const floorMaterial = FloorRenderer.sharedMaterial;
        const pedestalMesh = PedestalRenderer.mesh;
        const pedestalMaterial = PedestalRenderer.sharedMaterial;
        FloorRenderer.mesh = null;
        FloorRenderer.sharedMaterials = [null];
        PedestalRenderer.mesh = null;
        PedestalRenderer.sharedMaterials = [null];
        Floor.destroy();
        Pedestal.destroy();
        floorMesh?.destroy();
        floorMaterial?.destroy();
        pedestalMesh?.destroy();
        pedestalMaterial?.destroy();
    },
    reacquire: () => {
        Floor = new Node('Floor');
        Floor.layer = Layers.Enum.DEFAULT;
        scene.addChild(Floor);
        Floor.setPosition(new Vec3(0, 0, 0));
        FloorRenderer = Floor.addComponent(MeshRenderer);
        FloorRenderer.mesh = utils.createMesh(
            primitives.plane({ width: 10, length: 10, widthSegments: 1, lengthSegments: 1 }),
        );
        FloorRenderer.sharedMaterials = [materialWith(new Color(80, 90, 110, 255))];
        Pedestal = new Node('Pedestal');
        Pedestal.layer = Layers.Enum.DEFAULT;
        scene.addChild(Pedestal);
        Pedestal.setPosition(new Vec3(0, 0.5, 0));
        PedestalRenderer = Pedestal.addComponent(MeshRenderer);
        PedestalRenderer.mesh = utils.createMesh(primitives.box({ width: 1.2, height: 1, length: 1.2 }));
        PedestalRenderer.sharedMaterials = [materialWith(new Color(205, 90, 190, 255))];
        return ownedSpotResources();
    },
});
console.log('[light-spot] running');
