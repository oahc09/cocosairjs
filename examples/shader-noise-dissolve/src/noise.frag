// Modified GLSL port, 2026-10-09: MaterialX/OSL 2D gradient/hash only.
// Copyright (c) 2009-2010 Sony Pictures Imageworks Inc., et al.
// SPDX-License-Identifier: BSD-3-Clause
// MaterialX modifications: conservatively retain Apache-2.0; shader-effects port MIT.
// Full notices accompany this example in THIRD_PARTY_NOTICES.txt; not Fi-hash.
uint rotate32(uint x, uint k) { return (x << k) | (x >> (32u-k)); }
uint latticeHash(ivec2 xy) {
    uint origin=0xdeadbeefu+8u+13u;
    uint a=origin+uint(xy.x), b=origin+uint(xy.y), c=origin;
    c^=b; c-=rotate32(b,14u); a^=c; a-=rotate32(c,11u);
    b^=a; b-=rotate32(a,25u); c^=b; c-=rotate32(b,16u);
    a^=c; a-=rotate32(c,4u); b^=a; b-=rotate32(a,14u);
    c^=b; c-=rotate32(b,24u); return c;
}
float gradient(ivec2 xy, vec2 delta) {
    uint h=latticeHash(xy)&7u;
    float a=h<4u?delta.x:delta.y;
    float b=2.0*(h<4u?delta.y:delta.x);
    return ((h&1u)!=0u?-a:a)+((h&2u)!=0u?-b:b);
}
float perlin(vec2 p) {
    ivec2 cell=ivec2(floor(p)); vec2 f=fract(p);
    vec2 q=f*f*f*(f*(f*6.0-15.0)+10.0);
    float a=gradient(cell,f),b=gradient(cell+ivec2(1,0),f-vec2(1,0));
    float c=gradient(cell+ivec2(0,1),f-vec2(0,1)),d=gradient(cell+ivec2(1,1),f-vec2(1,1));
    return 0.6616*mix(mix(a,b,q.x),mix(c,d,q.x),q.y);
}
float coverage(vec2 uv) {
    vec2 p=vec2(uv.x*geometry.x*params.y+params.w*13.7,uv.y*params.y+params.w*7.9);
    float a=perlin(p),b=perlin(p*2.0+vec2(17.3+params.w*3.1,9.1));
    float c=perlin(p*4.0+vec2(41.7,27.9+params.w*5.3));
    return clamp(0.5+0.9*(a+0.5*b+0.25*c)/1.75,0.0,1.0);
}
void main() {
    vec2 uv=vec2(v_uv.x,1.0-v_uv.y); // visual top y=0, independent of source upload orientation
    float check=mod(floor(uv.x*16.0)+floor(uv.y*16.0),2.0);
    if (geometry.z>2.5) { cc_FragColor=vec4(vec3(mix(0.125490196,0.250980392,check)),1.0); return; }
    vec4 color=texture(sourceTexture,uv); float c=coverage(uv);
    if (geometry.y>0.5) c=1.0-c;
    float mask;
    if(params.x<=0.0) mask=1.0;
    else if(params.x>=1.0) mask=0.0;
    else if(params.z==0.0) mask=step(params.x,c);
    else { float f=max(params.z,0.0001);float front=params.x*(1.0+2.0*f)-f;mask=smoothstep(front-f,front+f,c); }
    if (geometry.z>1.5) cc_FragColor=vec4(color.rgb,color.a*mask); // diagnostic straight-alpha output
    else if (geometry.z>0.5) cc_FragColor=vec4(c,mask,color.a*mask,1.0);
    else cc_FragColor=vec4(color.rgb,color.a*mask); // only alpha changes
}
