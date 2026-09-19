/* F-B — Example Spec 期望值合同：从示例源码提取可比较的期望值，浏览器实测核对后写入
 * example.json 的 validationExpectations。
 *
 * 为什么需要：v11-examples-verify 的 material-property / transform-equals / asset-loaded
 * 过去只做"存在性/有限性"检查（示例级弱断言，总审查 item 2）。弱检查无法区分
 * "代码真的把颜色设成了蓝色" 与 "颜色设错了但材质存在"。收紧需要每例的期望值。
 *
 * 期望值来源纪律（防同义反复）：
 *   corroborated  — 值来自示例源码字面量（setPosition / setScale / setRotationFromEuler /
 *                   Material.initialize / setProperty / builtinResMgr.get），且运行期读到的值
 *                   与之一致 → 才写进规格（带 source + line 出处）。
 *   mismatch      — 源码字面量与运行期值不一致：这是真缺陷（或单位/空间换算），不写期望、
 *                   只报告，绝不把运行期值当"期望"回填冒充源码证明。
 *   unresolved    — 源码为循环/派生表达式，静态取不到字面量 → 报告为待人工著述缺口。
 *   dynamic       — 表达式随时间变化（Math.sin/t/dt）：写 {vary, range} 而不是写死一个采样值；
 *                   range 只在源码能取到振幅字面量时给出。
 *
 * 执行：
 *   node tools/examples/spec-expectations.cjs report            # 只读：静态提取 + 浏览器实测
 *   node tools/examples/spec-expectations.cjs apply [--ids=a,b] # 写入 corroborated 期望
 * 产出：output/spec-expectations-probe.json（证据）+ examples/<id>/example.json（apply）
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = path.resolve(__dirname, '..', '..');
const esbuild = require(path.join(REPO, 'node_modules', 'esbuild'));
const { BrowserRuntime } = require(path.join(REPO, 'tools', 'benchmark', 'runner', 'browser-runtime.cjs'));
const { codeLines } = require(path.join(__dirname, 'spec-evidence.cjs'));
const apiTrace = require(path.join(REPO, 'tools', 'verify', 'api-trace.cjs'));
const readback = require(path.join(REPO, 'tools', 'verify', 'runtime-readback.cjs'));

const OUT_PATH = path.join(REPO, 'output', 'spec-expectations-probe.json');
const APPLY_PATH = path.join(REPO, 'output', 'spec-expectations-apply.json');
const SETTLE_MS = 2200;
const TOL = 1e-3;
const TRACE_FILE = apiTrace.TRACE_FILE_NAME;
const TRANSFORM_KEYS = ['position', 'rotationEuler', 'scale'];
// 引擎默认的局部变换（未 setPosition/setRotationFromEuler/setScale 时的合同）。
const DEFAULT_TRANSFORM = { position: [0, 0, 0], rotationEuler: [0, 0, 0], scale: [1, 1, 1] };
const ASSET_RE = /['"]([\w@.\-/]+(?:\.[\w@.\-/]*)*\.(?:glb|gltf|png|jpg|jpeg|webp|bin|json|hdr|ktx2|basis))['"]/g;
const expChecks = require(path.join(REPO, 'tools', 'verify', 'expectation-checks.cjs'));

const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'examples', 'files.json'), 'utf8'));
const args = process.argv.slice(2);
const mode = args[0] || 'report';
const idsArg = args.find((a) => a.startsWith('--ids='));
const only = idsArg ? new Set(idsArg.slice(6).split(',')) : null;

const num = (s) => (/^-?\d+(\.\d+)?$/.test(s) || /^-\s*\d+(\.\d+)?$/.test(s)) ? Number(s.replace(/\s+/g, '')) : null;

/** 取源码括号参数：返回参数原文数组（未做完整解析，按逗号分层）。 */
function argsOf (line, after) {
  const at = line.indexOf(after);
  if (at < 0) { return null; }
  let i = line.indexOf('(', at + after.length);
  if (i < 0) { return null; }
  let depth = 0; const out = []; let cur = '';
  for (; i < line.length; i++) {
    const ch = line[i];
    if (ch === '(' || ch === '[' || ch === '{') { depth++; if (depth === 1) { continue; } }
    if (ch === ')' || ch === ']' || ch === '}') { depth--; if (depth === 0) { break; } }
    if (ch === ',' && depth === 1) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) { out.push(cur.trim()); }
  return out;
}

/** 解析一组数值参数（支持 new Vec3(a,b,c) / (a,b,c) / 单个标量）。非字面量返回 null。 */
function numbersOf (rawArgs) {
  if (!rawArgs || !rawArgs.length) { return null; }
  let items = rawArgs;
  const inner = /^new\s+\w+\s*\((.*)\)$/;
  if (items.length === 1) {
    const m = inner.exec(items[0]);
    if (m) { items = splitTop(m[1]); }
  }
  const out = [];
  for (const it of items) {
    const bare = it.replace(/\*\s*-1$/, '');
    const n = num(bare);
    if (n === null) { return null; }
    out.push(n * (/-1$/.test(bare) ? -1 : 1));
  }
  return out;
}

function splitTop (s) {
  const out = []; let depth = 0; let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[' || ch === '{') { depth++; }
    if (ch === ')' || ch === ']' || ch === '}') { depth--; }
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) { out.push(cur.trim()); }
  return out;
}

/** 表达式是否为"随时间变化"（Math.sin/cos、dt、t、performance、frame 计数）。 */
function isDynamic (raw) {
  return /\bMath\.(sin|cos|tan|random)\b|\bdt\b|\btime\b|\bthis\.t\b|\bperformance\b|\beulerAngles\b|\bframe\b|\btween\b/i.test(raw || '');
}
/** 从 sin/cos 表达式提取振幅：`Math.sin(t*2)*2.2` → 2.2。 */
function amplitudeOf (raw) {
  const m = /Math\.(?:sin|cos)\([^()]*\)\s*\*\s*(-?\d+(?:\.\d+)?)/.exec(raw || '')
    || /\*\s*(-?\d+(?:\.\d+)?)\s*\*\s*Math\.(?:sin|cos)/.exec(raw || '');
  return m ? Math.abs(Number(m[1])) : null;
}

/** shared/scene-kit.js 的默认机位/灯位：示例不传 opts 时期望值来自共享库字面量。 */
function sceneKitDefaults () {
  const file = path.join(REPO, 'examples', 'shared', 'scene-kit.js');
  if (!fs.existsSync(file)) { return {}; }
  const rawLines = codeLines(fs.readFileSync(file, 'utf8'));
  const out = {};
  rawLines.forEach((raw, i) => {
    const head = /export function (setupCamera|setupDirectionalLight)\s*\(/.exec(raw);
    if (!head) { return; }
    const start = i + 1;
    const grab = (key) => {
      for (let k = start; k < Math.min(start + 12, rawLines.length); k++) {
        const g = new RegExp(`${key}\\s*=\\s*\\[([^\\]]*)\\]`).exec(rawLines[k]);
        if (g) { const nums = numbersOf(splitTop(g[1])); if (nums) { return { nums, line: k + 1 }; } }
      }
      return null;
    };
    const pos = grab('position'); const rot = grab('rotationEuler');
    out[head[1]] = { position: pos && pos.nums, positionLine: pos && pos.line, rotationEuler: rot && rot.nums, rotationLine: rot && rot.line };
  });
  return out;
}
const SCENE_KIT = sceneKitDefaults();

// ---- 常量循环静态展开 --------------------------------------------------------
// `for (var i = 0; i < 3; i++)` / `for (var k of Object.keys(MAP))` 建出的节点在原文里只留下
// 变量名与含索引的表达式，主扫描一律 unresolved，整批节点级期望随之漏掉（示例只好整项豁免，
// 反被 vacuity 底线判红）。这里按迭代把"只用字面量、循环索引与循环内标量就能算出来"的实参
// 求值为字面量并复制循环体；任一实参算不出（外部变量、函数调用、对象字面量）就整段回退原文，
// 交主扫描照实记 unresolved。展开只为覆盖度，绝不为凑绿编造值。
function fmtNum (v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) { return null; }
  return String(Math.round(v * 1e6) / 1e6);
}

/** 受限常量求值：数字/字符串/模板字面量、env 变量、+ - * /、一元负、括号、MAP[key]、MAP[key][n]。 */
function evalConst (src, env, maps) {
  const s = String(src || '').trim();
  if (!s) { return null; }
  let pos = 0;
  const skip = () => { while (pos < s.length && /\s/.test(s[pos])) { pos++; } };
  function primary () {
    skip();
    if (pos >= s.length) { return null; }
    const c = s[pos];
    if (c === '(') { pos++; const v = sum(); skip(); if (s[pos] !== ')') { return null; } pos++; return v; }
    if (c === '-' || c === '+') { pos++; const v = primary(); return typeof v === 'number' ? (c === '-' ? -v : v) : null; }
    let m = /^\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/.exec(s.slice(pos));
    if (m) { pos += m[0].length; return Number(m[0]); }
    m = /^'([^']*)'/.exec(s.slice(pos));
    if (m) { pos += m[0].length; return m[1]; }
    if (c === '`') {
      const close = s.indexOf('`', pos + 1);
      if (close < 0) { return null; }
      const body = s.slice(pos + 1, close); pos = close + 1;
      let str = ''; let k = 0;
      for (;;) {
        const si = body.indexOf('${', k);
        if (si < 0) { str += body.slice(k); break; }
        str += body.slice(k, si);
        let d = 1; let j = si + 2;
        while (j < body.length && d > 0) { if (body[j] === '{') { d++; } else if (body[j] === '}') { d--; } j++; }
        if (d !== 0) { return null; }
        const part = evalConst(body.slice(si + 2, j - 1), env, maps);
        if (part === null) { return null; }
        str += String(part); k = j;
      }
      return str;
    }
    m = /^[A-Za-z_$][\w$]*/.exec(s.slice(pos));
    if (!m) { return null; }
    pos += m[0].length;
    let base = null;
    if (Object.prototype.hasOwnProperty.call(env, m[0])) { base = env[m[0]]; } else if (maps[m[0]]) { base = maps[m[0]]; } else { return null; }
    for (;;) {
      skip();
      if (s[pos] !== '[') { break; }
      const close = s.indexOf(']', pos);
      if (close < 0) { return null; }
      const key = evalConst(s.slice(pos + 1, close), env, maps);
      pos = close + 1;
      if (key === null || base === null || typeof base !== 'object') { return null; }
      base = base[key];
      if (base === undefined) { return null; }
    }
    return base;
  }
  function product () {
    let v = primary();
    if (v === null) { return null; }
    for (;;) {
      skip();
      const c = s[pos];
      if (c !== '*' && c !== '/') { break; }
      pos++; const r = primary();
      if (r === null || typeof v !== 'number' || typeof r !== 'number' || (c === '/' && r === 0)) { return null; }
      v = c === '*' ? v * r : v / r;
    }
    return v;
  }
  function sum () {
    let v = product();
    if (v === null) { return null; }
    for (;;) {
      skip();
      const c = s[pos];
      if (c !== '+' && c !== '-') { break; }
      if (s[pos + 1] === '=' || s[pos + 1] === c) { break; }
      pos++; const r = product();
      if (r === null) { return null; }
      if (typeof v === 'string' || typeof r === 'string') { if (c !== '+') { return null; } v = String(v) + String(r); } else { v = c === '+' ? v + r : v - r; }
    }
    return v;
  }
  const out = sum();
  skip();
  if (pos !== s.length || out === null) { return null; }
  return out;
}

/** 顶层字面量表：`var COLORS = { Red: [235,70,70,255], ... }`（值必须全为数值数组）。 */
function scanLiteralMaps (lines) {
  const maps = {};
  for (const line of lines) {
    const m = /^\s*(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*\{([^{}]*)\}\s*;?\s*$/.exec(line);
    if (!m || !String(m[2]).trim()) { continue; }
    const table = {}; let ok = true;
    for (const pair of splitTop(m[2])) {
      const kv = /^\s*'([^']+)'\s*:\s*\[([^\]]*)\]\s*$/.exec(pair) || /^\s*([A-Za-z_$][\w$]*)\s*:\s*\[([^\]]*)\]\s*$/.exec(pair);
      const nums = kv ? numbersOf(splitTop(kv[2])) : null;
      if (!kv || !nums) { ok = false; break; }
      table[kv[1]] = nums;
    }
    if (ok) { maps[m[1]] = table; }
  }
  return maps;
}

/** 把一次迭代可见的调用实参改写为字面量（内层优先）；算不出的实参原样保留。 */
function literalizeCalls (text, env, maps) {
  let res = ''; let i = 0;
  const re = /(?:new\s+)?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\(/g;
  while (i < text.length) {
    re.lastIndex = i;
    const m = re.exec(text);
    if (!m) { res += text.slice(i); break; }
    const open = m.index + m[0].length - 1;
    let d = 0; let j = open;
    for (; j < text.length; j++) { if (text[j] === '(') { d++; } else if (text[j] === ')') { d--; if (!d) { break; } } }
    if (d !== 0) { res += text.slice(i); break; }
    const inner = literalizeCalls(text.slice(open + 1, j), env, maps);
    const args = splitTop(inner);
    const lit = args.map((a) => { const v = evalConst(a, env, maps); return v === null ? null : (typeof v === 'number' ? fmtNum(v) : `'${v}'`); });
    res += text.slice(i, open + 1);
    res += (args.length && lit.every((v) => v !== null)) ? lit.join(', ') : inner;
    res += ')';
    i = j + 1;
  }
  return res;
}

/** 展开常量循环：返回 {lines, lineAt, origins, expanded}；origins[节点名] 记循环出处。 */
function unrollConstantLoops (lines, lineAt) {
  const maps = scanLiteralMaps(lines);
  const out = { lines: [], lineAt: [], origins: {}, expanded: [] };
  const scope = {};
  const braceDelta = (t) => (t.match(/\{/g) || []).length - (t.match(/\}/g) || []).length;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const push = (k) => { out.lines.push(lines[k]); out.lineAt.push(lineAt[k]); };
    let iters = null;
    let m = /^\s*for\s*\(\s*(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(-?\d+)\s*;\s*\1\s*(<|<=)\s*(-?\d+)\s*;\s*\1(?:\+\+|\+=1)\s*\)\s*\{?\s*$/.exec(line);
    if (m) {
      const list = [];
      for (let v = Number(m[2]); m[3] === '<' ? v < Number(m[4]) : v <= Number(m[4]); v++) { list.push(v); }
      if (list.length && list.length <= 16) { iters = list.map((v) => { const e = {}; e[m[1]] = v; return e; }); }
    }
    if (!iters) {
      m = /^\s*for\s*\(\s*(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s+of\s+Object\.keys\(\s*([A-Za-z_$][\w$]*)\s*\)\s*\)\s*\{?\s*$/.exec(line);
      if (m && maps[m[2]]) { iters = Object.keys(maps[m[2]]).map((k) => { const e = {}; e[m[1]] = k; return e; }); }
    }
    if (!iters) {
      const decl = /^\s*(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(-?\d+(?:\.\d+)?)\s*;?\s*$/.exec(line);
      if (decl) { scope[decl[1]] = Number(decl[2]); }
      push(li); continue;
    }
    // 循环节：花括号配平取体内各行；未正常收口（体内有字符串花括号等）则不展开。
    let depth = braceDelta(line); let end = li; const body = []; let closed = false; let separateClose = false;
    while (depth > 0 && end + 1 < lines.length) {
      end++;
      const text = lines[end]; const d = braceDelta(text);
      if (depth + d === 0 && /^\s*\}\s*;?\s*$/.test(text)) { depth = 0; separateClose = closed = true; break; } // 收尾行独占，不入体
      body.push({ text, at: lineAt[end] });
      depth += d;
      if (depth <= 0) { closed = true; break; }
    }
    const emitTail = () => { if (separateClose) { push(end); } };
    if (!closed || depth !== 0 || !body.length) {
      push(li);
      for (const b of body) { out.lines.push(b.text); out.lineAt.push(b.at); }
      emitTail(); li = end; continue;
    }
    const carried = Object.assign({}, scope);
    const copies = []; let ok = true;
    for (const it of iters) {
      const env = Object.assign({}, carried, it);
      const copy = [];
      for (const b of body) {
        const lit = literalizeCalls(b.text, env, maps);
        // 循环内标量累加（整行或行尾的 `x += 2.4`）要在迭代之间传递，否则每轮都拿到首轮的值。
        // 先按语句顺序完成本行的实参求值，再推进累加量。
        const mm = /(?:^|[;\s])([A-Za-z_$][\w$]*)\s*(\+=|-=)\s*(-?\d+(?:\.\d+)?)\s*;?\s*$/.exec(b.text);
        if (mm && typeof env[mm[1]] === 'number') {
          const step = Number(mm[3]);
          env[mm[1]] = carried[mm[1]] = mm[2] === '+=' ? env[mm[1]] + step : env[mm[1]] - step;
        }
        if (/\$\{/.test(b.text) && lit === b.text) { ok = false; break; }
        copy.push({ text: lit, at: b.at });
        const nm = /new\s+Node\s*\(\s*'([^']+)'\s*\)/.exec(lit);
        if (nm) {
          out.origins[nm[1]] = { source: 'src/main.ts', line: lineAt[li], text: `常量循环 ${line.trim().slice(0, 48)} 按 ${Object.entries(it).map(([k, v]) => `${k}=${v}`).join(',')} 展开（体内 L${b.at}）` };
        }
      }
      if (!ok) { break; }
      copies.push(copy);
    }
    if (!ok || copies.length !== iters.length) {   // 回退：原文照抄，主扫描照实记 unresolved
      push(li);
      for (const b of body) { out.lines.push(b.text); out.lineAt.push(b.at); }
      emitTail(); li = end; continue;
    }
    push(li);
    for (const copy of copies) { for (const b of copy) { out.lines.push(b.text); out.lineAt.push(b.at); } }
    emitTail();
    out.expanded.push({ line: lineAt[li], iterations: copies.length, nodes: Object.keys(out.origins).length });
    li = end;
  }
  return out;
}


/** 静态提取：节点变换 / 渲染器材质 / 未决项。 */
function extractFromSource (text) {
  const rawLines = codeLines(text);
  // 逻辑行：把括号未闭合的续行并成一行（多行 setupCamera(scene, { ... }) 调用很常见）
  const lines = []; const lineAt = [];
  let buf = ''; let bufStart = 0; let depth = 0;
  rawLines.forEach((raw, i) => {
    if (!buf && !raw.trim()) { return; }
    if (!buf) { bufStart = i + 1; } // 出处必须指逻辑行的起始物理行，而非收尾的 }); 
    buf += (buf ? ' ' : '') + raw.trim();
    depth += (raw.match(/[([]/g) || []).length - (raw.match(/[)\]]/g) || []).length;
    if (depth > 0) { return; }
    lines.push(buf); lineAt.push(bufStart || i + 1); buf = ''; depth = 0; bufStart = 0;
  });
  if (buf) { lines.push(buf); lineAt.push(bufStart || rawLines.length); }
  // 常量循环先展开，后续各扫描规则看到的就是逐迭代的字面量语句（出处仍指真实行号）。
  const unrolled = unrollConstantLoops(lines, lineAt);
  lines.length = 0; Array.prototype.push.apply(lines, unrolled.lines);
  lineAt.length = 0; Array.prototype.push.apply(lineAt, unrolled.lineAt);
  const nodeVar = {};          // var -> node name（仅可静态确定的）
  const nodeLines = {};        // node name -> 创建行（未赋变换时的出处）
  const rendererOwner = {};    // renderer var -> node var
  const materialInfo = {};     // material var -> {effectName, props:{name: rawLiteral}}
  const transforms = {};       // node name -> {position|rotationEuler|scale, provenance}
  const dynamics = {};         // node name -> [{axis, amplitude}]
  const rendererExpect = {};   // node name -> {effectName|builtin, props}
  const unresolved = [];
  const componentClass = {};   // class var -> node name（this.node 归属）
  const addComponentClasses = {}; // 记录 class 名，稍后与 addComponent(C) 配对
  let cameraVar = null;
  let cameraFramed = null;
  let cameraAimed = null;
  // 材质工厂的 effectName（`function materialWith(color){ … initialize({effectName:'builtin-standard'}) }`）：
  // 主扫描按 var 作用域解析材质，拿不到"工厂返回的变量"，先扫一遍函数体把 effect 名登记出来。
  const helperEffect = {};
  {
    let fn = null;
    lines.forEach((line) => {
      const d = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(line);
      if (d) { fn = d[1]; return; }
      if (!fn) { return; }
      if (/^\}/.test(line)) { fn = null; return; }
      const e = /effectName\s*:\s*'([^']+)'/.exec(line);
      if (e && !helperEffect[fn]) { helperEffect[fn] = e[1]; }
    });
  }

  lines.forEach((raw, i) => {
    const line = raw; const at = lineAt[i];
    if (!line.trim()) { return; }
    let m;
    // class X extends Component
    if ((m = /^\s*class\s+(\w+)\s+extends\s+Component\b/.exec(line))) { addComponentClasses[m[1]] = true; }
    // shared scene-kit：setupCamera/setupDirectionalLight 调用点即机位期望值出处
    if ((m = /(?:const|var|let)?\s*(?:([A-Za-z_$][\w$]*)\s*=\s*)?setup(Camera|DirectionalLight)\s*\(/.exec(line))) {
      const kind = m[2] === 'Camera' ? 'Main Camera' : 'Main Light';
      const objArgs = argsOf(line, 'setup' + m[2]) || [];
      const opts = objArgs[1] || '';
      const grab = (key) => { const g = new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`).exec(opts); return g ? numbersOf(splitTop(g[1])) : null; };
      const pos = grab('position'); const rot = grab('rotationEuler'); const look = grab('lookAt');
      const def = SCENE_KIT['setup' + m[2]] || {};
      const entry = transforms[kind] = transforms[kind] || {};
      const prov = (vals, srcLine, keyName) => {
        (entry.provenance = entry.provenance || []).push({ source: srcLine === null ? 'src/main.ts' : 'examples/shared/scene-kit.js',
          line: typeof srcLine === 'number' ? srcLine : at, text: `${keyName} 默认值 ${JSON.stringify(vals)}（${srcLine === null ? '示例显式传入' : 'shared 形参默认值'}）` });
      };
      if (pos) { entry.position = pos; prov(pos, null, 'position'); }
      else if (def.position) { entry.position = def.position; prov(def.position, def.positionLine, 'position'); }
      if (rot && !look) { entry.rotationEuler = rot; prov(rot, null, 'rotationEuler'); }
      else if (!rot && !look && def.rotationEuler) { entry.rotationEuler = def.rotationEuler; prov(def.rotationEuler, def.rotationLine, 'rotationEuler'); }
      if (look) { entry.lookAt = look; entry.lookAtLine = at; }
      if (pos || rot || look) {
        (entry.provenance = entry.provenance || []).push({ source: 'src/main.ts', line: at, text: `setup${m[2]}(...): shared/scene-kit.js 建节点`, via: 'shared-scene-kit' });
      }
      if (m[1]) { cameraVar = m[1]; }
    }
    if (/\bframeObject\s*\(/.test(line) && cameraVar && line.includes(cameraVar) && !cameraFramed) { cameraFramed = { at, text: line.trim().slice(0, 110) }; }
    if (cameraVar && new RegExp(`${cameraVar}\\.node\\.`).test(line) && !cameraFramed) { cameraFramed = { at, text: line.trim().slice(0, 110) }; }
    if ((m = /\b([A-Za-z_$][\w$]*)\.lookAt\s*\(/.exec(line)) && nodeVar[m[1]] === 'Main Camera' && !cameraAimed) { cameraAimed = { at, text: line.trim().slice(0, 110) }; }
    // var v = new Node('Name')  /  var v: any = ...
    if ((m = /\b(?:var|let|const)?\s*([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*new\s+Node\s*\(/.exec(line))) {
      const nameArgs = argsOf(line, 'new Node');
      const literal = nameArgs && /^'([^']*)'$/.exec(nameArgs[0] || '');
      if (literal) { nodeVar[m[1]] = literal[1]; if (nodeLines[literal[1]] === undefined) { nodeLines[literal[1]] = at; } } else { nodeVar[m[1]] = null; unresolved.push({ line: at, reason: `node name not a literal: ${line.trim().slice(0, 60)}` }); }
    }
    // var r = v.addComponent(MeshRenderer|SkinnedMeshRenderer)
    if ((m = /\b([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\.addComponent\s*\(\s*(MeshRenderer|SkinnedMeshRenderer)\b/.exec(line))) {
      rendererOwner[m[1]] = m[2];
    }
    // var c = v.addComponent(Camera) → c 的变换改写属于运行期派生（frameObject/lookAt）
    if ((m = /\b([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\.addComponent\s*\(\s*Camera\b/.exec(line))) {
      if (!cameraVar) { cameraVar = m[1]; }
    }
    // v.addComponent(SomeClass) → this.node 归属
    if ((m = /([A-Za-z_$][\w$]*)\.addComponent\s*\(\s*([A-Z][\w$]*)\s*\)/.exec(line))) {
      if (addComponentClasses[m[2]] && nodeVar[m[1]]) { componentClass[m[2]] = nodeVar[m[1]]; }
    }
    // var mat = new Material() / mat.initialize({...}) / mat.setProperty(name, value)
    if ((m = /\b([A-Za-z_$][\w$]*)\s*=\s*new\s+Material\s*\(/.exec(line))) { materialInfo[m[1]] = materialInfo[m[1]] || { props: {} }; }
    // var mat = materialWith(new Color(a,b,c,d))：工厂返回的局部变量也要能绑到节点（两跳赋值）。
    if ((m = /(^|[^.\w])([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*\(\s*new\s+Color\(([^)]*)\)\s*\)\s*;?\s*$/.exec(line)) && helperEffect[m[3]]) {
      const nums = numbersOf(splitTop(m[4]));
      materialInfo[m[2]] = {
        effectName: helperEffect[m[3]],
        props: nums ? { mainColor: { raw: `new Color(${m[4]})`, numbers: nums, line: at } } : {},
      };
    }
    if ((m = /\b([A-Za-z_$][\w$]*)\.initialize\s*\(/.exec(line))) {
      const obj = /\{\s*([^}]*)\}/.exec(line.slice(line.indexOf('initialize')));
      const info = materialInfo[m[1]] = materialInfo[m[1]] || { props: {} };
      if (obj) {
        const em = /effectName\s*:\s*'([^']+)'/.exec(obj[1]); if (em) { info.effectName = em[1]; }
        const bm = /builtinName\s*:\s*'([^']+)'/.exec(obj[1]); if (bm) { info.builtinName = bm[1]; }
      }
    }
    if ((m = /\b([A-Za-z_$][\w$]*)\.setProperty\s*\(\s*'([^']+)'\s*,\s*(.+)$/.exec(line))) {
      const info = materialInfo[m[1]] = materialInfo[m[1]] || { props: {} };
      const valueArgs = argsOf(line, 'setProperty');
      const rawValue = valueArgs ? valueArgs.slice(1).join(',') : '';
      const lit = numbersOf(valueArgs ? (valueArgs[1] ? [valueArgs[1]] : []) : []);
      const colorLit = /^new\s+Color\((.*)\)$/.exec((valueArgs || [])[1] || '');
      info.props[m[2]] = {
        raw: rawValue.trim().slice(0, 120),
        numbers: lit || (colorLit ? numbersOf(splitTop(colorLit[1])) : null),
        dynamic: isDynamic(rawValue),
        line: at,
      };
    }
    // renderer.material = <expr>
    if ((m = /\b([A-Za-z_$][\w$]*)\.material\s*=\s*(.+)$/.exec(line))) {
      const owner = rendererOwner[m[1]];
      const node = owner && nodeVar[owner];
      const rhs = m[2].replace(/;\s*$/, '').trim();
      const builtin = /builtinResMgr\.get\(\s*'([^']+)'/.exec(rhs);
      const matVar = /^([A-Za-z_$][\w$]*)$/.exec(rhs);
      const helper = /^materialWith\s*\(\s*new\s+Color\(([^)]*)\)\s*\)$/.exec(rhs);
      const entry = rendererExpect[node || `unresolved:${m[1]}`] = rendererExpect[node || `unresolved:${m[1]}`] || { props: {} };
      if (!node) { unresolved.push({ line: at, reason: `renderer material without static node: ${rhs.slice(0, 50)}` }); }
      if (builtin) { entry.builtin = builtin[1]; } else if (matVar && materialInfo[matVar[1]]) {
        entry.effectName = materialInfo[matVar[1]].effectName; Object.assign(entry.props, materialInfo[matVar[1]].props);
      } else if (helper) { entry.effectName = entry.effectName || 'builtin-standard'; entry.props.mainColor = { raw: `new Color(${helper[1]})`, numbers: numbersOf(splitTop(helper[1])), line: at }; } else {
        unresolved.push({ line: at, reason: `material expression not statically resolvable: ${rhs.slice(0, 60)}` });
      }
    }
    // 变换：setPosition / setRotationFromEuler / setScale（class 体内的 this.node 在第二遍处理）
    for (const [method, key] of [['setPosition', 'position'], ['setRotationFromEuler', 'rotationEuler'], ['setScale', 'scale']]) {
      if ((m = new RegExp(`\\b([A-Za-z_$][\\w$]*)\\.${method}\\s*\\(`).exec(line))) {
        const recv = m[1];
        // `node.setPosition(...)` 在组件体内多是 this.node 的别名；但 `var node = new Node('X')`
        // 之后就是真节点（循环建节点的常见写法），要按绑定结果处理，不能一律跳过。
        if (recv === 'this' || /\bthis\.node\./.test(line) || (recv === 'node' && !nodeVar[recv])) { continue; }
        const node = nodeVar[recv];
        const rawArgs = argsOf(line, method) || [];
        const inside = rawArgs.join(',');
        const nums = numbersOf(rawArgs);
        if (!node) { unresolved.push({ line: at, reason: `${method} receiver "${recv}" not statically bound to a node` }); continue; }
        if (nums) {
          transforms[node] = transforms[node] || {};
          transforms[node][key] = nums;
          transforms[node].provenance = transforms[node].provenance || [];
          transforms[node].provenance.push({ source: 'src/main.ts', line: at, text: line.trim().slice(0, 90) });
        } else if (isDynamic(inside)) {
          dynamics[node] = dynamics[node] || [];
          dynamics[node].push({ method: key, raw: inside.slice(0, 120), amplitude: amplitudeOf(inside), line: at });
        } else {
          unresolved.push({ line: at, reason: `${method}(${node}) not a numeric literal: ${inside.slice(0, 60)}` });
        }
      }
    }
  });

  // class C extends Component 体内的 this.node.setPosition(...)：归属到 addComponent(C) 的节点
  let activeClass = null;
  let braceDepth = 0;
  lines.forEach((line, i) => {
    const m = /^\s*class\s+(\w+)\s+extends\s+Component\b/.exec(line);
    if (m) { activeClass = m[1]; braceDepth = 0; }
    if (activeClass) {
      braceDepth += (line.match(/[{(]/g) || []).length - (line.match(/[})]/g) || []).length;
      if (braceDepth <= 0 && i > 0 && /}/.test(line) && !/[{(]/.test(line)) { activeClass = null; }
    }
    if (!activeClass || !componentClass[activeClass]) { return; }
    for (const [method, key] of [['setPosition', 'position'], ['setRotationFromEuler', 'rotationEuler'], ['setScale', 'scale']]) {
      if (!new RegExp(`this\\.node\\.${method}\\s*\\(`).test(line)) { continue; }
      const node = componentClass[activeClass];
      const rawArgs = argsOf(line, method) || [];
      const nums = numbersOf(rawArgs);
      if (nums) {
        transforms[node] = transforms[node] || {};
        transforms[node][key] = nums;
        (transforms[node].provenance = transforms[node].provenance || []).push({ source: 'src/main.ts', line: lineAt[i], text: `${activeClass}: ${line.trim().slice(0, 70)}` });
      } else {
        dynamics[node] = dynamics[node] || [];
        dynamics[node].push({ method: key, raw: rawArgs.join(',').slice(0, 120), amplitude: amplitudeOf(rawArgs.join(',')), line: lineAt[i], from: activeClass });
      }
    }
  });

  // 工厂函数建模：主扫描只认 `new Node('Lit')`，工厂（`function boxNode(name, parent, x,y,z, …)`）
  // 建出的节点会整批漏掉，节点变换/材质期望只能记成缺口。这里按形参位置把调用点的字面量参数
  // 映射回节点名，出处写调用行（不写运行期值）。解析不出的一律留空，不猜。
  const helperDefs = {};
  let fnName = null;
  const paramIndex = (params, tok) => params.indexOf(String(tok || '').trim());
  lines.forEach((line, idx) => {
    const at = lineAt[idx];
    const def0 = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/.exec(line);
    if (def0) {
      fnName = def0[1];
      helperDefs[fnName] = { line: at, params: splitTop(def0[2]).map((p) => (p.split(':')[0] || '').trim()).filter(Boolean), sets: {}, nameParam: null };
      return;
    }
    if (!fnName) { return; }
    if (/^\}/.test(line)) { fnName = null; return; }
    const def = helperDefs[fnName];
    let m = /new\s+Node\s*\(\s*([^)]*)\)/.exec(line);
    if (m && paramIndex(def.params, m[1]) >= 0) { def.nameParam = paramIndex(def.params, m[1]); }
    m = /effectName\s*:\s*'([^']+)'/.exec(line);
    if (m) { def.effectName = m[1]; }
    for (const [method, key] of [['setPosition', 'position'], ['setRotationFromEuler', 'rotationEuler'], ['setScale', 'scale']]) {
      if (!new RegExp(`\\.\\s*${method}\\s*\\(`).test(line)) { continue; }
      const rawArgs = argsOf(line, method) || [];
      const one = rawArgs.length === 1 ? /^new\s+\w+\s*\((.*)\)$/.exec(rawArgs[0]) : null;
      const items = one ? splitTop(one[1]) : rawArgs;
      const slots = items.map((it) => {
        const k = paramIndex(def.params, it);
        return { param: k >= 0 ? k : null, lit: k >= 0 ? null : num(it.replace(/\*\s*-1$/, '')) };
      });
      if (slots.length === 3 && slots.every((s) => s.param !== null || s.lit !== null)) { def.sets[key] = { slots, line: at }; }
    }
    m = /\.material\s*=\s*([A-Za-z_$][\w$]*)\s*\(\s*([^)]*)\)\s*;?\s*$/.exec(line);
    if (m && paramIndex(def.params, m[2]) >= 0) { def.colorHelper = m[1]; def.colorParam = paramIndex(def.params, m[2]); }
    // 工厂内直接取内建材质（`renderer.material = builtinResMgr.get('builtin-X-material')`）：
    // 主扫描只认 `new Node('Lit')` 归属，工厂建出的节点材质要按调用点名字回填。
    m = /\.material\s*=\s*builtinResMgr\.get\(\s*'([^']+)'\s*\)\s*;?\s*$/.exec(line);
    if (m) { def.builtinName = m[1]; }
  });
  lines.forEach((line, idx) => {
    const at = lineAt[idx];
    for (const [hName, def] of Object.entries(helperDefs)) {
      if (def.nameParam === null || def.nameParam === undefined) { continue; }
      if (!new RegExp(`\\b${hName}\\s*\\(`).test(line) || new RegExp(`function\\s+${hName}\\b`).test(line)) { continue; }
      const callArgs = argsOf(line, hName) || [];
      const lit = /^'([^']*)'$/.exec(String(callArgs[def.nameParam] || '').trim());
      if (!lit) { continue; }
      const node = lit[1];
      // 工厂建出的节点也有创建点：未赋局部变换时，"引擎默认 identity"合同需要出处行号（调用行）。
      if (nodeLines[node] === undefined) { nodeLines[node] = at; }
      for (const [key, s] of Object.entries(def.sets)) {
        const vals = s.slots.map((slot) => slot.param !== null
          ? num(String(callArgs[slot.param] || '').replace(/\*\s*-1$/, '')) : slot.lit);
        if (vals.length !== 3 || vals.some((v) => v === null)) { continue; }
        transforms[node] = transforms[node] || {};
        transforms[node][key] = vals;
        (transforms[node].provenance = transforms[node].provenance || [])
          .push({ source: 'src/main.ts', line: at, text: `${hName}(${node}) → ${key} ${JSON.stringify(vals)}（工厂形参见 L${s.line}）` });
      }
      if (def.builtinName && !rendererExpect[node]) {
        const entry = rendererExpect[node] = { props: {}, builtin: def.builtinName };
        entry.provenance = [{ source: 'src/main.ts', line: at, text: `${hName}(${node}) → builtinResMgr.get('${def.builtinName}')（工厂体见 L${def.line}）` }];
      }
      if (def.colorParam !== null && def.colorParam !== undefined) {
        const colorTok = String(callArgs[def.colorParam] || '').trim();
        const cm = /^new\s+Color\((.*)\)$/.exec(colorTok);
        const nums = cm ? numbersOf(splitTop(cm[1])) : null;
        if (nums) {
          const entry = rendererExpect[node] = rendererExpect[node] || { props: {} };
          const inner = def.colorHelper ? helperDefs[def.colorHelper] : null;
          entry.effectName = entry.effectName || (inner && inner.effectName) || def.effectName || null;
          entry.props.mainColor = { raw: colorTok.slice(0, 110), numbers: nums, line: at };
        }
      }
    }
  });

  // 补间链端点：`tween(cube).to(1.2, { position: new Vec3(3,0,0) })` 的目标是源码字面量，
  // 该轴的真实合同是「在端点张成的区间内 + 两次采样确实在动」，不是某个中途瞬时值。
  const tweenTargets = {};
  let tweenNode = null;
  lines.forEach((line, idx) => {
    const t = /\btween\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/.exec(line);
    if (t) { tweenNode = nodeVar[t[1]] || null; return; }
    if (!tweenNode) { return; }
    const m = /\.to\s*\(\s*[\d.]+\s*,\s*\{([^{}]*)\}/.exec(line);
    if (!m) { return; }
    for (const [prop, key] of [['position', 'position'], ['scale', 'scale'], ['eulerAngles', 'rotationEuler']]) {
      const g = new RegExp(`${prop}\\s*:\\s*new\\s+\\w+\\(([^)]*)\\)`).exec(m[1]);
      const nums = g ? numbersOf(splitTop(g[1])) : null;
      if (!nums || nums.length !== 3) { continue; }
      const bucket = tweenTargets[tweenNode] = tweenTargets[tweenNode] || {};
      (bucket[key] = bucket[key] || []).push({ nums, line: lineAt[idx] });
    }
  });

  // frameObject / lookAt 会在运行期改写机位：被改写的分量不是静态字面量期望，如实标 derived 不著述。
  const derived = [];
  const cam = transforms['Main Camera'];
  if (cameraFramed) {
    derived.push({ node: 'Main Camera', keys: ['position', 'rotationEuler'], reason: 'frameObject 依包围盒运行期改写机位', line: cameraFramed.at, text: cameraFramed.text });
    if (cam) { delete transforms['Main Camera']; }
  } else if (cameraAimed) {
    derived.push({ node: 'Main Camera', keys: ['rotationEuler'], reason: 'lookAt 派生朝向', line: cameraAimed.at, text: cameraAimed.text });
    if (cam) { delete cam.rotationEuler; delete cam.lookAt; }
  } else if (cam && cam.lookAt) {
    derived.push({ node: 'Main Camera', keys: ['rotationEuler'], reason: 'setupCamera({lookAt}) 派生朝向', line: cam.lookAtLine, text: 'setupCamera(..., { lookAt: [...] })' });
    delete cam.rotationEuler;
    delete cam.lookAt;
  }

  // 循环展开的节点：期望值出自"常量循环第 k 次迭代"，把循环头一并记进出处，便于复核。
  for (const [node, origin] of Object.entries(unrolled.origins)) {
    const t = transforms[node];
    if (t && t.provenance && !t.provenance.some((p) => p.line === origin.line)) { t.provenance.push(origin); }
  }

  return { nodeVar, nodeLines, transforms, dynamics, rendererExpect, unresolved, derived, tweenTargets, loops: unrolled.expanded };
}

/** 页面侧读取：逐节点变换 + 渲染器材质（含 getProperty 数值）+ 资产计数。 */
async function readRuntime (page, propertyNames) {
  return readback.readScene(page, propertyNames);
}

function nearly (a, b, tol) { return readback.nearly(a, b, tol === undefined ? TOL : tol); }

/** URL 解码仅用于路径比对；非法转义（文件名里的裸 %）按原文处理。 */
function safeDecode (url) { try { return decodeURIComponent(url); } catch (e) { return url; } }

function copyTree (from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name); const dst = path.join(to, entry.name);
    if (entry.isDirectory()) { copyTree(src, dst); } else { fs.copyFileSync(src, dst); }
  }
}

async function probeExample (example) {
  const exampleDir = path.join(REPO, 'examples', example.dir);
  const specFile = path.join(exampleDir, 'example.json');
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  const srcFile = ['src/main.ts', 'src/main.js', 'main.ts', 'main.js'].map((r) => path.join(exampleDir, r)).find((p) => fs.existsSync(p));
  const staticOut = srcFile ? extractFromSource(fs.readFileSync(srcFile, 'utf8')) : { transforms: {}, dynamics: {}, rendererExpect: {}, unresolved: [{ reason: 'no entry source found' }], derived: [], nodeLines: {} };
  const propNames = [...new Set(Object.values(staticOut.rendererExpect).flatMap((r) => Object.keys(r.props || {})))];
  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-exp-'));
  const workspace = path.join(workRoot, 'workspace');
  const runtime = new BrowserRuntime({ esbuild, repo: REPO });
  try {
    copyTree(exampleDir, workspace);
    const sharedSrc = path.join(REPO, 'examples', 'shared');
    if (fs.existsSync(path.join(sharedSrc, 'scene-kit.js'))) { copyTree(sharedSrc, path.join(workspace, 'shared')); }
    for (const rel of ['main.ts', 'main.js', 'src/main.ts', 'src/main.js']) {
      const file = path.join(workspace, rel);
      if (!fs.existsSync(file)) { continue; }
      const depth = path.relative(workspace, path.dirname(file)).split(path.sep).filter(Boolean).length;
      const code = fs.readFileSync(file, 'utf8');
      const fixed = code.replace(/(\.\.\/)+shared\//g, './' + '../'.repeat(depth) + 'shared/');
      if (fixed !== code) { fs.writeFileSync(file, fixed); }
    }
    const allUnits = apiTrace.claimedUnits(manifest.examples, (ex) => JSON.parse(fs.readFileSync(path.join(REPO, 'examples', ex.dir, 'example.json'), 'utf8')));
    const traced = apiTrace.writeTraceWorkspace(workspace, allUnits);
    const htmlPath = path.join(workspace, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace('"/build/cocosair.module.js"', `"./${TRACE_FILE}"`);
    if (!html.includes('__bench-prelude')) { html = html.replace('</body>', '<script src="/__bench-prelude.js"></script></body>'); }
    fs.writeFileSync(htmlPath, html);
    const channel = await runtime.start({ paths: { workspace } });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const first = await readRuntime(runtime.page, propNames);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const second = await readRuntime(runtime.page, propNames);
    const report = await channel.inspect({ kind: 'inspectAsset' });
    const resources = (await runtime.page.evaluate(() => performance.getEntriesByType('resource')
      .map((e) => ({ url: e.name, status: e.responseStatus || 0, size: e.transferSize || 0 }))))
      .map((r) => ({ ...r, decoded: safeDecode(r.url.split('?')[0]) }));
    const traceRaw = await runtime.page.evaluate(apiTrace.snapshotInPage);
    const graph = (spec.scene && spec.scene.expectedGraph && spec.scene.expectedGraph.nodes) || [];
    const trace = apiTrace.normalizeTrace(traceRaw, apiTrace.claimedUnits([example], () => spec));

    // 逐节点比对
    const byName = new Map(first.nodes.map((n) => [n.name, n]));
    const byName2 = new Map(second.nodes.map((n) => [n.name, n]));
    const rows = [];
    for (const name of graph) {
      // 引擎会给同名节点加 `__id` 后缀时按前缀回退；注意别把 `a || b ? c : d` 写成一体（优先级会把命中项丢掉）
      const suffixHit = [...byName.keys()].find((k) => k.startsWith(name + '__'));
      const runtimeNode = byName.get(name) || (suffixHit ? byName.get(suffixHit) : undefined);
      const secondName = runtimeNode ? runtimeNode.name : null;
      const runtimeSecond = secondName ? (byName2.get(secondName) || null) : null;
      const st = staticOut.transforms[name];
      const dyn = staticOut.dynamics[name];
      const rt = staticOut.rendererExpect[name];
      const row = { node: name, present: !!runtimeNode };
      if (runtimeNode) {
        row.runtime = { position: runtimeNode.position, rotationEuler: runtimeNode.rotationEuler, scale: runtimeNode.scale, renderers: runtimeNode.renderers };
        if (runtimeSecond) {
          row.runtimeSecond = { position: runtimeSecond.position, rotationEuler: runtimeSecond.rotationEuler, scale: runtimeSecond.scale };
        }
        if (st) {
          const ok = ['position', 'rotationEuler', 'scale'].every((k) => !st[k] || nearly(runtimeNode[k], st[k]));
          row.transform = { expected: st, verdict: ok ? 'corroborated' : 'mismatch' };
        } else if (dyn) {
          const varied = ['position', 'rotationEuler', 'scale'].map((k) => ({ k, varied: !runtimeSecond || JSON.stringify(runtimeNode[k]) !== JSON.stringify(runtimeSecond[k]) }));
          row.dynamic = { from: dyn, samples: [runtimeNode.position, runtimeNode.rotationEuler, runtimeNode.scale], varied: varied.filter((v) => v.varied).map((v) => v.k) };
        } else {
          row.transform = { verdict: 'unresolved' };
        }
        if (rt) {
          const obs = runtimeNode.renderers[0] || {};
          const mat = obs.material || {};
          const nameHit = !rt.builtin || ((mat.name || '') + (mat.effect || '')).includes(rt.builtin.replace('-material', ''));
          const effHit = !rt.effectName || (mat.effect || '') === rt.effectName || (mat.name || '').includes(rt.effectName);
          const props = {};
          for (const [pn, pv] of Object.entries(rt.props || {})) {
            const got = mat.props ? mat.props[pn] : null;
            props[pn] = { expected255: pv.numbers, runtime: got, verdict: !pv.numbers || !got ? 'unresolved' : (nearly(got, pv.numbers) ? 'corroborated-raw' : (nearly(got, pv.numbers.map((v) => v / 255), 2e-3) ? 'corroborated-normalized' : 'mismatch')) };
          }
          row.material = { declared: rt, observed: mat, effectOk: effHit, builtinOk: nameHit, props, verdict: (effHit || nameHit) ? 'corroborated' : 'mismatch' };
        }
      } else {
        row.present = false;
      }
      rows.push(row);
    }
    return {
      id: example.id, traced, graph, rows,
      staticOut: { transforms: staticOut.transforms, dynamics: staticOut.dynamics, rendererExpect: staticOut.rendererExpect, derived: staticOut.derived, nodeLines: staticOut.nodeLines, tweenTargets: staticOut.tweenTargets },
      resources, assetReport: report && { counts: report.counts, diagnostics: report.diagnostics },
      runtimeNodes: first.nodes.map((n) => n.name), runtimeReadError: first.error || null,
      unresolved: staticOut.unresolved, assetCounts: report && report.counts || null,
      traceExecuted: trace.units, pageErrors: runtime.pageErrors.slice(0, 3),
    };
  } finally {
    await runtime.stop().catch(() => {});
    fs.rmSync(workRoot, { recursive: true, force: true });
  }
}

/** 从源码/规格中挑出资产候选路径（含引用行出处），只认源码字面量。 */
function sourceAssetCandidates (srcText) {
  const out = new Map();
  if (!srcText) { return out; }
  codeLines(srcText).forEach((raw, i) => {
    if (/^\s*(?:\/\/|\*|\/\*)/.test(raw)) { return; }
    let m;
    ASSET_RE.lastIndex = 0;
    while ((m = ASSET_RE.exec(raw))) {
      const rel = m[1].replace(/^\.?\//, '');
      if (!out.has(rel)) { out.set(rel, { source: 'src/main.ts', line: i + 1, text: raw.trim().slice(0, 110) }); }
    }
  });
  return out;
}

/** 源码正弦包络：把槽位里的 Math.sin/cos(...) 调用当作变量 S∈[-1,1]，其余部分必须全是
 *  字面量算术（不含其它标识符）才推得出区间；每槽至多一次三角调用（S² 一类非单调式不猜）。
 *  取不到区间就返回 null，由调用方如实降级为 bare vary —— 绝不拿运行期值反推区间。 */
function envelopeOf (raw) {
  const slots = splitTop(String(raw || ''));
  if (slots.length !== 3) { return null; }
  const range = [];
  for (const slot of slots) {
    let expr = String(slot); let calls = 0;
    for (;;) {
      const m = /Math\.(?:sin|cos|tan)\s*\(/.exec(expr);
      if (!m) { break; }
      let j = m.index + m[0].length; let depth = 1;
      while (j < expr.length && depth > 0) {
        if (expr[j] === '(') { depth++; } else if (expr[j] === ')') { depth--; }
        j++;
      }
      if (depth !== 0) { return null; }
      expr = expr.slice(0, m.index) + '(S)' + expr.slice(j);
      calls++;
    }
    if (calls > 1 || (calls > 0 && expr.indexOf('/') >= 0)) { return null; }
    const a = evalConst(expr, { S: -1 }, {});
    const b = evalConst(expr, { S: 1 }, {});
    if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) { return null; }
    range.push([Math.min(a, b), Math.max(a, b)]);
  }
  return range;
}

/** transform-equals 著述：源码字面量精确值（运行期已核实）+ 源码动态轴（vary）。
 *  mismatch 一律不回填——运行期值不能冒充"源码期望"。 */
function authorTransforms (probe, srcText, hasInteractionSteps) {
  const exp = {}; const gaps = []; const infos = []; const exclusions = {};
  const T = (probe.staticOut || {}).transforms || {};
  const D = (probe.staticOut || {}).dynamics || {};
  const NL = (probe.staticOut || {}).nodeLines || {};
  for (const d of (probe.staticOut || {}).derived || []) {
    if (!d || !d.node || !d.line) { continue; }
    exclusions[d.node] = { reason: `运行期派生：${d.reason}（${(d.text || '').slice(0, 60)}）`, line: `L${d.line}`, auto: true };
  }
  const animatesInSource = /\btween\s*\(|update\s*\(\s*dt|Math\.(sin|cos)|performance/i.test(srcText || '');
  const TW = (probe.staticOut || {}).tweenTargets || {};
  /** 补间端点张成的区间合同：源码端点（含初值）逐轴取 min/max，运行期须落在区间内且两次采样真的动。
   *  源码取不到端点时返回 null —— 只剩初值会把区间退化为一个点，那不是补间合同而是伪造约束。 */
  const sweepOf = (name, key, initial) => {
    const tg = ((TW[name] || {})[key]) || [];
    if (!tg.length) { return null; }
    const all = tg.map((v) => v.nums).concat(initial ? [initial] : []);
    return {
      vary: true,
      range: [0, 1, 2].map((i) => [Math.min.apply(null, all.map((a) => a[i])), Math.max.apply(null, all.map((a) => a[i]))]),
      minDelta: 1e-4,
    };
  };
  const sweepProv = (name, key) => {
    const tg = (((TW[name] || {})[key]) || [])[0];
    return tg ? { source: 'src/main.ts', line: tg.line, text: `补间端点 L${tg.line}（同轴全部端点见源码 tween 链）` } : null;
  };
  for (const row of probe.rows) {
    const name = row.node;
    if (!row.present) { gaps.push({ validator: 'transform-equals', node: name, reason: 'node absent at readback' }); continue; }
    const st = T[name] || {};
    const dynList = D[name] || [];
    const entry = {};
    for (const key of TRANSFORM_KEYS) {
      const tol = key === 'rotationEuler' ? 1e-2 : 1e-3;
      const dyn = dynList.find((d) => d.method === key);
      const lit = st[key];
      if (dyn) {
        const a = row.runtime[key]; const b = row.runtimeSecond ? row.runtimeSecond[key] : null;
        const moved = a && b && a.some((v, i) => Number.isFinite(v) && Number.isFinite(b[i]) && Math.abs(v - b[i]) > 1e-4);
        if (!moved) {
          // 取样窗口内没动：静态字面量若仍成立，就照常著述（交互后是否变化由 interaction 断言承担）；
          // 没有可著述的字面量才记缺口，不用 vary 冒充"运行期会变"。
          if (lit && expChecks.nearlyAxis(row.runtime[key], lit, tol, key === 'rotationEuler')) {
            entry[key] = lit;
            addProvenance(entry, { source: 'src/main.ts', line: dyn.line, text: `静态字面量成立；L${dyn.line} 的改写只在交互后发生` });
            infos.push({ validator: 'transform-equals', node: name, key, reason: `dynamic in source (L${dyn.line}) but samples identical; authored the static literal instead of vary` });
            continue;
          }
          // 静置窗口内不动、且示例声明了交互步骤：这条轴的真实变化只能在"交互前/交互后"两次读回之间成立。
          // 著成 deferTo: 'interaction-window' 的 vary 期望——由交互窗口判定器负责，
          // 既不用 vary 冒充静置可证的东西，也不因采样顺序把真实的交互合同丢成缺口。
          if (hasInteractionSteps) {
            entry[key] = { vary: true, deferTo: 'interaction-window' };
            addProvenance(entry, { source: 'src/main.ts', line: dyn.line, text: `${String(dyn.raw || '').slice(0, 90)} —— 该轴由交互改写，变化在交互前/后两次读回之间判定` });
            infos.push({ validator: 'transform-equals', node: name, key, reason: `dynamic in source (L${dyn.line}) with declared interaction steps → authored vary{deferTo:interaction-window}` });
            continue;
          }
          gaps.push({ validator: 'transform-equals', node: name, key, reason: `dynamic in source (L${dyn.line}) but samples identical` }); continue;
        }
        const sweep = sweepOf(name, key, lit);
        const env = sweep ? null : envelopeOf(dyn.raw);
        if (sweep) {
          entry[key] = sweep;
          addProvenance(entry, sweepProv(name, key));
        } else if (env) {
          entry[key] = { vary: true, range: env, minDelta: 1e-4 };
          addProvenance(entry, { source: 'src/main.ts', line: dyn.line, text: `正弦包络 ${String(dyn.raw || '').slice(0, 90)}：三角项取 [-1,1]，其余为字面量算术` });
          infos.push({ validator: 'transform-equals', node: name, key, reason: `dynamic in source (L${dyn.line}); authored the source trig envelope ${JSON.stringify(env)} + vary` });
        } else {
          entry[key] = { vary: true };
          addProvenance(entry, { source: 'src/main.ts', line: dyn.line, text: String(dyn.raw || '').slice(0, 110) });
          infos.push({ validator: 'transform-equals', node: name, key, reason: `dynamic in source (L${dyn.line}) 的字面量端点/包络推不出，降级为 bare vary（只证"确实在动"，不伪造区间）` });
        }
        continue;
      }
      if (!lit) { continue; }
      if (expChecks.nearlyAxis(row.runtime[key], lit, tol, key === 'rotationEuler')) {
        entry[key] = lit;
        // 取最后一次赋值出处：源码里同一节点常被后续 setPosition 覆盖，早期行不是有效期望。
        const method = key === 'position' ? 'setPosition' : key === 'rotationEuler' ? 'setRotationFromEuler' : 'setScale';
        const hits = (st.provenance || []).filter((p) => new RegExp(`${method}\\s*\\(`).test(p.text || ''));
        addProvenance(entry, hits[hits.length - 1] || (st.provenance || [])[0] || { source: 'src/main.ts', text: 'static literal' });
        continue;
      }
      // 字面量与运行期不符：只有"运行期确实在动 + 源码有动画/tween 证据"才降级为 vary，
      // 且把降级写进报告（不许悄悄把弱断言伪装成静态合同）。其余情况一律记 mismatch，不回填。
      const b2 = row.runtimeSecond ? row.runtimeSecond[key] : null;
      const moved = b2 && row.runtime[key].some((v, i) => Math.abs(v - b2[i]) > 1e-4);
      if (moved && (animatesInSource || dynList.length > 0)) {
        const sweep = sweepOf(name, key, lit);
        entry[key] = sweep || { vary: true };
        addProvenance(entry, (sweep && sweepProv(name, key)) || { source: 'src/main.ts', line: ((st.provenance || [])[0] || {}).line, text: `字面量 ${JSON.stringify(lit)} 会被动画/补间覆盖，降级为 vary` });
        infos.push({ validator: 'transform-equals', node: name, key, reason: sweep
          ? `literal ${JSON.stringify(lit)} is transient (runtime ${JSON.stringify(row.runtime[key])}); authored the source tween-endpoint sweep ${JSON.stringify(sweep.range)} + vary`
          : `literal ${JSON.stringify(lit)} is transient (runtime ${JSON.stringify(row.runtime[key])} moves); authored as vary` });
      } else {
        gaps.push({ validator: 'transform-equals', node: name, key, reason: `mismatch runtime ${JSON.stringify(row.runtime[key])} vs source ${JSON.stringify(lit)} (L${((st.provenance || [])[0] || {}).line || '?'})` });
      }
    }
    if (Object.keys(entry).length === 0 && !exclusions[name] && !(st.provenance || []).length && dynList.length === 0) {
      // 源码从未给该节点赋局部变换 → 合同是引擎默认（identity）。这是真断言：默认值漂移会抓住。
      // 只有运行期确实等于默认才著述（否则保留缺口，不拿运行期冒充源码期望）。
      const created = NL[name];
      const isDefault = TRANSFORM_KEYS.every((k) => expChecks.nearlyAxis(row.runtime[k], DEFAULT_TRANSFORM[k],
        k === 'rotationEuler' ? 1e-2 : 1e-3, k === 'rotationEuler'));
      if (created && isDefault) {
        for (const k of TRANSFORM_KEYS) { entry[k] = DEFAULT_TRANSFORM[k]; }
        addProvenance(entry, { source: 'src/main.ts', line: created, text: 'new Node(...) 之后未赋局部变换，合同为引擎默认 identity' });
        infos.push({ validator: 'transform-equals', node: name, reason: `authored engine default identity (no assignment in source; creation line L${created})` });
      }
    }
    if (Object.keys(entry).length > 0) { exp[name] = entry; }
    else if (!exclusions[name] && !gaps.some((g) => g.node === name)) { gaps.push({ validator: 'transform-equals', node: name, reason: 'no static literal and no dynamic axis in src/main.ts' }); }
  }
  return { exp, gaps, infos, exclusions };
}

/** material-property 著述：effect 名与属性值都必须来自源码字面量且运行期一致。 */
function authorMaterials (probe, assetNames) {
  const exp = {}; const gaps = [];
  const R = (probe.staticOut || {}).rendererExpect || {};
  for (const row of probe.rows) {
    const name = row.node;
    const rt = R[name];
    if (!rt) { continue; }
    if (!row.present) { gaps.push({ validator: 'material-property', node: name, reason: 'node absent at readback' }); continue; }
    const renderer = (row.runtime.renderers || [])[0];
    const mat = renderer && renderer.material;
    if (!mat) { gaps.push({ validator: 'material-property', node: name, reason: 'no renderer material at readback' }); continue; }
    const entry = {}; const props = {};
    const cand = rt.effectName || rt.builtin;
    // 内建资源名 builtinResMgr.get('builtin-<X>-material') 约定映射到 effect 'builtin-<X>'
    // （bundle 里该 uuid 的材质 initialize({effectName:'builtin-standard'})）。这是源码声明的语义，
    // 不是把运行期值回填：请求 standard 内建材质却拿到别的 effect，仍会 FAIL。
    const builtinEffect = /^builtin(.+)-material$/.exec(rt.builtin || '');
    if (cand && mat.effect === cand) { entry.effect = cand; }
    else if (builtinEffect && mat.effect === 'builtin' + builtinEffect[1]) {
      entry.effect = 'builtin' + builtinEffect[1];
      entry.effectFrom = { builtin: rt.builtin, rule: "builtinResMgr.get('builtin<X>-material') → effect 'builtin<X>'" };
    }
    else if (rt.builtin && String(mat.name || '') === rt.builtin) {
      // 源码请求的是内建资源名且 material.name 命中：只断言名字，effect 由引擎内部映射，不冒充源码期望。
      entry.materialName = rt.builtin;
    }
    else if (cand && String(mat.name || '').includes(cand)) { gaps.push({ validator: 'material-property', node: name, reason: `source name "${cand}" only matches material.name "${mat.name}", not effect "${mat.effect}" — effect 不著述` }); }
    else if (cand) { gaps.push({ validator: 'material-property', node: name, reason: `effect mismatch: runtime ${mat.effect} vs source ${cand}` }); }
    for (const [pn, pv] of Object.entries(rt.props || {})) {
      const got = mat.props ? mat.props[pn] : null;
      const kind = mat.propKinds ? mat.propKinds[pn] : null;
      if (!pv.numbers) {
        // 非数值属性（贴图/缓冲）：源码是变量表达式，静态取不到值，只能著述"绑定了对象"
        if (kind === 'object') {
          const observed = mat.textureNames ? mat.textureNames[pn] : null;
          const named = observed && (assetNames || []).find((base) => String(observed).includes(base));
          props[pn] = { expect: 'object', name: named || null, tolerance: null,
            provenance: { source: 'src/main.ts', line: pv.line, text: String(pv.raw || '').slice(0, 110) } };
        } else { gaps.push({ validator: 'material-property', node: name, reason: `prop ${pn} not statically numeric (runtime kind=${kind})` }); }
        continue;
      }
      if (!Array.isArray(got) || !got.length) { gaps.push({ validator: 'material-property', node: name, reason: `prop ${pn} not read back (kind=${kind})` }); continue; }
      const rawHit = nearly(got, pv.numbers, Math.max(pv.tolerance || 1e-3, 1e-3));
      const normHit = nearly(got, pv.numbers.map((v) => v / 255), 2e-3);
      if (!rawHit && !normHit) { gaps.push({ validator: 'material-property', node: name, reason: `prop ${pn} mismatch: runtime ${JSON.stringify(got)} vs source ${JSON.stringify(pv.numbers)}` }); continue; }
      props[pn] = { value: pv.numbers, encoding: pv.numbers.some((v) => v > 1) ? '0-255' : '0-1', tolerance: 2e-3,
        provenance: { source: 'src/main.ts', line: pv.line, text: String(pv.raw || '').slice(0, 110) } };
    }
    if (Object.keys(props).length > 0) { entry.props = props; }
    if (!entry.effect && !entry.props) { continue; }
    if (rt.line || rt.provenance) { entry.provenance = rt.provenance; }
    exp[name] = entry;
  }
  return { exp, gaps };
}

/** asset-loaded 著述：只写浏览器真实取到（资源计时 >0 字节、<400）且源码有字面量引用的路径。 */
function authorAssets (spec, probe, srcText) {
  const candidates = sourceAssetCandidates(srcText);
  const declared = (spec.assets || []).map((a) => String(a.path || a).replace(/^\.?\//, ''));
  const rels = [...new Set([...declared, ...candidates.keys()])];
  const paths = []; const gaps = [];
  for (const rel of rels) {
    const hit = (probe.resources || []).find((r) => r.decoded.endsWith('/' + rel) || r.decoded === rel);
    const prov = candidates.get(rel);
    if (hit && hit.size > 0 && !(hit.status >= 400)) {
      paths.push({ path: rel, provenance: prov ? [prov] : [{ source: 'example.json', text: `spec.assets 声明：${rel}` }] });
    } else {
      gaps.push({ validator: 'asset-loaded', node: rel, reason: !prov && !declared.includes(rel) ? 'not found'
        : `not fetched by the browser${hit ? ` (status=${hit.status} size=${hit.size})` : ''}${prov ? ` (src L${prov.line})` : ''}` });
    }
  }
  return { exp: paths.length ? { paths } : null, gaps };
}

/** 出处去重追加：同一行常被 position/rotation 两个分量共用。 */
function addProvenance (entry, prov) {
  if (!prov) { return; }
  const list = entry.provenance = entry.provenance || [];
  if (!list.some((p) => p.line === prov.line && p.text === prov.text)) { list.push(prov); }
}

/** 写入 example.json：只补空位，已有人工著述的节点不覆盖。 */
function mergeExpectations (spec, key, authored) {
  const block = spec.validationExpectations = spec.validationExpectations || {};
  const prev = block[key];
  if (prev && prev.handAuthored) { return 0; }   // 整项人工著述（含 asset-loaded）：既不覆盖也不清理
  if (key === 'asset-loaded') { block[key] = authored; return 1; }
  const target = {};
  for (const [node, entry] of Object.entries(prev || {})) {
    if (entry && entry.handAuthored) { target[node] = entry; continue; } // 逐节点人工条目保留
    // 机器条目以最近一次「静态出处 + 运行期核对」为准：本轮著述不出来就删除，
    // 否则过期期望（例如已被动画覆盖的静态字面量）会一直伪装成有效合同。
  }
  for (const [node, entry] of Object.entries(authored)) {
    if (target[node]) { continue; }
    target[node] = entry;
  }
  const changed = JSON.stringify(prev || {}) !== JSON.stringify(target);
  block[key] = target;
  return changed ? 1 : 0;
}

/** 豁免写入：机器条目以最近一次著述为准（行号会随源码漂移，过期行号的"出处"等于没有出处）。 */
function mergeExclusions (spec, key, node, excl) {
  const block = spec.expectationExclusions = spec.expectationExclusions || {};
  const target = block[key] = block[key] || {};
  const prev = target[node];
  if (prev) {
    if (prev.handAuthored) { return false; }
    if (prev.reason === excl.reason && prev.line === excl.line) { return false; }
    target[node] = { reason: excl.reason, line: excl.line };
    return true;
  }
  target[node] = { reason: excl.reason, line: excl.line };
  return true;
}

/** 过期豁免清理：节点已有期望值时，早先写的豁免必须撤掉，否则它会在未来的著述失败时顶包。 */
function pruneExclusions (spec, key, authored) {
  const block = (spec.expectationExclusions || {})[key];
  if (!block) { return 0; }
  let removed = 0;
  for (const node of Object.keys(block)) {
    if (authored[node] || (authored.paths && authored.paths.some((p) => String(p.path || p).indexOf(node) >= 0))) { delete block[node]; removed++; }
  }
  if (removed && !Object.keys(block).length) { delete spec.expectationExclusions[key]; }
  return removed;
}

function declaredValidators (spec) {
  const dims = spec.validation || {};
  return new Set([...(spec.ready && spec.ready.validators || []), ...(dims.functional || []), ...(dims.visual || []),
    ...(dims.lifecycle || []), ...(dims.capability || [])]);
}

function applyTo (example, probe) {
  const exampleDir = path.join(REPO, 'examples', example.dir);
  const specFile = path.join(exampleDir, 'example.json');
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  const srcFile = ['src/main.ts', 'src/main.js', 'main.ts', 'main.js'].map((r) => path.join(exampleDir, r)).find((p) => fs.existsSync(p));
  const srcText = srcFile ? fs.readFileSync(srcFile, 'utf8') : '';
  const wants = declaredValidators(spec);
  const assetNames = [...sourceAssetCandidates(srcText).keys()].map((rel) => rel.split('/').pop().replace(/\.[^.]+$/, ''));
  const report = { id: example.id, authored: {}, exclusions: {}, gaps: [], infos: [] };
  const parts = [];
  if (wants.has('transform-equals')) { parts.push(['transform-equals', authorTransforms(probe, srcText, ((spec.interaction && spec.interaction.steps) || []).length > 0)]); }
  if (wants.has('material-property')) { parts.push(['material-property', authorMaterials(probe, assetNames)]); }
  if (wants.has('asset-loaded')) { parts.push(['asset-loaded', authorAssets(spec, probe, srcText)]); }
  let changed = false;
  for (const [key, out] of parts) {
    report.authored[key] = out.exp ? Object.keys(out.exp).length : 0;
    report.gaps.push(...out.gaps);
    report.infos.push(...(out.infos || []));
    if (out.exp && mergeExpectations(spec, key, out.exp) > 0) { changed = true; }
    report.pruned = (report.pruned || {});
    const pruned = pruneExclusions(spec, key, out.exp || {});
    if (pruned) { report.pruned[key] = pruned; changed = true; }
    for (const [node, excl] of Object.entries(out.exclusions || {})) {
      if (mergeExclusions(spec, key, node, excl)) { report.exclusions[key] = (report.exclusions[key] || 0) + 1; changed = true; }
    }
  }
  const entryRel = srcFile ? path.relative(exampleDir, srcFile).replace(/\\/g, '/') : null;
  if (entryRel && normalizeEntrySource(spec, entryRel)) { changed = true; }
  if (changed) { fs.writeFileSync(specFile, JSON.stringify(spec, null, 2) + '\n'); }
  return report;
}

/** 出处必须真指得到文件：生成器把行号一律取自入口源码，但标签写死过 'src/main.ts'。
 *  对 main.js 入口的示例这是假出处 ⇒ 统一改写成实际入口相对路径。 */
function normalizeEntrySource (spec, entryRel) {
  if (entryRel === 'src/main.ts') { return false; }
  let fixed = 0;
  const walk = (v) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!v || typeof v !== 'object') { return; }
    for (const [k, child] of Object.entries(v)) {
      if (k === 'source' && child === 'src/main.ts') { v[k] = entryRel; fixed++; continue; }
      walk(child);
    }
  };
  walk(spec.validationExpectations);
  walk(spec.expectationExclusions);
  return fixed > 0;
}

(async function main () {
  if (mode === 'extract') {
    for (const example of manifest.examples) {
      if (only && !only.has(example.id)) { continue; }
      const exampleDir = path.join(REPO, 'examples', example.dir);
      const spec = JSON.parse(fs.readFileSync(path.join(exampleDir, 'example.json'), 'utf8'));
      const srcFile = ['src/main.ts', 'src/main.js', 'main.ts', 'main.js'].map((r) => path.join(exampleDir, r)).find((p) => fs.existsSync(p));
      const e = srcFile ? extractFromSource(fs.readFileSync(srcFile, 'utf8')) : { transforms: {}, dynamics: {}, rendererExpect: {}, unresolved: [{ reason: 'no entry' }] };
      const graph = (spec.scene && spec.scene.expectedGraph && spec.scene.expectedGraph.nodes) || [];
      const covered = graph.filter((n) => e.transforms[n] || e.dynamics[n]).length;
      const matCovered = graph.filter((n) => e.rendererExpect[n]).length;
      console.log(`${example.id}: graph=${graph.length} transformLit=${graph.filter((n) => e.transforms[n]).length} dynamic=${graph.filter((n) => e.dynamics[n]).length} covered=${covered} material=${matCovered} unresolved=${e.unresolved.length}`);
      if (process.argv.includes('--verbose')) {
        console.log('   transforms: ' + JSON.stringify(e.transforms));
        console.log('   dynamics:   ' + JSON.stringify(e.dynamics));
        console.log('   materials:  ' + JSON.stringify(e.rendererExpect));
        console.log('   unresolved: ' + e.unresolved.map((u) => `L${u.line || '?'}:${u.reason}`).join(' | '));
      }
    }
    return;
  }
  const entries = manifest.examples.filter((e) => (only ? only.has(e.id) : !e.requiresDevTools));
  const out = [];
  const applyReports = [];
  for (const example of entries) {
    try {
      const r = await probeExample(example);
      out.push(r);
      const corrob = r.rows.filter((x) => (x.transform && x.transform.verdict === 'corroborated') || (x.material && x.material.verdict === 'corroborated')).length;
      const gaps = r.rows.filter((x) => (x.transform && x.transform.verdict !== 'corroborated' && !x.dynamic) || x.unresolved).length;
      console.log(`${r.id}: graph=${r.graph.length} corroborated=${corrob} gaps=${gaps} unresolved=${r.unresolved.length} executed=${Object.values(r.traceExecuted).filter((u) => u.state === 'executed').length}`);
      if (mode === 'apply') {
        const rep = applyTo(example, r);
        applyReports.push(rep);
        fs.mkdirSync(path.dirname(APPLY_PATH), { recursive: true });
        fs.writeFileSync(APPLY_PATH, JSON.stringify(applyReports, null, 2) + '\n');
        console.log(`  authored ${JSON.stringify(rep.authored)} exclusions ${JSON.stringify(rep.exclusions)} gaps=${rep.gaps.length} infos=${rep.infos.length}`);
        for (const g of rep.gaps) { console.log(`  [gap] ${g.validator} ${g.node || ''}${g.key ? '.' + g.key : ''}: ${g.reason}`); }
        for (const g of rep.infos) { console.log(`  [info] ${g.validator} ${g.node || ''}.${g.key}: ${g.reason}`); }
      }
    } catch (error) {
      out.push({ id: example.id, error: String(error.message || error).slice(0, 300) });
      console.log(`${example.id}: ERROR ${String(error.message || error).slice(0, 160)}`);
    }
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
  }
  console.log(`[spec-expectations] ${out.length} examples probed → ${path.relative(REPO, OUT_PATH)}`);
})();

module.exports = { extractFromSource, argsOf, numbersOf, splitTop, isDynamic, amplitudeOf, nearly, readRuntime };
