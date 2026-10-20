/* Preserve a Box2D artifact index as portable, hash-checked tar.gz volumes.
 * --index=<artifacts.json> --out=<new-directory> writes only that directory.
 * --check=<directory> extracts into a private temporary directory, verifies every
 * original byte and removes that temporary directory. Requires the tar CLI.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const tar =
    process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:/Windows', 'System32/tar.exe') : 'tar';
const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function safePath(relative) {
    assert.equal(typeof relative, 'string');
    assert.ok(!/[\r\n\\]/.test(relative) && !relative.startsWith('-'));
    assert.ok(path.resolve(root, relative).startsWith(root + path.sep), `Unsafe path: ${relative}`);
    return relative;
}
function verify(directory) {
    const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'archive.json'), 'utf8'));
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'air-box2d-archive-'));
    try {
        for (const volume of receipt.volumes) {
            assert.equal(path.basename(volume.file), volume.file);
            const archive = path.join(directory, volume.file);
            assert.equal(hash(archive), volume.sha256, volume.file);
            const members = execFileSync(tar, ['-tzf', archive], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
                .trim()
                .split('\n')
                .map((name) => safePath(name.replace(/\r$/, '')));
            assert.deepEqual(
                members,
                volume.artifacts.map((row) => row.path),
            );
            execFileSync(tar, ['-mxzf', archive, '-C', temporary]);
            for (const row of volume.artifacts) {
                const file = path.join(temporary, safePath(row.path));
                const stat = fs.lstatSync(file);
                assert.ok(stat.isFile() && !stat.isSymbolicLink());
                assert.equal(stat.size, row.bytes, row.path);
                assert.equal(hash(file), row.sha256, row.path);
            }
        }
    } finally {
        assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));
        fs.rmSync(temporary, { recursive: true });
    }
    console.log(
        JSON.stringify({ pass: true, directory, artifacts: receipt.artifacts, volumes: receipt.volumes.length }),
    );
}
const check = option('check');
if (check) {
    verify(path.resolve(check));
} else {
    const index = option('index'),
        out = option('out');
    assert.ok(index && out, 'Usage: --index=<artifacts.json> --out=<new-directory> | --check=<directory>');
    const directory = path.resolve(out);
    assert.ok(!fs.existsSync(directory), 'Archive output must be new');
    const rows = JSON.parse(fs.readFileSync(index, 'utf8')).artifacts;
    assert.ok(rows.length && new Set(rows.map((row) => row.path)).size === rows.length);
    for (const row of rows) {
        const file = path.join(root, safePath(row.path));
        assert.ok(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink());
        assert.equal(fs.statSync(file).size, row.bytes, row.path);
        assert.equal(hash(file), row.sha256, row.path);
    }
    fs.mkdirSync(directory, { recursive: true });
    const volumes = [];
    for (const row of rows) {
        let volume = volumes.at(-1);
        if (!volume || volume.bytes + row.bytes > 40 * 1024 * 1024) {
            volume = {
                file: `originals-${String(volumes.length + 1).padStart(2, '0')}.tar.gz`,
                bytes: 0,
                artifacts: [],
            };
            volumes.push(volume);
        }
        volume.bytes += row.bytes;
        volume.artifacts.push(row);
    }
    for (const volume of volumes) {
        const list = path.join(directory, volume.file + '.files');
        fs.writeFileSync(list, volume.artifacts.map((row) => row.path).join('\n') + '\n', { flag: 'wx' });
        const archive = path.join(directory, volume.file);
        execFileSync(tar, ['-czf', archive, '-T', list], { cwd: root });
        fs.unlinkSync(list);
        volume.sha256 = hash(archive);
        volume.archiveBytes = fs.statSync(archive).size;
    }
    fs.writeFileSync(
        path.join(directory, 'archive.json'),
        JSON.stringify(
            {
                schema: 1,
                sourceIndex: path.relative(root, path.resolve(index)).split(path.sep).join('/'),
                sourceIndexSha256: hash(index),
                artifacts: rows.length,
                volumes,
            },
            null,
            2,
        ) + '\n',
        { flag: 'wx' },
    );
    verify(directory);
}
