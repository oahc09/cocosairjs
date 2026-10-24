import { nodeRequire } from '../shims';
const fs = nodeRequire('fs') as typeof import('fs');
const path = nodeRequire('path') as typeof import('path');
const os = nodeRequire('os') as typeof import('os');
const crypto = nodeRequire('crypto') as typeof import('crypto');
const REPO = path.resolve('.');
const workspaceTools = nodeRequire(path.join(REPO, 'tools/verify/example-workspace.cjs'));
const temporary: string[] = [];
function temp(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cocosair-workspace-test-'));
    temporary.push(root);
    return root;
}
function write(root: string, file: string, content: string): void {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
}
function fixture(): { root: string; repo: string; stage: string } {
    const root = temp();
    const repo = path.join(root, 'repo');
    write(
        repo,
        'examples/a/index.html',
        '<link rel="stylesheet" href="../shared/lab.css"><script type="module" src="./src/main.ts"></script>',
    );
    write(
        repo,
        'examples/a/src/main.ts',
        [
            "import '../../shared/helper.js';",
            "import '../../b/src/effect.generated.js';",
            "import '../../../tools/recipes/outer.js';",
            "fetch('../a/data.json');",
        ].join('\n'),
    );
    write(repo, 'examples/a/data.json', '{"unchanged":true}');
    write(repo, 'examples/b/src/effect.generated.js', 'export const effect = 1;');
    write(repo, 'examples/shared/helper.ts', 'export const helper = 1;');
    write(repo, 'examples/shared/lab.css', '@import "./theme.css"; .x{background:url("./pattern.png")}');
    write(repo, 'examples/shared/theme.css', '.x{color:blue}');
    write(repo, 'examples/shared/pattern.png', 'fixture image bytes');
    write(repo, 'tools/recipes/outer.ts', "export { inner } from './nested/inner.js';");
    write(repo, 'tools/recipes/nested/inner.ts', "export const inner = new URL('./data.bin', import.meta.url);");
    write(repo, 'tools/recipes/nested/data.bin', 'recipe asset bytes');
    return { root, repo, stage: path.join(root, 'stage') };
}
afterEach(() => {
    for (const root of temporary.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Example browser workspace dependency and byte closure', () => {
    test('preserves repository layout, transitive recipe dependencies, assets and source bytes', () => {
        const f = fixture();
        const staged = workspaceTools.prepareExampleWorkspace(f.repo, { dir: 'a' }, f.stage);
        expect(staged.workspace).toBe(path.join(f.stage, 'examples/a'));
        expect(staged.serveRoot).toBe(f.stage);
        const before = workspaceTools.listWorkspaceInputs(f.repo);
        expect(staged.inputs).toEqual(before);
        for (const row of before) {
            const bytes = fs.readFileSync(path.join(f.stage, row.path));
            expect(bytes.length).toBe(row.bytes);
            expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256);
            expect(bytes.equals(fs.readFileSync(path.join(f.repo, row.path)))).toBe(true);
        }
        expect(staged.references).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ resolved: 'examples/b/src/effect.generated.js' }),
                expect.objectContaining({ resolved: 'examples/shared/helper.ts' }),
                expect.objectContaining({ resolved: 'tools/recipes/nested/inner.ts' }),
                expect.objectContaining({ resolved: 'tools/recipes/nested/data.bin' }),
                expect.objectContaining({ resolved: 'examples/a/data.json', kind: 'fetch' }),
            ]),
        );
    });
    test('inventory hashes include unrelated sibling files and change when their bytes change', () => {
        const f = fixture();
        const before = workspaceTools.listWorkspaceInputs(f.repo);
        write(f.repo, 'examples/b/unreferenced.bin', 'full conservative closure');
        const after = workspaceTools.listWorkspaceInputs(f.repo);
        expect(after).toHaveLength(before.length + 1);
        expect(after.find((row: any) => row.path === 'examples/b/unreferenced.bin')).toEqual({
            path: 'examples/b/unreferenced.bin',
            bytes: 25,
            sha256: crypto.createHash('sha256').update('full conservative closure').digest('hex'),
        });
        expect(workspaceTools.listWorkspaceInputs(f.repo)).toEqual(after);
    });
    test.each([
        '../../outside.js',
        '../../../../outside.js',
        '/private/config.js',
        '/examples/../../private/config.js',
        '%2e%2e/%2e%2e/%2e%2e/%2e%2e/outside.js',
    ])('rejects dependency escape %s', (specifier: string) => {
        const f = fixture();
        // Relative ../../outside.js remains inside examples, so it is rejected as missing.
        write(f.repo, 'examples/a/src/main.ts', `import ${JSON.stringify(specifier)};`);
        expect(() => workspaceTools.prepareExampleWorkspace(f.repo, { dir: 'a' }, f.stage)).toThrow(
            /WORKSPACE_(?:REFERENCE_ESCAPE|MISSING_REFERENCE)/,
        );
        expect(fs.existsSync(f.stage)).toBe(false);
    });
    test('rejects a missing transitive import before creating a destination', () => {
        const f = fixture();
        write(f.repo, 'tools/recipes/nested/inner.ts', "export * from './missing.js';");
        expect(() => workspaceTools.prepareExampleWorkspace(f.repo, { dir: 'a' }, f.stage)).toThrow(
            'WORKSPACE_MISSING_REFERENCE',
        );
        expect(fs.existsSync(f.stage)).toBe(false);
    });
    test('rejects missing static fetch and CSS asset references', () => {
        const f = fixture();
        fs.unlinkSync(path.join(f.repo, 'examples/a/data.json'));
        expect(() => workspaceTools.prepareExampleWorkspace(f.repo, 'a', f.stage)).toThrow(
            'WORKSPACE_MISSING_REFERENCE',
        );
        write(f.repo, 'examples/a/data.json', '{}');
        fs.unlinkSync(path.join(f.repo, 'examples/shared/pattern.png'));
        expect(() => workspaceTools.prepareExampleWorkspace(f.repo, 'a', f.stage)).toThrow(
            'WORKSPACE_MISSING_REFERENCE',
        );
    });
    test.each(['../a', '/a', 'a/../../b', 'a\\b', ''])(
        'rejects an invalid selected example directory %s',
        (dir: string) => {
            const f = fixture();
            expect(() => workspaceTools.prepareExampleWorkspace(f.repo, { dir }, f.stage)).toThrow(
                'WORKSPACE_INVALID_EXAMPLE_DIR',
            );
        },
    );
    test('rejects supported symbolic links even when their targets are inside the allowed tree', () => {
        const f = fixture();
        const link = path.join(f.repo, 'examples/a/link.ts');
        // Keep the file-link control on Linux; Windows junctions exercise the real lstat rejection without elevation.
        if (process.platform !== 'win32') {
            fs.symlinkSync(path.join(f.repo, 'examples/shared/helper.ts'), link, 'file');
            expect(() => workspaceTools.listWorkspaceInputs(f.repo)).toThrow('WORKSPACE_SYMLINK');
            fs.unlinkSync(link);
        }
        fs.symlinkSync(path.join(f.repo, 'examples/shared'), link, process.platform === 'win32' ? 'junction' : 'dir');
        expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
        expect(() => workspaceTools.listWorkspaceInputs(f.repo)).toThrow('WORKSPACE_SYMLINK');
    });
    test('rejects symlink roots and destinations without following them', () => {
        const f = fixture();
        const repoLink = path.join(f.root, 'repo-link');
        fs.symlinkSync(f.repo, repoLink, process.platform === 'win32' ? 'junction' : 'dir');
        expect(() => workspaceTools.listWorkspaceInputs(repoLink)).toThrow('WORKSPACE_SYMLINK');
        const elsewhere = path.join(f.root, 'elsewhere');
        fs.mkdirSync(elsewhere);
        fs.symlinkSync(elsewhere, f.stage, process.platform === 'win32' ? 'junction' : 'dir');
        expect(() => workspaceTools.prepareExampleWorkspace(f.repo, 'a', f.stage)).toThrow('WORKSPACE_SYMLINK');
        expect(fs.readdirSync(elsewhere)).toEqual([]);
    });
    test('refuses repository overlap and existing nonempty destinations', () => {
        const f = fixture();
        expect(() => workspaceTools.prepareExampleWorkspace(f.repo, 'a', path.join(f.repo, 'stage'))).toThrow(
            'WORKSPACE_DESTINATION_OVERLAP',
        );
        expect(() => workspaceTools.prepareExampleWorkspace(f.repo, 'a', f.root)).toThrow(
            'WORKSPACE_DESTINATION_OVERLAP',
        );
        write(f.stage, 'sentinel', 'keep');
        expect(() => workspaceTools.prepareExampleWorkspace(f.repo, 'a', f.stage)).toThrow(
            'WORKSPACE_DESTINATION_NOT_EMPTY',
        );
        expect(fs.readFileSync(path.join(f.stage, 'sentinel'), 'utf8')).toBe('keep');
    });
    test('root build inputs must exist and remain separate from staged example bytes', () => {
        const f = fixture();
        write(
            f.repo,
            'examples/a/index.html',
            '<script type="importmap">{"imports":{"cocosair":"/build/main.js"}}</script>',
        );
        expect(() => workspaceTools.prepareExampleWorkspace(f.repo, 'a', f.stage)).toThrow();
        write(f.repo, 'build/main.js', 'export const runtime = 1;');
        const staged = workspaceTools.prepareExampleWorkspace(f.repo, 'a', f.stage);
        expect(staged.references).toEqual([
            expect.objectContaining({ resolved: 'build/main.js', kind: 'runtime-build' }),
        ]);
        expect(staged.inputs.some((row: any) => row.path.startsWith('build/'))).toBe(false);
        expect(fs.existsSync(path.join(f.stage, 'build/main.js'))).toBe(false);
    });
    test('rejects runtime build symlinks instead of reading outside the allowed repository', () => {
        const f = fixture();
        write(
            f.repo,
            'examples/a/index.html',
            '<script type="importmap">{"imports":{"cocosair":"/build/main.js"}}</script>',
        );
        write(f.root, 'outside.js', 'external secret must not be read');
        fs.mkdirSync(path.join(f.repo, 'build'));
        if (process.platform === 'win32') {
            fs.mkdirSync(path.join(f.root, 'outside-build'));
            fs.symlinkSync(path.join(f.root, 'outside-build'), path.join(f.repo, 'build/main.js'), 'junction');
        } else fs.symlinkSync(path.join(f.root, 'outside.js'), path.join(f.repo, 'build/main.js'), 'file');
        expect(() => workspaceTools.prepareExampleWorkspace(f.repo, 'a', f.stage)).toThrow('WORKSPACE_SYMLINK');
        expect(fs.existsSync(f.stage)).toBe(false);
    });
    (process.platform === 'win32' ? test.skip : test)(
        'rejects FIFO inputs and runtime build paths without opening or waiting on them',
        () => {
            const f = fixture();
            const { execFileSync } = nodeRequire('child_process') as typeof import('child_process');
            const pipe = path.join(f.repo, 'examples/a/pipe');
            execFileSync('mkfifo', [pipe]);
            expect(() => workspaceTools.listWorkspaceInputs(f.repo)).toThrow('WORKSPACE_NONREGULAR');
            fs.unlinkSync(pipe);
            write(
                f.repo,
                'examples/a/index.html',
                '<script type="importmap">{"imports":{"cocosair":"/build/main.js"}}</script>',
            );
            fs.mkdirSync(path.join(f.repo, 'build'));
            execFileSync('mkfifo', [path.join(f.repo, 'build/main.js')]);
            expect(() => workspaceTools.prepareExampleWorkspace(f.repo, 'a', f.stage)).toThrow('WORKSPACE_NONREGULAR');
        },
    );
    test('about:blank UI frames do not become filesystem dependencies', () => {
        const f = fixture();
        write(f.repo, 'examples/a/index.html', '<iframe src="about:blank"></iframe>');
        expect(workspaceTools.prepareExampleWorkspace(f.repo, 'a', f.stage).references).toEqual([]);
    });
    test('all current non-DevTools pages have resolvable static dependencies in the preserved layout', () => {
        const inputs = workspaceTools.listWorkspaceInputs(REPO);
        const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'examples/files.json'), 'utf8'));
        const entries = manifest.examples.filter((example: any) => !example.requiresDevTools);
        expect(entries.length).toBeGreaterThan(0);
        for (const example of entries)
            expect(() => workspaceTools.validateReferences(REPO, example, inputs)).not.toThrow();
    });
    test.each(['shader-driver-pilot', 'html-texture-experimental', 'spark-splats'])(
        '%s compiles its preserved dependencies without launching a browser',
        (example) => {
            const { execFileSync } = nodeRequire('child_process') as typeof import('child_process');
            const stageRoot = temp();
            // esbuild requires Node's native Uint8Array realm, so use a CPU-only Node child rather than jsdom.
            const script = `
            const path = require('path');
            const fs = require('fs');
            const repo = process.argv[1], root = process.argv[2], dir = process.argv[3];
            const W = require(path.join(repo, 'tools/verify/example-workspace.cjs'));
            const { BrowserRuntime } = require(path.join(repo, 'tools/benchmark/runner/browser-runtime.cjs'));
            const esbuild = require(path.join(repo, 'node_modules/esbuild'));
            (async () => {
                    const result = W.prepareExampleWorkspace(repo, { dir }, path.join(root, dir));
                    const runtime = new BrowserRuntime({ esbuild, repo });
                    const built = await runtime.build({ paths: { workspace: result.workspace, serveRoot: result.serveRoot } });
                    const row = { dir, built, browser: runtime.browser, server: runtime.server,
                        unchanged: fs.readFileSync(path.join(result.workspace, 'src/main.ts')).equals(fs.readFileSync(path.join(repo, 'examples', dir, 'src/main.ts'))) };
                console.log(JSON.stringify(row));
            })().catch((error) => { console.error(error.stack); process.exitCode = 1; });
        `;
            const row = JSON.parse(
                execFileSync(process.execPath, ['-e', script, REPO, stageRoot, example], {
                    cwd: REPO,
                    encoding: 'utf8',
                    timeout: 25000,
                }),
            );
            expect(row.dir).toBe(example);
            expect(row.built).toEqual({ success: true, diagnostics: [] });
            expect(row.browser).toBe(null);
            expect(row.server).toBe(null);
            expect(row.unchanged).toBe(true);
        },
        30000,
    );
});
