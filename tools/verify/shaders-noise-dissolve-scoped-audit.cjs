'use strict';
const fs=require('node:fs'),path=require('node:path');
const {audit:baseAudit}=require('./shaders-noise-dissolve-audit.cjs');
const {validateScoped}=require('./shaders-noise-dissolve-normalize-scoped.cjs');
const ROOT=path.resolve(__dirname,'../..');
function audit(report){
 const baseline=validateScoped(report);if(!baseline.ok)return {ok:false,baseline,browserRunsAdded:0,mutations:[]};
 const existing=baseAudit(report),mutations=[...existing.mutations];const row=r=>r.engines[0].report.gates.Visual.cases[0];
 const cases=[
 ['boundary-fixed-template-wrong',r=>r.engines[0].report.gates.Boundary.cases.find(c=>c.caseId==='seed-default').fixed.viewport.width=384],
 ['boundary-fixed-param-wrong',r=>r.engines[0].report.gates.Boundary.cases.find(c=>c.caseId==='seed-default').fixed.parameters.seed=42],
 ['collection-exit-faked-zero',r=>row(r).collectionExecution.exitCode=0],
 ['collector-command-used-as-validator',r=>row(r).execution.command=r.normalization.collectionExecution.command],
 ['validator-purpose-missing',r=>delete row(r).execution.purpose],
 ['validator-exit-nonzero',r=>row(r).execution.exitCode=1],
 ['validator-command-forged',r=>row(r).execution.command='node not-the-executed-verifier.cjs'],
 ['raw-capture-lineage-sha-tampered',r=>r.normalization.rawReport.sha256='0'.repeat(64)],
 ['aggregate-collector-exit-faked-zero',r=>r.normalization.collectionExecution.exitCode=0],
 ['leaf-validation-report-missing',r=>row(r).execution.rawOutputs[0].path='output/shaders-absorption/e01-missing-validation.json'],
 ];
 for(const [name,mutate]of cases){const changed=JSON.parse(JSON.stringify(report));mutate(changed);const checked=validateScoped(changed);mutations.push({name,rejected:!checked.ok,errors:checked.errors});}
 return {ok:existing.ok&&mutations.every(m=>m.rejected),baseline,mutations,browserRunsAdded:0};
}
function main(argv=process.argv.slice(2)){const a=n=>argv.find(v=>v.startsWith('--'+n+'='))?.slice(n.length+3),file=a('report'),out=a('out');if(!file||!out)throw new Error('Use --report=<scoped.json> --out=<new.json>');const result=audit(JSON.parse(fs.readFileSync(path.resolve(ROOT,file),'utf8'))),target=path.resolve(ROOT,out);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({ok:result.ok,mutations:result.mutations.length,rejected:result.mutations.filter(m=>m.rejected).length,browserRunsAdded:0}));return result.ok?0:1;}
module.exports={audit,main};if(require.main===module)try{process.exitCode=main();}catch(e){console.error(e.stack);process.exitCode=1;}
