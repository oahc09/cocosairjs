/**
 * texture-basic — 程序化 checkerboard → ImageAsset → Texture2D → 材质 mainTexture。
 *
 * 演示：不依赖任何图片文件，用像素数据构建贴图并接到标准材质上；
 * 并按 §25 提交资源 Lifecycle Contract（销毁全部自建资源 → 重建 → 画面恢复）。
 */

import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    DirectionalLight,
    Component,
    Layers,
    Vec3,
    Color,
    Material,
    Texture2D,
    TextureCube,
    ImageAsset,
    gfx,
    utils,
    primitives,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('texture-basic');

// 1) 程序化 checkerboard 像素数据（8×8 棋盘格，64×64 分辨率）
var SIZE = 64;
function checkerboardPixels(): Uint8Array {
    var pixels = new Uint8Array(SIZE * SIZE * 4);
    for (var y = 0; y < SIZE; y++) {
        for (var x = 0; x < SIZE; x++) {
            var i = (SIZE * y + x) * 4;
            var bright = ((x >> 3) + (y >> 3)) % 2 === 0;
            var v = bright ? 235 : 45;
            pixels[i] = v;
            pixels[i + 1] = v;
            pixels[i + 2] = v;
            pixels[i + 3] = 255;
        }
    }
    return pixels;
}

var imageAsset: any;
var texture: any;
var cubeTexture: any;
var defaultCube: any;
var resetProbeCube: any;
var material: any;
var mesh: any;
var texturedCube: any;

class Spin extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 35, 0);
    }
}

/** 本示例持有的全部自建资源。 */
function owned(): any[] {
    return [
        { name: 'ImageAsset', ref: imageAsset },
        { name: 'Texture2D', ref: texture },
        { name: 'TextureCube', ref: cubeTexture },
        { name: 'TextureCubeDefault', ref: defaultCube },
        { name: 'TextureCubeResetProbe', ref: resetProbeCube },
        { name: 'Material', ref: material },
        { name: 'Mesh', ref: mesh },
        { name: 'TexturedCube', ref: texturedCube },
    ];
}

/** 2) ImageAsset → Texture2D → 3) 标准材质 + USE_ALBEDO_MAP define + mainTexture → 立方体。 */
function acquire(): any[] {
    imageAsset = new ImageAsset({
        width: SIZE,
        height: SIZE,
        _data: checkerboardPixels(),
        _compressed: false,
        format: Texture2D.PixelFormat.RGBA8888,
    });
    texture = new Texture2D();
    texture.image = imageAsset;

    // Cubemap API probe: reuse the six-face checkerboard for all faces, then verify
    // the public mipmap, face-index, default, reset, and validation surfaces.
    const faces = [texture, texture, texture, texture, texture, texture];
    cubeTexture = TextureCube.fromTexture2DArray(faces);
    const cubeFace = cubeTexture.image;
    const cubeState = {
        constructorName: cubeTexture.constructor.name,
        faceOrder: [
            TextureCube.FaceIndex.front,
            TextureCube.FaceIndex.back,
            TextureCube.FaceIndex.left,
            TextureCube.FaceIndex.right,
            TextureCube.FaceIndex.top,
            TextureCube.FaceIndex.bottom,
        ],
        isRGBE: cubeTexture.isRGBE,
        mipmapCount: cubeTexture.mipmaps.length,
        atlasAbsent: cubeTexture.mipmapAtlas === null,
        offlineMipmaps: cubeTexture.isUsingOfflineMipmaps(),
        imagePresent: !!cubeFace && cubeFace.front === imageAsset,
        valid: cubeTexture.validate(),
    };
    cubeTexture.onLoaded();
    cubeTexture.updateMipmaps(0, cubeTexture.mipmaps.length);
    defaultCube = new TextureCube();
    defaultCube.initDefault();
    resetProbeCube = new TextureCube();
    resetProbeCube.reset({ width: 1, height: 1, format: gfx.Format.RGBA8, mipmapLevel: 1 });
    const resetProbeAtlas = resetProbeCube.mipmapAtlas;
    resetProbeCube.mipmapAtlas = null;
    if (
        cubeState.constructorName !== 'TextureCube' ||
        cubeState.faceOrder.length !== 6 ||
        cubeState.isRGBE !== false ||
        cubeState.mipmapCount !== 1 ||
        !cubeState.atlasAbsent ||
        cubeState.offlineMipmaps ||
        !cubeState.imagePresent ||
        !cubeState.valid ||
        !defaultCube.validate() ||
        resetProbeAtlas !== null
    ) {
        throw new Error('[texture-basic] TextureCube API probe failed: ' + JSON.stringify(cubeState));
    }

    material = new Material();
    material.initialize({ effectName: 'builtin-standard', defines: { USE_ALBEDO_MAP: true } });
    material.setProperty('mainTexture', texture);

    mesh = utils.createMesh(primitives.box({ width: 1.6, height: 1.6, length: 1.6 }));

    texturedCube = new Node('TexturedCube');
    texturedCube.layer = Layers.Enum.DEFAULT;
    scene.addChild(texturedCube);
    texturedCube.setPosition(new Vec3(0, 0.5, 0));
    var renderer = texturedCube.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.material = material;
    texturedCube.addComponent(Spin);
    return owned();
}

var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.4, 6.5));
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
var lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
var light = lightNode.addComponent(DirectionalLight);
light.illuminance = 50000;

acquire();

// §25 Lifecycle Contract：先销毁承载节点解除渲染引用，再销毁资源，然后整条链重建。
installAssetLifecycle({
    label: 'texture-basic',
    hold: owned,
    release: () => {
        texturedCube.destroy();
        mesh.destroy();
        material.destroy();
        texture.destroy();
        cubeTexture.destroy();
        defaultCube.destroy();
        resetProbeCube.destroy();
        imageAsset.destroy();
    },
    reacquire: acquire,
});

app.run(scene);
console.log('[texture-basic] running');
