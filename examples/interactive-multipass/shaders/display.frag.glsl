void main() {
    vec3 linear = texture(displayMap, v_uv).rgb;
    if (params.y > 0.5) {
        // RGBA16F path may carry >1 radiance. Knee reinhard with a 0.5 threshold:
        // dark background stays byte-exact while over-bright channels compress above it.
        vec3 mapped = linear * params.x;
        mapped = mix(mapped, mapped / (1.0 + mapped), step(vec3(0.5), mapped));
        cc_FragColor = vec4(mapped, 1.0);
    } else {
        cc_FragColor = vec4(linear, 1.0);
    }
}
