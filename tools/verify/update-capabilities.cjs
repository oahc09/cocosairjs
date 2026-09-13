/* T8: regenerate examples/gltf-catalog/capabilities.json - the machine-readable extension
 * matrix (Gate G5 handoff contract; V0.5.1 consumes it directly, no re-maintained list).
 *
 * Two stages (both required, both fail-loud):
 *   1. tools/verify/capabilities-runtime-browser.js (via the playwright wrapper) returns the
 *      LIVE support matrix from the built bundle in a real browser (registry + defaults +
 *      device), and asserts every planned handler is registered.
 *   2. this tool merges that live matrix with the static evidence table (which smoke suite /
 *      browser script proves each extension, and the official model to pixel-compare against
 *      in T8) and writes capabilities.json.
 *
 * verification.level:
 *   'browser-evidence' - real WebGL2 driver proof (tools/verify/gltf-*-browser.js ok:true)
 *   'smoke'            - headless jest suite green, no separate browser pixel proof yet
 *   'cataloged'        - in the matrix but no automated proof (T8 comparison pending)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'examples/gltf-catalog/catalog.json'), 'utf8'));
const PW = process.env.PWCLI || 'C:/Users/caosh/.agents/skills/playwright/scripts/playwright_cli.sh';

function liveMatrix () {
    const command = `bash "${PW}" run-code --filename=tools/verify/capabilities-runtime-browser.js`;
    let out;
    try {
        out = execSync(command, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    } catch (error) {
        if (!/is not open/.test(String(error.stdout) + String(error.stderr) + error.message)) { throw error; }
        execSync(`bash "${PW}" open about:blank`, { cwd: root, stdio: 'ignore' });
        out = execSync(command, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    }
    const line = out.split('\n').find((l) => l.trim().startsWith('"{'));
    if (!line) { throw new Error('no ### Result payload from the browser script'); }
    const payload = JSON.parse(JSON.parse(line.trim()));
    if (payload.missing.length) { throw new Error('unregistered handlers: ' + payload.missing.join(', ')); }
    return payload.matrix;
}

// Which automated evidence proves each extension today.
const VERIFIED = {
    'KHR_materials_unlit': { level: 'browser-evidence', smoke: 'smoke-07/10', evidence: 'gltf-browser.js' },
    'KHR_texture_transform': { level: 'browser-evidence', smoke: 'smoke-07', evidence: 'texture-transform-browser.js' },
    'KHR_mesh_quantization': { level: 'smoke', smoke: 'smoke-11' },
    'EXT_meshopt_compression': { level: 'smoke', smoke: 'smoke-11', decoder: 'meshopt/meshopt_decoder.cjs' },
    'KHR_meshopt_compression': { level: 'smoke', smoke: 'smoke-11', decoder: 'meshopt/meshopt_decoder.cjs' },
    'KHR_draco_mesh_compression': { level: 'smoke', smoke: 'smoke-11', decoder: 'draco/draco3d.js' },
    'KHR_lights_punctual': { level: 'browser-evidence', smoke: 'smoke-12', evidence: 'gltf-scene-browser.js' },
    'EXT_mesh_gpu_instancing': { level: 'browser-evidence', smoke: 'smoke-12', evidence: 'gltf-scene-browser.js' },
    'EXT_texture_webp': { level: 'browser-evidence', smoke: 'smoke-13', evidence: 'gltf-webp-browser.js' },
    'EXT_texture_avif': { level: 'browser-evidence', smoke: 'smoke-13', evidence: 'gltf-webp-browser.js' },
    'KHR_texture_basisu': { level: 'browser-evidence', smoke: 'smoke-14', decoder: 'basis/basis_transcoder.js', evidence: 'gltf-ktx2-browser.js' },
    'KHR_materials_emissive_strength': { level: 'browser-evidence', smoke: 'smoke-15', evidence: 'gltf-physical-browser.js' },
    'KHR_materials_ior': { level: 'browser-evidence', smoke: 'smoke-15', evidence: 'gltf-physical-browser.js' },
    'KHR_materials_specular': { level: 'browser-evidence', smoke: 'smoke-15', evidence: 'gltf-physical-browser.js' },
    'KHR_materials_clearcoat': { level: 'browser-evidence', smoke: 'smoke-16', evidence: 'gltf-clearcoat-browser.js' },
    'KHR_materials_anisotropy': { level: 'browser-evidence', smoke: 'smoke-17', evidence: 'gltf-anisotropy-browser.js' },
    'KHR_materials_iridescence': { level: 'browser-evidence', smoke: 'smoke-18', evidence: 'gltf-iridescence-browser.js' },
    'EXT_materials_bump': { level: 'browser-evidence', smoke: 'smoke-19', evidence: 'gltf-bump-browser.js' },
    'KHR_materials_transmission': { level: 'browser-evidence', smoke: 'smoke-20', evidence: 'gltf-transmission-browser.js' },
    'KHR_materials_volume': { level: 'browser-evidence', smoke: 'smoke-20', evidence: 'gltf-transmission-browser.js' },
    'KHR_materials_dispersion': { level: 'browser-evidence', smoke: 'smoke-20', evidence: 'gltf-transmission-browser.js' },
};

// Official model each extension was loaded against in T8 acceptance (pinned revision,
// gltf-official-materials-browser.js). Absent entries remain 'pending-T8'.
const ACCEPTED = {
    'KHR_materials_emissive_strength': 'EmissiveStrengthTest',
    'KHR_materials_ior': 'IORTestGrid',
    'KHR_materials_specular': 'SpecularTest',
    'KHR_materials_clearcoat': 'ClearCoatTest',
    'KHR_materials_anisotropy': 'AnisotropyStrengthTest + AnisotropyRotationTest',
    'KHR_materials_iridescence': 'CompareIridescence',
    'KHR_materials_transmission': 'CompareTransmission + IORTestGrid',
    'KHR_materials_volume': 'CompareVolume',
    'KHR_materials_dispersion': 'CompareDispersion',
};
// Official model to pixel-compare against during T8 (from the pinned catalog where present).
const OFFICIAL_MODELS = {
    'KHR_materials_clearcoat': 'MaterialsVariantsShading',
    'KHR_materials_anisotropy': 'AnisotropyPlane',
    'KHR_materials_iridescence': 'IridescenceDielectricSpheres',
    'KHR_materials_transmission': 'TransmissionTest',
    'KHR_materials_volume': 'Volka',
    'KHR_materials_dispersion': 'DispersionTest',
    'KHR_texture_basisu': 'KhronosBasisuSampleSet',
    'KHR_materials_specular': 'MaterialsVariantsShading',
    'KHR_materials_emissive_strength': 'MaterialEmissiveStrengthTest',
    'KHR_materials_ior': 'MaterialIORTest',
    'EXT_texture_webp': 'WebpTest',
    'EXT_texture_avif': 'AvifTest',
    'KHR_lights_punctual': 'LightingPunctualLights',
    'EXT_mesh_gpu_instancing': 'SimpleInstancing',
};

const matrix = liveMatrix().map((entry) => {
    const v = VERIFIED[entry.name];
    const model = OFFICIAL_MODELS[entry.name];
    const inCatalog = model ? catalog.models.some((m) => m.name === model) : false;
    return {
        name: entry.name,
        status: entry.status,
        reason: entry.reason ?? null,
        verified: v ? { level: v.level, smoke: v.smoke ?? null, evidence: v.evidence ?? null, decoder: v.decoder ?? null } : { level: 'cataloged' },
        officialComparison: model ? { model, available: inCatalog,
            comparison: ACCEPTED[entry.name] ? 'verified-official-load' : 'pending-T8' }
            : (ACCEPTED[entry.name] ? { model: ACCEPTED[entry.name], available: true, comparison: 'verified-official-load' } : null),
    };
});

const capabilities = {
    engine: 'cocosair',
    engineVersion: require(path.join(root, 'package.json')).version,
    generatedAt: new Date().toISOString(),
    catalogRevision: catalog.revision,
    decoderManifest: 'build/gltf-decoders/MANIFEST.md',
    errorCodes: [
        'GLTF_EXTENSION_UNSUPPORTED', 'GLTF_DECODER_MISSING', 'GLTF_DEVICE_UNSUPPORTED',
        'GLTF_EXTENSION_INVALID', 'GLTF_DECODE_FAILED',
    ],
    extensions: matrix,
};
const out = path.join(root, 'examples/gltf-catalog/capabilities.json');
fs.writeFileSync(out, JSON.stringify(capabilities, null, 2) + '\n');
const evidence = matrix.filter((m) => m.verified.level === 'browser-evidence').length;
const smokeOnly = matrix.filter((m) => m.verified.level === 'smoke').length;
console.log(`capabilities.json: ${matrix.length} extensions (${evidence} browser-evidence, ${smokeOnly} smoke-only, ${matrix.length - evidence - smokeOnly} cataloged)`);
