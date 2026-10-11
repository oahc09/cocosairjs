// E05 deterministic child source pattern. Renders PREMULTIPLIED output into the child render
// target over a transparent clear (the canonical RTT convention the emboss shader inverts).
// Contents: 8x8 checker with a u-gradient (UV-direction anchors), opaque left half, exactly
// 0.5-alpha right half (no-double-premultiply probe), an alpha-0 disc with hidden non-zero RGB
// (premultiply storage zeroes it; the unpremultiply guard must yield 0 with no NaN), an opaque
// anchor disc, and a fully transparent "blank" mode.
precision highp float;
in highp vec2 v_uv;
layout(set = 1, binding = 0) uniform Constants {
    vec4 pattern0;  // sourceKind(0=standard,1=blank), unused, unused, unused
};
out vec4 cc_FragColor;
void main() {
    if (pattern0.x > 0.5) {
        cc_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }
    vec2 cell = floor(v_uv * 8.0);
    float check = mod(cell.x + cell.y, 2.0) < 0.5 ? 0.35 : 0.65;
    vec3 rgb = vec3(check, check * 0.8, check * 0.6);
    rgb.r += v_uv.x * 0.1;
    float alpha = v_uv.x < 0.5 ? 1.0 : 0.5;
    if (length(v_uv - vec2(0.75, 0.25)) < 0.08) {
        rgb = vec3(1.0, 0.437, 0.0);
        alpha = 0.0;
    }
    if (length(v_uv - vec2(0.25, 0.75)) < 0.08) {
        rgb = vec3(0.9, 0.2, 0.5);
        alpha = 1.0;
    }
    cc_FragColor = vec4(clamp(rgb, 0.0, 1.0) * alpha, alpha);
}
