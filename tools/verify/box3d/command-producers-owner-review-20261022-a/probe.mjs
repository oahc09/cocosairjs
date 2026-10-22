/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Explicit injected internal-owner callback reentry. Pure source, not a natural native failure.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const file = 'src/air/physics/box3d/command-producers.ts';
const source = fs.readFileSync(file);
const sourceSha256 = crypto.createHash('sha256').update(source).digest('hex');
const module = ts.transpileModule(source.toString(), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { Box3DCommandProducers } = await import(
    `data:text/javascript;base64,${Buffer.from(module.outputText).toString('base64')}`
);
let registry,
    reenter = false,
    closeCalls = 0;
const owner = {
    assertConfiguration() {
        if (reenter) {
            reenter = false;
            closeCalls++;
            registry.close();
        }
    },
    validateContinuousBody() {},
    submit() {
        return 1;
    },
};
registry = new Box3DCommandProducers(owner);
reenter = true;
let handle,
    rejected = false,
    failure = null;
try {
    handle = registry.registerBeforeStep(() => {});
} catch (error) {
    rejected = true;
    failure = String(error);
}
const actual = registry.diagnostics();
const invariant = rejected && !actual.closed && actual.liveProducers === 0 && actual.registrations === 0;
const report = {
    status: invariant ? 'PASS_PURE_SOURCE_REENTRY_CONTROL' : 'RED_PURE_SOURCE_REENTRY_INVARIANT',
    source: { path: file, sha256: sourceSha256 },
    injection:
        'Internal owner.assertConfiguration calls registry.close while the outer registration admission is in progress. No native functions invoked.',
    observed: {
        rejected,
        failure,
        closeCalls,
        diagnostics: actual,
        handle: handle ? { enabled: handle.enabled, disposed: handle.disposed } : null,
    },
    invariant: 'Nested close must be refused and the outer registration must not install an entry after closure.',
    passed: invariant,
};
const destination = path.join(path.dirname(new URL(import.meta.url).pathname), 'probe.raw.json');
fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report));
process.exitCode = invariant ? 0 : 1;
