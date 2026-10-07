#!/usr/bin/env node
'use strict';
/**
 * IER-01 输入到画面证据合同（S0 审查修订版）。
 *
 * 本轮纠正：
 * - result 严格枚举 PASS/FAIL/NOT_RUN/BLOCKED/LIMITED；method 枚举 REAL_BROWSER/STEP_CLOCK/NODE_SYNTHETIC/STATIC。
 * - PASS 门槛收紧：真实 browser、正尺寸 viewport 对象、有限正 DPR、结构化事件/模型/布局/提交帧、
 *   有效 observationTimestamp、execution{command,cwd,exitCode}、完整 app/sdk/harness 已知指纹、
 *   非空真实 PNG（SHA+bytes+实际解码）。UNKNOWN/MISSING/null 一律不能 PASS。
 * - 已给出的非法值必须拒绝：NaN/Infinity/负 DPR、非法 result、坏 PNG（截断即便 hash 正确也拒绝）。
 * - SDK/app/harness 漂移按 context 当前身份核对，known drift 即拒绝（不局限于 PASS）。
 * - 可见性 oracle 由 context.visibilityOracle 冻结，从 PNG 真实像素复算；oracle 缺失拒 PASS。
 * - 原来源 unobserved 不能 reference-matching PASS；recreated 功能 PASS 必须显式 referenceComparison 受限。
 * - NODE_SYNTHETIC 不能冒充 REAL_BROWSER；SYNTHETIC 合同记录须带 limitations。
 * - 输入结构非法返回失败，不抛 TypeError。
 *
 * 字段契约：22 个原始必填 + method + execution = 24 必填；referenceComparison/pngDimensions 可选。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SCHEMA_VERSION = 'ier-evidence/2';
const ROOT = path.resolve(__dirname, '../..');

const RESULT_ENUM = ['PASS', 'FAIL', 'NOT_RUN', 'BLOCKED', 'LIMITED'];
const METHOD_ENUM = ['REAL_BROWSER', 'STEP_CLOCK', 'NODE_SYNTHETIC', 'STATIC'];
const SOURCE_STATUS = ['observed', 'unobserved', 'recreated', 'scope-cropped', 'environment-limited'];

// 22 个原始字段 + method + execution（首版报告误称 24，实际旧列表 22；现如实扩充为 24 必填）
const REQUIRED_FIELDS = [
    'runId', 'caseId',
    'appFingerprint', 'sdkFingerprint', 'harnessFingerprint',
    'browser', 'viewport', 'dpr', 'inputMethod', 'seed',
    'receivedEvent', 'modelState', 'layoutReceipt', 'submittedFrame',
    'pngPath', 'pngSha256', 'pngBytes', 'observationTimestamp',
    'sourceStatus', 'comparisonDimensions', 'limitations', 'result',
    'method', 'execution',
];

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const HEX40_RE = /^[0-9a-f]{40}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;
const UNKNOWN = 'UNKNOWN';

// ── PNG 解码（pngjs 经 NODE_PATH；可注入 context.decodePNG）──
function decodePngBytes (bytes, context) {
    if (context && typeof context.decodePNG === 'function') return context.decodePNG(bytes);
    try {
        // eslint-disable-next-line global-require
        const { PNG } = require('pngjs');
        return { ok: true, png: PNG.sync.read(bytes) };
    } catch (e) {
        return { ok: false, error: `PNG decode failed: ${String(e.message).split('\n')[0]}` };
    }
}

// ── 可见性 oracle：从真实像素复算 ──
function evaluateVisibility (png, oracle) {
    if (!oracle || typeof oracle !== 'object') return { ok: false, reason: 'oracle missing' };
    const { region, kind, minPixels } = oracle;
    if (!Array.isArray(region) || region.length !== 4 || region.some((v) => !Number.isSafeInteger(v) || v < 0)) {
        return { ok: false, reason: 'oracle region must be [x,y,w,h] non-negative finite' };
    }
    const [x0, y0, w, h] = region;
    if (w < 1 || h < 1) return { ok: false, reason: 'oracle region w/h must be >=1' };
    if (x0 + w > png.width || y0 + h > png.height) {
        return { ok: false, reason: `oracle region ${w}x${h}@(${x0},${y0}) exceeds PNG ${png.width}x${png.height}` };
    }
    if (!Number.isFinite(minPixels) || minPixels < 1) return { ok: false, reason: 'oracle minPixels must be >=1' };
    if (oracle.expectedCentroid !== undefined && (!Array.isArray(oracle.expectedCentroid)
        || oracle.expectedCentroid.length !== 2 || oracle.expectedCentroid.some(v => !Number.isFinite(v)))) {
        return { ok: false, reason: 'oracle expectedCentroid must contain two finite coordinates' };
    }
    if (oracle.tolerance !== undefined && (!Number.isFinite(oracle.tolerance) || oracle.tolerance < 0)) {
        return { ok: false, reason: 'oracle tolerance must be finite and non-negative' };
    }
    let hits = 0;
    let sx = 0; let sy = 0;
    let cornerR = -1; let cornerG = -1; let cornerB = -1;
    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            const idx = (png.width * (y0 + dy) + (x0 + dx)) << 2;
            const r = png.data[idx]; const g = png.data[idx + 1]; const b = png.data[idx + 2];
            if (dy === 0 && dx === 0) { cornerR = r; cornerG = g; cornerB = b; }
            let hit = false;
            switch (kind) {
                case 'red': hit = r > 150 && r - g > 60 && r - b > 60; break;
                case 'bright': hit = (r + g + b) / 3 > 200; break;
                case 'non-uniform': hit = Math.abs(r - cornerR) + Math.abs(g - cornerG) + Math.abs(b - cornerB) > 45; break;
                default: return { ok: false, reason: `oracle kind "${kind}" unsupported (red|bright|non-uniform)` };
            }
            if (hit) { hits += 1; sx += x0 + dx; sy += y0 + dy; }
        }
    }
    if (hits < minPixels) return { ok: false, reason: `visibility oracle FAIL: ${hits} hit pixels < minPixels ${minPixels}` };
    const result = { ok: true, hits, minPixels };
    if (oracle.expectedCentroid) {
        const [ecx, ecy] = oracle.expectedCentroid;
        const tol = Number.isFinite(oracle.tolerance) ? oracle.tolerance : 2;
        const cx = sx / hits; const cy = sy / hits;
        if (Math.abs(cx - ecx) > tol || Math.abs(cy - ecy) > tol) {
            return { ok: false, reason: `centroid (${cx.toFixed(1)},${cy.toFixed(1)}) outside tolerance ${tol} of (${ecx},${ecy})` };
        }
        result.centroid = [Number(cx.toFixed(2)), Number(cy.toFixed(2))];
    }
    return result;
}

// ── 小工具 ──
const isKnownCommit = (v) => typeof v === 'string' && HEX40_RE.test(v);
const isKnownSha = (v) => typeof v === 'string' && HEX64_RE.test(v);
const isStructured = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0;
const isUnknown = (v) => v === UNKNOWN || v === 'MISSING' || v === undefined;

function fingerprintSha (fp) {
    if (typeof fp === 'string') return fp;
    if (fp && typeof fp === 'object') return fp.sha256 ?? fp.sdkModuleSha256 ?? null;
    return null;
}

function resolvePngPath (p) {
    return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

// ── 主校验 ──
function validateEvidence (record, context = {}) {
    const failures = [];
    const warnings = [];
    try {
        if (!record || typeof record !== 'object' || Array.isArray(record)) {
            return { ok: false, failures: ['record must be a non-array object'], warnings };
        }
        if (record.schemaVersion !== SCHEMA_VERSION) failures.push(`schemaVersion ${JSON.stringify(record.schemaVersion)} != ${SCHEMA_VERSION}`);

        // 必填字段
        for (const field of REQUIRED_FIELDS) {
            if (!(field in record)) failures.push(`field ${field} MISSING`);
        }
        // 身份字段非空字符串
        for (const field of ['runId', 'caseId']) {
            if (field in record && (typeof record[field] !== 'string' || record[field].length === 0)) failures.push(`${field} must be non-empty string`);
        }
        // result / method 枚举
        if ('result' in record && !RESULT_ENUM.includes(record.result)) failures.push(`result "${record.result}" not in [${RESULT_ENUM.join('|')}]`);
        if ('method' in record && !METHOD_ENUM.includes(record.method)) failures.push(`method "${record.method}" not in [${METHOD_ENUM.join('|')}]`);
        // sourceStatus 枚举
        if ('sourceStatus' in record && !SOURCE_STATUS.includes(record.sourceStatus)) {
            failures.push(`sourceStatus "${record.sourceStatus}" not in [${SOURCE_STATUS.join('|')}]`);
        }

        const result = record.result;
        const isPass = result === 'PASS';

        // ── 数值/时间字段的非法值一律拒绝（无论 result）──
        if ('dpr' in record) {
            const dpr = record.dpr;
            if (typeof dpr === 'number') {
                if (!Number.isFinite(dpr) || dpr <= 0) failures.push(`dpr invalid number: ${dpr}`);
            } else if (dpr !== UNKNOWN && dpr !== null && typeof dpr !== 'string') {
                failures.push(`dpr invalid type: ${typeof dpr}`);
            }
            if (dpr === null) failures.push('dpr null — use UNKNOWN explicitly');
        }
        if ('pngBytes' in record) {
            const pb = record.pngBytes;
            if (typeof pb === 'number' && (!Number.isFinite(pb) || pb < 0)) failures.push(`pngBytes invalid: ${pb}`);
            if (pb === null) failures.push('pngBytes null — use 0 + MISSING pngPath, or UNKNOWN');
        }
        if ('viewport' in record && record.viewport !== null && typeof record.viewport === 'object') {
            const { width, height } = record.viewport;
            if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
                failures.push(`viewport invalid dimensions: ${JSON.stringify(record.viewport)}`);
            }
        }
        // null 观测一律拒绝（必须显式 UNKNOWN）
        for (const field of ['receivedEvent', 'modelState', 'layoutReceipt', 'observationTimestamp', 'browser', 'inputMethod', 'seed']) {
            if (record[field] === null) failures.push(`${field} null — use explicit UNKNOWN for unknown values`);
        }

        // ── 身份漂移：known 值与 context 当前身份不符即拒绝（不限 PASS）──
        const recSdkSha = fingerprintSha(record.sdkFingerprint);
        if (isKnownSha(recSdkSha) && context.sdkModuleSha256 && recSdkSha !== context.sdkModuleSha256) {
            failures.push(`SDK drift: evidence=${recSdkSha.slice(0, 8)} current=${context.sdkModuleSha256.slice(0, 8)}`);
        }
        const recAppCommit = record.appFingerprint?.commit;
        const recAppSha = fingerprintSha(record.appFingerprint);
        if (isKnownCommit(recAppCommit) && context.appCommit && recAppCommit !== context.appCommit) {
            failures.push(`app commit drift: evidence=${recAppCommit.slice(0, 8)} current=${context.appCommit.slice(0, 8)}`);
        }
        if (isKnownSha(recAppSha) && context.appSha256 && recAppSha !== context.appSha256) {
            failures.push(`app sha drift: evidence=${recAppSha.slice(0, 8)} current=${context.appSha256.slice(0, 8)}`);
        }
        const recHarnessSha = fingerprintSha(record.harnessFingerprint);
        if (isKnownSha(recHarnessSha) && context.harnessSha256 && recHarnessSha !== context.harnessSha256) {
            failures.push(`harness drift: evidence=${recHarnessSha.slice(0, 8)} current=${context.harnessSha256.slice(0, 8)}`);
        }

        // ── 晚到报告：selectedRun/selectedCase 不符即拒绝 ──
        if (context.selectedRunId && record.runId && record.runId !== context.selectedRunId) {
            failures.push(`stale report: runId=${record.runId} but selectedRun=${context.selectedRunId}`);
        }
        if (context.selectedCaseId && record.caseId && record.caseId !== context.selectedCaseId) {
            failures.push(`stale report: caseId=${record.caseId} but selectedCase=${context.selectedCaseId}`);
        }

        // ── sourceStatus 与 result 组合 ──
        if (record.sourceStatus === 'unobserved' && isPass) failures.push('unobserved source cannot claim PASS');
        // AFTER_DRAW 仅提交：不等于像素观测
        if (record.submittedFrame?.event === 'AFTER_DRAW' && isPass) {
            warnings.push('AFTER_DRAW means submitted only; PASS additionally required pixel evidence above');
        }

        // ── SYNTHETIC 约束 ──
        const hasSyntheticNote = Array.isArray(record.limitations) && record.limitations.some((l) => /synthetic/i.test(String(l)));
        if (record.method === 'NODE_SYNTHETIC' && !hasSyntheticNote) failures.push('NODE_SYNTHETIC record must declare synthetic limitation');
        if (record.method === 'REAL_BROWSER' && hasSyntheticNote) failures.push('method REAL_BROWSER cannot carry synthetic limitation');
        if (record.method === 'NODE_SYNTHETIC' && isPass) failures.push('NODE_SYNTHETIC cannot claim PASS (contract test only, not browser evidence)');
        if (record.method === 'STATIC' && isPass) failures.push('STATIC analysis cannot claim PASS');

        // ── recreated 功能 PASS 必须显式声明 referenceComparison 受限 ──
        if (record.sourceStatus === 'recreated' && isPass) {
            const rc = record.referenceComparison;
            if (!rc || rc.result === undefined) failures.push('recreated PASS must declare referenceComparison explicitly');
            else if (rc.result === 'PASS') failures.push('recreated functional PASS cannot also claim referenceComparison PASS (fidelity is NOT_RUN/LIMITED at best)');
        }

        // ── PNG：先身份后解码（给出的 PNG 必须真实可解码）──
        let decoded = null;
        if ('pngPath' in record && typeof record.pngPath === 'string' && record.pngPath !== 'MISSING' && record.pngPath.length > 0) {
            const abs = resolvePngPath(record.pngPath);
            let bytes = null;
            try {
                bytes = fs.readFileSync(abs);
            } catch (e) {
                failures.push(`PNG MISSING on disk: ${record.pngPath}`);
            }
            if (bytes) {
                const actualSha = crypto.createHash('sha256').update(bytes).digest('hex');
                if (record.pngSha256 && record.pngSha256 !== UNKNOWN && actualSha !== record.pngSha256) {
                    failures.push(`PNG SHA drift: recorded=${String(record.pngSha256).slice(0, 8)} actual=${actualSha.slice(0, 8)}`);
                }
                if (typeof record.pngBytes === 'number' && Number.isFinite(record.pngBytes) && bytes.length !== record.pngBytes) {
                    failures.push(`PNG bytes mismatch: recorded=${record.pngBytes} actual=${bytes.length}`);
                }
                const dec = decodePngBytes(bytes, context);
                if (!dec.ok) failures.push(`PNG UNDECODABLE: ${dec.error}`);
                else decoded = dec.png;
                if (decoded && record.pngDimensions) {
                    const [ew, eh] = Array.isArray(record.pngDimensions) ? record.pngDimensions : [record.pngDimensions.width, record.pngDimensions.height];
                    if (decoded.width !== ew || decoded.height !== eh) failures.push(`PNG dimensions mismatch: recorded=${ew}x${eh} actual=${decoded.width}x${decoded.height}`);
                }
            }
        }

        // ── 可见性 oracle：只要给出已解码 PNG + oracle 即复算（与 result 声明无关）──
        let visibility = null;
        if (decoded && context.visibilityOracle) {
            visibility = evaluateVisibility(decoded, context.visibilityOracle);
            if (!visibility.ok) warnings.push(`visibility: ${visibility.reason}`);
        }

        // ── PASS 门槛（全部满足才允许 PASS）──
        if (isPass) {
            const passRequirements = [];
            if (typeof record.browser !== 'string' || record.browser === UNKNOWN || record.browser.length === 0) passRequirements.push('browser known');
            if (!isStructured(record.viewport)) passRequirements.push('viewport structured {width,height}');
            if (typeof record.dpr !== 'number' || !Number.isFinite(record.dpr) || record.dpr <= 0) passRequirements.push('dpr finite positive number');
            if (typeof record.inputMethod !== 'string' || record.inputMethod === UNKNOWN) passRequirements.push('inputMethod known');
            for (const field of ['receivedEvent', 'modelState', 'layoutReceipt']) {
                if (!isStructured(record[field])) passRequirements.push(`${field} structured observation`);
            }
            if (!isStructured(record.submittedFrame) || record.submittedFrame.event === UNKNOWN) passRequirements.push('submittedFrame known');
            if (typeof record.observationTimestamp !== 'string' || !ISO_RE.test(record.observationTimestamp)) passRequirements.push('observationTimestamp valid ISO');
            const exec = record.execution;
            if (!isStructured(exec) || typeof exec.command !== 'string' || !exec.command || typeof exec.cwd !== 'string' || !exec.cwd
                || exec.exitCode !== 0 || !ISO_RE.test(exec.startedAt || '') || !ISO_RE.test(exec.endedAt || '')
                || !Number.isFinite(Date.parse(exec.startedAt)) || !Number.isFinite(Date.parse(exec.endedAt))
                || Date.parse(exec.endedAt) < Date.parse(exec.startedAt)) {
                passRequirements.push('execution {command,cwd,exitCode}');
            }
            if (!context.sdkModuleSha256 || !context.appSha256 || !context.harnessSha256) {
                passRequirements.push('current SDK/app/harness SHA pinned by caller');
            }
            if (!context.visibilityOracle) passRequirements.push('frozen context.visibilityOracle');
            for (const key of ['appFingerprint', 'sdkFingerprint', 'harnessFingerprint']) {
                const fp = record[key];
                if (!isStructured(fp) || typeof fp.path !== 'string' || !fp.path || !Number.isSafeInteger(fp.bytes) || fp.bytes < 1) {
                    passRequirements.push(`${key} path/bytes`);
                    continue;
                }
                try {
                    const b = fs.readFileSync(path.resolve(ROOT, fp.path));
                    if (b.length !== fp.bytes || crypto.createHash('sha256').update(b).digest('hex') !== fingerprintSha(fp)) {
                        passRequirements.push(`${key} actual disk identity`);
                    }
                } catch (error) { passRequirements.push(`${key} readable path`); }
            }
            if (!isKnownSha(record.pngSha256) || !Number.isSafeInteger(record.pngBytes) || record.pngBytes < 1) {
                passRequirements.push('PNG explicit SHA/bytes');
            }
            if (!isKnownSha(fingerprintSha(record.sdkFingerprint))) passRequirements.push('sdkFingerprint known sha256');
            const appKnown = isKnownCommit(recAppCommit) || isKnownSha(recAppSha);
            if (!appKnown) passRequirements.push('appFingerprint known commit/sha256');
            if (!isKnownSha(recHarnessSha)) passRequirements.push('harnessFingerprint known sha256');
            if (typeof record.pngPath !== 'string' || record.pngPath === 'MISSING' || record.pngPath.length === 0) passRequirements.push('pngPath real path');
            if (!decoded) passRequirements.push('decodable PNG verified above');
            if (record.method !== 'REAL_BROWSER' && record.method !== 'STEP_CLOCK') passRequirements.push('method REAL_BROWSER/STEP_CLOCK');
            if (passRequirements.length > 0) failures.push(`PASS gate unmet: ${passRequirements.join('; ')}`);

            // 像素可复算：oracle 必须由 context 冻结提供
            if (decoded && passRequirements.length === 0) {
                if (!context.visibilityOracle) {
                    failures.push('PASS requires frozen context.visibilityOracle (pixel recomputation), which is missing');
                } else {
                    // 视口与截图尺寸一致性（CSS px 或 DPR 缩放后 ±1px）
                    if (isStructured(record.viewport) && typeof record.dpr === 'number') {
                        const vw = record.viewport.width; const vh = record.viewport.height;
                        const okW = Math.abs(decoded.width - vw) <= 1 || Math.abs(decoded.width - vw * record.dpr) <= 1;
                        const okH = Math.abs(decoded.height - vh) <= 1 || Math.abs(decoded.height - vh * record.dpr) <= 1;
                        if (!okW || !okH) failures.push(`PNG/viewport size mismatch: png=${decoded.width}x${decoded.height} viewport=${vw}x${vh} dpr=${record.dpr}`);
                    }
                    if (!visibility || !visibility.ok) {
                        failures.push(`visibility: ${visibility ? visibility.reason : 'oracle evaluation missing'}`);
                    } else {
                        warnings.push(`visibility recomputed from pixels: ${visibility.hits} hits`);
                    }
                }
            }
        }

        return { ok: failures.length === 0, failures, warnings, decoded, visibility };
    } catch (e) {
        return { ok: false, failures: [`validator crashed on invalid structure: ${String(e.message).split('\n')[0]}`], warnings };
    }
}

/** 合同测试用 SYNTHETIC 记录（非真实浏览器正例；默认 NOT_RUN）。 */
function makeSyntheticRecord (overrides = {}) {
    return {
        schemaVersion: SCHEMA_VERSION,
        runId: 'synthetic-run-1',
        caseId: 'synthetic-case-1',
        appFingerprint: { commit: UNKNOWN },
        sdkFingerprint: { sdkModuleSha256: UNKNOWN },
        harnessFingerprint: { sha256: UNKNOWN },
        browser: UNKNOWN,
        viewport: UNKNOWN,
        dpr: UNKNOWN,
        inputMethod: UNKNOWN,
        seed: UNKNOWN,
        receivedEvent: UNKNOWN,
        modelState: UNKNOWN,
        layoutReceipt: UNKNOWN,
        submittedFrame: { event: UNKNOWN },
        pngPath: 'MISSING',
        pngSha256: 'MISSING',
        pngBytes: 0,
        observationTimestamp: UNKNOWN,
        sourceStatus: 'unobserved',
        comparisonDimensions: [],
        limitations: ['SYNTHETIC contract test, not real browser evidence'],
        result: 'NOT_RUN',
        method: 'NODE_SYNTHETIC',
        execution: { command: UNKNOWN, cwd: UNKNOWN, exitCode: UNKNOWN },
        ...overrides,
    };
}

module.exports = {
    validateEvidence, makeSyntheticRecord, evaluateVisibility, decodePngBytes,
    REQUIRED_FIELDS, RESULT_ENUM, METHOD_ENUM, SOURCE_STATUS, SCHEMA_VERSION,
};

if (require.main === module) {
    const fileArg = process.argv.find((a) => a.startsWith('--verify='));
    if (!fileArg) { console.error('usage: --verify=<report.json>'); process.exit(2); }
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(fileArg.slice(9), 'utf8')); } catch (e) {
        console.error(JSON.stringify({ ok: false, failures: [`report unreadable: ${String(e.message).split('\n')[0]}`] }));
        process.exit(1);
    }
    const records = Array.isArray(parsed) ? parsed : [parsed];
    // CLI 不信任报告自报身份：直接从盘面重算当前 SDK/app 身份
    let context = {};
    try {
        const baseline = require('./interactive-improvement-baseline.cjs');
        const id = baseline.currentIdentity();
        context = {
            sdkModuleSha256: id.sdkModule.present ? id.sdkModule.sha256 : undefined,
            appCommit: id.appCommit,
        };
    } catch (e) {
        context = { identityError: String(e.message).split('\n')[0] };
    }
    let allOk = true;
    for (const [i, rec] of records.entries()) {
        const r = validateEvidence(rec, context);
        console.log(`record[${i}]: ok=${r.ok} failures=${r.failures.length}`);
        for (const f of r.failures) { allOk = false; console.log(`  FAIL: ${f}`); }
    }
    process.exit(allOk ? 0 : 1);
}
