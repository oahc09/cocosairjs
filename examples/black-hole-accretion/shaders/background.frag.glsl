void main() {
    float radius = length((gl_PointCoord - vec2(0.5)) * 2.0);
    if (radius > 1.0) discard;
    cc_FragColor = vec4(particleColor.rgb, particleColor.a * exp(-radius * radius * 3.8));
}
