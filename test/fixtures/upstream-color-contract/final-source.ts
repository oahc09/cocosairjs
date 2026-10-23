import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { API } from '../../../src/cocos/gfx';
import { EffectAsset } from '../../../src/cocos/asset/assets/effect-asset';
import { ProgramLib } from '../../../src/cocos/render-scene/core/program-lib';
import { WebGL2Shader } from '../../../src/cocos/gfx/webgl2/webgl2-shader';
import { WebGL2CmdFuncCreateShader } from '../../../src/cocos/gfx/webgl2/webgl2-commands';

/** Exercise production registration -> ProgramLib -> WebGL shaderSource boundary.
 * GL is a recording stub: this proves submitted bytes, NOT driver compilation or GPU pixels.
 */
export function captureFinalSource(shader: EffectAsset.IShaderInfo, defines: Record<string, any> = {}): string[] {
    const library = new ProgramLib();
    const copy = JSON.parse(JSON.stringify(shader));
    library.define(copy);
    const sources: string[] = [];
    const device: any = {
        gfxAPI: API.WEBGL2,
        capabilities: {},
        getStateCache: () => ({}),
        createDescriptorSetLayout: () => ({}),
        createPipelineLayout: () => ({}),
        gl: {
            createShader: () => ({}),
            shaderSource: (_shader: unknown, source: string) => sources.push(source),
            compileShader: () => {},
            getShaderParameter: () => true,
            createProgram: () => null, // Stop before linking. No fake driver result is reported.
        },
        createShader: (info: any) => {
            const nativeShader = new WebGL2Shader();
            nativeShader.initialize(info);
            WebGL2CmdFuncCreateShader(device, (nativeShader as any)._gpuShader);
            return { name: info.name, destroy() {} };
        },
    };
    library.getGFXShader(device, copy.name, defines, {
        macros: {},
        constantMacros: '#define CC_DEVICE_SUPPORT_FLOAT_TEXTURE 1\n',
        descriptorSetLayout: {},
    } as any);
    if (sources.length !== 2 || !sources.some((source) => source.startsWith('#version 300 es\n'))) {
        throw new Error('Production WebGL2 source submission was not observed');
    }
    const output = process.env.UPSTREAM_COLOR_SOURCE_OUT;
    if (output) {
        mkdirSync(output, { recursive: true });
        sources.forEach((source, index) => {
            const sha256 = createHash('sha256').update(source).digest('hex');
            const name = `${shader.name.replace(/[^a-zA-Z0-9_-]/g, '_')}-${sha256}.${index ? 'frag' : 'vert'}`;
            const file = join(output, name);
            if (existsSync(file)) {
                if (readFileSync(file, 'utf8') !== source) throw new Error('Immutable source artifact differs');
            } else writeFileSync(file, source, { flag: 'wx' });
        });
    }
    return sources;
}
export const fragmentSource = (shader: EffectAsset.IShaderInfo, defines: Record<string, any> = {}): string =>
    captureFinalSource(shader, defines)[1];
