/* One-time V1.1 inventory reconciliation. Run with --write after reviewing --check. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const { findSymbolLine } = require('./spec-evidence.cjs');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'examples/files.json'), 'utf8'));
const write = process.argv.includes('--write');
const removed = new Set(['MeshRenderer.ON', 'MeshRenderer.OFF', 'Texture2D.base']);
const geometry = new Set(['Ray', 'AABB', 'intersect']);
const rendererCamera = new Set([
    'Camera.worldMatrixToScreen',
    'Camera.getClipSpaceMinz',
    'Camera.calculateObliqueMat',
    'Camera.pipeline',
    'Camera.setViewportInOrientedSpace',
]);
const rendererLight = new Set(['Light.attachToScene', 'Light.detachFromScene', 'Light.update', 'Light.destroy']);
const dragonBonesClasses = new Set([
    'DragonBonesAsset',
    'DragonBonesAtlasAsset',
    'ArmatureDisplay',
    'CCFactory',
    'Armature',
    'ArmatureData',
    'DragonBonesData',
    'Animation',
    'AnimationCacheMode',
]);

function replacement(api, exampleId) {
    if (exampleId === 'render-composite' && api === 'renderer.scene.Light.destroy') return 'Component.destroy';
    if (exampleId === 'light-attach-cycle' && api === 'renderer.scene.Light.update')
        return 'renderer.scene.DirectionalLight.update';
    if (removed.has(api)) return null;
    if (geometry.has(api)) return `geometry.${api}`;
    if (rendererCamera.has(api)) return `renderer.scene.${api}`;
    if (rendererLight.has(api)) return `renderer.scene.${api}`;
    if (api === 'Camera.SKYBOX') return 'Camera.ClearFlag';
    if (api === 'BatchingUtility.constructor') return 'BatchingUtility';
    if (api === 'ColorKey.constructor') return 'ColorKey';
    if (api.startsWith('ColorTimeline.')) return `sp.spine.${api}`;
    if (api.startsWith('Layers.') && api !== 'Layers.Enum') return 'Layers.Enum';
    if (api === 'Light.LUMINOUS_FLUX' || api === 'Light.LUMINANCE') return 'Light.PhotometricTerm';
    if (api === 'math.Color.h' || api === 'math.Color.s' || api === 'math.Color.v') return 'math.Color.toHSV';
    if (api === 'VideoPlayer.REMOTE' || api === 'VideoPlayer.LOCAL') return 'VideoPlayer.ResourceType';
    if (exampleId === 'dragonbones-basic' && dragonBonesClasses.has(api.split('.')[0])) return `dragonBones.${api}`;
    return api;
}

let changed = 0;
for (const example of manifest.examples) {
    const file = path.join(root, 'examples', example.dir, 'example.json');
    const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
    const before = JSON.stringify(spec);
    const mapList = (items) => [...new Set((items || []).map((api) => replacement(api, example.id)).filter(Boolean))];
    if (Array.isArray(spec.apiClaims)) spec.apiClaims = mapList(spec.apiClaims);
    if (spec.api) {
        for (const key of ['primary', 'supporting', 'claims']) {
            if (Array.isArray(spec.api[key])) spec.api[key] = mapList(spec.api[key]);
        }
        if (Array.isArray(spec.api.evidence)) {
            const mapped = spec.api.evidence.flatMap((entry) => {
                const api = replacement(entry.api, example.id);
                return api ? [{ ...entry, api }] : [];
            });
            const seen = new Set();
            spec.api.evidence = mapped.filter((entry) => {
                if (seen.has(entry.api)) return false;
                seen.add(entry.api);
                const found = findSymbolLine(path.dirname(file), entry.source, entry.api);
                if (!found.error) entry.sourceLocation = `L${found.line}`;
                return true;
            });
        }
    }
    if (JSON.stringify(spec) === before) continue;
    changed++;
    console.log(`[api-reconcile] ${example.id}`);
    if (write) fs.writeFileSync(file, JSON.stringify(spec, null, 2) + '\n');
}
console.log(`[api-reconcile] ${changed} changed; ${write ? 'written' : 'dry run'}`);
