// C04 dissolve stage: full E01 mother noise (MaterialX/OSL Perlin, 3-octave fbm) + reveal
// mask over ANY input route. Only alpha is scaled (straight alpha, RGB preserved).
// Endpoints: progress<=0 -> EXACT identity (mask 1); progress>=1 -> EXACT transparent;
// disabled -> true input-copy pass (one OETF at display, never two).
// Modified GLSL port, 2026-10-09 lineage: MaterialX/OSL 2D gradient/hash only.
// Copyright (c) 2009-2010 Sony Pictures Imageworks Inc., et al. SPDX-License-Identifier: BSD-3-Clause.
// Full notices accompany this example in THIRD_PARTY_NOTICES.txt.
precision highp float;
precision highp int;
in highp vec2 v_uv;
layout(set = 1, binding = 0) uniform Constants {
    vec4 params; // progress, scale, softness, seed
    vec4 flags;  // invert, enabled, diagnostic, aspect
};
layout(set = 1, binding = 1) uniform sampler2D sourceTexture;
out vec4 cc_FragColor;
uint rotate32(uint x, uint k) { return (x << k) | (x >> (32u-k)); }
uint latticeHash(ivec2 xy) {
    uint origin=0xdeadbeefu+8u+13u;
    uint a=origin+uint(xy.x), b=origin+uint(xy.y), c=origin;
    c^=b; c-=rotate32(b,14u); a^=c; a-=rotate32(c,11u);
    b^=a; b-=rotate32(a,25u); c^=b; c-=rotate32(b,16u);
    a^=c; a-=rotate32(c,4u); b^=a; b-=rotate32(a,14u);
    c^=b; c-=rotate32(b,24u); return c;
}
float gradient(ivec2 xy, vec2 delta) {
    uint h=latticeHash(xy)&7u;
    float a=h<4u?delta.x:delta.y;
    float b=2.0*(h<4u?delta.y:delta.x);
    return ((h&1u)!=0u?-a:a)+((h&2u)!=0u?-b:b);
}
float perlin(vec2 p) {
    ivec2 cell=ivec2(floor(p)); vec2 f=fract(p);
    vec2 q=f*f*f*(f*(f*6.0-15.0)+10.0);
    float a=gradient(cell,f),b=gradient(cell+ivec2(1,0),f-vec2(1,0));
    float c=gradient(cell+ivec2(0,1),f-vec2(0,1)),d=gradient(cell+ivec2(1,1),f-vec2(1,1));
    return 0.6616*mix(mix(a,b,q.x),mix(c,d,q.x),q.y);
}
float coverage(vec2 uv) {
    // Aspect-aware stable 3-octave fbm (mother coverage.noise: scale * aspect on x, seed offsets).
    vec2 p=vec2(uv.x*flags.w*params.y+params.w*13.7,uv.y*params.y+params.w*7.9);
    float a=perlin(p),b=perlin(p*2.0+vec2(17.3+params.w*3.1,9.1));
    float c=perlin(p*4.0+vec2(41.7,27.9+params.w*5.3));
    return clamp(0.5+0.9*(a+0.5*b+0.25*c)/1.75,0.0,1.0);
}
vec4 unpremultiplySafe(vec4 s) {
    // Safe inverse for premultiplied rgba8 storage: EXACTLY zero alpha yields zero RGB;
    // every positive alpha (including 1/255) divides — f32 keeps the amplification finite
    // because rgba8 storage quantized the numerator on the same grid.
    return vec4(s.a > 0.0 ? s.rgb / s.a : vec3(0.0), s.a);
}
vec3 encode(vec3 c) {
    return mix(1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
               12.92 * c, lessThanEqual(c, vec3(0.0031308)));
}
void main() {
    // Texel-center sampling, CLAMP_TO_EDGE, y flipped so visual top is v=0 (upload orientation
    // independence), identical across all three input routes.
    vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
    vec4 stored = texture(sourceTexture, uv); // premultiplied rgba8 storage
    vec4 source = unpremultiplySafe(stored);  // straight linear
    // Compute the mask for EVERY path first. Coverage is always evaluated for the diagnostic
    // field view — disabled does not skip diagnostics; it only pins the mask to exactly 1.
    float c = 0.0;
    float mask = 1.0;
    if (flags.y < 0.5) {
        // Disabled filter: TRUE input copy — mask stays 1; the unified tail below applies ONE
        // OETF by mode only (the disabled path never early-encodes, staying linear through here).
        mask = 1.0;
    }
    if (flags.y > 0.5 || flags.z > 1.5) {
        c = coverage(uv);
        if (flags.x > 0.5) c = 1.0 - c;
        if (params.x <= 0.0) mask = 1.0;        // exact identity at progress 0
        else if (params.x >= 1.0) mask = 0.0;   // exact transparent at progress 1
        else if (params.z == 0.0) mask = step(params.x, c);
        else {
            float f = max(params.z, 0.0001);
            float front = params.x * (1.0 + 2.0 * f) - f;
            mask = smoothstep(front - f, front + f, c);
        }
    }
    // Diagnostic field view (coverage, mask) — linear, no OETF; disabled ALSO honors it.
    if (flags.z > 1.5) { cc_FragColor = vec4(c, mask, source.a * mask, 1.0); return; }
    vec4 straight = vec4(source.rgb, source.a * mask);
    // ONE OETF at the very end, by mode only — the disabled path does not skip diagnostics.
    cc_FragColor = flags.z > 0.5 ? straight : vec4(encode(straight.rgb), straight.a);
}
