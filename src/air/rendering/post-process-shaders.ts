/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
// All intermediates are linear RGBA16F. Only the final pass encodes for the display.
export const POST_PREFILTER = `
vec3 fetch4(vec2 uv) {
 vec2 d = params.xy * 0.5;
 return (texture(sourceTexture,uv+vec2(-d.x,-d.y)).rgb+texture(sourceTexture,uv+vec2(d.x,-d.y)).rgb
       + texture(sourceTexture,uv+vec2(-d.x,d.y)).rgb+texture(sourceTexture,uv+d).rgb)*0.25;
}
void main(){
 vec3 c=max(fetch4(v_uv),vec3(0.0));
 float b=max(max(c.r,c.g),c.b),k=params.z*params.w;
 float soft=clamp(b-params.z+k,0.0,2.0*k);
 soft=soft*soft/(4.0*k+0.00001);
 float contribution=max(b-params.z,soft)/max(b,0.00001);
 cc_FragColor=vec4(c*contribution,1.0);
}`;
export const POST_DOWN = `
void main(){vec2 d=params.xy*0.5;
 vec3 c=texture(sourceTexture,v_uv+vec2(-d.x,-d.y)).rgb+texture(sourceTexture,v_uv+vec2(d.x,-d.y)).rgb
       +texture(sourceTexture,v_uv+vec2(-d.x,d.y)).rgb+texture(sourceTexture,v_uv+d).rgb;
 cc_FragColor=vec4(c*0.25,1.0);}`;
export const POST_UP = `
void main(){vec2 d=params.xy;
 vec3 c=texture(sourceTexture,v_uv).rgb*4.0;
 c+=(texture(sourceTexture,v_uv+vec2(d.x,0)).rgb+texture(sourceTexture,v_uv-vec2(d.x,0)).rgb
    +texture(sourceTexture,v_uv+vec2(0,d.y)).rgb+texture(sourceTexture,v_uv-vec2(0,d.y)).rgb)*2.0;
 c+=texture(sourceTexture,v_uv+d).rgb+texture(sourceTexture,v_uv-d).rgb
   +texture(sourceTexture,v_uv+vec2(d.x,-d.y)).rgb+texture(sourceTexture,v_uv+vec2(-d.x,d.y)).rgb;
 cc_FragColor=vec4(mix(texture(baseTexture,v_uv).rgb,c/16.0,params.z),1.0);}`;
export const POST_OUTPUT = `
vec3 encodeSRGB(vec3 c){return mix(1.055*pow(c,vec3(1.0/2.4))-0.055,c*12.92,lessThanEqual(c,vec3(0.0031308)));}
// Spatial FXAA-style edge filter on the linear HDR capture. Limit the search
// to two pixels; flat and low-contrast areas remain the unmodified source.
float aaLuma(vec4 c){return dot(c.rgb,vec3(0.299,0.587,0.114))*c.a;}
vec4 aaFetch(vec2 uv){
 vec2 halfPixel=aaParams.xy*0.5;
 return texture(sourceTexture,clamp(uv,viewport.xy+halfPixel,viewport.xy+viewport.zw-halfPixel));
}
vec4 edgeAA(vec2 uv,vec4 center){
 vec2 d=aaParams.xy;
 float nw=aaLuma(aaFetch(uv+vec2(-d.x,-d.y)));
 float ne=aaLuma(aaFetch(uv+vec2(d.x,-d.y)));
 float sw=aaLuma(aaFetch(uv+vec2(-d.x,d.y)));
 float se=aaLuma(aaFetch(uv+d));
 float m=aaLuma(center), lo=min(m,min(min(nw,ne),min(sw,se))), hi=max(m,max(max(nw,ne),max(sw,se)));
 if(hi-lo<max(0.0312,hi*0.125)) return center;
 vec2 dir=vec2(-((nw+ne)-(sw+se)),(nw+sw)-(ne+se));
 float reduce=max((nw+ne+sw+se)*0.03125,0.0078125);
 dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+reduce),vec2(-2.0),vec2(2.0))*d;
 vec4 a=0.5*(aaFetch(uv-dir/6.0)+aaFetch(uv+dir/6.0));
 vec4 b=a*0.5+0.25*(aaFetch(uv-dir*0.5)+aaFetch(uv+dir*0.5));
 float lb=aaLuma(b);
 return lb<lo||lb>hi?a:b;
}
void main(){vec2 uv=viewport.xy+v_uv*viewport.zw;
 vec4 src=texture(sourceTexture,uv);
 if(aaParams.z>0.5) src=edgeAA(uv,src);
 vec3 c=max(src.rgb+texture(bloomTexture,uv).rgb*params.y,vec3(0.0))*params.x;
 if(params.z<0.5)c=(c*(2.51*c+0.03))/(c*(2.43*c+0.59)+0.14);
 else if(params.z<1.5)c=c/(1.0+c);
 c=clamp(c,0.0,1.0);
 cc_FragColor=vec4(params.w>0.5?c:encodeSRGB(c),src.a);
}`;
