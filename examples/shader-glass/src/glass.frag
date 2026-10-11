// E09 native adaptation of the pinned Glass helper's analytic + Vogel fallback path.
// No Gaussian compute prepass, TypeGPU or external canvas. Child RT is premultiplied RGBA8.
precision highp float;
precision highp int;
in highp vec2 v_uv;
layout(set = 1, binding = 0) uniform Constants {
    vec4 glass0; // scale, rotation degrees, refraction, transformed thickness
    vec4 glass1; // blur, aberration, innerZoom, edgeSoftness
    vec4 glass2; // lightAngle degrees, highlight, highlightSoftness, fresnel
    vec4 glass3; // fresnelSoftness, tintIntensity, preserveLum flag, cutout flag
    vec4 glass4; // linear tint rgb, diagnostic flag
    vec4 glass5; // backing width, height, reserved
};
layout(set = 1, binding = 1) uniform sampler2D childTexture;
out vec4 cc_FragColor;
const float PI_OVER_180 = 0.017453292519943295;
float sdf(vec2 p) {
#if SHAPE_BOX
    vec2 q = abs(p) - vec2(0.24, 0.16);
    return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - 0.04;
#else
    return length(p) - 0.3;
#endif
}
vec4 unpremultiply(vec4 c) {
    return vec4(c.a > 0.001 ? c.rgb / c.a : vec3(0.0), c.a);
}
vec4 sampleLens(vec2 uv) {
#if USE_BLUR
    vec4 sum = vec4(0.0);
    for (int i = 0; i < 9; i++) {
        float angle = float(i) * 2.39996322972865332;
        float r = sqrt(float(i) / 9.0);
        vec2 disk = vec2(cos(angle), sin(angle)) * r;
        sum += texture(childTexture, uv + disk / glass5.xy * glass1.x * 2.0);
    }
    return sum / 9.0;
#else
    return texture(childTexture, uv);
#endif
}
vec3 encode(vec3 c) {
    return mix(1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
               12.92 * c, lessThanEqual(c, vec3(0.0031308)));
}
void main() {
    float aspect = glass5.x / glass5.y;
    float rotation = glass0.y * PI_OVER_180;
    vec2 d = (v_uv - vec2(0.5)) * vec2(aspect, 1.0);
    vec2 f = vec2(d.x * cos(rotation) + d.y * sin(rotation),
                  d.y * cos(rotation) - d.x * sin(rotation)) / glass0.x;
    float sRaw = sdf(f);
    vec2 grad = vec2(sdf(f + vec2(0.01, 0.0)), sdf(f + vec2(0.0, 0.01))) - vec2(sRaw);
    grad /= 0.01;
    float s = sRaw / glass0.x;
    float depthNorm = clamp(-s / max(glass0.w * 0.3, 0.005), 0.0, 1.0);
    float refrStrength = (1.0 - depthNorm) * (1.0 - depthNorm);
    float slopeScale = min(1.0, 12.0 / max(length(grad), 0.0001));
    vec2 offset = -grad * slopeScale * glass0.z * 0.15 * refrStrength / vec2(aspect, 1.0);
    vec2 lensUV = vec2(0.5) + (v_uv - vec2(0.5)) / glass1.z + offset;
    vec4 lens;
#if USE_ABERRATION
    vec2 chr = offset * glass1.y * 0.06;
    vec4 rc = sampleLens(lensUV + chr);
    vec4 gc = sampleLens(lensUV);
    vec4 bc = sampleLens(lensUV - chr);
    lens = vec4(rc.r, gc.g, bc.b, gc.a);
#else
    lens = sampleLens(lensUV);
#endif
    lens = unpremultiply(lens);
    vec4 base = unpremultiply(texture(childTexture, v_uv));
    vec3 tinted = mix(lens.rgb, glass4.rgb, glass3.y);
    if (glass3.z > 0.5) tinted *= dot(lens.rgb, vec3(0.299, 0.587, 0.114)) /
                                  max(dot(tinted, vec3(0.299, 0.587, 0.114)), 0.0001);
    float pxH = 1.0 / glass5.y;
    float sharp = max(glass1.w * 0.5, 0.001);
    float w1 = max(sharp * 0.03125, pxH * 1.5);
    float rb1 = clamp(-s / w1, 0.0, 1.0);
    float w2 = max(sharp * 0.0625, pxH * 1.5);
    float rb2base = clamp(-(s - pxH) / w2, 0.0, 1.0) - clamp(-s / w2, 0.0, 1.0);
    vec2 light = vec2(cos(glass2.x * PI_OVER_180), sin(glass2.x * PI_OVER_180));
    float rb2 = rb2base * clamp(dot(grad, light) * 0.5 + 0.5, 0.0, 1.0) * glass2.y;
    vec3 normal = normalize(vec3(grad, 2.0));
    vec3 halfVector = vec3(light, 2.0) * 0.4472135954999579;
    float specular = pow(clamp(dot(normal, halfVector), 0.0, 1.0), exp2(8.0 - glass2.z * 7.0)) * glass2.y * refrStrength;
    float fresnelDepth = clamp(-s / max(glass3.x * 0.06, 0.001), 0.0, 1.0);
    float rim = (1.0 - fresnelDepth) * (1.0 - fresnelDepth) * glass2.w * rb1;
    vec4 lighting = vec4(tinted + vec3(rb2 + specular + rim), lens.a + rb2);
    float transition = smoothstep(0.0, 1.0, rb1);
    vec4 result = mix(base, lighting, transition);
    result.a *= glass3.w > 0.5 ? transition : 1.0;
    cc_FragColor = glass4.a > 0.5 ? result : vec4(encode(result.rgb), result.a);
}
