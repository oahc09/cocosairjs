/* W13: keep logical updates, main-thread draw intervals, GPU timing and
 * compositor present as separate evidence. Headless rAF is never a device FPS gate.
 * NODE_PATH=<playwright> node tools/verify/performance-axes.cjs
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../..');
const bundle = path.join(root, 'build/cocosair.module.js');
const out = path.join(root, 'docs/evidence/w13-performance-axes.json');
const presentArg = process.argv.find((arg) => arg.startsWith('--present-json='));
function devicePresentAxis() {
    if (!presentArg)
        return {
            status: 'unavailable',
            reason: 'headless has no device present timestamp; pass --present-json=<SurfaceFlinger trace export>',
        };
    const file = path.resolve(presentArg.slice('--present-json='.length));
    const trace = JSON.parse(fs.readFileSync(file, 'utf8'));
    const times = trace.timestampsMs;
    if (
        trace.source !== 'SurfaceFlinger' ||
        !trace.device ||
        !Array.isArray(times) ||
        times.length < 2 ||
        times.some((value, index) => !Number.isFinite(value) || (index > 0 && value <= times[index - 1]))
    ) {
        throw new Error('present trace requires source=SurfaceFlinger, device, and increasing timestampsMs');
    }
    const intervals = times
        .slice(1)
        .map((time, index) => time - times[index])
        .sort((a, b) => a - b);
    return {
        status: 'measured',
        source: trace.source,
        device: trace.device,
        samples: intervals.length,
        medianIntervalMs: intervals[Math.floor(intervals.length / 2)],
        unit: 'ms',
    };
}

// Keep this function self-contained: the browser runs the same implementation as
// the dependency-free Node regression tests via Function#toString below.
function createGpuTimerCollector(gl, options = {}) {
    const timer = gl?.getExtension('EXT_disjoint_timer_query_webgl2');
    const capacity = options.capacity ?? 64;
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('GPU query capacity must be positive');
    const pending = [];
    const samples = [];
    let active = null;
    let disposed = false,
        lost = false,
        serial = 0;
    let reason = timer ? null : 'timer-feature-unavailable';
    const reject = (status, value) => ({ status, reason: value });

    function discardPending() {
        for (const entry of pending) gl.deleteQuery(entry.query);
        pending.length = 0;
    }

    function poll() {
        if (disposed || !timer || lost) return false;
        if (gl.isContextLost?.()) {
            lost = true;
            reason = 'context-lost';
            // The context is invalid: release JS references; do not issue GL work.
            active = null;
            pending.length = 0;
            return false;
        }
        // Check even when no query is ready. A disjoint interval invalidates all
        // outstanding measurements, not only the queries available right now.
        if (gl.getParameter(timer.GPU_DISJOINT_EXT)) {
            if (active) {
                gl.endQuery(timer.TIME_ELAPSED_EXT);
                gl.deleteQuery(active.query);
                active = null;
            }
            discardPending();
            reason = 'timer-disjoint';
            return false;
        }
        reason = null;
        for (let i = pending.length - 1; i >= 0; i--) {
            const entry = pending[i];
            if (!gl.getQueryParameter(entry.query, gl.QUERY_RESULT_AVAILABLE)) continue;
            const nanoseconds = gl.getQueryParameter(entry.query, gl.QUERY_RESULT);
            if (Number.isFinite(nanoseconds) && nanoseconds >= 0) {
                const sample = { phase: entry.phase, frame: entry.frame, ms: nanoseconds / 1e6 };
                if (entry.metadata)
                    Object.assign(sample, entry.metadata, {
                        metric: 'gpu-elapsed-span',
                        feature: 'EXT_disjoint_timer_query_webgl2',
                        queryType: 'TIME_ELAPSED',
                        resultObservedAtMs: performance.now(),
                    });
                samples.push(sample);
            }
            gl.deleteQuery(entry.query);
            pending.splice(i, 1);
        }
        return true;
    }

    return {
        available: !!timer,
        begin(phase, frame, metadata) {
            if (!poll()) return reject('unavailable', disposed ? 'disposed' : reason);
            if (active) return reject('unsupported', 'overlapping-webgl-elapsed-query');
            if (phase === null) return reject('unavailable', 'outside-measurement-region');
            if (pending.length >= capacity) return reject('unavailable', 'query-capacity-exhausted');
            let captured;
            if (metadata !== undefined) {
                const { regionId, submissionIds, passIds } = metadata;
                if (
                    typeof regionId !== 'string' ||
                    !regionId ||
                    !Array.isArray(submissionIds) ||
                    !submissionIds.every((id) => Number.isSafeInteger(id) && id >= 0) ||
                    !Array.isArray(passIds) ||
                    !passIds.every((id) => typeof id === 'string')
                )
                    throw new Error('GPU region metadata requires regionId, submissionIds and passIds');
                captured = {
                    regionId,
                    submissionIds: submissionIds.slice(),
                    passIds: passIds.slice(),
                    beginObservedAtMs: performance.now(),
                };
            }
            const query = gl.createQuery();
            if (!query) return reject('unavailable', 'query-allocation-failed');
            const token = Object.freeze({ status: 'pending', id: ++serial });
            active = { query, phase, frame, metadata: captured, token };
            gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
            return token;
        },
        end(token) {
            if (disposed || lost || (token !== undefined && token !== active?.token)) return;
            if (gl?.isContextLost?.()) {
                poll();
                return;
            }
            if (active) {
                gl.endQuery(timer.TIME_ELAPSED_EXT);
                if (active.metadata) active.metadata.endObservedAtMs = performance.now();
                pending.push(active);
                active = null;
            }
            poll();
        },
        poll,
        get pendingCount() {
            return pending.length + (active ? 1 : 0);
        },
        snapshot() {
            return samples.map((sample) => ({
                ...sample,
                ...(sample.passIds
                    ? {
                          passIds: sample.passIds.slice(),
                          submissionIds: sample.submissionIds.slice(),
                      }
                    : {}),
            }));
        },
        get state() {
            return {
                status: disposed || lost || !timer || reason ? 'unavailable' : 'available',
                reason: disposed ? 'disposed' : reason,
                pendingCount: pending.length + (active ? 1 : 0),
            };
        },
        dispose() {
            if (disposed) return;
            if (gl?.isContextLost?.()) {
                poll();
                disposed = true;
                return;
            }
            if (active) {
                gl.endQuery(timer.TIME_ELAPSED_EXT);
                gl.deleteQuery(active.query);
                active = null;
            }
            discardPending();
            disposed = true;
        },
    };
}

function gpuMedianForPhase(samples, phase, beforeFrame, afterFrame) {
    const times = samples
        .filter((sample) => sample.phase === phase && sample.frame > beforeFrame && sample.frame <= afterFrame)
        .map((sample) => sample.ms)
        .sort((a, b) => a - b);
    return times.length ? times[Math.floor(times.length / 2)] : null;
}

async function main() {
    const { chromium } = require('playwright');
    const html = `<!doctype html><html><head><meta charset="utf-8"><script type="importmap">{"imports":{"cocosair":"/build/cocosair.module.js"}}</script></head><body style="margin:0"><canvas id="GameCanvas"></canvas><script type="module">
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Color, Layers, Vec3, Component, director, Director, utils, primitives } from 'cocosair';
const app=await createAirApp({canvas:'#GameCanvas'});const scene=new Scene('w13');const cam=new Node('camera');scene.addChild(cam);cam.setPosition(new Vec3(0,2,8));cam.lookAt(new Vec3(0,0,0));cam.addComponent(Camera).visibility=Layers.Enum.DEFAULT;const lamp=new Node('light');scene.addChild(lamp);lamp.setRotationFromEuler(-45,-30,0);lamp.addComponent(DirectionalLight).illuminance=50000;
const metrics={updates:0,frames:0,drawMs:[]};class Motion extends Component{update(){metrics.updates++;}}
function add(index){const node=new Node('box-'+index);node.layer=Layers.Enum.DEFAULT;scene.addChild(node);node.setPosition(new Vec3((index%5-2)*1.2,Math.floor(index/5)-1,0));const renderer=node.addComponent(MeshRenderer);renderer.mesh=utils.createMesh(primitives.box({width:.5,height:.5,length:.5}));const material=new Material();material.initialize({effectName:'builtin-standard'});material.setProperty('mainColor',new Color(80+index*5,140,210,255));renderer.material=material;node.addComponent(Motion);}
const gl=document.getElementById('GameCanvas').getContext('webgl2');
const gpuTimer=(${createGpuTimerCollector.toString()})(gl);let phase=null;
add(0);let start=0;director.on(Director.EVENT_BEFORE_DRAW,()=>{start=performance.now();gpuTimer.begin(phase,metrics.frames+1)});
director.on(Director.EVENT_AFTER_DRAW,()=>{metrics.frames++;if(start)metrics.drawMs.push(performance.now()-start);gpuTimer.end()});app.run(scene);
function snapshot(){return {updates:metrics.updates,frames:metrics.frames,drawMs:metrics.drawMs.slice(),gpuQueryAvailable:gpuTimer.available}}
window.__w13={snapshot,add,beginPhase:(value)=>{phase=value;return snapshot()},endPhase:()=>{phase=null;return snapshot()},pollGpu:()=>{gpuTimer.poll();return gpuTimer.pendingCount},finishGpu:()=>{gpuTimer.poll();const samples=gpuTimer.snapshot();gpuTimer.dispose();return samples}};
</script></body></html>`;
    const server = http.createServer((req, res) => {
        const pathname = (req.url || '/').split('?')[0];
        if (pathname === '/' || pathname === '/index.html') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
            return;
        }
        if (pathname === '/build/cocosair.module.js') {
            res.writeHead(200, { 'Content-Type': 'text/javascript' });
            fs.createReadStream(bundle).pipe(res);
            return;
        }
        res.writeHead(404);
        res.end();
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    try {
        await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
        await page.waitForFunction(() => !!window.__w13, null, { timeout: 30000 });
        const phases = [];
        const frameWindows = [];
        for (const count of [1, 15]) {
            const before = await page.evaluate((objects) => {
                if (objects === 15) {
                    for (let i = 1; i < 15; i++) window.__w13.add(i);
                }
                return window.__w13.beginPhase(objects);
            }, count);
            const began = Date.now();
            await page.waitForTimeout(1200);
            const after = await page.evaluate(() => window.__w13.endPhase());
            const samples = after.drawMs.slice(before.drawMs.length).sort((a, b) => a - b);
            frameWindows.push({ before: before.frames, after: after.frames });
            phases.push({
                objects: count,
                wallMs: Date.now() - began,
                logicalUpdates: after.updates - before.updates,
                drawEvents: after.frames - before.frames,
                mainThreadDrawIntervalMedianMs: samples.length ? samples[Math.floor(samples.length / 2)] : null,
                gpuCompletionMedianMs: null,
            });
        }
        // Give late GPU results a bounded chance to resolve after both draw
        // windows. They retain their submitted phase/frame, never the poll phase.
        try {
            await page.waitForFunction(() => window.__w13.pollGpu() === 0, null, { timeout: 1000 });
        } catch (error) {
            if (error.name !== 'TimeoutError') throw error;
            // Unresolved queries are not measurements. finishGpu disposes them.
        }
        const gpuSamples = await page.evaluate(() => window.__w13.finishGpu());
        phases.forEach((phase, index) => {
            const window = frameWindows[index];
            phase.gpuCompletionMedianMs = gpuMedianForPhase(gpuSamples, phase.objects, window.before, window.after);
        });
        const gpu = await page.evaluate(() => {
            const canvas = document.getElementById('GameCanvas');
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            return {
                backend: gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl1',
                timerQueryAvailable: !!(
                    gl.getExtension('EXT_disjoint_timer_query_webgl2') || gl.getExtension('EXT_disjoint_timer_query')
                ),
            };
        });
        const evidence = {
            measuredAt: new Date().toISOString(),
            bundle: {
                sha256_16: crypto.createHash('sha256').update(fs.readFileSync(bundle)).digest('hex').slice(0, 16),
            },
            browser: 'chromium-headless',
            axes: {
                logic: { status: 'measured', unit: 'component updates', phases },
                mainThreadDrawInterval: {
                    status: 'measured',
                    unit: 'ms',
                    caveat: 'BEFORE_DRAW to AFTER_DRAW includes renderer work; it is not GPU completion or screen present',
                },
                gpuCompletion: {
                    status: phases.some((phase) => phase.gpuCompletionMedianMs !== null) ? 'measured' : 'unavailable',
                    ...gpu,
                    unit: 'ms',
                    reason: phases.some((phase) => phase.gpuCompletionMedianMs !== null)
                        ? null
                        : gpu.timerQueryAvailable
                          ? 'no resolved timer queries'
                          : 'GPU timer query extension unavailable',
                },
                screenPresent: devicePresentAxis(),
            },
            pageErrors: errors,
            verdict:
                phases.every((phase) => phase.logicalUpdates > 0 && phase.drawEvents > 0) && errors.length === 0
                    ? 'PASS'
                    : 'FAIL',
        };
        fs.writeFileSync(out, JSON.stringify(evidence, null, 2) + '\n');
        console.log(
            `[w13] ${evidence.verdict} logic=${phases.map((phase) => phase.logicalUpdates).join('/')} present=unavailable`,
        );
        if (evidence.verdict !== 'PASS') {
            process.exitCode = 1;
        }
    } finally {
        await browser.close();
        await new Promise((resolve) => server.close(resolve));
    }
}
module.exports = { createGpuTimerCollector, gpuMedianForPhase };
if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
