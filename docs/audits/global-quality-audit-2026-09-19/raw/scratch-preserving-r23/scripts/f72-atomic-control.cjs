// F-72 离线负向控制：产证原子化 + 消费端 NOT_RUN 判定（不跑浏览器门禁）
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fork } = require('child_process');
const common = require('E:/AIProMax/github/cocosair.js/tools/verify/v11-spec-common.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f72-'));
const out = [];
const t = (name, ok, detail) => out.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`);

// C1: 正常写入 → completed:true 被消费端接受
const f1 = path.join(root, 'a.json');
common.writeJsonAtomic(f1, { runner: 'r', completed: true, results: [{ id: 'x', result: 'PASS' }] });
let r = common.readEvidence(f1);
t('C1 complete evidence adopted', r.status === 'COMPLETE' && r.data.results.length === 1, r.status + ' ' + r.reason);
t('C1 no tmp leftover', fs.readdirSync(root).filter((n) => n.includes('.writing-')).length === 0);

// C2: 缺 completed 标记（旧版产线 / 中断残留）→ NOT_RUN，行不得被采纳
const f2 = path.join(root, 'b.json');
fs.writeFileSync(f2, JSON.stringify({ runner: 'r', results: [{ id: 'x', result: 'FAIL' }] }));
r = common.readEvidence(f2);
t('C2 missing marker = NOT_RUN', r.status === 'NOT_RUN', `${r.status} ${r.reason}`);

// C3: completed:false（--ids 进度快照路径）→ NOT_RUN
const f3 = path.join(root, 'c.json');
fs.writeFileSync(f3, JSON.stringify({ runner: 'r', completed: false, results: [{ id: 'x', result: 'PASS' }] }));
t('C3 completed:false = NOT_RUN', common.readEvidence(f3).status === 'NOT_RUN');

// C4: 半份 JSON → NOT_RUN 而不是抛异常炸掉门禁
const f4 = path.join(root, 'd.json');
fs.writeFileSync(f4, '{"runner":"r","res');
r = common.readEvidence(f4);
t('C4 corrupt json = NOT_RUN (no throw)', r.status === 'NOT_RUN' && /unreadable/.test(r.reason), r.reason);

// C5: 文件不存在 → NOT_RUN
t('C5 missing file = NOT_RUN', common.readEvidence(path.join(root, 'nope.json')).status === 'NOT_RUN');

// C6: 写入过程中被 kill → 目标文件永远是完整 JSON，且要么是旧内容要么是新内容
const f6 = path.join(root, 'e2e.json');
common.writeJsonAtomic(f6, { completed: true, generation: 'OLD', blob: 'o'.repeat(1 << 16) });
const child = path.join(root, 'writer.js');
fs.writeFileSync(child, `const c=require('E:/AIProMax/github/cocosair.js/tools/verify/v11-spec-common.cjs');
let i=0;for(;;){c.writeJsonAtomic(process.argv[2],{completed:i%2===0,generation:'NEW-'+i,blob:'n'.repeat((i%7+1)*262144)});i++;}`);
const killed = new Promise((resolve) => {
  const p = fork(child, [f6], { stdio: 'ignore' });
  setTimeout(() => { p.kill('SIGKILL'); p.on('exit', () => resolve(true)); }, 400);
});
killed.then(() => {
  // kill 落在 writeFileSync(tmp) 与 rename 之间时**必然**留下一个 tmp —— SIGKILL 之后没有任何代码能回收它。
  // 所以安全性质不是"绝不留 tmp"，也不是"残留 tmp 读起来是 NOT_RUN"（tmp 里是写完整的一代内容，
  // 含 completed:true，读起来就是 COMPLETE；旧断言口径写错，见 r23 日志 run 3 FAIL）。
  // 真正的性质：tmp 名带 .writing-<pid>-<rand>，既不等于目标路径、也不以 .json/.png 结尾，
  // 因此精确路径消费端和扩展名式目录扫描（endsWith('.json')）都命中不了它；目标本身永远是完整代次。
  const left = fs.readdirSync(root).filter((n) => n.startsWith('e2e.json'));
  const tmps = left.filter((n) => n !== 'e2e.json');
  t('C6 tmp leftovers stay off the target path and off extension scanners',
    left.includes('e2e.json') && tmps.every((n) => /\.writing-\d+-[a-z0-9]+$/.test(n) && !/\.(json|png|jpg)$/.test(n)),
    `${left.join(',')} (tmp leftovers=${tmps.length})`);
  const parse = (() => { try { return JSON.parse(fs.readFileSync(f6, 'utf8')); } catch (e) { return null; } })();
  t('C6 target parses after kill', !!parse, parse ? '' : 'truncated file survived a SIGKILL');
  t('C6 content is a whole generation', !!parse && /^(OLD|NEW-\d+)$/.test(String(parse.generation)), parse && parse.generation);
  t('C6 completed flag is machine-readable', !!parse && typeof parse.completed === 'boolean', parse && `completed=${parse.completed} → ${common.readEvidence(f6).status}`);
  // C7: 两个进程并发写同一目标（本仓库常有并行会话，F-81）→ 目标永远是某一方的完整代，不是交错字节
  const shared = path.join(root, 'shared.json');
  const writers = [0, 1].map(() => fork(child, [shared], { stdio: 'ignore' }));
  setTimeout(() => {
    writers.forEach((w) => w.kill('SIGKILL'));
    setTimeout(() => {
      const p = (() => { try { return JSON.parse(fs.readFileSync(shared, 'utf8')); } catch (e) { return null; } })();
      t('C7 concurrent writers leave a whole generation', !!p && /^NEW-\d+$/.test(String(p.generation))
        && String(p.blob).length % 262144 === 0 && /^n+$/.test(String(p.blob)), p ? `${p.generation} blob=${String(p.blob).length}B` : 'interleaved/truncated');
      console.log(out.join('\n'));
      const failed = out.some((l) => l.startsWith('FAIL'));
      console.log(`exitCode=${failed ? 1 : 0}`);
      process.exitCode = failed ? 1 : 0;
      fs.rmSync(root, { recursive: true, force: true });
    }, 200);
  }, 500);
});
