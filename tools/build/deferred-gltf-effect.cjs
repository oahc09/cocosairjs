/* Build-time partition of frozen tables; the checked source files stay unchanged. */
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const MagicString = require('magic-string');

const marker = 'undefined /* AIR_DEFERRED_GLTF_EFFECT */';

function table(code, symbol) {
    const prefix = `export const ${symbol} = `;
    const start = code.indexOf(prefix) + prefix.length;
    const end = code.lastIndexOf(';');
    if (start < prefix.length || end <= start) throw Error(`Unexpected generated ${symbol} table`);
    const data = JSON.parse(code.slice(start, end));
    if (!Array.isArray(data)) throw Error(`Unexpected generated ${symbol} table`);
    return { start, end, data };
}

function deferredGltfEffect(root) {
    const builtin = (name) => resolve(root, 'src/air/builtin', name);
    const effectFile = builtin('builtin-effects.ts');
    const effectTable = table(readFileSync(effectFile, 'utf8'), 'effects');
    const stageFile = builtin('builtin-glsl4.ts');
    const stageTable = table(readFileSync(stageFile, 'utf8'), 'glsl4');
    const effects = effectTable.data;
    const stages = stageTable.data;
    const name = 'air-gltf-template';
    const index = effects.findIndex((effect) => effect.name === name);
    if (index < 0 || effects.filter((effect) => effect.name === name).length !== 1
        || stages.length !== effects.length
        || effects.some((effect, i) => !Array.isArray(stages[i]) || effect.shaders.length !== stages[i].length)) {
        throw Error('Misaligned deferred glTF effect tables');
    }
    const payload = JSON.stringify({ effect: effects[index], stages: stages[index] });
    const hash = createHash('sha256').update(payload);
    const integrity = `sha256-${hash.copy().digest('base64')}`;
    const fileName = `air-gltf-effect-${hash.digest('hex')}.json`;
    const registrar = builtin('register.ts');
    const transforms = new Map([
        [effectFile, ['effects', effects]],
        [stageFile, ['glsl4', stages]],
    ]);
    const touched = new Set();
    return {
        plugin: {
            name: 'air-deferred-gltf-effect',
            transform(code, id) {
                const file = resolve(id);
                const edit = transforms.get(file);
                if (!edit && file !== registrar) return null;
                const source = new MagicString(code);
                if (edit) {
                    const [symbol, expected] = edit;
                    const { start, end, data } = table(code, symbol);
                    if (JSON.stringify(data) !== JSON.stringify(expected)) throw Error(`Stale input for ${symbol}`);
                    source.overwrite(start, end, JSON.stringify(data.filter((_, i) => i !== index)));
                } else {
                    const at = code.indexOf(marker);
                    if (at < 0 || at !== code.lastIndexOf(marker)) throw Error('Missing deferred glTF marker');
                    source.overwrite(at, at + marker.length, `{url:new URL('./${fileName}',import.meta.url).href,integrity:'${integrity}'}`);
                }
                touched.add(file);
                return { code: source.toString(), map: source.generateMap({ hires: true }) };
            },
        },
        publish(output) {
            if (touched.size !== 3) throw Error('Incomplete deferred glTF build');
            writeFileSync(resolve(output, fileName), payload);
        },
    };
}
module.exports = { deferredGltfEffect };
