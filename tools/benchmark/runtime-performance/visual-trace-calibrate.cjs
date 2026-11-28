'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { spawn } = require('node:child_process');
const { PNG } = require('pngjs');
const { anchorName, makeSignature, analyze } = require('./visual-trace.cjs');
const { digest, writeNew } = require('./evidence.cjs');

const shapes = { cube: [0.39, 0.3, 0.6, 0.7], model: [0.69, 0.3, 0.83, 0.63] };
const colors = { clear: [56, 56, 56], cube: [255, 128, 64], model: [32, 225, 200] };
const rois = { cube: [0.27, 0.23, 0.66, 0.77], model: [0.63, 0.21, 0.91, 0.73] };
const inside = (u, v, [l, t, r, b]) => u >= l && u < r && v >= t && v < b;
function reference(kind) {
    const png = new PNG({ width: 320, height: 180 });
    for (let y = 0; y < png.height; y++)
        for (let x = 0; x < png.width; x++) {
            const u = x / png.width;
            const v = y / png.height;
            const key =
                kind === 'model' && inside(u, v, shapes.model)
                    ? 'model'
                    : kind !== 'clear' && inside(u, v, shapes.cube)
                      ? 'cube'
                      : 'clear';
            png.data.set([...colors[key], 255], 4 * (x + y * png.width));
        }
    return png;
}
function fixture(delayed) {
    return `<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">
<style>body{margin:0;background:white}canvas{display:block;width:100vw;height:100vh}</style>
<canvas id="view" width="1280" height="720"></canvas><script>
const shapes=${JSON.stringify(shapes)},colors=${JSON.stringify(colors)};
const ctx=view.getContext('2d');
function paint(name, [l,t,r,b]) {
    ctx.fillStyle='rgb('+colors[name].join(',')+')';
    ctx.fillRect(l*view.width,t*view.height,(r-l)*view.width,(b-t)*view.height);
}
setTimeout(()=>paint('clear',[0,0,1,1]),75);
setTimeout(()=>{paint('cube',shapes.cube);performance.mark('AIR_TRACE_FIXTURE_CUBE');},200);
setTimeout(()=>paint('cube',[0.05,0.07,0.12,0.14]),360);
if (${delayed}) setTimeout(()=>{paint('model',shapes.model);performance.mark('AIR_TRACE_FIXTURE_MODEL');},520);
</script>`;
}
async function main([executable, output, mode, ...rest]) {
    if (!executable || !output || rest.length || !['headless', 'headed'].includes(mode))
        throw new Error('Usage: visual-trace-calibrate.cjs CHROMIUM NEW_OUTPUT_DIR headless|headed');
    fs.mkdirSync(output);
    const frames = Object.fromEntries(['clear', 'cube', 'model'].map((name) => [name, reference(name)]));
    for (const [name, frame] of Object.entries(frames))
        fs.writeFileSync(path.join(output, name + '.png'), PNG.sync.write(frame), { flag: 'wx' });
    const signatures = {
        cube: makeSignature(frames.clear, frames.cube, rois.cube),
        model: makeSignature(frames.cube, frames.model, rois.model),
    };
    const server = createServer((req, res) => {
        if (!['/delayed', '/absent'].includes(req.url)) return res.writeHead(404).end();
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end(
            fixture(req.url === '/delayed'),
        );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const report = { scope: 'synthetic-compositor-calibration-not-engine-or-hardware-benchmark', tracks: {} };
    try {
        for (const arm of ['delayed', 'absent']) {
            const out = path.resolve(output, arm + '.trace.json');
            const child = spawn(
                process.execPath,
                [
                    path.join(__dirname, 'visual-trace-collect.cjs'),
                    executable,
                    'http://127.0.0.1:' + server.address().port + '/' + arm,
                    out,
                    '1000',
                    mode,
                ],
                { stdio: 'inherit' },
            );
            const [exit] = await once(child, 'exit');
            if (exit !== 0) throw new Error('Calibration trace failed: ' + arm);
            const bytes = fs.readFileSync(out);
            const { meta, traceEvents } = JSON.parse(bytes);
            const cube = analyze(traceEvents, signatures.cube);
            const model = analyze(traceEvents, signatures.model);
            const anchor = traceEvents.find((e) => e.name === anchorName && e.cat === 'blink.user_timing');
            const mark = (key) => {
                const marks = traceEvents.filter((e) => e.name === key && e.cat === 'blink.user_timing');
                if (marks.length === 0) return null;
                if (marks.length !== 1) throw new Error('Ambiguous fixture draw mark');
                return (marks[0].ts - anchor.ts) / 1000;
            };
            const drawn = { cube: mark('AIR_TRACE_FIXTURE_CUBE'), model: mark('AIR_TRACE_FIXTURE_MODEL') };
            report.tracks[arm] = { traceSha256: digest(bytes), meta, cube, model, drawn };
            function bracket(result, point) {
                return (
                    result.status === 'bounded' &&
                    point !== null &&
                    result.intervalMs.lastAbsent < point &&
                    result.intervalMs.firstPresent >= point
                );
            }
            if (
                !bracket(cube, drawn.cube) ||
                (arm === 'delayed'
                    ? !bracket(model, drawn.model)
                    : model.status !== 'not-observed' || drawn.model !== null)
            )
                throw new Error('Synthetic visual timing falsification failed: ' + arm);
        }
    } finally {
        await new Promise((resolve) => server.close(resolve));
        writeNew(path.join(output, 'calibration.json'), report);
    }
}

main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
