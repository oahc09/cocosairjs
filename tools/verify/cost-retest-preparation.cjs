// Synthetic filesystem fixtures verify preparation safety, never Agent costs or scene attainment.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const repo = path.resolve(__dirname, '../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cost-retest-prep-test-'));
function write(file, text) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
}
function tar(files) {
    const parts = [];
    for (const [name, text] of Object.entries(files)) {
        const data = Buffer.from(text);
        const header = Buffer.alloc(512);
        header.write('package/' + name);
        header.write('0000644\0', 100);
        header.write('0000000\0', 108);
        header.write('0000000\0', 116);
        header.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
        header.write('00000000000\0', 136);
        header.fill(32, 148, 156);
        header.write('0', 156);
        header.write('ustar\0', 257);
        header.write('00', 263);
        const sum = header.reduce((total, value) => total + value, 0);
        header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
        parts.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
    }
    parts.push(Buffer.alloc(1024));
    return zlib.gzipSync(Buffer.concat(parts));
}
function invoke(bench, candidate, target, extra = [], nodeArguments = []) {
    return spawnSync(
        process.execPath,
        [
            ...nodeArguments,
            path.join(repo, 'tools/benchmark/prepare-cost-retest.mjs'),
            `--bench-root=${bench}`,
            `--candidate=${candidate}`,
            `--run-root=${target}`,
            `--identity=${path.join(repo, 'tools/benchmark/cost-retest-identity.json')}`,
            '--scenes=E01',
            '--profiles=K0,K1',
            '--repeats=2',
            ...extra,
        ],
        { encoding: 'utf8' },
    );
}
try {
    const bench = path.join(temporary, 'old-bench');
    const target = path.join(temporary, 'new-cohort');
    for (const file of ['agents.yaml', 'benchmark.yaml', 'environments.yaml'])
        write(path.join(bench, 'config', file), 'fixture: true\n');
    write(path.join(bench, 'briefs/E01/spec.json'), JSON.stringify({ briefId: 'E01', assets: [] }));
    write(path.join(bench, 'briefs/E01/brief.md'), 'Fixture only: not a scene trial.\n');
    for (const engine of ['cocosair', 'three']) {
        write(
            path.join(bench, `templates/${engine}/package.json`),
            JSON.stringify({ name: 'test-template-' + engine }),
        );
        write(path.join(bench, `templates/${engine}/src/main.js`), '// preparation fixture only\n');
        write(path.join(bench, `knowledge/K0/${engine}/README.md`), 'frozen-old-' + engine);
        write(path.join(bench, `knowledge/K0/${engine}/manifest.json`), JSON.stringify({ engine, testFixture: true }));
    }
    write(path.join(bench, 'knowledge/K1/three/README.md'), 'official-fixture-doc');
    write(path.join(bench, 'node_modules/three/package.json'), JSON.stringify({ name: 'three', version: '0.186.1' }));
    write(path.join(bench, 'node_modules/three/index.js'), '// test fixture\n');
    const candidate = path.join(temporary, 'fixture.tgz');
    fs.writeFileSync(
        candidate,
        tar({
            'package.json': JSON.stringify({
                name: 'cocosair.js',
                version: '1.0.0',
                main: 'build/npm/cocosair.module.js',
                types: 'build/cocosair.module.d.ts',
            }),
            'build/npm/cocosair.module.js': 'export const fixtureOnly = true;\n',
            'build/cocosair.module.d.ts': 'export const fixtureOnly: boolean;\n',
            'README.md': 'new-readme-must-not-leak-into-K0',
            'docs/answer.md': 'must-not-appear-in-installed-K0',
            'docs/THIRD_PARTY_LICENSES.md': 'legal-notice',
        }),
    );
    const dry = invoke(bench, candidate, target);
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal(fs.existsSync(target), false, 'dry-run must not write a cohort');
    const threeMetadata = path.join(bench, 'node_modules/three/package.json');
    const originalThreeMetadata = fs.readFileSync(threeMetadata);
    for (const [label, metadata] of [
        ['r187', { name: 'three', version: '0.187.0' }],
        ['r186-other-patch', { name: 'three', version: '0.186.0' }],
        ['wrong-package', { name: 'not-three', version: '0.186.1' }],
    ]) {
        write(threeMetadata, JSON.stringify(metadata));
        const rejectedRoot = path.join(temporary, label);
        const rejected = invoke(bench, candidate, rejectedRoot, ['--execute']);
        assert.equal(rejected.status, 2, `${label} must not be labelled three@0.186.1`);
        assert.match(rejected.stderr, /three baseline/);
        assert.equal(fs.existsSync(rejectedRoot), false, 'baseline rejection must precede cohort writes');
    }
    fs.unlinkSync(threeMetadata);
    const missingRoot = path.join(temporary, 'missing-three-metadata');
    assert.equal(invoke(bench, candidate, missingRoot, ['--execute']).status, 2);
    assert.equal(fs.existsSync(missingRoot), false);
    fs.writeFileSync(threeMetadata, originalThreeMetadata);
    const corruptCopy = path.join(temporary, 'corrupt-copy.cjs');
    write(
        corruptCopy,
        `const fs = require('node:fs');
const path = require('node:path');
const copy = fs.cpSync;
fs.cpSync = function (source, destination, options) {
    copy(source, destination, options);
    if (source === ${JSON.stringify(path.join(bench, 'node_modules/three'))})
        fs.writeFileSync(path.join(destination, 'index.js'), '// corrupted synthetic copied package');
};
`,
    );
    const corruptRoot = path.join(temporary, 'corrupt-copy');
    const corrupted = invoke(bench, candidate, corruptRoot, ['--execute'], ['--require', corruptCopy]);
    assert.equal(corrupted.status, 1);
    assert.match(corrupted.stderr, /three baseline changed after preflight/);
    assert.equal(fs.existsSync(corruptRoot), true, 'incomplete attempt must remain available for inspection');
    assert.equal(fs.existsSync(path.join(corruptRoot, 'COHORT.json')), false, 'no completed cohort on copy drift');
    assert.equal(fs.readFileSync(path.join(bench, 'node_modules/three/index.js'), 'utf8'), '// test fixture\n');
    const oldMeta = fs.readFileSync(path.join(bench, 'knowledge/K0/cocosair/manifest.json'));
    const result = invoke(bench, candidate, target, ['--execute']);
    assert.equal(result.status, 0, result.stderr);
    const cohort = JSON.parse(fs.readFileSync(path.join(target, 'COHORT.json')));
    assert.equal(cohort.pairCount, 4);
    assert.equal(cohort.armCount, 8);
    assert.equal(cohort.threeBaseline.name, 'three');
    assert.equal(cohort.threeBaseline.version, '0.186.1');
    assert.match(cohort.threeBaseline.installedPackageHash, /^[a-f0-9]{64}$/);
    assert.equal(cohort.threeBaseline.artifactSha256, null, 'local tree hashing cannot authenticate an archive');
    assert.match(cohort.threeBaseline.provenance, /registry archive not authenticated/);
    const packages = [];
    for (const id of cohort.preparedPairs) {
        const pair = JSON.parse(fs.readFileSync(path.join(target, id, 'pair.json')));
        assert.equal(pair.pairStatus, 'PREPARED_NOT_RUN');
        for (const [arm, record] of Object.entries(pair.arms)) {
            assert.equal(record.modelId, 'gpt-6-luna');
            assert.equal(record.reasoningEffort, 'high');
            assert.equal(record.metrics.agentToolCalls, null);
            assert.equal(record.metrics.observedExecutionEvents, null);
            if (record.engine === 'three') {
                assert.deepEqual(record.enginePackage, { name: 'three', version: '0.186.1' });
                assert.equal(record.installedPackageHash, cohort.threeBaseline.installedPackageHash);
            }
            if (record.engine === 'cocosair') {
                assert.deepEqual(record.enginePackage, { name: 'cocosair.js', version: '1.0.0' });
                const directory = path.join(target, id, arm, 'workspace/node_modules/cocosair.js');
                assert.equal(fs.readFileSync(path.join(directory, 'README.md'), 'utf8'), 'frozen-old-cocosair');
                assert.equal(fs.existsSync(path.join(directory, 'docs/answer.md')), false);
                assert.equal(fs.existsSync(path.join(directory, 'docs/THIRD_PARTY_LICENSES.md')), true);
                packages.push(record.installedPackageHash);
            }
        }
    }
    assert.equal(new Set(packages).size, 1, 'K0/K1 must execute identical visible package trees');
    assert(
        fs.readFileSync(path.join(bench, 'knowledge/K0/cocosair/manifest.json')).equals(oldMeta),
        'historical metadata must remain unchanged',
    );
    assert.equal(invoke(bench, candidate, target, ['--execute']).status, 2, 'existing cohort cannot be overwritten');
    assert.equal(
        invoke(bench, candidate, path.join(bench, 'bad-root'), ['--execute']).status,
        2,
        'old benchmark tree writes must be rejected',
    );
    const identityFile = path.join(temporary, 'bad-identity.json');
    write(
        identityFile,
        JSON.stringify({ modelId: 'wrong-route', reasoningEffort: 'low', selectionSource: 'untrusted' }),
    );
    const wrongIdentity = spawnSync(
        process.execPath,
        [
            path.join(repo, 'tools/benchmark/prepare-cost-retest.mjs'),
            `--bench-root=${bench}`,
            `--candidate=${candidate}`,
            `--run-root=${path.join(temporary, 'identity-negative')}`,
            `--identity=${identityFile}`,
            '--scenes=E01',
            '--profiles=K0',
            '--repeats=1',
            '--execute',
        ],
        { encoding: 'utf8' },
    );
    assert.equal(wrongIdentity.status, 2, 'unapproved identity must be blocked');
    assert.equal(fs.existsSync(path.join(temporary, 'identity-negative')), false);
    console.log(
        JSON.stringify({
            status: 'PASS',
            scope: 'preparation safety only; no Agent trial/cost',
            pairFixtureCount: 4,
            dryRunNoWrite: true,
            identicalCodeAcrossKnowledge: true,
            noHistoricalMutation: true,
            exactThreeVersionAndTreeBound: true,
        }),
    );
} finally {
    const resolved = path.resolve(temporary);
    const expected = path.resolve(os.tmpdir()) + path.sep;
    if (!resolved.startsWith(expected) || !path.basename(resolved).startsWith('cost-retest-prep-test-'))
        throw new Error('Unsafe cleanup target');
    fs.rmSync(resolved, { recursive: true, force: true });
}
