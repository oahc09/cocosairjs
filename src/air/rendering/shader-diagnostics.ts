/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
/** Internal driver diagnostics. The source is exactly what was submitted, including backend preamble. */
export function shaderDiagnostic(
    code: 'AIR_E_SHADER_COMPILE' | 'AIR_E_SHADER_LINK',
    shader: string,
    stage: string,
    source: string,
    driverLog: string | null,
): Error {
    const skillDoc = 'skills/cocosair-materials-effects/references/custom-glsl.md';
    const clean = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const hint =
        stage === 'fragment' && /\bgl_FragColor\b/.test(clean)
            ? 'ESSL 300 has no gl_FragColor: declare out vec4 fragColor; and write fragColor in the supplied glsl3 fragment variant.'
            : 'Check the supplied GLSL variant and resource interfaces against the numbered submitted source; WebGL2 adds #version 300 es.';
    const numberedSource = source
        .split('\n')
        .map((line, i) => `${i + 1}: ${line}`)
        .join('\n');
    return Object.assign(
        new Error(
            `[${code}] shader '${shader}', ${stage}: ${driverLog || 'driver returned no log'}\n${hint}\nsee ${skillDoc}`,
        ),
        { code, shader, stage, source, numberedSource, driverLog: driverLog || '', hint, skillDoc },
    );
}
