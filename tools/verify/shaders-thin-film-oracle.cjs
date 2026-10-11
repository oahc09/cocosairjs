'use strict';
// Independent CPU calculus and trigonometric oracle. Does not parse or execute GLSL.
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
const definition=JSON.parse(fs.readFileSync(path.join(ROOT,'examples/shader-thin-film/parameters.json'),'utf8'));
const defaults=()=>Object.fromEntries(Object.entries(definition.params).map(([key,d])=>[key,d.defaultValue]));
const clamp=x=>Math.max(0,Math.min(1,x));
function distance(x,y,shape){if(shape==='circle')return Math.hypot(x,y)-.30;const qx=Math.abs(x)-.24,qy=Math.abs(y)-.16;return Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-.04;}
function normal(x,y,shape){const e=1e-6;const dx=(distance(x+e,y,shape)-distance(x-e,y,shape))/(2*e),dy=(distance(x,y+e,shape)-distance(x,y-e,shape))/(2*e);const len=Math.hypot(dx,dy);return len>1e-6?[dx/len,dy/len]:[1,0];}
function model(pixelX,pixelY,width,height,params,time,presentation={}){
 const x=(pixelX+.5-width/2)/height,y=(pixelY+.5-height/2)/height;
 const sdf=distance(x,y,params.shape),n=normal(x,y,params.shape);
 const at=(xx,yy)=>distance((xx+.5-width/2)/height,(yy+.5-height/2)/height,params.shape);
 const baseX=pixelX-pixelX%2,baseY=pixelY-pixelY%2;
 const aa=Math.abs(at(baseX+1,pixelY)-at(baseX,pixelY))+Math.abs(at(pixelX,baseY+1)-at(pixelX,baseY));
 const coverage=clamp(-sdf/Math.max(Math.max(params.edgeSoftness*.5,.001)/32,aa));
 const depth=clamp(-sdf/Math.max(params.rimWidth*.1,.001)),rim=(1-depth)**2*coverage;
 const phase=params.phase+params.dispersion*Math.cos(Math.atan2(n[1],n[0])-params.lightAngle*Math.PI/180-time*2*Math.PI)+params.thickness*depth*2;
 const spectrum=[0,.3333,.6667].map(offset=>(1+Math.cos(2*Math.PI*(phase+offset)))/2);
 const alpha=clamp(rim*params.opacity),background=presentation.background||[16,32,48];
 const linearStraight=spectrum.map(component=>(1-params.saturation+params.saturation*component)*rim);
 const transfer=x=>x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;
 const displayStraight=linearStraight.map(x=>presentation.linearDiagnostic?x:transfer(x));
 const rgb=displayStraight.map((component,i)=>Math.round(255*(component*alpha+background[i]/255*(1-alpha))));
 return {sdf,normal:n,depth,coverage,rim,phase,spectrum,linearStraight,displayStraight,alpha,rgba:[...rgb,255],domain:[x,y]};
}
// RGBA8 blending/clear quantization: <=0.5 source write + <=0.5 blend rounding +
// <=0.5 destination clear rounding + float32 arithmetic <0.1 = <=2 code values.
const BYTE_TOLERANCE=2;
function pngAudit(file,params,time,presentation={}){
 const {PNG}=require('pngjs');const png=PNG.sync.read(fs.readFileSync(file));const failures=[],points=[];
 const domains=[[-.35,0],[-.3,0],[-.29,0],[-.27,0],[-.24,0],[.28,0],[0,.19],[0,.275],[0,.3],[0,0],[.22,.155],[-.22,.155],[.22,-.155]];
 for(const [x,y] of domains){const px=Math.floor(png.width/2+x*png.height),py=Math.floor(png.height/2+y*png.height);if(px<0||px>=png.width||py<0||py>=png.height)continue;
  const expected=model(px,py,png.width,png.height,params,time,presentation),offset=((png.height-1-py)*png.width+px)*4,actual=Array.from(png.data.subarray(offset,offset+4));
  const maxError=Math.max(...actual.map((v,i)=>Math.abs(v-expected.rgba[i])));points.push({x:px,y:py,actual,expected,maxError});if(maxError>BYTE_TOLERANCE)failures.push({x:px,y:py,maxError,actual,expected:expected.rgba});
 }
 let nonBackgroundPixels=0,whitePixels=0;const bg=presentation.background||[16,32,48];
 for(let i=0;i<png.data.length;i+=4){if(png.data[i]!==bg[0]||png.data[i+1]!==bg[1]||png.data[i+2]!==bg[2])nonBackgroundPixels++;if(png.data[i]===255&&png.data[i+1]===255&&png.data[i+2]===255)whitePixels++;}
 return {errors:failures,measurements:points.length,points,width:png.width,height:png.height,tolerance:BYTE_TOLERANCE,background:bg,nonBackgroundPixels,whitePixels};
}
function gpuAudit(snapshot,core=false){const errors=[];const receipt=snapshot?.gpuReceipt;if(!receipt||receipt.frame+1!==snapshot.frame||receipt.time!==snapshot.time||(core?(!receipt.targetRGBA8||!receipt.detached||!receipt.disposed):(!receipt.defaultFramebuffer||!receipt.cameraTargetTextureNull))||receipt.glError!==0)return {errors:['GPU receipt/FBO/frame'],measurements:0};const pixels=snapshot.pixels;if(!Array.isArray(pixels)||pixels.length!==13)return {errors:['GPU pixel scope'],measurements:0};for(const p of pixels){const value=model(p.x,p.y,receipt.canvas.width,receipt.canvas.height,snapshot.params,snapshot.time,snapshot);const expected=core?[...value.linearStraight.map(x=>Math.round(x*255)),Math.round(value.alpha*255)]:value.rgba;const error=Math.max(...expected.map((n,i)=>Math.abs(p.rgba[i]-n)));if(error>BYTE_TOLERANCE||!Number.isFinite(error))errors.push({x:p.x,y:p.y,expected,actual:p.rgba,error});}return {errors,measurements:pixels.length};}
function resourceAudit(raw){
 const errors=[];if(!raw||!Array.isArray(raw.rows)||raw.rows.length!==100)return {errors:['Missing exact 100 cycles'],measurements:0};
 let base;
 for(const [index,r]of raw.rows.entries()){
  if(r.index!==index||!Number.isSafeInteger(r.id)||r.refsBefore.length!==3||!r.refsBefore.every(x=>x===1))errors.push(`allocation-${index}`);
  if(!r.trace.rendererUnbound||!r.trace.nodeRemoved||r.trace.refs.length!==3||!r.trace.refs.every(x=>x.before===1&&x.after===0)||!r.repeat.idempotent||r.nodeValid||r.assetsValid.some(Boolean)||r.registryPresent)errors.push(`release-${index}`);
  if(!base)base=r.before;
  for(const key of ['bufferSize','textureSize'])if(!Number.isFinite(r.before[key])||r.before[key]!==base[key]||r.after[key]!==r.before[key])errors.push(`memory-${index}-${key}`);
  if(r.created.bufferSize<=r.before.bufferSize)errors.push(`no-buffer-allocation-${index}`);
 }
 if(new Set(raw.rows.map(r=>r.id)).size!==100)errors.push('duplicate-owner');
 return {errors,measurements:raw.rows.length};
}
function boundaryPlan(){const plan=[];for(const [name,d]of Object.entries(definition.params)){
 plan.push({caseId:`${name}:default`,parameter:name,boundary:'default',value:d.defaultValue});
 if(d.type==='number'){const span=d.max-d.min,near=span*1e-6;for(const [boundary,value]of [['min',d.min],['max',d.max],['near-min',d.min+near],['near-max',d.max-near]])plan.push({caseId:`${name}:${boundary}`,parameter:name,boundary,value});}
 plan.push({caseId:`${name}:invalid`,parameter:name,boundary:'invalid',value:d.type==='number'?'wrong-type':'invalid-shape'});
 }return plan;}
module.exports={definition,defaults,distance,normal,model,pngAudit,resourceAudit,boundaryPlan,BYTE_TOLERANCE,gpuAudit};
