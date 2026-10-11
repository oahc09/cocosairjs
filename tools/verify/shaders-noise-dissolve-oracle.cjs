'use strict';
// Independent CPU reference, not imported by the page. Mathematical port of
// MaterialX/OSL 2D gradients; BSD/MIT/Apache notices accompany the example.
const fs=require('node:fs');
const F=Math.fround;
const add=(a,b)=>F(F(a)+F(b)),mul=(a,b)=>F(F(a)*F(b)),mix=(a,b,t)=>add(mul(a,F(1-t)),mul(b,t));
const rotate=(n,k)=>((n<<k)|(n>>>(32-k)))>>>0;
function hash(x,y){let c=(0xdeadbeef+8+13)>>>0,a=(c+x)>>>0,b=(c+y)>>>0;
 c=((c^b)-rotate(b,14))>>>0;a=((a^c)-rotate(c,11))>>>0;b=((b^a)-rotate(a,25))>>>0;
 c=((c^b)-rotate(b,16))>>>0;a=((a^c)-rotate(c,4))>>>0;b=((b^a)-rotate(a,14))>>>0;return ((c^b)-rotate(b,24))>>>0;}
function gradient(x,y,dx,dy){const h=hash(x,y)&7,a=h<4?dx:dy,b=mul(2,h<4?dy:dx);return add(h&1?-a:a,h&2?-b:b);}
function fade(v){return mul(mul(mul(v,v),v),add(mul(v,add(mul(v,6),-15)),10));}
function perlin(x,y){x=F(x);y=F(y);const ix=Math.floor(x),iy=Math.floor(y),dx=F(x-ix),dy=F(y-iy),u=fade(dx),v=fade(dy);
 return mul(0.6616,mix(mix(gradient(ix,iy,dx,dy),gradient(ix+1,iy,F(dx-1),dy),u),mix(gradient(ix,iy+1,dx,F(dy-1)),gradient(ix+1,iy+1,F(dx-1),F(dy-1)),u),v));}
function coverage(u,v,aspect,p){const x=add(mul(mul(u,aspect),p.scale),mul(p.seed,13.7)),y=add(mul(v,p.scale),mul(p.seed,7.9));
 const a=perlin(x,y),b=perlin(add(mul(x,2),add(17.3,mul(p.seed,3.1))),add(mul(y,2),9.1)),c=perlin(add(mul(x,4),41.7),add(mul(y,4),add(27.9,mul(p.seed,5.3))));return Math.max(0,Math.min(1,add(0.5,mul(0.9,F(add(add(a,mul(b,0.5)),mul(c,0.25))/1.75)))));}
function reveal(c,p){c=p.invert?1-c:c;if(p.progress===0)return 1;if(p.progress===1)return 0;if(p.softness===0)return c>=p.progress?1:0;const f=Math.max(p.softness,0.0001),front=p.progress*(1+2*f)-f,t=Math.max(0,Math.min(1,(c-(front-f))/(2*f)));return t*t*(3-2*t);}
function source(u,v,input){const x=Math.min(15,Math.floor(u*16)),y=Math.min(15,Math.floor(v*16));return [x%2?220:40,y%2?180:60,(x+y)%2?200:100,input==='opaque'?255:[0,128,255,128][(x+2*y)%4]];}
function expected(point,raw){const u=(point.x+0.5)/raw.width,v=1-(point.y+0.5)/raw.height,p=raw.parameters,c=coverage(u,v,raw.width/raw.height,p),m=reveal(c,p),s=source(u,v,raw.input);if(raw.mode===1)return [Math.round((p.invert?1-c:c)*255),Math.round(m*255),Math.round(s[3]*m),255];if(raw.mode===2)return [s[0],s[1],s[2],raw.contextAlpha===false?255:Math.round(s[3]*m)];const checker=(Math.floor(u*16)+Math.floor(v*16))%2,bg=checker?64:32,a=s[3]/255*m;return [0,1,2].map(i=>Math.round(s[i]*a+bg*(1-a))).concat(255);}
function visualErrors(raw,pngPath){const errors=[];if(!raw||!raw.parameters||!['progress','scale','softness','seed'].every(k=>Number.isFinite(raw.parameters[k]))||typeof raw.parameters.invert!=='boolean'||!Number.isSafeInteger(raw.width)||!Number.isSafeInteger(raw.height)||raw.width<1||raw.height<1)return ['invalid finite parameters or dimensions'];if(raw.glError!==0||raw.afterDraw!==true||!Array.isArray(raw.raw)||raw.raw.length!==63)return ['missing exact 9x7 real AFTER_DRAW pixel grid'];
 const png=pngPath?require('pngjs').PNG.sync.read(fs.readFileSync(pngPath)):null;
 if(png&&(png.width!==raw.width||png.height!==raw.height))errors.push('PNG backing mismatch');
 for(const point of raw.raw){const wanted=expected(point,raw);if(!point.rgba?.every(Number.isFinite)||!wanted.every(Number.isFinite)||wanted.some((v,i)=>Math.abs(point.rgba[i]-v)>2))errors.push(`CPU oracle mismatch at ${point.x},${point.y}: ${point.rgba} expected ${wanted}`);
  if(png){const offset=((png.height-1-point.y)*png.width+point.x)*4;for(let i=0;i<3;i++)if(Math.abs(png.data[offset+i]-point.rgba[i])>1)errors.push('PNG/compositor diverges from GPU readback');}
 }return errors;
}
module.exports={hash,perlin,coverage,reveal,source,expected,visualErrors};
