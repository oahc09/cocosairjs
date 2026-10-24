import { WebGL2CmdFuncCreateShader } from '../../src/cocos/gfx/webgl2/webgl2-commands';
import { ShaderStageFlagBit } from '../../src/cocos/gfx/base/define';
import { WebGLConstants } from '../../src/cocos/gfx/gl-constants';
import { shaderDiagnostic } from '../../src/air/rendering/shader-diagnostics';

function fixture(compile = false, link = true) {
    let id = 0;
    const gl = {
        createShader: jest.fn(() => ({ id: ++id })),
        shaderSource: jest.fn(),
        compileShader: jest.fn(),
        getShaderParameter: jest.fn((shader) => compile || shader.id === 1),
        getShaderInfoLog: jest.fn(() => "ERROR: 0:3: 'gl_FragColor' : undeclared identifier"),
        deleteShader: jest.fn(),
        createProgram: jest.fn(() => ({ program: true })),
        attachShader: jest.fn(),
        linkProgram: jest.fn(),
        detachShader: jest.fn(),
        deleteProgram: jest.fn(),
        getProgramParameter: jest.fn((_program, key) => (key === WebGLConstants.LINK_STATUS ? link : 0)),
        getProgramInfoLog: jest.fn(() => 'fragment input does not match vertex output'),
    };
    const shader = {
        name: 'diagnostic-effect',
        glProgram: null,
        gpuStages: [
            { type: ShaderStageFlagBit.VERTEX, source: 'void main(){gl_Position=vec4(0.0);}', glShader: null },
            {
                type: ShaderStageFlagBit.FRAGMENT,
                source: 'precision highp float;\nvoid main(){gl_FragColor=vec4(1.0);}',
                glShader: null,
            },
        ],
    };
    const device = { gl, capabilities: {}, getStateCache: () => ({}) };
    return { gl, shader, device };
}

describe('shader driver failure diagnostics', () => {
    test('fragment failure carries exact submitted source, hint and log; frees both stages and can retry', () => {
        const { gl, shader, device } = fixture();
        expect(() => WebGL2CmdFuncCreateShader(device as any, shader as any)).toThrow(
            expect.objectContaining({
                code: 'AIR_E_SHADER_COMPILE',
                shader: shader.name,
                stage: 'fragment',
                source: '#version 300 es\n' + shader.gpuStages[1].source,
                hint: expect.stringContaining('out vec4'),
                driverLog: expect.stringContaining('undeclared identifier'),
                numberedSource: expect.stringContaining('3: void main'),
            }),
        );
        expect(gl.deleteShader.mock.calls.map(([handle]) => handle.id)).toEqual([1, 2]);
        expect(shader.gpuStages.every((stage) => stage.glShader === null)).toBe(true);
        gl.getShaderParameter.mockReturnValue(true);
        gl.getProgramParameter.mockReturnValue(false);
        expect(() => WebGL2CmdFuncCreateShader(device as any, shader as any)).toThrow(
            expect.objectContaining({ code: 'AIR_E_SHADER_LINK' }),
        );
        expect(gl.createShader).toHaveBeenCalledTimes(4);
        expect(shader.glProgram).toBeNull();
        expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    });

    test('missing fragment colour output alone is not rejected by a lexical heuristic', () => {
        const error = shaderDiagnostic(
            'AIR_E_SHADER_COMPILE',
            'depth-only',
            'fragment',
            'void main(){}',
            'unrelated failure',
        ) as any;
        expect(error.hint).not.toContain('declare out vec4');
        const commented = shaderDiagnostic(
            'AIR_E_SHADER_COMPILE',
            'comment',
            'fragment',
            '// gl_FragColor\nvoid main(){}',
            'unrelated failure',
        ) as any;
        expect(commented.hint).not.toContain('declare out vec4');
    });
});
