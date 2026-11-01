/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Keeps exact negative mutations and replay proof; retires only this instance's
 * newly created, independently verified disposable copies. Never touches source.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = (data) => crypto.createHash('sha256').update(data).digest('hex');
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
function safe(name) {
    assert(typeof name === 'string' && /^[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*$/.test(name));
    assert(!name.split('/').some((part) => part === '.' || part === '..'));
    return name;
}
function record(directory, name) {
    const file = path.join(directory, safe(name)),
        stat = fs.lstatSync(file);
    assert(stat.isFile() || stat.isSymbolicLink(), `Unsupported fixture type: ${name}`);
    const data = stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(file)) : fs.readFileSync(file);
    return {
        path: name,
        type: stat.isSymbolicLink() ? 'symlink' : 'file',
        mode: stat.mode & 0o777,
        bytes: data.length,
        sha256: hash(data),
    };
}
function inventory(directory) {
    const rows = [];
    function walk(prefix) {
        for (const name of fs.readdirSync(path.join(directory, prefix)).sort()) {
            const relative = prefix ? `${prefix}/${name}` : name;
            const stat = fs.lstatSync(path.join(directory, relative));
            if (stat.isDirectory()) walk(relative);
            else rows.push(record(directory, relative));
        }
    }
    walk('');
    return rows.sort((a, b) => a.path.localeCompare(b.path));
}
function copy(source, destination, row) {
    const target = path.join(destination, row.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    let existing;
    try {
        existing = fs.lstatSync(target);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    if (existing) {
        assert(existing.isFile() || existing.isSymbolicLink());
        fs.unlinkSync(target);
    }
    if (row.type === 'symlink') fs.symlinkSync(fs.readlinkSync(path.join(source, row.path)), target);
    else {
        fs.copyFileSync(path.join(source, row.path), target);
        fs.chmodSync(target, row.mode);
    }
}
function createRetainedFixtures({ source, output, files }) {
    source = fs.realpathSync(source);
    output = path.resolve(output);
    assert(!fs.existsSync(output), 'Fixture set must be new');
    assert(output !== source && !output.startsWith(source + path.sep) && !source.startsWith(output + path.sep));
    const baseline = files.map((name) => record(source, name)).sort((a, b) => a.path.localeCompare(b.path));
    assert.equal(new Set(baseline.map((row) => row.path)).size, baseline.length);
    fs.mkdirSync(output, { recursive: true });
    assert.equal(fs.realpathSync(output), output, 'Fixture output must not traverse symlinks');
    writeJSON(path.join(output, 'baseline-manifest.json'), { source, files: baseline });
    const created = new Set(),
        cases = new Map();
    function verifySource() {
        assert.deepEqual(
            baseline.map((row) => record(source, row.path)),
            baseline,
            'Frozen fixture baseline drift',
        );
    }
    function create(directory) {
        assert(!fs.existsSync(directory));
        fs.mkdirSync(directory, { recursive: true });
        created.add(directory);
        verifySource();
        for (const row of baseline) copy(source, directory, row);
        assert.deepEqual(inventory(directory), baseline);
        return directory;
    }
    return {
        create(name) {
            safe(name);
            assert(!name.includes('/') && !cases.has(name));
            const directory = create(path.join(output, 'working', name));
            cases.set(name, { directory });
            return directory;
        },
        retainAndReconstruct(name) {
            const item = cases.get(name);
            assert(item && !item.replay);
            const observed = inventory(item.directory),
                before = new Map(baseline.map((row) => [row.path, row]));
            const after = new Map(observed.map((row) => [row.path, row]));
            const changed = observed.filter((row) => JSON.stringify(before.get(row.path)) !== JSON.stringify(row));
            const deleted = baseline.filter((row) => !after.has(row.path)).map((row) => row.path);
            const retained = path.join(output, 'retained', name),
                payload = path.join(retained, 'changed');
            fs.mkdirSync(payload, { recursive: true });
            for (const row of changed) copy(item.directory, payload, row);
            writeJSON(path.join(retained, 'mutation-manifest.json'), {
                baselineManifest: '../../baseline-manifest.json',
                changed,
                deleted,
                expectedMutatedInventory: observed,
            });
            const replay = create(path.join(output, 'replay', name));
            for (const file of deleted) fs.unlinkSync(path.join(replay, file));
            for (const row of changed) copy(payload, replay, row);
            assert.deepEqual(inventory(replay), observed, 'Exact negative reconstruction mismatch');
            Object.assign(item, { replay, retained, observed, changed, deleted });
            return { replay, retained, changed, deleted };
        },
        retire(name, proof) {
            const item = cases.get(name);
            assert(item?.replay && proof?.sameExpectedRejection === true);
            assert.equal(proof.originalExitCode, 0);
            assert.equal(proof.replayExitCode, 0);
            verifySource();
            assert.deepEqual(
                inventory(path.join(item.retained, 'changed')),
                item.changed,
                'Retained mutation bytes drift',
            );
            assert.deepEqual(inventory(item.directory), item.observed);
            assert.deepEqual(inventory(item.replay), item.observed);
            writeJSON(path.join(item.retained, 'verified-before-retirement.json'), {
                ...proof,
                inventory: item.observed,
            });
            for (const directory of [item.directory, item.replay]) {
                assert(created.has(directory) && fs.realpathSync(directory) === directory);
                assert(directory.startsWith(output + path.sep) && directory !== output && directory !== source);
                fs.rmSync(directory, { recursive: true });
                created.delete(directory);
            }
            writeJSON(path.join(item.retained, 'reconstruction-receipt.json'), {
                status: 'PASS_EXACT_MUTATION_RECONSTRUCTION_AND_REPEAT_REJECTION',
                ...proof,
                deletedDisposableCopies: [item.directory, item.replay],
                changedFilesRetained: item.changed.length,
                deletedBaselinePaths: item.deleted,
                baselineUnchanged: true,
            });
        },
        output,
    };
}
module.exports = { createRetainedFixtures, inventory, hash };
