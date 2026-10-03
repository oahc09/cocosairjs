void main() {
    float phase = fract(a_position.y + motion.x * 0.09);
    float radius = 7.7 - (7.7 - 1.22) * pow(phase, 1.7);
    float theta = a_position.x + phase * 10.0 + motion.y * 0.8;
    vec3 p = vec3(cos(theta) * radius, sin(theta) * radius, 0.03);
    vec4 view = cc_matView * cc_matWorld * vec4(p, 1.0);
    gl_Position = cc_matProj * view;
    gl_PointSize = clamp((3.0 + phase * 7.0) * motion.z * 14.0 / max(-view.z, 4.0), 2.0, 50.0);
    particleColor = vec4(mix(vec3(1.0, 0.3, 0.045), vec3(0.8, 0.92, 1.0), phase), 0.35 + phase * 0.5);
    particleDirection = normalize(vec2(-sin(theta), cos(theta) * 0.819152));
}
