// TypeScript consumer of the package's actual public export, not its src tree.
import { createAirApp, Scene, Node, Camera, GLTFLoader, configureGLTFLoaderDefaults,
    GLTFExtensionRegistry, GLTFError, createMeshoptDecoder, createDracoDecoder } from 'cocosair.js';
import type { GLTFLoaderOptions, GLTFLoadProgress, GLTFExtensionHandler, GLTFExtensionFactory,
    GLTFExtensionSupport, GLTFExtensionStatus, GLTFErrorCode, GLTFMaterialFeatures,
    GLTFDracoDecoder, GLTFMeshoptDecoder, GLTFKTX2Transcoder, DecodedPrimitive, DecodedTextureSource,
    GLTFExtensionReportEntry, GLTFInstantiationContext, MeshoptDecoderModule, DracoDecoderModule } from 'cocosair.js';

export async function contract (canvas: HTMLCanvasElement, camera: Camera) {
    const app = await createAirApp({ canvas }); app.run(new Scene('Main'));
    const scene: Scene | null = app.getScene();

    const progress = (progress: GLTFLoadProgress): void => { void progress.phase; };
    const options: GLTFLoaderOptions = { signal: new AbortController().signal, onProgress: progress };
    configureGLTFLoaderDefaults(options);

    const loader = new GLTFLoader(options);
    loader.setDRACODecoder(null).setMeshoptDecoder(null).setKTX2Transcoder(null);
    // Decoder adapters wrap the official modules; both accept sync and async entry points.
    const meshoptModule: MeshoptDecoderModule = {
        decodeGltfBufferAsync: async (count, byteStride) => new Uint8Array(count * byteStride),
    };
    loader.setMeshoptDecoder(createMeshoptDecoder(meshoptModule, 2));
    loader.setDRACODecoder(createDracoDecoder(async () => ({} as DracoDecoderModule)));
    const support: readonly GLTFExtensionSupport[] = loader.getExtensionSupport();
    const status: GLTFExtensionStatus | undefined = support[0]?.status;
    const handler: GLTFExtensionHandler = {
        name: 'ACME_demo',
        validate: (context) => { void context.json.asset.version; },
        extendMaterial: (index, features: GLTFMaterialFeatures, context) => {
            void index; void context; features.unlit = true; void features.uv.baseColor?.texCoord;
        },
    };
    const factory: GLTFExtensionFactory = (context) => { void context.handlers; return handler; };
    loader.register(factory);
    loader.unregister(factory);
    const registry = new GLTFExtensionRegistry().register(factory);
    void registry.size;

    const asset = await loader.loadAsync('model.glb');
    const instance = asset.instantiate();
    instance.dispose();

    try { throw new GLTFError('GLTF_EXTENSION_UNSUPPORTED', 'demo', 'ACME_demo'); }
    catch (error) {
        if (error instanceof GLTFError) {
            const code: GLTFErrorCode = error.code;
            void code;
        }
    }

    const draco: GLTFDracoDecoder | undefined = undefined;
    const meshopt: GLTFMeshoptDecoder | undefined = undefined;
    const ktx2: GLTFKTX2Transcoder | undefined = undefined;
    const decodedPrimitive: DecodedPrimitive | undefined = undefined;
    const decodedTexture: DecodedTextureSource | undefined = undefined;
    const report: GLTFExtensionReportEntry | undefined = undefined;
    const instantiation: GLTFInstantiationContext | undefined = undefined;
    void draco; void meshopt; void ktx2; void decodedPrimitive; void decodedTexture; void report; void instantiation;
    void camera; void scene; void status;
    // @ts-expect-error Unknown status codes are rejected.
    const bad: GLTFExtensionStatus = 'almost-supported';
    void bad;
}
