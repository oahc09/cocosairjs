/*
 * port-gap-evidence-schema — PG-34 增量证据报告 schema v1 与机器校验。
 *
 * 依据（ai/plans/port-gap-remediation.md §13.1）：每份新报告至少记录
 * candidate/source/contract/runner/browser/application 指纹（适用者）、命令/cwd/起止/exit、
 * 真实用例数与 skip、scope/subset/completed、测量/模拟方式、原始输出路径；失败按
 * infrastructure/application/engine/resource-deployment/environment 分 stage；证据类型
 * （SOURCE_CHECKED…USER_CONFIRMED）与执行状态（PASS/FAIL/NOT_RUN/BLOCKED/NOT_APPLICABLE，
 * 未配置单列 NOT_CONFIGURED）分开记录，且不能靠排序继承；旧 PASS 不能覆盖当轮失败。
 *
 * 本模块是 schema 的唯一执行定义（docs/reference/port-gap-evidence-schema.md 是人读合同）。
 * 校验纯函数、不读仓库（--verify-paths 时才检查原始输出文件存在），可在 Jest 中直接 require。
 *
 * 用法：
 *   node tools/verify/port-gap-evidence-schema.cjs --report=<file.json> [--verify-paths] [--quiet]
 *   node tools/verify/port-gap-evidence-schema.cjs --selftest
 * 退出码：0 = 校验通过；1 = 报告被拒绝；2 = 用法/执行错误。
 */
const fs = require('fs');

const SCHEMA_VERSION = 'port-gap-evidence/1';

const GATES = ['EG0', 'EG1', 'EG2', 'EG3', 'EG4', 'EG5', 'AG1', 'AG2', 'AIG'];
// 仪器化 gate：USER_CONFIRMED 不能替代其仪器证明（§13.1"用户确认不自动升级任一仪器化 gate"）。
const INSTRUMENTED_GATES = ['EG0', 'EG1', 'EG2', 'EG3', 'EG4', 'EG5', 'AIG'];
const EVIDENCE_TYPES = [
    'SOURCE_CHECKED',
    'MODEL_PASS',
    'CONTRACT_DOUBLE_PASS',
    'ENGINE_HEADLESS_PASS',
    'BROWSER_INPUT_PASS',
    'BROWSER_RENDER_PASS',
    'GPU_MEASURED',
    'USER_CONFIRMED',
];
const EXECUTION_STATUSES = ['PASS', 'FAIL', 'NOT_RUN', 'BLOCKED', 'NOT_APPLICABLE'];
const FAILURE_STAGES = ['infrastructure', 'application', 'engine', 'resource-deployment', 'environment'];
const FINGERPRINT_KEYS = ['candidate', 'source', 'contract', 'runner', 'browser', 'application'];
const FINGERPRINT_ITEM_STATUSES = ['NOT_RUN', 'NOT_CONFIGURED', 'NOT_APPLICABLE'];
const METHOD_KINDS = [
    'REAL_BROWSER', // 真实浏览器（含真实输入通道）
    'ENGINE_HEADLESS', // 真实引擎 headless（jsdom/Node 侧真实运行时）
    'CONTRACT_STATIC', // 静态合同/源码核对
    'SYNTHETIC', // 合成输入/合成事件（必须披露 limitations，不与真实等同）
    'MODEL', // 模型/替身推断（不得冒充 GPU/浏览器实测）
];

// ── 工具 ────────────────────────────────────────────────────────────────────

function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function isIsoDate(v) {
    return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}
function isHex64(v) {
    return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
}

/** 构造一条错误；rule 用稳定 id，供测试与门禁断言。 */
function err(rule, message) {
    return { rule, message };
}

/** 指纹条目校验：present:true 需要 sha256+path；present:false 必须显式状态与原因。 */
function checkFingerprintEntry(key, entry, add) {
    if (!isPlainObject(entry)) {
        add('fingerprints.shape', `fingerprints.${key} 必须是对象`);
        return false;
    }
    if (entry.present === true) {
        if (!isHex64(entry.sha256)) add('fingerprints.sha256', `fingerprints.${key}.sha256 必须是 64 位 hex（sha256）`);
        if (typeof entry.path !== 'string' || !entry.path) add('fingerprints.path', `fingerprints.${key}.path 必须给出定位路径`);
        if (entry.algorithm && entry.algorithm !== 'sha256') {
            add('fingerprints.algorithm', `fingerprints.${key}.algorithm 仅支持 sha256`);
        }
        return true;
    }
    if (entry.present === false) {
        if (!FINGERPRINT_ITEM_STATUSES.includes(entry.status)) {
            add('fingerprints.status', `fingerprints.${key}.status 必须是 ${FINGERPRINT_ITEM_STATUSES.join('|')}，如实披露缺失而非留空`);
        }
        if (typeof entry.reason !== 'string' || !entry.reason) {
            add('fingerprints.reason', `fingerprints.${key}.present=false 必须给出 reason`);
        }
        return false;
    }
    add('fingerprints.present', `fingerprints.${key}.present 必须显式 true/false`);
    return false;
}

/** 执行条目（execution 或 attempts[i]）的公共字段校验，返回 {status, ok}。 */
function checkExecutionCommon(label, exec, add) {
    if (!isPlainObject(exec)) {
        add('execution.shape', `${label} 必须是对象`);
        return { status: null, ok: false };
    }
    const status = exec.status;
    if (!EXECUTION_STATUSES.includes(status)) {
        add('execution.status', `${label}.status 必须是 ${EXECUTION_STATUSES.join('|')}`);
        return { status: null, ok: false };
    }
    if (status === 'PASS' || status === 'FAIL') {
        if (typeof exec.command !== 'string' || !exec.command) add('execution.command', `${label}.status=${status} 必须记录实际命令`);
        if (typeof exec.cwd !== 'string' || !exec.cwd) add('execution.cwd', `${label}.status=${status} 必须记录 cwd`);
        if (!isIsoDate(exec.startedAt)) add('execution.startedAt', `${label}.status=${status} 必须记录 startedAt`);
        if (!isIsoDate(exec.endedAt)) add('execution.endedAt', `${label}.status=${status} 必须记录 endedAt`);
        if (typeof exec.exitCode !== 'number') add('execution.exitCode', `${label}.status=${status} 必须记录 exitCode（数字）`);
        if (isIsoDate(exec.startedAt) && isIsoDate(exec.endedAt) && Date.parse(exec.endedAt) < Date.parse(exec.startedAt)) {
            add('execution.timeOrder', `${label}.endedAt 早于 startedAt`);
        }
    }
    if (status === 'NOT_RUN' || status === 'BLOCKED' || status === 'NOT_APPLICABLE') {
        if (typeof exec.reason !== 'string' || !exec.reason) {
            add('execution.reason', `${label}.status=${status} 必须给出 reason（如实记录，不得留空）`);
        }
    }
    return { status, ok: true };
}

// ── 主校验 ──────────────────────────────────────────────────────────────────

/**
 * 校验一份 PG-34 证据报告。
 * 返回 { ok, errors:[{rule,message}], warnings:[{rule,message}] }。
 * options.verifyPaths=true 时额外检查 rawOutputs 指向的文件存在（默认不查盘）。
 */
function validatePortGapReport(report, options = {}) {
    const errors = [];
    const warnings = [];
    const add = (rule, message) => errors.push(err(rule, message));
    const warn = (rule, message) => warnings.push(err(rule, message));

    if (!isPlainObject(report)) {
        return { ok: false, errors: [err('report.shape', '报告根必须是 JSON 对象')], warnings };
    }
    if (report.schemaVersion !== SCHEMA_VERSION) {
        add('schemaVersion', `schemaVersion 必须是 "${SCHEMA_VERSION}"`);
    }
    if (!GATES.includes(report.gate)) add('gate', `gate 必须是 ${GATES.join('|')}`);
    if (!isPlainObject(report.subject) || typeof report.subject.description !== 'string' || !report.subject.description.trim()) {
        add('subject', 'subject.description 必须非空（说明本报告验证什么）');
    }

    // ── 证据类型与执行状态分离 ──
    const evidenceTypes = report.evidenceTypes;
    if (!Array.isArray(evidenceTypes) || evidenceTypes.length === 0) {
        add('evidenceTypes', 'evidenceTypes 必须是非空数组（证据类型与执行状态分开记录）');
    } else {
        for (const t of evidenceTypes) {
            if (!EVIDENCE_TYPES.includes(t)) add('evidenceTypes', `未知证据类型: ${t}`);
        }
        const dup = evidenceTypes.filter((t, i) => evidenceTypes.indexOf(t) !== i);
        if (dup.length) add('evidenceTypes', `证据类型重复: ${dup.join(',')}`);
    }

    // ── 执行状态 ──
    const execution = report.execution;
    const execResult = checkExecutionCommon('execution', execution, add);
    const status = execResult.status;
    if (status === 'FAIL' && (!report.failureStage || !FAILURE_STAGES.includes(report.failureStage))) {
        add('failureStage', `status=FAIL 必须声明 failureStage ∈ ${FAILURE_STAGES.join('|')}（基础设施/应用/引擎/资源部署/环境分开）`);
    }
    if (status === 'BLOCKED' && (typeof (execution && execution.blockedBy) !== 'string' || !(execution && execution.blockedBy).trim())) {
        add('blockedBy', 'status=BLOCKED 必须给出 execution.blockedBy（缺什么材料/批准）');
    }

    // ── 当轮 attempts：旧/早失败不能被一个后续 PASS 无声覆盖 ──
    let attempts = Array.isArray(report.attempts) ? report.attempts : null;
    if (attempts) {
        attempts.forEach((a, i) => {
            const r = checkExecutionCommon(`attempts[${i}]`, a, add);
            if (r.status === 'FAIL' || r.status === 'NOT_RUN') {
                const sup = a.supersededBy;
                // An unresolved attempt is honest under FAIL/NOT_RUN. Only a
                // final PASS requires compensation; supplied links must always
                // be valid, even when the final scope remains incomplete.
                if (sup === undefined && status !== 'PASS') return;
                if (typeof sup !== 'number' || !Number.isInteger(sup) || sup <= i || sup >= attempts.length) {
                    add('attempts.supersededBy', `attempts[${i}].status=${r.status} 必须给出 supersededBy（指向本轮更晚的补偿 attempt 下标），否则最终 PASS 无效`);
                } else if (!attempts[sup] || !['PASS', 'FAIL'].includes(attempts[sup].status)) {
                    add('attempts.supersededBy', `attempts[${i}].supersededBy=${sup} 必须指向一个实际执行的补偿 attempt`);
                }
            }
        });
        const unresolved = attempts.some((a, i) => (a.status === 'FAIL' || a.status === 'NOT_RUN') && !(typeof a.supersededBy === 'number'));
        if (unresolved && status === 'PASS') {
            add('attempts.coverage', '当轮存在未补偿的 FAIL/NOT_RUN attempt 时，报告不得标 PASS（旧 PASS 不覆盖当轮失败）');
        }
    }

    // ── scope / subset / completed ──
    const scope = report.scope;
    if (!isPlainObject(scope)) {
        add('scope', 'scope 必须是对象 { declared[], subset, completed, totalCases, measuredCases, skippedCases, skippedDetail[] }');
    } else {
        const declaredEmpty = !Array.isArray(scope.declared) || scope.declared.length === 0;
        const total = scope.totalCases;
        if (declaredEmpty && !(typeof total === 'number' && total > 0)) {
            add('scope.empty', 'scope 不得为空：declared 必须列出验证范围，或给出 totalCases>0 的实际用例集');
        }
        if ([total, scope.measuredCases, scope.skippedCases].every(value => Number.isSafeInteger(value) && value >= 0)) {
            if (scope.measuredCases + scope.skippedCases !== total) {
                add('scope.counts', `measuredCases(${scope.measuredCases}) + skippedCases(${scope.skippedCases}) 必须等于 totalCases(${total})`);
            }
        } else {
            add('scope.counts', 'scope.totalCases/measuredCases/skippedCases 必须是非负安全整数（真实用例数与 skip 分开）');
        }
        if (Array.isArray(scope.skippedDetail) && typeof scope.skippedCases === 'number' && scope.skippedDetail.length !== scope.skippedCases) {
            add('scope.skipDetail', `skippedDetail 条数(${scope.skippedDetail.length})必须等于 skippedCases(${scope.skippedCases})`);
        }
        if (scope.completed === true) {
            if (scope.subset === true) add('scope.completed', 'subset=true 时不得标 completed=true（子集完成不是全量完成）');
            if (scope.skippedCases > 0) add('scope.completed', `存在 ${scope.skippedCases} 个 skip 时不得标 completed=true`);
            if (status !== 'PASS') add('scope.completed', `completed=true 要求执行状态 PASS（当前 ${status}）`);
        }
    }

    // ── 指纹 ──
    const fps = report.fingerprints;
    const fingerprintPresent = {};
    if (!isPlainObject(fps)) {
        add('fingerprints', `fingerprints 必须是对象，且 ${FINGERPRINT_KEYS.join('/')} 每键显式 present`);
    } else {
        for (const key of FINGERPRINT_KEYS) {
            if (!(key in fps)) {
                add('fingerprints.required', `fingerprints.${key} 缺失：不适用的键也要显式 present:false + 状态 + 原因`);
                fingerprintPresent[key] = false;
                continue;
            }
            fingerprintPresent[key] = checkFingerprintEntry(key, fps[key], add);
        }
    }

    // ── 测量/模拟方式 ──
    const method = report.method;
    if (!isPlainObject(method)) {
        add('method', 'method 必须是对象 { kind, detail }（测量/模拟方式必须披露）');
    } else {
        if (!METHOD_KINDS.includes(method.kind)) add('method.kind', `method.kind 必须是 ${METHOD_KINDS.join('|')}`);
        if (typeof method.detail !== 'string' || !method.detail.trim()) add('method.detail', 'method.detail 必须说明如何测量或模拟');
        if ((method.kind === 'SYNTHETIC' || method.kind === 'MODEL') && status === 'PASS') {
            if (typeof method.limitations !== 'string' || !method.limitations.trim()) {
                add('method.limitations', `method.kind=${method.kind} 的 PASS 必须披露 limitations（合成/模型不与真实等同）`);
            }
        }
        if ((method.kind === 'REAL_BROWSER') && !fingerprintPresent.browser) {
            add('method.browser', 'method.kind=REAL_BROWSER 要求 browser 指纹 present:true');
        }
    }

    // ── 证据类型 × 指纹/方式交叉 ──
    const types = Array.isArray(evidenceTypes) ? evidenceTypes : [];
    if (types.some((t) => t === 'BROWSER_INPUT_PASS' || t === 'BROWSER_RENDER_PASS') && !fingerprintPresent.browser) {
        add('evidence.browser', 'BROWSER_* 证据要求 browser 指纹 present:true');
    }
    if (types.includes('ENGINE_HEADLESS_PASS') && !fingerprintPresent.runner) {
        add('evidence.runner', 'ENGINE_HEADLESS_PASS 要求 runner 指纹 present:true');
    }
    if (types.includes('GPU_MEASURED')) {
        const gpu = report.measurements && report.measurements.gpu;
        if (!isPlainObject(gpu)) {
            add('evidence.gpu', 'GPU_MEASURED 要求 measurements.gpu 记录实测块（不可用时 available:false + unavailableReason）');
        } else {
            if (gpu.available === true && gpu.inferred === true) {
                add('evidence.gpu', 'measurements.gpu.inferred=true 与 GPU_MEASURED 矛盾：GPU 不可用保留 unavailable，不得用替身推断');
            }
            if (gpu.available !== true && typeof gpu.unavailableReason !== 'string') {
                add('evidence.gpu', 'GPU 不可用必须给出 measurements.gpu.unavailableReason');
            }
        }
    }
    if (status === 'PASS' && types.includes('USER_CONFIRMED')) {
        const instrumentedOnly = INSTRUMENTED_GATES.includes(report.gate) && types.every((t) => t === 'USER_CONFIRMED');
        if (instrumentedOnly) {
            add('evidence.userConfirmed', '仪器化 gate 不得仅凭 USER_CONFIRMED 标 PASS（用户确认不自动升级仪器化 gate）');
        }
    }

    // ── 候选身份 ──
    if (status === 'PASS' && !fingerprintPresent.candidate) {
        add('candidate', 'status=PASS 必须带 present:true 的 candidate 指纹（同候选可定位）');
    }

    // ── 原始输出 ──
    const raw = report.rawOutputs;
    if (status === 'PASS' || status === 'FAIL') {
        if (!isPlainObject(raw)) {
            add('rawOutputs', `status=${status} 必须记录 rawOutputs（stdout/stderr/截图/日志的原始路径）`);
        } else {
            const hasAny =
                ['stdout', 'stderr'].some((k) => raw[k] && typeof raw[k].path === 'string') ||
                (Array.isArray(raw.screenshots) && raw.screenshots.length > 0) ||
                (Array.isArray(raw.logs) && raw.logs.length > 0);
            if (!hasAny) add('rawOutputs', 'rawOutputs 至少要有一个 stdout/stderr/截图/日志路径');
        }
    }
    if (options.verifyPaths && isPlainObject(raw)) {
        const paths = [];
        if (raw.stdout && raw.stdout.path) paths.push(raw.stdout.path);
        if (raw.stderr && raw.stderr.path) paths.push(raw.stderr.path);
        for (const s of raw.screenshots || []) if (s && s.path) paths.push(s.path);
        for (const l of raw.logs || []) if (l && l.path) paths.push(l.path);
        for (const p of paths) {
            if (!fs.existsSync(p)) add('rawOutputs.exists', `原始输出不存在: ${p}`);
        }
    }

    // ── AG 外部材料 ──
    if ((report.gate === 'AG1' || report.gate === 'AG2') && status === 'PASS') {
        const ext = report.externalMaterials;
        if (!isPlainObject(ext) || ext.available !== true) {
            add('externalMaterials', `${report.gate} 的 PASS 要求 externalMaterials.available=true；外部材料不可达时保持待材料，不得生成兼容/验收 PASS`);
        }
    }

    // ── 证据继承 ──
    const prior = report.priorEvidence;
    if (isPlainObject(prior) && prior.inherited === true && status === 'PASS') {
        const currentCandidate = fps && fps.candidate && fps.candidate.present === true ? fps.candidate.sha256 : null;
        if (!isHex64(prior.candidateFingerprint) || !currentCandidate || prior.candidateFingerprint !== currentCandidate) {
            add('priorEvidence', '继承旧证据的 PASS 要求 priorEvidence.candidateFingerprint 与当前 candidate 指纹一致（证据维度不靠排序继承）');
        }
    }

    // ── NOT_CONFIGURED 披露 ──
    if (Array.isArray(report.notConfigured)) {
        report.notConfigured.forEach((n, i) => {
            if (!isPlainObject(n) || n.status !== 'NOT_CONFIGURED' || typeof n.item !== 'string') {
                add('notConfigured', `notConfigured[${i}] 必须 { item, status:'NOT_CONFIGURED', detail }`);
            }
        });
    }

    // ── 完成声明一致性提示（warning）──
    if (scope && scope.subset === true && status === 'PASS' && !(report.subject && /subset|子集/.test(report.subject.description))) {
        warn('scope.subsetHint', 'subset=true 的 PASS：subject 描述宜显式声明这是子集运行，避免被读成全量验收');
    }

    return { ok: errors.length === 0, errors, warnings };
}

// ── 合法样例（测试/模板基线；字段值均为占位，不指向真实运行）────────────────

function makeValidReport() {
    const now = new Date().toISOString();
    return {
        schemaVersion: SCHEMA_VERSION,
        gate: 'EG1',
        subject: { tasks: ['PG-XX'], description: '示例合同验证（subset：仅合同正负例）' },
        evidenceTypes: ['ENGINE_HEADLESS_PASS'],
        execution: { status: 'PASS', command: 'node example-runner.cjs', cwd: '/repo', startedAt: now, endedAt: now, exitCode: 0 },
        attempts: [
            { status: 'FAIL', command: 'node example-runner.cjs', cwd: '/repo', startedAt: now, endedAt: now, exitCode: 1, note: '首跑发现断言失败', supersededBy: 1 },
            { status: 'PASS', command: 'node example-runner.cjs', cwd: '/repo', startedAt: now, endedAt: now, exitCode: 0, note: '修复后重跑' },
        ],
        scope: {
            declared: ['contract-positive', 'contract-negative'],
            subset: true,
            completed: false,
            totalCases: 2,
            measuredCases: 2,
            skippedCases: 0,
            skippedDetail: [],
        },
        method: { kind: 'ENGINE_HEADLESS', detail: 'Node 内加载真实运行时并断言返回值' },
        fingerprints: {
            candidate: { present: true, sha256: 'a'.repeat(64), path: 'build/cocosair.module.js', algorithm: 'sha256' },
            source: { present: true, sha256: 'b'.repeat(64), path: 'src/', algorithm: 'sha256' },
            contract: { present: true, sha256: 'c'.repeat(64), path: 'test/', algorithm: 'sha256' },
            runner: { present: true, sha256: 'd'.repeat(64), path: 'tools/verify/', algorithm: 'sha256' },
            browser: { present: false, status: 'NOT_APPLICABLE', reason: '本合同验证不需要浏览器' },
            application: { present: false, status: 'NOT_APPLICABLE', reason: '引擎侧合同验证，不含外部应用' },
        },
        rawOutputs: { stdout: { path: 'build/reports/example-stdout.txt' }, screenshots: [], logs: [] },
    };
}

// ── 内建自测：合法样例通过；典型虚假报告必须被对应规则拒绝 ───────────────────

function selftest() {
    const cases = [];
    const expectOk = (name, report) => cases.push({ name, report, expectPass: true });
    const expectFail = (name, report, rule) => cases.push({ name, report, expectPass: false, rule });

    expectOk('valid PASS report', makeValidReport());

    // 虚假 PASS：无命令/无退出码/无原始输出
    {
        const r = makeValidReport();
        delete r.execution.command;
        delete r.execution.exitCode;
        delete r.rawOutputs;
        expectFail('false PASS (no command/exit/rawOutputs)', r, 'execution.command');
    }
    // 空 scope
    {
        const r = makeValidReport();
        r.scope.declared = [];
        r.scope.totalCases = 0;
        expectFail('empty scope', r, 'scope.empty');
    }
    // 缺 candidate 指纹的 PASS
    {
        const r = makeValidReport();
        r.fingerprints.candidate = { present: false, status: 'NOT_RUN', reason: 'build 未跑' };
        expectFail('PASS without candidate fingerprint', r, 'candidate');
    }
    // 指纹键缺失（不显式 present）
    {
        const r = makeValidReport();
        delete r.fingerprints.browser;
        expectFail('missing fingerprint key', r, 'fingerprints.required');
    }
    // 未补偿 FAIL + 最终 PASS
    {
        const r = makeValidReport();
        r.attempts = [{ status: 'FAIL', startedAt: r.execution.startedAt, endedAt: r.execution.endedAt, exitCode: 1 }];
        expectFail('unresolved FAIL under PASS', r, 'attempts.supersededBy');
    }
    // 仅 USER_CONFIRMED 支撑仪器化 gate PASS
    {
        const r = makeValidReport();
        r.evidenceTypes = ['USER_CONFIRMED'];
        expectFail('USER_CONFIRMED only', r, 'evidence.userConfirmed');
    }
    // BROWSER 证据无 browser 指纹
    {
        const r = makeValidReport();
        r.evidenceTypes = ['BROWSER_RENDER_PASS'];
        r.method = { kind: 'ENGINE_HEADLESS', detail: 'x' };
        expectFail('BROWSER evidence without browser fingerprint', r, 'evidence.browser');
    }
    // GPU 替身推断
    {
        const r = makeValidReport();
        r.evidenceTypes = ['GPU_MEASURED'];
        r.measurements = { gpu: { available: false, inferred: true } };
        expectFail('GPU inferred placeholder', r, 'evidence.gpu');
    }
    // AG 无外部材料却 PASS
    {
        const r = makeValidReport();
        r.gate = 'AG1';
        expectFail('AG1 PASS without materials', r, 'externalMaterials');
    }
    // 合成方式 PASS 未披露限制
    {
        const r = makeValidReport();
        r.method = { kind: 'SYNTHETIC', detail: '合成事件' };
        expectFail('SYNTHETIC PASS without limitations', r, 'method.limitations');
    }
    // subset 标 completed
    {
        const r = makeValidReport();
        r.scope.completed = true;
        expectFail('subset marked completed', r, 'scope.completed');
    }
    // 继承证据指纹不符
    {
        const r = makeValidReport();
        r.priorEvidence = { inherited: true, candidateFingerprint: 'e'.repeat(64) };
        expectFail('inherited evidence fingerprint mismatch', r, 'priorEvidence');
    }

    let failures = 0;
    for (const c of cases) {
        const result = validatePortGapReport(c.report);
        const pass = result.ok === c.expectPass && (!c.expectPass || true);
        const ruleHit = !result.ok && c.rule ? result.errors.some((e) => e.rule === c.rule) : true;
        if (c.expectPass && !result.ok) {
            console.error(`[port-gap-evidence] selftest FAIL ${c.name}: 意外拒绝 ${JSON.stringify(result.errors)}`);
            failures++;
        } else if (!c.expectPass && (result.ok || !ruleHit)) {
            console.error(`[port-gap-evidence] selftest FAIL ${c.name}: 期望规则 ${c.rule} 拒绝，实际 ${result.ok ? '通过' : JSON.stringify(result.errors)}`);
            failures++;
        } else {
            console.log(`[port-gap-evidence] selftest ok ${c.name}`);
        }
    }
    console.log(`[port-gap-evidence] selftest ${cases.length - failures}/${cases.length} passed`);
    return failures === 0 ? 0 : 1;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function main(argv) {
    if (argv.includes('--selftest')) process.exit(selftest());
    let reportPath = null;
    let verifyPaths = false;
    let quiet = false;
    for (const a of argv) {
        const m = a.match(/^--report=(.*)$/);
        if (m) reportPath = m[1];
        else if (a === '--verify-paths') verifyPaths = true;
        else if (a === '--quiet') quiet = true;
        else {
            console.error(`[port-gap-evidence] 用法错误: ${a}`);
            console.error('  node tools/verify/port-gap-evidence-schema.cjs --report=<file.json> [--verify-paths] [--quiet]');
            console.error('  node tools/verify/port-gap-evidence-schema.cjs --selftest');
            process.exit(2);
        }
    }
    if (!reportPath) {
        console.error('[port-gap-evidence] 需要 --report=<file.json>');
        process.exit(2);
    }
    let report;
    try {
        report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    } catch (e) {
        console.error(`[port-gap-evidence] 无法读取报告: ${e.message}`);
        process.exit(2);
    }
    const result = validatePortGapReport(report, { verifyPaths });
    if (!quiet) {
        for (const w of result.warnings) console.warn(`[port-gap-evidence] WARN ${w.rule}: ${w.message}`);
        for (const e of result.errors) console.error(`[port-gap-evidence] REJECT ${e.rule}: ${e.message}`);
    }
    if (result.ok) {
        if (!quiet) console.log(`[port-gap-evidence] ACCEPT ${reportPath} (${(report.gate || '?')} / ${(report.execution && report.execution.status) || '?'})`);
        process.exit(0);
    }
    console.error(`[port-gap-evidence] REJECTED ${reportPath}: ${result.errors.length} 项违规`);
    process.exit(1);
}

module.exports = {
    SCHEMA_VERSION,
    GATES,
    INSTRUMENTED_GATES,
    EVIDENCE_TYPES,
    EXECUTION_STATUSES,
    FAILURE_STAGES,
    FINGERPRINT_KEYS,
    METHOD_KINDS,
    validatePortGapReport,
    makeValidReport,
};

if (require.main === module) main(process.argv.slice(2));
