// C01 native Holographic stage; complete local E03 mathematical chain.
// Adapted math ideas: Shader Effects Inc. 2026 MIT, see ../UPSTREAM.md and ../LICENSE.reference.txt.
// Independent flat-2D implementation: analytic SDF shapes (circle / rounded box), MaterialX
// perlin noise (Bob Jenkins lookup3 lattice hash) reimplemented in GLSL, no TypeGPU runtime, no
// SDF texture platform, no volumetric path. Single pass — no child RTT.
precision highp float;
in highp vec2 v_uv;
layout(set = 1, binding = 0) uniform Constants {
    vec4 hs0; // roughness, crinkle, sparkle, foilScale
    vec4 hs1; // saturation, hueShift degrees, time, holoEnabled
    vec4 hs2; // backing width/height, unused, unused
};
out vec4 cc_FragColor;
// Fixed studio key light at 300 degrees; L is normalize(cos300, sin300, -0.9) pre-folded at f32
// (the upstream-tuned literals; an f64 refold lands one ulp off on x). H stays a runtime normalize.
const float LIGHT_X = 0.5000000000000001;
const float LIGHT_Y = -0.8660254037844387;
const float L_X = 0.37164708971977234;
const float L_Y = -0.6437116265296936;
const float L_Z = -0.6689647436141968;
const float EPS = 0.008;
// ── MaterialX perlin noise (mx_noise_float, 2D), u32 lattice hash ─────────────────────────
uint mxRotl32(uint x, int k) { return (x << uint(k)) | (x >> uint(32 - k)); }
uint mxBjfinal(uint a0, uint b0, uint c0) {
    uint a = a0, b = b0, c = c0;
    c = c ^ b; c = c - mxRotl32(b, 14);
    a = a ^ c; a = a - mxRotl32(c, 11);
    b = b ^ a; b = b - mxRotl32(a, 25);
    c = c ^ b; c = c - mxRotl32(b, 16);
    a = a ^ c; a = a - mxRotl32(c, 4);
    b = b ^ a; b = b - mxRotl32(a, 14);
    c = c ^ b; c = c - mxRotl32(b, 24);
    return c;
}
uint mxHashInt1(int x, int y) {
    uint seed = 3735928559u + 21u;
    return mxBjfinal(seed + uint(x), seed + uint(y), seed);
}
float mxGradientFloat2(uint hash, float x, float y) {
    uint h = hash & 7u;
    float u = h < 4u ? x : y;
    float v = 2.0 * (h < 4u ? y : x);
    float uu = (h & 1u) != 0u ? -u : u;
    float vv = (h & 2u) != 0u ? -v : v;
    return uu + vv;
}
float mxFade(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float mxPerlinNoiseFloat2(vec2 p) {
    int X = int(floor(p.x));
    int Y = int(floor(p.y));
    float fx = p.x - float(X);
    float fy = p.y - float(Y);
    float u = mxFade(fx);
    float v = mxFade(fy);
    float g0 = mxGradientFloat2(mxHashInt1(X, Y), fx, fy);
    float g1 = mxGradientFloat2(mxHashInt1(X + 1, Y), fx - 1.0, fy);
    float g2 = mxGradientFloat2(mxHashInt1(X, Y + 1), fx, fy - 1.0);
    float g3 = mxGradientFloat2(mxHashInt1(X + 1, Y + 1), fx - 1.0, fy - 1.0);
    float s1 = 1.0 - u;
    float bilerp = (1.0 - v) * (g0 * s1 + g1 * u) + v * (g2 * s1 + g3 * u);
    return 0.6616 * bilerp;
}
// surfaceNoise = mxNoiseFloat2; the local seed extension offsets every noise input.
float surfaceNoise(float x, float y) { return mxPerlinNoiseFloat2(vec2(x, y)); }
float distanceField(vec2 p) {
#if SHAPE_BOX
    vec2 q = abs(p) - vec2(0.24, 0.16);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.04;
#else
    return length(p) - 0.30;
#endif
}
// IQ cosine palette with the exact 1/3, 2/3 phases (thin-film's 0.3333/0.6667 stays distinct).
vec3 holoRainbow(float t) {
    return vec3(
        cos((t + 0.0) * 6.283185307179586) * 0.5 + 0.5,
        cos((t + 0.3333333333333333) * 6.283185307179586) * 0.5 + 0.5,
        cos((t + 0.6666666666666666) * 6.283185307179586) * 0.5 + 0.5
    );
}
void main() {
    // Neutral linear card is a real native first-pass input, not transparent absence.
    if (hs1.w < 0.5) {
        float cell = floor(v_uv.x * 8.0) + floor(v_uv.y * 8.0);
        float value = mod(cell, 2.0) < 0.5 ? 0.05126945837404324 : 0.11697066775851084;
        cc_FragColor = vec4(value, value, value, 1.0);
        return;
    }
    vec4 holo0 = vec4(1.0, 0.0, hs1.y, hs0.w);
    vec4 holo1 = vec4(hs1.x, hs0.x, 1.0, hs0.y);
    vec4 holo2 = vec4(1.0, hs0.z, 0.05, 0.0);
    vec4 holo3 = vec4(hs1.z, hs2.x, hs2.y, 1.0);
    float aspect = holo3.y / holo3.z;
    vec2 delta = vec2((v_uv.x - 0.5) * aspect, v_uv.y - 0.5);
    float rad = holo0.y * 0.017453292519943295;
    float cosR = cos(rad);
    float sinR = sin(rad);
    vec2 f = vec2(delta.x * cosR + delta.y * sinR, delta.y * cosR - delta.x * sinR) / holo0.x;
    vec2 suv = f + 0.5;
    // Pattern coords stick to the (rotated, scaled) shape surface; the seed offsets noise inputs.
    vec2 pat = suv - 0.5;
    float sx = holo2.w * 13.37;
    float sy = holo2.w * 7.77;
    float pxH = 1.0 / holo3.z;
    float t = holo3.x;
    // Forward field stencil at the foil's own eps 0.008; sdf is divided by scale.
    float s0 = distanceField(f);
    float sX = distanceField(f + vec2(EPS, 0.0));
    float sY = distanceField(f + vec2(0.0, EPS));
    float sdf = s0 / holo0.x;
    // Silhouette — the exact upstream silhouetteAlpha chain (materialParts.ts @ dbfd42ab, MIT):
    //   sharpEdge = max(edgeSoftness * 0.5, 0.001)
    //   insideMask(sdf, sharpEdge, pxH, 1.5): w = max(sharpEdge * 0.03125, pxH * 1.5),
    //                                        m = clamp(-sdf / w, 0, 1)
    //   alpha = smoothstep(0, 1, m) = m^2 (3 - 2m)
    // Source: lead-w2-e03-upstream-materialParts.ts + cached gpu/kit/lighting.ts insideMask.
    float sharpEdge = max(holo2.z * 0.5, 0.001);
    float silhouetteW = max(sharpEdge * 0.03125, pxH * 1.5);
    float insideMaskV = clamp(-sdf / silhouetteW, 0.0, 1.0);
    float transition = insideMaskV * insideMaskV * (3.0 - 2.0 * insideMaskV);
    // Outside by more than two device pixels pays only the guard: exact zero.
    if (sdf > pxH * 2.0) {
        cc_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }
    // Flat-path surface normal: forward field gradient, edge dome, wrinkle finite differences.
    vec2 grad = vec2((sX - s0) / EPS, (sY - s0) / EPS);
    float edgeT = clamp(-sdf / 0.06, 0.0, 1.0);
    float domeSlope = (1.0 - edgeT) * 0.35;
    vec2 baseN = grad * domeSlope;
    float steepAtten = 1.0;  // flat path; the volumetric wall attenuation is NOT implemented
    float crScale = holo2.x * 1.35;
    float crAmp = holo1.w * 0.8 * steepAtten;
    const float neps = 0.02;
    float w0 = surfaceNoise(pat.x * crScale + 2.7 + sx, pat.y * crScale + 11.3 + sy);
    float wx = (surfaceNoise((pat.x + neps) * crScale + 2.7 + sx, pat.y * crScale + 11.3 + sy) - w0) / neps;
    float wy = (surfaceNoise(pat.x * crScale + 2.7 + sx, (pat.y + neps) * crScale + 11.3 + sy) - w0) / neps;
    vec3 n = normalize(vec3(baseN.x + wx * crAmp * 0.4, baseN.y + wy * crAmp * 0.4, -1.0));
    // Diffraction hue: two-octave blotch drifts along the fixed light, plus ramp/tilt/time/hue.
    float fScale = holo0.w * 2.2;
    float drift = t * 0.06;
    float blotch = surfaceNoise(pat.x * fScale + drift * LIGHT_X + sx, pat.y * fScale + drift * LIGHT_Y + sy)
        + surfaceNoise(
            pat.x * fScale * 2.1 + 5.2 - drift * LIGHT_X * 1.6 + sx,
            pat.y * fScale * 2.1 + 9.4 - drift * LIGHT_Y * 1.6 + sy
        ) * 0.4;
    float normalTilt = n.x * LIGHT_X + n.y * LIGHT_Y;
    float ramp = (pat.x * LIGHT_X + pat.y * LIGHT_Y) * 0.8;
    float hue = blotch * 0.45 + ramp + normalTilt * 1.4 + t * 0.18 + holo0.z / 360.0;
    float saturationC = clamp(holo1.x, 0.0, 1.0);
    vec3 spectral = holoRainbow(hue);
    vec3 silver = vec3(0.72, 0.73, 0.76);
    vec3 foilTint = mix(silver, spectral, saturationC * 0.85);
    // Fixed studio key light; sheen + roughness-softened specular core.
    float roughnessC = clamp(holo1.y, 0.0, 1.0);
    vec3 L = vec3(L_X, L_Y, L_Z);
    vec3 H = normalize(L + vec3(0.0, 0.0, -1.0));
    float ndl = clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);
    float ndh = clamp(dot(n, H), 0.0, 1.0);
    float sheen = pow(ndh, 7.0) * 0.45 * (1.0 - roughnessC * 0.35);
    float specCore = pow(ndh, mix(42.0, 12.0, roughnessC)) * 0.85 * (1.0 - roughnessC * 0.55);
    vec3 specRgb = foilTint * sheen + mix(foilTint, vec3(1.0), 0.6) * specCore;
    // Glitter flakes ride the pattern domain; twinkle follows the animated time.
    float flakeN = surfaceNoise(pat.x * 190.0 + sx, pat.y * 190.0 + sy);
    float flakePhase = surfaceNoise(pat.x * 190.0 + 47.3 + sx, pat.y * 190.0 - 31.1 + sy);
    float twinkle = sin(t * 2.2 + flakePhase * 12.6) * 0.5 + 0.5;
    float flakeMask = smoothstep(0.52, 0.62, flakeN * 0.75 + twinkle * 0.3) * clamp(holo2.y, 0.0, 1.0) * steepAtten;
    vec3 flakeRgb = holoRainbow(hue + 0.33 + flakePhase * 0.5) * (0.85 + twinkle * 0.55) * (ndl * 0.6 + 0.7);
    // Roughness grain stays screen-stable in shape space (q = suv - 0.5), distinct from pat only
    // through the seed policy; the macro/micro domain separation is preserved.
    float grain = surfaceNoise((suv.x - 0.5) * 420.0 + sx, (suv.y - 0.5) * 420.0 + sy);
    float grainMul = 1.0 + grain * roughnessC * 0.28;
    vec3 foilBase = foilTint * (ndl * 0.5 + 0.62) + specRgb;
    vec3 foilRgb = mix(foilBase, flakeRgb, flakeMask) * grainMul;
    vec3 finalRgb = clamp(foilRgb, 0.0, 1.0);
    // C01 intermediate target stores linear PREMULTIPLIED RGBA8, never display encoded.
    cc_FragColor = vec4(finalRgb * transition, transition);
}
