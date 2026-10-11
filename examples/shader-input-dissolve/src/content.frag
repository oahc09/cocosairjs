// C04 procedural content stage: deterministic native shader content (route 2). The pattern is
// generated IN the shader — no CPU texture and no scene graph stand-in. Output is premultiplied
// rgba8 storage for the dissolve stage to sample.
precision highp float;
precision highp int;
in highp vec2 v_uv;
layout(set = 1, binding = 0) uniform Constants {
    vec4 params;  // time, bands, reserved, reserved
    vec4 flags;   // aspect, reserved, reserved, solid-color mode
    vec4 params2; // colorOverride rgb + alpha (rendered slabs)
};
out vec4 cc_FragColor;
// Integer hash identical on GPU (uint32) and CPU (JS >>> 0): no sin/fract float drift.
uint hashU32(uint x) {
    x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16;
    return x;
}
float hash01(uvec2 xy) {
    return float(hashU32(xy.x + 19349663u * xy.y)) / 4294967295.0;
}
void main() {
    // Solid-color mode (rendered-route scene slabs): output the override color directly,
    // premultiplied — a real MeshRenderer material color, not a procedural pattern.
    if (flags.z > 0.5) {
        cc_FragColor = vec4(params2.rgb * params2.a, params2.a);
        return;
    }
    vec2 uv = v_uv;
    // Deterministic procedural content: banded gradient + per-band uint-hash luminance,
    // exactly reproducible by the CPU oracle (same uint32 chain in JS).
    float bands = max(params.y, 1.0);
    float band = floor(uv.x * bands);
    float lum = 0.2 + 0.6 * hash01(uvec2(uint(band), uint(floor(params.x * 60.0))));
    float vertical = smoothstep(0.0, 1.0, uv.y);
    vec3 rgb = mix(vec3(lum * 0.2, lum * 0.5, lum), vec3(lum, lum * 0.6, lum * 0.3), vertical);
    float alpha = 1.0;
    // Premultiplied rgba8 storage.
    cc_FragColor = vec4(rgb * alpha, alpha);
}
