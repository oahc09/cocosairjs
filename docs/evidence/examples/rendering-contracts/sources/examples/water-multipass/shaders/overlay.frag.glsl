void main() {
    float edge = smoothstep(0.0, 0.08, localUV.x) * smoothstep(0.0, 0.08, 1.0 - localUV.x);
    edge *= smoothstep(0.0, 0.06, localUV.y) * smoothstep(0.0, 0.06, 1.0 - localUV.y);
    cc_FragColor = vec4(tint.rgb, tint.a * edge);
}
