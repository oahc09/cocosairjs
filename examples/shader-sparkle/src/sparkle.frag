precision highp int;
// Algorithm semantics: shader-effects-inc/shaders Sparkle dbfd42a (MIT).
// Independent uint hash: not derived from Fi / upstream noise.hash32.
float decode1(float x){return x<=0.04045?x/12.92:pow((x+0.055)/1.055,2.4);}
vec3 decodeRGB(vec3 x){return vec3(decode1(x.r),decode1(x.g),decode1(x.b));}
float encode1(float x){x=max(x,0.0);return x<=0.0031308?12.92*x:1.055*pow(x,1.0/2.4)-0.055;}
vec3 encodeRGB(vec3 x){return vec3(encode1(x.r),encode1(x.g),encode1(x.b));}
uint cellHash(ivec2 cell,uint salt){uint h=uint(cell.x)*1664525u+uint(cell.y)*1013904223u+salt*69069u+362437u;h=h^(h>>13u);h=h*1103515245u;return h^(h>>17u);}
vec3 randomCell(ivec2 cell,uint salt){return vec3(float(cellHash(cell,salt)&65535u),float(cellHash(cell,salt+17u)&65535u),float(cellHash(cell,salt+53u)&65535u))/65535.0;}
vec4 straightAt(vec2 uv){vec4 s=texture(sourceTexture,clamp(uv,vec2(0.0),vec2(1.0)));return vec4(decodeRGB(s.rgb),s.a);}
float weightedLuma(vec4 s){return dot(s.rgb,vec3(0.2126,0.7152,0.0722))*s.a;}
vec4 brightest(vec2 uv,float angle){vec4 best=straightAt(uv);float luma=weightedLuma(best);if(sparkle0.w>0.0){for(int i=0;i<4;i++){float a=angle+float(i)*1.5707963267948966;vec4 candidate=straightAt(uv+vec2(cos(a),sin(a))*sparkle0.w/sparkle2.xy);float lum=weightedLuma(candidate);if(lum>luma){best=candidate;luma=lum;}}}return best;}
float star(vec2 o,float reach){vec2 a=abs(o);float core=exp(-dot(o,o)*0.9);float lengthRate=0.45/max(sparkle1.x,0.01);float rays=exp(-a.x*1.6-a.y*lengthRate)+exp(-a.y*1.6-a.x*lengthRate);return (core+0.25*rays)*(1.0-smoothstep(reach*0.6,reach,max(a.x,a.y)));}
void main(){vec2 px=v_uv*sparkle2.xy;vec4 child=straightAt(v_uv);vec3 glow=vec3(0.0);
if(sparkle0.y>0.0){for(int layer=0;layer<2;layer++){float cellSize=sparkle0.x*(layer==0?1.0:0.6666666666666667);ivec2 base=ivec2(floor(px/cellSize-0.5));uint salt=uint(floor((sparkle1.w+float(layer)*0.31)*4096.0));for(int dy=0;dy<2;dy++){for(int dx=0;dx<2;dx++){ivec2 cell=base+ivec2(dx,dy);vec3 r=randomCell(cell,salt);vec2 point=(vec2(cell)+0.5+(r.xy-0.5)*0.6)*cellSize;vec4 source=brightest(point/sparkle2.xy,float(layer)*0.7853981633974483);float presence=smoothstep(sparkle0.z,sparkle0.z+0.12,sqrt(max(weightedLuma(source),0.0)));float blink=max(sin(sparkle2.z*(0.8+r.z*1.2)+r.x*6.283185307179586),0.0);blink*=blink;blink*=blink;blink*=blink;float level=0.35+0.65*step(0.45,r.z);float lum=dot(source.rgb,vec3(0.2126,0.7152,0.0722));vec3 tint=mix(vec3(1.0),source.rgb/max(lum,0.001)*0.6,sparkle1.y);glow+=tint*star(px-point,cellSize*0.5)*blink*presence*level*sparkle0.y;}}}}
// The composable effect is linear associated RGBA; diagnostic RT bypasses OETF.
float alpha=min(child.a+max(glow.r,max(glow.g,glow.b)),1.0);vec3 associated=child.rgb*child.a+glow;
if(sparkle2.w>0.5){cc_FragColor=vec4(associated,alpha);}else{cc_FragColor=vec4(alpha>0.0?encodeRGB(associated/alpha)*alpha:vec3(0.0),alpha);}}
