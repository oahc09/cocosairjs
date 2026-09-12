// Development-only diagnostics. Observe draw/compile/link calls without consuming
// WebGL error state or querying unsupported enums. Pixel checks live in verification tools.
window.__airErrors = [];
window.__glStats = { draws: 0, shaderErrs: [], linkErrs: [], counts: {} };
window.addEventListener('error', function (event) {
    if (event.target && event.target.tagName) {
        window.__airErrors.push('RESOURCE: ' + (event.target.src || event.target.href || event.target.tagName));
    } else {
        window.__airErrors.push(String(event.error && event.error.stack || event.message).slice(0, 600));
    }
}, true);
window.addEventListener('unhandledrejection', function (event) {
    window.__airErrors.push(String(event.reason && event.reason.stack || event.reason).slice(0, 600));
});
(function () {
    var original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type) {
        var gl = original.apply(this, arguments);
        if (!gl || typeof type !== 'string' || type.indexOf('webgl') !== 0 || gl.__airObserved) return gl;
        gl.__airObserved = true;
        ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'].forEach(function (name) {
            var draw = gl[name];
            if (!draw) return;
            gl[name] = function () {
                window.__glStats.draws++;
                window.__glStats.counts[name] = (window.__glStats.counts[name] || 0) + 1;
                return draw.apply(this, arguments);
            };
        });
        [['getShaderParameter', 'COMPILE_STATUS', 'getShaderInfoLog', 'shaderErrs'],
            ['getProgramParameter', 'LINK_STATUS', 'getProgramInfoLog', 'linkErrs']].forEach(function (spec) {
            var query = gl[spec[0]];
            gl[spec[0]] = function (object, parameter) {
                var result = query.apply(this, arguments);
                if (parameter === gl[spec[1]] && !result) {
                    window.__glStats[spec[3]].push(String(gl[spec[2]](object)).slice(0, 600));
                }
                return result;
            };
        });
        return gl;
    };
})();
