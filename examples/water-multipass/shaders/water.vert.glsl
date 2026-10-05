/* WAVES */
void main() {
    vec4 world = cc_matWorld * vec4(a_position, 1.0);
    vec3 field = waveField(world.xz);
    world.y += field.x;
    waterNormal = normalize(vec3(-field.y, 1.0, -field.z));
    waterPosition = world.xyz;
    reflectedClip = reflectionVP * world;
    refractedClip = refractionVP * world;
    gl_Position = cc_matViewProj * world;
}
