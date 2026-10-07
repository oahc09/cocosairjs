'use strict';
const fs=require('fs'),path=require('path');
const {checkReport,checkOperation,checkSupplementary}=require('./interactive-input-browser.cjs');
const clone=x=>structuredClone(x);
function audit(report){
 const baseline=checkReport(report),tests=[],op=report.rows[0].operations[0];
 const mutations={double:r=>r.after.activations++,untrusted:r=>r.after.events.find(e=>e.type==='activate').isTrusted=false,touchAlias:r=>r.kind='button-touch',missingSubmission:r=>r.after.submitted.timestamp='UNKNOWN',late:r=>r.after.submitted.submittedSequence=0,future:r=>r.after.submitted.submittedSequence+=1,frame:r=>r.after.frame=r.before.frame,pose:r=>r.after.actor.x+=1,hiddenMesh:r=>r.after.actor.meshBound=false,pngSha:r=>r.png.sha256='0'.repeat(64),pngMissing:r=>r.png.path+='-missing',nan:r=>r.after.layout.dpr=NaN,notRun:r=>r.result='NOT_RUN',contact:r=>r.after.activePointers=[1],generation:r=>r.after.generation++};
 if(!checkOperation(op).ok)throw Error('baseline measured operation rejected');
 for(const [name,mutate]of Object.entries(mutations)){const r=clone(op);mutate(r);tests.push({name,rejected:!checkOperation(r).ok})}
 const cases={keyboard:r=>r.stages.find(x=>x.name==='after').snapshot.activations--,rewrite:r=>r.stages.find(x=>x.name==='rewriting').snapshot.labelIdentityStable=true,hover:r=>r.stages.find(x=>x.name==='after').snapshot.hoverMoves=0,reset:r=>r.stages.find(x=>x.name==='retired').snapshot.activePointers=[1],'range-cancel':r=>r.stages.find(x=>x.name==='late').snapshot.rangeValue++,wheel:r=>r.stages.find(x=>x.name==='vertical').snapshot.scrollY+=120,multitouch:r=>r.stages.find(x=>x.name==='held').snapshot.activePointers=[1],cancel:r=>r.stages.find(x=>x.name==='fresh').snapshot.dragCommits--};
 for(const [kind,mutate]of Object.entries(cases)){const source=report.rows[0].supplementary.find(x=>x.kind===kind);if(!checkSupplementary(source).ok)throw Error('baseline supplementary rejected '+kind);const r=clone(source);mutate(r);tests.push({name:kind,rejected:!checkSupplementary(r).ok})}
 // Coverage and identity mutations must introduce an error beyond the recorded PAL diagnostic.
 for(const [name,mutate]of Object.entries({missingRow:r=>r.rows.pop(),missingAction:r=>r.rows[1].operations.pop(),lostNotRun:r=>r.rows[2].notRun=r.rows[2].notRun.filter(x=>x.caseId!=='multitouch'),leakedReference:r=>r.rows[1].release.receipt.refs=[{before:1,after:9}],sdkInHtml:r=>r.rows[1].sdkRequests.push('/build/cocosair.module.js'),sourceDrift:r=>r.fingerprints[0].sha256='0'.repeat(64)})){
 const r=clone(report);mutate(r);const v=checkReport(r);tests.push({name,rejected:v.errors.some(e=>!baseline.errors.includes(e))})}
 return {schemaVersion:'ier-input-audit/1',baseline,acceptedMeasuredOperation:true,acceptedSupplementaryCases:8,browserRunsAdded:0,tests,ok:tests.every(t=>t.rejected),limitations:['Baseline full scope remains false: PAL warnings and NOT_RUN are preserved, not compensated by mutation rejection']};
}
module.exports={audit};
if(require.main===module){const arg=n=>process.argv.find(x=>x.startsWith('--'+n+'='))?.split('=').slice(1).join('=');const file=arg('report'),out=arg('out');if(!file||!out)throw Error('--report and --out required');const result=audit(JSON.parse(fs.readFileSync(file)));fs.writeFileSync(path.resolve(out),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({ok:result.ok,rejected:result.tests.filter(x=>x.rejected).length,total:result.tests.length,baselineErrors:result.baseline.errors.length}));process.exitCode=result.ok?0:1;}
