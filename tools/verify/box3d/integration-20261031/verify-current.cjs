/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Explicit current unit/asset subset. Not a browser, full-physics or original G0–G8 acceptance runner.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '../../../..');
const native = process.argv[2];
if (!native || !fs.existsSync(path.resolve(root, native, 'build-receipt.json'))) {
    console.error('Usage: node tools/verify/box3d/integration-20261031/verify-current.cjs AUDITED_NATIVE_BUILD_DIR');
    process.exitCode = 2;
} else {
    const groups = [
        [
            '--test',
            'tools/verify/box3d/source-staging.test.mjs',
            'tools/verify/box3d/hull-path-portability.test.cjs',
            'tools/verify/box3d/inventory-v1-history.test.cjs',
            'tools/verify/box3d/world-control.test.cjs',
            'tools/verify/box3d/drag-readback-control.test.cjs',
            'tools/verify/box3d/loader-lifecycle.test.mjs',
            'tools/verify/box3d/empty-world-release.test.mjs',
            'tools/verify/box3d/build-assets.test.cjs',
            'tools/verify/box3d/compound-bowling/lifecycle-evidence.test.cjs',
            'tools/build/dts-inputs.test.cjs',
            'tools/build/dts-symbols.test.cjs',
            'tools/build/dts-external-types.test.cjs',
            'tools/build/dts-pal-input.test.cjs',
            'tools/build/source-binding.test.cjs',
            'tools/build/source-map-publication.test.cjs',
        ],
        ['tools/verify/box3d/app-preparation.test.cjs'],
        ['tools/verify/box3d/public-feature-wiring.test.cjs'],
    ];
    for (const args of groups) {
        console.log(`\n> node ${args.join(' ')}`);
        const result = spawnSync(process.execPath, args, {
            cwd: root,
            env: { ...process.env, BOX3D_ST_TEST_BUILD: path.resolve(root, native) },
            stdio: 'inherit',
        });
        if (result.error || result.status !== 0) {
            if (result.error) console.error(result.error);
            process.exitCode = result.status || 1;
            break;
        }
    }
}
