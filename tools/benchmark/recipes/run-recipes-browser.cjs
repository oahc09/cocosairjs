/* V0.6 Recipe browser gate. PASS is derived from native validators, a recipe-specific
 * semantic state, real browser/session interaction, pixels, capabilities and disposal. */
const fs=require('fs');const path=require('path');const os=require('os');const crypto=require('crypto');const Module=require('module');
const REPO=path.resolve(__dirname,'../../..');const esbuild=require(path.join(REPO,'node_modules/esbuild'));
const {SCENARIOS,CONFIGS}=require('./scenarios.cjs');const evidenceTools=require('./evidence.cjs');
const {BrowserRuntime}=require('../runner/browser-runtime.cjs');const benchmarkEvidence=require('../../verify/benchmark-evidence.cjs');
function loadTs(file){const built=esbuild.buildSync({entryPoints:[path.join(REPO,file)],bundle:true,write:false,platform:'node',format:'cjs',target:'node18'});const mod=new Module(file,module);mod.paths=module.paths;mod._compile(built.outputFiles[0].text,file);return mod.exports;}
const {RECIPES}=loadTs('tools/benchmark/recipes/recipes30.ts');const {runValidators}=loadTs('tools/benchmark/validators/index.ts');
const args=process.argv.slice(2),idsArg=args.find(a=>a.startsWith('--ids=')),targetIds=idsArg?new Set(idsArg.slice(6).split(',')):null;
const EVIDENCE_PATH=path.join(REPO,'docs/evidence/recipes-browser.json'),PROMOTED_PATH=path.join(REPO,'docs/evidence/recipes-promoted.json'),LOG_PATH=path.join(REPO,'output/recipes-browser.log'),ARTIFACT_DIR=path.join(REPO,'docs/evidence/recipes');
const logLines=[];function log(message){logLines.push(message);console.log(message);}function passState(ok,detail){return{state:ok?'PASS':'FAIL',detail};}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
async function foregroundSamples(page,png){return page.evaluate(src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,image.width,image.height).data;let count=0;for(let y=4;y<image.height;y+=8)for(let x=4;x<image.width;x+=8){const i=(y*image.width+x)*4;if(Math.abs(pixels[i]-30)>=12||Math.abs(pixels[i+1]-40)>=12||Math.abs(pixels[i+2]-60)>=12)count++;}resolve(count);};image.onerror=()=>reject(new Error('PNG decode failed'));image.src=src;}),png);}
async function performAction(runtime,channel,scenario,beforeScene){
  if(scenario.action==='click'){await runtime.page.mouse.click(240,180);}
  else if(scenario.action==='keyboard'){await runtime.page.keyboard.press('KeyW');}
  else if(scenario.action==='drag'){await runtime.page.mouse.move(210,180);await runtime.page.mouse.down();await runtime.page.mouse.move(285,205,{steps:5});await runtime.page.mouse.up();}
  else if(scenario.action==='agent'){
    const root=beforeScene.nodes.find(node=>node.parentId===null)||beforeScene.nodes[0];
    const created=await channel.inspect({kind:'dispatch',requestId:'recipe-agent-create',action:'createNode',targetId:root.id,params:{name:'agent-generated'}});
    await channel.inspect({kind:'dispatch',requestId:'recipe-agent-transform',action:'setTransform',targetId:created.nodeId,params:{space:'local',position:[1,0,0],scale:[1.2,1.2,1.2]}});
  }
  await new Promise(resolve=>setTimeout(resolve,scenario.action==='wait'||scenario.action==='click'?650:250));
}
function semanticCheck(config,before,after,beforeScene,afterScene){
  if(!after||!after.ready||!after.semanticOk)return passState(false,'scenario did not report semantic readiness');
  const changed=!same(before,after);let ok=true,detail=config.semantic;
  if(config.action!=='none')ok=changed;
  if(config.action==='wait')ok=after.animationTicks>before.animationTicks;
  if(config.action==='keyboard'||config.semantic==='drag-object')ok=!same(before.position,after.position)&&after.interactionCount>before.interactionCount;
  if(config.semantic==='orbit-drag')ok=!same(before.rotation,after.rotation)&&after.interactionCount>before.interactionCount;
  if(config.semantic==='exploded-toggle')ok=after.exploded===true;
  if(config.semantic==='camera-transition')ok=!same(before.cameraPosition,after.cameraPosition);
  if(config.semantic==='orthographic-toggle')ok=after.ortho===true;
  if(config.semantic==='multi-camera')ok=after.cameraCount===2&&after.interactionCount>before.interactionCount;
  if(config.semantic==='click-animation')ok=after.animationTicks>before.animationTicks&&after.details.clipCount===1;
  if(config.semantic==='click-material')ok=after.details.materialChanged===true;
  if(config.semantic==='selection'||config.semantic==='hotspot')ok=after.selected===true;
  if(config.semantic==='weather-toggle')ok=after.details.weather==='cloudy';
  if(config.semantic==='agent-session')ok=afterScene.nodes.some(node=>node.name==='agent-generated')&&afterScene.nodeCount>beforeScene.nodeCount;
  if(config.semantic==='material-variants')ok=after.materialCount>=2;
  if(config.semantic==='multi-instance'||config.semantic==='model-comparison')ok=after.instanceCount===2;
  if(config.semantic==='textured-model'||config.semantic==='product-framed'||config.semantic==='landing-hero')ok=after.details.textures>0&&after.details.materials>0;
  if(config.semantic==='auto-framing')ok=after.details.framed===true;
  if(['glass','clearcoat','transmission','anisotropy','iridescence'].includes(config.semantic))ok=after.featureApplied||(config.optional&&after.capabilities[config.feature]==='fallback');
  return passState(ok,ok?detail:`semantic assertion failed for ${detail}`);
}
async function main(){
  fs.mkdirSync(ARTIFACT_DIR,{recursive:true});const meta=benchmarkEvidence.metadata(REPO),sourceHash=benchmarkEvidence.sourceHash(REPO),batch='recipe-'+Date.now(),runs=[];let pass=0,fail=0,index=0;
  const workRoot=fs.mkdtempSync(path.join(os.tmpdir(),'v06-recipes-'));
  try{for(const recipe of RECIPES){if(targetIds&&!targetIds.has(recipe.id))continue;index++;const scenario=SCENARIOS[recipe.id],config=CONFIGS[recipe.id],runtime=new BrowserRuntime({esbuild,repo:REPO});
    try{
      if(!scenario||scenario.id!==recipe.compositeBenchmarkId)throw new Error('composite scenario contract missing');
      const ws=path.join(workRoot,recipe.id);fs.mkdirSync(path.join(ws,'src'),{recursive:true});
      fs.writeFileSync(path.join(ws,'index.html'),'<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><script type="importmap">{"imports":{"cocosair":"/build/cocosair.module.js"}}</script><script src="/__bench-prelude.js"></script></head><body style="margin:0"><canvas id="GameCanvas" width="480" height="360"></canvas><script type="module" src="./src/main.ts"></script></body></html>');
      fs.writeFileSync(path.join(ws,'src/main.ts'),scenario.source);
      for(const asset of scenario.assets||[]){const destination=path.join(ws,'assets',path.basename(asset));fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(REPO,asset),destination);}
      const workspace={paths:{workspace:ws}},build=await runtime.build(workspace);if(!build.success)throw new Error('build failed: '+build.diagnostics.join('; '));
      const channel=await runtime.start(workspace,{});await new Promise(resolve=>setTimeout(resolve,900));
      const beforeScene=await channel.inspect({kind:'inspectScene'}),beforeState=await channel.inspect({kind:'custom',query:'__recipeState'}),beforeCapture=await channel.captureFrame();
      await performAction(runtime,channel,scenario,beforeScene);
      const afterState=await channel.inspect({kind:'custom',query:'__recipeState'}),afterScene=await channel.inspect({kind:'inspectScene'}),snapshot=await channel.snapshot();snapshot.foregroundPixelCount=await foregroundSamples(runtime.page,snapshot.capture.png);
      if(config.feature)snapshot.capability={name:config.feature,status:afterState.capabilities[config.feature]};
      const webgl2=await runtime.page.evaluate(()=>{const c=document.querySelector('#GameCanvas');return !!window.WebGL2RenderingContext&&!!c&&!!c.getContext('webgl2');});
      const capabilitiesOk=recipe.requiredCapabilities.every(name=>name==='webgl2'?webgl2:['supported','fallback'].includes(afterState.capabilities[name]));
      const assetsOk=recipe.requiredAssets.every(asset=>scenario.assets.includes(asset));
      const semantic=semanticCheck(config,beforeState,afterState,beforeScene,afterScene);
      const ids=[...new Set([...recipe.validatorRefs,...recipe.visualRefs,...((scenario.action==='wait')?['frame-diff']:[])])];
      const params={...scenario.validatorParams,'frame-diff':{beforePng:beforeCapture.png}};
      if(recipe.id==='R008')params['transform-equals']={nodeName:'exploded-toggle-0',position:[-2.5,0,0]};
      const nativeResults=runValidators(ids,snapshot,params);const validatorsOk=nativeResults.every(result=>['PASS','EXPECTED_UNSUPPORTED','EXPECTED_FALLBACK'].includes(result.state));
      const screenshot=path.join(ARTIFACT_DIR,recipe.id+'.png');fs.writeFileSync(screenshot,Buffer.from(snapshot.capture.png.replace(/^data:image\/png;base64,/,''),'base64'));
      const stateFile=path.join(ARTIFACT_DIR,recipe.id+'.json');fs.writeFileSync(stateFile,JSON.stringify({before:beforeState,after:afterState,scene:afterScene},null,2)+'\n');
      let lifecycleOk=true,lifecycleDetail='not required';if(recipe.targetStatus==='stable'){const disposed=await channel.inspect({kind:'custom',query:'__recipeDispose'});lifecycleOk=!!disposed&&disposed.released===true&&disposed.assetsAfter===0&&disposed.nodesAfter===0;lifecycleDetail=JSON.stringify(disposed);}
      const errors=await channel.errorReport({limit:50}),noErrors=errors.errors.length===0;
      const visual=nativeResults.find(result=>result.validatorId==='visible-frame');const visualOk=visual?.state==='PASS'&&fs.statSync(screenshot).size>0;
      const interactionOk=config.action==='none'?afterState.ready:semantic.state==='PASS';
      const checks={scene:!!afterScene&&afterScene.nodeCount>0,interaction:interactionOk,visual:visualOk,lifecycle:lifecycleOk,noRuntimeErrors:noErrors,capability:capabilitiesOk,semantic:semantic.state==='PASS'&&assetsOk};
      const validatorResults=[...nativeResults,{validatorId:'recipe-semantic',...semantic},{validatorId:'recipe-assets',...passState(assetsOk,JSON.stringify(recipe.requiredAssets))},{validatorId:'recipe-capabilities',...passState(capabilitiesOk,JSON.stringify(afterState.capabilities))},{validatorId:'recipe-interaction',...passState(interactionOk,scenario.action)},{validatorId:'resource-released',...passState(lifecycleOk,lifecycleDetail)}];
      const result=Object.values(checks).every(Boolean)&&validatorsOk?'PASS':'FAIL';if(result==='PASS')pass++;else fail++;
      const rel=file=>path.relative(REPO,file).replace(/\\/g,'/');const artifacts=[screenshot,stateFile].map(file=>({path:rel(file),hash:sha(file),bytes:fs.statSync(file).size}));
      runs.push({recipeId:recipe.id,recipeVersion:recipe.version,source:{kind:'benchmark',id:scenario.id,composite:true},runId:`${batch}-${recipe.id}-${index}`,revision:meta.baseRevision,sourceHash,scenarioHash:evidenceTools.scenarioHash(REPO,recipe,scenario),measuredAt:new Date().toISOString(),environment:{browser:'chromium-headless',viewport:'480x360',webglBackend:'webgl2-angle'},result,sceneSetup:recipe.sceneSetup,requiredAssets:recipe.requiredAssets,requiredCapabilities:recipe.requiredCapabilities,runtimeState:recipe.runtimeState,interactionSteps:recipe.interactionSteps,visualTarget:recipe.visualTarget,checks,validatorResults,artifacts});
      log(`[${recipe.id}] ${result} semantic=${semantic.state} action=${scenario.action} lifecycle=${lifecycleOk}`);await runtime.stop();
    }catch(error){fail++;log(`[${recipe.id}] FAIL ${error&&error.stack||error}`);runs.push({recipeId:recipe.id,recipeVersion:recipe.version,result:'FAIL',failureReason:String(error&&error.message||error)});await runtime.stop().catch(()=>{});}
  }}finally{fs.rmSync(workRoot,{recursive:true,force:true});}
  const output={measuredAt:new Date().toISOString(),runIdBase:batch,sourceHash,baseRevision:meta.baseRevision,total:runs.length,pass,fail,runs};fs.mkdirSync(path.dirname(EVIDENCE_PATH),{recursive:true});fs.writeFileSync(EVIDENCE_PATH,JSON.stringify(output,null,2)+'\n');fs.mkdirSync(path.dirname(LOG_PATH),{recursive:true});fs.writeFileSync(LOG_PATH,logLines.join('\n')+'\n');
  const promoted=RECIPES.map(recipe=>{const run=runs.find(entry=>entry.recipeId===recipe.id&&entry.result==='PASS');return{id:recipe.id,status:run?(recipe.targetStatus||'validated'):'draft',runId:run?.runId||null};});fs.writeFileSync(PROMOTED_PATH,JSON.stringify(promoted,null,2)+'\n');
  console.log(`Recipe browser gate: ${pass}/${runs.length} PASS`);process.exitCode=fail?1:0;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
