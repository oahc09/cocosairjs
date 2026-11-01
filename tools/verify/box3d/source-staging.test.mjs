/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Source/hash/patch checks only. Uses isolated staging trees; no compiler or native execution.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { root, verifySources } from '../../physics/box3d/verify-sources.mjs';
import { stageCore, verifyStagedCore } from '../../physics/box3d/patch-intake.mjs';

const base = join(root, 'output');
mkdirSync(base, { recursive: true });
const output = mkdtempSync(join(base, 'box3d-source-staging-'));
const first = join(output, 'first', 'staged-core');
const second = join(output, 'second', 'staged-core');

test('current upstream hashes, full source closure, schema and ordered patch identities verify', () => {
    const result = verifySources();
    assert.equal(result.verifiedFiles, 130);
    assert.equal(result.fixedCoreFiles, 111);
});

test('exact patched source and portable receipts match in two different directories', () => {
    const a = stageCore(first);
    const b = stageCore(second);
    assert.deepEqual(a, b);
    assert.deepEqual(readFileSync(first + '.receipt.json'), readFileSync(second + '.receipt.json'));
    for (const file of a.files) {
        assert(!file.path.includes('\\'));
        assert(!file.path.startsWith('/') && !file.path.includes(':'));
        assert.deepEqual(readFileSync(join(first, file.path)), readFileSync(join(second, file.path)));
    }
    assert.throws(() => stageCore(first), /Staging exists/);
});

test('changed, missing and extra staged sources remain rejected', () => {
    const file = join(first, 'src', 'core.c');
    const bytes = readFileSync(file);
    writeFileSync(file, Buffer.concat([bytes, Buffer.from('\n/* drift */\n')]));
    assert.throws(() => verifyStagedCore(first), /Staged source\/receipt drift/);
    unlinkSync(file);
    assert.throws(() => verifyStagedCore(first), /Staged source\/receipt drift/);
    writeFileSync(file, bytes);
    const extra = join(first, 'src', 'unexpected.c');
    writeFileSync(extra, '/* unexpected source */\n');
    assert.throws(() => verifyStagedCore(first), /Staged source\/receipt drift/);
    unlinkSync(extra);
    assert.deepEqual(verifyStagedCore(first), verifyStagedCore(second));
});
