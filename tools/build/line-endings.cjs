// Normalize module line terminators before ccbuild's parser/map pipeline.
// Cannon contains CRCRLF: Rollup's LF-indexed maps and Terser's ECMAScript
// line counting otherwise disagree after each bare CR. Never edit vendor bytes.
const MagicString = require('magic-string');

function normalizeLineEndings(code, id) {
    if (!code.includes('\r')) return null;
    // These characters can occur inside valid string literals, so replacing them
    // would change values. Reject this unhandled map combination explicitly.
    if (/[\u2028\u2029]/.test(code)) throw Error('AIR line-ending map: CR mixed with Unicode line separators in ' + id);
    // CRLF is one logical line break; a bare CR is another. Preserve both.
    const normalized = code.replace(/\r\n?/g, '\n');
    // The normalized and original text have identical logical line/columns.
    // Build the identity map on canonical text so MagicString's LF locator is
    // correct, while embedding the exact original source for the debugger.
    const map = new MagicString(normalized).generateMap({ hires: true, source: id });
    map.sourcesContent = [code];
    return { code: normalized, map };
}

function lineEndingsPlugin() {
    return { name: 'air-line-endings', transform: normalizeLineEndings };
}

module.exports = { normalizeLineEndings, lineEndingsPlugin };
