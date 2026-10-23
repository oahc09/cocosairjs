// Audit the actual source supplied to shaderSource, never infer sampler precision from float precision.
function samplerDeclarations(source) {
    const clean = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const declarations = [];
    for (const match of clean.matchAll(/\buniform\s+(?:(highp|mediump|lowp)\s+)?(sampler2D(?:Shadow)?)\s+(\w+)\s*;/g)) {
        const prior = clean.slice(0, match.index);
        const defaults = [
            ...prior.matchAll(new RegExp(`\\bprecision\\s+(highp|mediump|lowp)\\s+${match[2]}\\s*;`, 'g')),
        ];
        declarations.push({
            name: match[3],
            type: match[2],
            precision: match[1] || defaults.at(-1)?.[1] || 'lowp',
            explicit: !!match[1],
        });
    }
    return declarations;
}
function requireDepthPrecision(source, names) {
    if (!source.startsWith('#version 300 es\n'))
        throw new Error('FINAL_GLSL_REQUIRED: capture shaderSource, not a template');
    const declarations = samplerDeclarations(source);
    for (const name of names) {
        const entries = declarations.filter((entry) => entry.name === name);
        if (entries.length !== 1 || entries[0].type !== 'sampler2D' || entries[0].precision !== 'highp') {
            throw new Error(`DEPTH_PRECISION: ${name} requires one highp raw-depth sampler2D declaration`);
        }
    }
    return declarations;
}
module.exports = { samplerDeclarations, requireDepthPrecision };
