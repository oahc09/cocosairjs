/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 of the Software, and to permit persons to whom the Software is furnished to
 do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/

export type FragmentOutputInterface =
    | { readonly status: 'known'; readonly locations: readonly number[] }
    | { readonly status: 'unknown'; readonly reason: string };

export type GLSLFragmentOutputNames =
    | { readonly status: 'known'; readonly outputs: readonly { readonly name: string; readonly array: boolean }[] }
    | { readonly status: 'unknown'; readonly reason: string };

/** Enumerate global declarations, then let the linked GL program decide which names are active. */
export function reflectGLSLFragmentOutputNames(source: string): GLSLFragmentOutputNames {
    const unknown = (reason: string): GLSLFragmentOutputNames => ({ status: 'unknown', reason });
    if (source.length > 2_000_000) return unknown('Fragment reflection input budget exceeded.');
    let clean = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const macros = new Set<string>();
    let directive = '',
        continued = false;
    const lines = clean.split('\n');
    for (let i = 0; i < lines.length; ++i) {
        if (!continued && !/^\s*#/.test(lines[i])) continue;
        directive += lines[i] + '\n';
        continued = /\\\s*$/.test(lines[i]);
        lines[i] = '';
        if (continued) continue;
        const define = /^\s*#\s*define\s+(\w+)([\s\S]*)/.exec(directive);
        if (/^\s*#\s*include\b/.test(directive)) return unknown('Unexpanded shader include.');
        if (define) {
            macros.add(define[1]);
            if (/\b(?:out|layout)\b|##/.test(define[2])) return unknown('A macro may declare fragment outputs.');
        }
        directive = '';
    }
    if (continued) return unknown('Unterminated preprocessor directive.');
    clean = lines.join('\n');
    const tokens: string[] = [];
    const token = /[A-Za-z_]\w*|\d+|[^\s]/g;
    let match: RegExpExecArray | null;
    while ((match = token.exec(clean))) {
        if (tokens.length === 200_000) return unknown('Fragment reflection token budget exceeded.');
        tokens.push(match[0]);
    }
    const outputs: { name: string; array: boolean }[] = [];
    let braces = 0,
        parens = 0;
    for (let i = 0; i < tokens.length; ++i) {
        const current = tokens[i];
        if (current === '{') ++braces;
        else if (current === '}') --braces;
        else if (current === '(') ++parens;
        else if (current === ')') --parens;
        if (current !== 'out' || braces || parens) continue;
        let cursor = i + 1;
        while (['lowp', 'mediump', 'highp', 'precise', 'invariant'].includes(tokens[cursor])) ++cursor;
        if (!/^[A-Za-z_]\w*$/.test(tokens[cursor] || '')) return unknown('Unsupported fragment output type.');
        ++cursor;
        for (;;) {
            const name = tokens[cursor++];
            if (!/^[A-Za-z_]\w*$/.test(name || '') || macros.has(name))
                return unknown('Output identity requires preprocessing.');
            const array = tokens[cursor] === '[';
            if (array) {
                let depth = 1;
                for (++cursor; cursor < tokens.length && depth; ++cursor) {
                    if (tokens[cursor] === '[') ++depth;
                    if (tokens[cursor] === ']') --depth;
                }
                if (depth) return unknown('Unbalanced fragment output array.');
            }
            outputs.push({ name, array });
            if (tokens[cursor] === ';') {
                i = cursor;
                break;
            }
            if (tokens[cursor++] !== ',') return unknown('Unsupported fragment output declaration.');
        }
    }
    if (braces || parens) return unknown('Unbalanced shader declarations.');
    return { status: 'known', outputs };
}

function locationsFrom(source: string): FragmentOutputInterface {
    const attributes: RegExpExecArray[] = [];
    const pattern = /@location\s*\(\s*(0x[\da-fA-F]+|\d+)u?\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) attributes.push(match);
    if (attributes.length !== (source.match(/@location\b/g) || []).length)
        return { status: 'unknown', reason: 'Non-literal output location requires compiler reflection.' };
    const locations = attributes.map((match) => Number(match[1]));
    if (locations.some((value) => !Number.isSafeInteger(value)) || new Set(locations).size !== locations.length)
        return { status: 'unknown', reason: 'Invalid or duplicate fragment output locations.' };
    return { status: 'known', locations: locations.sort((a, b) => a - b) };
}

/** Reflect final compiler-produced WGSL, never count input locations as fragment outputs. */
export function reflectWGSLFragmentOutputs(source: string, entryPoint: string): FragmentOutputInterface {
    if (source.length > 2_000_000 || !/^[A-Za-z_]\w*$/.test(entryPoint))
        return { status: 'unknown', reason: 'Unsupported entry point or reflection input budget exceeded.' };
    const clean = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    if (clean.includes('/*') || clean.includes('*/'))
        return { status: 'unknown', reason: 'Nested comments require compiler reflection.' };
    const entry = new RegExp(`\\bfn\\s+${entryPoint}\\s*\\(`).exec(clean);
    if (!entry) return { status: 'unknown', reason: 'Fragment entry point was not found.' };
    let cursor = entry.index + entry[0].length,
        depth = 1;
    for (; cursor < clean.length && depth; ++cursor) {
        if (clean[cursor] === '(') ++depth;
        else if (clean[cursor] === ')') --depth;
    }
    if (depth) return { status: 'unknown', reason: 'Unbalanced entry point parameters.' };
    let returned = clean.slice(cursor).replace(/^\s+/, '');
    if (returned.startsWith('{')) return { status: 'known', locations: [] };
    if (!returned.startsWith('->')) return { status: 'unknown', reason: 'Fragment return type was not found.' };
    returned = returned.slice(2).replace(/^\s+/, '');
    let attributes = '';
    while (returned.startsWith('@')) {
        const attribute = /^@\s*\w+\s*(?:\([^)]*\))?\s*/.exec(returned);
        if (!attribute) return { status: 'unknown', reason: 'Unsupported return attribute.' };
        attributes += attribute[0];
        returned = returned.slice(attribute[0].length).replace(/^\s+/, '');
    }
    if (attributes.includes('@location')) return locationsFrom(attributes);
    if (attributes.includes('@builtin')) return { status: 'known', locations: [] };
    const type = /^([A-Za-z_]\w*)\b/.exec(returned);
    if (!type) return { status: 'unknown', reason: 'Unsupported fragment return type.' };
    const structure = new RegExp(`\\bstruct\\s+${type[1]}\\s*\\{([^}]*)\\}`).exec(clean);
    if (!structure) return { status: 'unknown', reason: 'Fragment return structure was not found.' };
    return locationsFrom(structure[1]);
}
