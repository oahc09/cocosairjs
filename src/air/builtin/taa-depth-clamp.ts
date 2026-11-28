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

// Replace both the stock world-axis heuristic and its unchecked texture lookup.
const VELOCITY_START = 'vec2 getVelocity(vec2 unjittedUV, vec2 uv, out float depth) {';
const VELOCITY_END = 'vec3 RGBToYCoCg(';
const HISTORY_LOOKUP = `    float depth = 0.;
    vec2 velocity = getVelocity(scaledUnjittedUV, uv, depth);
    vec4 prevColor = taaSampleTex(taaPrevTexture, uv + velocity);
    vec4 color = taaSampleTex(inputTexture, scaledUnjittedUV);`;
const VALIDATED_LOOKUP = `    vec4 color = taaSampleTex(inputTexture, scaledUnjittedUV);
    vec2 historyUV;
    if (taaParams1.z <= 0.0 || !taaHistoryUV(scaledUnjittedUV, uv, historyUV)) {
        return vec4(YCoCgToRGB(color.rgb), color.a);
    }
    vec4 prevColor = taaSampleTex(taaPrevTexture, historyUV);`;

const REPROJECT = `
bool taaHistoryUV(vec2 depthUV, vec2 uv, out vec2 historyUV) {
    // Depth samples retain the stock jitter convention. A world-space axis is
    // not a background marker, and raw depth 1 can be valid far-plane geometry.
    float depth = texture(depthTex, depthUV).r;
    vec4 world = cc_matViewProjInv * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    if (world.w == 0.0 || any(isnan(world)) || any(isinf(world))) return false;
    vec4 prior = taaPrevViewProj * vec4(world.xyz / world.w, 1.0);
    // Positive clip W and clip-space bounds exclude behind-camera and offscreen history.
    if (!(prior.w > 0.0) || any(isinf(prior))) return false;
    vec3 ndc = prior.xyz / prior.w;
    if (!all(lessThanEqual(abs(ndc), vec3(1.0)))) return false;
    historyUV = NDCScToUV(prior);
    return all(greaterThanEqual(historyUV, vec2(0.0))) && all(lessThanEqual(historyUV, vec2(1.0)));
}
`;

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
    const velocity = fragment.indexOf(VELOCITY_START);
    const rgb = fragment.indexOf(VELOCITY_END, velocity + VELOCITY_START.length);
    const start = fragment.indexOf(START);
    const end = fragment.indexOf(END, start + START.length);
    const lookup = fragment.indexOf(HISTORY_LOOKUP);
    if (
        !(velocity >= 0 && velocity < rgb && rgb < start && start < end && end < lookup) ||
        [VELOCITY_START, VELOCITY_END, START, END, HISTORY_LOOKUP].some(
            (anchor) => fragment.indexOf(anchor) !== fragment.lastIndexOf(anchor),
        )
    ) return fragment;
    return (
        fragment.slice(0, velocity) +
        REPROJECT +
        fragment.slice(rgb, start) +
        DEPTH_CLAMP +
        fragment.slice(end, lookup) +
        VALIDATED_LOOKUP +
        fragment.slice(lookup + HISTORY_LOOKUP.length)
    );
}
