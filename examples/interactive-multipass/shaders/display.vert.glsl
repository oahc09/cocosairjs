void main() {
    v_uv = a_texCoord;
    gl_Position = vec4(a_position.xy, 0.0, 1.0);
}
