// C01 stage 3 (final): Sparkle reads the Emboss RT content (un-premultiplies), gates star
// glints on the actual composed luminance and color, applies ONE sRGB OETF + screen blend.
// Adapted from E06 (dbfd42ab, MIT). When sparkleEnabled=off this becomes a display copy pass.
precision highp float;
in highp vec2 v_uv;
layout(set = 1, binding = 0) uniform Constants {
    vec4 ss0;  // size, intensity, threshold, rayLength
    vec4 ss1;  // colorize, time, sparkleEnabled, unused
    vec4 ss2;  // CSS width/height, seed, linearDiagnostic
};
layout(set = 1, binding = 1) uniform highp sampler2D embossTexture;
out vec4 cc_FragColor;
// E06 independent uint hash (not Fi/upstream).
uint cellHash(ivec2 cell, uint salt) {
    uint h = uint(cell.x) * 1664525u + uint(cell.y) * 1013904223u + salt * 69069u + 362437u;
    h = h ^ (h >> 13u); h = h * 1103515245u; return h ^ (h >> 17u);
}
vec3 randomCell(ivec2 cell, uint salt) {
    return vec3(
        float(cellHash(cell, salt) & 65535u),
        float(cellHash(cell, salt + 17u) & 65535u),
        float(cellHash(cell, salt + 53u) & 65535u)) / 65535.0;
}
float weightedLuma(vec4 s) { return dot(s.rgb, vec3(0.2126, 0.7152, 0.0722)) * s.a; }
float sparkleRayLength() { return ss0.w; }
float star(vec2 o, float reach) {
    vec2 a = abs(o);
    float core = exp(-dot(o, o) * 0.9);
    float lr = 0.45 / max(sparkleRayLength(), 0.01);
    float rays = exp(-a.x * 1.6 - a.y * lr) + exp(-a.y * 1.6 - a.x * lr);
    return (core + 0.25 * rays) * (1.0 - smoothstep(reach * 0.6, reach, max(a.x, a.y)));
}

void main() {
    // Read the Emboss RT (premultiplied), un-premultiply to straight.
    vec4 premul = texture(embossTexture, v_uv);
    float alpha = premul.a;
    vec3 straightRgb = alpha > 0.0 ? premul.rgb / alpha : vec3(0.0);
    if (ss1.z < 0.5) {
        if (ss2.w > 0.5) { cc_FragColor = vec4(straightRgb, alpha); return; }
        // Sparkle OFF: display copy pass — straight to OETF + screen blend.
        vec3 enc = mix(12.92 * straightRgb, 1.055 * pow(max(straightRgb, 0.0), vec3(1.0 / 2.4)) - 0.055,
            step(vec3(0.0031308), straightRgb));
        cc_FragColor = vec4(clamp(enc, 0.0, 1.0), alpha);
        return;
    }
    // The RT stores LINEAR premultiplied values — un-premultiply gives straight LINEAR directly.
    // NO EOTF decode: the intermediate RT chain is linear throughout.
    float size = ss0.x;
    float intensity = ss0.y;
    float threshold = ss0.z;
    float colorize = ss1.x;
    float time = ss1.y;
    float seed = ss2.z;
    vec2 px = v_uv * ss2.xy;
    vec3 glow = vec3(0.0);
    if (intensity > 0.0) {
        for (int layer = 0; layer < 2; layer++) {
            float cellSize = size * (layer == 0 ? 1.0 : 0.6666666666666667);
            ivec2 base = ivec2(floor(px / cellSize - 0.5));
            uint salt = uint(floor((seed + float(layer) * 0.31) * 4096.0));
            for (int dy = 0; dy < 2; dy++) {
                for (int dx = 0; dx < 2; dx++) {
                    ivec2 cell = base + ivec2(dx, dy);
                    vec3 r = randomCell(cell, salt);
                    vec2 point = (vec2(cell) + 0.5 + (r.xy - 0.5) * 0.6) * cellSize;
                    // Sample the ACTUAL Emboss RT at the star position.
                    vec2 sampleUv = point / ss2.xy;
                    vec4 smp = texture(embossTexture, clamp(sampleUv, vec2(0.0), vec2(1.0)));
                    vec3 sLin = smp.a > 0.0 ? smp.rgb / smp.a : vec3(0.0);
                    float lum = dot(sLin, vec3(0.2126, 0.7152, 0.0722)) * smp.a;
                    float presence = smoothstep(threshold, threshold + 0.12, sqrt(max(lum, 0.0)));
                    float blink = max(sin(time * (0.8 + r.z * 1.2) + r.x * 6.283185307179586), 0.0);
                    blink *= blink; blink *= blink; blink *= blink;
                    float level = 0.35 + 0.65 * step(0.45, r.z);
                    float lumSrc = dot(sLin, vec3(0.2126, 0.7152, 0.0722));
                    vec3 tint = mix(vec3(1.0), sLin / max(lumSrc, 0.001) * 0.6, colorize);
                    glow += tint * star(px - point, cellSize * 0.5) * blink * presence * level * intensity;
                }
            }
        }
    }
    // Composite: straight child + glow (linear associated).
    float totalAlpha = min(alpha + max(glow.r, max(glow.g, glow.b)), 1.0);
    vec3 associated = straightRgb * alpha + glow;
    vec3 finalRgb = totalAlpha > 0.0 ? associated / totalAlpha : vec3(0.0);
    if (ss2.w > 0.5) { cc_FragColor = vec4(finalRgb, totalAlpha); return; }
    // ONE OETF for screen display.
    vec3 enc = mix(12.92 * finalRgb, 1.055 * pow(max(finalRgb, 0.0), vec3(1.0 / 2.4)) - 0.055,
        step(vec3(0.0031308), finalRgb));
    cc_FragColor = vec4(clamp(enc, 0.0, 1.0), totalAlpha);
}
