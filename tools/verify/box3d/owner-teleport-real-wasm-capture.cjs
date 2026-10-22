// Context-reconstructed source after executor loss. No historical runtime evidence is reconstructed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const seen = new Map();
function capture(filename) {
    if (
        !process.env.AIR_BOX3D_TELEPORT_OUT ||
        !path.isAbsolute(filename) ||
        !fs.existsSync(filename) ||
        !fs.statSync(filename).isFile()
    )
        return;
    const bytes = fs.readFileSync(filename);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    if (seen.has(filename)) {
        if (seen.get(filename) !== sha256) throw new Error('STALE_TRANSITIVE_INPUT: ' + filename);
        return;
    }
    seen.set(filename, sha256);
    const directory = process.env.AIR_BOX3D_TELEPORT_OBJECTS;
    fs.mkdirSync(directory, { recursive: true });
    const object = path.join(directory, sha256 + '.gz');
    if (!fs.existsSync(object)) {
        try {
            fs.writeFileSync(object, zlib.gzipSync(bytes), { flag: 'wx' });
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
        }
    }
    if (
        crypto
            .createHash('sha256')
            .update(zlib.gunzipSync(fs.readFileSync(object)))
            .digest('hex') !== sha256
    )
        throw new Error('FROZEN_INPUT_MISMATCH: ' + filename);
    fs.appendFileSync(
        path.join(process.env.AIR_BOX3D_TELEPORT_OUT, 'transitive-inputs.raw.jsonl'),
        JSON.stringify({ path: filename, bytes: bytes.length, sha256, object }) + '\n',
    );
}
module.exports = { capture };
