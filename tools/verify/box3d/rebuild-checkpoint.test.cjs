const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { checkpoint, verifyRestored } = require('./rebuild-checkpoint.cjs');
function fixture() {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'box3d-checkpoint-test-'));
    const root = path.join(base, 'source');
    fs.mkdirSync(root);
    const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git('init', '-b', 'test/checkpoint');
    git('config', 'user.name', 'Checkpoint test');
    git('config', 'user.email', 'test@example.invalid');
    fs.writeFileSync(path.join(root, 'fixture.txt'), 'source fixture\n');
    git('add', 'fixture.txt');
    git('commit', '-qm', 'fixture');
    return { base, root, git };
}
test('self-contained bundle restores exact commit, bytes and history', () => {
    const { root, base } = fixture();
    const receipt = checkpoint({ root, output: path.join(base, 'checkpoint') });
    assert.equal(receipt.localRestore.status, 'PASS');
    assert.equal(receipt.files.length, 1);
    assert.equal(receipt.history.length, 1);
    assert.equal(receipt.libraryRoundTrip, 'PENDING_EXTERNAL_STEP');
    assert.equal(receipt.physicalAcceptance, 'NOT_RUN');
});
test('dirty tree fails closed unless explicitly backing up committed state only', () => {
    const { root, base } = fixture();
    fs.writeFileSync(path.join(root, 'uncommitted.txt'), 'not committed\n');
    assert.throws(() => checkpoint({ root, output: path.join(base, 'fail') }), /uncommitted work/);
    const receipt = checkpoint({ root, output: path.join(base, 'partial'), committedOnly: true });
    assert.equal(receipt.excludedWorkingTreeStatus.length, 1);
    assert.equal(
        receipt.files.some((f) => f.path === 'uncommitted.txt'),
        false,
    );
});
test('restore verifier rejects modified bytes and extra files', () => {
    const { root, base } = fixture();
    const output = path.join(base, 'checkpoint');
    const receipt = checkpoint({ root, output });
    const restored = path.join(output, 'restored-local');
    fs.writeFileSync(path.join(restored, 'fixture.txt'), 'corrupt\n');
    assert.throws(() => verifyRestored(restored, receipt), /Size|SHA-256/);
    fs.writeFileSync(path.join(restored, 'fixture.txt'), 'source fixture\n');
    fs.writeFileSync(path.join(restored, 'extra.txt'), 'extra');
    assert.throws(() => verifyRestored(restored, receipt), /clean/);
});
test('output cannot overwrite evidence or recurse inside source', () => {
    const { root, base } = fixture();
    assert.throws(() => checkpoint({ root, output: root }), /outside/);
    assert.throws(() => checkpoint({ root, output: path.join(root, 'output') }), /outside/);
    assert.throws(() => checkpoint({ root, output: base }), /new directory/);
});
