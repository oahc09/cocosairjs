/* Snapshot the same model-index.json used by Khronos' GltfModelPathProvider. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../..');
const repo = 'KhronosGroup/glTF-Sample-Assets';
const headers = { 'User-Agent': 'cocosair-model-catalog' };
async function json(url) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    return response.json();
}
(async () => {
    const commit = await json(`https://api.github.com/repos/${repo}/commits/main`);
    const revision = commit.sha;
    const entry = await json(`https://api.github.com/repos/${repo}/contents/Models/model-index.json?ref=${revision}`);
    if (entry.encoding !== 'base64') throw new Error('Missing official index bytes');
    const models = JSON.parse(Buffer.from(entry.content, 'base64').toString('utf8'));
    const tree = await json(`https://api.github.com/repos/${repo}/git/trees/${revision}?recursive=1`);
    if (tree.truncated) throw new Error('Incomplete asset tree');
    const files = new Map(tree.tree.map((file) => [file.path, file.sha]));
    const candidates = [
        ['BoxTextured', 'glTF-Binary', 'BoxTextured.glb'],
        ['SimpleSkin', 'glTF', 'SimpleSkin.gltf'],
        ['AnimatedMorphCube', 'glTF-Binary', 'AnimatedMorphCube.glb'],
        ['SimpleSparseAccessor', 'glTF-Embedded', 'official/SimpleSparseAccessor.gltf'],
        ['InterpolationTest', 'glTF-Binary', 'official/InterpolationTest.glb'],
        ['VertexColorTest', 'glTF-Binary', 'official/VertexColorTest.glb'],
    ];
    const local = {};
    function matches(localFile, upstreamPath) {
        if (!fs.existsSync(localFile)) return false;
        const bytes = fs.readFileSync(localFile);
        const hash = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
        return hash === files.get(upstreamPath);
    }
    for (const [name, variant, relative] of candidates) {
        const model = models.find((model) => model.name === name);
        const filename = model?.variants?.[variant];
        if (!filename) continue;
        const disk = path.join(root, 'examples/gltf-viewer/assets', relative);
        const upstream = `Models/${name}/${variant}/${filename}`;
        if (!matches(disk, upstream)) continue;
        if (filename.endsWith('.gltf')) {
            const document = JSON.parse(fs.readFileSync(disk, 'utf8'));
            const dependencies = [...(document.buffers || []), ...(document.images || [])].map((item) => item.uri).filter((uri) => uri && !uri.startsWith('data:'));
            if (!dependencies.every((uri) => uri === path.basename(uri) && matches(path.join(path.dirname(disk), uri), `Models/${name}/${variant}/${uri}`))) continue;
        }
        local[name] = { variant, url: `../gltf-viewer/assets/${relative}`, verifiedGitBlob: files.get(upstream) };
    }
    const catalog = { revision, generatedAt: new Date().toISOString(),
        source: `https://github.com/${repo}/blob/${revision}/Models/model-index.json`,
        assetRoot: `https://raw.githubusercontent.com/${repo}/${revision}/Models/`, models, local };
    const destination = path.join(root, 'examples/gltf-catalog/catalog.json');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(catalog, null, 2) + '\n');
    console.log(`${models.length} official models; ${Object.keys(local).length} byte-verified local copies; ${revision}`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
