const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { relevant, select } = require('./box2d-scope.cjs');

test('direct and transitive build/package/browser inputs select full acceptance', () => {
    for (const file of [
        'src/air/physics-2d/box2d3.ts',
        'src/air/app.ts',
        'src/cocos/core/math/vec2.ts',
        'src/pal/input/web/keyboard-input.ts',
        'src/cc.config.json',
        'vendor/box2d/runtime/air-box2d.wasm',
        'vendor/pal-source/index.js',
        'tools/build/build.cjs',
        'tools/build/box2d/CMakeLists.txt',
        'vendor/box2d/source/CMakeLists.txt',
        'tools/build/prepare-package.cjs',
        'tools/verify/box2d3-native.mjs',
        'tools/verify/box2d3-integration.js',
        'tools/verify/browser-engines.cjs',
        'tools/verify/published-artifacts.cjs',
        'tools/dev/resolve-script.cjs',
        'examples/box2d3-lab/index.html',
        'build/box2d3-samples/air-box2d-samples.wasm',
        'package-lock.json',
        'package.json',
        '.gitignore',
        '.npmignore',
        '.npmrc',
        '.nvmrc',
        '.gitattributes',
        'tsconfig.json',
        'babel.config.js',
        '.github/workflows/box2d3.yml',
        'tools/ci/box2d-scope.test.cjs',
    ])
        assert.equal(relevant(file), true, file);
});

test('prose and known unrelated changes do not select expensive acceptance', () => {
    for (const file of [
        'README.md',
        'docs/guides/box2d3.md',
        'ai/ledgers/box2d-3.2-integration.md',
        'vendor/box2d/README.md',
        'src/cocos/README.md',
        'licenses/LICENSE_box2d.txt',
        'skills/cocosair-physics/SKILL.md',
        'examples/water/src/main.ts',
        '.github/workflows/skills.yml',
        'tools/skills/gen-index.cjs',
        'icon.png',
    ])
        assert.equal(relevant(file), false, file);
});

test('manual, missing/zero/invalid revisions and unreadable diff select full acceptance', () => {
    assert.equal(select({ event: 'workflow_dispatch' }).run, true);
    for (const base of [undefined, '0'.repeat(40), '--help', '1'.repeat(40)]) {
        assert.equal(select({ event: 'push', base, head: '2'.repeat(40), cwd: os.tmpdir() }).run, true);
    }
});

test('real Git trees: docs, >300 files, rename, deletion and mode changes', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'air-box2d-scope-'));
    const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    const write = (file, content = 'fixture\n') => {
        fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
        fs.writeFileSync(path.join(cwd, file), content);
    };
    const commit = () => {
        git('add', '-A');
        git('-c', 'user.name=CI fixture', '-c', 'user.email=ci@example.invalid', 'commit', '-qm', 'fixture');
        return git('rev-parse', 'HEAD');
    };
    const run = (base, head, event = 'push') => select({ event, base, head, cwd });
    try {
        git('init', '-q');
        write('README.md');
        let base = commit();
        write('docs/guide.md');
        let head = commit();
        assert.equal(run(base, head).run, false);
        base = head;
        for (let i = 0; i < 350; i++) write(`docs/fixture-${i}.md`);
        write('src/air/app.ts');
        head = commit();
        const large = run(base, head, 'pull_request');
        assert.equal(large.run, true);
        assert.equal(large.changed.length, 351);
        base = head;
        git('mv', 'src/air/app.ts', 'docs/moved.md');
        head = commit();
        assert.equal(run(base, head).run, true, 'old relevant path retained');
        base = head;
        write('src/air/physics-2d/box2d3.ts');
        head = commit();
        base = head;
        fs.unlinkSync(path.join(cwd, 'src/air/physics-2d/box2d3.ts'));
        head = commit();
        assert.equal(run(base, head).run, true, 'deleted relevant path retained');
        base = head;
        write('tools/build/build.cjs');
        head = commit();
        base = head;
        git('update-index', '--chmod=+x', 'tools/build/build.cjs');
        git('-c', 'user.name=CI fixture', '-c', 'user.email=ci@example.invalid', 'commit', '-qm', 'mode');
        head = git('rev-parse', 'HEAD');
        assert.equal(run(base, head).run, true);
        assert.equal(run(head, head).run, true, 'empty diff is conservative');
    } finally {
        fs.rmSync(cwd, { recursive: true, force: true });
    }
});
