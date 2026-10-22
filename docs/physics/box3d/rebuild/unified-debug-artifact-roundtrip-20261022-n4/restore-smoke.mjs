// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Limited runtime roundtrip, not the full qualification suite.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const out=path.dirname(fileURLToPath(import.meta.url)), dir=path.join(out,'runtime-restored');
const manifest=JSON.parse(readFileSync(path.join(dir,'manifest.json')));
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const r of manifest.artifacts){const b=readFileSync(path.join(dir,r.path));assert.equal(b.length,r.bytes);assert.equal(hash(b),r.sha256);}
const {default:createModule}=await import(pathToFileURL(path.join(dir,'box3d-st.mjs')));
const {createBox3DBinding}=await import(pathToFileURL(path.join(dir,'facade.mjs')));
const module=await createModule({wasmBinary:readFileSync(path.join(dir,'box3d-st.wasm'))});
const b=createBox3DBinding(module,manifest);const before=b.liveBytes();let world=null;let sample;
try{world=b.createWorld([0,0,0]);const body=b.createBody(world,{position:[0,20,0],enableSleep:false});b.createSphere(body,0.5,12/Math.PI);b.applyCenterImpulse(body,[2,0,0]);b.step(world,1/60,4);sample=Array.from(b.bodySnapshot(body));assert(Math.abs(sample[0]-1/60)<1e-5);assert(Math.abs(sample[1]-20)<1e-5);assert(Math.abs(sample[7]-1)<1e-5);b.destroyWorld(world);world=null;assert.equal(b.liveBytes(),before);}finally{if(world)b.destroyWorld(world);b.dispose();}
const r={status:'PASS_LIMITED_RESTORED_RUNTIME_SMOKE',timeUTC:new Date().toISOString(),scope:'Downloaded archive, independent extracted ESM/WASM/facade, one real zero-gravity sphere impulse and one step then cleanup; not a full qualification rerun.',schemaSha256:manifest.schemaSha256,sample,coreBytesBefore:String(before),coreBytesAfter:String(before)};
writeFileSync(path.join(out,'restore-smoke.raw.json'),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));
