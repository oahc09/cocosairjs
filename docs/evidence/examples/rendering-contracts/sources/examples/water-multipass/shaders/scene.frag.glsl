void main() {
    vec3 n = normalize(worldNormal);
    float light = 0.30 + 0.70 * max(dot(n, normalize(vec3(-0.4, 0.9, 0.3))), 0.0);
    vec3 color = tint.rgb * light;
    if (objectParams.x > 0.5) {
        float grain = 0.94 + 0.06 * sin(worldPosition.x * 21.0) * sin(worldPosition.z * 17.0);
        vec4 q = causticVP * vec4(worldPosition, 1.0);
        vec2 uv = q.xy / q.w * 0.5 + 0.5;
        vec3 focus = texture(causticMap, clamp(uv, vec2(0.002), vec2(0.998))).rgb;
        color = color * grain + focus * objectParams.y * 0.28;
    }
    cc_FragColor = vec4(color, tint.a);
}
