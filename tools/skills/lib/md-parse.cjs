'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');

const PARSER_VERSION = 'air-markdown-1';
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const codePoints = (value) => Array.from(value).length;
const lexical = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function parseArgs(argv = process.argv.slice(2), schema) {
    const result = {};
    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];
        if (!argument.startsWith('--') || argument === '--') throw new Error(`Unexpected argument: ${argument}`);
        const equal = argument.indexOf('=');
        const name = argument.slice(2, equal < 0 ? undefined : equal);
        if (!name || Object.prototype.hasOwnProperty.call(result, name)) throw new Error(`Duplicate option: --${name}`);
        if (schema && !Object.prototype.hasOwnProperty.call(schema, name)) throw new Error(`Unknown option: --${name}`);
        if (schema?.[name] === 'boolean') {
            if (equal >= 0) throw new Error(`--${name} takes no value`);
            result[name] = true;
        } else {
            const value =
                equal >= 0
                    ? argument.slice(equal + 1)
                    : index + 1 < argv.length && !argv[index + 1].startsWith('--')
                      ? argv[++index]
                      : true;
            if (schema?.[name] === 'value' && (value === true || value === ''))
                throw new Error(`--${name} requires a value`);
            result[name] = value;
        }
    }
    return result;
}

function assertNoSymlink(target) {
    const absolute = path.resolve(target);
    const volume = path.parse(absolute).root;
    let cursor = volume;
    for (const part of absolute.slice(volume.length).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part);
        if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error(`symlink is not permitted: ${cursor}`);
    }
}

function resolveSkillsRoot(input = path.resolve(__dirname, '../../..', 'skills')) {
    const root = path.resolve(input);
    assertNoSymlink(root);
    if (!fs.lstatSync(root).isDirectory()) throw new Error('Expected a skills directory or repository root');
    const candidate = path.join(root, 'skills');
    const result = path.basename(root) !== 'skills' && fs.existsSync(candidate) ? candidate : root;
    assertNoSymlink(result);
    if (!fs.lstatSync(result).isDirectory()) throw new Error('Expected a skills directory');
    return result;
}

function walkFiles(root) {
    root = path.resolve(root);
    assertNoSymlink(root);
    if (!fs.lstatSync(root).isDirectory()) throw new Error('File root must be a directory');
    const result = [];
    function visit(relative) {
        const directory = path.join(root, relative);
        for (const name of fs.readdirSync(directory).sort(lexical)) {
            if (name.includes('\\') || name.includes('\0')) throw new Error(`Unsafe path component: ${name}`);
            const next = relative ? `${relative}/${name}` : name;
            const stat = fs.lstatSync(path.join(root, next));
            if (stat.isSymbolicLink()) throw new Error(`symlink is not permitted: ${next}`);
            if (stat.isDirectory()) visit(next);
            else if (stat.isFile()) result.push(next);
            else throw new Error(`Unsupported file type: ${next}`);
        }
    }
    visit('');
    return result.sort(lexical);
}

function inventory(root, prefix = 'skills') {
    if (
        typeof prefix !== 'string' ||
        !prefix ||
        prefix.includes('\\') ||
        prefix.includes('\0') ||
        prefix.split('/').some((part) => !part || part === '.' || part === '..')
    )
        throw new Error('Unsafe inventory prefix');
    return walkFiles(root).map((relative) => {
        const bytes = fs.readFileSync(path.join(root, relative));
        return {
            path: `${prefix}/${relative}`,
            sha256: sha256(bytes),
            bytes: bytes.length,
            git_blob_sha: crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
        };
    });
}

function linesWithOffsets(text) {
    const result = [];
    let start = 0;
    for (let end = text.indexOf('\n', start); end >= 0; end = text.indexOf('\n', start)) {
        result.push({ text: text.slice(start, end), start, end: end + 1 });
        start = end + 1;
    }
    if (start < text.length) result.push({ text: text.slice(start), start, end: text.length });
    return result;
}

function escaped(text, offset) {
    let count = 0;
    while (offset > 0 && text[--offset] === '\\') count++;
    return count % 2 === 1;
}

function markdownMask(text, lines = linesWithOffsets(text)) {
    const mask = text.split('');
    const blank = (start, end) => {
        for (let i = start; i < end; i++) if (mask[i] !== '\n') mask[i] = ' ';
    };
    let fence = null;
    for (const line of lines) {
        if (fence) {
            blank(line.start, line.end);
            if (new RegExp(`^ {0,3}${fence.marker}{${fence.length},}[ \\t]*$`).test(line.text)) fence = null;
            continue;
        }
        const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line.text);
        if (opening && !(opening[1][0] === '`' && opening[2].includes('`'))) {
            fence = { marker: opening[1][0], length: opening[1].length };
            blank(line.start, line.end);
        }
    }
    let masked = mask.join('');
    // Ignore comments before pairing code spans, matching the navigation authority.
    for (const comment of masked.matchAll(/<!--[\s\S]*?-->/g)) blank(comment.index, comment.index + comment[0].length);
    masked = mask.join('');
    const runs = [...masked.matchAll(/`+/g)];
    for (let index = 0; index < runs.length; index++) {
        const opening = runs[index];
        if (escaped(text, opening.index)) continue;
        let closing = index + 1;
        while (closing < runs.length && runs[closing][0].length !== opening[0].length) closing++;
        if (closing < runs.length) {
            blank(opening.index, runs[closing].index + runs[closing][0].length);
            index = closing;
        }
    }
    return mask.join('');
}

function normalizeReference(value) {
    return value
        .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '$1')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function destinationAt(text, start, limit = text.length) {
    let cursor = start;
    while (cursor < limit && /[ \t\n]/.test(text[cursor])) cursor++;
    if (text[cursor] === '<') {
        const begin = ++cursor;
        while (cursor < limit && (text[cursor] !== '>' || escaped(text, cursor))) {
            if (text[cursor] === '\n' || text[cursor] === '<') return null;
            cursor++;
        }
        if (cursor >= limit) return null;
        return {
            target: text.slice(begin, cursor).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '$1'),
            start: begin,
            end: cursor,
            after: cursor + 1,
        };
    }
    const begin = cursor;
    let depth = 0;
    for (; cursor < limit; cursor++) {
        const char = text[cursor];
        if (escaped(text, cursor)) continue;
        if (char === '(') depth++;
        else if (char === ')') {
            if (!depth) break;
            depth--;
        } else if (/\s/.test(char)) break;
        else if (char === '<') return null;
    }
    if (depth || begin === cursor) return null;
    return {
        target: text.slice(begin, cursor).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '$1'),
        start: begin,
        end: cursor,
        after: cursor,
    };
}

function titleEnd(text, start) {
    const opener = text[start];
    if (!['"', "'", '('].includes(opener)) return null;
    const closer = opener === '(' ? ')' : opener;
    for (let index = start + 1; index < text.length; index++) {
        if (escaped(text, index)) continue;
        if (text[index] === closer) return index + 1;
        if (opener === '(' && text[index] === '(') return null;
    }
    return null;
}

function parseLinks(text) {
    if (typeof text !== 'string' || text.includes('\r')) throw new Error('Markdown expected LF line endings');
    const lines = linesWithOffsets(text);
    const mask = markdownMask(text, lines);
    const definitionRanges = [];
    const result = [];
    const lineAt = (offset) => {
        let low = 0;
        let high = lines.length;
        while (low < high) {
            const mid = (low + high) >>> 1;
            if (lines[mid].start <= offset) low = mid + 1;
            else high = mid;
        }
        return low || 1;
    };
    for (const line of lines) {
        const match = /^ {0,3}\[((?:\\.|[^\]\\])+)\]:[ \t]*/.exec(mask.slice(line.start, line.end));
        if (!match) continue;
        const destination = destinationAt(mask, line.start + match[0].length);
        if (!destination) continue;
        const rest = mask.slice(destination.after).split('\n')[0].trim();
        if (rest && titleEnd(rest, 0) !== rest.length) continue;
        const id = normalizeReference(match[1]);
        definitionRanges.push([line.start, Math.max(line.end, destination.after)]);
        result.push({
            target: destination.target,
            start: destination.start,
            end: destination.end,
            line: lineAt(destination.start),
            referenceId: id,
        });
    }
    const inDefinition = (offset) => definitionRanges.some(([start, end]) => start <= offset && offset < end);
    for (let cursor = 0; cursor < mask.length; cursor++) {
        if (mask[cursor] !== '[' || escaped(text, cursor) || inDefinition(cursor)) continue;
        let close = cursor + 1;
        let depth = 1;
        for (; close < mask.length; close++) {
            if (escaped(text, close)) continue;
            if (mask[close] === '[') depth++;
            if (mask[close] === ']' && --depth === 0) break;
        }
        if (close >= mask.length) continue;
        const afterLabel = close + 1;
        if (mask[afterLabel] === '(') {
            const destination = destinationAt(text, afterLabel + 1);
            if (!destination) continue;
            let end = destination.after;
            while (/\s/.test(text[end] || '') && end < text.length) end++;
            if (end !== destination.after && text[end] !== ')') {
                const title = titleEnd(text, end);
                if (title === null) continue;
                end = title;
                while (/\s/.test(text[end] || '') && end < text.length) end++;
            }
            if (text[end] !== ')') continue;
            result.push({
                target: destination.target,
                start: destination.start,
                end: destination.end,
                line: lineAt(destination.start),
                markupEnd: end + 1,
                labelStart: cursor,
            });
            cursor = end;
        }
    }
    return result.sort((a, b) => a.start - b.start || a.line - b.line);
}

function parseMarkdown(text, options = {}) {
    if (typeof text !== 'string' || text.includes('\r')) throw new Error('Markdown expected LF line endings');
    const lines = linesWithOffsets(text);
    const blocks = [];
    const headings = [];
    let frontmatter = { data: {}, raw: '', startLine: 0, endLine: 0 };
    let cursor = 0;
    const add = (kind, first, last, extra = {}) => {
        const blockText = text.slice(lines[first].start, lines[last].end);
        const block = {
            id: `${kind}:L${first + 1}-L${last + 1}`,
            kind,
            text: blockText,
            startLine: first + 1,
            endLine: last + 1,
            hash: sha256(blockText),
            ...extra,
        };
        blocks.push(block);
        return block;
    };
    if (lines[0]?.text === '---') {
        const close = lines.findIndex((line, index) => index > 0 && line.text === '---');
        if (close < 0) throw new Error(`unclosed YAML frontmatter${options.path ? `: ${options.path}` : ''}`);
        const raw = text.slice(0, lines[close].end);
        let data;
        try {
            data = yaml.safeLoad(text.slice(lines[0].end, lines[close].start), {
                schema: yaml.JSON_SCHEMA,
                json: false,
            });
        } catch (error) {
            throw new Error(`Invalid YAML frontmatter: ${error.message}`);
        }
        if (!data || Array.isArray(data) || typeof data !== 'object')
            throw new Error('YAML frontmatter must be a mapping');
        frontmatter = { data, raw, startLine: 1, endLine: close + 1 };
        cursor = close + 1;
    }
    const bodyStart = cursor < lines.length ? lines[cursor].start : text.length;
    const fenceOpening = (line) => {
        const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
        return match && !(match[1][0] === '`' && match[2].includes('`')) ? match : null;
    };
    const isTableSeparator = (line) => {
        const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
        return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
    };
    const isHeading = (line) => /^ {0,3}#{1,6}(?:[ \t]+|$)/.test(line);
    while (cursor < lines.length) {
        const first = cursor;
        const current = lines[cursor].text;
        if (!current.trim()) {
            while (cursor + 1 < lines.length && !lines[cursor + 1].text.trim()) cursor++;
            cursor++;
            continue;
        }
        const fence = fenceOpening(current);
        if (fence) {
            const closePattern = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}[ \\t]*$`);
            cursor++;
            while (cursor < lines.length && !closePattern.test(lines[cursor].text)) cursor++;
            const closed = cursor < lines.length;
            if (!closed) throw new Error('unclosed fence');
            const codeEnd = closed ? lines[cursor].start : text.length;
            add('code', first, closed ? cursor : lines.length - 1, { codeBody: text.slice(lines[first].end, codeEnd) });
            cursor = closed ? cursor + 1 : lines.length;
            continue;
        }
        if (isHeading(current)) {
            const heading = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|$)/.exec(current);
            const block = add('heading', cursor, cursor);
            headings.push({
                level: heading[1].length,
                title: (heading[2] || '').replace(/[ \t]+#+[ \t]*$/, '').trim(),
                startLine: cursor + 1,
                endLine: cursor + 1,
                id: block.id,
            });
            cursor++;
            continue;
        }
        if (cursor + 1 < lines.length && current.includes('|') && isTableSeparator(lines[cursor + 1].text)) {
            cursor += 2;
            while (
                cursor < lines.length &&
                lines[cursor].text.trim() &&
                lines[cursor].text.includes('|') &&
                !fenceOpening(lines[cursor].text) &&
                !isHeading(lines[cursor].text)
            )
                cursor++;
            add('table', first, cursor - 1);
            continue;
        }
        if (cursor + 1 < lines.length && /^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[cursor + 1].text)) {
            const block = add('heading', cursor, cursor + 1);
            headings.push({
                level: lines[cursor + 1].text.trim()[0] === '=' ? 1 : 2,
                title: current.trim(),
                startLine: cursor + 1,
                endLine: cursor + 2,
                id: block.id,
            });
            cursor += 2;
            continue;
        }
        cursor++;
        while (
            cursor < lines.length &&
            lines[cursor].text.trim() &&
            !fenceOpening(lines[cursor].text) &&
            !isHeading(lines[cursor].text) &&
            !(cursor + 1 < lines.length && lines[cursor].text.includes('|') && isTableSeparator(lines[cursor + 1].text))
        )
            cursor++;
        add('prose', first, cursor - 1);
    }
    const body = text.slice(bodyStart);
    const links = parseLinks(body).map((link) => ({
        ...link,
        start: link.start + bodyStart,
        end: link.end + bodyStart,
        line: link.line + frontmatter.endLine,
        ...(link.markupEnd === undefined ? {} : { markupEnd: link.markupEnd + bodyStart }),
        ...(link.labelStart === undefined ? {} : { labelStart: link.labelStart + bodyStart }),
    }));
    return { frontmatter, body, blocks, links, headings };
}

module.exports = {
    PARSER_VERSION,
    sha256,
    codePoints,
    parseArgs,
    resolveSkillsRoot,
    walkFiles,
    inventory,
    parseLinks,
    parseMarkdown,
};
