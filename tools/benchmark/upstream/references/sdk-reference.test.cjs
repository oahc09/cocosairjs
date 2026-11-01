/** Synthetic filesystem preparation only. No installed SDK/compiler/Vite execution or browser is launched. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { Writable } = require('node:stream');
const { spawnSync } = require('node:child_process');
const sdk = require('./sdk-reference.cjs');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function tar(files) {
    const records = [];
    for (const [name, content] of Object.entries(files)) {
        const data = Buffer.from(content),
            header = Buffer.alloc(512);
        header.write(name);
        header.write('0000644\0', 100);
        header.write('0000000\0', 108);
        header.write('0000000\0', 116);
        header.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
        header.write('00000000000\0', 136);
        header.fill(32, 148, 156);
        header.write('0', 156);
        header.write('ustar\0', 257);
        header.write(
            header
                .reduce((sum, byte) => sum + byte, 0)
                .toString(8)
                .padStart(6, '0') + '\0 ',
            148,
        );
        records.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
    }
    return zlib.gzipSync(Buffer.concat([...records, Buffer.alloc(1024)]));
}
function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-source-only-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const consumerDir = path.join(root, 'consumer');
    fs.mkdirSync(consumerDir);
    const installedPath = path.join(consumerDir, 'node_modules/cocosair');
    fs.mkdirSync(installedPath, { recursive: true });
    const files = {
        'package.json': JSON.stringify({
            name: 'cocosair.js',
            version: '0.0.0-synthetic',
            exports: {
                '.': { types: './index.d.ts', import: './index.js' },
                './math': { types: './math.d.ts', import: './math.js' },
            },
        }),
        'index.js': 'export class Scene {}\n',
        'math.js': 'export class Vec3 {}\n',
        'index.d.ts': 'export declare class Scene {}\n',
        'math.d.ts': 'export declare class Vec3 {}\n',
        'build/npm/cocosair.module.min.js': 'export class Scene{}\n',
        'decoders/draco.wasm': 'synthetic-non-executable-fixture',
        'decoders/meshopt.js': 'synthetic-non-executable-fixture',
        'decoders/basis.wasm': 'synthetic-non-executable-fixture',
    };
    for (const [name, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(installedPath, name)), { recursive: true });
        fs.writeFileSync(path.join(installedPath, name), content);
    }
    const archivePath = path.join(root, 'synthetic.tgz');
    fs.writeFileSync(
        archivePath,
        tar(Object.fromEntries(Object.entries(files).map(([name, content]) => ['package/' + name, content]))),
    );
    const tools = {};
    for (const [id, name, version] of [
        ['legacy', 'typescript', '4.9.5'],
        ['modern', 'typescript', '5.9.3'],
        ['vite', 'vite', '7.1.12'],
    ]) {
        const installationRoot = path.join(root, id),
            packageDir = path.join(installationRoot, 'node_modules', name);
        fs.mkdirSync(packageDir, { recursive: true });
        fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name, version }));
        tools[id] = { installationRoot, packageDir, installationSha256: sdk.treeDigest(installationRoot, true) };
    }
    const localResources = ['model.gltf', 'draco.wasm', 'meshopt.js', 'basis.wasm'].map((name) => {
        const file = name === 'model.gltf' ? path.join(root, name) : path.join(installedPath, 'decoders', name);
        if (name === 'model.gltf') fs.writeFileSync(file, 'synthetic-non-executable-fixture');
        return { file, urlPath: '/fixture/' + name, sha256: sha(fs.readFileSync(file)) };
    });
    return {
        root,
        config: {
            engine: 'cocosair',
            consumerDir,
            outputDir: path.join(consumerDir, 'prepared'),
            package: {
                archivePath,
                installedPath,
                sha256: sha(fs.readFileSync(archivePath)),
                version: '0.0.0-synthetic',
            },
            tools,
            localResources,
            modelURL: '/fixture/model.gltf',
            decoderURLs: { draco: '/fixture/draco.wasm', meshopt: '/fixture/meshopt.js', basis: '/fixture/basis.wasm' },
        },
    };
}
test('three missing matching declarations is an explicit blocker without executing or reading paths', () => {
    const result = sdk.prepareSDKConsumer({ engine: 'three' });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.referenceReceipt, null);
    assert.equal(result.code, 'THREE_MATCHING_DECLARATIONS_NOT_FROZEN');
    assert.match(result.reason, /0\.180\.0/);
});
test('consumer CPU and Vite execution require a separate explicit opt-in', async () => {
    assert.throws(() => sdk.collectSDKCPU({}), /execute:true/);
    await assert.rejects(sdk.startSDKViteDevelopment({}), /execute:true/);
});
test('archive traversal and checksum corruption are rejected without extraction', (t) => {
    const { root } = fixture(t);
    const archive = path.join(root, 'bad.tgz');
    fs.writeFileSync(archive, tar({ 'package/../escape': 'bad', 'package/package.json': '{}' }));
    assert.throws(() => sdk.archiveEntries(archive), /unsafe archive path/);
    const bytes = zlib.gunzipSync(tar({ 'package/package.json': '{}' }));
    bytes[1] ^= 1;
    fs.writeFileSync(archive, zlib.gzipSync(bytes));
    assert.throws(() => sdk.archiveEntries(archive), /checksum mismatch/);
});
test('synthetic preparation binds archives, compilers, all categories and native browser sources without execution', (t) => {
    const { config } = fixture(t),
        prepared = sdk.prepareSDKConsumer(config);
    assert.equal(prepared.status, 'PREPARED_NOT_EXECUTED');
    assert.equal(prepared.cpuExecution, 'NOT_RUN');
    assert.equal(prepared.browserExecution, 'NOT_RUN');
    assert.equal(prepared.fixtureSource.originalNegativeCases, 21);
    assert.equal(prepared.negativeManifest.length, 23);
    assert.deepEqual(
        [...new Set(prepared.negativeManifest.map((row) => row.category))].sort(),
        sdk.SDK_NEGATIVE_CATEGORIES.filter((category) => category !== 'request-policy').sort(),
    );
    assert.deepEqual(
        prepared.modes.map((mode) => mode.id),
        ['4.9.5/node', '4.9.5/node16', '5.9.3/node16', '5.9.3/bundler'],
    );
    assert(
        prepared.modes.every((mode) => mode.options.strictNullChecks === true && mode.options.skipLibCheck === true),
    );
    for (const entry of prepared.generatedSources.filter((row) => /\.(mjs|cjs)$/.test(row.path))) {
        const result = spawnSync(process.execPath, ['--check', path.join(prepared.outputDir, entry.path)], {
            encoding: 'utf8',
        });
        assert.equal(result.status, 0, result.stderr); // Parse-only, does not import or execute the fixture.
    }
    assert.throws(() => sdk.prepareSDKConsumer(config), /output exists/);
    assert.throws(
        () => sdk.finalizeSDKObservation(prepared, { status: 'NOT_RUN', fixtureScope: 'paired-common/1' }, []),
        /CPU failures/,
    );
});
test('changed installed engine bytes or frozen tooling bytes cannot be prepared', (t) => {
    const { config } = fixture(t);
    fs.appendFileSync(path.join(config.package.installedPath, 'index.js'), '// changed');
    assert.throws(() => sdk.prepareSDKConsumer(config), /installed bytes differ/);
    const second = fixture(t).config;
    fs.appendFileSync(path.join(second.tools.modern.packageDir, 'package.json'), '\n');
    assert.throws(() => sdk.prepareSDKConsumer(second), /tool installation changed/);
});
test('local middleware serves real frozen decoder bytes and explicit missing-decoder404 without opening a server', async (t) => {
    const { config } = fixture(t),
        prepared = sdk.prepareSDKConsumer(config);
    const handler = sdk.createSDKRequestHandler(prepared);
    async function request(url) {
        const chunks = [];
        let status, headers;
        const response = new Writable({
            write(chunk, encoding, callback) {
                chunks.push(chunk);
                callback();
            },
        });
        response.writeHead = (value, values) => {
            status = value;
            headers = values;
        };
        const done = new Promise((resolve) => response.on('finish', resolve));
        handler({ url }, response);
        await done;
        return { status, headers, body: Buffer.concat(chunks).toString() };
    }
    const found = await request('/fixture/draco.wasm');
    assert.equal(found.status, 200);
    assert.equal(found.headers['Content-Type'], 'application/wasm');
    assert.equal(found.body, 'synthetic-non-executable-fixture');
    const missing = await request('/sdk-missing-decoder/draco');
    assert.equal(missing.status, 404);
    assert.match(missing.body, /missing frozen decoder/);
    const page = await request('/sdk/importmap.html');
    assert.equal(page.status, 200);
    assert.match(page.body, /sdk-installed\/index.js/);
});
function threeFixture(t) {
    const { root, config } = fixture(t);
    config.engine = 'three';
    const installedPath = path.join(config.consumerDir, 'node_modules/three');
    const files = {
        'package.json': JSON.stringify({
            name: 'three',
            version: '0.186.1',
            type: 'module',
            exports: {
                '.': { import: './build/three.module.js' },
                './src/*': './src/*',
                './addons/*': './examples/jsm/*',
            },
        }),
        'build/three.module.js': 'export class Scene {}\n',
        'src/math/Vector3.js': 'export class Vector3 {}\n',
        'examples/jsm/loaders/GLTFLoader.js': 'export class GLTFLoader {}\n',
        'decoders/draco.wasm': 'synthetic-non-executable-fixture',
        'decoders/meshopt.js': 'synthetic-non-executable-fixture',
        'decoders/basis.wasm': 'synthetic-non-executable-fixture',
    };
    function install(directory, archivePath, entries) {
        fs.mkdirSync(directory, { recursive: true });
        for (const [name, content] of Object.entries(entries)) {
            fs.mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
            fs.writeFileSync(path.join(directory, name), content);
        }
        fs.writeFileSync(
            archivePath,
            tar(Object.fromEntries(Object.entries(entries).map(([name, content]) => ['package/' + name, content]))),
        );
        return { installedPath: directory, archivePath, sha256: sha(fs.readFileSync(archivePath)) };
    }
    config.package = install(installedPath, path.join(root, 'synthetic-three.tgz'), files);
    for (const entry of config.localResources)
        if (entry.urlPath !== config.modelURL)
            entry.file = path.join(installedPath, 'decoders', path.basename(entry.file));
    config.declarations = {
        ...install(path.join(config.consumerDir, 'node_modules/@types/three'), path.join(root, 'synthetic-types.tgz'), {
            'package.json': JSON.stringify({
                name: '@types/three',
                version: '0.186.0',
                types: 'index.d.ts',
                dependencies: { '@types/webxr': '>=0.5.17' },
            }),
            'index.d.ts': '// SYNTHETIC placeholder. Never compiled or accepted as actual declarations.\n',
        }),
        name: '@types/three',
        version: '0.186.0',
        compatibleEngineVersion: '0.186.1',
    };
    const dependency = {
        ...install(path.join(config.consumerDir, 'node_modules/@types/webxr'), path.join(root, 'synthetic-webxr.tgz'), {
            'package.json': JSON.stringify({ name: '@types/webxr', version: '0.5.24', types: 'index.d.ts' }),
            'index.d.ts': '// SYNTHETIC dependency, never counted as a real compiler check.\n',
        }),
        name: '@types/webxr',
        version: '0.5.24',
    };
    config.declarationDependencies = [dependency];
    const lock = { lockfileVersion: 3, packages: {} };
    for (const artifact of [config.declarations, dependency]) {
        const meta = JSON.parse(fs.readFileSync(path.join(artifact.installedPath, 'package.json')));
        lock.packages[path.relative(config.consumerDir, artifact.installedPath).split(path.sep).join('/')] = {
            version: meta.version,
            dependencies: meta.dependencies || {},
            resolved: 'https://registry.npmjs.org/' + meta.name + '/-/synthetic.tgz',
            integrity:
                'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(artifact.archivePath)).digest('base64'),
        };
    }
    const lockPath = path.join(config.consumerDir, 'package-lock.json');
    fs.writeFileSync(lockPath, JSON.stringify(lock));
    config.declarationLock = { path: lockPath, sha256: sha(fs.readFileSync(lockPath)) };
    delete config.tools.legacy;
    return { root, config };
}
test('hypothetical exact Three declarations enable native categories without Cocos-only errors or invented minified entry', (t) => {
    const { config } = threeFixture(t);
    const prepared = sdk.prepareSDKConsumer(config);
    assert.equal(prepared.status, 'PREPARED_NOT_EXECUTED');
    assert.equal(prepared.compilerContract, 'upstream-sdk-types/3');
    assert.deepEqual(
        prepared.modes.map((mode) => mode.id),
        ['5.9.3/node16', '5.9.3/bundler'],
    );
    assert.deepEqual(prepared.compatibilityModeIds, []);
    assert.equal(prepared.declarationDependencies.length, 1);
    assert.deepEqual(prepared.negativeCategories, sdk.SDK_NEGATIVE_CATEGORIES_BY_ENGINE.three);
    assert.equal(prepared.negativeManifest.length, 7);
    assert.equal(prepared.minEntry, null);
    assert.deepEqual(prepared.browserModes, ['importmap-unminified', 'vite-development', 'vite-production']);
    assert.equal(prepared.viteOptions.build.minify, 'esbuild');
    assert.equal(prepared.mathSpecifier, 'three/src/math/Vector3.js');
    assert.match(fs.readFileSync(prepared.fixture, 'utf8'), /MeshBasicMaterialParameters as RuntimeMaterialParameters/);
    assert.doesNotMatch(fs.readFileSync(prepared.fixture, 'utf8'), /GLTFError|priority|httpCache/);
});
test('type-only Cocos negative controls query normal imports rather than trivially rejecting import-type syntax', (t) => {
    const { config } = fixture(t),
        prepared = sdk.prepareSDKConsumer(config),
        source = fs.readFileSync(prepared.fixture, 'utf8');
    assert.match(
        source,
        /import \{ GLTFInstance as RuntimeGLTFInstance, GLTFLoaderOptions as RuntimeGLTFLoaderOptions/,
    );
    assert.match(source, /const runtimeInstance = RuntimeGLTFInstance;/);
    assert.doesNotMatch(source, /import type \{ GLTFInstance as RuntimeGLTFInstance/);
    assert.match(fs.readFileSync(path.join(prepared.outputDir, 'compiler-probe.cjs'), 'utf8'), /declaredMathExports/);
});
test('an arbitrary decoder file hash cannot substitute for frozen shipped decoder bytes', (t) => {
    const { root, config } = fixture(t);
    const decoder = config.localResources.find((entry) => entry.urlPath === config.decoderURLs.draco);
    const external = path.join(root, 'unproven-decoder.wasm');
    fs.copyFileSync(decoder.file, external);
    decoder.file = external;
    assert.throws(() => sdk.prepareSDKConsumer(config), /arbitrary file hash is insufficient/);
});
test('prepared sources are immutable and unknown middleware routes pass to a supplied next callback', (t) => {
    const { config } = fixture(t),
        prepared = sdk.prepareSDKConsumer(config);
    let nextCalls = 0;
    sdk.createSDKRequestHandler(prepared)({ url: '/vite-generated-module.js' }, {}, () => nextCalls++);
    assert.equal(nextCalls, 1);
    fs.appendFileSync(prepared.fixture, '// drift\n');
    assert.throws(
        () => sdk.finalizeSDKObservation(prepared, { status: 'NOT_RUN', fixtureScope: 'paired-common/1' }, []),
        /generated source changed/,
    );
});

test('Three declaration closure rejects missing, duplicate, stale or unrelated dependency identities', (t) => {
    for (const [mutate, message] of [
        [
            (config) => {
                config.declarationDependencies = [];
            },
            /unfrozen declaration dependency/,
        ],
        [
            (config) => {
                config.declarationDependencies.push(config.declarationDependencies[0]);
            },
            /duplicate declaration dependency/,
        ],
        [
            (config) => {
                config.declarationLock.sha256 = '0'.repeat(64);
            },
            /declaration lock changed/,
        ],
        [
            (config) => {
                config.declarationDependencies[0].sha256 = '0'.repeat(64);
            },
            /archive SHA256/,
        ],
    ]) {
        const { config } = threeFixture(t);
        mutate(config);
        assert.throws(() => sdk.prepareSDKConsumer(config), message);
    }
});
test('a rehashed lock cannot hide wrong dependency version, integrity, edges or registry', (t) => {
    for (const [key, value, message] of [
        ['version', '0.185.0', /wrong version in lock/],
        ['integrity', 'sha512-' + Buffer.alloc(64).toString('base64'), /integrity differs/],
        ['dependencies', {}, /dependency edges differ/],
        ['resolved', 'https://untrusted.invalid/archive.tgz', /official frozen registry/],
    ]) {
        const { config } = threeFixture(t);
        const lock = JSON.parse(fs.readFileSync(config.declarationLock.path));
        lock.packages['node_modules/@types/three'][key] = value;
        fs.writeFileSync(config.declarationLock.path, JSON.stringify(lock));
        config.declarationLock.sha256 = sha(fs.readFileSync(config.declarationLock.path));
        assert.throws(() => sdk.prepareSDKConsumer(config), message);
    }
});
test('changed declaration lock or dependency bytes fail before CPU execution', (t) => {
    for (const field of ['lock', 'dependency']) {
        const { config } = threeFixture(t);
        const prepared = sdk.prepareSDKConsumer(config);
        const file =
            field === 'lock'
                ? config.declarationLock.path
                : path.join(config.declarationDependencies[0].installedPath, 'index.d.ts');
        fs.appendFileSync(file, '\n');
        assert.throws(() => sdk.collectSDKCPU(prepared, { execute: true }), /lock changed|installed bytes differ/);
    }
});

test('an unrelated installed package cannot widen the declaration source allowlist', (t) => {
    const { root, config } = threeFixture(t);
    const archivePath = path.join(root, 'synthetic.tgz');
    config.declarationDependencies.push({
        name: 'cocosair.js',
        version: '0.0.0-synthetic',
        archivePath,
        installedPath: path.join(config.consumerDir, 'node_modules/cocosair'),
        sha256: sha(fs.readFileSync(archivePath)),
    });
    assert.throws(() => sdk.prepareSDKConsumer(config), /unrelated package/);
});

test('candidate U06 extension preserves all 36 negatives but cannot impersonate paired AU12', (t) => {
    const { config } = fixture(t);
    const prepared = sdk.prepareSDKConsumer({ ...config, fixtureScope: 'candidate-u06-extension/1' });
    assert.equal(prepared.fixtureScope, 'candidate-u06-extension/1');
    assert.equal(prepared.taskId, 'U06');
    assert.equal(prepared.fixtureSource.originalNegativeCases, 33);
    assert.equal(prepared.negativeManifest.length, 36);
    assert.equal(prepared.fixtureSource.path, 'test/fixtures/upstream-sdk/contracts.ts');
    assert.deepEqual(prepared.negativeCategories, sdk.SDK_NEGATIVE_CATEGORIES);
    assert.throws(
        () => sdk.finalizeSDKObservation(prepared, { status: 'CPU_OBSERVED_BROWSER_PENDING' }, []),
        /cannot substitute/,
    );
});
test('paired SDK preparation rejects unknown scope and forged CPU scope', (t) => {
    const { config } = fixture(t);
    assert.throws(() => sdk.prepareSDKConsumer({ ...config, fixtureScope: 'unknown' }), /unknown SDK fixture scope/);
    const prepared = sdk.prepareSDKConsumer(config);
    assert.equal(prepared.fixtureScope, 'paired-common/1');
    assert.doesNotMatch(fs.readFileSync(prepared.fixture, 'utf8'), /AirRequestPolicy|httpCache|priority/);
    assert.throws(
        () =>
            sdk.finalizeSDKObservation(
                prepared,
                { status: 'CPU_OBSERVED_BROWSER_PENDING', fixtureScope: 'candidate-u06-extension/1' },
                [],
            ),
        /CPU fixture scope/,
    );
});

test('relabeling an extension preparation cannot produce a common receipt', (t) => {
    const { config } = fixture(t);
    const prepared = sdk.prepareSDKConsumer({ ...config, fixtureScope: 'candidate-u06-extension/1' });
    prepared.fixtureScope = 'paired-common/1';
    prepared.taskId = 'AU12';
    assert.throws(
        () =>
            sdk.finalizeSDKObservation(
                prepared,
                { fixtureScope: 'paired-common/1', status: 'CPU_OBSERVED_BROWSER_PENDING' },
                [],
            ),
        /fixture identity differs/,
    );
});
