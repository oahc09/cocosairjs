/* playwright-cli run-code --filename=tools/verify/capabilities-runtime-browser.js
 * Emits the live extension-support matrix (registry + default options) as the ### Result
 * JSON consumed by tools/verify/update-capabilities.cjs. Also asserts every planned
 * coverage entry is present so a missing handler registration fails here, not downstream. */
async (page) => {
    const origin = /^https?:/.test(page.url()) ? new URL(page.url()).origin : 'http://127.0.0.1:7462';
    await page.goto(`${origin}/gltf-viewer/`);
    const matrix = await page.evaluate(async () => {
        const { GLTFLoader } = await import('/build/cocosair.module.js');
        return new GLTFLoader().getExtensionSupport().map((entry) => ({
            name: entry.name, status: entry.status, reason: entry.reason ?? null,
        }));
    });
    const EXPECT = ['KHR_materials_unlit', 'KHR_texture_transform', 'KHR_mesh_quantization', 'EXT_meshopt_compression',
        'KHR_meshopt_compression', 'KHR_draco_mesh_compression', 'KHR_lights_punctual', 'EXT_mesh_gpu_instancing',
        'EXT_texture_webp', 'EXT_texture_avif', 'KHR_texture_basisu', 'KHR_materials_emissive_strength',
        'KHR_materials_ior', 'KHR_materials_specular', 'KHR_materials_clearcoat', 'KHR_materials_anisotropy',
        'KHR_materials_iridescence', 'EXT_materials_bump',
        'KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_dispersion'];
    const missing = EXPECT.filter((name) => !matrix.some((m) => m.name === name));
    return JSON.stringify({ missing, matrix });
}
