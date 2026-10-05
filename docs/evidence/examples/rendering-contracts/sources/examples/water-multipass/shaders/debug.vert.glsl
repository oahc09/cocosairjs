void main() {
    screenUV = a_texCoord;
    gl_Position = vec4(a_position.xy, 0.0, 1.0);
}
