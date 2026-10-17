const fs = require('fs');

// Media decoders seek with byte ranges; serving the whole file with 200 can
// abort WebKit playback even when the initial decode succeeded.
function serveStaticFile(req, res, file, contentType) {
    const size = fs.statSync(file).size;
    const headers = { 'Content-Type': contentType, 'Accept-Ranges': 'bytes', 'Content-Length': size };
    let start = 0;
    let end = size - 1;
    let partial = false;
    const match =
        req.method === 'GET' && !req.headers['if-range'] && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (match && (match[1] || match[2])) {
        start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
        end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
            res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}`, 'Content-Length': 0 });
            res.end();
            return;
        }
        partial = true;
        headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
        headers['Content-Length'] = end - start + 1;
    }
    res.writeHead(partial ? 206 : 200, headers);
    if (req.method === 'HEAD' || size === 0) {
        res.end();
        return;
    }
    fs.createReadStream(file, { start, end }).pipe(res);
}

module.exports = { serveStaticFile };

if (require.main === module) {
    const assert = require('node:assert/strict');
    const http = require('http');
    const data = fs.readFileSync(__filename);
    const server = http.createServer((req, res) => serveStaticFile(req, res, __filename, 'text/javascript'));
    server.listen(0, '127.0.0.1', async () => {
        try {
            const url = `http://127.0.0.1:${server.address().port}/`;
            const cases = [
                [{}, 200, data],
                [{ headers: { Range: 'bytes=0-1' } }, 206, data.subarray(0, 2)],
                [{ headers: { Range: 'bytes=5-' } }, 206, data.subarray(5)],
                [{ headers: { Range: 'bytes=-3' } }, 206, data.subarray(-3)],
                [{ headers: { Range: `bytes=${data.length}-` } }, 416, Buffer.alloc(0)],
                [{ headers: { Range: 'bytes=4-1' } }, 416, Buffer.alloc(0)],
                [{ headers: { Range: 'bytes=-0' } }, 416, Buffer.alloc(0)],
                [{ method: 'HEAD', headers: { Range: 'bytes=0-1' } }, 200, Buffer.alloc(0)],
            ];
            for (const [options, status, body] of cases) {
                const response = await fetch(url, options);
                assert.equal(response.status, status);
                assert.deepEqual(Buffer.from(await response.arrayBuffer()), body);
                assert.equal(response.headers.get('accept-ranges'), 'bytes');
                if (status === 206) assert.equal(Number(response.headers.get('content-length')), body.length);
                if (status === 416) assert.equal(response.headers.get('content-range'), `bytes */${data.length}`);
            }
            console.log('[static-file-response] 8 HTTP byte/body cases PASS');
        } catch (error) {
            console.error(error);
            process.exitCode = 1;
        } finally {
            server.close();
        }
    });
}
