void main() {
    vec4 sampleColor = texture(displayMap, screenUV);
    if (debugParams.x > 0.5) {
        vec4 receiver = inverseRefractionVP * vec4(screenUV * 2.0 - 1.0, sampleColor.r * 2.0 - 1.0, 1.0);
        vec3 world = receiver.xyz / receiver.w;
        float linearDistance = max(-(refractionView * vec4(world, 1.0)).z, 0.0);
        sampleColor = vec4(vec3(sampleColor.r > 0.999999 ? 1.0 : linearDistance / debugParams.y), 1.0);
    }
    cc_FragColor = vec4(sampleColor.rgb, 1.0);
}
