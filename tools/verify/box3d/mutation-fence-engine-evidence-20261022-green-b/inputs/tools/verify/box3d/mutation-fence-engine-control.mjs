/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Runs narrow actual-engine source controls. Never builds the runtime or WASM.
 * New output directory only. Mock delegates do not qualify native physics.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = process.cwd();
const output = process.argv[2];
if (!output || existsSync(output)) throw new Error('Provide a new, nonexistent evidence directory.');
mkdirSync(output, { recursive: true });
const startedAt = new Date().toISOString();
const targets = [
    'src/cocos/core/data/mutation-guard.ts',
    'src/cocos/scene-graph/component.ts',
    'src/cocos/scene-graph/node.ts',
    'src/cocos/physics/framework/assets/physics-material.ts',
    'src/cocos/physics/framework/components/colliders/collider.ts',
    'src/cocos/physics/framework/physics-system.ts',
];
const prefix = 'tools/verify/box3d/mutation-fence-engine-control';
const controls = ['.mjs', '.test.ts', '.jest.cjs', '.tsconfig.json'].map((suffix) => prefix + suffix);
const prerequisites = [
    'jest.config.js',
    'test/setup-dom.js',
    'test/setup-engine.js',
    'test/tsconfig.jest.json',
    'tsconfig.json',
    'tools/verify/box3d/tsconfig.world-control.json',
    'package.json',
    'package-lock.json',
];
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const hashes = (files) => Object.fromEntries(files.map((file) => [file, hash(file)]));
const engineFiles = [];
function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.isFile()) engineFiles.push(file);
    }
}
walk('src');
walk('test');
const beforeAllEngine = hashes(engineFiles);
const before = hashes([...targets, ...controls, ...prerequisites]);
for (const file of [...targets, ...controls]) {
    const destination = path.join(output, 'inputs', file);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(file, destination);
}
const commands = [];
function run(name, args, env = {}) {
    const result = spawnSync(process.execPath, args, {
        cwd: root,
        env: { ...process.env, ...env },
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
    });
    writeFileSync(path.join(output, `${name}.stdout.txt`), result.stdout ?? '');
    writeFileSync(path.join(output, `${name}.stderr.txt`), result.stderr ?? '');
    commands.push({
        name,
        executable: process.execPath,
        args,
        env,
        exitCode: result.status,
        signal: result.signal,
        error: result.error ? String(result.error) : null,
    });
}
run('format', ['node_modules/prettier/bin/prettier.cjs', '--ignore-path', '/dev/null', '--check', ...controls]);
run('tsc', ['node_modules/typescript/bin/tsc', '--noEmit', '-p', `${prefix}.tsconfig.json`]);
run(
    'jest',
    [
        'node_modules/jest/bin/jest.js',
        '--config',
        `${prefix}.jest.cjs`,
        '--runInBand',
        '--no-cache',
        '--json',
        '--outputFile',
        path.resolve(output, 'jest-result.json'),
    ],
    { BOX3D_MUTATION_FENCE_RAW: path.resolve(output, 'raw.json') },
);
const after = hashes(Object.keys(before));
const raw = existsSync(path.join(output, 'raw.json')) ? JSON.parse(readFileSync(path.join(output, 'raw.json'))) : null;
const loadedBefore = Object.fromEntries((raw?.loadedEngineSources ?? []).map(({ path: p }) => [p, beforeAllEngine[p]]));
const loadedAfter = Object.fromEntries((raw?.loadedEngineSources ?? []).map(({ path: p, sha256 }) => [p, sha256]));
const unchanged =
    JSON.stringify(before) === JSON.stringify(after) && JSON.stringify(loadedBefore) === JSON.stringify(loadedAfter);
const recordedChecksConsistent =
    !!raw &&
    raw.rows.every(({ checks }) =>
        checks.every(
            ({ actual, expected, passed }) => (JSON.stringify(actual) === JSON.stringify(expected)) === passed,
        ),
    );
const receipt = {
    scope: 'Actual engine functions with explicit opt-in guard leases; delegates are call-count mocks, not WASM/native tests. No World lease integration or public API activation.',
    status:
        commands.every((x) => x.exitCode === 0) && unchanged && recordedChecksConsistent
            ? 'PASS_ACTUAL_ENGINE_SOURCE_CONTROLS'
            : 'FAIL_RETAINED',
    startedAt,
    completedAt: new Date().toISOString(),
    node: process.version,
    sourceHashesBefore: before,
    sourceHashesAfter: after,
    loadedEngineHashesBefore: loadedBefore,
    loadedEngineHashesAfter: loadedAfter,
    sourcesUnchanged: unchanged,
    recordedChecksConsistent,
    commands,
    rows: raw?.rows.map(({ name, status, fixtureFailure, checks }) => ({
        name,
        status: status ?? 'FIXTURE_FAILURE',
        fixtureFailure,
        checks: checks.length,
        failedChecks: checks.filter((x) => !x.passed).length,
    })),
    rawSha256: raw ? hash(path.join(output, 'raw.json')) : null,
};
writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(
    JSON.stringify({ status: receipt.status, commands, sourcesUnchanged: unchanged, rows: receipt.rows }, null, 2),
);
process.exitCode = receipt.status.startsWith('PASS') ? 0 : 1;
