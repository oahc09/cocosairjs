// Game-clock fixture resolver capture. Native methods and returned values are never replaced.
const { capture } = require('./owner-clock-real-wasm-capture.cjs');
module.exports = (request, options) => {
    const resolved = options.defaultResolver(request, options);
    capture(resolved);
    return resolved;
};
