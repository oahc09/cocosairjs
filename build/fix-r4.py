# -*- coding: utf-8 -*-
"""R4+R9: metrics.ts fixes."""
import io

p = 'tools/benchmark/runner/metrics.ts'
s = io.open(p, encoding='utf-8').read()

BT = chr(96)

old = """export interface TrialRecord {
    manifest: RunManifest;
    trialResult: TrialTopResult;"""
new = """export interface TrialRecord {
    manifest: RunManifest;
    /** §36/§50：benchmark 类型（First Compile 只统计 Type-B source-create/repair）。 */
    benchmarkType: 'runtime-control' | 'source-create' | 'source-repair';
    trialResult: TrialTopResult;"""
assert old in s, 'TrialRecord'
s = s.replace(old, new, 1)

old = """/** 从单条 Trial 判定是否进入 eligible_trials 分母（§33-35 唯一实现）。 */
export function isEligible (trial: TrialRecord): boolean {
    if (trial.trialResult !== 'VALID') { return false; }
    if (trial.approvedNonBlockingSkip) { return false; }
    return true;
}"""
new = """/** 从单条 Trial 判定是否进入 eligible_trials 分母（§33-35 唯一实现）。
 *  排除：INFRA_FAILURE / INVALID_RUN / approved non-blocking SKIP /
 *  contractual device unsupported（§35，须带机器可读原因）。 */
export function isEligible (trial: TrialRecord): boolean {
    if (trial.trialResult !== 'VALID') { return false; }
    if (trial.approvedNonBlockingSkip) { return false; }
    if (trial.contractualUnsupported) { return false; }
    return true;
}"""
assert old in s, 'isEligible'
s = s.replace(old, new, 1)

old = """export interface AggregatedMetrics {
    eligibleTrials: number;"""
new = """export interface AggregatedMetrics {
    eligibleTrials: number;
    /** Type-B（source-create/repair）eligible 数：First Compile 的分母（§36）。 */
    eligibleTypeBTrials: number;"""
assert old in s, 'iface'
s = s.replace(old, new, 1)

old = """    const firstCompile = eligible.filter((t) => t.firstSubmissionCompilePass);"""
new = """    // §36：First Compile 只统计 Type-B（source-create/repair），分母 = eligible Type-B trials
    const typeB = eligible.filter((t) => t.benchmarkType !== 'runtime-control');
    const firstCompile = typeB.filter((t) => t.firstSubmissionCompilePass);"""
assert old in s, 'firstCompile'
s = s.replace(old, new, 1)

old = """        eligibleTrials: eligible.length,
        agentPass: pass.length,
        agentFinalSuccessRate: agentTrials.length ? pass.length / agentTrials.length : 0,
        firstCompileSuccessRate: eligible.length ? firstCompile.length / eligible.length : 0,"""
new = """        eligibleTrials: eligible.length,
        eligibleTypeBTrials: typeB.length,
        agentPass: pass.length,
        agentFinalSuccessRate: agentTrials.length ? pass.length / agentTrials.length : 0,
        firstCompileSuccessRate: typeB.length ? firstCompile.length / typeB.length : 0,"""
assert old in s, 'agg'
s = s.replace(old, new, 1)

old = """export function writeManifest (file: string, manifest: RunManifest, fixtureRoot: string): void {
    const fs = require('fs') as typeof import('fs');
    const withHash = { ...manifest, startingFixtureHash: sha256(Buffer.from(manifest.startingFixtureHash)) };
    fs.writeFileSync(file, JSON.stringify(withHash, null, 2) + '\\n', 'utf8');
}"""
new = """/** §43：对 fixtureRoot 建立排序稳定的递归 manifest（相对路径 + 内容 SHA-256），再整体哈希。 */
export function computeFixtureManifestHash (fixtureRoot: string): string {
    const fs = require('fs') as typeof import('fs');
    const pathMod = require('path') as typeof import('path');
    const cryptoMod = require('crypto') as typeof import('crypto');
    const entries: string[] = [];
    const walk = (dir: string, prefix: string): void => {
        if (!fs.existsSync(dir)) { return; }
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const rel = prefix ? prefix + '/' + entry.name : entry.name;
            if (entry.isDirectory()) { walk(path.join(dir, entry.name), rel); } else {
                entries.push(rel + ':' + cryptoMod.createHash('sha256').update(fs.readFileSync(path.join(dir, entry.name))).digest('hex'));
            }
        }
    };
    walk(fixtureRoot, '');
    entries.sort();
    return cryptoMod.createHash('sha256').update(entries.join('|') || '<empty>').digest('hex');
}

export function writeManifest (file: string, manifest: RunManifest, fixtureRoot: string): void {
    const fs = require('fs') as typeof import('fs');
    // §43：startingFixtureHash 必须来自真实 fixture 内容（递归 manifest），不信任调用方字符串
    const withHash = { ...manifest, startingFixtureHash: computeFixtureManifestHash(fixtureRoot) };
    fs.writeFileSync(file, JSON.stringify(withHash, null, 2) + '\\n', 'utf8');
}"""
assert old in s, 'manifest'
s = s.replace(old, new, 1)

# 删除不再使用的 sha256 import（若存在）
if "import { sha256 } from './policy';" in s:
    s = s.replace("import { sha256 } from './policy';\n", "")

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('metrics ok')
