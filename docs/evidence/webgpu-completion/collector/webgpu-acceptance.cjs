/* Read-only acceptance by default. --archive=<new directory> additionally snapshots verified evidence.
 * node tools/verify/webgpu-acceptance.cjs --reports=output/webgpu-completion/final [--archive=docs/evidence/webgpu-completion]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PNG } = require('pngjs');
const { sourceFingerprint, checkBuildSources } = require('./webgpu-candidate.cjs');
const root = path.resolve(__dirname, '../..');
const input = process.argv.find((arg) => arg.startsWith('--reports='))?.slice(10);
if (!input) throw Error('Pass --reports=<completed run directory>.');
const directory = path.resolve(root, input);
const archive = process.argv.find((arg) => arg.startsWith('--archive='))?.slice(10);
const failures = [];
const check = (condition, message) => {
    if (!condition) failures.push(message);
};
const read = (name) => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const candidate = sourceFingerprint(root);
const assets = require('../build/webgpu-assets.cjs').verify(root);
require('../build/builtin-assets.cjs').verify();
for (const folder of ['build/webgpu', 'build/npm/webgpu'])
    for (const [name, expected] of Object.entries(assets.files)) {
        check(
            sha(fs.readFileSync(path.join(root, folder, name))) === expected.sha256,
            folder + ': asset drift ' + name,
        );
    }
const collectors = [
    'webgpu-backend.cjs',
    'webgpu-resource-contracts.cjs',
    'webgpu-custom-pipeline.cjs',
    'webgpu-candidate.cjs',
    'browser-engines.cjs',
];
const probe = sha(Buffer.concat(collectors.map((name) => fs.readFileSync(path.join(__dirname, name)))));
const expected = [
    ['webgl2', 'webgpu-basic'],
    ['webgpu', 'webgpu-basic'],
    ...['shadows', 'csm'].flatMap((variant) => [
        ['webgl2', 'webgpu-basic', variant],
        ['webgpu', 'webgpu-basic', variant],
    ]),
    ['webgpu', 'webgpu-basic', 'assets'],
    ['webgl2', 'gltf-skin'],
    ...['gltf-basic', 'gltf-skin', 'gltf-morph', 'ui-components', 'sprite-mask-blend', 'render-composite'].flatMap(
        (example) => [['webgpu', example], ...(example !== 'gltf-skin' ? [['webgl2', example]] : [])],
    ),
    ['webgl2', 'native-custom'],
    ['webgpu', 'native-custom'],
].map((parts) => parts.join('/'));
const resourceKeys = [
    'readback',
    'syncReadbackRejected',
    'msaaResolve',
    'mipLayerAttachment',
    'mrtDepth',
    'compute',
    'storageTexture',
    'computeToDraw',
    'resizeRebind',
    'indirectCompute',
    'colorWriteMask',
    'minMaxBlend',
    'blendConstants',
    'mixedBlendRejected',
    'scaledBlit',
    'linearBlit',
];

function image(name, capture) {
    return PNG.sync.read(fs.readFileSync(path.join(directory, name, capture)));
}
function difference(a, b, threshold, sum = false) {
    check(a.width === b.width && a.height === b.height, 'PNG dimensions changed');
    let changed = 0,
        maxDelta = 0;
    for (let i = 0; i < a.data.length; i += 4) {
        const delta = [0, 1, 2].map((c) => Math.abs(a.data[i + c] - b.data[i + c]));
        const max = Math.max(...delta);
        maxDelta = Math.max(maxDelta, max);
        if ((sum ? delta.reduce((a, b) => a + b) : max) > threshold) changed++;
    }
    return { changed, maxDelta };
}

const reports = {};
for (const name of ['chromium', 'edge', 'firefox', 'webkit', 'package', 'package-min']) {
    const report = (reports[name] = read(name + '/report.json'));
    const bundle = name === 'package-min' ? 'cocosair.module.min.js' : 'cocosair.module.js';
    const artifact = path.join(root, 'build', name.startsWith('package') ? 'npm' : '.', bundle);
    check(
        report.completed && report.sourceUnchanged && report.sourceSha256 === candidate,
        name + ': stale/incomplete source',
    );
    check(
        report.probeSha256 === probe && report.bundleSha256 === sha(fs.readFileSync(artifact)),
        name + ': collector/bundle drift',
    );
    const map = checkBuildSources(root, bundle);
    check(
        map.compared > 0 && !map.mismatches.length && report.buildSources.sha256 === map.sha256,
        name + ': source map drift',
    );
    check(
        report.scope?.examples && report.scope?.custom && !report.scope.rendererFilter && !report.scope.exampleFilter,
        name + ': partial scope',
    );
    const keys = report.cases.map((item) =>
        [item.renderer, item.example, ...(item.variant ? [item.variant] : [])].join('/'),
    );
    check(
        keys.length === expected.length &&
            new Set(keys).size === expected.length &&
            expected.every((key) => keys.includes(key)),
        name + ': matrix rows missing/duplicated',
    );
    check(report.status === (name === 'webkit' ? 'BLOCKED' : 'PASS'), name + ': unexpected result');
    for (const item of report.cases) {
        const key = `${name}/${item.renderer}/${item.example}/${item.variant || ''}`;
        if (item.blocked) {
            check(
                name === 'webkit' &&
                    item.renderer === 'webgpu' &&
                    !report.webgpuAvailability.apiAvailable &&
                    item.rejection.code === 'WEBGPU_UNSUPPORTED' &&
                    !item.rejection.contexts.some((type) => /^webgl/.test(type)),
                key + ': unexplained blocker/fallback',
            );
            continue;
        }
        check(
            item.state.app &&
                item.visiblePixels >= 500 &&
                item.state.health.state === 'healthy' &&
                !item.errors.length &&
                !item.state.gpuErrors.length,
            key + ': rendering/errors',
        );
        check(item.state.api === (item.renderer === 'webgpu' ? 8 : 7), key + ': wrong backend');
        if (item.renderer === 'webgl2') {
            check(item.state.glError === 0, key + ': native WebGL error');
            check(item.translatorRequests.length === 0, key + ': eager translator loading');
        }
        if (item.renderer === 'webgpu')
            check(item.state.adapter?.isFallbackAdapter === false, key + ': hardware adapter not established');
        if (name === 'firefox') check(item.profile?.headless === false, key + ': wrong Firefox profile');
        if (item.resources && item.renderer === 'webgpu')
            check(
                resourceKeys.every((field) => item.resources[field] === true),
                key + ': resource contract missing/failed',
            );
        if (item.renderer === 'webgpu' && item.example === 'webgpu-basic' && !item.variant) {
            check(
                resourceKeys.every((field) => item.resources?.[field] === true),
                key + ': resource probe absent',
            );
            check(
                item.deviceLost?.health.state === 'failed' && item.deviceLost.submissionRejected,
                key + ': loss contract',
            );
        }
        const baseline = image(name, item.capture);
        if (item.example === 'gltf-skin') {
            const actual = difference(baseline, image(name, `gltf-skin-animated-${item.renderer}.png`), 12);
            check(
                actual.changed >= 100 && actual.changed === item.state.skinAnimationChangedPixels,
                key + ': animation pixels',
            );
        }
        if (item.variant === 'shadows' || item.variant === 'csm') {
            const actual = difference(
                baseline,
                image(name, `webgpu-basic-${item.variant}-${item.renderer}-disabled.png`),
                15,
                true,
            );
            check(actual.changed >= 100 && actual.changed === item.shadowChangedPixels, key + ': shadow pixels');
        }
        if (item.example === 'native-custom') {
            for (const effect of ['bloom', 'fxaa', 'grading', 'hbao', 'dof', 'fsr', 'taa']) {
                const on = difference(baseline, image(name, `native-${effect}-on-${item.renderer}.png`), 12);
                const restored = difference(baseline, image(name, `native-${effect}-restore-${item.renderer}.png`), 12);
                const stored = item.custom?.effectsAB[effect];
                check(
                    on.changed >= 50 &&
                        restored.maxDelta <= 1 &&
                        on.changed === stored?.on.changed &&
                        restored.maxDelta === stored?.restore.maxDelta,
                    key + ': ' + effect + ' pixels/restore',
                );
            }
            const oracle = item.custom?.gradingOracle;
            const index = (oracle.point.y * baseline.width + oracle.point.x) * 4;
            const off = Array.from(baseline.data.slice(index, index + 3));
            const graded = image(name, `native-grading-on-${item.renderer}.png`);
            const actual = Array.from(graded.data.slice(index, index + 3));
            const expected = [off[1], Math.round((Math.min(off[2] / 4, 63) * 255) / 63), off[0]];
            check(
                Math.max(...off) - Math.min(...off) > 64 &&
                    actual.length === 3 &&
                    actual.every(
                        (value, i) =>
                            Number.isFinite(value) && Math.abs(value - expected[i]) <= 2 && value === oracle.actual[i],
                    ),
                key + ': LUT oracle',
            );
        }
    }
    check(
        report.failures.length === (name === 'webkit' ? 1 : 4) && report.failures.every((item) => item.ok),
        name + ': failure contracts',
    );
}
const executions = read('execution.json');
check(
    executions.receipts.length === 6 &&
        ['environment', 'chromium', 'edge', 'firefox', 'webkit', 'consumer'].every((name) =>
            executions.receipts.some((item) => item.name === name && item.exitCode === (name === 'webkit' ? 1 : 0)),
        ),
    'OS receipt coverage',
);
check(
    executions.completed &&
        executions.passed &&
        executions.receipts.every((item) => !item.timedOut && item.exitCode === item.expectedExit),
    'OS execution receipts',
);
const environment = read('environment/report.json');
check(
    environment.completed &&
        environment.profiles.find((profile) => profile.name === 'firefox-headed')?.native.nativeReadback,
    'Firefox native environment preflight',
);
check(reports.firefox.launchOptions.headless === false, 'Firefox supported profile must be headed');
const summary = {
    desktopScopePassed: failures.length === 0,
    externalSafari: 'NOT_RUN - owner retained external acceptance',
    releaseReady: false,
    sourceSha256: candidate,
    failures,
    casesPerReport: expected.length,
    resourceContracts: resourceKeys.length,
};

if (archive && !failures.length) {
    const destination = path.resolve(root, archive);
    const normalize = (value) => (process.platform === 'win32' ? value.toLowerCase() : value);
    if (
        normalize(destination) === normalize(directory) ||
        normalize(destination).startsWith(normalize(directory) + path.sep)
    ) {
        throw Error('Archive must be outside the input directory.');
    }
    if (fs.existsSync(destination)) throw Error('Archive must be a new directory.');
    fs.mkdirSync(destination, { recursive: true });
    const files = {};
    function copyTree(from, to, prefix = '') {
        for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
            const relative = prefix + entry.name;
            if (entry.isDirectory()) {
                fs.mkdirSync(path.join(to, entry.name));
                copyTree(path.join(from, entry.name), path.join(to, entry.name), relative + '/');
            } else {
                const bytes = fs.readFileSync(path.join(from, entry.name));
                fs.writeFileSync(path.join(to, entry.name), bytes);
                files[relative] = sha(bytes);
            }
        }
    }
    copyTree(directory, destination);
    fs.mkdirSync(path.join(destination, 'collector'));
    for (const name of [
        ...collectors,
        'webgpu-environment.cjs',
        'webgpu-completion-runner.cjs',
        'webgpu-acceptance.cjs',
        'consumer-acceptance.cjs',
    ]) {
        const bytes = fs.readFileSync(path.join(__dirname, name));
        fs.writeFileSync(path.join(destination, 'collector', name), bytes);
        files['collector/' + name] = sha(bytes);
    }
    fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({ summary, files }, null, 2) + '\n');
}
console.log(JSON.stringify(summary, null, 2));
process.exitCode = failures.length ? 1 : 0;
