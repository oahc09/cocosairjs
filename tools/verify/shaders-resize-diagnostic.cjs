'use strict';
// Lead diagnostic only: one Cocos-owned canvas, builtin material, no effect Gate claim.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..');
const {startExampleServer}=require(path.join(ROOT,'tools/verify/competitive-example-server.cjs'));
const {launchOptions}=require(path.join(ROOT,'tools/verify/browser-engines.cjs'));
const {PNG}=require('pngjs');
const html='<!doctype html><html><head><link rel="icon" href="data:,"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}canvas{display:block;width:100%;height:100%}</style></head><body><canvas id="GameCanvas"></canvas></body></html>';
const fp=file=>{const b=fs.readFileSync(path.resolve(ROOT,file));return {path:file,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};};
const out=process.argv.find(x=>x.startsWith('--out='))?.slice(6);
if(!out||fs.existsSync(out))throw new Error('Explicit new --out required');
const dir=out.replace(/\.json$/,'')+'-artifacts';fs.mkdirSync(dir,{recursive:true});
async function main(){
 const report={schemaVersion:'shaders-lead-resize-diagnostic/1',executionChannel:'Lead',method:'REAL_BROWSER_NATIVE_BUILTIN_CONTROL',startedAt:new Date().toISOString(),command:[process.execPath,...process.argv.slice(1)],cwd:ROOT,effectGate:'NOT_RUN',subset:true,completed:false,rows:[],before:['build/cocosair.module.js','build/cocosair.module.d.ts',path.relative(ROOT,__filename)].map(fp)};
 const server=await startExampleServer(ROOT);
 try{for(const engine of ['chromium','firefox','webkit']){
  let browser,page;const row={engine,stages:[],pageErrors:[],consoleErrors:[]};report.rows.push(row);
  try{
   browser=await require('playwright')[engine].launch({...launchOptions(engine),headless:true});row.browserVersion=browser.version();
   page=await browser.newPage({viewport:{width:640,height:400},deviceScaleFactor:1});
   page.on('pageerror',e=>row.pageErrors.push(String(e.stack||e)));page.on('console',m=>{if(m.type()==='error')row.consoleErrors.push(m.text());});
   await page.route('**/__lead_resize__',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto(server.origin+'/__lead_resize__');
   row.setup=await page.evaluate(async()=>{
    const cc=await import('/build/cocosair.module.js'),app=await cc.createAirApp({canvas:'#GameCanvas'});
    const scene=new cc.Scene('LeadResizeBuiltinControl'),cameraNode=new cc.Node('Camera');scene.addChild(cameraNode);cameraNode.setPosition(0,0,3);
    const camera=cameraNode.addComponent(cc.Camera);camera.projection=cc.Camera.ProjectionType.ORTHO;camera.orthoHeight=1;camera.near=.1;camera.far=10;camera.clearFlags=cc.Camera.ClearFlag.SOLID_COLOR;camera.clearColor=new cc.Color(16,32,48,255);camera.visibility=1<<20;
    const mesh=cc.utils.createMesh({positions:[-1,-1,0,1,-1,0,-1,1,0,1,1,0],uvs:[0,0,1,0,0,1,1,1],indices:[0,1,2,1,3,2]},undefined,{calculateBounds:true});mesh.addRef();
    let material;const makeMaterial=()=>{const m=new cc.Material();m.initialize({effectName:'builtin-unlit',states:{rasterizerState:{cullMode:cc.gfx.CullMode.NONE},depthStencilState:{depthTest:false,depthWrite:false}}});m.setProperty('mainColor',new cc.Color(255,0,0,255));m.addRef();return m;};material=makeMaterial();
    const node=new cc.Node('OwnedQuad');node.layer=1<<20;scene.addChild(node);const renderer=node.addComponent(cc.MeshRenderer);renderer.mesh=mesh;renderer.setSharedMaterial(material,0);app.run(scene);
    const clock=cc.createStepClock();clock.begin();const canvas=document.getElementById('GameCanvas'),gl=canvas.getContext('webgl2');let last=null;
    const sample=()=>{const bytes=new Uint8Array(4),x=Math.floor(canvas.width/2),y=Math.floor(canvas.height/2);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes);last={frame:cc.director.getTotalFrames(),x,y,rgba:Array.from(bytes),error:gl.getError(),fboIsDefault:gl.getParameter(gl.FRAMEBUFFER_BINDING)===null,viewport:Array.from(gl.getParameter(gl.VIEWPORT)),backing:{width:canvas.width,height:canvas.height},camera:{width:camera.camera.width,height:camera.camera.height,targetIsNull:camera.targetTexture===null},drawCalls:cc.director.root.device.numDrawCalls};};cc.director.on(cc.Director.EVENT_AFTER_DRAW,sample);
    let releasePromise;
    window.__leadResize={step:async()=>{await clock.step(0);return last;},snapshot:()=>last,native:async()=>{clock.end();await new Promise(r=>setTimeout(r,300));cc.game.pause();return last;},rebuild:async()=>{renderer.setSharedMaterial(null,0);material.decRef();material.destroy();material=makeMaterial();renderer.setSharedMaterial(material,0);clock.begin();await clock.step(0);return last;},release:()=>{if(releasePromise)return releasePromise;cc.director.off(cc.Director.EVENT_AFTER_DRAW,sample);renderer.mesh=null;renderer.setSharedMaterial(null,0);node.removeFromParent();node.destroy();const refs=[mesh,material].map(a=>{const before=a.refCount;a.decRef();a.destroy();return {kind:a.constructor.name,before,after:a.refCount};});releasePromise=app.close().then(receipt=>({refs,receipt,sceneCleared:app.getScene()===null}));return releasePromise;}};
    await clock.step(0);await clock.step(0);return {context:gl.getContextAttributes(),canvasCount:document.querySelectorAll('canvas').length};
   });
   async function capture(id){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const raw=await page.evaluate(()=>window.__leadResize.snapshot());const file=path.join(dir,engine+'-'+id+'.png');await page.screenshot({path:file});const exported=await page.evaluate(()=>document.getElementById('GameCanvas').toDataURL('image/png'));const canvasPNG=PNG.sync.read(Buffer.from(exported.split(',')[1],'base64'));const canvasExportPath=path.join(dir,engine+'-'+id+'-canvas-export.png');fs.writeFileSync(canvasExportPath,PNG.sync.write(canvasPNG),{flag:'wx'});const css=await page.evaluate(()=>{const c=document.getElementById('GameCanvas'),s=getComputedStyle(c),r=c.getBoundingClientRect();return {display:s.display,visibility:s.visibility,opacity:s.opacity,transform:s.transform,rect:{x:r.x,y:r.y,width:r.width,height:r.height},bodyBackground:getComputedStyle(document.body).backgroundColor};});const png=PNG.sync.read(fs.readFileSync(file)),i=((png.height-1-raw.y)*png.width+raw.x)*4;let nonBackground=0;for(let j=0;j<png.data.length;j+=4)if(png.data[j]!==16||png.data[j+1]!==32||png.data[j+2]!==48)nonBackground++;row.stages.push({id,raw,png:fp(path.relative(ROOT,file)),pngSize:{width:png.width,height:png.height},sameCoordinatePNG:Array.from(png.data.subarray(i,i+4)),canvasExport:fp(path.relative(ROOT,canvasExportPath)),canvasExportCenter:Array.from(canvasPNG.data.subarray(i,i+4)),css,nonBackground});}
   await capture('before');await page.setViewportSize({width:480,height:320});await page.waitForTimeout(200);for(let i=0;i<5;i++)await page.evaluate(()=>window.__leadResize.step());await capture('resized-step');
   await page.evaluate(()=>window.__leadResize.native());await capture('resized-native');await page.evaluate(()=>window.__leadResize.rebuild());await capture('resized-rebuilt');
   await page.evaluate(()=>{document.body.style.background='rgb(0,255,0)';});await capture('resized-body-color');await page.evaluate(()=>{document.getElementById('GameCanvas').style.transform='translateZ(0)';});await page.evaluate(()=>window.__leadResize.native());await capture('resized-layer-transform');await page.evaluate(()=>{const c=document.getElementById('GameCanvas');c.remove();document.body.appendChild(c);});await page.evaluate(()=>window.__leadResize.native());await capture('resized-canvas-reinsert');row.cleanup=await page.evaluate(async()=>{const a=window.__leadResize.release(),b=window.__leadResize.release();return {samePromise:a===b,...await a};});
  }catch(e){row.error=String(e.stack||e);}finally{if(page)await page.close().catch(()=>{});if(browser)await browser.close();}
  console.log(JSON.stringify({engine,error:row.error,stages:row.stages.map(s=>({id:s.id,raw:s.raw.rgba,png:s.sameCoordinatePNG,nonBackground:s.nonBackground}))}));
 }}finally{await server.close();report.after=report.before.map(f=>fp(f.path));report.inputsUnchanged=JSON.stringify(report.before)===JSON.stringify(report.after);report.endedAt=new Date().toISOString();report.collectionCompleted=report.rows.length===3&&report.rows.every(r=>r.stages.length===7&&!r.error);report.exitCode=report.collectionCompleted&&report.inputsUnchanged?0:1;fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});process.exitCode=report.exitCode;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
