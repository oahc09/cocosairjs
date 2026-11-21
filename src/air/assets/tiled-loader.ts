/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/

import { SpriteFrame } from '../../cocos/2d/assets/sprite-frame';
import { ImageAsset } from '../../cocos/asset/assets/image-asset';
import { TextAsset } from '../../cocos/asset/assets/text-asset';
import { Texture2D } from '../../cocos/asset/assets/texture-2d';
import { Size } from '../../cocos/core';
import { TiledMapAsset } from '../../cocos/tiledmap/tiled-map-asset';
import { AssetBank } from './asset-bank';

export interface AirTiledMapLoadOptions {
    readonly bank: AssetBank;
    /** A base for a relative map URL; defaults to document.baseURI. */
    readonly baseURL?: string;
    readonly signal?: AbortSignal;
}

export interface AirTiledMapHandle {
    readonly asset: TiledMapAsset;
    readonly disposed: boolean;
    /** Detach the asset from every TiledMap using it before disposing this handle. */
    dispose(): void;
}

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const MAX_DEPENDENCIES = 256;

function urlFor (path: string, base?: string): URL {
    const url = new URL(path.replace(/\\/g, '/'), base);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
        throw new Error('[Tiled] expected a credential-free HTTP(S) URL');
    }
    url.hash = '';
    return url;
}

function dependencyURL (path: string, parent: URL, origin: string): URL {
    if (!path.trim()) throw new Error('[Tiled] missing external resource path');
    const url = urlFor(path, parent.href);
    if (url.origin !== origin) throw new Error('[Tiled] dependencies must share the map origin');
    return url;
}

function parseXML (source: string, expected: string): Document {
    const doc = new DOMParser().parseFromString(source, 'application/xml');
    if (doc.doctype || doc.documentElement.tagName !== expected || doc.querySelector('parsererror')) {
        throw new Error(`[Tiled] expected valid <${expected}> XML without a DOCTYPE`);
    }
    return doc;
}

/**
 * Load one finite TMX map, its TSX documents and PNG/JPEG/WebP images with map-local ownership.
 * A TSX resolves image paths relative to its own URL. The original files are never modified.
 */
export async function loadTiledMap (url: string, options: AirTiledMapLoadOptions): Promise<AirTiledMapHandle> {
    const { bank, signal } = options;
    const base = options.baseURL ?? (typeof document !== 'undefined' ? document.baseURI : undefined);
    const mapURL = urlFor(url, base);
    const subscriptions: { url: string; ext: string }[] = [];
    const owned: (TiledMapAsset | Texture2D | SpriteFrame | TextAsset)[] = [];
    const tsx = new Map<string, { key: string; text: Document }>();
    const images = new Map<string, { key: string; ext: string; tileset: boolean; layer: boolean }>();
    const serializer = new XMLSerializer();
    let disposed = false;

    const assertNotAborted = (): void => {
        if (signal?.aborted) throw new Error('[Tiled] map subscription aborted');
    };
    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        for (const asset of owned.reverse()) asset.destroy();
        for (const item of subscriptions.reverse()) bank.release(item.url, item.ext);
        owned.length = 0;
        subscriptions.length = 0;
    };
    const checkLimit = (): void => {
        if (tsx.size + images.size >= MAX_DEPENDENCIES) throw new Error('[Tiled] dependency limit exceeded');
    };
    const readXML = async (file: URL, ext: 'tmx' | 'tsx', root: 'map' | 'tileset'): Promise<Document> => {
        const asset = await bank.load(file.href, { ext, signal });
        try {
            if (!(asset instanceof TextAsset)) throw new Error(`[Tiled] expected TextAsset: ${file.href}`);
            return parseXML(asset.text, root);
        } finally {
            bank.release(file.href, ext);
        }
    };
    const rewriteImage = (element: Element, parent: URL, kind: 'tileset' | 'layer'): void => {
        const img = dependencyURL(element.getAttribute('source') ?? '', parent, mapURL.origin);
        const ext = img.pathname.match(IMAGE_EXT)?.[1].toLowerCase();
        if (!ext) throw new Error('[Tiled] supported image formats are PNG, JPEG and WebP');
        let entry = images.get(img.href);
        if (!entry) {
            checkLimit();
            entry = { key: `air-tiled-image-${images.size}.${ext}`, ext, tileset: false, layer: false };
            images.set(img.href, entry);
        }
        entry[kind] = true;
        // The native parser uses a single filename table across all TSX documents.
        // Map-local keys depend on resolved URLs, not coincidentally identical basenames.
        element.setAttribute('source', entry.key);
    };
    const rewriteTileset = (element: Element, parent: URL): void => {
        const entries = element.querySelectorAll('image');
        if (!entries.length) throw new Error('[Tiled] a tileset must have an external image');
        for (const image of Array.from(entries)) rewriteImage(image, parent, 'tileset');
    };

    try {
        const map = await readXML(mapURL, 'tmx', 'map');
        if (map.documentElement.getAttribute('infinite') === '1') throw new Error('[Tiled] infinite maps are not supported');
        for (const tileset of Array.from(map.querySelectorAll('tileset'))) {
            const source = tileset.getAttribute('source');
            if (source === null) {
                rewriteTileset(tileset, mapURL);
                continue;
            }
            const target = dependencyURL(source, mapURL, mapURL.origin);
            let external = tsx.get(target.href);
            if (!external) {
                checkLimit();
                const text = await readXML(target, 'tsx', 'tileset');
                if (text.documentElement.hasAttribute('source')) throw new Error('[Tiled] nested external tilesets are not supported');
                external = { key: `air-tiled-tileset-${tsx.size}.tsx`, text };
                tsx.set(target.href, external);
                rewriteTileset(text.documentElement, target);
            }
            tileset.setAttribute('source', external.key);
        }
        for (const image of Array.from(map.querySelectorAll('imagelayer > image'))) rewriteImage(image, mapURL, 'layer');

        const asset = new TiledMapAsset();
        owned.push(asset);
        asset.tmxXmlStr = serializer.serializeToString(map);
        for (const { key, text } of tsx.values()) {
            const tsxAsset = new TextAsset();
            owned.push(tsxAsset);
            tsxAsset.text = serializer.serializeToString(text);
            asset.tsxFileNames.push(key);
            asset.tsxFiles.push(tsxAsset);
        }
        for (const [imageURL, image] of images) {
            const bitmap = await bank.load(imageURL, { ext: image.ext, signal });
            subscriptions.push({ url: imageURL, ext: image.ext });
            if (!(bitmap instanceof ImageAsset) || !bitmap.width || !bitmap.height) {
                throw new Error(`[Tiled] invalid image asset: ${imageURL}`);
            }
            const texture = new Texture2D();
            owned.push(texture);
            texture.image = bitmap;
            const frame = new SpriteFrame();
            owned.push(frame);
            frame.packable = false;
            frame.texture = texture;
            if (image.tileset) {
                asset.spriteFrameNames.push(image.key);
                asset.spriteFrames.push(frame);
                asset.spriteFrameSizes.push(new Size(bitmap.width, bitmap.height));
            }
            if (image.layer) {
                asset.imageLayerSpriteFrameNames.push(image.key);
                asset.imageLayerSpriteFrame.push(frame);
            }
        }
        assertNotAborted();
        return Object.freeze({ asset, get disposed () { return disposed; }, dispose });
    } catch (error) {
        dispose();
        throw error;
    }
}
