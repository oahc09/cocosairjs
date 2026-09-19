import fs from 'node:fs'; import path from 'node:path'; import cp from 'node:child_process';
const DST='E:/qoder-negctl3-2026-09-19/repo';
const run=(a)=>{const r=cp.spawnSync(process.execPath,a,{cwd:DST,encoding:'utf8'});return{code:r.status,out:(r.stdout||'')+(r.stderr||'')};};
const log=(t,r)=>console.log(`### ${t} -> EXIT ${r.code} :: `+r.out.trim().split('\n').slice(-1)[0]);
const targets=['texture-basic','static-model','gltf-basic'];
for (const dir of targets){
  const ej=JSON.parse(fs.readFileSync(`${DST}/examples/${dir}/example.json`,'utf8'));
  const rel=(ej.assets||[]).find(a=>fs.existsSync(`${DST}/examples/${dir}/${a}`));
  if(!rel){console.log(`${dir}: no declared asset on disk (status=${ej.status})`);continue;}
  const abs=path.join(DST,'examples',dir,rel); const orig=fs.readFileSync(abs);
  console.log(`\n[${dir}] status=${ej.status} asset=${rel} (${orig.length} B)`);
  log('  control spec-compliance', run(['tools/examples/spec-compliance-audit.cjs']));
  fs.writeFileSync(abs, Buffer.alloc(0));
  log('  zero-byte spec-compliance', run(['tools/examples/spec-compliance-audit.cjs']));
  fs.writeFileSync(abs, Buffer.from('GARBAGE-INJECTED-BY-AUDIT'));
  log('  garbage   spec-compliance', run(['tools/examples/spec-compliance-audit.cjs']));
  log('  garbage   license-audit', run(['tools/verify/license-audit.cjs']));
  fs.writeFileSync(abs, orig);
  console.log('  restored:', fs.readFileSync(abs).equals(orig));
}
console.log('\ngit-repo marker present in copy:', fs.existsSync(DST+'/.git'));
