import fs from 'node:fs'; import path from 'node:path'; import cp from 'node:child_process';
const REPO='E:/AIProMax/github/cocosair.js', SC='E:/qoder-negctl3-2026-09-19', DST=SC+'/repo';
fs.rmSync(SC,{recursive:true,force:true}); fs.mkdirSync(DST,{recursive:true});
for (const p of ['tools','docs','examples','package.json']) {
  fs.cpSync(path.join(REPO,p), path.join(DST,p), {recursive:true, filter:(src)=>!/[\/](node_modules|\.git)([\/]|$)/.test(src)});
}
fs.mkdirSync(DST+'/build',{recursive:true});
for (const p of ['cocosair.d.ts']) if (fs.existsSync(REPO+'/build/'+p)) fs.copyFileSync(REPO+'/build/'+p, DST+'/build/'+p);
const run=(args)=>{const r=cp.spawnSync(process.execPath,args,{cwd:DST,encoding:'utf8'});return {code:r.status,out:(r.stdout||'')+(r.stderr||'')};};
const log=(t,r)=>console.log(`\n### ${t} -> EXIT ${r.code}\n`+r.out.trim().split('\n').slice(-4).join('\n'));
// pick a texture/png asset declared by a status=stable example
const specs=fs.readdirSync(DST+'/examples').filter(d=>fs.existsSync(`${DST}/examples/${d}/example.json`));
let target=null;
for (const d of specs){const s=JSON.parse(fs.readFileSync(`${DST}/examples/${d}/example.json`,'utf8'));
  if(s.status!=='stable')continue;
  const a=(s.assets||[]).find(x=>/\.(png|jpg|jpeg|webp)$/i.test(x)&&fs.existsSync(`${DST}/examples/${d}/${x}`));
  if(a){target={dir:d,rel:a,size:fs.statSync(`${DST}/examples/${d}/${a}`).size};break;}
  const g=(s.assets||[])[0]; if(g&&fs.existsSync(`${DST}/examples/${d}/${g}`)){target={dir:d,rel:g,size:fs.statSync(`${DST}/examples/${d}/${g}`).size};break;}
}
console.log('TARGET =',JSON.stringify(target));
const abs=path.join(DST,'examples',target.dir,target.rel); const orig=fs.readFileSync(abs);
log('CONTROL spec-compliance-audit', run(['tools/examples/spec-compliance-audit.cjs']));
log('CONTROL generate-manifest', run(['tools/examples/generate-manifest.cjs']));
log('CONTROL coverage-report', run(['tools/examples/coverage-report.cjs']));
fs.writeFileSync(abs, Buffer.alloc(0));
log('NC-D1 zero-byte asset (reference present, content destroyed) spec-compliance', run(['tools/examples/spec-compliance-audit.cjs']));
log('NC-D1 generate-manifest', run(['tools/examples/generate-manifest.cjs']));
log('NC-D1 coverage-report', run(['tools/examples/coverage-report.cjs']));
fs.writeFileSync(abs, Buffer.from('NOT-A-REAL-IMAGE-INJECTED-BY-AUDIT'));
log('NC-D2 corrupt/garbage asset spec-compliance', run(['tools/examples/spec-compliance-audit.cjs']));
fs.writeFileSync(abs, orig);
console.log('\nrestored identical in copy:', fs.readFileSync(abs).equals(orig), '| original repo untouched:', fs.readFileSync(path.join(REPO,'examples',target.dir,target.rel)).equals(orig));
