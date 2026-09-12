/**
 * Cocos AIR — Promise Asset Helper（V0.2 Task 2 / 计划书 §7）。
 *
 * 只做 Callback API → Promise DX 的包装，内部仍使用引擎原生资产系统，
 * 不建立新 Asset System / 不做 Cache redesign：
 *  1. loadAssetAsync(path, type)：
 *     - 若 assetManager.resources 已注册（Creator 常规形态）→ 走 resources.load 原生路径；
 *     - 否则走 Code First 约定：资产以 path 为键注册在 assetManager.assets
 *       （V0.1 已验证的 assetManager.assets.add + load 链路）。
 *  2. loadAssetAsync(url)：HTTP 拉取 + 引擎 deserialize（V0.1 运行时 JSON 兼容形态）。
 */

import { Asset } from '../../cocos/asset/assets/asset';
import { assetManager } from '../../cocos/asset/asset-manager';
import { deserialize } from '../../cocos/serialization';
import { GLTFAsset } from '../assets/gltf/asset';
import { GLTFLoader, gltfExtension } from '../assets/gltf/loader';

/**
 * @en Promise wrapper for engine asset loading (resources.load when available,
 *     otherwise the Code First global assets registry keyed by path).
 * @zh 引擎资产加载的 Promise 包装：resources bundle 可用时走 resources.load；
 *     Code First 下按约定解析全局 assets 缓存（以 path 为键）。
 *
 * @example
 * ```ts
 * // Code First：先注册，再以路径加载
 * assetManager.assets.add('models/robot/mesh', mesh);
 * const m = await loadAssetAsync('models/robot/mesh', Mesh);
 * ```
 */
export async function loadAssetAsync <T extends Asset> (path: string, type: Constructor<T>): Promise<T>;
/**
 * @en Fetch a JSON/binary runtime asset over HTTP and deserialize it with the engine serializer
 *     (V0.1 compatible form; non-serialized payloads fall back to plain JSON).
 * @zh HTTP 拉取运行时资产文件并用引擎反序列化器还原（V0.1 兼容形态；非序列化格式按纯 JSON 返回）。
 */
export async function loadAssetAsync <T = unknown> (url: string): Promise<T>;
export async function loadAssetAsync (path: string, type?: Constructor<Asset>): Promise<unknown> {
    if (type === GLTFAsset || (!type && gltfExtension(path))) {
        const cached = assetManager.assets.get(path);
        if (cached instanceof GLTFAsset && cached.isValid) { return cached; }
        return new GLTFLoader().loadAsync(path);
    }
    if (type) {
        // 1) resources bundle 原生路径（Creator 常规形态）
        const res = assetManager.resources;
        if (res) {
            try {
                return await new Promise<Asset>((resolve, reject) => {
                    res.load(path, type, (err, asset) => {
                        if (err) { reject(err); } else { resolve(asset); }
                    });
                });
            } catch (e) {
                // 无 config 的 Code First bundle 会走失败：继续按全局缓存约定解析
            }
        }
        // 2) Code First 约定：assetManager.assets 中以 path 为键
        const cached = assetManager.assets.get(path);
        if (cached && (!type || cached instanceof type)) {
            return cached;
        }
        throw new Error(`[cocosair] loadAssetAsync: '${path}' not found. Register it via assetManager.assets.add('${path}', asset), or set up a resources bundle.`);
    }

    // V0.1 兼容形态：URL 拉取 + deserialize
    const resp = await fetch(path);
    if (!resp.ok) {
        throw new Error(`[cocosair] loadAssetAsync failed: ${path} (${resp.status})`);
    }
    const text = await resp.text();
    try {
        return deserialize(text);
    } catch (e) {
        return JSON.parse(text);
    }
}
