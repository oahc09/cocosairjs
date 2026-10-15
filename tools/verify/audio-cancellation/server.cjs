const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '../../..');
const { serveStaticFile } = require('../static-file-response.cjs');
const audio = Object.fromEntries(
    ['a', 'b'].map((k) => [
        k,
        path.resolve(
            process.env['AUDIO_QA_' + k.toUpperCase()] || path.join(root, 'examples/audio-basic/assets/tone.wav'),
        ),
    ]),
);
for (const file of Object.values(audio)) if (!fs.existsSync(file)) throw Error('Missing audio input: ' + file);
http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const special = /^\/qa-([ab])\.wav$/.exec(pathname);
    const file = special ? audio[special[1]] : path.resolve(root, '.' + pathname);
    if ((!special && !file.startsWith(root + path.sep)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
    }
    const mime =
        { '.wav': 'audio/wav', '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' }[
            path.extname(file)
        ] || 'application/octet-stream';
    serveStaticFile(req, res, file, mime);
}).listen(Number(process.env.AUDIO_QA_PORT || 8876), '127.0.0.1', () => console.log('AUDIO_QA_SERVER_READY'));
