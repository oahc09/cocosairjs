/* Isolated deferred glTF template probe. The shipped SDK is never modified. */
const fs = require('node:fs');
const path = require('node:path');
const { parseData } = require('./profile-probe.cjs');
const { digest, identity, writeNew } = require('./evidence.cjs');
const { verifySourceBinding } = require('../../build/source-binding.cjs');
const { stripRuntimeSourceMap } = require('../../build/runtime-layout.cjs');

const name = 'air-gltf-template';
const deferFile = 'optional-gltf-effect.json';

function once(code, needle, replacement, label) {
    const index = code.indexOf(needle);
    if (index < 0 || code.indexOf(needle, index + needle.length) >= 0) throw new Error('Unexpected ' + label);
    return code.slice(0, index) + replacement + code.slice(index + needle.length);
}

function build(root, bundle, output) {
    const proof = verifySourceBinding(root, bundle);
    if (!proof.matches) throw new Error('Unbound runtime input');
    const read = (file, symbol) =>
        parseData(fs.readFileSync(path.join(root, 'src/air/builtin', file), 'utf8'), symbol).data;
    const effects = read('builtin-effects.ts', 'effects');
    const stages = read('builtin-glsl4.ts', 'glsl4');
    const targets = effects.map((effect, i) => (effect.name === name ? i : -1)).filter((i) => i >= 0);
    if (
        targets.length !== 1 ||
        stages.length !== effects.length ||
        effects.some((effect, i) => effect.shaders.length !== stages[i].length)
    )
        throw new Error('Mismatched template tables');
    const index = targets[0];
    const payload = Buffer.from(JSON.stringify({ effect: effects[index], stages: stages[index] }));
    const expectedHash = digest(payload);
    let code = fs.readFileSync(bundle, 'utf8');
    for (const table of [effects, stages]) {
        const original = JSON.stringify(table);
        const smaller = JSON.stringify(table.filter((_, i) => i !== index));
        code = once(code, '=' + original + ';\n', '=' + smaller + ';\n', 'serialized table');
    }

    const seam =
        '        await parser.resolvePrimitives();\n        parser.throwIfAborted();\n        const materials = new Map();';
    code = once(
        code,
        seam,
        seam.replace(
            '        const materials',
            `        if ((json.meshes || []).some((mesh) => mesh.primitives.length)) {
          await parser.wait(prepareProbeGltfTemplate);
          parser.throwIfAborted();
        }
        const materials`,
        ),
        'glTF preparation seam',
    );

    const registrar = 'function registerBuiltinAirAssets() {';
    const lower = 'toGlsl3$1';
    if (
        !code.includes('function ' + lower + '(src)') ||
        !code.includes('const effect = Object.assign(new EffectAsset(), e);')
    ) {
        throw new Error('Unexpected source-assembly bindings');
    }
    const support = `let probeGltfTemplatePromise;
function prepareProbeGltfTemplate() {
  if (EffectAsset.get('${name}')) return Promise.resolve();
  if (!probeGltfTemplatePromise) {
    probeGltfTemplatePromise = fetch(new URL('./${deferFile}', import.meta.url)).then(async (response) => {
      if (!response.ok) throw new Error('Optional glTF effect HTTP ' + response.status);
      const bytes = await response.arrayBuffer();
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      const actual = Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, '0')).join('');
      if (actual !== '${expectedHash}') throw new Error('Optional glTF effect identity mismatch');
      const { effect, stages } = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (effect?.name !== '${name}' || !Array.isArray(effect.shaders) || !Array.isArray(stages)
          || effect.shaders.length !== stages.length || !Array.isArray(effect.techniques)
          || stages.some((stage) => typeof stage?.vert !== 'string' || typeof stage?.frag !== 'string')) {
        throw new Error('Invalid optional glTF effect');
      }
      if (EffectAsset.get('${name}')) return;
      const asset = Object.assign(new EffectAsset(), effect);
      asset.shaders.forEach((info, index) => {
        const source = stages[index];
        info.glsl4 = source;
        info.glsl3 = { vert: ${lower}(source.vert), frag: ${lower}(source.frag) };
      });
      asset.hideInEditor = true;
      asset.onLoaded();
    }).catch((error) => {
      probeGltfTemplatePromise = undefined;
      throw error;
    });
  }
  return probeGltfTemplatePromise;
}
`;
    code = once(code, registrar, support + registrar, 'builtin registration');
    fs.mkdirSync(output);
    const runtime = Buffer.from(stripRuntimeSourceMap(code));

    fs.writeFileSync(path.join(output, 'runtime.mjs'), runtime, { flag: 'wx' });
    fs.writeFileSync(path.join(output, deferFile), payload, { flag: 'wx' });
    writeNew(path.join(output, 'receipt.json'), {
        scope: 'glTF-specific source-bound post-build diagnostic, not a package profile',
        sourceBindingSha256: proof.receiptSha256,
        deferredEffect: name,
        runtime: identity(runtime),
        payload: identity(payload),
    });
}

if (require.main === module) {
    try {
        if (process.argv.length !== 4)
            throw new Error('Usage: node lazy-gltf-probe.cjs <source-bound-sdk.js> <new-output>');
        build(path.resolve(__dirname, '../../..'), path.resolve(process.argv[2]), process.argv[3]);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
