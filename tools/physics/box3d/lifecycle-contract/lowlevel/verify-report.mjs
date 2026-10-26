// CPU-only final consumer: a runner's summary alone can never qualify a completed attempt.
import { readDebugSnapshot } from './debug-artifacts.mjs';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectInputs, validateInputs, validateObservedSubset, validatePhysicalClosure, sha256 } from './contract.mjs';
assert.equal(process.argv.length, 6, 'usage: verify-report.mjs RUNTIME SOURCE INPUT_LOCK ATTEMPT');
const [runtime, source, lockPath, attempt] = process.argv.slice(2).map((p) => resolve(p));
const lockBytes = readFileSync(lockPath),
    expected = JSON.parse(lockBytes);
const current = inspectInputs(runtime, source, dirname(fileURLToPath(import.meta.url)));
validateInputs(expected, current);
const raw = readFileSync(join(attempt, 'run/events.jsonl')),
    reportBytes = readFileSync(join(attempt, 'run/report.json')),
    report = JSON.parse(reportBytes),
    closure = JSON.parse(readFileSync(join(attempt, 'closure.json'))),
    start = JSON.parse(readFileSync(join(attempt, 'supervision-start.json')));
assert.equal(report.inputLockSha256, sha256(lockBytes));
assert.equal(start.inputLockSha256, sha256(lockBytes));
assert.equal(start.nodeSha256, current.nodeExecutable.sha256);
assert.equal(closure.nodeSha256, current.nodeExecutable.sha256);
assert.equal(sha256(readFileSync(closure.command[0])), current.nodeExecutable.sha256);
assert.equal(start.runnerSha256, current.fixtures['run-native.mjs'].sha256);
assert.equal(start.supervisorSha256, current.fixtures['supervise.py'].sha256);
assert.equal(report.rawJournalSha256, sha256(raw));
assert.equal(closure.rawJournalSha256, sha256(raw));
assert.equal(closure.reportSha256, sha256(reportBytes));
assert.deepEqual(closure.command, start.command);
assert.deepEqual(closure.command.slice(2), [
    '--authorized-fresh-native-c20',
    runtime,
    source,
    lockPath,
    join(attempt, 'run'),
]);
assert.equal(raw.at(-1), 10, 'partial final raw row is not a closed journal');
const events = raw
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line));
const totalBytes = (directory) =>
    readdirSync(directory).reduce((total, name) => {
        const path = join(directory, name),
            stat = statSync(path);
        return total + (stat.isDirectory() ? totalBytes(path) : stat.size);
    }, 0);
assert.equal(closure.retainedOutputBytes, totalBytes(attempt), 'final receipt included in output budget');
validatePhysicalClosure(closure);
console.log(
    JSON.stringify(
        validateObservedSubset(events, report, expected, (metadata) =>
            readDebugSnapshot(join(attempt, 'run'), metadata),
        ),
        null,
        2,
    ),
);
