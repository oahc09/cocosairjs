const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const assert = require('node:assert/strict');
const root = process.cwd();
const directory = __dirname;
const campaign = require(path.join(root, 'tools/verify/example-evidence-campaign.cjs'));
const trace = require(path.join(root, 'tools/verify/api-trace.cjs'));
const gpu = require(path.join(root, 'tools/verify/webgpu-candidate.cjs'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const capture = () => {
    const inputs = campaign.collectInputs(root);
    const manifest = JSON.parse(fs.readFileSync('examples/files.json', 'utf8'));
    const scope = campaign.collectScope(root);
    const metadataFiles = ['examples/files.json', ...manifest.examples.map(entry => 'examples/' + entry.dir + '/example.json')];
    return { source: gpu.sourceFingerprint(root), candidate: trace.candidateFingerprint(), inputDigest: campaign.objectDigest(inputs),
        inputs, metadata: Object.fromEntries(metadataFiles.map(file => [file, sha(file)])),
        ordinaryExamples: scope.length, ordinarySessions: scope.reduce((count, entry) => count + entry.modes.length, 0),
        devtoolsExamples: manifest.examples.filter(entry => entry.requiresDevTools).map(entry => entry.id),
        buildCounter: JSON.parse(fs.readFileSync('tools/build/build-number.json')).lastBuildNumber };
};
if (process.argv.includes('--capture')) {
    const buildSources = require(path.join(root, 'tools/verify/example-evidence-preflight.cjs')).checkSourceMaps(root);
    const workspace = require(path.join(root, 'tools/verify/example-workspace.cjs'));
    const workspaceInputs = workspace.listWorkspaceInputs(root);
    const scope = campaign.collectScope(root);
    for (const entry of scope) workspace.validateReferences(root, entry, workspaceInputs);
    const previous = JSON.parse(fs.readFileSync('output/playwright/review-fixes/chromium/report.json'));
    const state = capture();
    assert.equal(sha('build/cocosair.module.js'), previous.bundleSha256, 'runtime bundle changed since verified fresh build');
    for (const [name, expected] of [['cocosair.module.js', 'ae9f7c0474e98373288650c58382c4cef40097ed48343fcad91c333645710b40'],
        ['cocosair.module.min.js', '8fa8467ce9b209b73c0d8b0714cc5cd199c873d85556f73199ba6f833458eb3b']]) {
        assert.equal(sha(path.join(root, 'build', name + '.map')), expected, 'source map changed since verified fresh build');
    }
    assert.equal(fs.lstatSync('node_modules').isSymbolicLink(), false);
    const record = { schema: 'cocos-air.local-release-refresh-inputs/v1', createdAt: new Date().toISOString(),
        apiCampaign: 'BLOCKED - Linux subreaper support unavailable; not an API freeze',
        head: cp.execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), buildSources,
        freshBuildLog: { path: 'output/playwright/review-fixes/build.log', sha256: sha('output/playwright/review-fixes/build.log') },
        freshSparkLog: { path: 'output/playwright/review-fixes/spark-build.log', sha256: sha('output/playwright/review-fixes/spark-build.log') }, ...state };
    fs.writeFileSync(path.join(directory, 'local-inputs.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ inputDigest: state.inputDigest, candidate: state.candidate, ordinaryExamples: state.ordinaryExamples,
        ordinarySessions: state.ordinarySessions, workspaceReferencesValid: true, buildSources: buildSources.map(row => ({ path: row.path, verified: row.verifiedSources })) }));
} else {
    const expected = JSON.parse(fs.readFileSync(path.join(directory, 'local-inputs.json')));
    const actual = capture();
    for (const key of ['source', 'candidate', 'inputDigest', 'metadata', 'buildCounter']) assert.deepEqual(actual[key], expected[key], 'input drift: ' + key);
    console.log(JSON.stringify({ unchanged: true, inputDigest: actual.inputDigest, metadataFiles: Object.keys(actual.metadata).length }));
}
