/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Read-only strict consumers of an explicitly selected existing SDK declaration file.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const args = process.argv.slice(2);
assert(args.length === 2 && args[0] === '--dts', 'Use --dts EXISTING_SDK_DECLARATION_FILE');
const dts = path.resolve(args[1]);
assert(fs.statSync(dts).isFile() && /\.d\.(?:ts|mts|cts)$/.test(dts), 'Expected existing declarations');
const fixture = path.join(__dirname, 'public-sdk-types.fixture.mts');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const before = { dts: hash(dts), fixture: hash(fixture) };
const results = [];
for (const [name, moduleKind, resolution] of [
    ['ESNext', ts.ModuleKind.ESNext, ts.ModuleResolutionKind.NodeJs],
    ['Node16', ts.ModuleKind.Node16, ts.ModuleResolutionKind.Node16],
]) {
    const program = ts.createProgram([fixture], {
        target: ts.ScriptTarget.ES2022,
        module: moduleKind,
        moduleResolution: resolution,
        noEmit: true,
        strict: true,
        skipLibCheck: false,
        types: [],
        lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
        baseUrl: path.resolve(__dirname, '../../..'),
        paths: { 'cocosair.js': [dts] },
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length) {
        console.error(
            ts.formatDiagnosticsWithColorAndContext(diagnostics, {
                getCanonicalFileName: (file) => file,
                getCurrentDirectory: () => process.cwd(),
                getNewLine: () => '\n',
            }),
        );
        process.exitCode = 1;
    }
    results.push({ module: name, diagnostics: diagnostics.length, skipLibCheck: false });
}
assert.deepEqual({ dts: hash(dts), fixture: hash(fixture) }, before, 'Declarations/fixture changed during consumption');
console.log(JSON.stringify({ scope: 'PUBLIC_TYPES_ONLY', hashes: before, results }));
