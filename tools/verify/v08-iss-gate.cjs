/* V0.8 BLOCK-2 — Invalid/Stress/Security 50 Benchmark Runtime Gate（§86 增量：catalog ≥150）。
 * 执行：NODE_PATH=<playwright node_modules> node tools/verify/v08-iss-gate.cjs
 * 产出：docs/evidence/v08-iss-runtime-gate.json（纯 JSON，无主机路径）
 *       docs/evidence/v08-iss-runtime-gate.log
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const REPO = path.resolve(__dirname, '..', '..');
const esbuild = require('esbuild');

esbuild.buildSync({
  entryPoints: [path.join(__dirname, '..', 'benchmark', 'run-golden10.ts')],
  bundle: true, format: 'cjs', platform: 'node', target: 'node18',
  external: ['playwright', 'esbuild'],
  outfile: path.join(os.tmpdir(), 'cocosair-v08-iss.cjs'), write: true,
});
const { runGolden10 } = require(path.join(os.tmpdir(), 'cocosair-v08-iss.cjs'));
const { CATALOG_ISS } = require(path.join(os.tmpdir(), 'cocosair-v08-iss.cjs'));

(async () => {
  const log = [];
  const raw = await runGolden10({
    ids: process.argv.slice(2).length ? process.argv.slice(2) : null,
    catalog: CATALOG_ISS.benchmarks,
    repo: REPO,
    workRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'v08-iss-')),
    esbuild,
    onTrial: (row) => {
      log.push(`[${row.id}] ${row.engineResult}${row.failureReason ? ' — ' + row.failureReason.slice(0, 220) : ''}`);
    },
  });
  const results = raw.map((r) => ({
    id: r.id,
    engineResult: r.engineResult,
    failureDomain: r.failureDomain,
    ...(r.failureReason ? { failureReason: r.failureReason.replaceAll(REPO, '<repo>').replaceAll(os.tmpdir(), '<temp>') } : {}),
    ...(r.validatorResults && r.validatorResults.length ? { validatorResults: r.validatorResults.map((v) => ({ validatorId: v.validatorId, state: v.state, detail: String(v.detail || '').slice(0, 160) })) } : {}),
  }));
  const pass = results.filter((r) => ['PASS', 'EXPECTED_UNSUPPORTED', 'EXPECTED_FALLBACK'].includes(r.engineResult)).length;
  const evidence = {
    measuredAt: new Date().toISOString(),
    source: require('./benchmark-evidence.cjs').metadata(REPO),
    gate: 'V0.8 BLOCK-2 ISS Runtime Gate',
    catalogRevision: CATALOG_ISS.revision,
    domains: results.reduce((acc, r) => {
      const n = parseInt(r.id.slice(1), 10);
      const domain = n <= 118 ? 'invalid' : n <= 134 ? 'stress' : 'security';
      acc[domain] = (acc[domain] || 0) + 1;
      return acc;
    }, {}),
    total: results.length,
    pass,
    counts: results.reduce((acc, r) => { acc[r.engineResult] = (acc[r.engineResult] || 0) + 1; return acc; }, {}),
    cocosairRevision: require('child_process').execSync('git rev-parse --short HEAD', { cwd: REPO }).toString().trim(),
    trials: results,
  };
  fs.writeFileSync(path.join(REPO, 'docs', 'evidence', 'v08-iss-runtime-gate.json'), JSON.stringify(evidence, null, 2) + '\n');
  fs.writeFileSync(path.join(REPO, 'docs', 'evidence', 'v08-iss-runtime-gate.log'), log.join('\n') + '\n');
  JSON.parse(fs.readFileSync(path.join(REPO, 'docs', 'evidence', 'v08-iss-runtime-gate.json'), 'utf8')); // CI 级自校验
  console.log(`V0.8 ISS Gate: ${pass}/${results.length} PASS`);
  process.exit(results.length === 50 && pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
