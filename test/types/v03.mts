// TypeScript consumer of the package's actual public export, not its src tree.
import { createAirApp, Scene, Node, Camera, Mesh, loadAssetAsync, frameObject,
    buildSkeletonTree, restoreBindPose, GLTFLoader, Animation } from 'cocosair.js';

export async function contract (canvas: HTMLCanvasElement, camera: Camera) {
    const app = await createAirApp({ canvas }); app.run(new Scene('Main'));
    const scene: Scene | null = app.getScene();
    const mesh: Mesh = await loadAssetAsync('registered/mesh', Mesh);
    const root = new Node('root'); restoreBindPose(root, buildSkeletonTree(root, []));
    frameObject(camera, root);
    const asset = await new GLTFLoader().loadAsync('model.glb');
    const instance = asset.instantiate();
    const animation: Animation | null = instance.root.getComponent(Animation);
    instance.dispose(); void scene; void mesh; void animation;
    // @ts-expect-error Canvas is required.
    await createAirApp({});
}
