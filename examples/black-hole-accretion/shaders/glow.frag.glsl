// Analytic geometry glow, deliberately not screen-space bloom.
void main() {
    float radius = length(diskPosition);
    float center = radius - 1.8;
    float halo = 0.23 * exp(-center * center / 0.18) + 0.065 * exp(-center * center / 1.3);
    halo += 0.024 * exp(-pow((radius - 3.4) / 2.1, 2.0));
    halo *= smoothstep(1.18, 1.48, radius) * (1.0 - smoothstep(7.6, 9.0, radius));
    vec3 color = mix(vec3(0.92, 0.93, 1.0), vec3(1.0, 0.18, 0.025), smoothstep(1.9, 6.2, radius));
    cc_FragColor = vec4(color, halo);
}
