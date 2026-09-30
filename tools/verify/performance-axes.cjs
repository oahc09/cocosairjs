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

async function main() {
    const { chromium } = require('playwright');
    const html = `<!doctype html><html><head><meta charset="utf-8"><script type="importmap">{"imports":{"cocosair":"/build/cocosair.module.js"}}</script></head><body style="margin:0"><canvas id="GameCanvas"></canvas><script type="module">
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Color, Layers, Vec3, Component, director, Director, utils, primitives } from 'cocosair';
const app=await createAirApp({canvas:'#GameCanvas'});const scene=new Scene('w13');const cam=new Node('camera');scene.addChild(cam);cam.setPosition(new Vec3(0,2,8));cam.lookAt(new Vec3(0,0,0));cam.addComponent(Camera).visibility=Layers.Enum.DEFAULT;const lamp=new Node('light');scene.addChild(lamp);lamp.setRotationFromEuler(-45,-30,0);lamp.addComponent(DirectionalLight).illuminance=50000;
const metrics={updates:0,frames:0,drawMs:[],gpuMs:[]};class Motion extends Component{update(){metrics.updates++;}}
function add(index){const node=new Node('box-'+index);node.layer=Layers.Enum.DEFAULT;scene.addChild(node);node.setPosition(new Vec3((index%5-2)*1.2,Math.floor(index/5)-1,0));const renderer=node.addComponent(MeshRenderer);renderer.mesh=utils.createMesh(primitives.box({width:.5,height:.5,length:.5}));const material=new Material();material.initialize({effectName:'builtin-standard'});material.setProperty('mainColor',new Color(80+index*5,140,210,255));renderer.material=material;node.addComponent(Motion);}
const gl=document.getElementById('GameCanvas').getContext('webgl2');
const timer=gl?.getExtension('EXT_disjoint_timer_query_webgl2');const pending=[];let activeQuery=null;
add(0);let start=0;director.on(Director.EVENT_BEFORE_DRAW,()=>{start=performance.now();if(timer&&!activeQuery){activeQuery=gl.createQuery();gl.beginQuery(timer.TIME_ELAPSED_EXT,activeQuery)}});
director.on(Director.EVENT_AFTER_DRAW,()=>{metrics.frames++;if(start)metrics.drawMs.push(performance.now()-start);if(activeQuery){gl.endQuery(timer.TIME_ELAPSED_EXT);pending.push(activeQuery);activeQuery=null}for(let i=pending.length-1;i>=0;i--){const q=pending[i];if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)&&!gl.getParameter(timer.GPU_DISJOINT_EXT)){metrics.gpuMs.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);pending.splice(i,1)}}});app.run(scene);
window.__w13={snapshot:()=>({updates:metrics.updates,frames:metrics.frames,drawMs:metrics.drawMs.slice(),gpuMs:metrics.gpuMs.slice(),gpuQueryAvailable:!!timer}),add};
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
        for (const count of [1, 15]) {
            if (count === 15) {
                await page.evaluate(() => {
                    for (let i = 1; i < 15; i++) window.__w13.add(i);
                });
            }
            const before = await page.evaluate(() => window.__w13.snapshot());
            const began = Date.now();
            await page.waitForTimeout(1200);
            const after = await page.evaluate(() => window.__w13.snapshot());
            const samples = after.drawMs.slice(before.drawMs.length).sort((a, b) => a - b);
            const gpuSamples = after.gpuMs.slice(before.gpuMs.length).sort((a, b) => a - b);
            phases.push({
                objects: count,
                wallMs: Date.now() - began,
                logicalUpdates: after.updates - before.updates,
                drawEvents: after.frames - before.frames,
                mainThreadDrawIntervalMedianMs: samples.length ? samples[Math.floor(samples.length / 2)] : null,
                gpuCompletionMedianMs: gpuSamples.length ? gpuSamples[Math.floor(gpuSamples.length / 2)] : null,
            });
        }
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
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
