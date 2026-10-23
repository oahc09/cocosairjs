/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Bounded actual ccbuild ESM builder. No compiler/transpile/Jest stand-in and no public-source edits.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const [rootArg, outArg] = process.argv.slice(2);
assert(rootArg && outArg && process.argv.length === 4, 'Usage: esm45-build.cjs <disposable-root> <new-output>');
const root = fs.realpathSync(rootArg),
    out = path.resolve(outArg);
assert(!fs.existsSync(out), 'Never overwrite an ESM attempt');
const req = createRequire(path.join(root, 'package.json'));
const ts = req('typescript'),
    MagicString = req('magic-string');
const contract = require('./esm45-contract.json');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const read = (p) => fs.readFileSync(p);
const source = (p) => path.join(root, p);
const buildSource = read(source('tools/build/build.cjs')).toString();
const ast = ts.createSourceFile('build.cjs', buildSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let defaults;
function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'AIR_FEATURES') {
        assert(ts.isArrayLiteralExpression(node.initializer));
        defaults = node.initializer.elements.map((value) => {
            assert(ts.isStringLiteral(value));
            return value.text;
        });
    }
    ts.forEachChild(node, visit);
}
visit(ast);
assert.deepEqual(defaults, contract.defaultFeatures, 'Default feature inventory changed');
const features = [...defaults, 'physics-box3d'];
assert(features.every((f) => Object.hasOwn(require(source('src/cc.config.json')).features, f)));
const { buildEngine } = req('@cocos/ccbuild');
const { withESMHelpers } = require(source('tools/build/esm-helpers.cjs'));
const { lineEndingsPlugin } = require(source('tools/build/line-endings.cjs'));
const { stageBox3DAssets, box3DAssetsPlugin } = require(source('tools/build/box3d-assets.cjs'));
const meta = require(source('tools/build/build-metadata.cjs'));
const webgpu = require(source('tools/build/webgpu-assets.cjs'));
const box2d = require(source('tools/build/box2d3.cjs'));
const testEntry = source('tools/verify/box3d/esm45-test-only-entry.mjs');
const symbol = contract.transportSymbol;
function fixturePlugin(transforms) {
    return {
        name: 'air-box3d-esm45-TEST-ONLY',
        resolveId(id) {
            return id === 'air-box3d-esm45-test-only-entry' ? testEntry : null;
        },
        transform(code, id) {
            const relative = path.relative(root, id).split(path.sep).join('/');
            if (relative === 'src/exports/air.ts') {
                transforms.push({ path: relative, change: 'append TEST-ONLY export, in memory' });
                const edited = new MagicString(code);
                edited.append("\nexport * from 'air-box3d-esm45-test-only-entry';\n");
                return {
                    code: edited.toString(),
                    map: edited.generateMap({ hires: true, source: id, includeContent: true }),
                };
            }
            if (relative !== 'src/air/physics/box3d/feature.ts') return null;
            const tree = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
                calls = [];
            function walk(node) {
                if (ts.isCallExpression(node) && node.expression.getText(tree) === 'createBox3DSTLoader')
                    calls.push(node);
                ts.forEachChild(node, walk);
            }
            walk(tree);
            assert.equal(calls.length, 1);
            assert.equal(calls[0].arguments.length, 2);
            const edited = new MagicString(code);
            const at = calls[0].arguments[1].end;
            edited.appendLeft(at, `, (globalThis as any)[Symbol.for(${JSON.stringify(symbol)})]`);
            transforms.push({
                path: relative,
                change: 'TEST-ONLY third dependency argument; original lazy feature retained',
            });
            return {
                code: edited.toString(),
                map: edited.generateMap({ hires: true, source: id, includeContent: true }),
            };
        },
    };
}
(async () => {
    fs.mkdirSync(out);
    require(source('tools/build/builtin-assets.cjs')).verify();
    const report = {
        schema: 'box3d-esm45-build-v1',
        status: 'RUNNING',
        productionIntegration: 'UNFINISHED_LOADER_ONLY',
        sourceBuildToolSHA256: sha(Buffer.from(buildSource)),
        features,
        node: process.version,
        ccbuild: JSON.parse(read(source('node_modules/@cocos/ccbuild/package.json'))).version,
        buildCounterMutation: false,
        incrementalCache: false,
        graphs: [],
    };
    const flush = () => fs.writeFileSync(path.join(out, 'build.raw.json'), JSON.stringify(report, null, 2) + '\n');
    flush();
    try {
        for (const mode of ['production-selected', 'TEST-ONLY-explicit-adapter']) {
            const graphOut = path.join(out, mode),
                transforms = [],
                modules = [];
            fs.mkdirSync(graphOut);
            webgpu.copy(root, graphOut);
            box2d.copy(graphOut);
            const staged = await stageBox3DAssets({
                features,
                outputDirectory: graphOut,
                buildDirectory: source(contract.n4RelativeDirectory),
            });
            const graph = {
                mode,
                transforms,
                modules,
                status: 'RUNNING',
                options: {
                    engine: 'src',
                    moduleFormat: 'esm',
                    mode: 'BUILD',
                    platform: 'HTML5',
                    compress: false,
                    flags: { SUPPORT_JIT: false },
                    sourceMap: true,
                    features,
                    targets: { chrome: '66' },
                },
                descriptor: staged.descriptor,
            };
            report.graphs.push(graph);
            flush();
            const observer = {
                name: 'air-box3d-esm45-module-provenance',
                generateBundle() {
                    for (const id of this.getModuleIds()) {
                        const info = this.getModuleInfo(id);
                        const local = path.isAbsolute(id) && fs.existsSync(id) && fs.statSync(id).isFile();
                        modules.push({
                            id: local ? path.relative(root, id).split(path.sep).join('/') : id,
                            external: info.isExternal,
                            sourceSHA256: local ? sha(read(id)) : null,
                            transformedSHA256: typeof info.code === 'string' ? sha(Buffer.from(info.code)) : null,
                        });
                    }
                    modules.sort((a, b) => a.id.localeCompare(b.id));
                    assert.equal(
                        modules.filter((m) => m.id === 'src/cocos/physics/framework/physics-system.ts').length,
                        1,
                        'Exactly one actual PhysicsSystem module in each engine graph',
                    );
                    assert.equal(
                        modules.filter((m) => m.id === 'src/air/physics/box3d/prepare.ts').length,
                        1,
                        'Exactly one preparation registry in each engine graph',
                    );
                },
            };
            const plugins = [
                lineEndingsPlugin(),
                webgpu.webgpuAssetsPlugin(root),
                box2d.box2dAssetsPlugin(),
                box3DAssetsPlugin(staged),
                meta.buildMetadataPlugin(
                    root,
                    meta.resolveBuildDate(String(contract.sourceDateEpoch)),
                    meta.readBuildNumber(root) + 1,
                ),
                ...(mode.startsWith('TEST-ONLY') ? [fixturePlugin(transforms)] : []),
                observer,
            ];
            await withESMHelpers(
                root,
                () => buildEngine({ ...graph.options, engine: source('src'), out: graphOut }),
                plugins,
            );
            const names = ['cc.mjs', 'cc.js'].filter((name) => fs.existsSync(path.join(graphOut, name)));
            assert.equal(names.length, 1, 'Exactly one actual main ESM entry');
            fs.writeFileSync(path.join(graphOut, 'package.json'), '{"type":"module"}\n');
            assert.equal(transforms.length, mode.startsWith('TEST-ONLY') ? 2 : 0);
            graph.entry = names[0];
            graph.entrySHA256 = sha(read(path.join(graphOut, names[0])));
            graph.status = 'BUILT_NOT_YET_CONSUMED';
            flush();
        }
        report.status = 'BUILT_NOT_YET_CONSUMED';
        flush();
    } catch (error) {
        report.status = 'FAIL';
        report.error = String(error.stack || error);
        flush();
        throw error;
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
