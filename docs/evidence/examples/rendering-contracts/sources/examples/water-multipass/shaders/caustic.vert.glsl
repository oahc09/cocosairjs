/* WAVES */
vec2 rayLanding(vec2 p) {
    vec3 f = waveField(p);
    vec3 normal = normalize(vec3(-f.y, 1.0, -f.z));
    vec3 ray = refract(normalize(vec3(0.4, -0.9, -0.3)), normal, 1.0 / 1.333);
    return p + ray.xz * ((2.0 + f.x) / max(-ray.y, 0.1));
}
void main() {
    vec2 p = a_position.xz;
    float e = 0.015;
    vec2 landing = rayLanding(p);
    vec2 dx = (rayLanding(p + vec2(e, 0.0)) - rayLanding(p - vec2(e, 0.0))) / (2.0 * e);
    vec2 dz = (rayLanding(p + vec2(0.0, e)) - rayLanding(p - vec2(0.0, e))) / (2.0 * e);
    float determinant = abs(dx.x * dz.y - dx.y * dz.x);
    focusing = clamp(1.0 / max(determinant, 0.12), 0.0, 4.0);
    gl_Position = cc_matViewProj * vec4(landing.x, -2.0, landing.y, 1.0);
}
