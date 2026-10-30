/* Preserve original interop records without rewriting their paths, statuses or fingerprints.
 * --inputs=<inventory.json> --out=<new-archive> copies only the inventory's exact files.
 * --check=<archive> verifies the saved bytes and complete archived-file inventory, with no writes.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const portable = (file) => path.relative(root, file).replace(/\\/g, '/');
function inside(parent, name) {
    const file = path.resolve(parent, name);
    if (!file.startsWith(parent + path.sep)) throw Error('Path escapes its declared root: ' + name);
    return file;
}
function verifyBytes(file, record) {
    const bytes = fs.readFileSync(file);
    if (bytes.length !== record.bytes || sha(bytes) !== record.sha256) throw Error('Bytes changed: ' + file);
    return bytes;
}
function checkArchive(directory) {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json')));
    if (manifest.schema !== 'air-runtime-interop-original-records-v1') throw Error('Unknown archive schema');
    if (manifest.fileCount !== manifest.files.length) throw Error('Archive count differs from its manifest');
    verifyBytes(inside(directory, manifest.sourceInventory.file), manifest.sourceInventory);
    const declared = new Set();
    for (const row of manifest.files) {
        if (declared.has(row.file)) throw Error('Duplicate archived file: ' + row.file);
        declared.add(row.file);
        verifyBytes(inside(directory, row.file), row);
    }
    const actual = [];
    const visit = (folder) => {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
            const file = path.join(folder, entry.name);
            if (entry.isSymbolicLink()) throw Error('Archive contains a symbolic link');
            if (entry.isDirectory()) visit(file);
            else if (entry.isFile()) actual.push(path.relative(directory, file).replace(/\\/g, '/'));
            else throw Error('Archive contains a non-regular file');
        }
    };
    visit(path.join(directory, 'files'));
    if (actual.length !== declared.size || actual.some((file) => !declared.has(file)))
        throw Error('Archived files differ from the manifest');
    verifyBytes(inside(root, manifest.producer.file), manifest.producer);
    return { pass: true, files: actual.length, bytes: manifest.files.reduce((total, row) => total + row.bytes, 0) };
}
function main(argv) {
    const args = {};
    for (const argument of argv) {
        const match = /^--(inputs|out|check)=(.+)$/.exec(argument);
        if (!match || args[match[1]]) throw Error('Unknown or duplicate argument: ' + argument);
        args[match[1]] = match[2];
    }
    if (args.check) {
        if (args.inputs || args.out) throw Error('--check cannot be combined with archive creation');
        return checkArchive(inside(root, args.check));
    }
    if (!args.inputs || !args.out) throw Error('--inputs and --out are required');
    const inventoryFile = inside(root, args.inputs);
    const inventoryBytes = fs.readFileSync(inventoryFile);
    const inventory = JSON.parse(inventoryBytes);
    if (!Array.isArray(inventory.files) || !inventory.files.length) throw Error('Empty source inventory');
    const directory = inside(root, args.out);
    fs.mkdirSync(directory);
    const files = [];
    const originals = new Set();
    for (const row of inventory.files) {
        if (originals.has(row.originalFile)) throw Error('Duplicate original file');
        originals.add(row.originalFile);
        const source = inside(root, row.originalFile);
        const bytes = verifyBytes(source, row);
        const relative = 'files/' + row.originalFile;
        const target = inside(directory, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes, { flag: 'wx' });
        files.push({ originalFile: row.originalFile, file: relative, bytes: bytes.length, sha256: row.sha256 });
    }
    const producerBytes = fs.readFileSync(__filename);
    const manifest = {
        schema: 'air-runtime-interop-original-records-v1',
        createdAt: new Date().toISOString(),
        scope: 'Original lifecycle, native-memory and physical-device records, including failed attempts',
        originalPathsUnchanged: true,
        sourceInventory: { file: 'source-inventory.json', bytes: inventoryBytes.length, sha256: sha(inventoryBytes) },
        producer: { file: portable(__filename), bytes: producerBytes.length, sha256: sha(producerBytes) },
        fileCount: files.length,
        files,
    };
    fs.writeFileSync(path.join(directory, 'source-inventory.json'), inventoryBytes, { flag: 'wx' });
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    return checkArchive(directory);
}
module.exports = { main, checkArchive };
if (require.main === module) console.log(JSON.stringify(main(process.argv.slice(2))));
