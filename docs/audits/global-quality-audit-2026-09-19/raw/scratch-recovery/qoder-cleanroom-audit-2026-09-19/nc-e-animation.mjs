// §5 "stop animation" negative control: does v11-examples-verify (real Chromium, frame-diff)
// actually fail when the animation is frozen? Runs entirely inside an isolated copy.
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';

const DST = 'E:/qoder-animctl-2026-09-19/repo';
const PW = 'E:/AIProMax/Y2026M08/AIShaderBenchmark/node_modules';
const SRC = path.join(DST, 'examples/anim-position/src/main.ts');
const EV = path.join(DST, 'docs/evidence/v11-examples-verified.json');

const orig = fs.readFileSync(SRC, 'utf8');
if (!orig.includes('this.node.setPosition(Math.sin(this.t * 2) * 0.8, 0.6, 0);')) {
  console.log('ABORT: injection anchor not found (example source differs from expectation)');
  process.exit(2);
}

function run(label) {
  const r = cp.spawnSync(process.execPath, ['tools/verify/v11-examples-verify.cjs', '--ids=anim-position'],
    { cwd: DST, encoding: 'utf8', env: { ...process.env, NODE_PATH: PW }, timeout: 420000 });
  const out = (r.stdout || '') + (r.stderr || '');
  let rec = null;
  try {
    const j = JSON.parse(fs.readFileSync(EV, 'utf8'));
    const rows = j.results || j.examples || j;
    const list = Array.isArray(rows) ? rows : (rows.anim-position ? [rows.anim-position] : Object.values(rows));
    rec = list.find(x => (x.id || x.exampleId) === 'anim-position') || null;
  } catch (e) { console.log('evidence parse error', e.message); }
  const checks = rec && rec.validators ? rec.validators : (rec && rec.checks) || [];
  console.log(`\n=== ${label} :: runner EXIT ${r.status}, result=${rec && rec.result}`);
  for (const c of (Array.isArray(checks) ? checks : Object.entries(checks))) {
    const id = c.id ?? c[0], ok = c.ok ?? c.pass ?? c.status;
    console.log(`   ${ok === true || ok === 'pass' ? 'PASS' : 'FAIL'} ${id}  ${String(c.detail ?? c.message ?? c.info ?? '').slice(0, 90)}`);
  }
  if (!out.trim().split('\n').length) console.log('   (no runner stdout)');
  else console.log('   runner tail: ' + out.trim().split('\n').slice(-3).join(' | ').slice(0, 300));
  return { code: r.status, rec };
}

const control = run('CONTROL (animation running)');
fs.writeFileSync(SRC, orig.replace('this.node.setPosition(Math.sin(this.t * 2) * 0.8, 0.6, 0);',
  '/* NEGATIVE CONTROL: animation frozen — node never moves */'));
const injected = run('INJECTED (animation stopped)');
fs.writeFileSync(SRC, orig);
console.log('\nrestored in copy:', fs.readFileSync(SRC, 'utf8') === orig,
  '| original repo untouched:', fs.readFileSync('E:/AIProMax/github/cocosair.js/examples/anim-position/src/main.ts', 'utf8').includes('this.node.setPosition(Math.sin(this.t * 2)'));
console.log('VERDICT-LINE: control=' + control.rec?.result + ' injected=' + injected.rec?.result);
