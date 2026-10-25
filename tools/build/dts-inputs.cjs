const fs = require('node:fs');
const path = require('node:path');

// ccbuild emits implementation files, but passes tsconfig.types declarations from
// the source tree to tfig unchanged. Their relative imports then reach original
// .ts files, which tfig recasts without declaration emit (losing inferred types).
// Relocate only these declaration roots into the emitted tree, preserving their
// relative paths and bytes. Do not rewrite the resulting declaration bundle.
function relocateDeclarationInputs(options, engine) {
    const root = path.resolve(options.rootDir);
    const source = path.resolve(engine);
    const inside = (parent, file) => {
        const relative = path.relative(parent, file);
        return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
    };
    const inputs = Array.isArray(options.input) ? options.input : [options.input];
    const input = inputs.map((file) => {
        const absolute = path.resolve(file);
        if (inside(root, absolute) || !inside(source, absolute)) return file;
        if (!absolute.endsWith('.d.ts')) throw new Error(`Expected declaration input: ${file}`);
        const target = path.join(root, path.relative(source, absolute));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (fs.existsSync(target) && !fs.readFileSync(target).equals(fs.readFileSync(absolute))) {
            throw new Error(`Conflicting declaration input: ${file}`);
        }
        fs.copyFileSync(absolute, target);
        return target;
    });
    return { ...options, input: [...new Set(input)] };
}

// The dependency exposes no input-transform option. Scope the adapter to this
// standalone build invocation, resolve the exact tfig used by ccbuild, and always
// restore its public function. No installed dependency files are modified.
async function withDeclarationInputs(engine, build) {
    const { createRequire } = require('node:module');
    const ccbuildRequire = createRequire(require.resolve('@cocos/ccbuild'));
    const gift = ccbuildRequire('@cocos/tfig');
    const original = gift.bundle;
    gift.bundle = (options) => original(relocateDeclarationInputs(options, engine));
    try {
        return await build();
    } finally {
        gift.bundle = original;
    }
}

module.exports = { relocateDeclarationInputs, withDeclarationInputs };
