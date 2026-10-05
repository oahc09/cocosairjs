void main() {
    float focus = max(focusing - 0.78, 0.0) * 0.32;
    cc_FragColor = vec4(vec3(0.70, 0.90, 1.0) * focus, 1.0);
}
