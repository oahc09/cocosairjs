import type { Node } from '../../../cocos/scene-graph/node';
import { GLTFError } from './diagnostics';
import type { GLTFParserContext } from './parser-context';
import type { GLTFExtensionStatus, GLTFExtensionSupport } from './support';
import type { DecodedPrimitive, DecodedTextureSource } from './decoder/types';
import type { GLTFMaterialFeatures } from './material/features';

/** Per-parse extension handler; one instance per extension per parse. */
export interface GLTFExtensionHandler {
    readonly name: string;
    /** Extensions this handler requires to be registered (e.g. data dependencies). */
    readonly dependencies?: readonly string[];
    support?(): GLTFExtensionSupport;
    validate?(context: GLTFParserContext): void;
    loadBufferView?(index: number, context: GLTFParserContext): Promise<Uint8Array | null>;
    loadPrimitive?(primitiveIndex: number, meshIndex: number, context: GLTFParserContext): Promise<DecodedPrimitive | null>;
    resolveTextureSource?(textureIndex: number, context: GLTFParserContext): Promise<DecodedTextureSource | null>;
    extendMaterial?(materialIndex: number, features: GLTFMaterialFeatures, context: GLTFParserContext): Promise<void> | void;
    createNode?(nodeIndex: number, node: Node, context: GLTFParserContext): Promise<void> | void;
    instantiate?(nodeIndex: number, node: Node, context: GLTFInstantiationContext): Promise<void> | void;
    dispose?(): void;
}

export type GLTFExtensionFactory = (context: GLTFParserContext) => GLTFExtensionHandler;

/** Node-scoped state passed to handlers during instantiate(); extended by scene extensions. */
export interface GLTFInstantiationContext {
    readonly json: GLTFParserContext['json'];
}

const SUPPORT_CODES: Record<Exclude<GLTFExtensionStatus, 'supported' | 'unsupported'>, GLTFError['code']> = {
    'decoder-required': 'GLTF_DECODER_MISSING',
    'device-dependent': 'GLTF_DEVICE_UNSUPPORTED',
    fallback: 'GLTF_EXTENSION_UNSUPPORTED',
};

/**
 * Ordered extension registry. Registration order defines hook execution order;
 * duplicate names and missing dependencies are rejected at handler creation.
 */
export class GLTFExtensionRegistry {
    private readonly factories: GLTFExtensionFactory[] = [];

    public register (factory: GLTFExtensionFactory): this {
        if (!this.factories.includes(factory)) { this.factories.push(factory); }
        return this;
    }
    public unregister (factory: GLTFExtensionFactory): boolean {
        const index = this.factories.indexOf(factory);
        if (index >= 0) { this.factories.splice(index, 1); return true; }
        return false;
    }
    public get size (): number { return this.factories.length; }

    /** Instantiates handlers in registration order, rejecting duplicate names and missing dependencies. */
    public createHandlers (context: GLTFParserContext): GLTFExtensionHandler[] {
        const handlers: GLTFExtensionHandler[] = [];
        const names = new Set<string>();
        for (const factory of this.factories) {
            const handler = factory(context);
            if (names.has(handler.name)) {
                throw new Error(`[glTF] duplicate extension handler: ${handler.name}`);
            }
            names.add(handler.name); handlers.push(handler);
        }
        for (const handler of handlers) {
            for (const dependency of handler.dependencies || []) {
                if (!names.has(dependency)) {
                    throw new Error(`[glTF] extension ${handler.name} requires unregistered extension ${dependency}`);
                }
            }
        }
        return handlers;
    }

    /**
     * Validates extensionsRequired against handler support. Unknown or unsupported required
     * extensions fail with a stable GLTFError; optional ones are left to core fallback + warn.
     */
    public validateRequired (context: GLTFParserContext, handlers: readonly GLTFExtensionHandler[]): void {
        const byName = new Map(handlers.map((handler) => [handler.name, handler]));
        const used = new Set(context.json.extensionsUsed || []);
        for (const name of context.json.extensionsRequired || []) { used.add(name); }
        for (const name of used) {
            const handler = byName.get(name);
            if (!handler) {
                if (context.json.extensionsRequired?.includes(name)) {
                    throw new GLTFError('GLTF_EXTENSION_UNSUPPORTED', `unsupported required extension: ${name}`, name);
                }
                continue;
            }
            const support = handler.support?.() ?? { name: handler.name, status: 'supported' as GLTFExtensionStatus };
            if (support.status === 'supported') { continue; }
            if (context.json.extensionsRequired?.includes(name)) {
                const code = SUPPORT_CODES[support.status] ?? 'GLTF_EXTENSION_UNSUPPORTED';
                throw new GLTFError(code, `required extension ${name}: ${support.status}${support.reason ? ` (${support.reason})` : ''}`, name);
            }
            context.warn(`extension ${name}: ${support.status}${support.reason ? ` (${support.reason})` : ''}`);
        }
    }
}
