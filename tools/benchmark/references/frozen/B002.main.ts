import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Layers, Vec3, utils, primitives, builtinResMgr } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('B002');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2, 8));
cameraNode.setRotationFromEuler(-12, 0, 0);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
for (let i = 0; i < 2; i++) {
    const cube = new Node('cube-' + i);
    cube.layer = Layers.Enum.DEFAULT;
    cube.setPosition(new Vec3(0, 0, -i * 3));
    scene.addChild(cube);
    const renderer = cube.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
    renderer.material = builtinResMgr.get('builtin-standard-material');
}
(window as unknown as { __cameraToggle: () => void }).__cameraToggle = () => {
    camera.projection = camera.projection === Camera.ProjectionType.ORTHO
        ? Camera.ProjectionType.PERSPECTIVE
        : Camera.ProjectionType.ORTHO;
    if (camera.projection === Camera.ProjectionType.ORTHO) { camera.orthoHeight = 4; }
};
app.run(scene);
