import {
    reflectGLSLFragmentOutputNames,
    reflectWGSLFragmentOutputs,
} from '../../src/air/rendering/shader-output-interface';

describe('linked GLSL fragment output candidates', () => {
    test('retains both conditional declarations for the driver to resolve, excluding parameters and locals', () => {
        const source = `#ifdef COLOR
            layout(location=0) out highp vec4 color;
            #else
            layout(location=2) out uint ids;
            #endif
            void utility(out vec4 unused) { unused=vec4(0.0); }
            void main() { vec4 local=vec4(0.0); }`;
        expect(reflectGLSLFragmentOutputNames(source)).toEqual({
            status: 'known',
            outputs: [
                { name: 'color', array: false },
                { name: 'ids', array: false },
            ],
        });
    });

    test('handles output arrays and comma declarations without guessing array length', () => {
        expect(reflectGLSLFragmentOutputNames('layout(location=0) out vec4 colors[COUNT], other;')).toEqual({
            status: 'known',
            outputs: [
                { name: 'colors', array: true },
                { name: 'other', array: false },
            ],
        });
    });

    test('cannot claim completeness when macros or includes change output identities', () => {
        for (const source of [
            '#define OUT out\nOUT vec4 color;',
            '#define COLOR myColor\nout vec4 COLOR;',
            '#include <outputs>',
            '#define DECLARE(name) layout(location=0) out vec4 name;\nDECLARE(color)',
        ])
            expect(reflectGLSLFragmentOutputNames(source).status).toBe('unknown');
    });

    test('depth-only shaders produce a known empty color interface', () => {
        expect(reflectGLSLFragmentOutputNames('void main(){gl_FragDepth=0.5;}')).toEqual({
            status: 'known',
            outputs: [],
        });
    });
});

describe('final WGSL fragment output interface', () => {
    test('uses the entry return struct instead of fragment input or unrelated output locations', () => {
        const source = `struct Inputs { @location(7) uv: vec2<f32>, }
            struct Other { @location(4) color: vec4<f32>, }
            struct Outputs { @location(2) @interpolate(flat) id: u32, @location(0) color: vec4<f32>, }
            @fragment fn main(input: Inputs) -> Outputs { return Outputs(1u, vec4<f32>()); }`;
        expect(reflectWGSLFragmentOutputs(source, 'main')).toEqual({ status: 'known', locations: [0, 2] });
    });

    test('handles scalar outputs with annotated inputs and comments', () => {
        const source = `// @location(7)
            @fragment fn shade(@location(3) uv: vec2<f32>) -> @location(0) vec4<f32> { return vec4<f32>(); }`;
        expect(reflectWGSLFragmentOutputs(source, 'shade')).toEqual({ status: 'known', locations: [0] });
    });

    test('depth-only struct, builtin and void entries have no color outputs', () => {
        for (const source of [
            'struct Depth { @builtin(frag_depth) value:f32, } @fragment fn main() -> Depth { return Depth(0.0); }',
            '@fragment fn main() -> @builtin(frag_depth) f32 { return 0.0; }',
            '@fragment fn main() {}',
        ])
            expect(reflectWGSLFragmentOutputs(source, 'main')).toEqual({ status: 'known', locations: [] });
    });

    test('cannot turn incomplete, non-literal or duplicate reflection into known empty outputs', () => {
        for (const source of [
            '@fragment fn missing() {}',
            '@fragment fn main() -> Missing {}',
            'struct Outputs { @location(SLOT) color:vec4<f32>, } @fragment fn main() -> Outputs {}',
            'struct Outputs { @location(0) a:vec4<f32>, @location(0) b:vec4<f32>, } @fragment fn main() -> Outputs {}',
        ])
            expect(reflectWGSLFragmentOutputs(source, 'main').status).toBe('unknown');
    });
});
