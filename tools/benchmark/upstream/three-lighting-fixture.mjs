const params = new URLSearchParams(location.search);
const arm = params.get('arm');
const target = params.get('renderer');
const w = 640;
const h = 320;
const fallback = target === 'fallback';
const classic = target === 'classic';
if (!['before', 'transition', 'rollback'].includes(arm) || (!fallback && !classic))
    throw Error('Bad fixture parameters');
const THREE = await import('./' + arm + (classic ? '-classic' : '') + '.mjs');
const canvas = document.createElement('canvas');
const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true });
if (!gl) throw Error('Real WebGL2 context missing');
document.body.append(canvas);
const renderer = classic
    ? new THREE.WebGLRenderer({ canvas, context: gl })
    : new THREE.WebGPURenderer({ canvas, context: gl, forceWebGL: true, alpha: false, antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(w, h);
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
if (fallback) {
    await renderer.init();
    if (!renderer.backend.isWebGLBackend || renderer.backend.getContext() !== gl) throw Error('Unverified backend');
}
const camera = new THREE.PerspectiveCamera(40, w / h, 1, 100);
camera.position.z = 14;
camera.updateMatrixWorld(true);
const geo = new THREE.SphereGeometry(0.4, 64, 32);
const sample = (point) => {
    const x = Math.floor(((point.x + 1) * w) / 2);
    const y = Math.floor(((point.y + 1) * h) / 2);
    const values = [];
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
            const bytes = new Uint8Array(4);
            gl.readPixels(x + dx, y + dy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
            values.push(Array.from(bytes));
        }
    if (gl.getError() !== gl.NO_ERROR) throw Error('WebGL error in readback');
    return { x, y, rgba: [0, 1, 2, 3].map((i) => values.map((v) => v[i]).sort((a, b) => a - b)[4]), values };
};
function sphere(scene, x, y, metalness, roughness) {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ metalness, roughness }));
    m.position.set(x, y, 0);
    scene.add(m);
    return m;
}
function compute(scene, meshes) {
    renderer.render(scene, camera);
    return {
        background: sample(new THREE.Vector3(-0.97, 0.9, 0)),
        spheres: meshes.map((mesh) => ({
            metalness: mesh.material.metalness,
            roughness: mesh.material.roughness,
            ...sample(mesh.position.clone().project(camera)),
        })),
    };
}
const environment = () => {
    const data = new Float32Array(64 * 32 * 4);
    for (let i = 0; i < data.length; i += 4) data.set([0.25, 0.25, 0.25, 1], i);
    const texture = new THREE.DataTexture(data, 64, 32, THREE.RGBAFormat, THREE.FloatType);
    texture.colorSpace = THREE.LinearSRGBColorSpace;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
};
const envMap = environment();
const probe = new THREE.LightProbe();
probe.sh.coefficients[0].setScalar(Math.sqrt(4 * Math.PI) * 0.25);
const probeResults = [];
for (const envOn of [false, true])
    for (const probeOn of [false, true]) {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0.08, 0.08, 0.08);
        if (probeOn) scene.add(probe);
        if (envOn) scene.environment = envMap;
        const probes = [
            sphere(scene, -1, 0.6, 1, 0.1),
            sphere(scene, 1, 0.6, 0, 0.1),
            sphere(scene, -1, -0.6, 1, 0.7),
            sphere(scene, 1, -0.6, 0, 0.7),
        ];
        probeResults.push({ envOn, probeOn, ...compute(scene, probes) });
        probes.forEach((m) => m.material.dispose());
    }
const furnaceScene = new THREE.Scene();
furnaceScene.background = new THREE.Color(1, 1, 1);
furnaceScene.add(new THREE.AmbientLight(0xffffff, Math.PI));
const spheres = [];
for (const metal of [1, 0])
    for (let step = 0; step <= 10; step++)
        spheres.push(sphere(furnaceScene, step - 5, (metal - 0.5) * 1.2, metal, step / 10));
const furnace = compute(furnaceScene, spheres);
const ext = gl.getExtension('WEBGL_debug_renderer_info');
const navGpu = navigator.gpu;
const adapt = navGpu ? await navGpu.requestAdapter().catch(() => null) : null;
window.__report = {
    arm,
    target,
    backend: fallback ? renderer.backend.constructor.name : 'classic WebGLRenderer',
    webgpuAdapter: !!adapt,
    webgpuTimestampQuery: adapt?.features.has('timestamp-query') ?? false,
    revision: THREE.REVISION,
    width: w,
    height: h,
    dpr: renderer.getPixelRatio(),
    colorSpace: renderer.outputColorSpace,
    toneMapping: 'Reinhard',
    toneMappingExposure: renderer.toneMappingExposure,
    glVersion: gl.getParameter(gl.VERSION),
    glRenderer: gl.getParameter(gl.RENDERER),
    unmaskedRenderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
    browser: navigator.userAgent,
    furnace,
    lightProbe: probeResults,
    scoring: false,
    physicalDisplayValidated: false,
};
