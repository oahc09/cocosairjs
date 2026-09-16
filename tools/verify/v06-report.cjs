const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const esbuild = require('esbuild');
const Module = require('module');
const root = path.resolve(__dirname,'../..');
function load(file) {
    const out = esbuild.buildSync({ entryPoints:[path.join(root,file)], bundle:true,write:false,platform:'node',format:'cjs' });
    const m = new Module(__filename,module);m.paths=module.paths;m._compile(out.outputFiles[0].text,__filename);return m.exports;
}
const { RECIPES } = load('tools/benchmark/recipes/recipes30.ts');
const { recipeStats, checkCoverage } = load('tools/benchmark/recipes/schema.ts');
const { aggregate } = load('tools/benchmark/runner/metrics.ts');
const dual = JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/v06-golden-dual-track.json')));
const catalog = JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/v06-catalog-runtime-gate.json')));
const metrics=aggregate(dual.rows.map(r=>r.record));
const recipes=recipeStats(RECIPES);
const { CATALOG_BENCHMARKS } = load('tools/benchmark/catalog/catalog100.ts');
const { VALIDATORS } = load('tools/benchmark/validators/index.ts');
const exampleIds = fs.readdirSync(path.join(root,'examples')).filter(id=>fs.existsSync(path.join(root,'examples',id,'index.html')));
const recipeEvidenceFile=path.join(root,'docs/evidence/v06-recipes.json');
const recipeEvidence=fs.existsSync(recipeEvidenceFile)?JSON.parse(fs.readFileSync(recipeEvidenceFile)).runs:[];
const coverageFailures=checkCoverage(RECIPES, {
    benchmarkIds:new Set(CATALOG_BENCHMARKS.map(b=>b.id)),exampleIds:new Set(exampleIds),validatorIds:new Set(Object.keys(VALIDATORS)),
    exampleHasEntry:new Map(exampleIds.map(id=>[id,true])),evidence:recipeEvidence,
    benchmarkDefs:new Map(CATALOG_BENCHMARKS.map(b=>[b.id,{id:b.id,type:b.benchmarkType,category:b.category,validators:[...b.validators,...(b.visualValidators||[])]}])),
});
const refPass=dual.rows.length===10 && dual.rows.every(r=>['PASS','EXPECTED_UNSUPPORTED','EXPECTED_FALLBACK'].includes(r.reference.engineResult));
const catalogPass=catalog.total===100 && catalog.pass===100;
const recipesPass=coverageFailures.length===0 && recipes.catalogTotal>=30 && recipes.validatedCount>=30 && recipes.stableCount>=20;
const testsPath=path.join(root,'output/v06-review-jest.json');
const tests=fs.existsSync(testsPath)?JSON.parse(fs.readFileSync(testsPath)):null;
const blockers=[];
const sourceHash=require('./benchmark-evidence.cjs').sourceHash(root);
if(dual.source?.sourceHash!==sourceHash || catalog.source?.sourceHash!==sourceHash)blockers.push('运行证据与当前源码哈希不一致，需要重跑。');
if(!refPass)blockers.push('Golden Reference 有失败；必须修复并重跑。');
if(!catalogPass)blockers.push('100 项 Runtime Gate 未全过；逐项结果见 catalog evidence。');
if(!recipesPass)blockers.push('Recipe 缺少同一完整场景的交互、视觉与生命周期运行证据，30 条保留为 draft；未满足 30 validated / 20 stable。');
if(metrics.eligibleTypeBTrials===0 || metrics.firstCompileSuccessRate<0.6 || metrics.agentFinalSuccessRate<0.8 || metrics.medianRepairSuccessful>3)blockers.push('Agent 指标未达阈值。');
if(!tests?.success)blockers.push('本轮 Jest 结果尚未通过或缺失。');
const report={ measuredAt:new Date().toISOString(),status:blockers.length?'BLOCKED':'PASS',referenceGatePass:refPass,catalogGatePass:catalogPass,metrics,recipes,coverageFailures,tests:tests?{suites:tests.numTotalTestSuites,tests:tests.numTotalTests,passed:tests.numPassedTests,success:tests.success}:null,blockers };
fs.writeFileSync(path.join(root,'docs/evidence/v06-review-gate.json'),JSON.stringify(report,null,2)+'\n');
const lines=['# V0.6 Final Gate（自动生成）','',`状态：**${report.status}**。生成时间：${report.measuredAt}。`,'','本文件由 `node tools/verify/v06-report.cjs` 从本轮证据生成，替代先前手工填写的全绿结论。','',`- Golden Reference：${refPass?'通过':'未通过'}；EXPECTED_UNSUPPORTED 单独记账，不计入 Agent 分母。`,`- Catalog Runtime：${catalog.pass}/${catalog.total}，分布 ${JSON.stringify(catalog.counts)}。`,`- Agent：${metrics.agentPass}/${metrics.eligibleTrials}；First Compile：${metrics.firstCompileSuccessRate}，Type-B 分母 ${metrics.eligibleTypeBTrials}；成功 repair 中位数 ${metrics.medianRepairSuccessful}。`,`- Recipe：总数 ${recipes.catalogTotal}，validated（含 stable）${recipes.validatedCount}，stable ${recipes.stableCount}。`,`- Jest：${report.tests?`${report.tests.suites} suites / ${report.tests.passed} of ${report.tests.tests} tests；success=${report.tests.success}`:'未记录'}。`,'','## 待完成门禁','',...blockers.map(b=>'- '+b),'','## 证据与复现','','- `docs/evidence/v06-golden-dual-track.json`：双轨结果及完整 TrialRecord，指标使用唯一 aggregate()。','- `docs/evidence/v06-catalog-runtime-gate.json`：100 项结果。','- `docs/evidence/v06-review-gate.json`：本报告机器可读数据。','- `npm run verify:benchmark`：工具源码类型检查与真实行为回归。','- `node tools/benchmark/run-dual-track.cjs`：重跑 Golden 双轨（需要 Playwright）。','- `node tools/verify/v06-catalog-gate.cjs`：重跑 100 项 Reference。','- `node tools/verify/v06-report.cjs`：生成报告；未达门禁返回非零。','','A001 是读取冻结参考实现的 scripted solver，仅证明工作流，不代表独立 LLM 能力。旧性能与生命周期 evidence 保留为历史记录，本轮未重测，不能替代当前缺失的 Recipe 证据。',''];
fs.writeFileSync(path.join(root,'docs/v06-final-gate.md'),lines.join('\n'));
console.log(JSON.stringify(report,null,2));process.exitCode=blockers.length?1:0;
