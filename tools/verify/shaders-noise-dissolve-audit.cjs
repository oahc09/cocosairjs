'use strict';
const fs=require('node:fs'),path=require('node:path');
const {validateReport}=require('./shaders-noise-dissolve.cjs');
const ROOT=path.resolve(__dirname,'../..');
function audit(report){
 const baseline=validateReport(report),mutations=[];
 if(!baseline.ok)return {ok:false,baseline,reason:'Only a schema/oracle-valid baseline may be audited',mutations,browserRunsAdded:0};
 const clone=()=>JSON.parse(JSON.stringify(report));
 const first=r=>r.engines[0].report;
 const visual=r=>first(r).gates.Visual.cases.find(c=>c.caseId==='middle');
 const resource=r=>first(r).gates.Resource.cases[0].observation;
 const cases=[
 ['missing-engine',r=>r.engines.pop()],
 ['missing-visual-case',r=>first(r).gates.Visual.cases.pop()],
 ['duplicate-case',r=>first(r).gates.Visual.cases.push(visual(r))],
 ['empty-raw-grid',r=>visual(r).observation.algorithm.raw[0].raw=[]],
 ['all-black-raw',r=>visual(r).observation.algorithm.raw[0].raw.forEach(p=>p.rgba=[0,0,0,255])],
 ['wrong-progress',r=>visual(r).observation.algorithm.raw[0].parameters.progress=0.01],
 ['nan-seed',r=>visual(r).observation.algorithm.raw[0].parameters.seed=NaN],
 ['source-drift',r=>first(r).identity.source[0].sha256='0'.repeat(64)],
 ['png-sha-drift',r=>visual(r).observation.screenshot.sha256='0'.repeat(64)],
 ['missing-png',r=>visual(r).observation.screenshot.path='output/shaders-absorption/e01-not-a-real-file.png'],
 ['unreleased-ref',r=>resource(r).cycles[0].allocations[0].released=9],
 ['unbound-false',r=>resource(r).cycles[0].detached=false],
 ['resource-cycle-missing',r=>resource(r).cycles.pop()],
 ['effect-registry-retained',r=>resource(r).release.result.effect.registryDetached=false],
 ['effect-ref-retained',r=>resource(r).release.result.effect.after=1],
 ['background-ref-retained',r=>resource(r).release.result.ownedBackgroundRefs[0].after=1],
 ['release-promise-not-same',r=>resource(r).release.samePromise=false],
 ['listeners-retained',r=>resource(r).release.result.listeners=1],
 ['instruments-not-restored',r=>resource(r).release.result.instrumentsRestored=false],
 ['wrong-browser',r=>visual(r).browser='webkit'],
 ['pageerror',r=>r.engines[0].pageErrors.push('audit injected')],
 ['fake-boundary-rejection',r=>first(r).gates.Boundary.cases.find(c=>c.caseId==='seed-invalid-nan').observation.errorCode=null],
 ['boundary-no-gpu-draw',r=>first(r).gates.Boundary.cases.find(c=>c.caseId==='seed-default').observation.uniformDraw=null],
 ['missing-runtime-stage',r=>first(r).gates.Runtime.cases.pop()],
 ['absent-native-compile',r=>first(r).gates.Build.cases.find(c=>c.caseId==='shader').observation.compiles=[]],
 ];
 for(const [name,mutate]of cases){const changed=clone();mutate(changed);const checked=validateReport(changed);mutations.push({name,rejected:!checked.ok,errors:checked.errors});}
 return {ok:mutations.every(m=>m.rejected),baseline,mutations,browserRunsAdded:0};
}
function main(argv=process.argv.slice(2)){
 const report=argv.find(a=>a.startsWith('--report=')),out=argv.find(a=>a.startsWith('--out='));if(!report||!out)throw new Error('Use --report=<existing.json> --out=<new.json>');
 const result=audit(JSON.parse(fs.readFileSync(path.resolve(ROOT,report.slice(9)),'utf8')));const file=path.resolve(ROOT,out.slice(6));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({ok:result.ok,mutations:result.mutations.length,rejected:result.mutations.filter(m=>m.rejected).length,browserRunsAdded:0}));return result.ok?0:1;
}
module.exports={audit,main};if(require.main===module)try{process.exitCode=main();}catch(error){console.error(error.stack);process.exitCode=1;}
