/* Exercise the actual pure source transform without initializing an engine or mocking the transform. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');
const assert = require('node:assert/strict');
const file = path.resolve(__dirname, '../../src/cocos/gfx/webgpu/webgpu-commands.ts');
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
const transform = source.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'seperateCombinedSamplerTexture',
);
const offset = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((node) => [...node.declarationList.declarations])
    .find((node) => node.name.getText(source) === 'SEPARATE_SAMPLER_BINDING_OFFSET');
assert(transform && offset && ts.isNumericLiteral(offset.initializer));
const moduleRecord = { exports: {} };
vm.runInNewContext(
    ts.transpileModule(transform.getText(source) + '\nmodule.exports=seperateCombinedSamplerTexture;', {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText,
    { module: moduleRecord, SEPARATE_SAMPLER_BINDING_OFFSET: Number(offset.initializer.text) },
);
const convert = moduleRecord.exports;
test('signed and unsigned combined samplers retain texture and constructor scalar types', () => {
    for (const [prefix, dimension] of [
        ['u', '2D'],
        ['i', '2DArray'],
        ['', 'Cube'],
    ]) {
        const builtin = dimension === 'Cube' ? 'texture' : 'texelFetch';
        const coordinates = dimension === 'Cube' ? 'vec3(0,0,1)' : dimension === '2DArray' ? 'ivec3(0)' : 'ivec2(0)';
        const input = `precision highp float;layout(set = 0, binding = 4) uniform highp ${prefix}sampler${dimension} source;void main(){${prefix}vec4 value=${builtin}(source,${coordinates}${builtin === 'texelFetch' ? ',0' : ''});}`;
        const output = convert(input);
        assert(output.includes(`uniform ${prefix}texture${dimension} source;`), output);
        assert(output.includes(`${builtin}(${prefix}sampler${dimension}(source, source_sampler),`), output);
        assert(output.includes('4 + 64) uniform sampler source_sampler;'), output);
    }
});
test('compact layout spelling and sampler function parameters preserve unsigned identity', () => {
    const output = convert(
        'precision highp float;layout(set=0,binding=7) uniform usampler2D ids;uvec4 fetchID(usampler2D image, ivec2 p) { return texelFetch(image,p,0); } void main(){uvec4 id=fetchID(ids,ivec2(0));}',
    );
    assert(output.includes('uniform utexture2D ids;'), output);
    assert.match(output, /utexture2D image, sampler image_sampler/);
    assert(output.includes('texelFetch(usampler2D(image, image_sampler),'), output);
    assert(output.includes('fetchID(ids, ids_sampler,'), output);
});
test('already separate samplers are not rewritten as nonexistent texture types', () => {
    const output = convert(
        'precision highp float;layout(set = 0, binding = 7) uniform utexture2D ids;layout(set = 0, binding = 71) uniform sampler ids_sampler;void main(){}',
    );
    assert(output.includes('uniform utexture2D ids;'));
    assert(output.includes('uniform sampler ids_sampler;'));
    assert(!output.includes('uniform texture ids_sampler;'));
});
