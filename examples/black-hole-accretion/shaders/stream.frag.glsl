void main() {
    vec2 coordinate = (gl_PointCoord - vec2(0.5)) * 2.0;
    float along = dot(coordinate, particleDirection);
    float crosswise = dot(coordinate, vec2(-particleDirection.y, particleDirection.x));
    float glow = exp(-crosswise * crosswise * 13.0 - along * along * 2.3);
    if (length(coordinate) > 1.0) discard;
    cc_FragColor = vec4(particleColor.rgb, particleColor.a * glow);
}
