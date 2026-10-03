/** Serialized into the browser; explicit probe paths never fall back to another probe. */
function readBrowserProbe(probePath = '__probe') {
    if (typeof probePath !== 'string' || !/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(probePath))
        throw new Error('Invalid browser probe path');
    const parts = probePath.split('.');
    if (parts.some((part) => ['__proto__', 'constructor', 'prototype'].includes(part)))
        throw new Error('Unsafe browser probe path');
    let owner = window;
    for (const part of parts.slice(0, -1)) {
        owner = owner?.[part];
        if (owner == null) throw new Error(`Browser probe missing: ${probePath}`);
    }
    const callback = owner?.[parts[parts.length - 1]];
    if (typeof callback !== 'function') {
        if (probePath === '__probe' && callback == null) return null;
        throw new Error(`Browser probe is not callable: ${probePath}`);
    }
    return callback.call(owner);
}
module.exports = { readBrowserProbe };
