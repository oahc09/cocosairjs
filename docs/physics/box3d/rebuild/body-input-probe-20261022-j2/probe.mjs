// Finite actual-WASM negative probe, not the complete body contract.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir=resolve('tools/physics/box3d/output/world-wasm-release-20261022-j2');
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const manifest=JSON.parse(readFileSync(resolve(dir,'manifest.json')));
for(const row of manifest.artifacts) assert.equal(hash(resolve(dir,row.path)),row.sha256);
const {default:factory}=await import(pathToFileURL(resolve(dir,'box3d-st.mjs')));
const {createBox3DBinding}=await import(pathToFileURL(resolve(dir,'facade.mjs')));
const module=await factory({wasmBinary:readFileSync(resolve(dir,'box3d-st.wasm'))});
const binding=createBox3DBinding(module,manifest);const initial=String(binding.liveBytes());
const world=binding.createWorld();const outcomes=[];
try{
 for(const enableSleep of [0,1,'false',null]){
  const before=binding.worldCounts(world);let body,error;
  try { body=binding.createBody(world,{enableSleep}); }
  catch(e) {error={code:e.code,message:e.message};}
  const after=binding.worldCounts(world);
  outcomes.push({input:{enableSleep},expected:'REJECT_BEFORE_NATIVE_BODY_CREATION',actual:body?'ACCEPTED':'REJECTED',before,after,error:error??null});
  if(body)binding.destroyBody(body);
 }
}finally{binding.destroyWorld(world);}
const after=String(binding.liveBytes());const bridge=binding.bridgeMemory();binding.dispose();
assert.equal(after,initial);assert.equal(bridge.liveBytes,0n);
const report={status:outcomes.every(x=>x.actual==='REJECTED')?'PASS':'FAIL_UNEXPECTED_ACCEPTANCE',scope:'Additional runtime type-contract probe for Box3DBodyOptions.enableSleep:boolean, not part of earlier finite j2 qualified groups. Source not modified; real native body counts demonstrate acceptance.',manifestSHA256:hash(resolve(dir,'manifest.json')),sourceSHA256:hash(new URL(import.meta.url)),outcomes,initialCoreBytes:initial,finalCoreBytes:after,finalBridge:bridge};
writeFileSync(new URL('raw.json',import.meta.url),JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');
console.log(JSON.stringify({status:report.status,accepted:outcomes.filter(x=>x.actual==='ACCEPTED').length}));
process.exitCode=report.status==='PASS'?0:1;
