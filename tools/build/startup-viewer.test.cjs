'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, symlinkSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');
const { DEFAULT_FEATURES } = require('./default-features.cjs');
const { FEATURES, assertSeparateOutput } = require('./startup-viewer.cjs');
const { features } = require('../../src/cc.config.json');

test('viewer graph has an explicit root and stays outside the full feature set', () => {
    assert.deepEqual(features['air-viewer'].modules, ['air-viewer']);
    assert.ok(FEATURES.every((feature) => Object.hasOwn(features, feature)));
    for (const required of ['physics-builtin', 'physics-2d-builtin']) assert.ok(FEATURES.includes(required));
    assert.ok(!DEFAULT_FEATURES.includes('air-viewer') && DEFAULT_FEATURES.includes('air'));
    for (const other of [
        'air',
        'custom-pipeline',
        'custom-pipeline-post-process',
        'gfx-webgpu',
        'spine-3.8',
        'dragon-bones',
        'worker',
        'video',
        'webview',
        'physics-cannon',
        'physics-2d-box2d',
    ])
        assert.ok(!FEATURES.includes(other), other);
});

test('ccbuild replaces the full backend facade only for Viewer', async () => {
    const { StatsQuery } = require('@cocos/ccbuild');
    const engine = resolve(__dirname, '../../src');
    const stats = await StatsQuery.create(engine);
    const mapping = (featureNames) =>
        stats.evaluateModuleOverrides({
            mode: 'BUILD',
            platform: 'HTML5',
            buildTimeConstants: stats.getIntrinsicFlagsOfFeatures(featureNames),
        });
    const backend = join(engine, 'air/bootstrap-webgpu.ts');
    assert.equal(mapping(FEATURES)[backend], join(engine, 'air/bootstrap-webgpu-disabled.ts'));
    assert.ok(!(backend in mapping(DEFAULT_FEATURES)));
});

test('both variant modes reject default and nested destinations, including through symlinks', (t) => {
    const workspace = mkdtempSync(join(tmpdir(), 'air-viewer-profile-'));
    t.after(() => rmSync(workspace, { recursive: true, force: true }));
    const standard = join(workspace, 'build');
    const alias = join(workspace, 'alias-to-build');
    mkdirSync(standard);
    symlinkSync(standard, alias, process.platform === 'win32' ? 'junction' : 'dir');
    for (const flag of ['--startup-viewer', '--defer-gltf-effect']) {
        const check = (destination, explicit = true, incompatible = false) =>
            assertSeparateOutput({ standard, destination, explicit, incompatible, flag });
        for (const root of [standard, alias]) {
            assert.throws(() => check(root), /separate AIR_OUT_DIR/);
            assert.throws(() => check(join(root, 'not-yet-created')), /separate AIR_OUT_DIR/);
        }
        const sibling = join(workspace, 'build-viewer');
        assert.doesNotThrow(() => check(sibling));
        assert.throws(() => check(sibling, false), /separate AIR_OUT_DIR/);
        assert.throws(() => check(sibling, true, true), /separate AIR_OUT_DIR/);
    }
});

test('actual build invocation fails before compiling when profiles are combined or bypassed', () => {
    const build = resolve(__dirname, 'build.cjs');
    const base = { ...process.env, AIR_OUT_DIR: join(tmpdir(), 'air-guard-unused'), AIR_FEATURES: '' };
    for (const [args, env, pattern] of [
        [['--startup-viewer', '--defer-gltf-effect'], {}, /separate AIR_OUT_DIR/],
        [['--startup-viewer', '--format', 'system'], {}, /separate AIR_OUT_DIR/],
        [['--startup-viewer'], { AIR_FEATURES: 'air' }, /separate AIR_OUT_DIR/],
        [['--startup-viewer'], { AIR_OUT_DIR: '' }, /separate AIR_OUT_DIR/],
        [[], { AIR_FEATURES: 'air-viewer' }, /Use --startup-viewer/],
    ]) {
        const result = spawnSync(process.execPath, [build, ...args], {
            env: { ...base, ...env },
            encoding: 'utf8',
            timeout: 10000,
        });
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, pattern);
    }
});
