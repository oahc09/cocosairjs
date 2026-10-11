// C01 complete E05 signed-height/central-normal/two-shadow/warp chain.
// Adapted math ideas: Shader Effects Inc. 2026 MIT, see ../UPSTREAM.md and ../LICENSE.reference.txt.
// Independent flat-2D implementation: analytic SDF shapes (circle / rounded box), no TypeGPU
// runtime, no SDF texture platform, no volumetric path. Signed height plateau from the SDF,
// central-difference normals, two-tap cast-shadow trace and a parallax-like child UV warp.
precision highp float;
in highp vec2 v_uv;
layout(set = 1, binding = 0) uniform Constants {
    vec4 es0; // depth, lightAngle degrees, shadowIntensity, embossEnabled
    vec4 es1; // backing width/height, time, unused
};
layout(set = 1, binding = 1) uniform highp sampler2D holoTexture;
out vec4 cc_FragColor;
const float INV_LIGHT_LEN = 0.81923192051904048;
const float LZN = 0.57346234436332832;
float distanceField(vec2 p) {
#if SHAPE_BOX
    vec2 q = abs(p) - vec2(0.24, 0.16);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.04;
#else
    return length(p) - 0.30;
#endif
}
// Signed plateau height. The reference writes smoothstep(tw, -tw, s) with reversed edges; GLSL
// leaves edge0 > edge1 undefined, so this is the explicit ordered-edge inverse.
float heightField(float s, float depth, float transitionW) {
    return depth * (1.0 - smoothstep(-transitionW, transitionW, s));
}
void main() {
    if (es0.w < 0.5) { cc_FragColor = texture(holoTexture, v_uv); return; }
    vec4 emboss0 = vec4(1.0, 0.0, es0.x, es0.y);
    vec4 emboss1 = vec4(0.6, es0.z, es1.z, 1.0);
    vec4 emboss2 = vec4(es1.x, es1.y, 0.0, 0.0);
    float aspect = emboss2.x / emboss2.y;
    vec2 delta = vec2((v_uv.x - 0.5) * aspect, v_uv.y - 0.5);
    float rad = emboss0.y * 0.017453292519943295;
    float cosR = cos(rad);
    float sinR = sin(rad);
    vec2 f = vec2(delta.x * cosR + delta.y * sinR, delta.y * cosR - delta.x * sinR) / emboss0.x;
    const float eps = 0.003;
    const float tw = 0.003;
    float depth = emboss0.z;
    // Centre + four cardinal SDF taps (central differences) and the two shadow-trace taps.
    float sC = distanceField(f);
    float sR = distanceField(f + vec2(eps, 0.0));
    float sL = distanceField(f - vec2(eps, 0.0));
    float sU = distanceField(f + vec2(0.0, eps));
    float sD = distanceField(f - vec2(0.0, eps));
    float lightRad = emboss0.w * 0.017453292519943295;
    float lx = cos(lightRad);
    float ly = sin(lightRad);
    float absDepth = max(abs(depth), 0.0001);
    float spread = absDepth * 0.06;
    float h1raw = distanceField(f + vec2(lx, ly) * spread * 0.5);
    float h2raw = distanceField(f + vec2(lx, ly) * spread);
    // Surface normal from the height gradient; edge lighting relative to the flat z baseline.
    float hR = heightField(sR, depth, tw);
    float hL = heightField(sL, depth, tw);
    float hU = heightField(sU, depth, tw);
    float hD = heightField(sD, depth, tw);
    float dhx = (hR - hL) / (eps * 2.0);
    float dhy = (hU - hD) / (eps * 2.0);
    float nLen = sqrt(dhx * dhx + dhy * dhy + 1.0);
    float NdotL = (-dhx / nLen) * (lx * INV_LIGHT_LEN) + (-dhy / nLen) * (ly * INV_LIGHT_LEN) + (1.0 / nLen) * LZN;
    float edgeLighting = (NdotL - LZN) * emboss1.x;
    float highlight = max(edgeLighting, 0.0);
    float edgeShadow = max(-edgeLighting, 0.0);
    // Cast shadow: heights at the two trace points vs the centre, through the wide transition.
    float hC = heightField(sC, depth, tw);
    float shadowTw = absDepth * 0.06;
    float h1 = heightField(h1raw, depth, shadowTw);
    float h2 = heightField(h2raw, depth, shadowTw);
    float diff1 = (h1 - hC) / absDepth;
    float diff2 = (h2 - hC) / absDepth;
    float castShadow = smoothstep(0.0, 0.5, diff1) * 0.55 + smoothstep(0.0, 0.5, diff2) * 0.45;
    float totalShadow = clamp(edgeShadow + castShadow, 0.0, 1.0) * emboss1.y;
    // Parallax-like child UV warp: scale the child around the centre inside the boundary. This is
    // a UV warp, not a claim of physical geometry displacement.
    float inside = 1.0 - smoothstep(-tw, tw, sC);
    float dispScale = 1.0 - depth * 0.05 * inside;
    vec2 warped = vec2(0.5 + (v_uv.x - 0.5) * dispScale, 0.5 + (v_uv.y - 0.5) * dispScale);
    // Child RTT samples are premultiplied; unpremultiply (alpha-0 safe) to straight colour.
    vec4 child = texture(holoTexture, warped);
    float childAlpha = child.a;
    vec3 straightRgb = childAlpha > 0.001 ? child.rgb / childAlpha : vec3(0.0);
    vec3 finalRgb = clamp(straightRgb * (1.0 - totalShadow) + vec3(highlight), 0.0, 1.0);
    cc_FragColor = vec4(finalRgb * childAlpha, childAlpha);
}
