/* V0.6 §44/§52 — Golden 10 双轨执行（Reference + Agent Track A001）+ 指标落盘。
 * 执行：NODE_PATH=<playwright node_modules> node tools/benchmark/run-dual-track.cjs
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const REPO = path.resolve(__dirname, '..', '..');
const esbuild = require('esbuild');

esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'run-golden-dual.ts')],
  bundle: true, format: 'cjs', platform: 'node', target: 'node18',
  external: ['playwright', 'esbuild', 'typescript'],
  outfile: path.join(os.tmpdir(), 'cocosair-v06-dual.cjs'), write: true,
});
const { runGoldenDualTrack } = require(path.join(os.tmpdir(), 'cocosair-v06-dual.cjs'));

(async () => {
  const { rows, metrics } = await runGoldenDualTrack({
    ids: null,
    repo: REPO,
    workRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'v06-dual-')),
    esbuild,
  });
  const evidence = {
    measuredAt: new Date().toISOString(),
    source: require('../verify/benchmark-evidence.cjs').metadata(REPO),
    profile: metrics.profile,
    gate: {
      finalSuccessRate: metrics.finalSuccessRate,
      firstCompileSuccessRate: metrics.firstCompileSuccessRate,
      medianRepairSuccessful: metrics.medianRepairSuccessful,
      eligibleTrials: metrics.eligibleTrials,
      eligibleTypeBTrials: metrics.eligibleTypeBTrials,
      referenceGatePass: metrics.referenceGatePass,
      thresholds: { finalSuccess: 0.8, firstCompile: 0.6, medianRepairMax: 3 },
    },
    rows,
  };
  const out = path.join(REPO, 'docs', 'evidence', 'v06-golden-dual-track.json');
  fs.writeFileSync(out, JSON.stringify(evidence, null, 2));
  console.log('metrics:', JSON.stringify(metrics));
  console.log('evidence →', out);
  const ok = metrics.referenceGatePass && metrics.eligibleTypeBTrials > 0 && metrics.finalSuccessRate >= 0.8 && metrics.firstCompileSuccessRate >= 0.6 && metrics.medianRepairSuccessful <= 3;
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
