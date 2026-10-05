/* F-A — 逐 API 运行期执行证据（per-API execution proof）。
 *
 * 为什么要它：docs/api-coverage-report.json 的 verified 过去只要求"claim 所属示例整体
 * PASS"，示例级结论被当成逐 API 证明（总审查 item 1）。本模块给浏览器矩阵装一个真实
 * 调用计数器，让 verified 必须同时满足：
 *   (1) 规格 api.evidence[] 把该 unit 绑到一个本次运行 PASS 的 validator；
 *   (2) 该 unit 在运行期被观测到执行（instrumented 且 calls>0）；
 *   (3) 示例源码指纹（example.json + index.html + src/** + 引擎 bundle）与证据一致。
 *
 * 做法（不碰仓库源码、不碰 build 产物）：在暂存工作区生成一个包装模块，静态重导出真实
 * bundle 的全部具名导出，并对"被 claim 的 unit"就地插桩：
 *   - 顶层函数/类            → export 处包一层 construct/apply 计数（只影响示例侧引用）
 *   - 类实例方法             → 就地替换原型方法（示例与引擎内部调用都会计数）
 *   - 静态方法 / 单例方法    → 就地替换该对象上的方法
 *   - 原型访问器（get/set）  → 包住 accessor
 *   - 可配置数据属性 / 常量  → 读写语义透明地记录成员读取；不可配置者仍记 not-instrumentable
 *
 * 计数语义是"该 API 在本次运行中被执行过"，不是"这一行由示例自己调用"：原型/访问器插桩
 * 同样会记到引擎内部调用。因此 unit 状态附带 mechanism，报告端不得把内部调用冒充示例调用
 * （示例侧的行级归属由 api.evidence[] 的 sourceLocation 承担）。
 *
 * 门禁自身不是无辜的观察者：读回用 `Material.getProperty()` / `MeshRenderer.getMaterial(i)`
 * 取值，走的正是同一张被打桩原型，不隔离就会由验证器自己把 claim 刷成 executed。所以读回窗口
 * 内 `T.observing>0`，其间调用只记 harnessCalls（披露用），永不参与 state 判定。
 *
 * 执行：node tools/verify/api-trace.cjs --selftest
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..', '..');

const TRACE_FILE_NAME = 'cocosair.traced.js';
const API_INVENTORY = JSON.parse(fs.readFileSync(path.join(REPO, 'docs', 'example-api-inventory.json'), 'utf8'));

function sha16(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

/** 示例"当期"源码指纹：规格 + 入口 html/ts/js + 引擎 bundle + shared 库。
 *  旧口径只哈希 example.json，所以 src/main.ts 改动不会使证据失配（item 1/2 的根因之一）。
 *
 *  example.json 一律按**规范化字节**参与哈希：门禁在跑完后会把 promotion/status 写回同一个文件，
 *  直接哈希原始字节会让"自己刚写的晋级块"改掉自己记录的指纹 ⇒ 每次晋级都把自己判成 stale，
 *  verified 数随运行顺序漂移（实测 light-point：记录 37d423582c54f261，重算 18d9…，永远不等）。
 *  剔除的只有门禁自写字段；规格内容（含 validationExpectations）与源码/资产改动照样进哈希。
 */
const SELF_WRITTEN_SPEC_FIELDS = ['promotion', 'promotionEvidence', 'stableReview', 'status'];

function canonicalSpecBytes(abs) {
    const raw = fs.readFileSync(abs);
    try {
        const spec = JSON.parse(raw.toString('utf8'));
        for (const key of SELF_WRITTEN_SPEC_FIELDS) {
            delete spec[key];
        }
        return Buffer.from(JSON.stringify(spec));
    } catch (e) {
        return raw; // 解析不了就按原始字节算：宁可保守失配，不静默丢掉绑定
    }
}

function sourceFingerprint(exampleDir) {
    const files = [];
    const push = (rel) => {
        const abs = path.join(exampleDir, rel);
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
            return;
        }
        const buf = rel === 'example.json' ? canonicalSpecBytes(abs) : fs.readFileSync(abs);
        files.push({ rel, hash: sha16(buf) });
    };
    push('example.json');
    push('index.html');
    for (const rel of ['main.ts', 'main.js']) {
        push(rel);
    }
    // Components and other imported modules must invalidate evidence just like the entry.
    const src = path.join(exampleDir, 'src');
    if (fs.existsSync(src)) {
        (function walkSource(dir) {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const abs = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    walkSource(abs);
                } else {
                    push(path.relative(exampleDir, abs).replace(/\\/g, '/'));
                }
            }
        })(src);
    }
    const assets = path.join(exampleDir, 'assets');
    if (fs.existsSync(assets)) {
        (function walk(dir) {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const abs = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(abs);
                    continue;
                }
                files.push({
                    rel: 'assets/' + path.relative(assets, abs).replace(/\\/g, '/'),
                    hash: sha16(fs.readFileSync(abs)),
                });
            }
        })(assets);
    }
    files.sort((a, b) => a.rel.localeCompare(b.rel));
    return sha16(Buffer.from(JSON.stringify(files)));
}

function candidateFingerprint() {
    const bundle = path.join(REPO, 'build', 'cocosair.module.js');
    const dts = path.join(REPO, 'build', 'cocosair.module.d.ts');
    const parts = [];
    for (const f of [bundle, dts]) {
        if (fs.existsSync(f)) {
            parts.push(sha16(fs.readFileSync(f)));
        }
    }
    const shared = path.join(REPO, 'examples', 'shared');
    if (fs.existsSync(shared)) {
        for (const entry of fs.readdirSync(shared).sort()) {
            const abs = path.join(shared, entry);
            if (fs.statSync(abs).isFile()) {
                parts.push(entry + ':' + sha16(fs.readFileSync(abs)));
            }
        }
    }
    return sha16(Buffer.from(parts.join('|')));
}

/** 解析 bundle 末尾的 `export { a as X, b as Y, ... };`，得到全部具名导出。 */
function bundleExportNames(bundlePath) {
    const src = fs.readFileSync(bundlePath || path.join(REPO, 'build', 'cocosair.module.js'), 'utf8');
    const start = src.lastIndexOf('export {');
    if (start < 0) {
        throw new Error('api-trace: no `export {` clause found in bundle — refusing to generate an untraced wrapper');
    }
    const end = src.indexOf('}', start);
    const clause = src.slice(start + 'export {'.length, end);
    const names = [
        ...new Set(
            clause
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
                .map((s) => {
                    const m = /\s+as\s+(\S+)$/.exec(s);
                    return m ? m[1] : s;
                }),
        ),
    ];
    const bad = names.filter((n) => !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n));
    if (bad.length) {
        throw new Error(`api-trace: bundle export names not usable as identifiers: ${bad.slice(0, 5).join(',')}`);
    }
    return names;
}

/** 需要插桩的 unit 集合：全部示例 api.claims ∪ api.evidence[].api。 */
function claimedUnits(manifestExamples, readSpec) {
    const set = new Set();
    for (const ex of manifestExamples) {
        const spec = readSpec(ex);
        for (const u of (spec.api && spec.api.claims) || []) {
            set.add(u);
        }
        for (const ev of (spec.api && spec.api.evidence) || []) {
            if (ev && ev.api) {
                set.add(ev.api);
            }
        }
    }
    return [...set].sort();
}

/** 生成包装模块源码。realUrl 为真实 bundle 的浏览器 URL（默认 /build/cocosair.module.js）。 */
function generateTraceModule(exportNames, units, realUrl) {
    const lines = [];
    lines.push('/* GENERATED by tools/verify/api-trace.cjs — per-API execution instrumentation.');
    lines.push('   Do not edit and never ship this file: it exists only in the throwaway verify workspace. */');
    lines.push(`import * as __CC from '${realUrl || '/build/cocosair.module.js'}';`);
    lines.push('__traceRuntime();');
    lines.push(`const __UNITS = ${JSON.stringify(units)};`);
    const kinds = Object.fromEntries(units.map((unit) => [unit, API_INVENTORY.units[unit]?.kind || null]));
    const parents = Object.fromEntries(units.map((unit) => [unit, API_INVENTORY.units[unit]?.parent || null]));
    lines.push(`const __KINDS = ${JSON.stringify(kinds)};`);
    lines.push(`const __PARENTS = ${JSON.stringify(parents)};`);
    lines.push(`const __NAMES = ${JSON.stringify(exportNames)};`);
    lines.push('function __traceRuntime() {');
    lines.push(`  const T = window.__apiTrace = { calls: Object.create(null), reads: Object.create(null), harnessCalls: Object.create(null), mechanism: Object.create(null), alias: Object.create(null), canonical: new Map(), wrappers: new Map(), instanceData: new Map(), instanceDataNames: new Map(), instanceDataSeen: new WeakSet(), notes: [], observing: 0, startedAt: Date.now() };
  // T.observing：门禁自己的读回（Material.getProperty / MeshRenderer.getMaterial …）会走同一张
  // 被打桩的原型，不隔离就能凭"验证器读了一次"把 claim 刷成 executed。读回期间计数改记 harnessCalls
  // ——它只用于证明隔离边界确实生效，永不参与 verified 判定。
  const hit = (key) => { const k = T.alias[key] || key; if (T.observing > 0) { T.harnessCalls[k] = (T.harnessCalls[k] || 0) + 1; return; } T.calls[k] = (T.calls[k] || 0) + 1; };
  T.hit = hit;
  const note = (msg) => { if (T.notes.length < 200) { T.notes.push(String(msg).slice(0, 160)); } };
  const recordRead = (key) => {
    if (T.observing > 0) { T.harnessCalls[key] = (T.harnessCalls[key] || 0) + 1; }
    else { T.reads[key] = (T.reads[key] || 0) + 1; }
  };
  T.registerInstanceData = (ctor, prop, key) => {
    const entries = T.instanceData.get(ctor) || [];
    if (!entries.some((entry) => entry.prop === prop && entry.key === key)) { entries.push({ prop, key }); }
    T.instanceData.set(ctor, entries);
    const name = ctor && ctor.name;
    const owner = key.slice(0, key.lastIndexOf('.'));
    for (const namedKey of new Set([name, owner].filter(Boolean))) {
      const named = T.instanceDataNames.get(namedKey) || [];
      if (!named.some((entry) => entry.prop === prop && entry.key === key)) { named.push({ prop, key }); }
      T.instanceDataNames.set(namedKey, named);
    }
  };
  T.instrumentInstanceData = (instance, ctor, ownerHint) => {
    if (!instance || typeof instance !== 'object' || T.instanceDataSeen.has(instance)) { return; }
    const directEntries = T.instanceData.get(ctor);
    const entries = directEntries && directEntries.length
      ? directEntries
      : (ownerHint && T.instanceDataNames.get(ownerHint)) || (ctor && T.instanceDataNames.get(ctor.name));
    if (!entries || !entries.length) { return; }
    T.instanceDataSeen.add(instance);
    for (const { prop, key } of entries) {
      const d = Object.getOwnPropertyDescriptor(instance, prop);
      if (!d || d.get || d.set || !d.configurable) { note(key + ': instance data field unavailable'); continue; }
      let value = d.value;
      const descriptor = {
        get () { recordRead(key); return value; },
        enumerable: d.enumerable,
        configurable: true,
      };
      if (d.writable) { descriptor.set = function (next) { value = next; }; }
      try {
        Object.defineProperty(instance, prop, descriptor);
        T.mechanism[key] = 'instance-data-property';
      } catch (e) { note(key + ': instance data patch failed ' + String(e.message || e).slice(0, 60)); }
    }
  };
  T.instrumentReturnedInstance = (value) => {
    if (!value || typeof value !== 'object') { return value; }
    if (Array.isArray(value)) {
      for (const entry of value) { T.instrumentReturnedInstance(entry); }
      return value;
    }
    const prototype = Object.getPrototypeOf(value);
    const ctor = prototype && prototype.constructor;
    if (ctor && T.instanceDataNames.has(ctor.name)) { T.instrumentInstanceData(value, ctor, ctor.name); }
    return value;
  };
  T.instrumentResult = (value, name) => {
    if (value && typeof value.then === 'function') {
      if (name === 'GLTFLoader.parseAsync') { return value.then((result) => T.instrumentReturnedInstance(result)); }
      return value;
    }
    return T.instrumentReturnedInstance(value);
  };

  const fnMeta = (orig, name) => {
    const w = function () { hit(name); return T.instrumentResult(orig.apply(this, arguments), name); };
    try { Object.defineProperty(w, 'name', { value: orig.name || name, configurable: true }); } catch (e) { /* ignore */ }
    try { Object.defineProperty(w, 'length', { value: orig.length, configurable: true }); } catch (e) { /* ignore */ }
    w.__tracedOriginal = orig;
    return w;
  };
  // 类/函数一律用 Proxy 包：手写 function + orig.apply() 对 ES class 会抛
  // "Class constructor cannot be invoked without new"（实测：示例在 new Node() 处崩，
  // 表面看却像"场景没运行"），而 Proxy 的 construct 陷阱经 Reflect.construct 保留语义。
  // get 陷阱记录「成员被读取」：Layers.Enum.DEFAULT 这类命名空间用法永远不会有 construct/apply，
  // 只记 calls 就会把真实用到的 API 误报成"未执行"。reads 与 calls 分开计，报告端不得混为调用。
  T.wrapExport = (orig, key) => {
    if (T.wrappers.has(orig)) { return T.wrappers.get(orig); }
    if (typeof orig !== 'function') {
      if (orig && typeof orig === 'object' && !key.includes('.') && __UNITS.includes(key)) {
        T.mechanism[key] = T.mechanism[key] || 'export-object';
        const boundMethods = new WeakMap();
        return new Proxy(orig, {
          get (target, prop) {
            if (typeof prop === 'string') { recordRead(key); }
            const value = Reflect.get(target, prop, target);
            if (typeof value !== 'function') { return value; }
            const descriptor = Object.getOwnPropertyDescriptor(target, prop);
            if (descriptor && !descriptor.configurable && !descriptor.writable) { return value; }
            if (!boundMethods.has(value)) { boundMethods.set(value, value.bind(target)); }
            return boundMethods.get(value);
          },
        });
      }
      return orig;
    }
    T.mechanism[key] = T.mechanism[key] || 'export-wrapper';
    if (!T.canonical.has(orig)) { T.canonical.set(orig, key); }
    const handler = {
      construct (target, args, newTarget) {
        hit(key);
        const instance = Reflect.construct(target, args, newTarget === proxy ? target : newTarget);
        T.instrumentInstanceData(instance, target, key);
        return instance;
      },
      apply (target, thisArg, args) { hit(key); return T.instrumentResult(Reflect.apply(target, thisArg, args), key); },
      get (target, prop) {
        if (typeof prop === 'string') {
          T.reads[key] = (T.reads[key] || 0) + 1;
          const memberKey = key + '.' + prop;
          if (
            __UNITS.includes(memberKey) &&
            (__KINDS[memberKey] === 'property' || __KINDS[memberKey] === 'constant') &&
            T.mechanism[memberKey] === 'unresolved' &&
            Object.getOwnPropertyDescriptor(target, prop)
          ) {
            T.mechanism[memberKey] = 'data-property';
            recordRead(memberKey);
          }
        }
        // 引擎 Node._findComponent 对 @sealed 类走 "comp.constructor === ctor" 身份比较：
        // Proxy 与原类不是同一对象 ⇒ 插桩页里 getComponent(UITransform)/getComponents(Layout) 假报 null
        // （实测真页面 1 个组件、插桩页 0 个，示例还会因此重复 addComponent）。
        // 报 false 让它走 instanceof 分支：Proxy 转发 prototype，instanceof 结果与原类一致。
        if (prop === '_sealed') { return false; }
        return Reflect.get(target, prop);
      },
    };
    const proxy = new Proxy(orig, handler);
    T.wrappers.set(orig, proxy);
    return proxy;
  };
  T.nsCopy = (src, tree, hostKey) => {
    // esbuild 把 export namespace utils/primitives 打成 Object.freeze 的命名空间对象：
    // 属性不可写，install 的 patchOwn 只能报 unresolved。此处按宿主建一份浅拷贝并替换成员，
    // 让经命名空间访问的 API 也有真实计数。拷贝只在冻结时发生（否则返回原对象给 install 就地插桩）。
    if (!src || typeof src !== 'object') { return src; }
    const nestedObject = Object.entries(tree.children || {}).some(([member]) => src[member] && typeof src[member] === 'object');
    const aliasedMember = (tree.members || []).some((member) => typeof src[member] === 'function' && T.canonical.has(src[member]));
    const copy = Object.isFrozen(src) || nestedObject || aliasedMember ? Object.assign(Object.create(null), src) : src;
    for (const member of tree.members || []) {
      const unit = hostKey + '.' + member;
      const orig = src[member];
      const childTree = tree.children && tree.children[member];
      if (childTree && orig && typeof orig === 'object') {
        copy[member] = T.nsCopy(orig, childTree, unit);
        continue;
      }
      if (typeof orig !== 'function') {
        const descriptor = Object.getOwnPropertyDescriptor(copy, member);
        if (descriptor && !descriptor.configurable) { T.mechanism[unit] = 'data-member'; continue; }
        Object.defineProperty(copy, member, { configurable: true, enumerable: descriptor ? descriptor.enumerable : true,
          get () { recordRead(unit); return orig; } });
        T.mechanism[unit] = 'data-property';
        continue;
      }
      const canon = T.canonical.get(orig);
      if (canon) {
        T.alias[unit] = canon;
        T.mechanism[unit] = 'alias:' + canon;
        const descriptor = Object.getOwnPropertyDescriptor(copy, member);
        if (!descriptor || descriptor.configurable !== false) {
          Object.defineProperty(copy, member, { configurable: true, enumerable: descriptor ? descriptor.enumerable : true,
            get () { recordRead(unit); return T.wrappers.get(orig) || orig; } });
        } else {
          note(unit + ': alias property is not configurable');
        }
        continue;
      }
      const isClass = /^class[ ({]/.test(Function.prototype.toString.call(orig))
        || (/^[A-Z]/.test(member) && !!orig.prototype);
      const wrapped = isClass ? T.wrapExport(orig, unit) : fnMeta(orig, unit);
      Object.defineProperty(copy, member, { configurable: true, enumerable: true,
        get () {
          if (T.observing > 0) T.harnessCalls[unit] = (T.harnessCalls[unit] || 0) + 1;
          else T.reads[unit] = (T.reads[unit] || 0) + 1;
          return wrapped;
        } });
      T.canonical.set(orig, unit);
      T.mechanism[unit] = isClass ? 'frozen-namespace-class' : 'frozen-namespace-member';
    }
    return copy;
  };
  T.patchOwn = (obj, prop, key, mechanism) => {
    if (!obj) { note(key + ': no host object'); return false; }
    const d = Object.getOwnPropertyDescriptor(obj, prop);
    if (!d) { note(key + ': no own descriptor on ' + mechanism); return false; }
    try {
      if (d.get || d.set) {
        const get = d.get ? function () {
          hit(key);
          const value = d.get.apply(this, arguments);
          if (value && typeof value === 'object') {
            const prototype = Object.getPrototypeOf(value);
            if (prototype && typeof prototype.constructor === 'function') {
              T.instrumentReturnedInstance(value);
            }
          }
          return value;
        } : undefined;
        const set = d.set ? function () { hit(key); return d.set.apply(this, arguments); } : undefined;
        Object.defineProperty(obj, prop, { get, set, enumerable: d.enumerable, configurable: true });
      } else if (typeof d.value === 'function') {
        const orig = d.value;
        // 同一函数对象已有规范名（如 Vec3 与 math.Vec3 是同一个类）：只记别名，不重复插桩，
        // 否则示例走顶层导入时成员 unit 会被误报"未执行"。
        const canon = T.canonical.get(orig);
        if (canon && canon !== key) {
          T.alias[key] = canon;
          T.mechanism[key] = 'alias:' + canon;
          return true;
        }
        const isClass = /^class[ ({]/.test(Function.prototype.toString.call(orig));
        const value = isClass ? T.wrapExport(orig, key) : fnMeta(orig, key);
        if (!isClass) { T.canonical.set(orig, T.canonical.get(orig) || key); }
        Object.defineProperty(obj, prop, { value, writable: true, enumerable: d.enumerable, configurable: true });
      } else {
        // 可配置的数据属性可通过透明 accessor 记录精确的成员读取；枚举值等常量因此能以
        // via=read 证明，而不是把"类被读过"误当成员被用过。不可配置属性保留旧的保守边界。
        const protoDescriptor = typeof obj === 'function' && obj.prototype
          ? Object.getOwnPropertyDescriptor(obj.prototype, prop)
          : null;
        // Function.length/name are own data properties on every class constructor. If the
        // declaration also has a same-named prototype method/accessor, defer to that member
        // instead of shadowing the declared API with constructor metadata.
        const prototypeApiMember = protoDescriptor && (
          typeof protoDescriptor.value === 'function' || protoDescriptor.get || protoDescriptor.set
        );
        if (prototypeApiMember && !d.enumerable && !d.writable) {
          note(key + ': constructor metadata defers to prototype member');
          return false;
        }
        if (d.configurable) {
          let value = d.value;
          const descriptor = {
            get () { recordRead(key); return value; },
            enumerable: d.enumerable,
            configurable: true,
          };
          if (d.writable) { descriptor.set = function (next) { value = next; }; }
          Object.defineProperty(obj, prop, descriptor);
          T.mechanism[key] = 'data-property';
          return true;
        }
        T.mechanism[key] = 'data-member';
        note(key + ': data property is not configurable');
        return false;
      }
      T.mechanism[key] = T.mechanism[key] ? T.mechanism[key] + '→' + mechanism : mechanism;
      return true;
    } catch (e) { note(key + ': patch failed ' + String(e.message || e).slice(0, 60)); return false; }
  };
  T.ns = __CC;
  T.hit = hit;
  // 投影必须由包装模块自己给出：调用方各自手写通道清单时，漏掉 alias/reads 会把真实使用误报成「未执行」。
  T.snapshot = () => ({ calls: Object.assign({}, T.calls), reads: Object.assign({}, T.reads), harnessCalls: Object.assign({}, T.harnessCalls), mechanism: Object.assign({}, T.mechanism), alias: Object.assign({}, T.alias), notes: T.notes.slice(0) });`);
    lines.push('}');
    // 导出必须先于 install：成员 unit 若与顶层导出是同一函数对象（`math.Vec3` === `Vec3`），
    // 只有导出包装先登记 canonical 名，install 才能把成员 unit 记成别名而不是重复插桩。
    // 顶层函数的"文档命名空间前缀"（`math.X`，运行时不存在 `math`）在浏览器里才知道，
    // 所以叶子名一律预包装，install 需要时可直接别名到它。
    const topNames = new Set(units.filter((u) => u.indexOf('.') < 0));
    const memberLeaves = new Set();
    for (const u of units) {
        const parts = u.split('.');
        if (parts.length < 2) {
            continue;
        }
        if (!topNames.has(parts[0])) {
            memberLeaves.add(parts[parts.length - 1]);
        }
        if (u.endsWith('.constructor')) {
            memberLeaves.add(parts[parts.length - 2]);
        }
    }
    const tracedTop = new Set([...topNames, ...memberLeaves]);
    // 命名空间宿主（`primitives.box` / `utils.createMesh` / `math.bits.sign`）：
    // 冻结对象及其嵌套命名空间不能就地替换，按导出根生成递归浅拷贝树。
    const nsTrees = {};
    const exportedSet = new Set(exportNames);
    for (const u of units) {
        const parts = u.split('.');
        if (parts.length < 2 || !exportedSet.has(parts[0])) continue;
        let node = nsTrees[parts[0]];
        if (!node) node = nsTrees[parts[0]] = { members: new Set(), children: {} };
        for (let index = 1; index < parts.length; ++index) {
            const member = parts[index];
            node.members.add(member);
            if (index === parts.length - 1) break;
            if (!node.children[member]) node.children[member] = { members: new Set(), children: {} };
            node = node.children[member];
        }
    }
    const serializeNsTree = (node) => ({
        members: [...node.members].sort(),
        children: Object.fromEntries(
            Object.entries(node.children).map(([name, child]) => [name, serializeNsTree(child)]),
        ),
    });
    lines.push('const __wrap = window.__apiTrace.wrapExport;');
    lines.push('const __nsCopy = window.__apiTrace.nsCopy;');
    for (const name of exportNames) {
        const wrapped = tracedTop.has(name) ? `__wrap(__CC.${name}, ${JSON.stringify(name)})` : `__CC.${name}`;
        if (nsTrees[name]) {
            lines.push(
                `export const ${name} = __nsCopy(${wrapped}, ${JSON.stringify(serializeNsTree(nsTrees[name]))}, ${JSON.stringify(name)});`,
            );
        } else {
            lines.push(`export const ${name} = ${wrapped};`);
        }
    }
    lines.push(`(function install () {
  const T = window.__apiTrace;
  const exported = new Set(__NAMES);
  const aliasTo = (unit, target) => { T.alias[unit] = target; T.mechanism[unit] = 'alias:' + target; };
  for (const unit of __UNITS) {
    if (T.mechanism[unit]) { continue; }
    const parts = unit.split('.');
    if (parts.length === 1) {
      if (!exported.has(parts[0])) { T.mechanism[unit] = 'unresolved'; continue; }
      const value = __CC[parts[0]];
      T.mechanism[unit] = typeof value === 'function' ? 'export-wrapper'
        : (value && typeof value === 'object' ? 'namespace' : 'unresolved');
      continue;
    }
    const leaf = parts[parts.length - 1];
    let host = __CC[parts[0]];
    let walked = true;
    for (const step of parts.slice(1, parts.length - 1)) {
      if (!host || (typeof host !== 'object' && typeof host !== 'function')) { walked = false; break; }
      host = host[step];
    }
    if (!walked || !host || (typeof host !== 'object' && typeof host !== 'function')) {
      // 文档命名空间在 bundle 里不存在（inventory 来自 .d.ts，具名导出是扁平的）：
      // 只有叶子名本身是导出时才别名，否则如实 unresolved。
      if (parts.length === 2 && exported.has(leaf) && typeof __CC[leaf] === 'function') { aliasTo(unit, leaf); continue; }
      T.mechanism[unit] = 'unresolved';
      continue;
    }
    let done = false;
    if (typeof host === 'function') {
      if (leaf === 'constructor') {
        // A new C() call never reads C.prototype.constructor. Constructor units
        // must share the exported class wrapper's construct counter.
        aliasTo(unit, T.canonical.get(host) || parts.slice(0, -1).join('.'));
        continue;
      }
      // The owner may be a class inside a namespace (dragonBones.Armature).
      // Instance methods live on its prototype regardless of path depth.
      const staticDone = T.patchOwn(host, leaf, unit, 'static');
      // Declaration bundles list static methods before same-name instance
      // methods. The inventory retains the first declaration for each unit,
      // so prefer static here too; only fall back to the prototype when the
      // class has no static member with this name.
      done = staticDone || T.patchOwn(host.prototype, leaf, unit, 'prototype');
      if (!done && leaf === 'constructor') { T.mechanism[unit] = 'export-wrapper'; done = true; }
      const owner = __PARENTS[unit];
      const ownDataOwner = owner && (owner.indexOf('math.') === 0 || owner === 'renderer.scene.Camera' || owner === 'geometry.Ray' || owner === 'geometry.AABB' || owner === 'dragonBones.ArmatureDisplay' || owner === 'dragonBones.CCFactory' || owner === 'MeshRenderer' || owner === 'Scene' || owner === 'Mesh' || owner === 'GLTFAsset' || owner === 'Animation' || owner === 'AnimationClip' || owner === 'EffectAsset' || owner === 'TextureCube' || owner === 'SkinnedMeshUnit');
      if (!done && __KINDS[unit] === 'property' && ownDataOwner) {
        T.registerInstanceData(host, leaf, unit);
        T.mechanism[unit] = 'instance-data';
        done = true;
      }
    } else {
      done = T.patchOwn(host, leaf, unit, 'namespace-member');
    }
    if (!done && !T.mechanism[unit]) { T.mechanism[unit] = 'unresolved'; }
  }
  for (const unit of __UNITS) { if (!T.mechanism[unit]) { T.mechanism[unit] = 'unresolved'; } }
})();`);
    return lines.join('\n') + '\n';
}

/** 页面内投影入口（三处门禁共用，避免各写一份通道清单）：无包装模块返回 null。 */
function snapshotInPage() {
    const T = window.__apiTrace;
    if (!T) {
        return null;
    }
    if (typeof T.snapshot !== 'function') {
        return { staleWrapper: true };
    }
    return T.snapshot();
}

/** 从页面读回计数，归一化成 unit -> {state, calls, reads, mechanism}。
 *  calls = 真实被调用/构造；reads = 仅被读取成员（命名空间式用法，如 Layers.Enum.DEFAULT）。
 *  两者都可能让 unit 成为 executed，但 `via` 字段必须留在证据里，报告端不得把 read 冒充 call。 */
function normalizeTrace(raw, units) {
    const out = {};
    const calls = (raw && raw.calls) || {};
    const reads = (raw && raw.reads) || {};
    const mechanism = (raw && raw.mechanism) || {};
    const harness = (raw && raw.harnessCalls) || {};
    const alias = (raw && raw.alias) || {};
    const notes = ((raw && raw.notes) || []).slice(0);
    if (raw && raw.staleWrapper) {
        notes.unshift('api-trace: wrapper has no snapshot(); channels dropped by a stale wrapper module');
    }
    for (const unit of units) {
        // unit 可能是 'Node.toString' 之类与 Object.prototype 重名的键：一律校验值类型，
        // 否则属性查找会命中继承成员并把计数读成 undefined/函数。
        const rawTarget = alias[unit];
        const target = typeof rawTarget === 'string' ? rawTarget : undefined;
        const rawMech = mechanism[unit];
        const mech = typeof rawMech === 'string' ? rawMech : target ? 'alias:' + target : 'unresolved';
        const n = Number(calls[target || unit]) || 0;
        const r = (Number(reads[target || unit]) || 0) + (target ? Number(reads[unit]) || 0 : 0);
        let state;
        // A namespace class may be consumed through a static method without a
        // constructor call. Its class-object read is evidence of that class use;
        // ordinary member reads still do not prove method execution.
        const classRead = mech === 'frozen-namespace-class' || (target && API_INVENTORY.units[unit]?.kind === 'class');
        const dataPropertyRead =
            (mech.indexOf('data-property') === 0 ||
                mech.indexOf('instance-data-property') === 0 ||
                (target && API_INVENTORY.units[unit]?.kind === 'constant')) &&
            r > 0;
        const via = n > 0 ? 'call' : r > 0 && (unit.indexOf('.') < 0 || classRead || dataPropertyRead) ? 'read' : null;
        if (via) {
            state = 'executed';
        } else if (mech === 'unresolved') {
            state = 'unresolved';
        } else if (mech === 'data-member' || mech === 'namespace') {
            state = 'not-instrumentable';
        } else {
            state = 'not-observed';
        }
        out[unit] = {
            state,
            calls: n,
            reads: r > 0 && (unit.indexOf('.') < 0 || classRead || dataPropertyRead) ? r : 0,
            via,
            mechanism: mech,
            observedVia: target && target !== unit ? target : undefined,
            // 门禁读回期间被抑制的调用：只作边界生效的披露，不参与 state 判定。
            harnessCalls: Number(harness[target || unit]) || undefined,
        };
    }
    return {
        units: out,
        notes: notes.slice(0, 40),
        instrumentedCount: Object.values(out).filter((u) => u.state === 'executed').length,
    };
}

function writeTraceWorkspace(workspaceDir, units, realUrl) {
    const names = bundleExportNames();
    const code = generateTraceModule(names, units, realUrl);
    const file = path.join(workspaceDir, TRACE_FILE_NAME);
    fs.writeFileSync(file, code);
    // 不回传绝对临时路径：证据文件必须跨机器可比。
    return {
        name: TRACE_FILE_NAME,
        exports: names.length,
        unitCount: units.length,
        bytes: code.length,
        hash: sha16(Buffer.from(code)),
    };
}

if (require.main === module) {
    const argv = process.argv.slice(2);
    if (argv.includes('--selftest')) {
        const code = generateTraceModule(
            ['Node', 'createAirApp', 'Vec3'],
            ['createAirApp', 'Node', 'Node.setPosition', 'Node.constructor', 'math.Vec3', 'math.Vec3.x'],
            '/build/cocosair.module.js',
        );
        const names = bundleExportNames();
        console.log('[api-trace] bundle exports:', names.length, '| wrapper bytes:', code.length);
        if (!names.includes('Node') || !names.includes('createAirApp')) {
            throw new Error('selftest: expected export names missing');
        }
        if (!/export const Node =/.test(code) || !/__wrap\(__CC\.createAirApp/.test(code)) {
            throw new Error('selftest: wrapper shape wrong');
        }
        // 语义断言：install 必须在全部导出之后（否则 canonical 为空，成员别名失效）
        if (code.indexOf('(function install') < code.lastIndexOf('export const ')) {
            throw new Error('selftest: install() must run after export wrapping');
        }
        // 成员 unit 的宿主（Node）与叶子（setPosition）都必须被预包装/可别名
        if (!/__wrap\(__CC\.Node, "Node"\)/.test(code)) {
            throw new Error('selftest: host class of member unit not wrapped');
        }
        if (!/__wrap\(__CC\.Vec3, "Vec3"\)/.test(code)) {
            throw new Error('selftest: doc-namespace leaf (math.Vec3→Vec3) not wrapped');
        }
        const norm = normalizeTrace(
            {
                calls: { Node: 3, Vec3: 1 },
                mechanism: {
                    'Node.setPosition': 'prototype',
                    'math.Vec3': 'alias:Vec3',
                    'material.dataMember': 'data-member',
                },
                alias: { 'math.Vec3': 'Vec3' },
            },
            ['Node', 'Node.setPosition', 'Node.constructor', 'math.Vec3', 'material.dataMember'],
        );
        const expect = {
            Node: 'executed',
            'Node.setPosition': 'not-observed',
            'Node.constructor': 'unresolved',
            'math.Vec3': 'executed',
            'material.dataMember': 'not-instrumentable',
        };
        for (const [u, s] of Object.entries(expect)) {
            if (norm.units[u].state !== s) {
                throw new Error(`selftest: ${u} → ${norm.units[u].state}, want ${s}`);
            }
        }
        if (norm.units['math.Vec3'].observedVia !== 'Vec3') {
            throw new Error('selftest: alias source not recorded');
        }
        const normAliasRead = normalizeTrace(
            {
                calls: {},
                reads: { 'math.Vec4': 1, 'math.MATH_FLOAT_ARRAY': 1 },
                mechanism: { 'math.Vec4': 'alias:Vec4', 'math.MATH_FLOAT_ARRAY': 'alias:MATH_FLOAT_ARRAY' },
                alias: { 'math.Vec4': 'Vec4', 'math.MATH_FLOAT_ARRAY': 'MATH_FLOAT_ARRAY' },
            },
            ['math.Vec4', 'math.MATH_FLOAT_ARRAY'],
        );
        for (const unit of ['math.Vec4', 'math.MATH_FLOAT_ARRAY']) {
            if (normAliasRead.units[unit].state !== 'executed' || normAliasRead.units[unit].via !== 'read') {
                throw new Error(`selftest: alias read ${unit} was not treated as an executed API read`);
            }
        }
        // 命名空间式读取（Layers.Enum.DEFAULT）：顶层类导出只被读成员时算 executed(via=read)，
        // 但成员 unit 只有 reads 不算执行——读 `Layers.Enum` 不等于调用 `Layers.Enum.something`。
        const norm2 = normalizeTrace(
            {
                calls: {},
                reads: { Layers: 4, 'Layers.Enum': 2, 'Layers.enableLayers': 9 },
                mechanism: { Layers: 'export-wrapper', 'Layers.Enum': 'data-member', 'Layers.enableLayers': 'static' },
                alias: {},
            },
            ['Layers', 'Layers.Enum', 'Layers.enableLayers'],
        );
        if (norm2.units.Layers.state !== 'executed' || norm2.units.Layers.via !== 'read') {
            throw new Error('selftest: namespace read not observed as executed(via=read)');
        }
        if (norm2.units['Layers.Enum'].state !== 'not-instrumentable') {
            throw new Error('selftest: member unit wrongly promoted by reads');
        }
        if (norm2.units['Layers.enableLayers'].state !== 'not-observed') {
            throw new Error('selftest: instrumented member with 0 calls must stay not-observed despite reads');
        }
        const normObject = normalizeTrace(
            { calls: {}, reads: { director: 1 }, mechanism: { director: 'export-object' }, alias: {} },
            ['director'],
        );
        if (normObject.units.director.state !== 'executed' || normObject.units.director.via !== 'read') {
            throw new Error('selftest: a top-level runtime object read must be executed(via=read)');
        }
        const normData = normalizeTrace(
            {
                calls: {},
                reads: { 'Label.HorizontalAlign': 2 },
                mechanism: { 'Label.HorizontalAlign': 'data-property→static' },
                alias: {},
            },
            ['Label.HorizontalAlign'],
        );
        if (
            normData.units['Label.HorizontalAlign'].state !== 'executed' ||
            normData.units['Label.HorizontalAlign'].via !== 'read' ||
            normData.units['Label.HorizontalAlign'].reads !== 2
        ) {
            throw new Error('selftest: an instrumented static data-property read must be executed(via=read)');
        }
        const normNamespaceData = normalizeTrace(
            {
                calls: {},
                reads: { 'math.bits.INT_BITS': 1 },
                mechanism: { 'math.bits.INT_BITS': 'data-property' },
                alias: {},
            },
            ['math.bits.INT_BITS'],
        );
        if (
            normNamespaceData.units['math.bits.INT_BITS'].state !== 'executed' ||
            normNamespaceData.units['math.bits.INT_BITS'].via !== 'read'
        ) {
            throw new Error('selftest: a frozen namespace data-property read must be executed(via=read)');
        }
        const normInstance = normalizeTrace(
            {
                calls: {},
                reads: { 'math.Vec3.x': 1 },
                mechanism: { 'math.Vec3.x': 'instance-data-property' },
                alias: {},
            },
            ['math.Vec3.x'],
        );
        if (
            normInstance.units['math.Vec3.x'].state !== 'executed' ||
            normInstance.units['math.Vec3.x'].via !== 'read'
        ) {
            throw new Error('selftest: an instrumented instance data-property read must be executed(via=read)');
        }
        if (!/__KINDS = \{[^}]*"math.Vec3.x":"property"/.test(code)) {
            throw new Error('selftest: inventory kind map missing for instance property');
        }
        if (
            !/__PARENTS = \{[^}]*"math.Vec3.x":"math.Vec3"/.test(code) ||
            !/T\.registerInstanceData\(host, leaf, unit\)/.test(code)
        ) {
            throw new Error('selftest: instance-data owner mapping missing');
        }
        if (
            !/T\.instrumentInstanceData\(instance, target, key\)/.test(code) ||
            !/const owner = key\.slice\(0, key\.lastIndexOf\('\.'\)\)/.test(code)
        ) {
            throw new Error('selftest: instance-data export owner hint missing');
        }
        if (
            !/T\.instrumentResult\(orig\.apply\(this, arguments\), name\)/.test(code) ||
            !/value\.then\(\(result\) => T\.instrumentReturnedInstance\(result\)\)/.test(code)
        ) {
            throw new Error('selftest: direct and async returned instance data fields must be instrumented');
        }
        if (!/__UNITS\.includes\(key\)/.test(code) || !/export-object/.test(code)) {
            throw new Error('selftest: claimed top-level runtime objects must record property reads');
        }
        if (!/directEntries && directEntries\.length/.test(code)) {
            throw new Error('selftest: empty constructor registry must fall through to the owner hint');
        }
        if (
            !/Array\.isArray\(value\)/.test(code) ||
            !/for \(const entry of value\) \{ T\.instrumentReturnedInstance\(entry\); \}/.test(code)
        ) {
            throw new Error('selftest: returned arrays must instrument tracked instance fields on their elements');
        }
        if (!/owner === 'Scene'.*owner === 'Mesh'/.test(code)) {
            throw new Error('selftest: Scene and Mesh data-property owners missing');
        }
        if (!/owner === 'GLTFAsset'/.test(code)) {
            throw new Error('selftest: GLTFAsset own data-property owner missing');
        }
        for (const owner of [
            'Animation',
            'AnimationClip',
            'EffectAsset',
            'TextureCube',
            'SkinnedMeshUnit',
            'geometry.Ray',
            'geometry.AABB',
            'dragonBones.ArmatureDisplay',
            'dragonBones.CCFactory',
        ]) {
            if (!new RegExp(`owner === '${owner}'`).test(code)) {
                throw new Error(`selftest: ${owner} own data-property owner missing`);
            }
        }
        if (!/T\.reads\[key\]/.test(code)) {
            throw new Error('selftest: read trap missing from generated wrapper');
        }
        if (
            !/__KINDS\[memberKey\] === 'property'/.test(code) ||
            !/Object\.getOwnPropertyDescriptor\(target, prop\)/.test(code)
        ) {
            throw new Error(
                'selftest: runtime-added static data properties must be observable after class initialization',
            );
        }
        if (!/T\.snapshot = \(\)/.test(code)) {
            throw new Error('selftest: snapshot() projection missing from generated wrapper');
        }
        if (!/T\.observing > 0/.test(code)) {
            throw new Error('selftest: harness-suppression guard missing from generated wrapper');
        }
        // 门禁读回期间的调用只披露、不晋升：harnessCalls>0 且 calls=0 必须仍是 not-observed。
        const norm3 = normalizeTrace(
            {
                calls: {},
                reads: {},
                harnessCalls: { 'Node.setPosition': 7 },
                mechanism: { 'Node.setPosition': 'proto' },
                alias: {},
            },
            ['Node.setPosition'],
        );
        if (
            norm3.units['Node.setPosition'].state !== 'not-observed' ||
            norm3.units['Node.setPosition'].harnessCalls !== 7
        ) {
            throw new Error('selftest: harness-only calls leaked into executed state');
        }
        // 生成物必须是合法 ESM：模板里混进反引号/未转义字符会让包装模块在浏览器里静默变垃圾。
        const esbuild = require(path.join(REPO, 'node_modules', 'esbuild'));
        const full = generateTraceModule(
            bundleExportNames(),
            ['Node', 'Node.setPosition', 'primitives.box', 'utils.createMesh', 'math.Color', 'math.bits.INT_BITS'],
            '/build/cocosair.module.js',
        );
        esbuild.transformSync(full, { loader: 'js', format: 'esm', target: 'es2022' });
        if (!/__nsCopy\(__CC\.primitives, \{"members":\["box"\],"children":\{\}\}, "primitives"\)/.test(full)) {
            throw new Error('selftest: frozen-namespace copy not emitted');
        }
        if (!/T\.wrappers\.get\(orig\) \|\| orig/.test(full) || !/get \(\) \{ recordRead\(unit\); return/.test(full)) {
            throw new Error(
                'selftest: aliased namespace exports must return the canonical wrapper and record alias reads',
            );
        }
        if (!/"bits":\{"members":\["INT_BITS"\],"children":\{\}\}/.test(full)) {
            throw new Error('selftest: nested frozen namespace tree was not emitted');
        }
        if (!/T\.mechanism\[unit\] = 'data-property'/.test(full) || !/recordRead\(unit\)/.test(full)) {
            throw new Error('selftest: namespace data-property reads are instrumented');
        }
        console.log('[api-trace] selftest PASS (shape + alias/normalize semantics + generated ESM parses)');
        process.exitCode = 0;
    } else {
        console.log('usage: node tools/verify/api-trace.cjs --selftest');
    }
}

module.exports = {
    REPO,
    TRACE_FILE_NAME,
    sha16,
    sourceFingerprint,
    candidateFingerprint,
    bundleExportNames,
    claimedUnits,
    generateTraceModule,
    normalizeTrace,
    snapshotInPage,
    writeTraceWorkspace,
};
