// Context-reconstructed source after executor loss; exact original per-file hash is unavailable.
const { capture } = require('./owner-teleport-real-wasm-capture.cjs');
module.exports = (request, options) => {
    const resolved = options.defaultResolver(request, options);
    capture(resolved);
    return resolved;
};
