// C02 ThinFilm + Neon composition — example-local, native single pass.
// Frozen local composition order: NEON OVER THIN FILM. Each layer computes its own straight
// linear RGBA (the parent effects' math preserved exactly), then the composite is a premultiplied
// source-over; the straight output un-premultiplies (alpha-safe) and the display applies the
// sRGB OETF exactly once. The transparent diagnostic target disables blending.
// Parents: shader-thin-film (E02, coverage/gradient contract) + shader-neon (E04, 5-tap stencil
// contract) — their numeric differences are deliberately preserved, NOT merged.
precision highp float;
in highp vec2 v_uv;
layout(set = 1, binding = 0) uniform Constants {
    vec4 c0;  // rimWidth, edgeSoftness, thickness, dispersion  (film layer)
    vec4 c1;  // saturation, phase, opacity, lightAngle(deg)
    vec4 c2;  // secondaryBlend, tubeThickness, intensity, hotCoreIntensity (neon layer)
    vec4 c3;  // glowIntensity, glowRadius, specularIntensity, specularSize (neon layer)
    vec4 c4;  // cornerSmoothing, canvas.width, canvas.height, linearDiagnostic
    vec4 c5;  // filmEnabled, neonEnabled, simulationTime, unused
    vec4 tubeColor;    // linear rgb
    vec4 secondaryColor;
    vec4 glowColor;
};
out vec4 cc_FragColor;
const float INV_LIGHT_LEN = 0.81923192051904048;
const float LZN = 0.57346234436332832;
const float HZ = 1.5734623443633282;
const float INV_H_LEN = 0.56371140972071909;
float distanceField(vec2 p) {
#if SHAPE_BOX
    vec2 q = abs(p) - vec2(0.24, 0.16);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.04;
#else
    return length(p) - 0.30;
#endif
}
vec2 gradientField(vec2 p) {
#if SHAPE_BOX
    vec2 q = abs(p) - vec2(0.24, 0.16);
    vec2 signP = vec2(p.x < 0.0 ? -1.0 : 1.0, p.y < 0.0 ? -1.0 : 1.0);
    vec2 outside = max(q, 0.0);
    float g = length(outside);
    if (g > 0.000001) return outside / g * signP;
    return q.x > q.y ? vec2(signP.x, 0.0) : vec2(0.0, signP.y);
#else
    float len = length(p);
    return len > 0.000001 ? p / len : vec2(1.0, 0.0);
#endif
}
// ── Thin-film layer (E02 contract: fwidth coverage AA, analytic gradient normal) ───────────
vec4 filmLayer(vec2 p, float sharedSdf) {
    float sdf = sharedSdf;
    vec2 normal = gradientField(p);
    float sharp = max(c0.y * 0.5, 0.001);
    float w = max(sharp / 32.0, fwidth(sdf));
    float inside = clamp(-sdf / w, 0.0, 1.0);
    float depth = clamp(-sdf / max(c0.x * 0.1, 0.001), 0.0, 1.0);
    float rim = (1.0 - depth) * (1.0 - depth) * inside;
    // theta = shared lightAngle (c1.w, degrees) + absolute simulation time (c5.z) × 2π.
    float theta = c1.w * 0.017453292519943295 + c5.z * 6.283185307179586;
    float directional = dot(normal, vec2(cos(theta), sin(theta)));
    // phase = film phase offset (c1.y) + dispersion × directional + thickness × depth × 2.
    float phase = c1.y + c0.w * directional + c0.z * depth * 2.0;
    vec3 spectrum = 0.5 + 0.5 * cos((phase + vec3(0.0, 0.3333, 0.6667)) * 6.283185307179586);
    vec3 rgb = mix(vec3(1.0), spectrum, c1.x) * rim;
    return vec4(rgb, clamp(rim * c1.z, 0.0, 1.0));
}
// ── Neon layer (E04 contract: 5-tap diamond stencil, semicircular cross-section) ────────────
vec4 neonLayer(vec2 p, float pxH, float sharedSdf) {
    float smoothEPS = 0.008 + c4.x * 0.03;
    float glowR = max(c3.y, 0.001);
    float softPx = max(pxH, 0.004);
    float sC = sharedSdf;
    float sR = distanceField(p + vec2(smoothEPS, 0.0));
    float sL = distanceField(p - vec2(smoothEPS, 0.0));
    float sU = distanceField(p + vec2(0.0, smoothEPS));
    float sD = distanceField(p - vec2(0.0, smoothEPS));
    float gradX = (sR - sL) / (smoothEPS * 2.0);
    float gradY = (sU - sD) / (smoothEPS * 2.0);
    float smoothedSdf = (sC + sR + sL + sU + sD) / 5.0;
    float sdf = mix(sC, smoothedSdf, c4.x);
    float gradLen = max(sqrt(gradX * gradX + gradY * gradY), 0.0001);
    float gnx = gradX / gradLen;
    float gny = gradY / gradLen;
    float depthNorm = clamp(-sdf / max(c2.y, 0.001), 0.0, 1.0);
    // Reverse-edge smoothsteps rewritten as explicit ordered inverses.
    float innerMask = 1.0 - smoothstep(c2.y - softPx, c2.y + softPx, -sdf);
    float outerMask = 1.0 - smoothstep(-softPx, softPx, sdf);
    float tubeMask = outerMask * innerMask;
    float t = depthNorm;
    float cylinderZ = sqrt(max(t * (2.0 - t), 0.0));
    float cylinderR = 1.0 - t;
    float nx = gnx * cylinderR;
    float ny = gny * cylinderR;
    float nz = cylinderZ;
    float lightRad = c1.w * 0.017453292519943295;
    float lxn = cos(lightRad) * INV_LIGHT_LEN;
    float lyn = sin(lightRad) * INV_LIGHT_LEN;
    float diffuse = clamp(nx * lxn + ny * lyn + nz * LZN, 0.0, 1.0);
    float NdotH = nx * (lxn * INV_H_LEN) + ny * (lyn * INV_H_LEN) + nz * (HZ * INV_H_LEN);
    float shininess = exp2(8.0 - c3.w * 7.0);
    float specular = pow(clamp(NdotH, 0.0, 1.0), shininess) * c3.z;
    vec3 tube = tubeColor.rgb;
    vec3 secondary = secondaryColor.rgb;
    vec3 twoTone = mix(secondary, tube, diffuse);
    vec3 baseColor = mix(tube, twoTone, c2.x);
    vec3 shaded = baseColor * (0.12 + diffuse * 0.55 + cylinderZ * 0.35);
    vec3 tubeRgb = shaded + vec3(specular);
    float coreProfile = smoothstep(0.55, 1.0, depthNorm);
    float hotCoreAmt = coreProfile * c2.w;
    vec3 hotCoreCol = mix(tube, vec3(1.0), 0.75);
    vec3 tubeWithCore = mix(tubeRgb, hotCoreCol, hotCoreAmt);
    vec3 tubeFlowed = tubeWithCore;  // no flow modulation in C02's frozen parameter subset
    float sdfOutside = max(sdf, 0.0);
    float innerGlow = exp(-sdfOutside * (12.0 / glowR)) * 0.7;
    float outerGlow = exp(-sdfOutside * (4.0 / glowR)) * 0.35;
    float glowMasked = (innerGlow + outerGlow) * c3.x * smoothstep(-0.003, 0.003, sdf);
    float threshOut = glowR * 1.5 + softPx + smoothEPS;
    if (sC > threshOut) return vec4(0.0);
    float intensityMul = c2.z;
    vec3 finalTube = tubeFlowed * intensityMul;
    vec3 finalGlow = glowColor.rgb * (glowMasked * intensityMul);
    vec3 rgb = mix(finalGlow, finalTube, tubeMask);
    float alpha = max(tubeMask, clamp(glowMasked * 0.6, 0.0, 1.0));
    return vec4(rgb, alpha);
}
void main() {
    float aspect = c4.y / c4.z;
    vec2 p = vec2((v_uv.x - 0.5) * aspect, v_uv.y - 0.5);
    float pxH = 1.0 / c4.z;
    // EXPLICIT SHARED CENTRE SDF: computed exactly once per pixel when any layer is on,
    // passed to both layer functions (the Neon 4-neighbour taps and Film analytic gradient
    // each compute their own offsets from the same field — only the centre is shared).
    // Both-off skips the evaluation entirely (identity).
    vec4 film = vec4(0.0);
    vec4 neon = vec4(0.0);
    if (c5.x > 0.5 || c5.y > 0.5) {
        float sdfC = distanceField(p);
        film = c5.x > 0.5 ? filmLayer(p, sdfC) : vec4(0.0);
        neon = c5.y > 0.5 ? neonLayer(p, pxH, sdfC) : vec4(0.0);
    }
    // Premultiplied source-over: NEON over FILM.
    float outA = neon.a + film.a * (1.0 - neon.a);
    vec3 outPm = neon.rgb * neon.a + film.rgb * film.a * (1.0 - neon.a);
    // Alpha-safe un-premultiply back to straight. Positive alpha divides; alpha = 0 → zero.
    // NO clamp here: the straight values are HDR linear (e.g. neon intensity 3 exceeds 1);
    // clamping belongs in the RGBA8/OETF display chain only.
    vec3 straightRgb = outA > 0.0 ? outPm / outA : vec3(0.0);
    // Format chain: the diagnostic target receives raw HDR straight; the preview clamps
    // after the OETF (RGBA8 target), as only the display format bounds the values.
    vec3 outRgb = c4.w > 0.5
        ? straightRgb
        : clamp(mix(12.92 * straightRgb, 1.055 * pow(max(straightRgb, 0.0), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), straightRgb)), 0.0, 1.0);
    cc_FragColor = vec4(outRgb, clamp(outA, 0.0, 1.0));
}
