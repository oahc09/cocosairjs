/*
 * port-gap-candidate-snapshot — PG-27 候选身份快照与前后漂移检查。
 *
 * 用途（ai/plans/port-gap-remediation.md §12 S0 / §13.1 EG0）：
 *   执行任何 PG 条目前，把"当前候选"固定成可复核的字节身份：HEAD、工作区脏清单、
 *   源码/config/runner/contracts 分组摘要、unmin/min/d.ts/npm/decoder 构建产物实际字节，
 *   以及声明的 AIR_FEATURES / AIR_OUT_DIR。事后用 check 模式对比同版本候选是否漂移，
 *   防止"证据 A 产自候选 X、报告却标候选 Y"。
 *
 * 设计约束：
 *   - 默认只读。snapshot 只写入显式 --out 路径（已存在须 --force）；check 不写任何文件，
 *     除非显式 --report-out。仓库其余内容一律不碰。
 *   - 缺失项如实记 NOT_RUN/MISSING（如未构建的 d.ts 或 npm 副本），不猜测、不补建。
 *   - 非本仓根（fixture/临时目录）可用 --root 指定；该目录不是 git 仓库时 git 字段如实
 *     available:false，身份退化为纯文件摘要，漂移检测仍逐文件生效。
 *   - 实际加载 URL 不由本工具推断：只有显式 --load-url 传入才记录（providedBy:'cli-flag'）。
 *
 * 用法：
 *   node tools/verify/port-gap-candidate-snapshot.cjs snapshot --out=<file.json>
 *        [--load-url=<url>] [--root=<dir>] [--notes=<text>] [--deep] [--force]
 *   node tools/verify/port-gap-candidate-snapshot.cjs check --snapshot=<file.json>
 *        [--root=<dir>] [--load-url=<url>] [--report-out=<file.json>]
 *
 * 退出码：0 = 快照完成 / 无漂移；1 = 检出漂移；2 = 用法或执行错误。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..');
const SCHEMA_VERSION = 'port-gap-candidate-snapshot/1';

// ── 基础工具 ────────────────────────────────────────────────────────────────

function sha256File(abs) {
    return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}

function toPosix(p) {
    return p.split(path.sep).join('/');
}

/** 顺序无关的分组摘要：排序后对 "path:sha256" 列表再哈希。 */
function groupDigest(entries) {
    const lines = entries
        .map((e) => `${e.path}:${e.sha256}`)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}

// ── git 身份 ────────────────────────────────────────────────────────────────

// 静默 git stderr：非 git 目录的探测失败是预期路径，不让 git 的 fatal 文本污染输出。
const GIT_OPTS = { cwd: null, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };

function collectGit(root) {
    const info = { available: false, head: null, branch: null, dirty: [], dirtyDigest: null };
    try {
        // rev-parse 在非 git 目录会抛错，这是探测手段而非失败路径。
        info.head = execFileSync('git', ['rev-parse', 'HEAD'], { ...GIT_OPTS, cwd: root }).trim();
        info.available = true;
        const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { ...GIT_OPTS, cwd: root }).trim();
        info.branch = branch === 'HEAD' ? null : branch; // detached HEAD 如实记 null
        const porcelain = execFileSync('git', ['status', '--porcelain=v1'], { ...GIT_OPTS, cwd: root });
        info.dirty = porcelain
            .split('\n')
            .map((l) => l.trimEnd())
            .filter(Boolean);
        info.dirtyDigest = crypto.createHash('sha256').update(info.dirty.join('\n')).digest('hex');
    } catch (e) {
        info.error = `git unavailable or not a repository: ${String(e.message).split('\n')[0]}`;
    }
    return info;
}

// ── 分组收集 ────────────────────────────────────────────────────────────────

// config：声明依赖与构建口径的根配置。package-lock 进指纹，防止依赖解析悄悄变化。
const CONFIG_FILES = ['package.json', 'package-lock.json', 'tsconfig.json', 'jest.config.js', 'babel.config.js'];
// Executable applications and shipped manual recipes participate alongside tests.
// A same-version recipe change must drift even when runtime bytes stay unchanged.
const CONTRACT_ROOTS = ['test', 'docs/manual/examples', 'examples'];
const CONTRACT_FILES = ['tools/verify/browser-matrix-contract.json'];
// runner：驱动构建与验证的脚本面。
const RUNNER_ROOTS = ['tools/verify', 'tools/build', 'tools/debug', 'tools/dev'];

function listTracked(root, relRoot) {
    try {
        // New source/fixtures are part of a dirty candidate before staging. Their bytes,
        // not just their filenames in git.status, must participate in identity.
        const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', relRoot], { ...GIT_OPTS, cwd: root });
        return [...new Set(out.split('\0').filter(Boolean))];
    } catch (e) {
        // 非 git 目录：退化为目录枚举（fixture 路径）。只收文本源码面，忽略 node_modules 等。
        const absRoot = path.join(root, relRoot);
        const files = [];
        (function walk(dir) {
            if (!fs.existsSync(dir)) return;
            for (const name of fs.readdirSync(dir).sort()) {
                if (name === 'node_modules' || name.startsWith('.git')) continue;
                const abs = path.join(dir, name);
                const rel = toPosix(path.relative(root, abs));
                if (fs.statSync(abs).isDirectory()) walk(abs);
                else files.push(rel);
            }
        })(absRoot);
        return files;
    }
}

function collectGroup(root, spec, detailed) {
    const relPaths = [];
    for (const f of spec.files || []) if (fs.existsSync(path.join(root, f))) relPaths.push(f);
    for (const r of spec.roots || []) relPaths.push(...listTracked(root, r));
    const entries = [];
    for (const rel of relPaths) {
        const abs = path.join(root, rel);
        let st;
        try {
            st = fs.statSync(abs);
        } catch (e) {
            entries.push({ path: rel, present: false, status: 'MISSING', reason: 'stat failed' });
            continue;
        }
        if (!st.isFile()) continue;
        try {
            const sha = sha256File(abs);
            entries.push({ path: rel, present: true, bytes: st.size, sha256: sha });
        } catch (e) {
            entries.push({ path: rel, present: false, status: 'NOT_RUN', reason: `unreadable: ${String(e.message).split('\n')[0]}` });
        }
    }
    const presentEntries = entries.filter((e) => e.present);
    const group = {
        role: spec.role,
        fileCount: presentEntries.length,
        digest: groupDigest(presentEntries),
        missingCount: entries.length - presentEntries.length,
        entryDetail: detailed ? entries : undefined,
        dirtyEntries: detailed ? undefined : entries.filter((e) => !e.present),
    };
    return group;
}

// ── 构建产物 ────────────────────────────────────────────────────────────────

// 固定清单：unmin/min/map/d.ts + npm 副本 + decoder 资产。缺失如实 MISSING，不视为错误。
const ARTIFACT_FILES = [
    'build/cocosair.module.js',
    'build/cocosair.module.js.map',
    'build/cocosair.module.min.js',
    'build/cocosair.module.min.js.map',
    'build/cocosair.module.d.ts',
    'build/cocosair.legacy.d.ts',
    'build/bootstrap.legacy.d.ts',
    'build/bootstrap.js',
    'build/bootstrap.js.map',
    'build/bootstrap.d.ts',
    'build/package.json',
];
const ARTIFACT_ROOTS = ['build/npm', 'build/gltf-decoders'];

function listArtifactFiles(root, relRoot) {
    const files = [];
    const visited = new Set();
    function walk(dir) {
        if (!fs.existsSync(dir)) return;
        const real = fs.realpathSync(dir);
        if (visited.has(real)) return;
        visited.add(real);
        for (const name of fs.readdirSync(dir).sort()) {
            const absolute = path.join(dir, name);
            const stat = fs.statSync(absolute);
            if (stat.isDirectory()) walk(absolute);
            else if (stat.isFile()) files.push(toPosix(path.relative(root, absolute)));
        }
    }
    walk(path.resolve(root, relRoot));
    return files;
}

function collectArtifacts(root, detailed) {
    const relPaths = [];
    const declaredFiles = ARTIFACT_FILES.slice();
    const declaredRoots = ARTIFACT_ROOTS.slice();
    if (process.env.AIR_OUT_DIR) {
        const variant = path.resolve(root, process.env.AIR_OUT_DIR);
        for (const filename of ['cocosair.module.js', 'cocosair.module.js.map', 'cocosair.module.min.js', 'cocosair.module.min.js.map',
            'bootstrap.js', 'bootstrap.js.map', 'bootstrap.d.ts', 'package.json']) {
            declaredFiles.push(toPosix(path.relative(root, path.join(variant, filename))));
        }
        declaredRoots.push(toPosix(path.relative(root, path.join(variant, 'gltf-decoders'))));
    }
    for (const f of declaredFiles) relPaths.push(f);
    // Build outputs are ordinarily gitignored. Enumerate only the declared artifact
    // directories physically, rather than using git ls-files and silently omitting npm/decoders.
    for (const r of declaredRoots) relPaths.push(...listArtifactFiles(root, r));
    const entries = [];
    for (const rel of [...new Set(relPaths)]) {
        const abs = path.join(root, rel);
        try {
            const st = fs.statSync(abs);
            if (!st.isFile()) continue;
            entries.push({ path: rel, present: true, bytes: st.size, sha256: sha256File(abs), role: 'artifact' });
        } catch (e) {
            entries.push({ path: rel, present: false, status: 'NOT_RUN', reason: `unreadable: ${String(e.message).split('\n')[0]}` });
        }
    }
    const declared = [...declaredFiles, ...declaredRoots.map((r) => `${r}/`)];
    const missingDeclared = declared.filter((d) => {
        const abs = path.join(root, d.replace(/\/$/, ''));
        return !fs.existsSync(abs);
    });
    const presentEntries = entries.filter((e) => e.present);
    return {
        role: 'artifacts',
        fileCount: presentEntries.length,
        digest: groupDigest(presentEntries),
        totalBytes: presentEntries.reduce((s, e) => s + (e.bytes || 0), 0),
        missingDeclared, // 声明要覆盖但当前不存在的产物路径（目录级按前缀判断的近似见下）
        entryDetail: detailed ? entries : undefined,
        dirtyEntries: detailed ? undefined : entries.filter((e) => !e.present),
    };
}

// ── 快照主体 ────────────────────────────────────────────────────────────────

function effectiveAirIdentityInputs(root) {
    const declaredFeatures = process.env.AIR_FEATURES || null;
    const declaredOut = process.env.AIR_OUT_DIR || null;
    // 变体构建不共享默认缓存：解析到仓库外的输出目录必须作为身份输入区分两次快照。
    const resolvedOut = declaredOut ? toPosix(path.resolve(root, declaredOut)) : null;
    return {
        airFeatures: { declared: declaredFeatures, source: declaredFeatures ? 'env' : 'unset(default-build-set)' },
        airOutDir: { declared: declaredOut, resolved: resolvedOut, source: declaredOut ? 'env' : 'unset(repo-build/)' },
        // 参与身份摘要的组合串：改任一环境变量都会改变 snapshotId。
        identityInputsDigest: crypto
            .createHash('sha256')
            .update(JSON.stringify({ features: declaredFeatures, out: resolvedOut }))
            .digest('hex'),
    };
}

/**
 * 收集一份候选快照。root 默认仓库根；options.loadUrl 仅在显式传入时记录。
 * options.deep = 对 source/config/runner/contracts 也保存逐文件条目（默认只存分组摘要
 * 与缺失/不可读明细；artifacts 始终逐文件，因为漂移定位必须到字节）。
 */
function collectSnapshot(options = {}) {
    const root = path.resolve(options.root || REPO);
    const deep = !!options.deep;
    const git = collectGit(root);
    const air = effectiveAirIdentityInputs(root);

    const groups = {
        source: collectGroup(root, { role: 'source', roots: ['src'] }, deep),
        config: collectGroup(root, { role: 'config', files: CONFIG_FILES }, deep),
        runner: collectGroup(root, { role: 'runner', roots: RUNNER_ROOTS }, deep),
        contracts: collectGroup(root, { role: 'contracts', roots: CONTRACT_ROOTS, files: CONTRACT_FILES }, deep),
        artifacts: collectArtifacts(root, true), // 产物漂移定位必须到文件，始终详细
    };

    const snapshot = {
        schemaVersion: SCHEMA_VERSION,
        createdAt: new Date().toISOString(),
        root: toPosix(root),
        git,
        airIdentityInputs: air,
        loadTarget: options.loadUrl
            ? { url: String(options.loadUrl), providedBy: 'cli-flag' }
            : { url: null, providedBy: null, note: 'NOT_PROVIDED: 实际加载 URL 未显式传入' },
        notes: options.notes ? String(options.notes) : null,
        groups,
        notRun: [],
    };

    // 缺失项集中披露：不猜测产物是否"应该"存在。
    for (const [name, g] of Object.entries(groups)) {
        for (const e of g.dirtyEntries || []) snapshot.notRun.push({ group: name, path: e.path, status: e.status, reason: e.reason });
        if (name === 'artifacts') {
            for (const m of g.missingDeclared) snapshot.notRun.push({ group: name, path: m, status: 'NOT_RUN', reason: 'declared artifact not present at snapshot time' });
        }
    }

    // 快照自指纹：git 身份 + 各组摘要 + AIR 身份输入，可单独比较两个快照是否同一候选。
    snapshot.snapshotId = crypto
        .createHash('sha256')
        .update(
            JSON.stringify({
                head: git.head,
                dirtyDigest: git.dirtyDigest,
                air: air.identityInputsDigest,
                groups: Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, g.digest])),
            }),
        )
        .digest('hex');
    return snapshot;
}

// ── 漂移对比 ────────────────────────────────────────────────────────────────

function diffEntries(before, after) {
    const mapBefore = new Map(before.filter((e) => e.present).map((e) => [e.path, e]));
    const mapAfter = new Map(after.filter((e) => e.present).map((e) => [e.path, e]));
    const drift = [];
    for (const [p, e] of mapAfter) {
        const old = mapBefore.get(p);
        if (!old) drift.push({ path: p, kind: 'added' });
        else if (old.sha256 !== e.sha256 || old.bytes !== e.bytes) {
            drift.push({ path: p, kind: 'changed', before: { bytes: old.bytes, sha256: old.sha256 }, after: { bytes: e.bytes, sha256: e.sha256 } });
        }
    }
    for (const [p, e] of mapBefore) if (!mapAfter.has(p)) drift.push({ path: p, kind: 'removed', before: { bytes: e.bytes, sha256: e.sha256 } });
    return drift;
}

/**
 * 对比两份快照。返回 { drifted, drifts[] }；drifts 每项含 scope(head/worktree/group/loadUrl)
 * 与具体差异。不读取文件系统——输入必须是两份 collectSnapshot 产物。
 */
function compareSnapshots(before, after) {
    if (!before || !after || before.schemaVersion !== SCHEMA_VERSION || after.schemaVersion !== SCHEMA_VERSION) {
        throw new Error(`snapshot schema mismatch: expect ${SCHEMA_VERSION}`);
    }
    const drifts = [];
    if ((before.git.head || null) !== (after.git.head || null)) {
        drifts.push({ scope: 'head', before: before.git.head, after: after.git.head });
    }
    if ((before.git.dirtyDigest || null) !== (after.git.dirtyDigest || null)) {
        const b = new Set(before.git.dirty || []);
        const a = new Set(after.git.dirty || []);
        drifts.push({
            scope: 'worktree',
            added: [...a].filter((x) => !b.has(x)),
            removed: [...b].filter((x) => !a.has(x)),
        });
    }
    if ((before.airIdentityInputs.identityInputsDigest || '') !== (after.airIdentityInputs.identityInputsDigest || '')) {
        drifts.push({
            scope: 'airIdentityInputs',
            before: before.airIdentityInputs,
            after: after.airIdentityInputs,
        });
    }
    for (const name of Object.keys(before.groups)) {
        const gb = before.groups[name];
        const ga = after.groups[name];
        if (!ga) {
            drifts.push({ scope: 'group', group: name, kind: 'missing-in-after' });
            continue;
        }
        if (gb.digest !== ga.digest) {
            const detail = diffEntries(gb.entryDetail || gb.dirtyEntries || [], ga.entryDetail || ga.dirtyEntries || []);
            drifts.push({
                scope: 'group',
                group: name,
                beforeDigest: gb.digest,
                afterDigest: ga.digest,
                detail: detail.length ? detail : [{ path: '(group digest changed; per-file detail not captured in before-snapshot — re-snapshot with --deep to localize)', kind: 'summary' }],
            });
        }
    }
    const ub = (before.loadTarget && before.loadTarget.url) || null;
    const ua = (after.loadTarget && after.loadTarget.url) || null;
    if (ua !== null && ub !== ua) {
        drifts.push({ scope: 'loadUrl', before: ub, after: ua });
    }
    return { drifted: drifts.length > 0, drifts, sameCandidate: before.snapshotId === after.snapshotId };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
    const args = { flags: new Map() };
    args.mode = argv[0];
    for (const raw of argv.slice(1)) {
        const m = raw.match(/^--([a-z-]+)=(.*)$/s);
        if (m) args.flags.set(m[1], m[2]);
        else if (raw === '--deep' || raw === '--force') args.flags.set(raw.slice(2), 'true');
        else throw new Error(`unrecognized argument: ${raw}`);
    }
    return args;
}

function writeJsonOptional(target, payload) {
    fs.writeFileSync(target, JSON.stringify(payload, null, 2) + '\n');
}

function main(argv) {
    let args;
    try {
        args = parseArgs(argv);
    } catch (e) {
        console.error(`[port-gap-snapshot] usage error: ${e.message}`);
        console.error('  snapshot: --out=<file.json> [--load-url=<url>] [--root=<dir>] [--notes=<text>] [--deep] [--force]');
        console.error('  check:    --snapshot=<file.json> [--root=<dir>] [--load-url=<url>] [--report-out=<file.json>]');
        process.exit(2);
    }
    const opt = (name) => args.flags.get(name);

    try {
        if (args.mode === 'snapshot') {
            const out = opt('out');
            if (!out) {
                console.error('[port-gap-snapshot] snapshot 需要显式 --out=<file.json>；不选路径就不写盘');
                process.exit(2);
            }
            const absOut = path.resolve(out);
            if (fs.existsSync(absOut) && !opt('force')) {
                console.error(`[port-gap-snapshot] 拒绝覆盖已存在的 ${absOut}（--force 显式覆盖）`);
                process.exit(2);
            }
            const snapshot = collectSnapshot({
                root: opt('root'),
                loadUrl: opt('load-url'),
                notes: opt('notes'),
                deep: !!opt('deep'),
            });
            writeJsonOptional(absOut, snapshot);
            const missing = snapshot.notRun.length;
            console.log(
                `[port-gap-snapshot] snapshot ${snapshot.snapshotId.slice(0, 16)} -> ${absOut}` +
                    ` (head=${snapshot.git.head ? snapshot.git.head.slice(0, 12) : 'unavailable'}, dirty=${snapshot.git.dirty.length}, notRun=${missing})`,
            );
            process.exit(0);
        }

        if (args.mode === 'check') {
            const snapPath = opt('snapshot');
            if (!snapPath) {
                console.error('[port-gap-snapshot] check 需要显式 --snapshot=<file.json>');
                process.exit(2);
            }
            const before = JSON.parse(fs.readFileSync(path.resolve(snapPath), 'utf8'));
            const after = collectSnapshot({ root: opt('root'), loadUrl: opt('load-url'), deep: true });
            const result = compareSnapshots(before, after);
            const report = {
                schemaVersion: 'port-gap-candidate-drift-check/1',
                checkedAt: new Date().toISOString(),
                snapshot: snapPath,
                result,
            };
            if (opt('report-out')) writeJsonOptional(path.resolve(opt('report-out')), report);
            if (!result.drifted) {
                console.log(`[port-gap-snapshot] CLEAN: 候选与快照一致 (snapshotId=${result.sameCandidate ? 'match' : 'digest-match-only'})`);
                process.exit(0);
            }
            for (const d of result.drifts) {
                if (d.scope === 'group') {
                    for (const item of d.detail || []) {
                        const where = item.path ? `${d.group}:${item.path}` : `${d.group}`;
                        const extra = item.kind === 'changed' ? ` ${JSON.stringify(item.before)} -> ${JSON.stringify(item.after)}` : ` ${item.kind}`;
                        console.error(`[port-gap-snapshot] DRIFT ${where}${extra}`);
                    }
                } else {
                    console.error(`[port-gap-snapshot] DRIFT ${d.scope}: ${JSON.stringify(d)}`);
                }
            }
            console.error(`[port-gap-snapshot] DRIFTED: ${result.drifts.length} 处漂移，当前证据不得归属快照候选`);
            process.exit(1);
        }

        console.error(`[port-gap-snapshot] 未知模式: ${args.mode}（可用: snapshot | check）`);
        process.exit(2);
    } catch (e) {
        console.error(`[port-gap-snapshot] 执行失败: ${e.message}`);
        process.exit(2);
    }
}

module.exports = {
    SCHEMA_VERSION,
    REPO,
    collectSnapshot,
    compareSnapshots,
    sha256File,
    groupDigest,
};

if (require.main === module) main(process.argv.slice(2));
