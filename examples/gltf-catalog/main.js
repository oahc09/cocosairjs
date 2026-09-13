const $ = (id) => document.getElementById(id);
const catalog = await (await fetch('./catalog.json')).json();
const modelList = $('model-list');
const air = $('air-preview');
const reference = $('reference-preview');
let selected;
let comparing = false;
let request = 0;
let timeout;
const tags = { core: '核心', extension: '扩展', testing: '测试', showcase: '展示', pbrtest: 'PBR' };
const currentURL = new URL(location.href);
const sourceURL = (model, variant) => `${catalog.assetRoot}${encodeURIComponent(model.name)}/${encodeURIComponent(variant)}/${model.variants[variant].split('/').map(encodeURIComponent).join('/')}`;
const defaultVariant = (model) => catalog.local[model.name]?.variant || (model.variants['glTF-Binary'] ? 'glTF-Binary' : model.variants.glTF ? 'glTF' : Object.keys(model.variants)[0]);

$('total-count').textContent = catalog.models.length;
$('catalog-source').href = catalog.source;
$('snapshot-date').textContent = `SNAPSHOT ${catalog.generatedAt.slice(0, 10)} · ${catalog.revision.slice(0, 8)}`;
$('filter').querySelector('[value=local]').textContent = `本地已核验 · ${Object.keys(catalog.local).length}`;

function renderList() {
    const search = $('search').value.trim().toLowerCase();
    const filter = $('filter').value;
    const models = catalog.models.filter((model) => {
        const matches = !search || [model.name, model.label, ...(model.tags || []), ...(model.tags || []).map((tag) => tags[tag] || '')].join(' ').toLowerCase().includes(search);
        return matches && (filter === 'all' || (filter === 'local' ? !!catalog.local[model.name] : model.tags?.includes(filter)));
    });
    $('result-count').textContent = `${models.length} / ${catalog.models.length} 个模型`;
    $('empty').hidden = models.length > 0;
    const fragment = document.createDocumentFragment();
    for (const model of models) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'model-row'; button.dataset.model = model.name;
        button.setAttribute('aria-current', String(selected?.name === model.name));
        button.setAttribute('aria-label', model.label || model.name);
        const thumb = document.createElement('span'); thumb.className = 'thumb'; thumb.textContent = model.name.slice(0, 2).toUpperCase();
        if (model.screenshot) {
            const image = document.createElement('img'); image.loading = 'lazy'; image.alt = ''; image.referrerPolicy = 'no-referrer';
            image.src = `${catalog.assetRoot}${encodeURIComponent(model.name)}/${model.screenshot.split('/').map(encodeURIComponent).join('/')}`;
            image.addEventListener('error', () => image.remove(), { once: true }); thumb.append(image);
        }
        const copy = document.createElement('span'); copy.className = 'model-copy';
        const title = document.createElement('strong'); title.textContent = model.label || model.name;
        const formats = document.createElement('small');
        if (catalog.local[model.name]) { const local = document.createElement('span'); local.className = 'local-label'; local.textContent = '● LOCAL'; formats.append(local); }
        formats.append(`${Object.keys(model.variants).length} FORMATS${model.tags?.includes('extension') ? ' · EXT' : ''}`);
        copy.append(title, formats); button.append(thumb, copy);
        button.addEventListener('click', () => selectModel(model)); fragment.append(button);
    }
    modelList.replaceChildren(fragment);
}

function updateLinks() {
    const variant = $('variant').value;
    const url = sourceURL(selected, variant);
    const viewer = `https://github.khronos.org/glTF-Sample-Viewer-Release/?model=${encodeURIComponent(url)}`;
    $('official-link').href = viewer; $('reference-external').href = viewer; $('asset-link').href = url;
    $('model-source').href = `https://github.com/KhronosGroup/glTF-Sample-Assets/tree/${catalog.revision}/Models/${encodeURIComponent(selected.name)}`;
    return { url, viewer };
}
function loadPreview() {
    const { url, viewer } = updateLinks();
    const local = catalog.local[selected.name];
    const usesLocal = local?.variant === $('variant').value;
    const asset = usesLocal ? new URL(local.url, location.href).href : url;
    const id = String(++request);
    const query = new URLSearchParams({ embed: '1', url: asset, model: selected.variants[$('variant').value], label: selected.label || selected.name, request: id });
    $('air-state').textContent = 'LOADING'; $('load-status').removeAttribute('data-error'); $('retry').hidden = true;
    $('load-status').textContent = usesLocal ? '正在加载与官方版本逐字节核对过的本地副本…' : '正在按需下载官方模型。文件大小和扩展支持情况可能影响加载。';
    $('model-description').textContent = `${selected.name} · ${(selected.tags || []).map((tag) => tags[tag] || tag).join(' / ')} · ${usesLocal ? '本地已核验' : '远程文件，尚未验证'}`;
    air.src = `../gltf-viewer/?${query}`;
    clearTimeout(timeout);
    timeout = setTimeout(() => {
        $('air-state').textContent = 'WAITING'; $('load-status').textContent = '加载尚未完成，可能受模型体积或网络影响。可以重试，或打开官方 Viewer 对照。'; $('retry').hidden = false;
    }, 45000);
    if (comparing) loadReference(viewer);
    currentURL.searchParams.set('model', selected.name); currentURL.searchParams.set('variant', $('variant').value);
    history.replaceState(null, '', currentURL);
}
function loadReference(url) {
    $('reference-placeholder').hidden = false;
    reference.src = url;
}
function selectModel(model, variant) {
    selected = model;
    $('model-title').textContent = model.label || model.name;
    $('variant').replaceChildren(...Object.keys(model.variants).map((name) => new Option(name === 'glTF-Binary' ? 'GLB · glTF-Binary' : name, name)));
    $('variant').value = model.variants[variant] ? variant : defaultVariant(model);
    $('variant').disabled = false; $('compare').disabled = false; $('reset-camera').disabled = false;
    for (const row of modelList.children) row.setAttribute('aria-current', String(row.dataset.model === model.name));
    modelList.querySelector('[aria-current=true]')?.scrollIntoView({ block: 'nearest' });
    loadPreview();
}
window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== air.contentWindow || event.data?.type !== 'gltf-viewer:status' || event.data.request !== String(request)) return;
    const { state, message } = event.data;
    if (state !== 'loading') clearTimeout(timeout);
    $('air-state').textContent = state === 'loaded' ? 'READY' : state === 'error' ? 'ERROR' : 'LOADING';
    $('load-status').textContent = message;
    $('load-status').toggleAttribute('data-error', state === 'error'); $('retry').hidden = state !== 'error';
});
reference.addEventListener('load', () => { $('reference-placeholder').hidden = true; });
$('search').addEventListener('input', renderList); $('filter').addEventListener('change', renderList);
$('variant').addEventListener('change', loadPreview); $('retry').addEventListener('click', loadPreview);
$('reset-camera').addEventListener('click', () => air.contentWindow.postMessage({ type: 'gltf-viewer:reset' }, location.origin));
$('compare').addEventListener('click', () => {
    comparing = !comparing;
    $('compare').setAttribute('aria-pressed', String(comparing)); $('compare').textContent = comparing ? '关闭官方对照' : '开启官方对照';
    $('stages').classList.toggle('comparing', comparing); $('reference-stage').hidden = !comparing;
    reference.src = 'about:blank';
    if (comparing) loadReference(updateLinks().viewer);
});
renderList();
selectModel(catalog.models.find((model) => model.name === currentURL.searchParams.get('model')) || catalog.models.find((model) => model.name === 'BoxTextured') || catalog.models[0], currentURL.searchParams.get('variant'));

// Extension capabilities matrix (machine-readable source: ./capabilities.json, regenerated by
// tools/verify/update-capabilities.cjs from the live registry + browser evidence mapping).
try {
    const capabilities = await (await fetch('./capabilities.json')).json();
    const levelLabel = { 'browser-evidence': '真机证据', smoke: '无头测试', cataloged: '未验证' };
    const statusLabel = { supported: '支持', 'decoder-required': '需解码器', 'device-dependent': '视设备', fallback: '回退', unsupported: '不支持' };
    $('capability-rows').innerHTML = capabilities.extensions.map((entry) => `<p class='capability'><b>${entry.name}</b> · ${statusLabel[entry.status] ?? entry.status}`
        + (entry.reason ? `（${entry.reason}）` : '')
        + ` · 验证：${levelLabel[entry.verified.level] ?? entry.verified.level}`
        + (entry.verified.smoke ? ` · ${entry.verified.smoke}` : '')
        + (entry.verified.decoder ? ` · decoder ${entry.verified.decoder}` : '')
        + (entry.officialComparison ? ` · 官方对照 ${entry.officialComparison.model}${entry.officialComparison.available ? '' : '（目录未收录）'}（${entry.officialComparison.comparison}）` : '')
        + `</p>`).join('');
    $('capability-meta').textContent = `${capabilities.extensions.length} 项 · catalog revision ${capabilities.catalogRevision.slice(0, 8)} · 生成于 ${capabilities.generatedAt.slice(0, 10)} · 稳定错误码 ${capabilities.errorCodes.length} 个 · 解码器清单 ${capabilities.decoderManifest}`;
} catch (error) { $('capability-rows').textContent = 'capabilities.json 不可用：' + error.message; }
