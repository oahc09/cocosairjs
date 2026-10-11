'use strict';
const fs=require('node:fs'),path=require('node:path');
const {audit:scopedAudit}=require('./shaders-noise-dissolve-scoped-audit.cjs');
const {validatePrecision}=require('./shaders-noise-dissolve-precision.cjs');
const ROOT=path.resolve(__dirname,'../..');
function audit(report){
 const baseline=validatePrecision(report);if(!baseline.ok)return {ok:false,baseline,browserRunsAdded:0,mutations:[]};
 const existing=scopedAudit(report),mutations=[...existing.mutations];const ff=r=>r.engines.find(e=>e.engine==='firefox'),limited=r=>ff(r).report.gates.Performance.cases.find(c=>c.caseId==='720p');
 const cases=[
 ['precision-profile-promoted-pass',r=>limited(r).status='PASS'],
 ['precision-engine-promoted-pass',r=>ff(r).report.status='PASS'],
 ['precision-metric-nonzero-forged',r=>limited(r).observation.cpuSubmissionMs[0]=0.5],
 ['precision-timer-promoted-measured',r=>limited(r).observation.gpuTimestamp.status='measured'],
 ['precision-status-row-promoted',r=>r.normalization.precision.rows.find(c=>c.engine==='firefox'&&c.caseId==='720p').status='PASS'],
 ['precision-previous-lineage-missing',r=>delete r.normalization.precisionPreviousReport],
 ['precision-resolution-forged',r=>r.normalization.precision.clockResolution='0.001 ms'],
 ['precision-limited-profile-removed',r=>ff(r).report.gates.Performance.cases.pop()],
 ['precision-limited-disguised-notrun',r=>limited(r).status='NOT_RUN'],
 ];
 for(const [name,mutate]of cases){const changed=JSON.parse(JSON.stringify(report));mutate(changed);const checked=validatePrecision(changed);mutations.push({name,rejected:!checked.ok,errors:checked.errors});}
 return {ok:existing.ok&&mutations.every(m=>m.rejected),baseline,mutations,browserRunsAdded:0};
}
function main(argv=process.argv.slice(2)){const a=n=>argv.find(v=>v.startsWith('--'+n+'='))?.slice(n.length+3),file=a('report'),out=a('out');if(!file||!out)throw new Error('Use --report=<precision.json> --out=<new.json>');const result=audit(JSON.parse(fs.readFileSync(path.resolve(ROOT,file),'utf8'))),target=path.resolve(ROOT,out);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({ok:result.ok,mutations:result.mutations.length,rejected:result.mutations.filter(m=>m.rejected).length,browserRunsAdded:0}));return result.ok?0:1;}
module.exports={audit,main};if(require.main===module)try{process.exitCode=main();}catch(e){console.error(e.stack);process.exitCode=1;}
