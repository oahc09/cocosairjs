import type { TextAsset } from '../assets/text-asset';

// Internal native transport only. A remote atlas remains a plain public
// TextAsset; the resolved response address never becomes its asset key.
export class AtlasTextResponse {
    constructor (readonly text: string, readonly responseURL: string) {}
}

const atlasResponseURLs = new WeakMap<TextAsset, string>();
export function rememberAtlasResponseURL (asset: TextAsset, responseURL: string): void {
    if (responseURL) atlasResponseURLs.set(asset, responseURL);
}

export function getAtlasResponseURL (asset: TextAsset): string | undefined {
    return atlasResponseURLs.get(asset);
}
