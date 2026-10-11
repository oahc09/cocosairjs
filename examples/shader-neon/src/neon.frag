// Adapted math ideas: Shader Effects Inc. 2026 MIT, see ../UPSTREAM.md and ../LICENSE.reference.txt.
// Independent flat-2D implementation: analytic SDF shapes (circle / rounded box), no TypeGPU
// runtime, no SDF texture sampling, no volumetric depth-crease path.
precision highp float;
in highp vec2 v_uv;
layout(set = 1, binding = 0) uniform Constants {
    vec4 neon0;  // scale, rotation(deg), secondaryBlend, tubeThickness
    vec4 neon1;  // intensity, hotCoreIntensity, glowIntensity, glowRadius
    vec4 neon2;  // lightAngle(deg), specularIntensity, specularSize, cornerSmoothing
    vec4 neon3;  // flickerSpeed, flickerAmount, flowSpeed, flowAmount
    vec4 neon4;  // time, canvas.width, canvas.height, linearDiagnostic
    vec4 neonColor0;  // tube color, linear rgb
    vec4 neonColor1;  // secondary color, linear rgb
    vec4 neonColor2;  // glow color, linear rgb
};
out vec4 cc_FragColor;
const float LZ = 0.7;
// 1/sqrt(1+0.49), lz-normalized z, half-vector z, and its reciprocal length (view = (0,0,1)).
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
void main() {
    // sdfSpaceUV semantics: aspect-correct, rotate, divide by scale. Centre stays at canvas centre.
    float aspect = neon4.y / neon4.z;
    vec2 delta = vec2((v_uv.x - 0.5) * aspect, v_uv.y - 0.5);
    float rad = neon0.y * 0.017453292519943295;
    float cosR = cos(rad);
    float sinR = sin(rad);
    vec2 f = vec2(delta.x * cosR + delta.y * sinR, delta.y * cosR - delta.x * sinR) / neon0.x;
    // Flat-path stencil radius (the reference's volumetric branch is not implemented here).
    float smoothEPS = 0.008 + neon2.w * 0.03;
    float pxH = 1.0 / neon4.z;
    float glowR = max(neon1.w, 0.001);
    float softPx = max(pxH / neon0.x, 0.004);
    // Centre + four cardinal SDF taps (the corner-smoothing diamond stencil).
    float sC = distanceField(f);
    float sR = distanceField(f + vec2(smoothEPS, 0.0));
    float sL = distanceField(f - vec2(smoothEPS, 0.0));
    float sU = distanceField(f + vec2(0.0, smoothEPS));
    float sD = distanceField(f - vec2(0.0, smoothEPS));
    // Central-difference gradient + corner-smoothed field.
    float gradX = (sR - sL) / (smoothEPS * 2.0);
    float gradY = (sU - sD) / (smoothEPS * 2.0);
    float smoothedSdf = (sC + sR + sL + sU + sD) / 5.0;
    float sdf = mix(sC, smoothedSdf, neon2.w);
    float gradLen = max(sqrt(gradX * gradX + gradY * gradY), 0.0001);
    float gnx = gradX / gradLen;
    float gny = gradY / gradLen;
    // Tube geometry: interior depth band, outer coverage. The reference uses reverse-edge
    // smoothstep(edgeHigh, edgeLow, x); GLSL leaves edge0>edge1 undefined, so each becomes an
    // explicit ordered-edge inverse: 1 - smoothstep(low, high, x).
    float depthNorm = clamp(-sdf / max(neon0.w, 0.001), 0.0, 1.0);
    float innerMask = 1.0 - smoothstep(neon0.w - softPx, neon0.w + softPx, -sdf);
    float outerMask = 1.0 - smoothstep(-softPx, softPx, sdf);
    float tubeMask = outerMask * innerMask;
    // Semicircular cross-section: height sqrt(t(2-t)), horizontal falloff (1-t).
    float t = depthNorm;
    float cylinderZ = sqrt(max(t * (2.0 - t), 0.0));
    float cylinderR = 1.0 - t;
    float nx = gnx * cylinderR;
    float ny = gny * cylinderR;
    float nz = cylinderZ;
    // Blinn-Phong with the fixed lz=0.7 light geometry.
    float lightRad = neon2.x * 0.017453292519943295;
    float lxn = cos(lightRad) * INV_LIGHT_LEN;
    float lyn = sin(lightRad) * INV_LIGHT_LEN;
    float diffuse = clamp(nx * lxn + ny * lyn + nz * LZN, 0.0, 1.0);
    float NdotH = nx * (lxn * INV_H_LEN) + ny * (lyn * INV_H_LEN) + nz * (HZ * INV_H_LEN);
    float shininess = exp2(8.0 - neon2.z * 7.0);
    float specular = pow(clamp(NdotH, 0.0, 1.0), shininess) * neon2.y;
    // Rotating brightness band around the field centre.
    float flowAngle = atan(f.y, f.x);
    float flowPhase = flowAngle * 2.0 + neon4.x * neon3.z;
    float flowMod = mix(1.0, sin(flowPhase) * 0.5 + 0.5, neon3.w);
    // Two-tone base + ambient + diffuse + self-emission + specular.
    vec3 twoTone = mix(neonColor1.rgb, neonColor0.rgb, diffuse);
    vec3 baseColor = mix(neonColor0.rgb, twoTone, neon0.z);
    vec3 tubeRgb = baseColor * (0.12 + diffuse * 0.55 + cylinderZ * 0.35) + vec3(specular);
    // Hot gas-discharge core over the deepest interior.
    float coreProfile = smoothstep(0.55, 1.0, depthNorm);
    float hotCoreAmt = coreProfile * neon1.y * flowMod;
    vec3 hotCoreCol = mix(neonColor0.rgb, vec3(1.0), 0.75);
    vec3 tubeFlowed = mix(tubeRgb, hotCoreCol, hotCoreAmt) * mix(1.0, flowMod, 0.4);
    // Two independent exponential glows masked to the exterior.
    float sdfOutside = max(sdf, 0.0);
    float innerGlow = exp(-sdfOutside * (12.0 / glowR)) * 0.7;
    float outerGlow = exp(-sdfOutside * (4.0 / glowR)) * 0.35;
    float glowMasked = (innerGlow + outerGlow) * neon1.z * smoothstep(-0.003, 0.003, sdf);
    // Sporadic flicker from three irrational-ratio sines.
    float ft = neon4.x * neon3.x;
    float combined = sin(ft * 17.13) + sin(ft * 31.71) * 0.5 + sin(ft * 47.29) * 0.3;
    float threshold = mix(-2.0, 0.8, neon3.y);
    float flicker = smoothstep(threshold - 0.1, threshold + 0.1, combined);
    float intensityMul = neon1.x * flicker;
    vec3 finalTube = tubeFlowed * intensityMul;
    vec3 finalGlow = neonColor2.rgb * (glowMasked * intensityMul);
    // Tube over glow, straight linear RGBA.
    vec3 rgb = mix(finalGlow, finalTube, tubeMask);
    float alpha = max(tubeMask, clamp(glowMasked * 0.6, 0.0, 1.0));
    // Far cutout: beyond glowR*1.5 + softPx + smoothEPS the output is exactly zero.
    float threshOut = glowR * 1.5 + softPx + smoothEPS;
    if (sC > threshOut) {
        cc_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }
    // The compositing output is straight RGBA. The math is linear; the default framebuffer is
    // a display-code-value target, so the preview applies the sRGB OETF once. The linear
    // diagnostic render target receives the raw linear values.
    vec3 outRgb = neon4.w > 0.5
        ? rgb
        : mix(12.92 * rgb, 1.055 * pow(max(rgb, 0.0), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), rgb));
    cc_FragColor = vec4(outRgb, alpha);
}
