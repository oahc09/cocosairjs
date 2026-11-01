// Target fixture resolver capture. Native methods and returned values are never replaced.
const { capture } = require('./owner-target-real-wasm-capture.cjs');
module.exports = (request, options) => {
    const resolved = options.defaultResolver(request, options);
    capture(resolved);
    return resolved;
};
