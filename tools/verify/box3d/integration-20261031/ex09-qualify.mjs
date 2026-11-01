/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// New bounded fixture; original campaign and locks are deliberately untouched.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const [rootArg, runtimeArg, outArg, buildArg] = process.argv.slice(2);
assert(
    rootArg && runtimeArg && outArg && /^\d+$/.test(buildArg ?? ''),
    'Usage: node ex09-qualify.mjs SOURCE_ROOT RUNTIME_DIR NEW_OUTPUT_DIR EXACT_BUILD',
);
const root = resolve(rootArg),
    runtime = resolve(runtimeArg),
    out = resolve(outArg),
    fixture = dirname(fileURLToPath(import.meta.url));
mkdirSync(out); // Never overwrite an earlier attempt.
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const row = (base, path) => {
    const bytes = readFileSync(join(base, path));
    return { path, bytes: bytes.length, sha256: sha(bytes) };
};
const walk = (base, dir = '') =>
    readdirSync(join(base, dir), { withFileTypes: true })
        .flatMap((e) =>
            e.isDirectory()
                ? walk(base, join(dir, e.name))
                : e.isFile()
                  ? [join(dir, e.name).replaceAll('\\', '/')]
                  : [],
        )
        .sort();
const scope =
    'Integration 20261031: bounded Node/JSDOM production ST WASM query, ray, target, support and Fixed only. No browser, full EX09, MT or original Gate credit.';
const lock = {
    schema: 'box3d-ex09-integration-20261031-inputs-v1',
    cohortIdentity: 'integration-20261031-ex09-limited',
    scope,
    runtimeBuildNumber: Number(buildArg),
    fixtureRoot: relative(root, fixture).replaceAll('\\', '/'),
    runtime: walk(runtime)
        .filter((p) => p === 'cocosair.module.js' || p.startsWith('physics/box3d/st/'))
        .map((p) => row(runtime, p)),
    source: walk(join(root, 'src')).map((p) => row(root, join('src', p).replaceAll('\\', '/'))),
    fixture: readdirSync(fixture)
        .filter((p) => p.startsWith('ex09-') && p.endsWith('.mjs'))
        .sort()
        .map((p) => row(fixture, p)),
};
assert(lock.runtime.some((r) => r.path === 'cocosair.module.js'));
assert(lock.runtime.some((r) => r.path === 'physics/box3d/st/box3d-st.wasm'));
const lockPath = join(out, 'inputs-lock.json');
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
const cases = [
    ['query', 'ex09-query.mjs'],
    ['fixed-healthy', 'ex09-fixed.mjs', 'healthy'],
    ['fixed-fault', 'ex09-fixed.mjs', 'intentional-fault'],
    ['fixed-reentry', 'ex09-fixed.mjs', 'idle-enabled-reentry'],
];
const reports = [];
for (const [id, script, mode] of cases) {
    const target = join(out, id);
    mkdirSync(target);
    const args = mode ? [runtime, lockPath, target, mode] : [runtime, target];
    const run = spawnSync(process.execPath, [join(fixture, script), ...args], {
        env: { ...process.env, BOX3D_INTEGRATION_LOCK: lockPath, BOX3D_INTEGRATION_SOURCE_ROOT: root },
        encoding: 'utf8',
        timeout: 180000,
        maxBuffer: 8 * 1024 * 1024,
    });
    writeFileSync(join(target, 'stdout.log'), run.stdout ?? '');
    writeFileSync(join(target, 'stderr.log'), run.stderr ?? '');
    let raw;
    try {
        raw = JSON.parse(readFileSync(join(target, 'consumer.raw.json')));
    } catch {}
    reports.push({
        id,
        exitCode: run.status,
        error: run.error?.message,
        status: raw?.status,
        checks: raw?.checks?.length,
        rawSha256: raw ? sha(readFileSync(join(target, 'consumer.raw.json'))) : null,
    });
}
const pass = reports.every((r) => r.exitCode === 0 && r.status?.startsWith('PASS_'));
const result = {
    schema: 'box3d-ex09-integration-20261031-qualification-v1',
    scope,
    status: pass ? 'PASS_LIMITED_NODE_ST' : 'FAIL',
    businessStatus: 'NOT_RUN',
    runtimeBuildNumber: lock.runtimeBuildNumber,
    runtimeSha256: lock.runtime.find((r) => r.path === 'cocosair.module.js').sha256,
    manifestSha256: lock.runtime.find((r) => r.path === 'physics/box3d/st/manifest.json').sha256,
    inputLockSha256: sha(readFileSync(lockPath)),
    qualification: Object.fromEntries(
        ['committedQueries', 'committedRay', 'kinematicTarget', 'fixedAtIdle', 'boxSupportDeparture'].map((k) => [
            k,
            pass,
        ]),
    ),
    reports,
};
writeFileSync(join(out, 'qualification-map.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (!pass) process.exitCode = 1;
