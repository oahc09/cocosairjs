import { assetManager } from '../../../cocos/asset/asset-manager';
import factory from '../../../cocos/asset/asset-manager/factory';
import { files, parsed } from '../../../cocos/asset/asset-manager/shared';
import { GLTFAsset } from './asset';
import { decodeContainer, GLTFContext } from './context';
import { prepareNodes, createSkeletons } from './nodes';
import { createGLTFMesh } from './mesh';
import { createGLTFMaterial, loadGLTFTextures } from './material';
import { createGLTFAnimations } from './animation';
import { check, item } from './schema';

export function gltfExtension (url: string): string | undefined {
    return /\.(gltf|glb)$/i.exec(url.split(/[?#]/, 1)[0])?.[0].toLowerCase();
}
function absoluteURL (url: string): string {
    return new URL(url, typeof document !== 'undefined' ? document.baseURI : undefined).href;
}
export class GLTFLoader {
    public loadAsync (url: string): Promise<GLTFAsset> {
        registerGLTFLoader();
        // Binary transport accepts both GLB and JSON. Native factory handles caching and in-flight loads.
        return new Promise((resolve, reject) => assetManager.loadRemote<GLTFAsset>(absoluteURL(url),
            { ext: gltfExtension(url) || '.glb' }, (error, asset) => error ? reject(error) : resolve(asset)));
    }
    public async parseAsync (data: string | ArrayBuffer, baseUrl?: string): Promise<GLTFAsset> {
        const { json, bin } = decodeContainer(data);
        const context = new GLTFContext(json, baseUrl === undefined ? undefined : absoluteURL(baseUrl));
        const layout = prepareNodes(context);
        const asset = new GLTFAsset(context, layout);
        try {
            await context.loadBuffers(bin);
            // Validate all accessors before decoding images or allocating GPU resources.
            (json.accessors || []).forEach((_, i) => context.accessor(i));
            await loadGLTFTextures(context, asset.owned.textures, asset.images);
            createSkeletons(context, layout, asset.owned.skeletons);
            const materials = new Map<string, ReturnType<typeof createGLTFMaterial>>();
            for (const [i, mesh] of (json.meshes || []).entries()) {
                asset.owned.meshes.push(createGLTFMesh(context, i));
                asset.meshMaterials.push(mesh.primitives.map((primitive) => {
                    const key = `${primitive.material ?? -1}:${primitive.attributes.COLOR_0 !== undefined}`;
                    let material = materials.get(key);
                    if (!material) {
                        const source = primitive.material === undefined ? {} : item(json.materials, primitive.material, 'material');
                        material = createGLTFMaterial(source, asset.textures, primitive.attributes.COLOR_0 !== undefined);
                        materials.set(key, material); asset.owned.materials.push(material);
                    }
                    return material;
                }));
            }
            for (const node of json.nodes || []) {
                if (node.mesh !== undefined) { item(asset.meshes, node.mesh, 'node mesh'); }
                if (node.skin !== undefined) {
                    item(asset.skeletons, node.skin, 'node skin'); check(node.mesh !== undefined, 'skin node must reference mesh');
                }
            }
            asset.owned.animations.push(...createGLTFAnimations(context, layout.paths));
            context.releaseDecodedData();
            return asset;
        } catch (error) { context.releaseDecodedData(); asset.destroy(); throw error; }
    }
}

let registered = false;
export function registerGLTFLoader (): void {
    if (registered) { return; } registered = true;
    for (const ext of ['.gltf', '.glb']) {
        assetManager.downloader.register(ext, (url, options, done) => {
            // Fetch supports data/blob URLs as well as HTTP, and preserves the original base URL in factory.
            fetch(url, { headers: options.header, credentials: options.withCredentials ? 'include' : 'same-origin' })
                .then((response) => { check(response.ok, `request failed: ${url} (${response.status})`); return response.arrayBuffer(); })
                .then((data) => done(null, data), (error) => done(error));
        });
        assetManager.parser.register(ext, (data, _options, done) => {
            try { decodeContainer(data); done(null, data); } catch (error) { done(error as Error); }
        });
        factory.register(ext, (url, data, _options, done) => {
            new GLTFLoader().parseAsync(data, /^(data|blob):/i.test(url) ? undefined : new URL('.', absoluteURL(url)).href).then(
                (asset) => done(null, asset), (error) => {
                    // Native parsed/file caches must not turn a repaired URL into a permanent failure.
                    files.remove(`${url}@native`); parsed.remove(`${url}@native`); done(error);
                });
        });
    }
}
