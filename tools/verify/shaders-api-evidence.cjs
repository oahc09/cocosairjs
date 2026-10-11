'use strict';
// Example-local metadata check; never runs the global spec writer.
const fs = require('node:fs');
const path = require('node:path');
const { findSymbolLine, declaredValidatorSet } = require('../examples/spec-evidence.cjs');
function validateAPIEvidence(exampleDir, spec) {
    const errors = [];
    try {
        const value = spec ?? JSON.parse(fs.readFileSync(path.join(exampleDir, 'example.json'), 'utf8'));
        if (!Array.isArray(value?.api?.evidence) || !value.api.evidence.length)
            return { ok: false, errors: ['API evidence required'] };
        const declared = declaredValidatorSet(value);
        for (const ev of value.api.evidence) {
            if (!ev || typeof ev.api !== 'string' || typeof ev.source !== 'string') {
                errors.push('API evidence entry required');
                continue;
            }
            const result = findSymbolLine(exampleDir, ev.source, ev.api);
            if (!Number.isSafeInteger(result.line) || result.line <= 0 || ev.sourceLocation !== `L${result.line}`)
                errors.push(`${ev.api}: executable source line mismatch`);
            if (!declared.has(ev.validator)) errors.push(`${ev.api}: undeclared validator`);
        }
    } catch (error) {
        errors.push('API metadata: ' + error.message);
    }
    return { ok: errors.length === 0, errors };
}
module.exports = { validateAPIEvidence };
