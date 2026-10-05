// One integration archive producer. Raw reports are copied byte-for-byte.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = process.cwd(), dest = 'docs/evidence/examples/rendering-contracts';
const common = require(path.join(root, 'tools/verify/example-spec-common.cjs'));
const trace = require(path.join(root, 'tools/verify/api-trace.cjs'));
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const ensure = (ok, message) => { if (!ok) throw Error(message); };
const stored = [];
function copy(from, to, kind) {
    const output = path.join(dest, to);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    ensure(!fs.existsSync(output), `Archive target exists: ${output}`);
    fs.copyFileSync(from, output);
    ensure(sha(from) === sha(output), `Archive bytes changed: ${from}`);
    stored.push({ origin: from.replaceAll('\\', '/'), stored: output.replaceAll('\\', '/'), kind, bytes: fs.statSync(output).size, sha256: sha(output) });
}
function copyDir(from, to, kind) {
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const source = path.join(from, entry.name), output = path.join(to, entry.name);
        if (entry.isDirectory()) copyDir(source, output, kind); else copy(source, output, kind);
    }
}
const bundleSha256 = sha('build/cocosair.module.js');
const target = JSON.parse(fs.readFileSync('output/rendering-contracts/attempt-02.json'));
ensure(target.status === 'PASS' && target.candidateUnchanged && target.bundleSha256 === bundleSha256 && target.results.length === 3, 'Target scope is not current/all-three PASS');
for (const [file, digest] of Object.entries(target.sourceSha256)) ensure(sha(file) === digest, `Target source drift: ${file}`);
copy('output/rendering-contracts/attempt-02.json', 'target/report.json', 'current-raw-report');
copyDir('output/rendering-contracts/attempt-02-artifacts', 'target/screenshots', 'current-screenshot');
const hdrDir = JSON.parse(fs.readFileSync('output/rendering-contracts/integration-hdr-location.json')).directory;
for (const browser of ['chromium', 'firefox', 'webkit']) {
    const folder = `output/rendering-contracts/integration-water-${browser}`;
    const report = JSON.parse(fs.readFileSync(`${folder}/report.json`));
    ensure(report.completed && report.checks.length === 39 && report.checks.every((check) => check.ok) && !report.errors.length && report.candidate === bundleSha256, `Water ${browser} is incomplete or stale`);
    for (const file of report.sourceFiles) ensure(sha(path.join('examples/water-multipass', file.path)) === file.sha256, `Water source drift: ${file.path}`);
    for (const image of report.snapshots) ensure(sha(`${folder}/${image.name}.png`) === image.sha256, `Water screenshot drift: ${image.name}`);
    copyDir(folder, `water/${browser}`, 'current-water-report-or-screenshot');
    const hdr = JSON.parse(fs.readFileSync(`${hdrDir}/${browser}.json`));
    ensure(hdr.status === 'PASS' && hdr.checks.length === 15 && hdr.checks.every((check) => check.ok) && !hdr.failures.length && hdr.bundle === bundleSha256, `HDR ${browser} is incomplete or stale`);
    for (const [file, digest] of Object.entries(hdr.sourceHashes)) ensure(sha(path.join('examples/hdr-color-pipeline', file)) === digest, `HDR source drift: ${file}`);
    const formalFile = `${dest}/formal-${browser}${browser === 'chromium' ? '-attempt2' : ''}.json`;
    const formal = JSON.parse(fs.readFileSync(formalFile));
    ensure(formal.scopePassed && formal.runTotal === 2 && formal.runPass === 2 && formal.results.length === 2 && formal.candidateFingerprint === trace.candidateFingerprint(), `Formal ${browser} is incomplete or stale`);
    for (const item of formal.results) {
        const spec = JSON.parse(fs.readFileSync(`examples/${item.id}/example.json`));
        ensure(item.result === 'PASS' && item.specFingerprint === common.specFingerprintOf(spec) && item.sourceFingerprint === trace.sourceFingerprint(path.resolve('examples', item.id)), `Formal source/spec drift: ${item.id}`);
        ensure(item.apiProof.every((proof) => proof.proof === 'verified'), `Formal API proof missing: ${item.id}`);
    }
}
copyDir(hdrDir, 'hdr', 'current-hdr-report-or-screenshot');
const queue = JSON.parse(fs.readFileSync('output/water-multipass/native-queue/report.json'));
ensure(queue.completed && queue.checks.length === 6 && queue.checks.every((check) => check.ok) && !queue.errors.length && !queue.glErrors.length && queue.candidate === bundleSha256 && queue.source === sha('examples/water-multipass/src/main.ts') && queue.observer === sha('tools/debug/render-queue.ts'), 'Native queue proof is stale');
copyDir('output/water-multipass/native-queue', 'native-queue', 'current-native-queue-proof');
copy('output/rendering-contracts/attempt-01.json', 'history/target-attempt-01-fail.json', 'historical-failure-not-current');
copy('output/rendering-contracts/firefox-read-cache-diagnosis.json', 'history/firefox-read-cache-diagnosis.json', 'historical-diagnosis');
copy('output/rendering-contracts/integration-spec-validation.json', 'history/spec-validation-attempt-01-fail.json', 'historical-failure-not-current');
copyDir('examples/water-multipass', 'sources/examples/water-multipass', 'current-example-source');
copyDir('examples/hdr-color-pipeline', 'sources/examples/hdr-color-pipeline', 'current-example-source');
copyDir('examples/shared', 'sources/examples/shared', 'current-shared-source');
const sourceFiles = [
    ...Object.keys(target.sourceSha256),
    'src/air/rendering/render-target.ts', 'src/air/rendering/color-contract.ts', 'src/air/rendering/material-diagnostics.ts', 'src/air/index.ts',
    'src/cocos/asset/assets/asset-enum.ts', 'src/cocos/asset/assets/render-texture.ts', 'src/cocos/render-scene/core/render-window.ts', 'src/cocos/render-scene/scene/camera.ts', 'src/cocos/rendering/render-pipeline.ts',
    'tools/debug/render-queue.ts', 'tools/verify/consumer-acceptance.cjs', 'tools/verify/example-spec-browser.cjs', 'tools/verify/api-trace.cjs', 'tools/verify/example-spec-common.cjs',
    'tools/examples/spec-fixlines.cjs', 'tools/examples/spec-validate.cjs', 'tools/examples/generate-manifest.cjs',
    'package.json', 'tsconfig.json', 'src/cc.config.json', 'README.md', 'tools/README.md', 'docs/UPSTREAM.md',
    'docs/manual/rendering-contracts.md', 'docs/reference/rendering-color-diagnostics.md', 'docs/manual/index.md',
    ...fs.readdirSync('test/smoke').filter((name) => name.startsWith('render-dx-') && name.endsWith('.test.ts')).map((name) => `test/smoke/${name}`),
];
for (const file of new Set(sourceFiles)) copy(file, `sources/${file}`, 'current-implementation-or-validator-source');
for (const entry of fs.readdirSync('output/rendering-contracts').filter((name) => name.startsWith('integration-') && name.endsWith('.log')))
    copy(`output/rendering-contracts/${entry}`, `logs/${entry}`, 'observed-command-log');
// Include the formal collector's already stored bytes and image hashes without rewriting them.
function recordExisting(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) recordExisting(file);
        else if (!stored.some((item) => path.resolve(item.stored) === path.resolve(file))) stored.push({ origin: file.replaceAll('\\', '/'), stored: file.replaceAll('\\', '/'), kind: file.includes('formal-chromium.json') ? 'historical-formal-failure' : 'current-formal-report-or-artifact', bytes: fs.statSync(file).size, sha256: sha(file) });
    }
}
recordExisting(dest);
const index = {
    schema: 'air-rendering-integration-evidence/1', measuredAt: new Date().toISOString(),
    scope: ['render-target', 'water-multipass', 'hdr-color-pipeline', 'legacy-native-queue', 'new-example-specification'],
    scopePassed: true, fullGalleryVerified: false, releaseReadyClaimed: false,
    candidate: Object.fromEntries(['build/cocosair.module.js', 'build/cocosair.module.min.js', 'build/cocosair.module.d.ts', 'build/npm/cocosair.module.js'].map((file) => [file, { sha256: sha(file), bytes: fs.statSync(file).size }])),
    scopedChecks: { targetBrowsers: 3, water: '3 browsers x 39 PASS', hdr: '3 browsers x 15 PASS', nativeQueue: '6 PASS', formal: '3 browsers x 2 examples; scopePassed=true, producer completed=false/subset preserved', unit: '6 suites / 22 tests PASS' },
    limitations: ['No actual hardware sample reduction on these devices; lower contract covered by explicitly simulated CPU test.', 'Firefox/WebKit GPU timer unavailable=null; no physical present/FPS claim.', 'RGBA32F/sRGB render-target combinations, custom queues, instancing/UI global draw ordering are outside the dedicated target proof.', 'Old whole-gallery evidence was not recaptured and must not be claimed current.'],
    baselineFailures: [{ command: 'node tools/verify/manual-doc-consistency.cjs --strict', exitCode: 1, scope: 'pre-existing module-only manual-port-recipes lacks standalone index.html / traditional index entry; HEAD-tracked before this change', log: `${dest}/logs/integration-manual-consistency.log` }],
    files: stored,
};
ensure(!fs.existsSync(`${dest}/index.json`), 'Index already exists');
fs.writeFileSync(`${dest}/index.json`, JSON.stringify(index, null, 2) + '\n');
console.log(JSON.stringify({ scopePassed: index.scopePassed, files: stored.length, bytes: stored.reduce((sum, item) => sum + item.bytes, 0), bundleSha256 }, null, 2));
