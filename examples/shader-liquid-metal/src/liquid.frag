// Adapted math ideas: Shader Effects Inc. 2026 MIT, see ../UPSTREAM.md and ../LICENSE.reference.txt.
// Independent flat-2D implementation: analytic SDF shapes (circle / rounded box), no TypeGPU
// runtime, no SDF texture platform, no volumetric path. Single pass.
// NOISE SUBSTITUTION (documented divergence): upstream's molten relief reads perlin12d, whose
// hash22 is the Fi-hash family (floatBitsToUint lattice hash, provenance unresolved) — NOT
// adopted here. The relief uses the verified-MIT MaterialX perlin (mx_noise_float, lookup3
// lattice hash) with central-difference slopes; a like-for-like substitute, not an equivalent.
precision highp float;
in highp vec2 v_uv;
layout(set = 1, binding = 0) uniform Constants {
    vec4 liquid0;  // scale, rotation(deg), turbulence, ripple
    vec4 liquid1;  // warp, speed(uniform t already accumulated in liquid2), environment, envRotation(deg)
    vec4 liquid2;  // animatedTime, canvas.width, canvas.height, quality(0=low shared,1=high split)
    vec4 liquid3;  // sharpness, dispersion, lightAngle(deg), seed
    vec4 liquid4;  // bevelWidth, bevelShape, edgeSoftness, linearDiagnostic
};
out vec4 cc_FragColor;
// ── MaterialX perlin (mx_noise_float, 2D) — the verified-MIT relief noise ───────────────────
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
    return 0.6616 * ((1.0 - v) * (g0 * s1 + g1 * u) + v * (g2 * s1 + g3 * u));
}
float distanceField(vec2 p) {
#if SHAPE_BOX
    vec2 q = abs(p) - vec2(0.24, 0.16);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.04;
#else
    return length(p) - 0.30;
#endif
}
// Upstream flowWarpOffset (materialParts.ts): two incommensurate sin·cos products.
vec2 flowWarp(vec2 w, float flowT) {
    return vec2(
        sin(w.x * 1.7 + flowT * 0.7 + 1.7) * cos(w.y * 1.3 + flowT * 0.5 + 2.3),
        cos(w.x * 1.4 + flowT * 0.9 + 8.7) * sin(w.y * 1.6 + flowT * 0.6 + 5.1)
    );
}
// Upstream bevelSin (effects/bevel.ts): round vs machined sin-theta profile.
float bevelSin(float t, float shape) {
    float sRound = 1.0 - t;
    float k1 = smoothstep(0.0, 0.14, t);
    float k2 = smoothstep(0.68, 0.92, t);
    float sMach = mix(1.0, 0.72 * (1.0 - k2), k1);
    return mix(sRound, sMach, shape);
}
// LiquidMetal's own 3-softbox studio (index.ts liquidStudio), rotated into the env frame.
// The reference's reversed-edge smoothstep(r, r*0.2, d) becomes the explicit ordered inverse.
float liquidStudio(float rx, float ry, float envC, float envS, float keyRad, float drift, float envStr) {
    float ex = rx * envC - ry * envS;
    float ey = rx * envS + ry * envC;
    vec2 p = vec2(ex, ey);
    float sky = smoothstep(-0.7, 0.85, ey);
    float lum = sky * sky * 0.4;
    float r0 = keyRad * 1.05;
    float d0 = length(p - vec2(0.0 + drift, 0.55));
    float box0 = 1.0 - smoothstep(r0 * 0.2, r0, d0);
    lum += box0 * 1.75 * envStr;
    float r1 = keyRad * 1.25;
    float d1 = length(p - vec2(-0.45 + drift, -0.4));
    float box1 = 1.0 - smoothstep(r1 * 0.2, r1, d1);
    lum += box1 * 1.15 * envStr;
    float r2 = keyRad * 1.15;
    float d2 = length(p - vec2(0.55 + drift, 0.1));
    float box2 = 1.0 - smoothstep(r2 * 0.2, r2, d2);
    lum += box2 * 1.1 * envStr;
    return lum;
}
void main() {
    float aspect = liquid2.y / liquid2.z;
    vec2 delta = vec2((v_uv.x - 0.5) * aspect, v_uv.y - 0.5);
    float rad = liquid0.y * 0.017453292519943295;
    float cosR = cos(rad);
    float sinR = sin(rad);
    vec2 f = vec2(delta.x * cosR + delta.y * sinR, delta.y * cosR - delta.x * sinR) / liquid0.x;
    vec2 pat = f;  // flat pattern coords are field-centred (sdfUV - 0.5 == f)
    float pxH = 1.0 / liquid2.z;
    float t = liquid2.x;
    // Field stencil (forward, geometricNormal's own eps 0.01 default) and scaled sdf.
    const float feps = 0.01;
    float s0 = distanceField(f);
    float sX = distanceField(f + vec2(feps, 0.0));
    float sY = distanceField(f + vec2(0.0, feps));
    float sdf = s0 / liquid0.x;
    // Silhouette — the exact upstream silhouetteAlpha chain (E03-verified sources).
    float sharpEdge = max(liquid4.z * 0.5, 0.001);
    float silhouetteW = max(sharpEdge * 0.03125, pxH * 1.5);
    float insideMaskV = clamp(-sdf / silhouetteW, 0.0, 1.0);
    float transition = insideMaskV * insideMaskV * (3.0 - 2.0 * insideMaskV);
    if (sdf > pxH * 2.0) {
        cc_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }
    // Geometric bevel normal: rim progress, bevelSin profile, tilted along the field gradient.
    float rimT = clamp(-sdf / max(liquid4.x, 0.003), 0.0, 1.0);
    vec2 grad = vec2((sX - s0) / feps, (sY - s0) / feps);
    float glen = max(length(grad), 0.0001);
    float sinTilt = bevelSin(rimT, liquid4.y);
    float sB = min(sinTilt, 0.9995);
    vec3 nGeo = vec3(grad.x / glen * sB, grad.y / glen * sB, -sqrt(1.0 - sB * sB));
    // Flowing molten relief: flow-warp drifts the domain, clamped noise slope reads the folds.
    // SUBSTITUTION: mx perlin central differences replace the Fi-hash perlin12d analytic gradient.
    float freq = liquid0.w * 2.6;
    float flowT = t * 0.12;
    vec2 q = pat * freq + liquid3.w * 13.37;
    vec2 w = flowWarp(q * 0.6, flowT);
    vec2 qw = q + w * (liquid1.x * 0.9);
    const float reliefEps = 0.1;  // central-difference radius for the substitute slope
    float n0 = mxPerlinNoiseFloat2(qw);
    float ndx = (mxPerlinNoiseFloat2(qw + vec2(reliefEps, 0.0)) - mxPerlinNoiseFloat2(qw - vec2(reliefEps, 0.0))) / (reliefEps * 2.0);
    float ndy = (mxPerlinNoiseFloat2(qw + vec2(0.0, reliefEps)) - mxPerlinNoiseFloat2(qw - vec2(0.0, reliefEps))) / (reliefEps * 2.0);
    vec2 hg = vec2(clamp(ndx * 0.62, -4.0, 4.0), clamp(ndy * 0.62, -4.0, 4.0));
    float relief = liquid0.z * 0.5;
    vec3 n = normalize(vec3(nGeo.x - hg.x * relief, nGeo.y - hg.y * relief, nGeo.z));
    // Perspective view ray (fov 0.6) and its mirror about the normal.
    vec3 viewI = normalize(vec3((v_uv.x - 0.5) * aspect * 0.6, (v_uv.y - 0.5) * 0.6, 1.0));
    vec3 R = reflect(viewI, n);
    float sharp = clamp(liquid3.x, 0.0, 1.0);
    float keyRad = mix(0.5, 0.18, sharp);
    float drift = sin(t * 0.07) * 0.05;
    float envRad = liquid1.w * 0.017453292519943295;
    float envC = cos(envRad);
    float envS = sin(envRad);
    // Key light (elevation -0.7) and the sharpness-steered glint lobe (60,900,0.4,1.4).
    float lightRad = liquid3.z * 0.017453292519943295;
    vec3 L = normalize(vec3(cos(lightRad), sin(lightRad), -0.7));
    vec3 Hh = normalize(L + vec3(0.0, 0.0, -1.0));
    float ndh = clamp(dot(n, Hh), 0.0, 1.0);
    float spec = pow(ndh, mix(60.0, 900.0, sharp)) * mix(0.4, 1.4, sharp);
    // Quality tier — a REAL compute change:
    //   low  (liquid2.w < 0.5): ONE studio evaluation shared across RGB (upstream mobile branch).
    //   high (else): chromatic split — a SECOND studio evaluation for blue (upstream desktop);
    //                red derived as 2G - B.
    float lumG = liquidStudio(R.x, R.y, envC, envS, keyRad, drift, liquid1.z) + spec;
    float lumR, lumB;
    if (liquid2.w < 0.5) {
        lumR = lumG;
        lumB = lumG;
    } else {
        float grazeD = 1.0 - clamp(-n.z, 0.0, 1.0);
        float dth = liquid3.y * 0.09 * (0.4 + grazeD * 1.3);
        lumB = liquidStudio(R.x + R.y * dth, R.y - R.x * dth, envC, envS, keyRad, drift, liquid1.z) + spec;
        lumR = lumG * 2.0 - lumB;
    }
    // Metal ramp: sRGB #141414 -> #eef0f6 decoded once through the EOTF.
    // dark  = (0.006995410187265387, 0.006995410187265387, 0.006995410187265387)
    // light = (0.8549926081242338, 0.8713671191987972, 0.9215818562772946)
    vec3 dark = vec3(0.006995410187265387, 0.006995410187265387, 0.006995410187265387);
    vec3 light = vec3(0.8549926081242338, 0.8713671191987972, 0.9215818562772946);
    vec3 finalRgb = clamp(
        vec3(
            mix(dark.x, light.x, clamp(lumR, 0.0, 1.8)),
            mix(dark.y, light.y, clamp(lumG, 0.0, 1.8)),
            mix(dark.z, light.z, clamp(lumB, 0.0, 1.8))
        ),
        0.0, 1.0
    );
    vec3 outRgb = liquid4.w > 0.5
        ? finalRgb
        : mix(12.92 * finalRgb, 1.055 * pow(max(finalRgb, 0.0), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), finalRgb));
    cc_FragColor = vec4(outRgb, transition);
}
