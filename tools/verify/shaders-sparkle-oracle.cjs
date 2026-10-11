const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const definition=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../examples/shader-sparkle/parameters.json'),'utf8'));
const DEFAULTS=Object.fromEntries(Object.entries(definition.params).map(([k,d])=>[k,d.defaultValue]));
function hash(x,y,salt){let h=(Math.imul(x|0,1664525)+Math.imul(y|0,1013904223)+Math.imul(salt|0,69069)+362437)>>>0;h=(h^(h>>>13))>>>0;h=Math.imul(h,1103515245)>>>0;return(h^(h>>>17))>>>0;}
function random(x,y,s){return[0,17,53].map(d=>(hash(x,y,s+d)&65535)/65535);}
function smooth(a,b,x){const v=Math.max(0,Math.min(1,(x-a)/(b-a)));return v*v*(3-2*v);}
const decode=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
const encode=x=>x<=.0031308?Math.max(0,x)*12.92:1.055*Math.max(0,x)**(1/2.4)-.055;
function pixel(kind,x,y){if(kind==='alpha-zero')return[255,255,255,0];if(kind==='half-alpha')return[255,255,255,128];if(kind==='white')return[255,255,255,255];if(kind==='dark')return[0,0,0,255];if(kind.startsWith('gray-')){const n=Number(kind.slice(5));return[n,n,n,255];}if(kind==='bright-region'){return Math.hypot((x+.5)/128-.5,(y+.5)/128-.5)<.17?[230,200,130,255]:[0,0,0,0];}return[Math.round(x/127*255),Math.round(y/127*255),128,255];}
function source(kind,u,v){const x=Math.max(0,Math.min(127,Math.floor(u*128))),y=Math.max(0,Math.min(127,Math.floor(v*128))),c=pixel(kind,x,y);return[...c.slice(0,3).map(x=>decode(x/255)),c[3]/255];}
const luma=c=>(.2126*c[0]+.7152*c[1]+.0722*c[2])*c[3];
function star(x,y,size,ray){return(Math.exp(-.9*(x*x+y*y))+.25*(Math.exp(-1.6*Math.abs(x)-.45/Math.max(ray,.01)*Math.abs(y))+Math.exp(-1.6*Math.abs(y)-.45/Math.max(ray,.01)*Math.abs(x))))*(1-smooth(size*.3,size*.5,Math.max(Math.abs(x),Math.abs(y))));}
function point(x,y,p,layer){const size=p.size*(layer?2/3:1),r=random(x,y,Math.floor((p.seed+layer*.31)*4096));return{xy:[(x+.5+(r[0]-.5)*.6)*size,(y+.5+(r[1]-.5)*.6)*size],random:r,size};}
function oracle(x,y,width,height,backing,p,time,kind,bg=[0,0,0]){
 const u=(x+.5)/backing.width,v=(y+.5)/backing.height,px=u*width,py=v*height,child=source(kind,u,v),glow=[0,0,0];
 if(p.intensity>0)for(let layer=0;layer<2;layer++){
 const size=p.size*(layer?2/3:1),bx=Math.floor(px/size-.5),by=Math.floor(py/size-.5);
 for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
 const q=point(bx+dx,by+dy,p,layer),r=q.random;let best=source(kind,q.xy[0]/width,q.xy[1]/height);
 if(p.expand>0)for(let i=0;i<4;i++){const a=layer*Math.PI/4+i*Math.PI/2,c=source(kind,(q.xy[0]+Math.cos(a)*p.expand)/width,(q.xy[1]+Math.sin(a)*p.expand)/height);if(luma(c)>luma(best))best=c;}
 const presence=smooth(p.threshold,p.threshold+.12,Math.sqrt(Math.max(0,luma(best)))),blink=Math.max(0,Math.sin(time*(.8+r[2]*1.2)+r[0]*2*Math.PI))**8,level=r[2]>=.45?1:.35,g=star(px-q.xy[0],py-q.xy[1],size,p.rayLength)*presence*blink*level*p.intensity,lum=luma([...best.slice(0,3),1]);
 for(let j=0;j<3;j++)glow[j]+=((1-p.colorize)+p.colorize*best[j]/Math.max(lum,.001)*.6)*g;
 }}
 const alpha=Math.min(1,child[3]+Math.max(...glow)),linear=child.slice(0,3).map((c,i)=>c*child[3]+glow[i]);
 return{linear:[...linear,alpha],display:[...linear.map((c,i)=>Math.round(Math.max(0,Math.min(1,(alpha?encode(c/alpha)*alpha:0)+bg[i]/255*(1-alpha)))*255)),255],glow,source:child};
}
function samplePoints(width,height,p,time,dpr){
 const candidates=[];for(let layer=0;layer<2;layer++)for(let y=0;y<Math.ceil(height/p.size)+2;y++)for(let x=0;x<Math.ceil(width/p.size)+2;x++){
 const q=point(x,y,p,layer),r=q.random,blink=Math.max(0,Math.sin(time*(.8+r[2]*1.2)+r[0]*2*Math.PI))**8;
 if(q.xy[0]>30&&q.xy[0]<width-30&&q.xy[1]>30&&q.xy[1]<height-30)candidates.push({...q,blink});}
 candidates.sort((a,b)=>b.blink-a.blink);const points=[[width*.5,height*.5],[width*.12,height*.12],[width*.85,height*.8]];
 const interior=candidates.filter(q=>Math.hypot(q.xy[0]/width-.5,q.xy[1]/height-.5)<.17);const ring=candidates.filter(q=>{const d=Math.hypot(q.xy[0]/width-.5,q.xy[1]/height-.5);return d>.17&&d<.28});const selected=[...candidates.slice(0,2),...interior.slice(0,2),...ring.slice(0,1)];for(const q of selected)for(const d of [[0,0],[1,0],[-1,0],[0,1],[0,-1],[3,0],[0,3],[8,0],[0,8]])points.push([q.xy[0]+d[0],q.xy[1]+d[1]]);
 return [...new Map(points.map(([x,y])=>{const q={x:Math.floor(x*dpr),y:Math.floor(y*dpr)};return[q.x+','+q.y,q]})).values()];
}
const base={...DEFAULTS,size:70,intensity:.45,colorize:.35,rayLength:5};
const VISUALS=[
 {id:'off-rgba',kind:'half-alpha',p:{...base,intensity:0},time:0},
 {id:'alpha-zero',kind:'alpha-zero',p:base,time:0},
 {id:'dark',kind:'dark',p:base,time:0},
 {id:'gray-rays',kind:'gray-64',p:{...base,threshold:.03,colorize:0},time:0},
 {id:'bright-region',kind:'bright-region',p:base,time:0},
 {id:'threshold-below',kind:'gray-64',p:{...base,threshold:Math.sqrt(decode(64/255))+.001},time:0},
 {id:'threshold-band',kind:'gray-64',p:{...base,threshold:Math.sqrt(decode(64/255))-.06},time:0},
 {id:'threshold-above',kind:'gray-64',p:{...base,threshold:Math.sqrt(decode(64/255))-.121},time:0},
 {id:'same-seed-time',kind:'gray-64',p:{...base,threshold:.03,colorize:0},time:0},
 {id:'different-seed',kind:'gray-64',p:{...base,threshold:.03,seed:7},time:0},
 {id:'different-time',kind:'gray-64',p:{...base,threshold:.03},time:1.25},
 {id:'expand-ring',kind:'bright-region',p:{...base,expand:45},time:0},
 {id:'short-rays',kind:'gray-64',p:{...base,threshold:.03,rayLength:.1},time:0},
 {id:'long-rays',kind:'gray-64',p:{...base,threshold:.03,rayLength:20},time:0},
 {id:'spill-white',kind:'bright-region',p:base,time:0,bg:[255,255,255]},
 {id:'spill-color',kind:'bright-region',p:base,time:0,bg:[20,40,80]},
];
function fileIdentity(root,file){const b=fs.readFileSync(path.resolve(root,file));return{path:file.replaceAll('\\','/'),bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};}
function visualOracle(row,root=process.cwd()){
 const errors=[],o=row.observation,v=VISUALS.find(v=>v.id===row.caseId.split('@')[0]);if(!v)return{errors:['unknown visual id'],measurements:0};
 const {PNG}=require('pngjs'),b=fs.readFileSync(path.resolve(root,o.screenshot.path)),png=PNG.sync.read(b),backing={width:png.width,height:png.height},f=row.fixed;
 if(png.width!==Math.round(f.viewport.width*f.dpr)||png.height!==Math.round(f.viewport.height*f.dpr))errors.push('backing/DPR');
 if(JSON.stringify(f.parameters)!==JSON.stringify(v.p)||f.input!==v.kind||f.timeSeconds!==v.time)errors.push('frozen visual state');
 if(o.linearTarget){const c=o.linearTarget.cleanup;if(!c||!c.targetDisposed||!c.cameraDetached||!c.cameraTargetRestored||c.materialRefAfter!==0||o.linearTarget.materialRefBefore!==1||c.memoryAfter.textureSize!==o.linearTarget.diagnosticBefore.textureSize||c.memoryAfter.bufferSize!==o.linearTarget.diagnosticBefore.bufferSize)errors.push('temporary native RT/material cleanup');}
 const raw=o.algorithm.raw;if(!Array.isArray(raw)||raw.length<20)return{errors:['missing numeric probes'],measurements:0};
 const planned=samplePoints(f.viewport.width,f.viewport.height,v.p,v.time,f.dpr);if(JSON.stringify(raw.map(q=>({x:q.x,y:q.y})))!==JSON.stringify(planned))errors.push('sample set');
 for(const q of raw){const expected=oracle(q.x,q.y,f.viewport.width,f.viewport.height,backing,v.p,v.time,v.kind,v.bg);if(!Array.isArray(q.rgba)||q.rgba.length!==4||!q.rgba.every(Number.isFinite))errors.push('finite GPU values');else for(let j=0;j<4;j++)if(Math.abs(q.rgba[j]-expected.linear[j])>.007+.007*Math.abs(expected.linear[j]))errors.push('linear RGBA oracle '+q.x+','+q.y+'/'+j);
 const at=((png.height-1-q.y)*png.width+q.x)*4;for(let j=0;j<3;j++)if(Math.abs(png.data[at+j]-expected.display[j])>4)errors.push('PNG oracle '+q.x+','+q.y+'/'+j);
 if(o.previewRaw){const original=o.previewRaw.find(p=>p.x===q.x&&p.y===q.y);if(!original||!original.rgba.every(Number.isFinite))errors.push('missing native preview paired pixel');else for(let j=0;j<3;j++){if(Math.abs(original.rgba[j]-expected.display[j])>4)errors.push('native preview oracle');if(Math.abs(original.rgba[j]-png.data[at+j])>2)errors.push('compositor versus paired native preview pixel');}}}
 return{errors,measurements:raw.length*7};
}
module.exports={definition,DEFAULTS,VISUALS,decode,encode,hash,random,smooth,star,source,oracle,point,samplePoints,fileIdentity,visualOracle};
