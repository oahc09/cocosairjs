// Published repository maps resolve original sources beside build/ instead of
// duplicating them in sourcesContent. Never change positions or source identities.
function externalizeSources(map) {
    if (
        !map ||
        map.version !== 3 ||
        !Array.isArray(map.sources) ||
        !Array.isArray(map.names) ||
        typeof map.mappings !== 'string' ||
        map.sections
    ) {
        throw new Error('Expected a flat version 3 source map');
    }
    if (
        map.sourcesContent !== undefined &&
        (!Array.isArray(map.sourcesContent) || map.sourcesContent.length !== map.sources.length)
    ) {
        throw new Error('Source map sourcesContent must align with sources');
    }
    const result = { ...map };
    delete result.sourcesContent;
    return result;
}

module.exports = { externalizeSources };
