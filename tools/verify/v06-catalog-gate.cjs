/* V0.6 §51 — 100 Benchmark Runtime Gate：结构化 JSON 证据（可 JSON.parse/schema 校验）。
 * 执行：NODE_PATH=<playwright node_modules> node tools/verify/v06-catalog-gate.cjs
 * 产出：docs/evidence/v06-catalog-runtime-gate.json（纯 JSON，无主机路径）
 *      docs/evidence/v06-catalog-runtime-gate.log（诊断日志）
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
  outfile: path.join(os.tmpdir(), 'cocosair-v06-catalog.cjs'), write: true,
});
const { runGolden10 } = require(path.join(os.tmpdir(), 'cocosair-v06-catalog.cjs'));

(async () => {
  const log = [];
  const raw = await runGolden10({
    ids: null,
    repo: REPO,
    workRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'v06-gate-')),
    esbuild,
    onTrial: (row) => {
      log.push(`[${row.id}] ${row.engineResult}${row.failureReason ? ' — ' + row.failureReason.slice(0, 200) : ''}`);
    },
  });
  // 路径清理：workspaceDir 前缀不含主机用户名/临时目录
  const results = raw.map((r) => ({
    id: r.id,
    engineResult: r.engineResult,
    failureDomain: r.failureDomain,
    ...(r.failureReason ? { failureReason: r.failureReason.replaceAll(REPO, '<repo>').replaceAll(os.tmpdir(), '<temp>') } : {}),
  }));
  const pass = results.filter((r) => ['PASS', 'EXPECTED_UNSUPPORTED', 'EXPECTED_FALLBACK'].includes(r.engineResult)).length;
  const evidence = {
    measuredAt: new Date().toISOString(),
    source: require('./benchmark-evidence.cjs').metadata(REPO),
    gate: '§51 Runtime Gate',
    total: results.length,
    pass,
    counts: results.reduce((acc, r) => { acc[r.engineResult] = (acc[r.engineResult] || 0) + 1; return acc; }, {}),
    cocosairRevision: require('child_process').execSync('git rev-parse --short HEAD', { cwd: REPO }).toString().trim(),
    trials: results,
  };
  fs.writeFileSync(path.join(REPO, 'docs', 'evidence', 'v06-catalog-runtime-gate.json'), JSON.stringify(evidence, null, 2) + '\n');
  fs.writeFileSync(path.join(REPO, 'docs', 'evidence', 'v06-catalog-runtime-gate.log'), log.join('\n') + '\n');
  JSON.parse(fs.readFileSync(path.join(REPO, 'docs', 'evidence', 'v06-catalog-runtime-gate.json'), 'utf8')); // CI 级自校验
  console.log(`§51 Runtime Gate: ${pass}/${results.length} PASS`);
  process.exit(results.length === 100 && pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
