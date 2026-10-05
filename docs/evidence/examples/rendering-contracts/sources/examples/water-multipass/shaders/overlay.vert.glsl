void main() {
    localUV = a_texCoord;
    gl_Position = cc_matViewProj * cc_matWorld * vec4(a_position, 1.0);
}
