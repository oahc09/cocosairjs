/** Protected preparation reference for exactly three@0.186.1.
 * Only public APIs: no source internals, generated answers, or oracle imports.
 * Exported primitives are executable; browser collection status is separately admitted.
 */
const aborted = () => Object.assign(new Error('Reference load cancelled'), { name: 'AbortError' });
const ensureActive = (signal) => {
    if (signal?.aborted) throw aborted();
};
const finite = (v) => {
    if (!Number.isFinite(v)) throw new RangeError('finite value required');
    return v;
};
export function requestInit(policy, url, documentURL, signal) {
    const target = new URL(url, documentURL),
        origin = new URL(documentURL).origin;
    const priority = policy.priority ?? 'auto',
        cache = policy.httpCache ?? 'default';
    if (!['auto', 'low', 'high'].includes(priority)) throw new RangeError('Invalid priority');
    if (!['default', 'no-store', 'reload', 'no-cache', 'force-cache', 'only-if-cached'].includes(cache))
        throw new RangeError('Invalid HTTP cache mode');
    if (cache === 'only-if-cached' && target.origin !== origin)
        throw new RangeError('only-if-cached requires same origin');
    return {
        priority,
        cache,
        mode: cache === 'only-if-cached' ? 'same-origin' : 'cors',
        credentials: policy.credentials ?? 'same-origin',
        redirect: 'error',
        signal,
        headers: target.origin === origin ? new Headers(policy.headers || {}) : new Headers(),
    };
}
/** No global fetch/loader patches or shared AbortController: one independent load operation. */
export async function loadFixedDocument({
    loader,
    url,
    policy = {},
    signal,
    fetchImpl = fetch,
    createURL = URL.createObjectURL,
    revokeURL = URL.revokeObjectURL,
    onRequest = () => {},
    onProgress = () => {},
}) {
    const documentURL = new URL(url, globalThis.location?.href).href,
        urls = [];
    const fetchResource = async (resource, role) => {
        ensureActive(signal);
        const init = requestInit(policy, resource, documentURL, signal);
        onRequest({ url: resource, role, init });
        const response = await fetchImpl(resource, init);
        ensureActive(signal);
        if (!response.ok)
            throw Object.assign(new Error(`HTTP ${response.status}: ${resource}`), { status: response.status });
        const bytes = await response.arrayBuffer();
        ensureActive(signal);
        onProgress({ role, bytes: bytes.byteLength });
        return { bytes, mime: response.headers.get('content-type') || 'application/octet-stream' };
    };
    try {
        const main = await fetchResource(documentURL, 'document');
        const document = JSON.parse(new TextDecoder().decode(main.bytes));
        if (document.asset?.version !== '2.0') throw new Error('Expected fixed glTF 2.0 document');
        // Fixed uncompressed public resources only. Decoder-provider requests need a distinct collector.
        for (const [name, role] of [
            ['buffers', 'buffer'],
            ['images', 'image'],
        ]) {
            await Promise.all(
                (document[name] || []).map(async (entry) => {
                    if (!entry.uri || /^(data:|blob:)/.test(entry.uri)) return;
                    const resource = await fetchResource(new URL(entry.uri, documentURL).href, role);
                    const objectURL = createURL(new Blob([resource.bytes], { type: resource.mime }));
                    urls.push(objectURL);
                    entry.uri = objectURL;
                }),
            );
        }
        ensureActive(signal);
        const asset = await loader.parseAsync(JSON.stringify(document), new URL('.', documentURL).href);
        if (signal?.aborted) {
            disposeAsset(asset);
            throw aborted();
        }
        return asset;
    } finally {
        urls.forEach(revokeURL);
    }
}
export function disposeAsset(asset) {
    const owned = new Set();
    for (const scene of asset.scenes || [asset.scene])
        scene?.traverse((node) => {
            if (node.geometry) owned.add(node.geometry);
            for (const material of Array.isArray(node.material)
                ? node.material
                : node.material
                  ? [node.material]
                  : []) {
                owned.add(material);
                for (const value of Object.values(material)) if (value?.isTexture) owned.add(value);
            }
            if (node.skeleton) owned.add(node.skeleton);
        });
    for (const value of owned) value.dispose();
}
export function makeInstances(THREE, cloneSkeleton, asset, count = 3) {
    return Array.from({ length: count }, () => {
        const root = cloneSkeleton(asset.scene),
            materials = new Set(),
            skeletons = new Set();
        root.traverse((node) => {
            if (node.material) {
                const cloned = (Array.isArray(node.material) ? node.material : [node.material]).map((m) => m.clone());
                cloned.forEach((m) => materials.add(m));
                node.material = Array.isArray(node.material) ? cloned : cloned[0];
            }
            if (node.skeleton) skeletons.add(node.skeleton);
        });
        const mixer = new THREE.AnimationMixer(root);
        for (const clip of asset.animations) mixer.clipAction(clip).play();
        let released = false;
        return {
            root,
            mixer,
            clips: asset.animations,
            setTime(time) {
                mixer.setTime(finite(time));
            },
            dispose() {
                if (released) return;
                released = true;
                root.removeFromParent();
                mixer.stopAllAction();
                mixer.uncacheRoot(root);
                materials.forEach((m) => m.dispose());
                skeletons.forEach((s) => s.dispose());
                // Geometry, image textures and clips are borrowed; never dispose them here.
            },
        };
    });
}
/** The common task explicitly defines positive mathematical T*R*S, avoiding engine rotation conventions. */
export function ownedUV(material, { offset, scale, rotation }) {
    if (!material.map) throw new Error('base-color texture required');
    [...offset, ...scale, rotation].forEach(finite);
    if (offset.length !== 2 || scale.length !== 2) throw new RangeError('2D UV transform required');
    const texture = material.map.clone(),
        c = Math.cos(rotation),
        s = Math.sin(rotation);
    texture.matrixAutoUpdate = false;
    texture.matrix.set(scale[0] * c, -scale[1] * s, offset[0], scale[0] * s, scale[1] * c, offset[1], 0, 0, 1);
    texture.offset.fromArray(offset);
    texture.repeat.fromArray(scale);
    texture.rotation = rotation;
    material.map = texture;
    material.needsUpdate = true;
    return texture;
}
export function setFilm(THREE, material, { intensity, ior, minimum, maximum, texture = null }) {
    [intensity, ior, minimum, maximum].forEach(finite);
    if (intensity < 0 || intensity > 1 || ior < 1 || minimum < 0 || maximum < minimum)
        throw new RangeError('Invalid film factor, IOR or nanometer range');
    if (!material.isMeshPhysicalMaterial) throw new TypeError('MeshPhysicalMaterial required');
    if (texture) texture.colorSpace = THREE.NoColorSpace;
    material.iridescence = intensity;
    material.iridescenceIOR = ior;
    material.iridescenceThicknessRange = [minimum, maximum];
    material.iridescenceMap = texture;
    material.iridescenceThicknessMap = texture;
    material.needsUpdate = true;
}
export function makeTargets(THREE) {
    return [0, 1].map(
        () =>
            new THREE.WebGLRenderTarget(128, 64, {
                format: THREE.RGBAFormat,
                type: THREE.UnsignedByteType,
                depthBuffer: true,
                stencilBuffer: true,
                samples: 0,
            }),
    );
}
export function renderTarget(renderer, scene, camera, target) {
    const prior = renderer.getRenderTarget();
    try {
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
    } finally {
        renderer.setRenderTarget(prior);
    }
}
export function skinnedBounds(THREE, mesh) {
    mesh.updateWorldMatrix(true, false);
    mesh.skeleton.update();
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    const world = mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    return { min: world.min.toArray(), max: world.max.toArray() };
}
/** Never infers GPU memory from renderer.info or fabricated bytes. Tracks only explicitly owned handles. */
export function ownershipLedger() {
    const values = new Map(
        ['roots', 'materials', 'textures', 'geometries', 'listeners'].map((key) => [key, new Set()]),
    );
    return {
        own(kind, object) {
            if (!values.has(kind)) throw new TypeError('unknown ownership kind');
            values.get(kind).add(object);
            return object;
        },
        release(kind, object) {
            values.get(kind).delete(object);
        },
        snapshot() {
            return Object.fromEntries([...values].map(([key, set]) => [key, set.size]));
        },
        totalGpuMemoryBytes: null,
    };
}
/** Read-only observation consumes application-issued promises/receipts. It never renders, compiles or ticks. */
export async function observeFirstFrame({
    engineCreated,
    resources,
    passes,
    submission,
    presentation,
    snapshotBusiness,
}) {
    const before = structuredClone(snapshotBusiness()),
        stages = [];
    for (const [name, promise] of [
        ['engine-created', engineCreated],
        ['declared-resources', resources],
        ['scene-passes', passes],
    ]) {
        await promise;
        stages.push(name);
    }
    const submitted = await submission;
    stages.push('frame-submitted');
    const presented = await presentation(submitted);
    stages.push('browser-presented');
    return {
        stages,
        businessBefore: before,
        businessAfter: structuredClone(snapshotBusiness()),
        submissionId: submitted.id,
        presentation: presented,
        observerRenderCalls: 0,
        observerCompileCalls: 0,
    };
}
