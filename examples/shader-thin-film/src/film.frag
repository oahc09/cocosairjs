// Adapted math ideas: Shader Effects Inc. 2026 MIT, see ../UPSTREAM.md and ../LICENSE.txt.
// Independent analytic 2D shapes and gradient; no TypeGPU/runtime or volumetric field.
precision highp float;
in highp vec2 v_uv;
layout(set = 1, binding = 0) uniform Constants { vec4 film0; vec4 film1; vec4 film2; };
out vec4 cc_FragColor;
float distanceField(vec2 p) {
#if SHAPE_BOX
  vec2 q=abs(p)-vec2(0.24,0.16);
  return length(max(q,0.0))+min(max(q.x,q.y),0.0)-0.04;
#else
  return length(p)-0.30;
#endif
}
vec2 gradientField(vec2 p) {
#if SHAPE_BOX
  vec2 q=abs(p)-vec2(0.24,0.16);
  vec2 signP=vec2(p.x<0.0?-1.0:1.0,p.y<0.0?-1.0:1.0);
  vec2 outside=max(q,0.0);
  float g=length(outside);
  if(g>0.000001) return outside/g*signP;
  return q.x>q.y?vec2(signP.x,0.0):vec2(0.0,signP.y);
#else
  float len=length(p);
  return len>0.000001?p/len:vec2(1.0,0.0);
#endif
}
void main() {
  vec2 p=vec2((v_uv.x-0.5)*(film2.y/film2.z),v_uv.y-0.5);
  float sdf=distanceField(p);
  vec2 normal=gradientField(p);
  float sharp=max(film0.y*0.5,0.001);
  // fwidth only controls coverage AA, not the normal or optical phase.
  float w=max(sharp/32.0,fwidth(sdf));
  float inside=clamp(-sdf/w,0.0,1.0);
  float depth=clamp(-sdf/max(film0.x*0.1,0.001),0.0,1.0);
  float rim=(1.0-depth)*(1.0-depth)*inside;
  float theta=film1.z*0.017453292519943295+film2.x*6.283185307179586;
  float directional=dot(normal,vec2(cos(theta),sin(theta)));
  float phase=film1.x+film0.w*directional+film0.z*depth*2.0;
  vec3 spectrum=0.5+0.5*cos((phase+vec3(0.0,0.3333,0.6667))*6.283185307179586);
  vec3 rgb=mix(vec3(1.0),spectrum,film1.y)*rim;
  // Keep the borrowed algorithm's linear, straight RGB separate from presentation.
  // The default framebuffer is a display-code-value target; apply OETF once.
  vec3 encoded=mix(12.92*rgb,1.055*pow(max(rgb,0.0),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),rgb));
  cc_FragColor=vec4(film2.w>0.5?rgb:encoded,clamp(rim*film1.w,0.0,1.0));
}
