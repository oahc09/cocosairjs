// Development-only diagnostics. Observe draw/compile/link calls without consuming
// WebGL error state or querying unsupported enums. Pixel checks live in verification tools.
//
// V0.5.1 T4（§6.4）：错误观察走订阅/分发 hub —— dev-server 页面注入本文件一次，
// agent session（tools/debug）通过 __airErrorHub.subscribe 共享同一批观察器，
// 不各自重复包裹 WebGL 函数。无 hub 时 session 才安装自有 hook（detach 恢复）。
(function () {
    if (window.__airPreludeInstalled) { return; }
    window.__airPreludeInstalled = true;

    window.__airErrors = [];
    window.__glStats = { draws: 0, shaderErrs: [], linkErrs: [], counts: {} };

    // ---- 分发 hub：结构化错误条目的订阅点（session 靠它共享观察） ----
    var listeners = [];
    window.__airErrorHub = {
        subscribe: function (listener) {
            listeners.push(listener);
            return function () {
                var i = listeners.indexOf(listener);
                if (i >= 0) listeners.splice(i, 1);
            };
        }
    };
    function publish (category, message, source) {
        for (var i = 0; i < listeners.length; i++) {
            try { listeners[i]({ category: category, message: message, source: source }); } catch (e) { /* 观察者异常不中断主循环 */ }
        }
    }

    window.addEventListener('error', function (event) {
        var message;
        if (event.target && event.target.tagName) {
            message = 'RESOURCE: ' + (event.target.src || event.target.href || event.target.tagName);
        } else {
            message = String(event.error && event.error.stack || event.message).slice(0, 600);
        }
        window.__airErrors.push(message);
        publish('window-error', message);
    }, true);
    window.addEventListener('unhandledrejection', function (event) {
        var message = String(event.reason && event.reason.stack || event.reason).slice(0, 600);
        window.__airErrors.push(message);
        publish('unhandled-rejection', message);
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
            [['getShaderParameter', 'COMPILE_STATUS', 'getShaderInfoLog', 'shaderErrs', 'shader'],
                ['getProgramParameter', 'LINK_STATUS', 'getProgramInfoLog', 'linkErrs', 'link']].forEach(function (spec) {
                var query = gl[spec[0]];
                gl[spec[0]] = function (object, parameter) {
                    var result = query.apply(this, arguments);
                    if (parameter === gl[spec[1]] && !result) {
                        var message = String(gl[spec[2]](object)).slice(0, 600);
                        window.__glStats[spec[3]].push(message);
                        publish(spec[4], message);
                    }
                    return result;
                };
            });
            return gl;
        };
    })();
})();
