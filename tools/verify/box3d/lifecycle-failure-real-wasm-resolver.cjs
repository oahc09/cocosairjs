// Capture the exact runtime resolver bytes. Delivery controls are separately labelled in the preload.
const { capture } = require('./lifecycle-failure-real-wasm-capture.cjs');
module.exports = (request, options) => {
    const resolved = options.defaultResolver(request, options);
    capture(resolved);
    return resolved;
};
