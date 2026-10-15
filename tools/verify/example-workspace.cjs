/* Example browser staging preserves repository URL/module layout.
 *
 * Copy the complete examples and tools/recipes trees, rather than rewriting a few
 * entry imports or guessing an asset closure from regexes. Every copied byte is
 * inventoried. A selected page's static local references must resolve within these
 * roots; /build references remain explicit runtime inputs served by BrowserRuntime.
 * Symlinks, nonregular files, missing references and escapes fail before staging.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ts = require('typescript');

const WORKSPACE_ROOTS = Object.freeze(['examples', 'tools/recipes']);
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const posix = (value) => value.split(path.sep).join('/');
function inside(root, file) {
    const rel = path.relative(root, file);
    return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`));
}
function plainPath(file, allowMissing = false) {
    const absolute = path.resolve(file);
    const parsed = path.parse(absolute);
    let cursor = parsed.root;
    for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part);
        let info;
        try {
            info = fs.lstatSync(cursor);
        } catch (error) {
            if (allowMissing && error.code === 'ENOENT') return;
            throw error;
        }
        if (info.isSymbolicLink()) throw Error(`WORKSPACE_SYMLINK: ${cursor}`);
    }
}
function rootOf(repo) {
    const root = path.resolve(repo);
    plainPath(root);
    if (!fs.statSync(root).isDirectory()) throw Error(`WORKSPACE_REPO_NOT_DIRECTORY: ${root}`);
    return root;
}
function allowedRelative(relative) {
    return WORKSPACE_ROOTS.some((root) => relative === root || relative.startsWith(`${root}/`));
}
function readRegular(root, relative) {
    const file = path.resolve(root, relative);
    if (!inside(root, file)) throw Error(`WORKSPACE_ESCAPE: ${relative}`);
    plainPath(file);
    if (!fs.lstatSync(file).isFile()) throw Error(`WORKSPACE_NONREGULAR: ${relative}`);
    const descriptor = fs.openSync(
        file,
        fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0),
    );
    try {
        if (!fs.fstatSync(descriptor).isFile()) throw Error(`WORKSPACE_NONREGULAR: ${relative}`);
        // On Linux, check the actual opened object too, not only its pre-open name.
        const real =
            process.platform === 'linux' ? fs.realpathSync(`/proc/self/fd/${descriptor}`) : fs.realpathSync(file);
        if (!inside(root, real)) throw Error(`WORKSPACE_ESCAPE: opened ${relative}`);
        if (real !== file) throw Error(`WORKSPACE_SYMLINK: opened ${relative} as ${real}`);
        return fs.readFileSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
}
/** Conservative, deterministic inventory consumed by campaign freeze and staging. */
function listWorkspaceInputs(repo) {
    const root = rootOf(repo);
    const rows = [];
    function walk(relative) {
        const absolute = path.join(root, relative);
        plainPath(absolute);
        const info = fs.lstatSync(absolute);
        if (info.isDirectory()) {
            for (const name of fs.readdirSync(absolute).sort()) walk(`${relative}/${name}`);
        } else {
            if (!info.isFile()) throw Error(`WORKSPACE_NONREGULAR: ${relative}`);
            const bytes = readRegular(root, relative);
            rows.push({ path: posix(relative), bytes: bytes.length, sha256: sha256(bytes) });
        }
    }
    for (const relative of WORKSPACE_ROOTS) walk(relative);
    return rows.sort((a, b) => a.path.localeCompare(b.path));
}
function exampleDirectory(example) {
    const dir = typeof example === 'string' ? example : example && example.dir;
    if (
        typeof dir !== 'string' ||
        !dir ||
        dir.includes('\\') ||
        path.posix.isAbsolute(dir) ||
        dir.split('/').some((part) => !part || part === '.' || part === '..') ||
        dir.includes('\0')
    ) {
        throw Error(`WORKSPACE_INVALID_EXAMPLE_DIR: ${String(dir)}`);
    }
    return dir;
}
function literal(node) {
    return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
}
/** Validate reachable static references; dynamic URLs remain bounded by the served roots. */
function validateReferences(repo, example, inputs) {
    const root = rootOf(repo);
    const dir = exampleDirectory(example);
    const documentPath = `examples/${dir}/index.html`;
    const files = new Set(inputs.map((row) => row.path));
    if (!files.has(documentPath)) throw Error(`WORKSPACE_MISSING_ENTRY: ${documentPath}`);
    const references = [];
    const visited = new Set();
    const sourcePattern = /\.(?:[cm]?js|tsx?)$/i;
    function reference(source, raw, kind, base = source) {
        if (typeof raw !== 'string' || raw === '' || raw.startsWith('#') || raw === 'about:blank') return;
        if (/^(?:https?:|data:|blob:|\/\/)/i.test(raw)) return;
        if (/^[a-z][a-z\d+.-]*:/i.test(raw)) throw Error(`WORKSPACE_UNSUPPORTED_URL: ${source} -> ${raw}`);
        let clean;
        try {
            clean = decodeURIComponent(raw.split(/[?#]/, 1)[0]);
        } catch {
            throw Error(`WORKSPACE_INVALID_URL: ${source} -> ${raw}`);
        }
        if (!clean || clean.includes('\\') || clean.includes('\0'))
            throw Error(`WORKSPACE_INVALID_URL: ${source} -> ${raw}`);
        if (/^[a-z][a-z\d+.-]*:/i.test(clean)) throw Error(`WORKSPACE_UNSUPPORTED_URL: ${source} -> ${raw}`);
        if (kind === 'module' && !clean.startsWith('.') && !clean.startsWith('/')) return;
        const absolute = clean.startsWith('/')
            ? path.resolve(root, `.${clean}`)
            : path.resolve(root, path.posix.dirname(base), clean);
        if (!inside(root, absolute)) throw Error(`WORKSPACE_REFERENCE_ESCAPE: ${source} -> ${raw}`);
        const relative = posix(path.relative(root, absolute));
        if (clean.startsWith('/build/')) {
            if (!relative.startsWith('build/')) throw Error(`WORKSPACE_REFERENCE_ESCAPE: ${source} -> ${raw}`);
            const bytes = readRegular(root, relative);
            references.push({
                source,
                requested: raw,
                resolved: relative,
                kind: 'runtime-build',
                bytes: bytes.length,
                sha256: sha256(bytes),
            });
            return;
        }
        if (!allowedRelative(relative)) throw Error(`WORKSPACE_REFERENCE_ESCAPE: ${source} -> ${raw}`);
        const candidates = [relative];
        if (kind === 'module') {
            if (relative.endsWith('.js')) candidates.push(relative.slice(0, -3) + '.ts');
            if (!path.posix.extname(relative))
                candidates.push(
                    ...['.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.js'].map((suffix) => relative + suffix),
                );
        }
        const resolved = candidates.find((candidate) => files.has(candidate));
        if (!resolved) throw Error(`WORKSPACE_MISSING_REFERENCE: ${source} -> ${raw}`);
        references.push({ source, requested: raw, resolved, kind });
        visit(resolved);
    }
    function script(source, text) {
        const ast = ts.createSourceFile(source, text, ts.ScriptTarget.Latest, true);
        function walk(node) {
            let specifier = null;
            if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = literal(node.moduleSpecifier);
            if (
                ts.isCallExpression(node) &&
                (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                    (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
            )
                specifier = literal(node.arguments[0]);
            if (specifier !== null) reference(source, specifier, 'module');
            if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'fetch') {
                const url = literal(node.arguments[0]);
                if (url !== null) reference(source, url, 'fetch', documentPath);
            }
            if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL') {
                const url = literal(node.arguments && node.arguments[0]);
                const base = node.arguments && node.arguments[1];
                if (url !== null && base && base.getText(ast) === 'import.meta.url') reference(source, url, 'asset');
            }
            ts.forEachChild(node, walk);
        }
        walk(ast);
    }
    function css(source, text) {
        const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
        for (const match of clean.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)|@import\s+(['"])(.*?)\3/g)) {
            reference(source, match[2] === undefined ? match[4] : match[2], 'asset');
        }
    }
    function html(source, text) {
        const clean = text.replace(/<!--[\s\S]*?-->/g, '');
        for (const tag of clean.matchAll(/<(script|link|img|source|audio|video|iframe)\b([^>]*)>/gi)) {
            const attrs = Object.fromEntries(
                [...tag[2].matchAll(/([\w-]+)\s*=\s*(['"])(.*?)\2/g)].map((m) => [m[1].toLowerCase(), m[3]]),
            );
            for (const key of tag[1].toLowerCase() === 'link' ? ['href'] : ['src', 'poster']) {
                if (attrs[key]) reference(source, attrs[key], tag[1].toLowerCase() === 'script' ? 'module' : 'asset');
            }
        }
        for (const match of clean.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
            if (/\btype\s*=\s*['"]importmap['"]/i.test(match[1])) {
                const map = JSON.parse(match[2]);
                for (const value of Object.values(map.imports || {})) reference(source, value, 'importmap');
                for (const scope of Object.values(map.scopes || {}))
                    for (const value of Object.values(scope)) reference(source, value, 'importmap');
            } else if (!/\bsrc\s*=/i.test(match[1])) script(source, match[2]);
        }
        for (const match of clean.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) css(source, match[1]);
    }
    function visit(relative) {
        if (visited.has(relative)) return;
        visited.add(relative);
        if (!sourcePattern.test(relative) && !/\.(?:html|css)$/i.test(relative)) return;
        const text = readRegular(root, relative).toString('utf8');
        if (/\.html$/i.test(relative)) html(relative, text);
        else if (/\.css$/i.test(relative)) css(relative, text);
        else script(relative, text);
    }
    visit(documentPath);
    return references.sort((a, b) => `${a.source}\0${a.requested}`.localeCompare(`${b.source}\0${b.requested}`));
}
/** tempRoot must be new or empty and outside repo; sources and metadata remain untouched. */
function prepareExampleWorkspace(repo, example, tempRoot) {
    const root = rootOf(repo);
    const target = path.resolve(tempRoot);
    if (inside(root, target) || inside(target, root)) throw Error('WORKSPACE_DESTINATION_OVERLAP');
    plainPath(target, true);
    if (fs.existsSync(target) && (!fs.statSync(target).isDirectory() || fs.readdirSync(target).length)) {
        throw Error(`WORKSPACE_DESTINATION_NOT_EMPTY: ${target}`);
    }
    const dir = exampleDirectory(example);
    const inputs = listWorkspaceInputs(root);
    const references = validateReferences(root, example, inputs);
    fs.mkdirSync(target, { recursive: true });
    for (const row of inputs) {
        const bytes = readRegular(root, row.path);
        if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256)
            throw Error(`WORKSPACE_INPUT_CHANGED: ${row.path}`);
        const output = path.join(target, row.path);
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, bytes, { flag: 'wx' });
    }
    return { workspace: path.join(target, 'examples', dir), serveRoot: target, inputs, references };
}
module.exports = { WORKSPACE_ROOTS, listWorkspaceInputs, validateReferences, prepareExampleWorkspace };
