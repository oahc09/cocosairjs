/* Read-only Box2D CI selection. No npm install; Git failures select full acceptance. */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

function relevant(file) {
    if (/\.md$/i.test(file) || (/\.txt$/i.test(file) && !/(^|\/)CMakeLists\.txt$/.test(file))) return false;
    return (
        /^(src|vendor|build)\//.test(file) ||
        /^tools\/(build|dev)\//.test(file) ||
        /^tools\/verify\/(box2d3[^/]*|browser-engines\.cjs|published-artifacts\.cjs)$/.test(file) ||
        /^tools\/ci\/box2d-scope(?:\.test)?\.cjs$/.test(file) ||
        /^examples\/(box2d3-lab|starter)\//.test(file) ||
        file === '.github/workflows/box2d3.yml' ||
        /^(package(?:-lock)?\.json|\.npmrc|\.npmignore|\.gitignore|\.nvmrc|\.gitattributes|tsconfig[^/]*\.json|babel\.config\.[^/]+)$/.test(
            file,
        )
    );
}

function select({ event, base, head, cwd = process.cwd() }) {
    if (event === 'workflow_dispatch') return { run: true, reason: 'manual', changed: [] };
    if (!['push', 'pull_request'].includes(event)) return { run: true, reason: 'unknown-event', changed: [] };
    if (![base, head].every((sha) => /^[0-9a-f]{40}$/i.test(sha || '') && !/^0+$/.test(sha)))
        return { run: true, reason: 'missing-revision', changed: [] };
    const diff = spawnSync('git', ['diff', '--name-only', '--no-renames', '-z', base, head, '--'], {
        cwd,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    if (diff.error || diff.status !== 0) return { run: true, reason: 'unreadable-diff', changed: [] };
    const changed = diff.stdout.split('\0').filter(Boolean);
    if (!changed.length) return { run: true, reason: 'empty-diff', changed };
    const matched = changed.filter(relevant);
    return { run: matched.length > 0, reason: matched.length ? 'related-paths' : 'unrelated-paths', changed, matched };
}

if (require.main === module) {
    const result = select({
        event: process.env.CI_EVENT,
        base: process.env.CI_BASE,
        head: process.env.CI_HEAD,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!process.env.GITHUB_OUTPUT) throw Error('GITHUB_OUTPUT required');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `run=${result.run}\n`);
    if (process.env.GITHUB_STEP_SUMMARY)
        fs.appendFileSync(
            process.env.GITHUB_STEP_SUMMARY,
            `Box2D acceptance selected: **${result.run}**; reason: ${result.reason}; changed files: ${result.changed.length}.\n`,
        );
}
module.exports = { relevant, select };
