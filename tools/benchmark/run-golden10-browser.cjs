/* V0.6 T7c — Golden 10 真实浏览器 Reference Track 运行器。
 * 执行：NODE_PATH=<playwright node_modules> node tools/benchmark/run-golden10-browser.cjs [B001 ...]
 * 前置：npm run build（/build/cocosair.module.js 为 Fresh Build 产物）。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const esbuild = require('esbuild');

const REPO = path.resolve(__dirname, '..', '..');
const OUT = path.join(os.tmpdir(), 'cocosair-v06-runner.cjs');

// TS Runner + BrowserRuntime 打包为 CJS 供本脚本加载
esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'run-golden10.ts')],
  bundle: true, format: 'cjs', platform: 'node', target: 'node18',
  external: ['playwright', 'esbuild'],
  outfile: OUT, write: true,
});
const { runGolden10 } = require(OUT);

const ids = process.argv.slice(2);
runGolden10({
  ids: ids.length ? ids : null,
  repo: REPO,
  esbuild: require('esbuild'),
  workRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'v06-golden-')),
  cocosairRevision: require('child_process').execSync('git rev-parse --short HEAD', { cwd: REPO }).toString().trim(),
}).then((results) => {
  const failed = results.filter((r) => r.engineResult !== 'PASS' && r.engineResult !== 'EXPECTED_FALLBACK' && r.engineResult !== 'EXPECTED_UNSUPPORTED');
  console.log(`\n== golden10 browser reference: ${results.length - failed.length}/${results.length} PASS ==`);
  process.exit(failed.length ? 1 : 0);
}).catch((e) => { console.error(e); process.exit(1); });
