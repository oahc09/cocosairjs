/* Download only the selected official test assets, pinned to a reproducible upstream commit. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const revision = '90d7ede14c7e280af263824604b427a1ca02cb66';
const base = `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/${revision}/Models/`;
const directory = path.resolve(__dirname, '../../examples/gltf-viewer/assets/official');
const entries = [
    ['SimpleSparseAccessor', 'glTF-Embedded/SimpleSparseAccessor.gltf'],
    ['InterpolationTest', 'glTF-Binary/InterpolationTest.glb'],
    ['VertexColorTest', 'glTF-Binary/VertexColorTest.glb'],
    // T8 acceptance set: one official sample per V0.5-delivered capability, pinned to the
    // same revision as the model catalog.
    ['EmissiveStrengthTest', 'glTF-Binary/EmissiveStrengthTest.glb'],
    ['IORTestGrid', 'glTF-Binary/IORTestGrid.glb'],
    ['SpecularTest', 'glTF-Binary/SpecularTest.glb'],
    ['ClearCoatTest', 'glTF-Binary/ClearCoatTest.glb'],
    ['AnisotropyStrengthTest', 'glTF-Binary/AnisotropyStrengthTest.glb'],
    ['AnisotropyRotationTest', 'glTF-Binary/AnisotropyRotationTest.glb'],
    ['CompareIridescence', 'glTF-Binary/CompareIridescence.glb'],
    ['CompareTransmission', 'glTF-Binary/CompareTransmission.glb'],
    ['CompareVolume', 'glTF-Binary/CompareVolume.glb'],
    ['CompareDispersion', 'glTF-Binary/CompareDispersion.glb'],
];
async function get(url, attempt = 0) {
    try { return await getOnce(url); }
    catch (error) {
        if (attempt >= 3) { throw error; }
        console.log(`retry ${attempt + 1}: ${url.slice(base.length)} (${error.message})`);
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        return get(url, attempt + 1);
    }
}
async function getOnce(url) {
    const relative = url.slice(base.length);
    const apiURL = `https://api.github.com/repos/KhronosGroup/glTF-Sample-Assets/contents/Models/${relative}?ref=${revision}`;
    const headers = { 'User-Agent': 'cocosair-gltf-verification', Accept: 'application/vnd.github+json' };
    const response = await fetch(apiURL, { headers, signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    let metadata = await response.json();
    // The Contents API omits inline bytes above 1 MB; the Git blob API preserves them.
    if (metadata.encoding !== 'base64') {
        const blob = await fetch(metadata.git_url, { headers, signal: AbortSignal.timeout(90000) });
        if (!blob.ok) throw new Error(`${blob.status}: ${metadata.git_url}`);
        metadata = await blob.json();
    }
    if (metadata.encoding !== 'base64') throw new Error(`Missing raw content: ${url}`);
    return Buffer.from(metadata.content, 'base64');
}
(async () => {
    fs.mkdirSync(directory, { recursive: true });
    const records = [];
    for (const [name, file] of entries) {
        const url = `${base}${name}/${file}`;
        const localPath = path.join(directory, path.basename(file));
        // Idempotent re-runs (GitHub API rate limits): reuse already-fetched bytes from the
        // pinned revision; hash is recomputed and recorded either way.
        const data = fs.existsSync(localPath) ? fs.readFileSync(localPath) : await get(url);
        const local = path.basename(file);
        fs.mkdirSync(path.dirname(path.join(directory, local)), { recursive: true });
        fs.writeFileSync(path.join(directory, local), data);
        const licensePath = path.join(directory, `${name}.LICENSE.md`);
        const readme = fs.existsSync(licensePath) ? fs.readFileSync(licensePath, 'utf8') : (await get(`${base}${name}/README.md`)).toString('utf8');
        const legal = readme.slice(readme.indexOf('## Legal')).replace(/<!--[^]*?-->/g, '').trim();
        if (!legal.startsWith('## Legal')) throw new Error(`Missing attribution for ${name}`);
        const upstream = `https://github.com/KhronosGroup/glTF-Sample-Assets/blob/${revision}/Models/${name}/README.md`;
        fs.writeFileSync(path.join(directory, `${name}.LICENSE.md`), `# ${name}\n\n[Upstream README](${upstream})\n\n${legal}\n`);
        records.push({ name, file: local, revision, url, sha256: crypto.createHash('sha256').update(data).digest('hex'), bytes: data.length });
        fs.writeFileSync(path.join(directory, 'manifest.json'), `${JSON.stringify(records, null, 2)}\n`);
        console.log(`${local}: ${data.length} bytes`);
    }
    const generatorRevision = '3d99767e9a67fbfe109f0d298c1e8d909bcac9db';
    for (const file of ['Material_AlphaBlend_00.gltf', 'Material_AlphaBlend_00.bin', 'LICENSE']) {
        const sourcePath = file === 'LICENSE' ? file : `Output/Positive/Material_AlphaBlend/${file}`;
        const url = `https://api.github.com/repos/KhronosGroup/glTF-Asset-Generator/contents/${sourcePath}?ref=${generatorRevision}`;
        const localExisting = path.join(directory, file === 'LICENSE' ? 'AssetGenerator.LICENSE.txt' : file);
        const bytes = fs.existsSync(localExisting) ? fs.readFileSync(localExisting) : await (async () => {
            const response = await fetch(url, { headers: { 'User-Agent': 'cocosair-gltf-verification', Accept: 'application/vnd.github.raw+json' }, signal: AbortSignal.timeout(30000) });
            if (!response.ok) throw new Error(`${response.status}: ${url}`);
            return Buffer.from(await response.arrayBuffer());
        })();
        const local = file === 'LICENSE' ? 'AssetGenerator.LICENSE.txt' : file;
        fs.writeFileSync(path.join(directory, local), bytes);
        records.push({ name: 'Material_AlphaBlend_00', file: local, revision: generatorRevision,
            url: `https://github.com/KhronosGroup/glTF-Asset-Generator/blob/${generatorRevision}/${sourcePath}`,
            sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
        console.log(`${local}: ${bytes.length} bytes`);
    }
    fs.writeFileSync(path.join(directory, 'manifest.json'), `${JSON.stringify(records, null, 2)}\n`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
