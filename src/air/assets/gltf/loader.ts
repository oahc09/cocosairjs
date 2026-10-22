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
import { assetManager } from '../../../cocos/asset/asset-manager';
import factory from '../../../cocos/asset/asset-manager/factory';
import { files, parsed } from '../../../cocos/asset/asset-manager/shared';
import { GLTFAsset } from './asset';
import { decodeContainer, GLTFParserContext } from './parser-context';
import { GLTFExtensionRegistry, GLTFExtensionFactory, GLTFExtensionHandler } from './extension-registry';
import { GLTFLoaderOptions, GLTFLoadProgress } from './progress';
import { awaitAbortable, mergeRequestPolicy, requestArrayBuffer, requestOrigin, throwIfAborted } from './request-policy';
import { GLTFExtensionSupport, GLTFExtensionStatus } from './support';
import type { GLTFDracoDecoder, GLTFMeshoptDecoder, GLTFKTX2Transcoder } from './decoder/types';
import { prepareNodes, createSkeletons } from './nodes';
import { createGLTFMesh } from './mesh';
import { createGLTFMaterial, loadGLTFTextures } from './material';
import { createGLTFAnimations } from './animation';
import { createMaterialFeatures, GLTFMaterialFeatures } from './material/features';
import { unlitFactory } from './extensions/material/unlit';
import { emissiveStrengthFactory } from './extensions/material/emissive-strength';
import { iorFactory } from './extensions/material/ior';
import { specularFactory } from './extensions/material/specular';
import { clearcoatFactory } from './extensions/material/clearcoat';
import { anisotropyFactory } from './extensions/material/anisotropy';
import { iridescenceFactory } from './extensions/material/iridescence';
import { bumpFactory } from './extensions/material/bump';
import { transmissionFactory } from './extensions/material/transmission';
import { volumeFactory } from './extensions/material/volume';
import { dispersionFactory } from './extensions/material/dispersion';
import { textureTransformFactory } from './extensions/texture/transform';
import { meshQuantizationFactory } from './extensions/geometry/quantization';
import { meshoptCompressionFactory, KHR_MESHOPT_COMPRESSION, EXT_MESHOPT_COMPRESSION } from './extensions/geometry/meshopt';
import { dracoCompressionFactory } from './extensions/geometry/draco';
import { imageExtensionFactory } from './extensions/texture/image-formats';
import { basisuFactory } from './extensions/texture/basisu';
import { punctualLightsFactory } from './extensions/scene/lights';
import { meshGPUInstancingFactory } from './extensions/scene/instancing';
import { check, item } from './schema';

export function gltfExtension (url: string): string | undefined {
    return /\.(gltf|glb)$/i.exec(url.split(/[?#]/, 1)[0])?.[0].toLowerCase();
}
function absoluteURL (url: string): string {
    return new URL(url, typeof document !== 'undefined' ? document.baseURI : undefined).href;
}

let globalDefaults: GLTFLoaderOptions = {};
/** Sets process-wide fallback options; instance options take precedence over these. */
export function configureGLTFLoaderDefaults (options: GLTFLoaderOptions): void {
    globalDefaults = { ...globalDefaults, ...options,
        request: Object.prototype.hasOwnProperty.call(options, 'request') && options.request === undefined
            ? undefined : mergeRequestPolicy(globalDefaults.request, options.request) };
}

function resolveOptions (options: GLTFLoaderOptions): GLTFLoaderOptions {
    return { ...globalDefaults, ...options, request: mergeRequestPolicy(globalDefaults.request, options.request) };
}

/** Extensions known to the version matrix but not yet implemented by a registered handler. */
const KNOWN_UNIMPLEMENTED: readonly GLTFExtensionSupport[] = [
];

export class GLTFLoader {
    private readonly registry = new GLTFExtensionRegistry()
        .register(unlitFactory)
        .register(textureTransformFactory)
        .register(meshQuantizationFactory)
        .register(meshoptCompressionFactory(EXT_MESHOPT_COMPRESSION))
        .register(meshoptCompressionFactory(KHR_MESHOPT_COMPRESSION))
        .register(dracoCompressionFactory)
        .register(emissiveStrengthFactory)
        .register(iorFactory)
        .register(specularFactory)
        .register(clearcoatFactory)
        .register(anisotropyFactory)
        .register(iridescenceFactory)
        .register(bumpFactory)
        .register(transmissionFactory)
        .register(volumeFactory)
        .register(dispersionFactory)
        .register(basisuFactory)
        .register(imageExtensionFactory('EXT_texture_webp'))
        .register(imageExtensionFactory('EXT_texture_avif'))
        .register(punctualLightsFactory)
        .register(meshGPUInstancingFactory);
    private options: GLTFLoaderOptions;
    private customRegistry = false;

    constructor (options?: GLTFLoaderOptions) {
        this.options = { ...options, request: mergeRequestPolicy(options?.request) };
    }

    public setDRACODecoder (decoder: GLTFDracoDecoder | null): this {
        this.options = { ...this.options, dracoDecoder: decoder ?? undefined }; return this;
    }
    public setMeshoptDecoder (decoder: GLTFMeshoptDecoder | null): this {
        this.options = { ...this.options, meshoptDecoder: decoder ?? undefined }; return this;
    }
    public setKTX2Transcoder (transcoder: GLTFKTX2Transcoder | null): this {
        this.options = { ...this.options, ktx2Transcoder: transcoder ?? undefined }; return this;
    }
    public register (factory: GLTFExtensionFactory): this {
        this.customRegistry = true; this.registry.register(factory); return this;
    }
    public unregister (factory: GLTFExtensionFactory): this {
        this.customRegistry = true; this.registry.unregister(factory); return this;
    }

    /** Instance configuration + device capability; catalogs use this to pick variants. */
    public getExtensionSupport (): readonly GLTFExtensionSupport[] {
        const resolved = resolveOptions(this.options);
        const probe = new GLTFParserContext({ asset: { version: '2.0' } }, undefined, resolved);
        const entries: GLTFExtensionSupport[] = [];
        for (const handler of this.registry.createHandlers(probe)) {
            const support = handler.support?.() ?? { name: handler.name, status: 'supported' as GLTFExtensionStatus };
            entries.push({ ...support, name: handler.name });
        }
        const known = new Set(entries.map((entry) => entry.name));
        for (const entry of KNOWN_UNIMPLEMENTED) { if (!known.has(entry.name)) { entries.push({ ...entry }); } }
        return entries;
    }

    public loadAsync (url: string): Promise<GLTFAsset> {
        const resolved = resolveOptions(this.options);
        return awaitAbortable(() => {
            throwIfAborted(resolved.signal);
            const target = absoluteURL(url);
            // Explicit legacy undefined options (e.g. setDRACODecoder(null)) can disable
            // a global provider. They must not be lost in a new native factory instance.
            const isolated = this.customRegistry || Object.keys(this.options).some((key) => key !== 'request')
                || Object.values(resolved).some((value) => value !== undefined);
            if (!isolated) {
                registerGLTFLoader();
                // Keep the legacy URL-only native cache for option-free loads only. Configured
                // loads never read/write it or share cancellation ownership with another caller.
                return new Promise<GLTFAsset>((resolve, reject) => assetManager.loadRemote<GLTFAsset>(target,
                    { ext: gltfExtension(url) || '.glb' }, (error, asset) => error ? reject(error) : resolve(asset)));
            }
            return requestArrayBuffer(target, resolved.request, resolved.signal, requestOrigin(target))
                .then((data) => this.parseResolvedAsync(data,
                    /^(data|blob):/i.test(target) ? undefined : new URL('.', target).href, resolved, target));
        }, resolved.signal, (asset) => { asset.destroy(); });
    }

    public parseAsync (data: string | ArrayBuffer, baseUrl?: string): Promise<GLTFAsset> {
        const resolved = resolveOptions(this.options);
        return this.parseResolvedAsync(data, baseUrl, resolved);
    }

    private parseResolvedAsync (data: string | ArrayBuffer, baseUrl: string | undefined,
        resolved: GLTFLoaderOptions, sourceUrl?: string): Promise<GLTFAsset> {
        let context: GLTFParserContext | undefined;
        return awaitAbortable(async () => {
            const { json, bin } = decodeContainer(data);
            const base = baseUrl === undefined ? undefined : absoluteURL(baseUrl);
            const parser = new GLTFParserContext(json, base, resolved);
            context = parser;
            const report = (phase: GLTFLoadProgress['phase'], loaded: number, total: number): void =>
                parser.report(phase, loaded, total, sourceUrl);
            const layout = prepareNodes(parser);
            const asset = new GLTFAsset(parser, layout);
            try {
                parser.throwIfAborted();
                // Required/optional extension policy lives in the registry, not in string sets.
                const handlers = this.registry.createHandlers(parser);
                parser.handlers = handlers;
                this.registry.validateRequired(parser, handlers);
                for (const handler of handlers) { handler.validate?.(parser); }
                parser.throwIfAborted();
                report('container', 1, 1);
                if (resolved.request?.priority !== undefined
                    && (typeof Request === 'undefined' || !('priority' in Request.prototype))) {
                    parser.warn('request priority support is not exposed; the browser may ignore the scheduling hint');
                }

                await parser.loadBuffers(bin);
                // Validate all accessors before decoding images or allocating GPU resources.
                (json.accessors || []).forEach((_, i) => parser.accessor(i));
                // Scene extensions snapshot accessor binary before releaseDecodedData().
                for (const handler of handlers) { handler.resolveData?.(parser); }
                report('decode', json.accessors?.length || 0, json.accessors?.length || 0);
                parser.throwIfAborted();

                // Material features are handler-normalized before meshes/materials consume them.
                const features: GLTFMaterialFeatures[] = [];
                for (const [i, source] of (json.materials || []).entries()) {
                    const materialFeatures = createMaterialFeatures(i, source);
                    for (const handler of handlers) { await parser.wait(() => handler.extendMaterial?.(i, materialFeatures, parser)); }
                    features.push(materialFeatures);
                }
                parser.materialFeatures = features;

                parser.throwIfAborted();
                await loadGLTFTextures(parser, asset.owned.textures, asset.images);
                parser.throwIfAborted();
                report('textures', json.textures?.length || 0, json.textures?.length || 0);
                createSkeletons(parser, layout, asset.owned.skeletons);
                // Compressed primitives are decoded before mesh construction; decoded views already
                // replaced their bufferView payload during loadBuffers().
                await parser.resolvePrimitives();
                parser.throwIfAborted();
                const materials = new Map<string, ReturnType<typeof createGLTFMaterial>>();
                for (const [i, mesh] of (json.meshes || []).entries()) {
                    asset.owned.meshes.push(createGLTFMesh(parser, i));
                    asset.meshMaterials.push(mesh.primitives.map((primitive) => {
                        const key = `${primitive.material ?? -1}:${primitive.attributes.COLOR_0 !== undefined}`;
                        let material = materials.get(key);
                        if (!material) {
                            const materialFeatures = primitive.material === undefined
                                ? createMaterialFeatures(-1, {}) : item(features, primitive.material, 'material features');
                            material = createGLTFMaterial(materialFeatures, asset.textures, primitive.attributes.COLOR_0 !== undefined);
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
                asset.owned.animations.push(...createGLTFAnimations(parser, layout.paths));
                report('objects', 1, 1);
                parser.throwIfAborted();
                parser.releaseDecodedData();
                return asset;
            } catch (error) { parser.dispose(); asset.destroy(); throw error; }
        }, resolved.signal, (late) => { context?.dispose(); late.destroy(); });
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
        factory.register(ext, (url, data, options, done) => {
            const loaderOptions = (options as { gltf?: GLTFLoaderOptions } | undefined)?.gltf ?? globalDefaults;
            new GLTFLoader(loaderOptions).parseAsync(data, /^(data|blob):/i.test(url) ? undefined : new URL('.', absoluteURL(url)).href).then(
                (asset) => done(null, asset), (error) => {
                    // Native parsed/file caches must not turn a repaired URL into a permanent failure.
                    files.remove(`${url}@native`); parsed.remove(`${url}@native`); done(error);
                });
        });
    }
}

export type { GLTFExtensionHandler, GLTFExtensionFactory } from './extension-registry';
export type { AirRequestPolicy, GLTFLoaderOptions, GLTFLoadProgress } from './progress';
export type { GLTFExtensionSupport, GLTFExtensionStatus } from './support';
