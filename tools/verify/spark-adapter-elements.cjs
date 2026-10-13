/**
 * SPK-13 gate: verify the Spark adapter layer's per-member `@air-element` ownership
 * annotations (ai/plans/spark-integration.md §1.3).
 *
 *   1. every exported member carries exactly one annotation, no dangling annotation;
 *   2. members annotated `cc.*` / `gfx:*` must name an element the engine actually
 *      exports and must reference it in their body; additionally, `cc.*` members may
 *      not carry their own algorithm body (no for/while/do) — per plan §SPK-13 ② the
 *      no-own-algorithm rule is scoped to `cc.*` only, since `gfx:*` render
 *      orchestration is required to keep its own loops (plan §SPK-07).
 *   3. members annotated `none:<name>` must carry a non-empty reason;
 *   4. only the four predefined ownership categories are legal (cc / gfx / none / removed);
 *   5. the layer must not reach the `cocosair` root export surface (SPK-05a hard constraint 1).
 *   6. annotations are accepted at two granularities: above a top-level exported declaration
 *      (the normal case) and above an individual class member. A member annotation is audited
 *      against that member's body only, and a `none:` member exception must be qualified
 *      `<Class>.<member>` so the class-level label cannot be read as covering it. This exists
 *      because owner ruling 2026-10-12 (SPK-04 bit-exactness) let a handful of methods inside a
 *      `cc.*`-labelled class keep their own three-r180-exact bodies; the class label alone would
 *      misdescribe them, and rule 2's loop-token test cannot see a loop-free expanded body.
 *
 * Accepted annotation forms (label, then an em-dash separated reason):
 *   // @air-element cc.Vec3
 *   // @air-element gfx:TextureType
 *   // @air-element none: Euler        —— 引擎确无对应；AIR 自持，理由：cc 仅有 Quat
 *   // @air-element removed: SPK-10    —— 随 XR 移除一并排除，不实现
 *   // @air-element none:Matrix4.invert —— 类级标签为 cc.Mat4，此成员按 owner 裁定自持
 *
 * Source-level only, no browser. Prints JSON, exits non-zero on violations.
 */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');

// Overridable so the gate's own parsing can be exercised against fixtures.
const LAYER_FILES = (
    process.env.SPARK_ADAPTER_FILES ||
    [
        'src/air/spark/spark-api-adapter.ts',
        'src/air/spark/spark-math.ts',
        'src/air/spark/pmrem.ts',
        'src/air/spark/cocos-renderer.ts',
        'src/air/spark/cocos-spark-layer.ts',
    ].join(',')
).split(',');
const BARREL_FILES = ['src/air/index.ts', 'src/exports/air.ts', 'src/exports/base.ts', 'src/cc.config.json'];
// Engine surfaces used to prove a `cc.*` / `gfx:*` label names a real element.
const ENGINE_SURFACES = [
    'src/cocos/core/math/index.ts',
    'src/cocos/core/index.ts',
    'src/cocos/core/geometry/index.ts',
    'src/cocos/gfx/base/define.ts',
    'src/cocos/gfx/base/device.ts',
    'src/exports/gfx-webgl2.ts',
    'src/exports/base.ts',
];

const cache = new Map();
const read = (rel) => {
    const key = rel.split(path.sep).join('/');
    if (!cache.has(key)) {
        const abs = path.join(root, key);
        cache.set(key, fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null);
    }
    return cache.get(key);
};

const CATEGORIES = ['cc', 'gfx', 'none', 'removed'];
const ANNOT_RE = /^\s*\/\/\s*@air-element\s+(.+?)\s*$/;
const REASON_SEP = /\s+——\s+|\s+--\s+|\s+—\s+/;
const DECL_RE =
    /^\s*export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(class|function|const|let|var|interface|enum|type)\s+([A-Za-z0-9_$]+)/;
const EXPORT_LIST_RE = /^\s*export\s*\{([^}]*)\}/;
const REEXPORT_RE = /^\s*export\s*\*\s*from/;
const ENGINE_DECL_RE =
    /\bexport\s+(?:declare\s+)?(?:abstract\s+)?(?:class|const|enum|interface|type|function|let|var)\s+([A-Za-z0-9_$]+)/g;
// Member-level annotations: a class keeps its `cc.*` label while individual self-held methods
// declare their own ownership (owner ruling 2026-10-12, SPK-04 bit-exactness).
const MEMBER_RE =
    /^ {2,}(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+|abstract\s+|async\s+|override\s+|get\s+|set\s+)*([A-Za-z_$][\w$]*)\s*[<(]/;
const MEMBER_RESERVED = new Set([
    'if',
    'for',
    'while',
    'switch',
    'catch',
    'return',
    'else',
    'new',
    'function',
    'do',
    'try',
    'finally',
    'throw',
    'await',
    'case',
    'default',
]);
const ENGINE_LIST_RE = /export\s*\{([^}]*)\}(?:\s*from\s*['"]([^'"]+)['"])?/g;
const ENGINE_STAR_RE = /export\s*\*\s*from\s*['"]([^'"]+)['"]/g;

const parseAnnotation = (tail) => {
    const segments = tail.split(REASON_SEP);
    const spec = segments.shift().trim();
    const reason = segments.join(' — ').trim();
    const separator = /[:.]/.exec(spec);
    const category = (separator ? spec.slice(0, separator.index) : spec).trim();
    const symbol = separator ? spec.slice(separator.index + 1).trim() : '';
    return { category, symbol: symbol || spec, label: spec, reason };
};

const resolveSpec = (fromRel, spec) => {
    if (!spec.startsWith('.')) return null;
    const joined = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
    for (const suffix of ['.ts', '/index.ts']) {
        if (read(joined + suffix) !== null) return joined + suffix;
    }
    return null;
};

const collectEngineSymbols = () => {
    const names = new Set();
    const visit = (rel, depth) => {
        const src = read(rel);
        if (src === null) return;
        for (const m of src.matchAll(ENGINE_DECL_RE)) names.add(m[1]);
        for (const m of src.matchAll(ENGINE_LIST_RE)) {
            for (const entry of m[1].split(',')) {
                const token = entry.trim();
                if (token)
                    names.add(
                        /\bas\b/.test(token)
                            ? token
                                  .split(/\s+as\s+/)
                                  .pop()
                                  .trim()
                            : token,
                    );
            }
            if (m[2] && depth > 0) {
                const next = resolveSpec(rel, m[2]);
                if (next) visit(next, depth - 1);
            }
        }
        if (depth > 0) {
            for (const m of src.matchAll(ENGINE_STAR_RE)) {
                const next = resolveSpec(rel, m[1]);
                if (next) visit(next, depth - 1);
            }
        }
    };
    for (const rel of ENGINE_SURFACES) visit(rel, 2);
    return names;
};

const bodyOf = (lines, start) => {
    let depth = 0;
    let seen = false;
    const out = [];
    for (let i = start; i < lines.length; i++) {
        out.push(lines[i]);
        for (const ch of lines[i]) {
            if (ch === '{') {
                depth++;
                seen = true;
            } else if (ch === '}') depth--;
        }
        if (seen && depth <= 0 && i > start) break;
        if (!seen && i > start && DECL_RE.test(lines[i])) break;
    }
    return { body: out.join('\n'), lineCount: out.length };
};

const engineSymbols = collectEngineSymbols();
const findings = [];
const members = [];
const memberAnnots = [];
let reExports = 0;

/**
 * Shared ownership audit for both scopes: a top-level exported declaration (`scope: 'export'`)
 * and a class member carrying its own annotation (`scope: 'member'`).
 */
const auditOwnership = (ctx) => {
    const { rel, index, name, scope, parent, category, symbol, label, reason, body, lineCount } = ctx;
    const issues = [];
    const record = { file: rel, scope, member: name, line: index + 1, label, reason, category };
    if (scope === 'member') record.class = parent;
    if (!CATEGORIES.includes(category)) {
        issues.push({
            file: rel,
            line: index + 1,
            severity: 'FAIL',
            code: 'LABEL_NOT_IN_FOUR_CATEGORIES',
            member: name,
            label,
        });
    } else if (category === 'cc' || category === 'gfx') {
        if (!engineSymbols.has(symbol)) {
            issues.push({
                file: rel,
                line: index + 1,
                severity: 'FAIL',
                code: 'ENGINE_ELEMENT_NOT_EXPORTED',
                member: name,
                label,
                symbol,
            });
        }
        if (!new RegExp(`\\b${symbol}\\b`).test(body)) {
            issues.push({
                file: rel,
                line: index + 1,
                severity: 'FAIL',
                code: 'NO_DELEGATION_REFERENCE',
                member: name,
                label,
            });
        }
        // 计划 §SPK-13 门禁 ②（`ai/plans/spark-integration.md:60`）把「不得自带算法主体」
        // 限定在 `cc.*`；`gfx:*` 的渲染编排层允许循环（§SPK-07 明确保留 isArrayCamera 眼循环
        // 与 uniform/PBO 逃逸面），故此处不对 gfx 采样。
        const algo = category === 'cc' ? /\b(for|while|do)\s*[({]/.exec(body) : null;
        if (algo) {
            issues.push({
                file: rel,
                line: index + 1,
                severity: 'FAIL',
                code: 'OWN_ALGORITHM_BODY',
                member: name,
                label,
                token: algo[1],
            });
        }
        if (lineCount > 80) record.note = `body ${lineCount} lines, review whether this is still field mapping`;
    } else if (category === 'none' && !reason) {
        issues.push({
            file: rel,
            line: index + 1,
            severity: 'FAIL',
            code: 'EMPTY_REASON',
            member: name,
            label,
        });
    } else if (category === 'removed' && !/SPK-10/.test(`${label} ${reason}`)) {
        issues.push({
            file: rel,
            line: index + 1,
            severity: 'FAIL',
            code: 'REMOVED_NOT_TAGGED_SPK10',
            member: name,
            label,
        });
    }
    if (scope === 'member' && category === 'none' && !label.includes(`${parent}.`)) {
        // An exception label must be qualified `<Class>.<member>`, otherwise a reader cannot tell
        // which class it exempts and the class-level label stays ambiguous.
        issues.push({
            file: rel,
            line: index + 1,
            severity: 'FAIL',
            code: 'EXCEPTION_LABEL_NOT_QUALIFIED',
            member: name,
            label,
            expected: `none:${parent}.${name}`,
        });
    }
    return { record, issues };
};

for (const rel of LAYER_FILES) {
    const src = read(rel);
    if (src === null) {
        findings.push({ file: rel, severity: 'BLOCKED', code: 'FILE_MISSING' });
        continue;
    }
    const lines = src.split(/\r?\n/);
    let pending = null;
    let currentClass = null;
    lines.forEach((line, index) => {
        const annot = ANNOT_RE.exec(line);
        if (annot) {
            if (pending)
                findings.push({
                    file: rel,
                    line: pending.line + 1,
                    severity: 'FAIL',
                    code: 'ANNOT_NOT_CONSUMED',
                    label: pending.label,
                });
            pending = { ...parseAnnotation(annot[1]), line: index };
            return;
        }
        if (!line.trim() || /^\s*\/\//.test(line) || /^\s*[/*]/.test(line)) return;

        // Member-level annotation: consumed by the next indented member declaration, and only ever
        // audited against that single method body.
        if (pending && /^ {2,}\S/.test(line)) {
            const mem = MEMBER_RE.exec(line);
            if (mem && !MEMBER_RESERVED.has(mem[1])) {
                if (currentClass === null) {
                    findings.push({
                        file: rel,
                        line: pending.line + 1,
                        severity: 'FAIL',
                        code: 'MEMBER_ANNOTATION_OUTSIDE_CLASS',
                        label: pending.label,
                        followedBy: line.trim().slice(0, 60),
                    });
                } else {
                    const { body, lineCount } = bodyOf(lines, index);
                    const { record, issues } = auditOwnership({
                        rel,
                        index,
                        name: mem[1],
                        scope: 'member',
                        parent: currentClass,
                        body,
                        lineCount,
                        ...pending,
                    });
                    memberAnnots.push(record);
                    findings.push(...issues);
                }
                pending = null;
                return;
            }
        }

        let names = [];
        if (REEXPORT_RE.test(line)) {
            reExports++;
            pending = null;
            return;
        }
        const listMatch = EXPORT_LIST_RE.exec(line);
        const decl = DECL_RE.exec(line);
        if (listMatch) {
            names = listMatch[1]
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
                .map((s) => (/\bas\b/.test(s) ? s.split(/\s+as\s+/)[1].trim() : s));
        } else if (decl) names = [decl[2]];
        else if (/^\s*export\s+default/.test(line)) names = ['default'];

        if (names.length) {
            for (const name of names) {
                if (!pending) {
                    findings.push({
                        file: rel,
                        line: index + 1,
                        severity: 'FAIL',
                        code: 'MISSING_ANNOTATION',
                        member: name,
                    });
                    members.push({ file: rel, member: name, line: index + 1, label: null });
                    continue;
                }
                const { body, lineCount } = bodyOf(lines, index);
                const { record, issues } = auditOwnership({
                    rel,
                    index,
                    name,
                    scope: 'export',
                    parent: null,
                    body,
                    lineCount,
                    ...pending,
                });
                if (decl && decl[1] === 'class') currentClass = name;
                else currentClass = null;
                members.push(record);
                findings.push(...issues);
                pending = null;
            }
            return;
        }
        if (pending) {
            findings.push({
                file: rel,
                line: pending.line + 1,
                severity: 'FAIL',
                code: 'DANGLING_ANNOTATION',
                label: pending.label,
                followedBy: line.trim().slice(0, 60),
            });
            pending = null;
        }
    });
}

const leakage = [];
for (const rel of BARREL_FILES) {
    const src = read(rel);
    if (src === null) continue;
    src.split(/\r?\n/).forEach((l, i) => {
        if (/spark-api-adapter|spark-math|from '\.\/spark'|from '\.\/exports\/spark'/.test(l)) {
            leakage.push({ file: rel, line: i + 1, text: l.trim() });
        }
    });
}

const fail = findings.filter((f) => f.severity === 'FAIL');
const blocked = findings.filter((f) => f.severity === 'BLOCKED');
const result = {
    gate: 'spark-adapter-elements/v1',
    passed: fail.length === 0 && blocked.length === 0 && leakage.length === 0,
    files: LAYER_FILES,
    exportedMembers: members.length,
    annotatedMembers: members.filter((m) => m.label).length,
    memberAnnotations: memberAnnots.length,
    memberExceptions: memberAnnots.map((m) => `${m.class}.${m.member} -> ${m.label}`),
    reExportStars: reExports,
    engineSymbolSurface: engineSymbols.size,
    categories: CATEGORIES.reduce((acc, c) => {
        acc[c] = members.filter((m) => m.category === c).length;
        return acc;
    }, {}),
    rootExportLeakage: leakage,
    findings,
};
console.log(JSON.stringify(result, null, 2));
process.exit(result.passed ? 0 : 1);
