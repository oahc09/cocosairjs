void main() {
    vec3 n = normalize(waterNormal);
    vec3 view = normalize(eye.xyz - waterPosition);
    vec2 refractUV = refractedClip.xy / refractedClip.w * 0.5 + 0.5;
    vec2 reflectUV = reflectedClip.xy / reflectedClip.w * 0.5 + 0.5;
    vec2 perturbation = n.xz * optics.x;
    refractUV = clamp(refractUV + perturbation, vec2(0.003), vec2(0.997));
    reflectUV = clamp(reflectUV + perturbation, vec2(0.003), vec2(0.997));
    float depth = texture(depthMap, refractUV).r;
    // WebGL2 depth buffer [0,1] -> clip z [-1,1], including the oblique projection.
    vec4 receiver = inverseRefractionVP * vec4(refractUV * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec3 bottom = receiver.xyz / receiver.w;
    float thickness = depth >= 0.999999 ? 8.0 : clamp(length(bottom - waterPosition), 0.0, 8.0);
    vec3 transmitted = texture(refractionMap, refractUV).rgb;
    vec3 reflected = texture(reflectionMap, reflectUV).rgb;
    vec3 absorption = exp(-vec3(0.32, 0.10, 0.065) * thickness * optics.y * channels.z);
    vec3 underwater = transmitted * absorption + vec3(0.025, 0.24, 0.28) * (1.0 - absorption);
    float fresnel = 0.0204 + 0.9796 * pow(1.0 - max(dot(n, view), 0.0), 5.0);
    vec3 color = mix(vec3(0.035, 0.28, 0.31), underwater, channels.y);
    color = mix(color, reflected, fresnel * channels.x);
    vec3 halfVector = normalize(view + normalize(vec3(-0.4, 0.9, 0.3)));
    color += vec3(1.0, 0.91, 0.72) * pow(max(dot(n, halfVector), 0.0), 110.0) * 0.35;
    float foam = (1.0 - smoothstep(0.06, 0.35, thickness)) * channels.z;
    color = mix(color, vec3(0.78, 0.92, 0.93), foam * 0.55);
    cc_FragColor = vec4(color, 1.0);
}
