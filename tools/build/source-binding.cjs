// Byte-bound source provenance for repository bundles with external source maps.
// This records an observed compiler map; it is not a signature or a build attestation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { externalizeSources } = require('./source-map-publication.cjs');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const normalized = (text) => text.replace(/\r\n/g, '\n');

function sourcePaths(root, bundle, map) {
    externalizeSources(map);
    if (map.sourceRoot || !map.sources.length) throw Error('Unsupported source root or empty source map');
    const realRoot = fs.realpathSync(path.join(root, 'src')) + path.sep;
    const seen = new Set();
    return map.sources.map((source) => {
        if (typeof source !== 'string' || /[\\\x00]/.test(source) || /^[a-z]+:/i.test(source))
            throw Error('Unsupported source path');
        const file = path.resolve(path.dirname(bundle), source);
        const relative = path.relative(root, file).replace(/\\/g, '/');
        if (!relative.startsWith('src/') || !fs.realpathSync(file).startsWith(realRoot) || seen.has(relative))
            throw Error('Unknown, duplicate or outside source path');
        seen.add(relative);
        return { path: relative, file };
    });
}

function createSourceBinding(root, bundle, compilerMap, origin = 'compiler-map') {
    if (!['compiler-map', 'retained-compiler-map-migration'].includes(origin)) throw Error('Unknown binding origin');
    const mapBytes = fs.readFileSync(bundle + '.map');
    const publishedMap = JSON.parse(mapBytes);
    if (JSON.stringify(externalizeSources(compilerMap)) !== JSON.stringify(publishedMap))
        throw Error('Compiler map does not match the published map');
    const sources = sourcePaths(root, bundle, compilerMap);
    if (!Array.isArray(compilerMap.sourcesContent)) throw Error('Compiler source content is required');
    const entries = sources.map((source, index) => {
        const bytes = fs.readFileSync(source.file);
        if (
            typeof compilerMap.sourcesContent[index] !== 'string' ||
            normalized(compilerMap.sourcesContent[index]) !== normalized(bytes.toString('utf8'))
        )
            throw Error(`Compiler source mismatch: ${source.path}`);
        return { path: source.path, sha256: hash(bytes) };
    });
    return {
        schema: 'air-bundle-source-binding-v1',
        origin,
        bundleSha256: hash(fs.readFileSync(bundle)),
        mapSha256: hash(mapBytes),
        sources: entries,
    };
}

function verifySourceBinding(root, bundle) {
    try {
        const receiptBytes = fs.readFileSync(bundle + '.sources.json');
        const receipt = JSON.parse(receiptBytes);
        const mapBytes = fs.readFileSync(bundle + '.map');
        const map = JSON.parse(mapBytes);
        if (
            receipt.schema !== 'air-bundle-source-binding-v1' ||
            !['compiler-map', 'retained-compiler-map-migration'].includes(receipt.origin) ||
            receipt.bundleSha256 !== hash(fs.readFileSync(bundle)) ||
            receipt.mapSha256 !== hash(mapBytes)
        )
            throw Error('Missing or mismatched artifact binding');
        const sources = sourcePaths(root, bundle, map);
        if (!Array.isArray(receipt.sources) || receipt.sources.length !== sources.length)
            throw Error('Incomplete source binding');
        const mismatches = sources
            .filter(
                (source, index) =>
                    receipt.sources[index]?.path !== source.path ||
                    receipt.sources[index]?.sha256 !== hash(fs.readFileSync(source.file)),
            )
            .map((source) => source.path);
        return {
            compared: sources.length,
            mismatches,
            matches: mismatches.length === 0,
            receiptSha256: hash(receiptBytes),
            origin: receipt.origin,
        };
    } catch (error) {
        return {
            compared: 0,
            mismatches: ['source-binding'],
            matches: false,
            reason: error.code === 'ENOENT' ? 'Missing source binding input' : 'Invalid source binding input',
        };
    }
}

module.exports = { createSourceBinding, verifySourceBinding };
