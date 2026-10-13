#!/usr/bin/env node
/**
 * SPK-04 验收工具：`tests/math-parity` 的等价在位复跑（Three.js r180 作 oracle）。
 *
 * 用法：
 *   node tools/verify/spark-math-parity.cjs                        # 完整回路（含隔离安装）
 *   node tools/verify/spark-math-parity.cjs --iterations 1000      # 指定迭代数（默认与移植件一致：1000）
 *   node tools/verify/spark-math-parity.cjs --skip-install         # 离线复跑：复用已有隔离安装
 *   node tools/verify/spark-math-parity.cjs --skip-adapter         # 跳过 SPK-05a 附加块
 *   node tools/verify/spark-math-parity.cjs --evidence <path>      # 覆盖证据输出路径（`--evidence=<path>` 亦可）
 *
 * 默认证据路径是 output/spk04-math-parity-latest.json（scratch），**不是** docs/evidence/spark/**：
 * 裸跑与负控跑（--skip-adapter）都不该覆盖已发布报告。发布必须显式给出 --evidence。
 *
 * 纪律：
 * - Three.js 只以「隔离参考安装」存在：`npm install three@0.180.0 --prefix output/spark-math-parity
 *   --no-save --no-package-lock`。仓库根 node_modules、package.json、package-lock.json 均不变动；
 *   目标运行时代码不引用 three（计划 §1.3「Three.js 只存在于独立参考页」）。
 *   先例：tools/benchmark/prepare-cost-retest.mjs:277 同样把 three 留在隔离目录。
 *   three 只当 oracle，本仓不含其派生代码（SPK-04 的数学层为纯 `cc.*` 委托），故不在
 *   docs/THIRD_PARTY_LICENSES.md 登记；该登记曾因一版「逐位对齐」自持实现存在，已于 2026-10-13 随回退撤销。
 * - 只读引用移植件 `E:/AIProMax/github/spark-cocosairjs/tests/math-parity.mjs`，不写该仓库。
 * - 本工具不改写 src/**；它只调用 jest（ts-jest 转译链，能解析引擎 TS import 图）并落证据。
 * - 失败如实记录：不放宽容差、不把收窄的覆盖说成通过。verdict 只取 PASS / PARTIAL / BLOCKED。
 * - 覆盖完整性由 scopeAudit 机器推导（见 §4）：narrowedScope 每组必须显式声明不属数学层并给出 ownerTask +
 *   复跑/门禁锚点，且 Texture/RenderTarget 形状两组必须由附加块在本 harness 内真实复跑通过并计入判定；
 *   任一条件不成立就停在 PARTIAL。`--skip-adapter` 因此不可能判 PASS。
 *   PASS 语义 = 计划 §SPK-04 验收线（数学层声明范围内位等价），≠ 移植件原型套件全量在本层复现。
 */
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PREFIX = path.join(ROOT, 'output', 'spark-math-parity');
const THREE_PKG = path.join(PREFIX, 'node_modules', 'three');
const THREE_ENTRY = path.join(THREE_PKG, 'build', 'three.cjs');
const RESULTS = path.join(PREFIX, 'results.json');
const TARGET_REL = 'src/air/spark/spark-math.ts';
const TARGET = path.join(ROOT, TARGET_REL);
const TEST_REL = 'test/parity/spark-math-parity.test.ts';
const CONFIG_REL = 'test/spark-math-parity.jest.config.js';
const PORT_TEST = 'E:/AIProMax/github/spark-cocosairjs/tests/math-parity.mjs';
const THREE_SPEC = 'three@0.180.0';

const argv = process.argv.slice(2);
// Accepts both `--name value` and `--name=value`. The `=` form used to be silently ignored, which made an
// npm script's `--evidence=output/...` fall through to the default and overwrite accepted evidence.
const arg = (name, fallback) => {
    const eq = argv.find((a) => a.startsWith(`--${name}=`));
    if (eq !== undefined) {
        const value = eq.slice(`--${name}=`.length);
        if (value) return value;
    }
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const ITERATIONS = Number(arg('iterations', process.env.MATH_PARITY_ITERATIONS || '1000'));
// Default output is scratch under output/, NOT the accepted evidence tree: a bare run (including a
// negative-control run) must never clobber a published report. Publishing is an explicit act.
const EVIDENCE_PATH = path.resolve(ROOT, arg('evidence', 'output/spk04-math-parity-latest.json'));
const ARTIFACTS_DIR = path.join(path.dirname(EVIDENCE_PATH), `${path.basename(EVIDENCE_PATH, '.json')}-artifacts`);

const sha256 = (abs) => crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
const readJson = (abs) => JSON.parse(fs.readFileSync(abs, 'utf8'));
const exists = (abs) => fs.existsSync(abs);
const tail = (text, limit = 4000) => {
    const s = String(text == null ? '' : text);
    return s.length <= limit ? s : `…(截断，共 ${s.length} 字符)\n` + s.slice(-limit);
};

const commands = [];
/** 原始（未截断）输出留在内存里供 artifacts 日志落盘，不进 JSON 主体。 */
const rawOutput = new Map();

/**
 * 执行一条命令并把命令原文 + 退出码 + 输出落进 evidence.commands。
 * opts.shell === false 时用 argv 直接 spawn：Windows 上 node.exe 路径含空格，
 * 交给 shell 拼串会被拆坏（首次实测得到 `'D:\Program' is not recognized`，
 * 那是一条根本没跑起来的命令，不能当成测试结果）；故 jest 走无 shell 路线。
 */
function run(label, cmdline, spawnArgs, opts = {}) {
    const startedAt = new Date().toISOString();
    const res = spawnSync(spawnArgs[0], spawnArgs.slice(1), {
        cwd: opts.cwd || ROOT,
        encoding: 'utf8',
        shell: opts.shell !== false,
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, ...(opts.env || {}) },
    });
    const record = {
        id: label,
        command: cmdline,
        spawnMode: opts.shell !== false ? 'shell' : 'argv（无 shell，兼容含空格的解释器路径）',
        cwd: path.relative(ROOT, opts.cwd || ROOT).replace(/\\/g, '/') || '.',
        exitCode: res.status,
        signal: res.signal || null,
        error: res.error ? String(res.error.message) : null,
        startedAt,
        endedAt: new Date().toISOString(),
        stdoutTail: tail(res.stdout, 2500),
        stderrTail: tail(res.stderr, 2500),
    };
    rawOutput.set(label, {
        stdout: String(res.stdout || ''),
        stderr: String(res.stderr || ''),
        error: res.error ? String((res.error && res.error.stack) || res.error) : '',
    });
    commands.push(record);
    return record;
}

function git(cmdline) {
    const res = spawnSync(cmdline, { cwd: ROOT, encoding: 'utf8', shell: true });
    return res.status === 0 ? String(res.stdout).trim() : `（命令失败 exit=${res.status}）`;
}

// ---------------------------------------------------------------------------
// 1) 隔离的 Three.js 参考安装
// ---------------------------------------------------------------------------
let installRecord;
if (flag('skip-install')) {
    installRecord = {
        id: 'three-install',
        command: `（跳过：--skip-install，复用 ${path.relative(ROOT, THREE_PKG).replace(/\\/g, '/')}）`,
        exitCode: null,
        skipped: true,
        present: exists(THREE_ENTRY),
    };
    commands.push(installRecord);
} else {
    const cmdline = `npm install ${THREE_SPEC} --prefix output/spark-math-parity --no-save --no-package-lock`;
    installRecord = run('three-install', cmdline, ['npm', ...cmdline.replace('npm ', '').split(' ')]);
}

const threePresent = exists(THREE_ENTRY);
// threePresent === false 时没有 oracle，复跑直接跳过，verdict 走 BLOCKED 分支（不放行、不伪造）。

// ---------------------------------------------------------------------------
// 2) 复跑（jest + ts-jest，能解析 spark-math 的引擎 TS import 图）
// ---------------------------------------------------------------------------
let jestRecord = null;
let replayFreshness = null;
if (threePresent) {
    const env = { MATH_PARITY_ITERATIONS: String(ITERATIONS) };
    if (flag('skip-adapter')) env.SPARK_MATH_PARITY_SKIP_ADAPTER = '1';
    const jestBin = path.join(ROOT, 'node_modules', 'jest', 'bin', 'jest.js');
    // 先删掉上一轮的 results.json：证据里的计数只能出自本次执行，不能复用陈旧产物。
    let priorRemoved = false;
    let priorRemoveError = null;
    try {
        if (exists(RESULTS)) {
            fs.rmSync(RESULTS);
            priorRemoved = true;
        }
    } catch (e) {
        priorRemoveError = `${e.name}: ${e.message}`;
    }
    const runStartedMs = Date.now();
    jestRecord = run(
        'jest-replay',
        `"${process.execPath}" "${jestBin}" --config ${CONFIG_REL} --runInBand`,
        [process.execPath, jestBin, '--config', CONFIG_REL, '--runInBand'],
        { env, shell: false },
    );
    let resultsMtimeMs = null;
    try {
        resultsMtimeMs = fs.statSync(RESULTS).mtimeMs;
    } catch (e) {
        resultsMtimeMs = null;
    }
    replayFreshness = {
        priorResultsRemovedBeforeRun: priorRemoved,
        priorRemoveError,
        resultsMtime: resultsMtimeMs == null ? null : new Date(resultsMtimeMs).toISOString(),
        writtenByThisRun: resultsMtimeMs != null && resultsMtimeMs >= runStartedMs,
        note: 'writtenByThisRun=false 时 results.json 属陈旧产物，verdict 直接降为 BLOCKED，不拿旧数据当本轮结论。',
    };
} else {
    commands.push({
        id: 'jest-replay',
        command: '（未执行：隔离的 three 不存在）',
        exitCode: null,
        skipped: true,
    });
}

// ---------------------------------------------------------------------------
// 3) 汇总
// ---------------------------------------------------------------------------
let replay = null;
let replayReadError = null;
try {
    replay = readJson(RESULTS);
} catch (e) {
    replayReadError = `${e.name}: ${e.message}`;
}

const counts = replay ? replay.collected : null;
const isolated = replay ? replay.isolated : null;
const assertRun = replay ? replay.assertRun : null;

/** 端口测试摘要的等价物：字段名与移植件一致，未复跑的项目显式写 not-replayed，不留空假装。 */
const summary = replay
    ? {
          cubeCamera: 'not-replayed（SPK-05a/07：CubeCamera 对象契约，不在数学层）',
          coordinateSystems: 'not-replayed（同上，移植件为 2）',
          randomPoses: 'not-replayed（同上，移植件为 64）',
          totalChecks: counts.checks,
          float32Components: counts.float32Components,
          float32BitMismatches: counts.float32BitMismatches,
          signedZeroMismatches: counts.signedZeroMismatches,
          float32MismatchByOperation: counts.float32MismatchByOperation,
          // 以下为本次回路附加的等价字段（端口测试同样统计但未打印）
          nonzeroFloat32Mismatches: counts.float32BitMismatches - counts.signedZeroMismatches,
          signedZeroByOperation: counts.signedZeroByOperation,
          toleranceViolations: counts.toleranceViolations,
          toleranceViolationByOperation: counts.toleranceViolationByOperation,
          maxAbsoluteError: counts.maxAbsoluteError,
          maxErrorByOperation: counts.maxErrorByOperation,
          iterationsCompleted: counts.iterationsCompleted,
      }
    : null;

/** 逐操作差异清单：把「哪个操作、差多少、输入是什么」摊开，不用容差掩盖。 */
const mismatches = [];
if (counts) {
    const failing = new Set([
        ...Object.keys(counts.float32MismatchByOperation || {}),
        ...Object.keys(counts.toleranceViolationByOperation || {}),
    ]);
    for (const name of [...failing].sort()) {
        const samples = (counts.toleranceViolationSamples || []).filter((s) => s.name === name);
        const bitSamples = (counts.float32MismatchSamples || []).filter((s) => s.name === name);
        mismatches.push({
            operation: name,
            float32BitMismatches: counts.float32MismatchByOperation[name] || 0,
            signedZeroMismatches: counts.signedZeroByOperation[name] || 0,
            toleranceViolations: counts.toleranceViolationByOperation[name] || 0,
            maxError: counts.maxErrorByOperation[name] || 0,
            bitOnly: (counts.toleranceViolationByOperation[name] || 0) === 0,
            isolatedRootCauseAttribution: isolated
                ? {
                      toleranceViolationsWithOracleQuaternionInput: isolated.toleranceViolationByOperation[name] || 0,
                      maxErrorWithOracleQuaternionInput: isolated.maxErrorByOperation[name] || 0,
                  }
                : null,
            inputSummary: (samples.length ? samples : bitSamples).slice(0, 3).map((s) => ({
                componentIndex: s.index,
                air: s.air,
                reference: s.reference,
                absError: s.error,
                airFloat32Bits: s.airBits,
                referenceFloat32Bits: s.referenceBits,
                seededInputs: s.inputs,
            })),
        });
    }
}

/**
 * 表头「已登记分歧」审计：对每个超差操作，在 spark-math.ts 的文件头注释块里找对应关键词，
 * 命中则把原文摘录出来供人工判断「这条差异是否属已声明的合同级分歧」。纯文本交叉核对，
 * 不替人下结论：documentedInHeader 只表示「头部注释提到该 API」，是否覆盖当前差异需读原文。
 */
const HEADER_KEYWORDS = {
    'quaternion from Euler': ['setFromEuler', 'Quaternion'],
    'Euler from quaternion': ['setFromQuaternion', 'Euler'],
    lookAt: ['lookAt'],
    'parented lookAt matrix': ['lookAt'],
    'world direction': ['lookAt'],
    'decompose quaternion': ['decompose', 'toSRT'],
    'decompose scale': ['decompose', 'toSRT'],
    'decompose position': ['decompose', 'toSRT'],
    inverse: ['invert'],
    'projection inverse': ['invert'],
    compose: ['compose', 'fromSRT'],
    determinant: ['determinant'],
    'vector transform': ['applyMatrix4', 'transformMat4'],
    'quaternion transform': ['applyQuaternion', 'transformQuat'],
    'mat3 inverse': ['Mat3.invert', 'invert'],
    project: ['project'],
    'box min': ['Box3', 'applyMatrix4'],
    'box max': ['Box3', 'applyMatrix4'],
    color: ['Color', 'fromHEX'],
    'default color': ['Color'],
};

function headerAudit() {
    if (!exists(TARGET)) return null;
    const lines = fs.readFileSync(TARGET, 'utf8').split(/\r?\n/);
    const headerEnd = lines.findIndex((l) => l.startsWith('import '));
    const header = lines.slice(0, headerEnd < 0 ? 160 : headerEnd);
    const ops = mismatches.map((m) => m.operation);
    const perOp = {};
    for (const op of ops) {
        const keys = HEADER_KEYWORDS[op] || [];
        const hits = [];
        header.forEach((l, idx) => {
            if (keys.some((k) => l.includes(k))) hits.push({ line: idx + 1, text: l.trim() });
        });
        perOp[op] = { keywords: keys, headerMentionsFound: hits.length > 0, matchedHeaderLines: hits.slice(0, 6) };
    }
    // 逐位差异的客观指纹：当前 _w 项写的是 cz 还是 sz（Three r180 与移植件都是 sz）。
    const wTermLine = lines.findIndex((l) => /this\._w = cx \* cy \* cz/.test(l));
    return {
        headerLineSpan: [1, headerEnd < 0 ? 160 : headerEnd],
        perOperation: perOp,
        setFromEulerWLastFactor:
            wTermLine < 0
                ? 'not-found'
                : {
                      fileLine: wTermLine + 1,
                      text: lines[wTermLine].trim(),
                      usesCz: /sy \* cz;/.test(lines[wTermLine]),
                      oracleExpects:
                          'sz（three/src/math/Quaternion.js 与移植件 src/air-math.js:497 均为 signs[3]*sx*sy*sz）',
                  },
    };
}

// ---------------------------------------------------------------------------
// 4) verdict
// ---------------------------------------------------------------------------
let verdict = 'BLOCKED';
let verdictReasoning = '';

/**
 * scopeComplete 由证据推导，不硬编码、也不靠口头判断「覆盖已经够了」。条件：
 *   a) narrowedScope 的每一组都显式声明不属于数学层（inMathLayerScope === false），并给出 ownerTask
 *      以及至少一个复跑/门禁锚点（replayedHereBy 或 owningGate）；
 *   b) 其中能在本 harness 内复跑的两组（DataTexture/DataArrayTexture 与 WebGLArrayRenderTarget 形状）
 *      由 supplementary.adapterScope 真实执行、声明计入判定且状态为 passed。
 * 任一条件不成立 → 维持 PARTIAL。PASS 的含义是计划 §SPK-04 验收线（数学层声明范围内位等价），
 * 不等于移植件原型套件在本 harness 内全量复现；未复现分组的归属随 narrowedScope 原样写入报告。
 */
const adapterScope = replay && replay.supplementary ? replay.supplementary.adapterScope : null;
const scopeAudit = replay
    ? {
          rule: 'narrowed groups must each declare inMathLayerScope=false + ownerTask + (replayedHereBy|owningGate); the adapter-shape groups must be replayed here and counted',
          declaredGroups: (replay.narrowedScope || []).length,
          unattributedGroups: (replay.narrowedScope || [])
              .filter(
                  (g) =>
                      g.inMathLayerScope !== false || !g.ownerTask || (!g.replayedHereBy && !g.owningGate) || !g.reason,
              )
              .map((g) => g.section),
          adapterScopeDeclaredCounted: !!(adapterScope && adapterScope.countedInVerdict === true),
          adapterScopeAttempted: !!(adapterScope && adapterScope.attempted === true),
          adapterScopeStatus: adapterScope ? adapterScope.status : null,
      }
    : null;
const scopeComplete = !!(
    scopeAudit &&
    scopeAudit.declaredGroups > 0 &&
    scopeAudit.unattributedGroups.length === 0 &&
    scopeAudit.adapterScopeDeclaredCounted &&
    scopeAudit.adapterScopeAttempted &&
    scopeAudit.adapterScopeStatus === 'passed'
);

if (!threePresent) {
    verdictReasoning =
        `BLOCKED：隔离的 Three.js 参考安装不可用（${THREE_ENTRY} 不存在），` +
        `安装命令退出码 ${installRecord && installRecord.exitCode}，` +
        `stderr 原文见 commands[three-install]。没有 oracle 就没有位模式基准，未做任何替代性放宽，也未伪造通过。`;
} else if (jestRecord && (jestRecord.exitCode === null || jestRecord.error)) {
    verdictReasoning =
        `BLOCKED：复跑命令本身没有执行成功（exit=${jestRecord.exitCode}，spawn error=${jestRecord.error}），` +
        `原文见 commands[jest-replay] 与 artifacts 日志。命令未跑起来不等于测试通过，也不拿上一轮产物充当本轮结论。`;
} else if (!replay) {
    verdictReasoning =
        `BLOCKED：three 已就位（${THREE_ENTRY}），但复跑未产出 results.json（读取错误 ${replayReadError}；` +
        `jest 退出码 ${jestRecord && jestRecord.exitCode}）。` +
        `这通常是 ${TARGET_REL} 或引擎 import 图在当前时刻不可转译（该文件正由并行任务编辑），` +
        `stderr 原文见 commands[jest-replay]。`;
} else if (!replayFreshness.writtenByThisRun) {
    verdictReasoning =
        `BLOCKED：results.json 非本轮产物（本轮删除旧件后 mtime=${replayFreshness.resultsMtime}，` +
        `writtenByThisRun=${replayFreshness.writtenByThisRun}，jest exit=${jestRecord && jestRecord.exitCode}）。` +
        `不引用陈旧计数下结论。`;
} else if (
    counts.toleranceViolations === 0 &&
    counts.float32BitMismatches - counts.signedZeroMismatches === 0 &&
    assertRun &&
    assertRun.completedWithoutFailure
) {
    verdict = scopeComplete ? 'PASS' : 'PARTIAL';
    verdictReasoning = scopeComplete
        ? 'PASS：全部数学层操作在位模式与容差上等价（容差未放宽），且原型套件的四个非数学分组逐组归属并有复跑/门禁锚点，' +
          'Texture/RenderTarget 形状两组已在本 harness 内对隔离 three@0.180.0 oracle 复跑通过并计入判定。' +
          'PASS 的含义是计划 §SPK-04 验收线（数学层声明范围内位等价），不是移植件原型套件的全量复现——Splat 字节面与 ' +
          'CubeCamera/XR 对象面分别由 npm run verify:spark-cpu-parity 与像素门禁/SPK-10 XR deviation 承担，见 narrowedScope。'
        : `PARTIAL：数学层覆盖范围内零差异（含 ±0 之外无位差），但覆盖完整性条件未全部成立——` +
          `未归属分组 ${JSON.stringify(scopeAudit ? scopeAudit.unattributedGroups : 'n/a')}，` +
          `adapterScope 计入判定=${scopeAudit && scopeAudit.adapterScopeDeclaredCounted}，` +
          `状态=${scopeAudit ? scopeAudit.adapterScopeStatus : 'n/a'}。` +
          `移植件的纹理/RT/Splat/CubeCamera 组属 SPK-05a/07/11，未在本层复现时覆盖相对原型被收窄。`;
} else {
    verdict = 'PARTIAL';
    const top = mismatches
        .filter((m) => m.toleranceViolations > 0)
        .sort((a, b) => b.maxError - a.maxError)
        .slice(0, 6)
        .map((m) => `${m.operation}(${m.toleranceViolations} 次超差，最大 ${m.maxError.toExponential(2)})`)
        .join('；');
    verdictReasoning =
        `PARTIAL：复跑在位模式上真实失败——${ITERATIONS} 次迭代全量覆盖 ${counts.checks} 项检查/` +
        `${counts.float32Components} 个 float32 分量，其中 ${counts.float32BitMismatches} 个位不一致` +
        `（含 ${counts.signedZeroMismatches} 个仅 ±0 符号差异），${counts.toleranceViolations} 次超出移植件原容差` +
        `（默认 2e-10，project 1e-8，未放宽）。超差操作：${top}。` +
        `isolated 趟（把四元数输入统一为 oracle 值）把根因收敛到 ${Object.keys(isolated.toleranceViolationByOperation || {}).length} 处` +
        `（${Object.entries(isolated.toleranceViolationByOperation || {})
            .map(([k, v]) => `${k}:${v}`)
            .join('，')}）；` +
        `其余超差是这些根因的传染。移植件的纹理/RT/Splat/CubeCamera 组亦未复现，覆盖相对原型收窄。`;
}

const evidence = {
    schema: 'spark-integration-evidence/1',
    task: 'SPK-04',
    acceptanceLine: 'ai/plans/spark-integration.md:162 验收：`tests/math-parity` 的等价复跑在位模式上通过（见 SPK-13）',
    generatedAt: new Date().toISOString(),
    verdict,
    verdictReasoning,
    scopeComplete,
    environment: {
        repoRoot: ROOT.replace(/\\/g, '/'),
        gitHead: git('git rev-parse HEAD'),
        node: process.version,
        npm:
            commands.find((c) => c.id === 'three-install') && !installRecord.skipped
                ? '见 commands[three-install].stdoutTail'
                : '本次未调用 npm',
        jest: (() => {
            try {
                return readJson(path.join(ROOT, 'node_modules', 'jest', 'package.json')).version;
            } catch (e) {
                return `unavailable: ${e.message}`;
            }
        })(),
        tsJest: (() => {
            try {
                return readJson(path.join(ROOT, 'node_modules', 'ts-jest', 'package.json')).version;
            } catch (e) {
                return `unavailable: ${e.message}`;
            }
        })(),
        typescript: (() => {
            try {
                return require('typescript').version;
            } catch (e) {
                return `unavailable: ${e.message}`;
            }
        })(),
    },
    commands,
    oracle: {
        package: 'three',
        requestedSpec: THREE_SPEC,
        installLocation: path.relative(ROOT, THREE_PKG).replace(/\\/g, '/'),
        isolation:
            'npm install --prefix output/spark-math-parity --no-save --no-package-lock：不进仓库根 node_modules，' +
            '不改 package.json/package-lock.json；three 仅作为验证回路的 oracle（计划 §1.3）。',
        packageJsonPath: path.relative(ROOT, path.join(THREE_PKG, 'package.json')).replace(/\\/g, '/'),
        packageJsonVersionField: threePresent ? readJson(path.join(THREE_PKG, 'package.json')).version : null,
        packageJsonSha256: threePresent ? sha256(path.join(THREE_PKG, 'package.json')) : null,
        buildCjsSha256: threePresent ? sha256(THREE_ENTRY) : null,
        runtimeRevision: threePresent ? require(THREE_ENTRY).REVISION : null,
        integrityNote: threePresent
            ? 'build/three.cjs 与 build/three.module.js 为同一次发布的构建产物；package.json 指纹绑定该次安装。'
            : '未安装',
    },
    target: {
        path: TARGET_REL,
        sha256: exists(TARGET) ? sha256(TARGET) : null,
        sizeBytes: exists(TARGET) ? fs.statSync(TARGET).size : null,
        lines: exists(TARGET) ? fs.readFileSync(TARGET, 'utf8').split(/\r?\n/).length : null,
        headerDivergenceAudit: headerAudit(),
    },
    harness: {
        executionRoute:
            'jest 28 + ts-jest（diagnostics:false, isolatedModules:true, test/tsconfig.jest.json）：' +
            '整条引擎 TS import 图（../../cocos/core/math/*, ../../cocos/core/geometry/*）由 ts-jest 解析，' +
            '`internal:constants` 等沿用根 jest.config.js 的 moduleNameMapper；three 用一条 moduleNameMapper ' +
            '指向隔离安装的 build/three.cjs。单文件 transpileModule 不足以承载该 import 图，故不用 tools/build/pal-source.cjs 式单文件路线。',
        dedicatedConfig: {
            path: CONFIG_REL,
            sha256: exists(path.join(ROOT, CONFIG_REL)) ? sha246Safe(CONFIG_REL) : null,
        },
        replayTest: { path: TEST_REL, sha256: exists(path.join(ROOT, TEST_REL)) ? sha246Safe(TEST_REL) : null },
        defaultSuiteUnaffected:
            'testMatch 只在专用配置里改为 test/parity/*.test.ts；根 jest.config.js 与 package.json scripts 未改动。',
        rerun: [
            'node tools/verify/spark-math-parity.cjs',
            '离线复跑：node tools/verify/spark-math-parity.cjs --skip-install',
            '手工：MATH_PARITY_ITERATIONS=1000 npx jest --config test/spark-math-parity.jest.config.js --runInBand',
        ],
        harnessSideShims:
            'Object3DShim / CameraShim：按 Three r180 Object3D/Camera/PerspectiveCamera 方法体逐行重写的调度垫片，' +
            '内部矩阵/四元数算术全部落在 spark-math；用于在不依赖 SPK-05a（并行编辑中）的前提下复跑 ' +
            'projection / projection inverse / project / parented lookAt / world direction 五组检查。',
    },
    source: {
        portTest: {
            path: PORT_TEST,
            sha256: exists(PORT_TEST) ? sha256(PORT_TEST) : null,
            lines: exists(PORT_TEST) ? fs.readFileSync(PORT_TEST, 'utf8').split(/\r?\n/).length : null,
            readOnly: true,
            importedAs:
                'Reference（three）+ Air（移植件 src/air-compat.js）；本次把 Air 侧换成 spark-math.ts，Reference 侧沿用真实 three@0.180.0',
        },
        portReferenceImplementation: {
            path: 'E:/AIProMax/github/spark-cocosairjs/src/air-math.js',
            sha256: exists('E:/AIProMax/github/spark-cocosairjs/src/air-math.js')
                ? sha256('E:/AIProMax/github/spark-cocosairjs/src/air-math.js')
                : null,
            note: '只读旁证：setFromEuler 的 w 项与 lookAt 的基向量写入次序按 Three 原文写，故移植件本身能过该检查。',
        },
    },
    replay: replay && {
        seed: replay.seed,
        iterations: replay.iterations,
        iterationsCompleted: counts.iterationsCompleted,
        modeNote: replay.modeNote,
        scopeNote: replay.scopeNote,
        assertRun: replay.assertRun,
        probes: replay.probes,
        supplementary: replay.supplementary,
        narrowedScope: replay.narrowedScope,
        scopeAudit,
    },
    counts: summary,
    isolatedRootCausePass: isolated && {
        note: '同种子同序列，只把 Quaternion.setFromEuler 的产物换成 oracle 值装载，用来区分「根因」与「传染」。',
        toleranceViolations: isolated.toleranceViolations,
        toleranceViolationByOperation: isolated.toleranceViolationByOperation,
        float32MismatchByOperation: isolated.float32MismatchByOperation,
        signedZeroByOperation: isolated.signedZeroByOperation,
        maxErrorByOperation: isolated.maxErrorByOperation,
        samples: isolated.toleranceViolationSamples,
    },
    mismatches,
    // 依赖 evidence.target，在 evidence 构造完成后再回填（见下方 evidence.findings）。
    findings: [],
    evidenceIntegrity: {
        resultsJson: path.relative(ROOT, RESULTS).replace(/\\/g, '/'),
        resultsSha256: exists(RESULTS) ? sha256(RESULTS) : null,
        resultsFreshness: replayFreshness,
        jestLog: null,
    },
};

function sha246Safe(rel) {
    return sha256(path.join(ROOT, rel));
}

/**
 * 归因说明：只陈述复跑得到的客观指纹（数字 + 行号 + 探针结果），
 * 「是否属已声明分歧」交由 headerDivergenceAudit 的原文摘录判断，不替评审改写结论。
 */
function buildFindings() {
    if (!replay || !counts) return [];
    if (replayFreshness && !replayFreshness.writtenByThisRun) {
        return [{ note: 'BLOCKED：results.json 非本轮产物，归因不引用陈旧计数。' }];
    }
    const out = [];
    const isoOp = (isolated && isolated.toleranceViolationByOperation) || {};
    const w = evidenceTargetHeaderFact();
    if ((counts.toleranceViolationByOperation['quaternion from Euler'] || 0) > 0) {
        out.push({
            operation: 'quaternion from Euler',
            observed: `每迭代 1 个分量超差（共 ${counts.toleranceViolationByOperation['quaternion from Euler']} 次），isolated 趟归零`,
            component: 'w（index 3）',
            objectiveFingerprint: w,
            candidateCause:
                'Quaternion.setFromEuler 的 w 项末因子写成 cz 而非 sz：cx*cy*cz + s[3]*sx*sy*cz。' +
                'Three r180 src/math/Quaternion.js 与移植件 src/air-math.js:497 均为 signs[3]*sx*sy*sz。',
            documentedInHeader: false,
            headerNoteNumber: null,
            note: '文件头第 7 条只登记了 Quaternion.invert/normalize/rotateTowards 等退化输入守卫，未登记此项。',
        });
    }
    if ((isoOp.lookAt || 0) > 0) {
        out.push({
            operation: 'lookAt（及其传染的 parented lookAt matrix / world direction）',
            observed: `isolated 趟仍 9 个分量/迭代超差（共 ${isoOp.lookAt} 次），最大 ${isoOp && isolated.maxErrorByOperation.lookAt.toExponential(3)}`,
            objectiveFingerprint: replay.probes && replay.probes.lookAtLayout,
            candidateCause:
                'cc.Mat4.lookAt（gl-matrix 血统）把基向量按视图基写成 out[0]=x0,out[1]=y0,out[2]=z0，' +
                '而 Three 的 Matrix4.lookAt 写 te[0]=x.x,te[1]=x.y,te[2]=x.z（世界基）——两者互为 3x3 转置。' +
                '探针：64/64 例在「对参照取转置」后落在 2e-10 内，直接比较最大偏差 1.97。',
            documentedInHeader: true,
            headerNoteNumber: 7,
            note:
                '头部第 7 条只声明「视线长度 0 或与 up 平行（引擎产出 NaN）时按 Three 原文重算退化基」，' +
                '即只覆盖退化分支；本差异发生在正常输入下的整体转置约定，属未登记的委托后果。',
        });
    }
    if ((isoOp['decompose quaternion'] || 0) > 0) {
        out.push({
            operation: 'decompose quaternion',
            observed: `isolated 趟仍超差 ${isoOp['decompose quaternion']} 次（≈半个迭代集），air = -reference（四分量整体取反，同一旋转的符号歧义）`,
            objectiveFingerprint: (isolated.toleranceViolationSamples || [])
                .filter((s) => s.name === 'decompose quaternion')
                .slice(0, 1),
            candidateCause:
                'Matrix4.decompose 委托 cc.Mat4.toSRT，其迹分支取的四元数符号与 Three 的 setFromRotationMatrix 不同；' +
                'Three 归一化基后走「最大对角分量」分支，引擎实现给出的另一支。',
            documentedInHeader: true,
            headerNoteNumber: 7,
            note:
                '头部第 7 条只登记「缩放分量为 0 时引擎给单位四元数」与「反射时同样把 x 缩放取负」；' +
                '本例输入既非零缩放也非反射（见 seededInputs 的 scale 全正、iteration%3≠0），属未登记的符号分歧。',
        });
    }
    if (
        (isoOp['Euler from quaternion'] || 0) === 0 &&
        (counts.float32MismatchByOperation['Euler from quaternion'] || 0) > 0
    ) {
        out.push({
            operation: 'Euler from quaternion',
            observed: '仅在 collect 趟出现位模式差异（来自四元数输入被 w 项污染）；isolated 趟归零',
            documentedInHeader: false,
            note: '传染，非独立根因。',
        });
    }
    out.push({
        operation: '零差异/仅 ±0 的操作',
        cleanWithinTolerance: Object.keys(counts.maxErrorByOperation || {})
            .filter((k) => (counts.toleranceViolationByOperation[k] || 0) === 0)
            .map((k) => `${k}(max ${counts.maxErrorByOperation[k].toExponential(1)})`),
        signedZeroOnly: Object.keys(counts.signedZeroByOperation || {}),
        note:
            '这些组（含 makePerspective→cc.Mat4.frustum 的 projection、Matrix3.invert、Color/hex、Box3.applyMatrix4、' +
            'compose/inverse/determinant/applyMatrix4/applyQuaternion/slerp/multiply 在 isolated 趟）委托引擎后逐位等价；' +
            'projection inverse 与 inverse 出现 ±0 与 0 的符号位差异，数值同为 0，按移植件口径单列，不计入失败。',
    });
    return out;
}

function evidenceTargetHeaderFact() {
    const audit = evidence.target && evidence.target.headerDivergenceAudit;
    return audit ? audit.setFromEulerWLastFactor : null;
}

// buildFindings 引用了 evidence（在其后才赋值），故先构造再回填。
evidence.findings = buildFindings();

fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

// jest 全量日志与复跑原始结果随证据留存（不进 JSON 主体以免膨胀）。
if (jestRecord) {
    const raw = rawOutput.get('jest-replay') || { stdout: '', stderr: '', error: '' };
    const logName = 'jest-replay.log';
    fs.writeFileSync(
        path.join(ARTIFACTS_DIR, logName),
        [
            `$ ${jestRecord.command}`,
            `spawnMode=${jestRecord.spawnMode}  exit=${jestRecord.exitCode}  signal=${jestRecord.signal}`,
            `startedAt=${jestRecord.startedAt}  endedAt=${jestRecord.endedAt}`,
            '',
            '--- stdout（未截断） ---',
            raw.stdout,
            '--- stderr（未截断） ---',
            raw.stderr,
            raw.error ? `--- spawn error ---\n${raw.error}` : '',
        ].join('\n'),
        'utf8',
    );
    evidence.evidenceIntegrity.jestLog = `${path.basename(ARTIFACTS_DIR)}/${logName}`;
}
if (exists(RESULTS)) {
    fs.copyFileSync(RESULTS, path.join(ARTIFACTS_DIR, 'results.json'));
    evidence.evidenceIntegrity.rawResultsCopy = `${path.basename(ARTIFACTS_DIR)}/results.json`;
}

fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n', 'utf8');

console.log(
    JSON.stringify(
        {
            verdict: evidence.verdict,
            iterations: ITERATIONS,
            counts: summary && {
                totalChecks: summary.totalChecks,
                float32Components: summary.float32Components,
                float32BitMismatches: summary.float32BitMismatches,
                signedZeroMismatches: summary.signedZeroMismatches,
                nonzeroFloat32Mismatches: summary.nonzeroFloat32Mismatches,
                toleranceViolations: summary.toleranceViolations,
            },
            isolatedToleranceViolations: isolated ? isolated.toleranceViolations : null,
            jestExit: jestRecord ? jestRecord.exitCode : null,
            jestError: jestRecord ? jestRecord.error : null,
            resultsWrittenByThisRun: replayFreshness ? replayFreshness.writtenByThisRun : null,
            threeVersion: evidence.oracle.packageJsonVersionField,
            evidence: path.relative(ROOT, EVIDENCE_PATH).replace(/\\/g, '/'),
        },
        null,
        2,
    ),
);

process.exit(verdict === 'PASS' ? 0 : flag('allow-partial') && verdict === 'PARTIAL' ? 0 : 1);
