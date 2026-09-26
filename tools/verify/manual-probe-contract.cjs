// Required behavioral coverage for manual examples; legacy examples may omit a probe.
const REQUIRED_PROBES = new Map([
    ['manual-component-lifecycle', 14],
    ['manual-input-events', 11],
    ['manual-asset-lifecycle', 9],
    ['manual-animation-system', 2],
    ['manual-render-targets', 1],
]);

function evaluateProbe(id, present, probe) {
    const minimum = REQUIRED_PROBES.get(id) || 0;
    if (!present) {
        return {
            pass: minimum === 0,
            detail: minimum ? 'required __manualProbe missing' : 'no __manualProbe (skipped)',
        };
    }
    if (!probe || probe.ready !== true || !Array.isArray(probe.checks)) {
        return { pass: false, detail: 'probe must be ready and contain a checks array' };
    }
    const checks = probe.checks;
    if (checks.length < Math.max(1, minimum)) {
        return { pass: false, detail: `expected at least ${Math.max(1, minimum)} assertions, got ${checks.length}` };
    }
    const names = new Set();
    for (const check of checks) {
        if (!check || typeof check.name !== 'string' || !check.name.trim() || names.has(check.name)) {
            return { pass: false, detail: 'assertions require nonempty unique names' };
        }
        names.add(check.name);
    }
    const fails = checks.filter((check) => check.pass !== true);
    const pass = probe.ok === true && fails.length === 0;
    return {
        pass,
        detail: pass
            ? `ok (${checks.length} assertions)`
            : `ok=${probe.ok} failed=[${fails.map((check) => check.name).join(',')}]`,
    };
}

function isAllowedNetworkError(id, text, url) {
    if (id !== 'manual-asset-lifecycle' || !/^Failed to load resource:.*\b404\b/.test(text)) return false;
    try {
        return new URL(url).pathname === '/assets/does-not-exist.json';
    } catch {
        return false;
    }
}

module.exports = { evaluateProbe, isAllowedNetworkError };
