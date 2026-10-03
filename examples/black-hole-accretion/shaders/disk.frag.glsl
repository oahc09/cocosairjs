void main() {
    float radius = length(diskPosition);
    float edge = max(fwidth(radius), 0.01);
    float inner = 1.8;
    float outer = 6.5;
    float radial = clamp((radius - inner) / (outer - inner), 0.0, 1.0);
    float angle = atan(diskPosition.y, diskPosition.x) - motion.y;
    float stripes = 0.73 + 0.18 * sin(angle * 15.0 + log(radius + 1.0) * 23.0)
        + 0.09 * sin(angle * 29.0 - radius * 14.0);
    vec3 color = mix(vec3(0.98, 0.99, 1.0), vec3(1.0, 0.58, 0.11), smoothstep(0.02, 0.34, radial));
    color = mix(color, vec3(0.55, 0.07, 0.012), smoothstep(0.3, 1.0, radial));
    float brightness = (0.76 * exp(-radial * 2.6) + 0.025) * stripes;
    brightness *= 0.83 + 0.17 * cos(angle - 0.3);
    float alpha = smoothstep(inner - edge, inner + edge, radius) * (1.0 - smoothstep(outer - 0.4, outer + 0.2, radius));
    if (alpha <= 0.001) discard;
    cc_FragColor = vec4(color * brightness, alpha);
}
