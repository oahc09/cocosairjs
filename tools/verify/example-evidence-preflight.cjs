'use strict';
/** Read-only admission before freezing evidence. Never manufactures a browser PASS. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { collectScope } = require('./example-evidence-campaign.cjs');
const { listWorkspaceInputs, validateReferences } = require('./example-workspace.cjs');
const { verifySourceBinding } = require('../build/source-binding.cjs');
const REPO = path.resolve(__dirname, '../..');
const MAPS = ['build/cocosair.module.js.map', 'build/cocosair.module.min.js.map', 'build/spark.module.js.map'];
const VIRTUAL = new Set(['air-inline-worker:air-spark-inline-worker']);
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function checkSourceMaps(repo = REPO) {
    return MAPS.map((relative) => {
        const file = path.join(repo, relative);
        if (fs.realpathSync(file) !== file || !fs.lstatSync(file).isFile()) throw Error('Nonregular map: ' + relative);
        const bytes = fs.readFileSync(file);
        const map = JSON.parse(bytes);
        // Only the main runtime publishes external source maps. Spark's inline worker
        // remains embedded and must pass the original virtual-source contract below.
        const external = map.sourcesContent === undefined && relative !== 'build/spark.module.js.map';
        if (
            !Array.isArray(map.sources) ||
            !map.sources.length ||
            (!external && map.sources.length !== map.sourcesContent?.length)
        )
            throw Error('Incomplete source map: ' + relative);
        let binding;
        if (external) {
            const bundle = file.slice(0, -4);
            for (const input of [bundle, bundle + '.sources.json']) {
                if (fs.realpathSync(input) !== input || !fs.lstatSync(input).isFile())
                    throw Error('Nonregular source binding input: ' + path.relative(repo, input));
            }
            binding = verifySourceBinding(repo, bundle);
            if (!binding.matches)
                throw Error(
                    'Build/source drift: ' + relative + ': ' + (binding.reason || binding.mismatches.join(', ')),
                );
        }
        const virtual = [];
        let verified = 0;
        map.sources.forEach((source, index) => {
            if (VIRTUAL.has(source) && relative === 'build/spark.module.js.map') {
                if (!map.sourcesContent[index]?.includes('SparkInlineWorker'))
                    throw Error('Unexpected inline worker source');
                virtual.push({ source, sha256: hash(map.sourcesContent[index]) });
                return;
            }
            const absolute = path.resolve(path.dirname(file), map.sourceRoot || '', source);
            if (
                !absolute.startsWith(repo + path.sep) ||
                fs.realpathSync(absolute) !== absolute ||
                !fs.lstatSync(absolute).isFile()
            )
                throw Error('Source map path escapes regular repository inputs: ' + source);
            if (!external && fs.readFileSync(absolute, 'utf8') !== map.sourcesContent[index])
                throw Error('Build/source drift: ' + source);
            verified++;
        });
        return {
            path: relative,
            bytes: bytes.length,
            sha256: hash(bytes),
            verifiedSources: verified,
            virtual,
            ...(binding ? { sourceBinding: binding } : {}),
        };
    });
}
function preflight(repo = REPO, { generatedChecks = true } = {}) {
    const custody = require('./example-evidence-supervisor.cjs').getCustodyRuntimeIdentity();
    const inputs = listWorkspaceInputs(repo);
    const scope = collectScope(repo);
    const dependencies = scope.map((entry) => ({
        id: entry.id,
        references: validateReferences(repo, entry, inputs).length,
    }));
    const maps = checkSourceMaps(repo);
    const gates = [];
    if (generatedChecks) {
        for (const script of [
            'tools/build/pal-source.cjs',
            'tools/build/spark-runtime-tree.cjs',
            'tools/verify/published-artifacts.cjs',
        ]) {
            const args = [path.join(repo, script), ...(script.endsWith('published-artifacts.cjs') ? [] : ['--check'])];
            const stdout = execFileSync(process.execPath, args, { cwd: repo, encoding: 'utf8', timeout: 30000 });
            gates.push({ script, exitCode: 0, stdout });
        }
    }
    return {
        kind: 'CPU_ADMISSION_ONLY',
        ok: true,
        custody,
        examples: scope.length,
        modes: scope.reduce((n, e) => n + e.modes.length, 0),
        dependencies,
        maps,
        gates,
    };
}
module.exports = { MAPS, checkSourceMaps, preflight };
if (require.main === module) {
    try {
        console.log(JSON.stringify(preflight(), null, 2));
    } catch (error) {
        console.error(error.stack || error);
        process.exitCode = 1;
    }
}
