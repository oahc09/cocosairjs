/** Public bundled declaration contract. Run after npm run build:dts. */
import { GLTFAsset, GLTFInstance, GLTFLoader, loadAssetAsync, assetManager, Mesh, Node } from '../../build/cocosair.module';

export async function loadModel (url: string): Promise<GLTFInstance> {
    const asset: GLTFAsset = await new GLTFLoader().loadAsync(url);
    const typed: GLTFAsset = await loadAssetAsync(url, GLTFAsset);
    const meshes: readonly Mesh[] = typed.meshes;
    const root: Node = asset.instantiate().root;
    void meshes; void root;
    assetManager.loadRemote<GLTFAsset>(url, (error, result) => { if (!error) { result.instantiate().dispose(); } });
    // @ts-expect-error Shared resource collections are readonly in the public SDK.
    asset.meshes.push(new Mesh());
    return asset.instantiate();
}
