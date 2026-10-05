// Three deterministic gravity waves, shared by displacement and caustics.
// Return height and analytic x/z derivatives; amplitude is in world units.
vec3 waveField(vec2 p) {
    vec2 d0 = normalize(vec2(1.0, 0.35));
    vec2 d1 = normalize(vec2(-0.4, 1.0));
    vec2 d2 = normalize(vec2(0.8, -0.6));
    float a = wave.x;
    float s0 = dot(p, d0) * 1.7 + wave.y * 1.25 + wave.z;
    float s1 = dot(p, d1) * 2.8 - wave.y * 1.65 + wave.z * 0.73;
    float s2 = dot(p, d2) * 5.1 + wave.y * 2.15 + wave.z * 1.37;
    float h = a * (sin(s0) + 0.48 * sin(s1) + 0.18 * sin(s2));
    vec2 g = a * (1.7 * cos(s0) * d0 + 1.344 * cos(s1) * d1 + 0.918 * cos(s2) * d2);
    vec2 delta = p - impact.xy;
    float radius = max(length(delta), 0.0001);
    float age = max(wave.y - impact.z, 0.0);
    float ring = radius - 0.15 - age * 1.4;
    float envelope = impact.w * 0.085 * exp(-ring * ring * 35.0 - age * 1.6);
    float phase = radius * 22.0 - age * 8.0;
    h += envelope * sin(phase);
    g += delta / radius * envelope * (22.0 * cos(phase) - 70.0 * ring * sin(phase));
    vec2 cell = floor(p / 1.6);
    vec2 rainDelta = p - (cell + 0.5) * 1.6;
    float rainR = max(length(rainDelta), 0.0001);
    float rainAge = fract(wave.y * 0.85 + sin(dot(cell, vec2(12.73, 45.91))) * 437.1);
    float rainRing = rainR - rainAge * 0.85;
    float rainEnvelope = wave.w * 0.026 * exp(-rainRing * rainRing * 55.0 - rainAge * 1.4);
    h += rainEnvelope * sin(rainR * 26.0 - rainAge * 9.0);
    g += rainDelta / rainR * rainEnvelope * (26.0 * cos(rainR * 26.0 - rainAge * 9.0) - 110.0 * rainRing * sin(rainR * 26.0 - rainAge * 9.0));
    return vec3(h, g);
}
