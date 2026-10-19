'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const parser = require('../lib/md-parse.cjs');

test('YAML parser rejects duplicate keys and preserves Unicode plus quoted scalar types', () => {
    assert.throws(() => parser.parseMarkdown('---\nname: one\nname: two\n---\n'), /duplicated mapping key/);
    const text =
        '---\nname: demo\ndescription: "光影 🦊"\nmetadata:\n  version: "1.0.0"\n  last-updated: "2026-10-18"\n---\n\n# Heading\n';
    const parsed = parser.parseMarkdown(text);
    assert.equal(parsed.frontmatter.data.description, '光影 🦊');
    assert.equal(parsed.frontmatter.data.metadata['last-updated'], '2026-10-18');
    assert.equal(parser.codePoints('光影 🦊'), 4);
    assert.equal(parsed.frontmatter.raw + parsed.body, text);
    assert.equal(parsed.frontmatter.startLine, 1);
    assert.equal(parsed.frontmatter.endLine, 7);
});

test('fences retain exact code bytes and do not produce headings or navigation', () => {
    const text =
        '# Outside\n\n````md\n## Inside code\n[hidden](hidden.md)\n```\n````\n\n## After\n[visible](visible.md)\n';
    const parsed = parser.parseMarkdown(text);
    assert.deepEqual(
        parsed.blocks.filter((block) => block.kind === 'heading').map((block) => block.text),
        ['# Outside\n', '## After\n'],
    );
    const code = parsed.blocks.find((block) => block.kind === 'code');
    assert.equal(code.codeBody, '## Inside code\n[hidden](hidden.md)\n```\n');
    assert.equal(code.hash, parser.sha256(code.text));
    assert.deepEqual(
        parsed.links.map((link) => link.target),
        ['visible.md'],
    );
    assert.throws(() => parser.parseMarkdown('~~~\nunclosed\n'), /unclosed fence/);
});

test('headings, prose and table blocks preserve original ranges and raw hashes', () => {
    const text = '# Title\n\nProse.\nContinued.\n\n| A | B |\n| --- | --- |\n| one | two |\n';
    const parsed = parser.parseMarkdown(text);
    assert.deepEqual(
        parsed.blocks.map((block) => [block.id, block.kind]),
        [
            ['heading:L1-L1', 'heading'],
            ['prose:L3-L4', 'prose'],
            ['table:L6-L8', 'table'],
        ],
    );
    const lines = text.match(/[^\n]*\n|[^\n]+$/g);
    for (const block of parsed.blocks) {
        assert.equal(block.text, lines.slice(block.startLine - 1, block.endLine).join(''));
        assert.equal(block.hash, parser.sha256(block.text));
    }
});

test('link offsets survive frontmatter, Unicode, nested and escaped destinations', () => {
    const text =
        '---\nname: demo\ndescription: "影 🦊"\n---\n# Links\n\n[nested](references/a(b).md#part)\n[escaped](references/a\\(b\\).md)\n[angle](<references/a b.md> "title")\n[reuse][Help Key]\n[Help Key]: <references/help.md> "Help"\n';
    const parsed = parser.parseMarkdown(text);
    assert.deepEqual(
        parsed.links.map((link) => link.target),
        ['references/a(b).md#part', 'references/a(b).md', 'references/a b.md', 'references/help.md'],
    );
    assert.deepEqual(
        parsed.links.map((link) => text.slice(link.start, link.end)),
        ['references/a(b).md#part', 'references/a\\(b\\).md', 'references/a b.md', 'references/help.md'],
    );
    assert.deepEqual(
        parsed.links.map((link) => link.line),
        [7, 8, 9, 11],
    );
    assert.equal(parsed.links[3].referenceId, 'help key');
});

test('inline code, comments and escaped link openers are not navigation', () => {
    const text = '`[code](code.md)`\n<!-- [comment](comment.md) -->\n\\[escaped](escaped.md)\n[real](real.md)\n';
    assert.deepEqual(
        parser.parseLinks(text).map((link) => link.target),
        ['real.md'],
    );
});

test('malformed frontmatter and non-LF text fail rather than invent source offsets', () => {
    assert.throws(() => parser.parseMarkdown('---\nname: missing-close\n'), /unclosed YAML/);
    assert.throws(() => parser.parseMarkdown('---\n- sequence\n---\n'), /must be a mapping/);
    assert.throws(() => parser.parseMarkdown('# title\r\n'), /expected LF/);
});

test('filesystem walk rejects root and nested symlinks instead of following them', () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'md-parse-test-'));
    try {
        const root = path.join(temporary, 'root');
        fs.mkdirSync(root);
        fs.writeFileSync(path.join(root, 'a.md'), '# A\n');
        fs.symlinkSync(root, path.join(temporary, 'alias'));
        assert.throws(() => parser.walkFiles(path.join(temporary, 'alias')), /symlink/);
        fs.symlinkSync(path.join(temporary, 'elsewhere'), path.join(root, 'escape'));
        assert.throws(() => parser.walkFiles(root), /symlink/);
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
    }
});

test('comment-contained backticks cannot conceal active links and invalid reference titles are ignored', () => {
    const text = '<!-- ` -->\n[real](real.md)\n`\n[bad]: wrong.md trailing junk\n[good]:\n  good.md "title"\n';
    assert.deepEqual(
        parser.parseLinks(text).map((link) => link.target),
        ['real.md', 'good.md'],
    );
    assert.deepEqual(
        parser.parseLinks('[x](<a.md>"no whitespace")').map((link) => link.target),
        [],
    );
});

test('frontmatter text is not navigation and body link metadata keeps full-source offsets', () => {
    const text =
        '---\nname: demo\ndescription: "[not navigation](missing.md)"\n---\n[actual](actual.md "title") - answer\n';
    const parsed = parser.parseMarkdown(text);
    assert.deepEqual(
        parsed.links.map((link) => link.target),
        ['actual.md'],
    );
    const [link] = parsed.links;
    assert.equal(text.slice(link.labelStart, link.markupEnd), '[actual](actual.md "title")');
    assert.equal(text.slice(link.start, link.end), 'actual.md');
});

test('inventory is path-sorted with pinned field order and independent Git blob hashes', () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'md-inventory-test-'));
    try {
        fs.writeFileSync(path.join(temporary, 'z.md'), '中文\n');
        fs.writeFileSync(path.join(temporary, 'a.md'), 'alpha\n');
        const files = parser.inventory(temporary);
        assert.deepEqual(
            files.map((file) => file.path),
            ['skills/a.md', 'skills/z.md'],
        );
        assert.deepEqual(Object.keys(files[0]), ['path', 'sha256', 'bytes', 'git_blob_sha']);
        const crypto = require('node:crypto');
        const bytes = fs.readFileSync(path.join(temporary, 'a.md'));
        assert.equal(
            files[0].git_blob_sha,
            crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
        );
        fs.mkdirSync(path.join(temporary, 'nested'));
        fs.symlinkSync(temporary, path.join(temporary, 'nested/alias'));
        assert.throws(() => parser.inventory(temporary), /symlink/);
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
    }
});

test('typed argument parsing rejects unknown flags, duplicates and missing values', () => {
    const schema = { root: 'value', check: 'boolean' };
    assert.deepEqual(parser.parseArgs(['--root=skills', '--check'], schema), { root: 'skills', check: true });
    assert.throws(() => parser.parseArgs(['--write'], schema), /Unknown/);
    assert.throws(() => parser.parseArgs(['--check', '--check'], schema), /Duplicate/);
    assert.throws(() => parser.parseArgs(['--root'], schema), /requires a value/);
    assert.throws(() => parser.parseArgs(['--root='], schema), /requires a value/);
    assert.throws(() => parser.parseArgs(['--check=false'], schema), /takes no value/);
});

test('single-column tables preserve table semantics and exact cell bytes', () => {
    const text = '| Header |\n| :---: |\n| ` two spaces ` |\n';
    const parsed = parser.parseMarkdown(text);
    assert.equal(parsed.blocks.length, 1);
    assert.equal(parsed.blocks[0].kind, 'table');
    assert.equal(parsed.blocks[0].text, text);
});
