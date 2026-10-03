void main() {
    vec4 view = cc_matView * cc_matWorld * vec4(a_position, 1.0);
    gl_Position = cc_matProj * view;
    float seed = fract(sin(dot(a_position, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    gl_PointSize = clamp((5.0 + seed * 4.0) * motion.z * 24.0 / max(-view.z, 5.0), 2.0, 32.0);
    particleColor = vec4(mix(vec3(0.55, 0.68, 1.0), vec3(1.0, 0.89, 0.71), seed), 0.35 + seed * 0.6);
}
