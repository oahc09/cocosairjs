const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function blank(text) {
    return text.replace(/[^\n]/g, ' ');
}

// Fence marker and opening length determine the closing fence. Keep offsets for diagnostics.
function withoutFences(text) {
    let fence = null;
    return text.replace(/[^\n]*\n|[^\n]+$/g, (line) => {
        const value = line.replace(/[\r\n]+$/, '');
        if (fence) {
            const closing = new RegExp(`^ {0,3}${fence.marker}{${fence.length},}[ \\t]*$`);
            if (closing.test(value)) fence = null;
            return blank(line);
        }
        const opening = value.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (opening && !(opening[1][0] === '`' && opening[2].includes('`'))) {
            fence = { marker: opening[1][0], length: opening[1].length };
            return blank(line);
        }
        return line;
    });
}

function codeSpans(text) {
    const spans = [];
    const runs = [...text.matchAll(/`+/g)];
    for (let i = 0; i < runs.length; i++) {
        const start = runs[i];
        if (escaped(text, start.index)) continue;
        const end = runs.slice(i + 1).findIndex((run) => run[0].length === start[0].length);
        if (end < 0) continue;
        const j = i + 1 + end;
        spans.push({
            start: start.index,
            end: runs[j].index + runs[j][0].length,
            value: text
                .slice(start.index + start[0].length, runs[j].index)
                .replace(/\n/g, ' ')
                .trim(),
        });
        i = j;
    }
    return spans;
}

function escaped(text, index) {
    let count = 0;
    while (index > 0 && text[--index] === '\\') count++;
    return count % 2 === 1;
}

function whitespace(text, index) {
    while (/\s/.test(text[index] || '') && index < text.length) index++;
    return index;
}

function destination(text, start) {
    let index = whitespace(text, start);
    let value = '';
    let depth = 0;
    const angle = text[index] === '<';
    if (angle) index++;
    for (; index < text.length; index++) {
        const ch = text[index];
        if (ch === '\\' && /[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/.test(text[index + 1] || '')) {
            value += text[++index];
            continue;
        }
        if (angle) {
            if (ch === '>') return { value, next: index + 1 };
            if (ch === '<' || ch === '\n' || ch === '\r') return null;
        } else {
            if (/\s/.test(ch) || (ch === ')' && depth === 0))
                return value && depth === 0 ? { value, next: index } : null;
            if (ch === '(') depth++;
            if (ch === ')') depth--;
        }
        value += ch;
    }
    return !angle && value && depth === 0 ? { value, next: index } : null;
}

function titleEnd(text, start) {
    const opener = text[start];
    if (!['"', "'", '('].includes(opener)) return null;
    const closer = opener === '(' ? ')' : opener;
    for (let i = start + 1; i < text.length; i++) {
        if (text[i] === closer && !escaped(text, i)) return i + 1;
        if (opener === '(' && text[i] === '(' && !escaped(text, i)) return null;
    }
    return null;
}

function targets(text) {
    const result = [];
    for (const match of text.matchAll(/\]\(/g)) {
        if (escaped(text, match.index)) continue;
        const target = destination(text, match.index + 2);
        if (!target) continue;
        let end = whitespace(text, target.next);
        if (end !== target.next && text[end] !== ')') {
            const afterTitle = titleEnd(text, end);
            if (afterTitle === null) continue;
            end = whitespace(text, afterTitle);
        }
        if (text[end] === ')') {
            let depth = 1;
            let labelStart = match.index;
            for (let i = match.index - 1; i >= 0; i--) {
                if (escaped(text, i)) continue;
                if (text[i] === ']') depth++;
                if (text[i] === '[' && --depth === 0) {
                    labelStart = i;
                    break;
                }
            }
            result.push({ index: match.index, labelStart, value: target.value });
        }
    }
    // A reference definition is checked even when unused, preserving the existing policy.
    for (const match of text.matchAll(/^ {0,3}\[[^\]\n]+\]:[ \t]*/gm)) {
        const target = destination(text, match.index + match[0].length);
        if (!target) continue;
        const rest = text.slice(target.next).split(/\r?\n/)[0].trim();
        if (!rest || titleEnd(rest, 0) === rest.length)
            result.push({
                index: match.index,
                referenceId: match[0]
                    .match(/\[([^\]]+)\]/)[1]
                    .trim()
                    .replace(/\s+/g, ' ')
                    .toLowerCase(),
                value: target.value,
            });
    }
    return result;
}

// Read-only navigation check; fileSystem injection permits selftests without disk writes.
function inspect(root, fileSystem = fs) {
    root = path.resolve(root);
    const files = [];
    const failures = [];
    let links = 0;
    const rootFailure = (reason) => failures.push({ file: '<root>', line: 1, reason, reference: root });
    function walk(directory) {
        for (const entry of fileSystem.readdirSync(directory, { withFileTypes: true })) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) walk(file);
            else if (file.endsWith('.md')) files.push(file);
        }
    }
    try {
        if (!fileSystem.existsSync(root) || !fileSystem.statSync(root).isDirectory())
            rootFailure('skill root must be an existing directory');
        else walk(root);
    } catch (error) {
        rootFailure(`cannot enumerate skill root: ${error.message}`);
    }
    if (!failures.length && !files.some((file) => path.basename(file) === 'SKILL.md'))
        rootFailure('no SKILL.md found in the selected scope');
    for (const file of files) {
        let text;
        try {
            text = fileSystem.readFileSync(file, 'utf8');
        } catch (error) {
            failures.push({
                file: path.relative(root, file),
                line: 1,
                reason: `cannot read file: ${error.message}`,
                reference: file,
            });
            continue;
        }
        const prose = withoutFences(text).replace(/<!--[\s\S]*?-->/g, blank);
        const spans = codeSpans(prose);
        let linkText = prose;
        for (const span of spans.slice().reverse())
            linkText =
                linkText.slice(0, span.start) + blank(linkText.slice(span.start, span.end)) + linkText.slice(span.end);
        const addFailure = (index, reason, reference) =>
            failures.push({
                file: path.relative(root, file).replace(/\\/g, '/'),
                line: prose.slice(0, index).split('\n').length,
                reason,
                reference,
            });
        const fileTargets = targets(linkText);
        const definitionIds = new Set(fileTargets.map((target) => target.referenceId).filter(Boolean));
        const referenceLabels = [];
        for (const match of linkText.matchAll(/\[([^\]\n]+)\](?:\[([^\]\n]*)\])?/g)) {
            if (escaped(linkText, match.index)) continue;
            const ownLabel = prose.slice(match.index + 1, match.index + 1 + match[1].length);
            const id = (match[2] || ownLabel).trim().replace(/\s+/g, ' ').toLowerCase();
            if (definitionIds.has(id))
                referenceLabels.push({ start: match.index, end: match.index + match[1].length + 2 });
        }
        for (const target of fileTargets) {
            const reference = target.value;
            if (/^[a-z]:[/\\]/i.test(reference)) {
                addFailure(target.index, 'use a relative skill link', reference);
                continue;
            }
            if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(reference)) continue;
            links++;
            let relative;
            try {
                relative = decodeURIComponent(reference.split('#')[0]);
            } catch {
                addFailure(target.index, 'malformed URL encoding', reference);
                continue;
            }
            if (path.isAbsolute(relative)) {
                addFailure(target.index, 'use a relative skill link', reference);
                continue;
            }
            const resolved = path.resolve(path.dirname(file), relative);
            try {
                if (!fileSystem.existsSync(resolved) || !fileSystem.statSync(resolved).isFile())
                    addFailure(target.index, 'missing link target', reference);
            } catch (error) {
                addFailure(target.index, `cannot inspect link target: ${error.message}`, reference);
            }
        }
        for (const span of spans) {
            if (fileTargets.some((target) => target.labelStart < span.start && span.end <= target.index)) continue;
            if (referenceLabels.some((label) => label.start < span.start && span.end < label.end)) continue;
            if (!/^(?:references\/|(?:\.\.?\/)+|[\w-]+\.md$)/.test(span.value) || !span.value.endsWith('.md')) continue;
            if (
                /[<>*{}]/.test(span.value) ||
                ['README.md', 'AGENTS.md', 'UPSTREAM.md', 'SKILL.md'].includes(span.value)
            )
                continue;
            addFailure(span.start, 'use a relative Markdown link for skill navigation', span.value);
        }
    }
    return {
        status: failures.length ? 'FAIL' : 'PASS',
        files: files.length,
        skills: files.filter((file) => path.basename(file) === 'SKILL.md').length,
        links,
        failures,
    };
}

function virtualFiles(root, entries) {
    const files = new Map(Object.entries(entries).map(([file, text]) => [path.resolve(root, file), text]));
    const directories = new Set([root]);
    for (const file of files.keys()) {
        for (let dir = path.dirname(file); !directories.has(dir); dir = path.dirname(dir)) directories.add(dir);
    }
    return {
        existsSync: (file) => files.has(file) || directories.has(file),
        statSync: (file) => ({ isFile: () => files.has(file), isDirectory: () => directories.has(file) }),
        readFileSync: (file) => files.get(file),
        readdirSync: (dir) =>
            [
                ...new Set(
                    [...directories, ...files.keys()].filter((file) => file !== dir && path.dirname(file) === dir),
                ),
            ].map((file) => ({ name: path.basename(file), isDirectory: () => directories.has(file) })),
    };
}

function selftest() {
    const root = path.resolve('virtual-skill-paths');
    const cases = [
        ['local and cross-skill', '[local](references/one.md)\n[cross](../b/references/two.md)', 'PASS', 2],
        ['double title', '[x](references/one.md "title")', 'PASS', 1],
        ['single title missing', "[x](references/missing.md 'title')", 'FAIL', 1],
        ['parenthesized title missing', '[x](references/missing.md (title))', 'FAIL', 1],
        ['single title valid', "[x](references/one.md 'title')", 'PASS', 1],
        ['parenthesized title valid', '[x](references/one.md (title))', 'PASS', 1],
        ['multiline title', "[x](references/one.md\n'title')", 'PASS', 1],
        ['angle target valid', '[x](<references/one.md>)', 'PASS', 1],
        ['angle target missing', '[x](<references/missing.md> "title")', 'FAIL', 1],
        ['angle target spaces', '[x](<references/space name.md>)', 'PASS', 1],
        ['encoded spaces', '[x](references/space%20name.md)', 'PASS', 1],
        ['nested destination parentheses', '[x](references/name(test).md)', 'PASS', 1],
        ['escaped destination parentheses', '[x](references/name\\(test\\).md)', 'PASS', 1],
        ['reference definition', "[ref]: <references/one.md> 'title'\n[x][ref]", 'PASS', 1],
        ['missing reference definition target', '[ref]: references/missing.md (title)\n[x][ref]', 'FAIL', 1],
        ['plain missing', '[x](references/missing.md)', 'FAIL', 1],
        ['dot navigation', '`./references/missing.md`', 'FAIL', 0],
        ['parent navigation', '`../b/references/two.md`', 'FAIL', 0],
        ['bare navigation', '`one.md`', 'FAIL', 0],
        ['double-backtick navigation', '``./references/one.md``', 'FAIL', 0],
        ['triple fence', '```js\n[x](references/missing.md)\n```', 'PASS', 0],
        ['tilde fence', '~~~js\n[x](references/missing.md)\n~~~', 'PASS', 0],
        ['four fence with inner three', '````md\n```\n[x](references/missing.md)\n````', 'PASS', 0],
        ['longer closing fence', '```js\n[x](references/missing.md)\n`````', 'PASS', 0],
        ['after fence still checked', '~~~\n[x](references/missing.md)\n~~~\n[x](references/missing.md)', 'FAIL', 1],
        ['mismatched marker stays code', '```\n~~~\n[x](references/missing.md)\n```', 'PASS', 0],
        ['inline code link example', '`[x](references/missing.md)`', 'PASS', 0],
        ['code-formatted link label', '[`references/one.md`](references/one.md)', 'PASS', 1],
        ['code-formatted reference label', '[`references/one.md`][target]\n[target]: references/one.md', 'PASS', 1],
        ['nested link label', '[text [nested] `one.md`](references/one.md)', 'PASS', 1],
        ['escaped backtick leaves link active', '\\`[x](references/missing.md)\\`', 'FAIL', 1],
        ['indented fence', '  ~~~~js\n[x](references/missing.md)\n  ~~~~', 'PASS', 0],
        ['comment link example', '<!-- [x](references/missing.md) -->', 'PASS', 0],
        ['provenance and placeholder', '`docs/manual/source.md`\n`../../<skill>/SKILL.md`', 'PASS', 0],
        ['external and anchor', '[x](https://example.com) [x](#heading)', 'PASS', 0],
        ['malformed encoding', '[x](references/%ZZ.md)', 'FAIL', 1],
        ['absolute path', '[x](/references/one.md)', 'FAIL', 1],
        ['Windows absolute path', '[x](C:/references/one.md)', 'FAIL', 0],
    ];
    const results = [];
    for (const [name, content, status, links] of cases) {
        const result = inspect(
            root,
            virtualFiles(root, {
                'a/SKILL.md': content,
                'a/references/one.md': '# One',
                'a/references/space name.md': '# Space',
                'a/references/name(test).md': '# Parens',
                'b/references/two.md': '# Two',
            }),
        );
        assert.equal(result.status, status, name);
        assert.equal(result.links, links, name);
        results.push({ name, status: 'PASS' });
    }
    for (const [name, entries] of [
        ['empty scope', {}],
        ['Markdown without skills', { 'reference.md': '# Only a reference' }],
    ]) {
        const result = inspect(root, virtualFiles(root, entries));
        assert.equal(result.status, 'FAIL', name);
        assert(
            result.failures.some((failure) => failure.reason.includes('no SKILL.md')),
            name,
        );
        results.push({ name, status: 'PASS' });
    }
    const missing = inspect(path.join(root, 'missing'), virtualFiles(root, {}));
    assert.equal(missing.status, 'FAIL');
    results.push({ name: 'nonexistent scope', status: 'PASS' });
    const unreadable = inspect(root, {
        ...virtualFiles(root, {}),
        readdirSync: () => {
            throw new Error('EACCES');
        },
    });
    assert.equal(unreadable.status, 'FAIL');
    assert(unreadable.failures.some((failure) => failure.reason.includes('cannot enumerate')));
    results.push({ name: 'unreadable scope', status: 'PASS' });
    const notDirectory = inspect(root, { ...virtualFiles(root, {}), statSync: () => ({ isDirectory: () => false }) });
    assert.equal(notDirectory.status, 'FAIL');
    results.push({ name: 'non-directory scope', status: 'PASS' });
    console.log(JSON.stringify({ status: 'PASS', cases: results.length, diskWrites: false, results }, null, 2));
}

if (require.main === module) {
    const args = process.argv.slice(2);
    if (
        args.some((arg) => arg !== '--selftest' && !arg.startsWith('--root=')) ||
        args.filter((arg) => arg.startsWith('--root=')).length > 1 ||
        args.includes('--root=')
    ) {
        console.error('usage: node check-paths.cjs [--root=<skills-directory>] [--selftest]');
        process.exitCode = 2;
    } else if (args.includes('--selftest')) selftest();
    else {
        const argument = args.find((value) => value.startsWith('--root='));
        const root = argument ? path.resolve(argument.slice(7)) : path.resolve(__dirname, '../..');
        const result = inspect(root);
        console.log(JSON.stringify(result, null, 2));
        if (result.status !== 'PASS') process.exitCode = 1;
    }
}

module.exports = { inspect };
