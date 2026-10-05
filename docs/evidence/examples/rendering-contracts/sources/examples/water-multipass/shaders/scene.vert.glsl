void main() {
    vec4 world = cc_matWorld * vec4(a_position, 1.0);
    worldPosition = world.xyz;
    worldNormal = normalize((cc_matWorldIT * vec4(a_normal, 0.0)).xyz);
    gl_Position = cc_matViewProj * world;
}
