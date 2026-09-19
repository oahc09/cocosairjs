const fs=require('fs'),path=require('path'),crypto=require('crypto');
const REPO='E:/AIProMax/github/cocosair.js', WORK='E:/qoder-r7i-2026-09-19/work', FROZEN='E:/qoder-frozen-2026-09-19/candidate';
const FILES=['tools/verify/decoder-audit.cjs','tools/examples/coverage-report.cjs','tools/verify/test-inventory.cjs','tools/verify/benchmark-evidence.cjs','tools/verify/v06-report.cjs','tools/examples/spec-compliance-audit.cjs','tools/verify/v11-spec-common.cjs','tools/verify/v11-devtools-examples.cjs','tools/verify/v11-examples-verify.cjs','package.json','docs/test-inventory.json'];
const h=(p)=>{try{return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0,16)}catch{return 'ABSENT'}};
const out=[];let blocked=0;
for(const f of FILES){
  const repo=h(path.join(REPO,f)), frozen=h(path.join(FROZEN,f)), work=h(path.join(WORK,f));
  const isNew=!fs.existsSync(path.join(FROZEN,f));
  const safe=isNew?repo==='ABSENT':repo===frozen;
  if(!safe)blocked++;
  out.push(`${safe?'OK  ':'BLOCK'} ${f} repo=${repo} frozen=${frozen} work=${work}${isNew?' (new file)':''}`);
}
console.log(out.join('\n'));
console.log(`\nblocked=${blocked}`);
if(!blocked && process.argv.includes('--apply')){
  for(const f of FILES){
    const src=path.join(WORK,f), dst=path.join(REPO,f);
    fs.mkdirSync(path.dirname(dst),{recursive:true});
    fs.copyFileSync(src,dst);
    console.log(`ported ${f} -> ${h(dst)}`);
  }
}
