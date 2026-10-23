// Activation fixture resolver capture. Native methods and returned values are never replaced.
const { capture } = require('./owner-activation-real-wasm-capture.cjs');
module.exports = (request, options) => {
    const resolved = options.defaultResolver(request, options);
    capture(resolved);
    return resolved;
};
