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

// Frozen WebGL2 TAA ABI. Leave application replacements and other backends untouched.
const EFFECT = 'pipeline/post-process/taa';
const PROGRAM = EFFECT + '|vs|fs';
const STOCK_HASH = 905303758;
const START = 'void minmax(sampler2D mainTex, in vec2 uv, out vec4 colorMin, out vec4 colorMax) {';
const END = 'float HdrWeightY(float Color, float Exposure) {';

// A neighboring pixel across a depth edge must not keep unrelated historical color in the clamp.
// Compare in view-space units for both perspective and orthographic projection.
// Reuse the existing current depth descriptor: no new attachment or history allocation.
const DEPTH_CLAMP = `
float taaEyeDepth(vec2 uv) {
    ivec2 extent = textureSize(depthTex, 0);
    ivec2 pixel = clamp(ivec2(floor(uv * vec2(extent))), ivec2(0), extent - ivec2(1));
    float raw = texelFetch(depthTex, pixel, 0).r;
    vec4 view = cc_matProjInv * vec4(0.0, 0.0, raw * 2.0 - 1.0, 1.0);
    return abs(view.z / view.w);
}
void taaDepthBound(sampler2D colorTex, vec2 uv, float centerDepth, inout vec4 lo, inout vec4 hi) {
    if (abs(taaEyeDepth(uv) - centerDepth) <= max(0.01, centerDepth * 0.015)) {
        vec4 sampleColor = taaSampleTex(colorTex, uv);
        lo = min(lo, sampleColor);
        hi = max(hi, sampleColor);
    }
}
void minmax(sampler2D mainTex, in vec2 uv, out vec4 colorMin, out vec4 colorMax) {
    vec2 texel = taaInputTexSize();
    colorMin = taaSampleTex(mainTex, uv);
    colorMax = colorMin;
    float centerDepth = taaEyeDepth(uv);
    taaDepthBound(mainTex, uv + vec2(texel.x, 0.0), centerDepth, colorMin, colorMax);
    taaDepthBound(mainTex, uv - vec2(texel.x, 0.0), centerDepth, colorMin, colorMax);
    taaDepthBound(mainTex, uv + vec2(0.0, texel.y), centerDepth, colorMin, colorMax);
    taaDepthBound(mainTex, uv - vec2(0.0, texel.y), centerDepth, colorMin, colorMax);
}
`;

export function airWebGL2TAAFragment(effect: string, program: string, hash: number, fragment: string): string {
    if (effect !== EFFECT || program !== PROGRAM || hash !== STOCK_HASH) return fragment;
    const start = fragment.indexOf(START);
    const end = fragment.indexOf(END, start + START.length);
    if (start < 0 || end < 0 || fragment.indexOf(START, start + START.length) >= 0) return fragment;
    return fragment.slice(0, start) + DEPTH_CLAMP + fragment.slice(end);
}
