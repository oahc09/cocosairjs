import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gfx } from '../../src';

function spec() {
    return {
        name: 'test-point-effect',
        primitive: 'POINT_LIST',
        attributes: [{ name: 'a_position', type: 'vec3', location: 0 }],
        uniforms: [{ name: 'tint', type: 'vec4', value: [1, 0.2, 0.5, 1] }],
        vertex: 'void main() { gl_Position = cc_matViewProj * cc_matWorld * vec4(a_position, 1.0); gl_PointSize = tint.w; }',
        fragment: 'void main() { cc_FragColor = tint; }',
    };
}

describe('competitive effect generator', () => {
    let temp: string;
    const generator = join(process.cwd(), 'tools/build/effect-json.mjs');
    beforeEach(() => {
        temp = mkdtempSync(join(tmpdir(), 'air-effect-generator-'));
    });
    afterEach(() => {
        rmSync(temp, { recursive: true, force: true });
    });
    function generate(value: any) {
        writeFileSync(join(temp, 'spec.json'), JSON.stringify(value));
        execFileSync(process.execPath, [generator, join(temp, 'spec.json'), join(temp, 'effect.json')], {
            stdio: 'pipe',
        });
        return JSON.parse(readFileSync(join(temp, 'effect.json'), 'utf8'));
    }
    test('emits point topology, matching bindings, layouts and content-derived hashes', () => {
        const a = generate(spec());
        expect(a.techniques[0].passes[0].primitive).toBe(gfx.PrimitiveMode.POINT_LIST);
        expect(a.shaders[0].blocks[0].members[0].type).toBe(gfx.Type.FLOAT4);
        expect(a.shaders[0].attributes[0].format).toBe(gfx.Format.RGB32F);
        expect(a.shaders[0].blocks[0].stageFlags).toBe(gfx.ShaderStageFlagBit.VERTEX | gfx.ShaderStageFlagBit.FRAGMENT);
        expect(a.shaders[0].glsl3.vert).not.toContain('layout(');
        expect(a.shaders[0].glsl3.vert).toContain('uniform CCCamera');
        expect(a.shaders[0].glsl4.vert).toContain('layout(set = 1, binding = 0) uniform Constants');
        expect(generate(spec())).toEqual(a);
        const changed = spec();
        changed.fragment = 'void main() { cc_FragColor = vec4(1.0); }';
        const b = generate(changed);
        expect(b.shaders[0].hash).not.toEqual(a.shaders[0].hash);
        expect(b.shaders[0].name).not.toEqual(a.shaders[0].name);
    });
    test('matrix defaults and sampler bindings use actual engine enums', () => {
        const value: any = spec();
        value.primitive = 'TRIANGLE_LIST';
        value.uniforms.push({
            name: 'transform',
            type: 'mat4',
            value: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        });
        value.attributes.push({ name: 'a_color', type: 'vec4', location: 1 });
        value.samplers = [{ name: 'mainTexture', type: 'sampler2D', value: 'white' }];
        const out = generate(value);
        expect(out.techniques[0].passes[0].primitive).toBe(gfx.PrimitiveMode.TRIANGLE_LIST);
        expect(out.shaders[0].blocks[0].members[1].type).toBe(gfx.Type.MAT4);
        expect(out.shaders[0].attributes[1].format).toBe(gfx.Format.RGBA32F);
        expect(out.shaders[0].samplerTextures[0].binding).toBe(1);
        expect(out.shaders[0].samplerTextures[0].type).toBe(gfx.Type.SAMPLER2D);
        value.uniforms = [];
        expect(generate(value).shaders[0].samplerTextures[0].binding).toBe(0);
    });
    test.each(['uniform float unsafe;', '#include <chunk>', 'layout(location=0) in vec3 hidden;'])(
        'rejects unsupported body declarations: %s',
        (declaration) => {
            const value = spec();
            value.vertex = `${declaration}\n${value.vertex}`;
            expect(() => generate(value)).toThrow();
        },
    );
    test('rejects duplicate locations, invalid defaults and unsupported declarations without overwriting output', () => {
        const value: any = spec();
        value.attributes.push({ name: 'a_uv', type: 'vec2', location: 0 });
        expect(() => generate(value)).toThrow();
        value.attributes.pop();
        value.uniforms[0].value = [1, 2, 3];
        expect(() => generate(value)).toThrow();
        value.uniforms[0].value = [1, 2, 3, 4];
        value.uniforms[0].count = 2;
        writeFileSync(join(temp, 'effect.json'), 'previous artifact');
        expect(() => generate(value)).toThrow();
        expect(readFileSync(join(temp, 'effect.json'), 'utf8')).toBe('previous artifact');
    });
    test('resolves GLSL file inputs relative to the declaration file', () => {
        const value: any = spec();
        writeFileSync(join(temp, 'vertex.glsl'), value.vertex);
        value.vertex = { file: 'vertex.glsl' };
        expect(generate(value).shaders[0].glsl3.vert).toContain('gl_PointSize');
    });
    test('rejects missing names and inherited object keys as types', () => {
        const value: any = spec();
        delete value.attributes[0].name;
        expect(() => generate(value)).toThrow();
        value.attributes[0].name = 'a_position';
        value.attributes[0].type = 'toString';
        expect(() => generate(value)).toThrow();
    });
});
