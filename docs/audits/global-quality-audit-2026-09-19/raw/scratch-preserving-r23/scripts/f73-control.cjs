// F-73 三门控制（在仓库外副本上跑，不改工作树）：
// C1 晋级写回必须幂等；C2 编辑 validationExpectations 必须变指纹；C3 编辑 src/main.ts 必须变指纹。
const fs = require('fs');
const path = require('path');
const REPO = 'E:/AIProMax/github/cocosair.js';
const SRC = path.join(REPO, 'examples', 'light-point');
const apiTrace = require(path.join(REPO, 'tools/verify/api-trace.cjs'));
const scratchRoot = 'E:/AIProMax/cocosair-fp-scratch/f73-' + Date.now();
fs.cpSync(SRC, scratchRoot, { recursive: true });

const base = apiTrace.sourceFingerprint(scratchRoot);
console.log('base sourceFingerprint =', base);

// C1: 模拟 runner 写回 promotion / status / stableReview
const p = path.join(scratchRoot, 'example.json');
const spec = JSON.parse(fs.readFileSync(p, 'utf8'));
spec.promotion = { spec: 'aaaaaaaaaaaa', source: base, candidate: '5612c4c2746f395b', verified: 9, attested: 1, units: 10 };
spec.status = 'stable';
spec.stableReview = { reviewedAt: 'x' };
fs.writeFileSync(p, JSON.stringify(spec, null, 2) + '\n');
const c1 = apiTrace.sourceFingerprint(scratchRoot);
console.log(`C1 promotion write-back : ${c1 === base ? 'IDEMPOTENT (expected)' : 'CHANGED -> ' + c1}  ${c1 === base ? 'PASS' : 'FAIL'}`);

// C2: 改一个期望值数值（功能合同的实质内容）
const s2 = JSON.parse(fs.readFileSync(p, 'utf8'));
const key = Object.keys(s2.validationExpectations['transform-equals'])[0];
const q = s2.validationExpectations['transform-equals'][key];
const posKey = q.position ? 'position' : Object.keys(q)[0];
const orig = JSON.stringify(q[posKey]);
q[posKey] = Array.isArray(q[posKey]) ? q[posKey].map((v, i) => (i === 0 ? v + 0.5 : v)) : { vary: true };
s2.validationExpectations['transform-equals'][key] = q;
fs.writeFileSync(p, JSON.stringify(s2, null, 2) + '\n');
const c2 = apiTrace.sourceFingerprint(scratchRoot);
console.log(`C2 expectation edit ${key}.${posKey} ${orig} -> ${JSON.stringify(q[posKey])} : ${c2 !== base ? 'DETECTED' : 'MISSED -> FAIL'}  ${c2 !== base ? 'PASS' : 'FAIL'}`);

// C3: 改源码字节（注释也算字节，这里改真实语句里的数字）
const srcFile = ['src/main.ts', 'src/main.js', 'main.ts', 'main.js'].map((r) => path.join(scratchRoot, r)).find((f) => fs.existsSync(f));
const before = fs.readFileSync(srcFile, 'utf8');
fs.writeFileSync(srcFile, before.replace(/(\d+\.?\d*)/, (m) => String(parseFloat(m) + 1)));
const c3 = apiTrace.sourceFingerprint(scratchRoot);
console.log(`C3 entry-source byte edit (${path.relative(scratchRoot, srcFile)}) : ${c3 !== base && c3 !== c2 ? 'DETECTED' : 'MISSED -> FAIL'}  ${c3 !== base && c3 !== c2 ? 'PASS' : 'FAIL'}`);
console.log('scratch copy left at', scratchRoot, '(outside repo, deletable)');
