/**
 * Protected, executable configuration reference for exactly three@0.186.1.
 *
 * This module only collects observations. It neither imports an oracle nor decides PASS.
 * Importing it does not launch a browser, fetch dependencies, load a model, or execute a task.
 * A browser collector must supply the pinned public THREE namespace and its own canvas.
 * Browser execution, package SHA authentication, and compositor presentation evidence remain
 * the caller's responsibility. The returned revision alone cannot authenticate patch 0.186.1.
 */
import {
    makeInstances,
    makeTargets,
    ownedUV,
    ownershipLedger,
    renderTarget,
    setFilm,
    skinnedBounds,
} from './three-reference.mjs';

const SCHEMA = 'upstream-agent-observation/1';
const SUPPORTED = Object.freeze(['AU04', 'AU05', 'AU06', 'AU07', 'AU08', 'AU09', 'AU10']);
const CENTER = Object.freeze({ x: 64, y: 32, width: 1, height: 1 });
const UV_ROI = Object.freeze({ x: 56, y: 24, width: 16, height: 16 });
const LEFT = Object.freeze({ x: 32, y: 32, width: 1, height: 1 });
const RIGHT = Object.freeze({ x: 96, y: 32, width: 1, height: 1 });
const TRANSFORM = Object.freeze({ offset: Object.freeze([0.2, -0.1]), scale: Object.freeze([2, 0.5]), rotation: 0.7 });
const GAPS = Object.freeze({
    AU01: 'Fixed glTF load/failure resources, content hashes, and HTTP failure receipts are not bound to this runner.',
    AU02: 'A real browser request recorder and fixed same-origin/cross-origin server routes are required.',
    AU03: 'Delayed dependency routes, abort/progress receipts, retry ownership, and survivor observations are not bound.',
    AU11: 'Use startThreeReadiness from three-readiness-reference.mjs with external compositor receipts; this one-shot runner cannot collect readiness.',
    AU12: 'Isolated installed package, strict type-check, Vite, DOM-free math, and decoder-path collectors are required.',
});

export class UnsupportedThreeReferenceError extends Error {
    constructor(taskId, explanation) {
        super(`${taskId}: ${explanation}`);
        this.name = 'UnsupportedThreeReferenceError';
        this.code = 'THREE_REFERENCE_UNSUPPORTED';
        this.taskId = taskId;
    }
}

export function threeReferenceCoverage() {
    return {
        executableTaskIds: [...SUPPORTED],
        unsupportedTasks: { ...GAPS },
        separateTaskRunners: { AU11: { module: './three-readiness-reference.mjs', export: 'startThreeReadiness' } },
        browserExecution: 'NOT_EXECUTED_BY_SOURCE_PREPARATION',
        filmScalarScope:
            'Derived from native material state and GPU-sampled RG bytes, not physical-shader instrumentation.',
        lifecycleScope: 'Explicitly owned object handles and listener removal, not total renderer or GPU memory.',
    };
}

function identityRegistry() {
    const ids = new WeakMap();
    let sequence = 0;
    return (object, kind) => {
        if (!object || (typeof object !== 'object' && typeof object !== 'function')) {
            throw new TypeError(`Cannot observe ${kind} identity without an object`);
        }
        if (!ids.has(object)) ids.set(object, `three:${kind}:${++sequence}`);
        return ids.get(object);
    };
}

function finiteVector(value) {
    if (!Array.isArray(value) || value.some((v) => !Number.isFinite(v))) throw new TypeError('Finite vector required');
    return [...value];
}

function textureState(texture) {
    return {
        offset: texture.offset.toArray(),
        repeat: texture.repeat.toArray(),
        rotation: texture.rotation,
        matrix: texture.matrix.toArray(),
        matrixAutoUpdate: texture.matrixAutoUpdate,
        colorSpace: texture.colorSpace,
    };
}

function filmState(material, identity) {
    return {
        state: [material.iridescence, material.iridescenceIOR, ...material.iridescenceThicknessRange],
        mapId: material.iridescenceMap ? identity(material.iridescenceMap, 'texture') : null,
        thicknessMapId: material.iridescenceThicknessMap ? identity(material.iridescenceThicknessMap, 'texture') : null,
        volume: {
            transmission: material.transmission,
            thickness: material.thickness,
            attenuationDistance: material.attenuationDistance,
            attenuationColor: material.attenuationColor.toArray(),
        },
    };
}

function makeContext(taskId, { THREE, canvas }) {
    if (!THREE || String(THREE.REVISION) !== '186') {
        throw new UnsupportedThreeReferenceError(
            taskId,
            'Supply the separately hash-verified public three@0.186.1 namespace.',
        );
    }
    if (!canvas || typeof canvas.getContext !== 'function') {
        throw new UnsupportedThreeReferenceError(
            taskId,
            'A caller-owned browser canvas with WebGL2 support is required.',
        );
    }
    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        alpha: false,
        premultipliedAlpha: false,
        depth: true,
        stencil: true,
        preserveDrawingBuffer: false,
        powerPreference: 'default',
    });
    const resources = new Set();
    const cleanups = new Set();
    const cleanup = (fn) => {
        const release = () => {
            fn();
            cleanups.delete(release);
        };
        cleanups.add(release);
        return release;
    };
    const identity = identityRegistry();
    const own = (object) => {
        resources.add(object);
        return object;
    };
    const dispose = (object) => {
        if (!resources.has(object)) return;
        object.dispose();
        resources.delete(object);
    };
    try {
        renderer.debug.checkShaderErrors = true;
        renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
            throw new Error(
                `Reference shader compilation failed: ${gl.getProgramInfoLog(program)}; ` +
                    `${gl.getShaderInfoLog(vertexShader)}; ${gl.getShaderInfoLog(fragmentShader)}`,
            );
        };
        renderer.setPixelRatio(1);
        renderer.setSize(640, 360, false);
        renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.toneMappingExposure = 1;
        renderer.autoClear = true;
        renderer.setClearColor(new THREE.Color().setRGB(0, 0, 0, THREE.LinearSRGBColorSpace), 1);
        renderer.sortObjects = true;
        const target = own(
            new THREE.WebGLRenderTarget(128, 64, {
                format: THREE.RGBAFormat,
                type: THREE.UnsignedByteType,
                depthBuffer: true,
                stencilBuffer: true,
                samples: 0,
            }),
        );
        target.texture.colorSpace = THREE.LinearSRGBColorSpace;
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        camera.position.set(0, 0, 2);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld(true);
        const geometry = own(new THREE.PlaneGeometry(2, 2));
        const read = (output = target, roi = CENTER) => {
            if (renderer.getContext().isContextLost()) throw new Error('WebGL context lost before ROI readback');
            const bytes = new Uint8Array(roi.width * roi.height * 4);
            renderer.readRenderTargetPixels(output, roi.x, roi.y, roi.width, roi.height, bytes);
            const error = renderer.getContext().getError();
            if (error !== renderer.getContext().NO_ERROR)
                throw new Error(`WebGL error during ROI collection: ${error}`);
            return Array.from(bytes);
        };
        let lastOutput = target;
        const draw = (scene, selectedCamera = camera, output = target, roi = CENTER) => {
            lastOutput = output;
            renderTarget(renderer, scene, selectedCamera, output);
            return read(output, roi);
        };
        const sceneFor = (material, lit = false) => {
            const scene = new THREE.Scene();
            scene.add(new THREE.Mesh(geometry, material));
            if (lit) {
                scene.add(new THREE.AmbientLight(0xffffff, 1));
                const light = new THREE.DirectionalLight(0xffffff, 2);
                light.position.set(2, 3, 4);
                scene.add(light);
            }
            return scene;
        };
        const texture = (bytes, width = 1, height = 1) => {
            const value = own(new THREE.DataTexture(new Uint8Array(bytes), width, height, THREE.RGBAFormat));
            value.colorSpace = THREE.NoColorSpace;
            value.magFilter = THREE.NearestFilter;
            value.minFilter = THREE.NearestFilter;
            value.wrapS = THREE.RepeatWrapping;
            value.wrapT = THREE.RepeatWrapping;
            value.generateMipmaps = false;
            value.needsUpdate = true;
            return value;
        };
        const color = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
        const basic = (rgb, extra = {}) =>
            own(
                new THREE.MeshBasicMaterial({
                    color: color(...rgb),
                    toneMapped: false,
                    dithering: false,
                    ...extra,
                }),
            );
        const actual = renderer.getContextAttributes();
        if (actual.antialias || actual.premultipliedAlpha) {
            throw new UnsupportedThreeReferenceError(
                taskId,
                'Context did not honor disabled AA and premultiplied alpha.',
            );
        }
        let closed = false;
        return {
            THREE,
            renderer,
            target,
            camera,
            geometry,
            identity,
            cleanup,
            own,
            dispose,
            forget: (resource) => resources.delete(resource),
            read,
            draw,
            sceneFor,
            texture,
            color,
            basic,
            configuration: {
                canvasSize: [renderer.domElement.width, renderer.domElement.height],
                width: target.width,
                height: target.height,
                pixelRatio: renderer.getPixelRatio(),
                outputColorSpace: renderer.outputColorSpace,
                targetColorSpace: target.texture.colorSpace,
                toneMapping: renderer.toneMapping,
                antialias: actual.antialias,
                alpha: actual.alpha,
                premultipliedAlpha: actual.premultipliedAlpha,
                samples: target.samples,
                readback: 'RGBA8',
                roi: { ...CENTER },
            },
            present() {
                const preview = sceneFor(basic([1, 1, 1], { map: lastOutput.texture }));
                renderer.setRenderTarget(null);
                renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
                renderer.render(preview, camera);
            },
            close() {
                if (closed) return;
                closed = true;
                let failure;
                for (const release of cleanups) {
                    try {
                        release();
                    } catch (error) {
                        failure ||= error;
                    }
                }
                for (const resource of resources) {
                    try {
                        resource.dispose();
                    } catch (error) {
                        failure ||= error;
                    }
                }
                resources.clear();
                renderer.dispose();
                if (failure) throw failure;
            },
        };
    } catch (error) {
        for (const resource of resources) resource.dispose();
        renderer.dispose();
        throw error;
    }
}

function assetResources(asset) {
    const groups = {
        roots: new Set(),
        materials: new Set(),
        textures: new Set(),
        geometries: new Set(),
        skeletons: new Set(),
    };
    for (const root of asset.scenes || [asset.scene]) {
        groups.roots.add(root);
        root.traverse((node) => {
            if (node.geometry) groups.geometries.add(node.geometry);
            if (node.skeleton) groups.skeletons.add(node.skeleton);
            for (const material of Array.isArray(node.material)
                ? node.material
                : node.material
                  ? [node.material]
                  : []) {
                groups.materials.add(material);
                for (const value of Object.values(material)) if (value?.isTexture) groups.textures.add(value);
            }
        });
    }
    return groups;
}

async function loadAsset(ctx, options, taskId, id) {
    const url = options.resourceURLs?.[id];
    if (typeof options.GLTFLoader !== 'function' || typeof url !== 'string') {
        throw new UnsupportedThreeReferenceError(
            taskId,
            `GLTFLoader and resourceURLs['${id}'] are required; no generated asset substitute is permitted.`,
        );
    }
    const manager = new ctx.THREE.LoadingManager();
    if (id === 'inspection-rig') {
        const checker = options.resourceURLs?.checker;
        if (typeof checker !== 'string')
            throw new UnsupportedThreeReferenceError(taskId, "resourceURLs['checker'] is required.");
        const resolved = new URL('checker.png', new URL(url, globalThis.location.href)).href;
        manager.setURLModifier((resource) =>
            new URL(resource, globalThis.location.href).href === resolved ? checker : resource,
        );
    }
    const asset = await new options.GLTFLoader(manager).loadAsync(url);
    const groups = assetResources(asset);
    for (const [kind, resources] of Object.entries(groups)) {
        if (kind !== 'roots') for (const resource of resources) ctx.own(resource);
    }
    return { asset, groups, url };
}

// The fresh arm is reconstructed from the frozen source document through the native
// loader, not through the setter exercised by the mutation arm.
async function freshInspectionMaterial(ctx, options, taskId, edit) {
    const url = new URL(options.resourceURLs['inspection-rig'], globalThis.location.href);
    const response = await fetch(url, { redirect: 'error' });
    if (!response.ok) throw new Error(`${taskId}: source document HTTP ${response.status}`);
    const document = await response.json();
    for (const image of document.images || []) {
        if (image.uri === 'checker.png')
            image.uri = new URL(options.resourceURLs.checker, globalThis.location.href).href;
    }
    edit(document);
    const asset = await new options.GLTFLoader().parseAsync(JSON.stringify(document), new URL('.', url).href);
    for (const [kind, resources] of Object.entries(assetResources(asset))) {
        if (kind !== 'roots') for (const resource of resources) ctx.own(resource);
    }
    return sourceMaterial(asset, taskId);
}

function sourceMaterial(asset, taskId) {
    let material;
    asset.scene.traverse((node) => {
        if (!material && node.isMesh) material = Array.isArray(node.material) ? node.material[0] : node.material;
    });
    if (!material?.map)
        throw new UnsupportedThreeReferenceError(taskId, 'Fixed source asset did not supply a textured mesh material.');
    return material;
}

async function runOwnedUV(ctx, options) {
    const { THREE, own, sceneFor, draw, identity } = ctx;
    const { asset, url } = await loadAsset(ctx, options, 'AU05', 'inspection-rig');
    const sharedMaterial = sourceMaterial(asset, 'AU05');
    const sharedTexture = sharedMaterial.map;
    const material = own(sharedMaterial.clone());
    const scene = sceneFor(material, true);
    const unmodifiedBefore = textureState(sharedMaterial.map);
    const initialPixels = draw(scene, ctx.camera, ctx.target, UV_ROI);
    const ownedTexture = own(ownedUV(material, TRANSFORM));
    const points = [
        [0, 0],
        [1, 0],
        [0, 1],
        [0.25, 0.75],
    ].map(([x, y]) => {
        const result = new THREE.Vector3(x, y, 1).applyMatrix3(ownedTexture.matrix);
        return [result.x, result.y];
    });
    const mutatedPixels = draw(scene, ctx.camera, ctx.target, UV_ROI);
    const fresh = await freshInspectionMaterial(ctx, options, 'AU05', (document) => {
        document.extensionsUsed = [...new Set([...(document.extensionsUsed || []), 'KHR_texture_transform'])];
        const texture = document.materials[0].pbrMetallicRoughness.baseColorTexture;
        texture.extensions = {
            ...texture.extensions,
            KHR_texture_transform: {
                offset: [0.2, -0.1],
                scale: [2, 0.5],
                rotation: -0.7,
            },
        };
    });
    const freshPixels = draw(sceneFor(fresh, true), ctx.camera, ctx.target, UV_ROI);
    return [
        {
            id: 'owned-uv-transform',
            resourceURL: url,
            checkerURL: options.resourceURLs.checker,
            roi: { ...UV_ROI },
            renderScope: 'Native source-asset material on a fixed flat swatch, no generated replacement texture.',
            transform: {
                offset: finiteVector(TRANSFORM.offset),
                scale: finiteVector(TRANSFORM.scale),
                rotation: TRANSFORM.rotation,
            },
            points,
            unmodifiedBefore,
            unmodifiedAfter: textureState(sharedMaterial.map),
            ownedMaterialId: identity(material, 'material'),
            sharedMaterialId: identity(sharedMaterial, 'material'),
            ownedTextureId: identity(ownedTexture, 'texture'),
            sharedTextureId: identity(sharedTexture, 'texture'),
            initialPixels,
            mutatedPixels,
            freshPixels,
        },
    ];
}

async function runFilm(ctx, options) {
    const { THREE, own, sceneFor, draw, basic, identity } = ctx;
    const { asset, url } = await loadAsset(ctx, options, 'AU06', 'inspection-rig');
    const original = sourceMaterial(asset, 'AU06');
    if (!original.isMeshPhysicalMaterial)
        throw new UnsupportedThreeReferenceError('AU06', 'Source material is not MeshPhysicalMaterial.');
    const filmURL = options.resourceURLs?.['linear-film-rg'];
    if (typeof filmURL !== 'string')
        throw new UnsupportedThreeReferenceError('AU06', "resourceURLs['linear-film-rg'] is required.");
    const map = own(await new THREE.TextureLoader().loadAsync(filmURL));
    map.colorSpace = THREE.NoColorSpace;
    map.minFilter = THREE.NearestFilter;
    map.magFilter = THREE.NearestFilter;
    map.generateMipmaps = false;
    map.needsUpdate = true;
    const physical = () => {
        const value = own(original.clone());
        value.toneMapped = false;
        value.dithering = false;
        value.attenuationDistance = 10;
        return value;
    };
    const material = physical();
    const scene = sceneFor(material, true);
    // Compile the factor-zero starting state before either the factor or texture define changes.
    setFilm(THREE, material, { intensity: 0, ior: 1.3, minimum: 100, maximum: 400 });
    draw(scene);
    const samples = [];
    for (const textured of [false, true]) {
        for (const ior of [1, 1.2, 1.3, 2.33334, 2.5]) {
            const input = { intensity: 0.95, ior, minimum: 80, maximum: 670, texture: textured ? map : null };
            setFilm(THREE, material, input);
            const mutatedPixels = draw(scene);
            const fresh = await freshInspectionMaterial(ctx, options, 'AU06', (document) => {
                document.extensionsUsed = [
                    ...new Set([...(document.extensionsUsed || []), 'KHR_materials_iridescence']),
                ];
                const film = {
                    iridescenceFactor: 0.95,
                    iridescenceIor: ior,
                    iridescenceThicknessMinimum: 80,
                    iridescenceThicknessMaximum: 670,
                };
                if (textured) {
                    document.images ||= [];
                    document.textures ||= [];
                    document.samplers ||= [];
                    const source = document.images.push({ uri: new URL(filmURL, globalThis.location.href).href }) - 1;
                    const sampler = document.samplers.push({ magFilter: 9728, minFilter: 9728 }) - 1;
                    const index = document.textures.push({ source, sampler }) - 1;
                    film.iridescenceTexture = { index };
                    film.iridescenceThicknessTexture = { index };
                }
                document.materials[0].extensions ||= {};
                document.materials[0].extensions.KHR_materials_iridescence = film;
            });
            fresh.toneMapped = false;
            fresh.dithering = false;
            fresh.attenuationDistance = 10;
            samples.push({
                id: `${textured}/${ior}`,
                state: filmState(material, identity).state,
                mutatedPixels,
                freshPixels: draw(sceneFor(fresh, true)),
            });
        }
    }
    const linearMaterial = physical();
    linearMaterial.transmission = 0.25;
    linearMaterial.thickness = 0.4;
    linearMaterial.attenuationColor.copy(ctx.color(0.7, 0.8, 0.9));
    const volumeBefore = filmState(linearMaterial, identity).volume;
    setFilm(THREE, linearMaterial, { intensity: 0.8, ior: 1.3, minimum: 80, maximum: 670, texture: map });
    const texelPixels = draw(sceneFor(basic([1, 1, 1], { map })));
    const [minimum, maximum] = linearMaterial.iridescenceThicknessRange;
    const linearRG = {
        id: 'linear-rg',
        derivationScope: 'material-state-and-GPU-sampled-texel; not direct physical-shader scalar instrumentation',
        sampledPixels: texelPixels,
        materialState: filmState(linearMaterial, identity).state,
        factor: (linearMaterial.iridescence * texelPixels[0]) / 255,
        thickness: minimum + ((maximum - minimum) * texelPixels[1]) / 255,
        textureColorSpace: map.colorSpace === THREE.NoColorSpace ? 'linear-data' : map.colorSpace,
        volumeBefore,
        volumeAfter: filmState(linearMaterial, identity).volume,
    };
    linearRG.texturedPixels = draw(sceneFor(linearMaterial, true));
    // Construct the constant comparison independently from the fixed input, not from the
    // just-derived fields or sampled output, so a texture color-space error cannot cancel out.
    const constant = physical();
    constant.transmission = linearMaterial.transmission;
    constant.thickness = linearMaterial.thickness;
    constant.attenuationColor.copy(linearMaterial.attenuationColor);
    constant.iridescence = (0.8 * 64) / 255;
    constant.iridescenceIOR = 1.3;
    constant.iridescenceThicknessRange = [0, 80 + ((670 - 80) * 192) / 255];
    constant.iridescenceMap = null;
    constant.iridescenceThicknessMap = null;
    constant.needsUpdate = true;
    linearRG.constantPixels = draw(sceneFor(constant, true));
    linearMaterial.iridescenceThicknessMap = null;
    linearMaterial.needsUpdate = true;
    linearRG.noThicknessPixels = draw(sceneFor(linearMaterial, true));
    linearMaterial.iridescenceThicknessRange = [200, maximum];
    linearRG.noThicknessMinChangedPixels = draw(sceneFor(linearMaterial, true));
    // The independence case intentionally disables transmission. Nonzero transmission
    // physically depends on volume thickness and is not expected to remain pixel-identical.
    constant.transmission = 0;
    constant.thickness = 0;
    constant.needsUpdate = true;
    linearRG.volumeBeforePixels = draw(sceneFor(constant, true));
    constant.thickness = 100;
    linearRG.volumeAfterPixels = draw(sceneFor(constant, true));
    linearRG.volumePixelPairScope = { transmission: constant.transmission, thicknesses: [0, constant.thickness] };
    // The source's no-map branch uses the material maximum; this is a derived state observation,
    // not a claim that WebGL exposes the shader-local iridescenceThickness variable.
    linearRG.noThicknessTexture = linearMaterial.iridescenceThicknessRange[1];
    linearRG.noThicknessTextureMapId = linearMaterial.iridescenceThicknessMap;
    const attempts = [
        ['negative-factor', { intensity: -0.1 }],
        ['factor-over-one', { intensity: 1.01 }],
        ['ior-below-one', { ior: 0.99 }],
        ['negative-thickness', { minimum: -1 }],
        ['reversed-thickness', { minimum: 671 }],
        ['nonfinite', { intensity: Number.NaN }],
    ].map(([id, override]) => {
        const before = filmState(material, identity);
        let error = null;
        try {
            setFilm(THREE, material, {
                intensity: 0.95,
                ior: 1.3,
                minimum: 80,
                maximum: 670,
                texture: map,
                ...override,
            });
        } catch (caught) {
            error = caught;
        }
        return {
            id,
            rejected: error !== null,
            errorName: error?.name ?? null,
            before,
            after: filmState(material, identity),
        };
    });
    return [{ id: 'film-matrix', samples, resourceURL: url, filmURL }, linearRG, { id: 'invalid-values', attempts }];
}

function runBlend(ctx, { onlyOrder, includeComposition = true } = {}) {
    const { THREE, basic, geometry, draw, read, identity } = ctx;
    const rows = [];
    for (const first of onlyOrder ? [onlyOrder] : ['opaque', 'transparent']) {
        const makeOpaque = () => basic([1, 0, 0], { transparent: false, opacity: 1 });
        const makeTransparent = () =>
            basic([0, 0, 1], {
                transparent: true,
                opacity: 128 / 255,
                depthWrite: false,
                blending: THREE.NormalBlending,
                premultipliedAlpha: false,
            });
        const materials = {};
        for (const kind of first === 'opaque' ? ['opaque', 'transparent'] : ['transparent', 'opaque']) {
            materials[kind] = kind === 'opaque' ? makeOpaque() : makeTransparent();
        }
        const { opaque, transparent } = materials;
        const left = new THREE.Mesh(geometry, opaque);
        const right = new THREE.Mesh(geometry, transparent);
        left.position.x = -0.5;
        right.position.x = 0.5;
        left.scale.set(0.45, 0.8, 1);
        right.scale.set(0.45, 0.8, 1);
        const scene = new THREE.Scene();
        const alone = {};
        for (const kind of first === 'opaque' ? ['opaque', 'transparent'] : ['transparent', 'opaque']) {
            const mesh = kind === 'opaque' ? left : right;
            scene.add(mesh);
            alone[kind] = draw(scene, ctx.camera, ctx.target, kind === 'opaque' ? LEFT : RIGHT);
            scene.remove(mesh);
        }
        const opaqueAlone = alone.opaque;
        const transparentAlone = alone.transparent;
        scene.add(...(first === 'opaque' ? [left, right] : [right, left]));
        const opaqueTogether = draw(scene, ctx.camera, ctx.target, LEFT);
        const transparentTogether = read(ctx.target, RIGHT);
        rows.push({
            id: `${first}-first`,
            opaqueMaterialId: identity(opaque, 'material'),
            transparentMaterialId: identity(transparent, 'material'),
            opaqueAlone,
            opaqueTogether,
            transparentAlone,
            transparentTogether,
            opaqueROI: { ...LEFT },
            transparentROI: { ...RIGHT },
        });
    }
    for (const reverse of includeComposition ? [false, true] : []) {
        const scene = new THREE.Scene();
        const meshes = [
            [1, 0, 0],
            [0, 0, 1],
        ].map((rgb, i) => {
            const material = basic(rgb, {
                transparent: true,
                opacity: 128 / 255,
                depthTest: false,
                depthWrite: false,
                blending: THREE.NormalBlending,
                premultipliedAlpha: false,
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.renderOrder = reverse ? 1 - i : i;
            return mesh;
        });
        scene.add(...meshes);
        rows.push({ id: `source-over-${reverse ? 'reverse' : 'forward'}`, pixels: draw(scene) });
    }
    return rows;
}

function runTargets(ctx) {
    const { THREE, own, basic, sceneFor, identity, draw } = ctx;
    const targets = makeTargets(THREE).map((target) => {
        own(target);
        target.texture.colorSpace = THREE.LinearSRGBColorSpace;
        return target;
    });
    const scenes = [sceneFor(basic([1, 0, 0])), sceneFor(basic([0, 0, 1]))];
    const cameras = [ctx.camera.clone(), ctx.camera.clone()];
    const bindings = cameras.map((camera, i) => ({ camera, target: targets[i], scene: scenes[i] }));
    const submit = (binding) => draw(binding.scene, binding.camera, binding.target);
    const targetIds = targets.map((target) => identity(target, 'render-target'));
    const sizes = () => targets.map((target) => [target.width, target.height]);
    const first = {
        id: 'same-size-A-B-A',
        targetIds,
        cameraIds: cameras.map((camera) => identity(camera, 'camera')),
        sizes: sizes(),
        sequence: [submit(bindings[0]), submit(bindings[1]), submit(bindings[0])],
    };
    targets[0].setSize(256, 128);
    submit(bindings[0]);
    submit(bindings[1]);
    const resize = {
        id: 'resize-A',
        sizes: sizes(),
        cameraTargets: bindings.map((binding) => identity(binding.target, 'render-target')),
        associationScope:
            'Application bindings actually submitted through renderer.setRenderTarget, not a Camera property.',
    };
    let oldDisposeEvents = 0;
    const recordDisposal = () => {
        oldDisposeEvents++;
    };
    targets[1].addEventListener('dispose', recordDisposal);
    ctx.dispose(targets[1]);
    targets[1].removeEventListener('dispose', recordDisposal);
    const replacement = own(
        new THREE.WebGLRenderTarget(128, 64, {
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            depthBuffer: true,
            stencilBuffer: true,
            samples: 0,
        }),
    );
    replacement.texture.colorSpace = THREE.LinearSRGBColorSpace;
    bindings[1].target = replacement;
    return [
        first,
        resize,
        {
            id: 'recreate-B',
            newId: identity(replacement, 'render-target'),
            oldDisposeEvents,
            pixels: submit(bindings[1]),
        },
    ];
}

function instanceMeshes(root) {
    const meshes = [];
    root.traverse((node) => {
        if (node.isSkinnedMesh) meshes.push(node);
    });
    return meshes;
}

function nativeInstances(ctx, options, asset, count) {
    return makeInstances(ctx.THREE, options.cloneSkeleton, asset, count).map((instance) => {
        ctx.cleanup(() => instance.dispose());
        return instance;
    });
}

function instanceObservation(ctx, instance) {
    const mesh = instanceMeshes(instance.root)[0];
    if (!mesh?.skeleton || !mesh.material?.map || !instance.clips[0]) {
        throw new UnsupportedThreeReferenceError('AU04', 'Fixed skinned mesh, texture, or animation clip is missing.');
    }
    const bone = mesh.skeleton.bones.find((node) => node.name === 'RootBone');
    if (!bone || !mesh.morphTargetInfluences?.length) {
        throw new UnsupportedThreeReferenceError('AU04', 'Fixed RootBone or morph channel is missing.');
    }
    return {
        ancestor: { position: instance.root.position.toArray(), scale: instance.root.scale.toArray() },
        rootId: ctx.identity(instance.root, 'root'),
        skeletonId: ctx.identity(mesh.skeleton, 'skeleton'),
        mixerId: ctx.identity(instance.mixer, 'mixer'),
        materialId: ctx.identity(mesh.material, 'material'),
        geometryId: ctx.identity(mesh.geometry, 'geometry'),
        textureId: ctx.identity(mesh.material.map, 'texture'),
        clipId: ctx.identity(instance.clips[0], 'clip'),
        bone: bone.position.toArray(),
        weight: mesh.morphTargetInfluences[0],
    };
}

async function runInstances(ctx, options) {
    const { asset, groups, url } = await loadAsset(ctx, options, 'AU04', 'skin-rig');
    const instances = nativeInstances(ctx, options, asset, 3);
    const scene = new ctx.THREE.Scene();
    const camera = new ctx.THREE.OrthographicCamera(-64 / 9, 64 / 9, 4, -4, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    instances.forEach((instance, i) => {
        instance.root.scale.fromArray(
            [
                [0.5, 0.5, 1],
                [0.75, 0.3, 1],
                [-0.5, 0.75, 1],
            ][i],
        );
        instance.root.position.set((i - 1) * 2.5, 0, 0);
        instance.setTime([0.25, 0.75, 1.5][i]);
        scene.add(instance.root);
    });
    ctx.draw(scene, camera);
    const snapshots = instances.map((instance) => instanceObservation(ctx, instance));
    let sharedResourceDisposeEvents = 0;
    const record = () => {
        sharedResourceDisposeEvents++;
    };
    const shared = [...groups.geometries, ...groups.textures];
    shared.forEach((resource) => resource.addEventListener('dispose', record));
    instances[0].dispose();
    instances[0].dispose();
    const pixels = ctx.draw(scene, camera, ctx.target, { x: 0, y: 0, width: 128, height: 64 });
    const remaining = instances.slice(1).map((instance) => instanceObservation(ctx, instance));
    shared.forEach((resource) => resource.removeEventListener('dispose', record));
    return [
        { id: 'three-instances', resourceURL: url, instances: snapshots },
        { id: 'destroy-first', remaining, sharedResourceDisposeEvents, pixels },
    ];
}

function jointChains(mesh, root) {
    return mesh.skeleton.bones.map((bone) => {
        const chain = [];
        let current = bone;
        while (current) {
            chain.push({
                position: current.position.toArray(),
                rotation: current.quaternion.toArray(),
                scale: current.scale.toArray(),
            });
            if (current === root) return chain;
            current = current.parent;
        }
        throw new UnsupportedThreeReferenceError('AU09', 'Joint is not a descendant of the cloned instance root.');
    });
}

async function runSkinBounds(ctx, options) {
    const { THREE } = ctx;
    const { asset, url } = await loadAsset(ctx, options, 'AU09', 'skin-rig');
    ctx.target.setSize(640, 360);
    ctx.configuration.width = ctx.target.width;
    ctx.configuration.height = ctx.target.height;
    ctx.configuration.roi = { x: 0, y: 0, width: ctx.target.width, height: ctx.target.height };
    const camera = new THREE.OrthographicCamera(-64 / 9, 64 / 9, 4, -4, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    const rows = [];
    for (const channels of [3, 4]) {
        const scene = new THREE.Scene();
        const instances = nativeInstances(ctx, options, asset, 3);
        const selected = instances.map((instance) => {
            const meshes = instanceMeshes(instance.root);
            const mesh = meshes.find((value) => value.geometry.getAttribute('color')?.itemSize === channels);
            if (!mesh)
                throw new UnsupportedThreeReferenceError(
                    'AU09',
                    `Source rig has no ${channels}-channel vertex-color mesh.`,
                );
            meshes.forEach((value) => {
                value.visible = value === mesh;
            });
            return mesh;
        });
        instances.forEach((instance, i) => {
            instance.root.position.set((i - 1) * 2.5, 0, 0);
            instance.root.scale.fromArray(
                [
                    [0.5, 0.5, 1],
                    [0.75, 0.3, 1],
                    [-0.5, 0.75, 1],
                ][i],
            );
            instance.setTime([0.25, 0.75, 1.5][i]);
            scene.add(instance.root);
        });
        scene.updateMatrixWorld(true);
        const observations = instances.map((instance, i) => ({
            weight: selected[i].morphTargetInfluences[0],
            jointChains: jointChains(selected[i], instance.root),
            bounds: skinnedBounds(THREE, selected[i]),
        }));
        ctx.draw(scene, camera);
        instances.slice(1).forEach((instance) => instance.root.removeFromParent());
        const instance = instances[0],
            mesh = selected[0];
        const frustum = [];
        for (const weight of [-1, 0, 1]) {
            for (const x of [-8, 0, 8, 0]) {
                instance.root.position.set(x, 0, 0);
                mesh.morphTargetInfluences[0] = weight;
                scene.updateMatrixWorld(true);
                const bounds = skinnedBounds(THREE, mesh);
                const pixels = ctx.draw(scene, camera, ctx.target, {
                    x: 0,
                    y: 0,
                    width: ctx.target.width,
                    height: ctx.target.height,
                });
                let coloredPixels = 0;
                for (let pixel = 0; pixel < pixels.length; pixel += 4) {
                    if (pixels[pixel] > 8 || pixels[pixel + 1] > 8 || pixels[pixel + 2] > 8) coloredPixels++;
                }
                frustum.push({
                    weight,
                    x,
                    bounds,
                    jointChains: jointChains(mesh, instance.root),
                    coloredPixels,
                    drawCalls: ctx.renderer.info.render.calls,
                });
            }
        }
        rows.push({
            id: channels === 3 ? 'RGB' : 'RGBA',
            resourceURL: url,
            camera: {
                position: camera.position.toArray(),
                verticalHalfExtent: (camera.top - camera.bottom) / 2,
                aspect: (camera.right - camera.left) / (camera.top - camera.bottom),
            },
            instances: observations,
            frustum,
        });
    }
    return rows;
}

async function runLifecycle(ctx, options) {
    if (typeof globalThis.requestAnimationFrame !== 'function' || typeof globalThis.Event !== 'function') {
        throw new UnsupportedThreeReferenceError(
            'AU10',
            'Native requestAnimationFrame and Event are required for settlement.',
        );
    }
    if (typeof options.cloneSkeleton !== 'function') {
        throw new UnsupportedThreeReferenceError('AU10', 'The pinned public SkeletonUtils.clone function is required.');
    }
    const { THREE, draw, read, identity } = ctx;
    const ledger = ownershipLedger();
    const scene = new THREE.Scene();
    const nextFrame = () => new Promise((resolve) => globalThis.requestAnimationFrame(resolve));
    const seenRoots = new WeakSet();
    const seenGeometries = new WeakSet();
    const registerAsset = async () => {
        const loaded = await loadAsset(ctx, options, 'AU10', 'skin-rig');
        const { asset, groups } = loaded;
        const cacheObservation = {
            nativeLoaderCacheEnabled: THREE.Cache.enabled,
            reusedSceneObject: seenRoots.has(asset.scene),
            reusedGeometryObjects: [...groups.geometries].filter((value) => seenGeometries.has(value)).length,
            httpCacheHit: null,
        };
        seenRoots.add(asset.scene);
        groups.geometries.forEach((value) => seenGeometries.add(value));
        for (const [kind, resources] of Object.entries(groups)) {
            if (kind !== 'skeletons') resources.forEach((resource) => ledger.own(kind, resource));
        }
        const disposalEvents = {};
        const handlers = new Map();
        for (const kind of ['materials', 'textures', 'geometries', 'skeletons']) {
            for (const resource of groups[kind]) {
                if (kind === 'skeletons') continue; // Skeleton.dispose has no dispose event API.
                const key = identity(resource, kind);
                disposalEvents[key] = 0;
                const handler = () => {
                    disposalEvents[key]++;
                };
                resource.addEventListener('dispose', handler);
                handlers.set(resource, handler);
            }
        }
        let disposed = false;
        const release = ctx.cleanup(() => {
            if (disposed) return;
            disposed = true;
            for (const root of groups.roots) {
                root.removeFromParent();
                ledger.release('roots', root);
            }
            for (const kind of ['materials', 'textures', 'geometries', 'skeletons']) {
                for (const resource of groups[kind]) {
                    ctx.dispose(resource);
                    if (kind !== 'skeletons') ledger.release(kind, resource);
                }
            }
        });
        const removeObservers = () =>
            handlers.forEach((handler, resource) => resource.removeEventListener('dispose', handler));
        return { asset, groups, release, cacheObservation, disposalEvents, removeObservers };
    };
    const registerInstances = (asset, count) =>
        makeInstances(THREE, options.cloneSkeleton, asset, count).map((instance) => {
            ledger.own('roots', instance.root);
            const materials = new Set();
            const skeletons = new Set();
            instance.root.traverse((node) => {
                if (node.skeleton) skeletons.add(node.skeleton);
                for (const material of Array.isArray(node.material)
                    ? node.material
                    : node.material
                      ? [node.material]
                      : []) {
                    ledger.own('materials', material);
                    materials.add(material);
                }
            });
            const disposalEvents = {};
            const handlers = new Map();
            for (const material of materials) {
                const key = identity(material, 'material');
                disposalEvents[key] = 0;
                const handler = () => {
                    disposalEvents[key]++;
                };
                material.addEventListener('dispose', handler);
                handlers.set(material, handler);
            }
            const release = ctx.cleanup(() => {
                // Invoke the primitive again on the second release: its native cleanup guard,
                // not this collector, is responsible for protecting borrowed shared resources.
                instance.dispose();
                ledger.release('roots', instance.root);
                materials.forEach((material) => ledger.release('materials', material));
            });
            scene.add(instance.root);
            return {
                ...instance,
                release,
                materials,
                skeletons,
                disposalEvents,
                removeObservers: () =>
                    handlers.forEach((handler, resource) => resource.removeEventListener('dispose', handler)),
            };
        });
    const snapshotInstance = (instance) => {
        const bones = [],
            morphs = [],
            materials = [];
        instance.root.traverse((node) => {
            if (node.isBone)
                bones.push({
                    name: node.name,
                    position: node.position.toArray(),
                    quaternion: node.quaternion.toArray(),
                });
            if (node.morphTargetInfluences) morphs.push([...node.morphTargetInfluences]);
            for (const material of Array.isArray(node.material)
                ? node.material
                : node.material
                  ? [node.material]
                  : []) {
                materials.push({
                    id: identity(material, 'material'),
                    color: material.color.toArray(),
                    opacity: material.opacity,
                });
            }
        });
        return { rootId: identity(instance.root, 'root'), mixerTime: instance.mixer.time, bones, morphs, materials };
    };
    const base = await registerAsset();
    const survivors = registerInstances(base.asset, 2);
    survivors.forEach((instance, i) => {
        instance.root.scale.setScalar(0.35);
        instance.root.position.set(i ? 0.25 : -0.75, 0, 0);
        instance.setTime([0.125, 0.375][i]);
    });
    const updateAndDraw = () => {
        survivors.forEach((instance) => instance.mixer.update(0));
        scene.updateMatrixWorld(true);
        draw(scene);
        return {
            submission: ctx.renderer.info.render.frame,
            pixels: [...read(ctx.target, LEFT), ...read(ctx.target, RIGHT)],
        };
    };
    // Establish the retained-resource baseline only after native animation updates and GPU work settle.
    await nextFrame();
    updateAndDraw();
    await nextFrame();
    const baselineFrame = updateAndDraw();
    await Promise.resolve();
    const baseline = ledger.snapshot();
    const survivorBefore = survivors.map(snapshotInstance);
    const cycles = [];
    for (let cycle = 0; cycle < 30; cycle++) {
        const loaded = await registerAsset();
        const [instance] = registerInstances(loaded.asset, 1);
        instance.root.scale.setScalar(0.3);
        instance.root.position.set(-0.1, -0.3, 0.1);
        const beforeChange = snapshotInstance(instance);
        instance.setTime((cycle + 1) / 64);
        instance.materials.forEach((material) => {
            material.color.setRGB(0.2 + (cycle % 3) * 0.1, 0.6, 0.3, THREE.LinearSRGBColorSpace);
            material.needsUpdate = true;
        });
        instance.mixer.update(0);
        const afterChange = snapshotInstance(instance);
        const listenerType = `three-reference-lifecycle-${cycle}`;
        let listenerCalls = 0;
        const listener = ledger.own('listeners', () => {
            listenerCalls++;
        });
        const canvas = ctx.renderer.domElement;
        canvas.addEventListener(listenerType, listener);
        const removeListener = ctx.cleanup(() => canvas.removeEventListener(listenerType, listener));
        canvas.dispatchEvent(new Event(listenerType));
        const livePixels = draw(scene);
        const releaseErrors = [];
        try {
            instance.release();
            instance.release();
            loaded.release();
            loaded.release();
            for (const events of [instance.disposalEvents, loaded.disposalEvents]) {
                for (const [id, count] of Object.entries(events)) {
                    if (count !== 1)
                        throw new Error(`${id}: expected one disposal after two releases, observed ${count}`);
                }
            }
            if (instance.root.parent !== null) throw new Error('Released instance remained attached');
        } catch (error) {
            releaseErrors.push({ kind: 'native-resource-release', message: String(error?.message || error) });
        }
        instance.removeObservers();
        loaded.removeObservers();
        try {
            removeListener();
            canvas.dispatchEvent(new Event(listenerType));
            if (listenerCalls !== 1) throw new Error('Listener remained live after removal');
            ledger.release('listeners', listener);
        } catch (error) {
            releaseErrors.push({ kind: 'listener-release', message: String(error?.message || error) });
        }
        const submissions = [],
            settlementPixels = [];
        for (let frame = 0; frame < 2; frame++) {
            await nextFrame();
            const observed = updateAndDraw();
            submissions.push(observed.submission);
            settlementPixels.push(observed.pixels);
        }
        await Promise.resolve();
        cycles.push({
            cycle,
            load: {
                url: options.resourceURLs['skin-rig'],
                assetId: identity(loaded.asset, 'asset'),
                completed: Boolean(loaded.asset.scene),
                reusedSurvivorAsset: loaded.asset === base.asset,
            },
            cacheObservation: loaded.cacheObservation,
            beforeChange,
            afterChange,
            livePixels,
            releaseCalls: 2,
            instanceDisposalEvents: instance.disposalEvents,
            assetDisposalEvents: loaded.disposalEvents,
            listenerCalls,
            submissions,
            settlementPixels,
            survivorBefore,
            survivorAfter: survivors.map(snapshotInstance),
            survivorBeforePixels: baselineFrame.pixels,
            survivorAfterPixels: settlementPixels.at(-1),
            releaseErrors,
            retained: ledger.snapshot(),
        });
    }
    return [
        {
            id: 'thirty-cycles',
            baseline,
            cycles,
            totalGpuMemoryBytes: ledger.totalGpuMemoryBytes,
            survivorCount: survivors.length,
            ownershipScope:
                'Actual application-owned loaded roots, cloned materials, asset textures/geometries and listeners; not renderer-internal allocations.',
            settlementScope:
                'AnimationMixer.update(0), scene matrix update, real render submission/readback on two animation callbacks, then a microtask checkpoint.',
        },
    ];
}

function requireTaskOptions(taskId, options) {
    const resourceIds = {
        AU04: ['skin-rig'],
        AU05: ['inspection-rig', 'checker'],
        AU06: ['inspection-rig', 'checker', 'linear-film-rg'],
        AU09: ['skin-rig'],
        AU10: ['skin-rig'],
    }[taskId];
    if (resourceIds) {
        if (typeof options.GLTFLoader !== 'function') {
            throw new UnsupportedThreeReferenceError(taskId, 'Supply the pinned public GLTFLoader constructor.');
        }
        for (const id of resourceIds) {
            if (typeof options.resourceURLs?.[id] !== 'string' || !options.resourceURLs[id]) {
                throw new UnsupportedThreeReferenceError(
                    taskId,
                    `resourceURLs['${id}'] must bind the frozen public resource.`,
                );
            }
        }
    }
    if (['AU04', 'AU09', 'AU10'].includes(taskId) && typeof options.cloneSkeleton !== 'function') {
        throw new UnsupportedThreeReferenceError(taskId, 'Supply the pinned public SkeletonUtils.clone function.');
    }
}

/**
 * Run one supported configuration in an already running browser. Resource/addon options bind
 * the pinned public sources. Unsupported tasks/options throw without producing partial reports.
 * On success the caller MUST invoke report.close() after taking any screenshots. The disposer
 * is non-enumerable and is omitted by JSON.stringify. Errors clean up before being rethrown.
 */
export async function runThreeReference(taskId, options = {}) {
    if (!SUPPORTED.includes(taskId)) {
        throw new UnsupportedThreeReferenceError(
            taskId,
            GAPS[taskId] || 'Unknown task ID. Expected AU01 through AU12.',
        );
    }
    requireTaskOptions(taskId, options);
    let ctx = makeContext(taskId, options);
    try {
        const runners = {
            AU04: runInstances,
            AU05: runOwnedUV,
            AU06: runFilm,
            AU08: runTargets,
            AU09: runSkinBounds,
            AU10: runLifecycle,
        };
        let cases;
        if (taskId === 'AU07') {
            // Test first-use material/program construction in separate real renderer instances.
            // Reusing a previously warmed program cache would not test the reverse first use.
            const first = runBlend(ctx, { onlyOrder: 'opaque', includeComposition: false });
            ctx.close();
            ctx = makeContext(taskId, options);
            cases = [...first, ...runBlend(ctx, { onlyOrder: 'transparent' })];
        } else {
            cases = await runners[taskId](ctx, options);
        }
        ctx.present();
        const report = {
            schema: SCHEMA,
            taskId,
            contractId: `${SCHEMA}:${taskId}`,
            engine: 'three',
            status: 'OBSERVED_NOT_VALIDATED',
            cases,
            collection: {
                source: 'native-public-three-APIs-and-WebGLRenderTarget-readback',
                revision: String(options.THREE.REVISION),
                configuration: ctx.configuration,
                evidenceScope:
                    'GPU offscreen readback and canvas preview, not authenticated compositor presentation or package authentication.',
            },
        };
        Object.defineProperty(report, 'close', { value: () => ctx.close(), enumerable: false });
        return report;
    } catch (error) {
        ctx.close();
        throw error;
    }
}
