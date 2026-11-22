// Standalone opt-in event correctness check; not the 200-actor timing/pose-count experiment.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const assert = require('node:assert/strict');
const hash = (bytes) => require('node:crypto').createHash('sha256').update(bytes).digest('hex');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { verifySourceBinding } = require('../build/source-binding.cjs');
const [engine, out, input, ...extra] = process.argv.slice(2);
assert(
    ['chromium', 'firefox', 'webkit'].includes(engine) && out && input && !extra.length,
    'usage: <chromium|firefox|webkit> <new.json> <workspace ESM bundle>',
);
const bundlePath = fs.realpathSync(path.resolve(root, input));
assert(
    bundlePath.startsWith(fs.realpathSync(root) + path.sep) && bundlePath.endsWith('.js'),
    'Candidate must be a workspace .js bundle',
);
const bundleName = path.relative(root, bundlePath).split(path.sep).join('/');
const bind = verifySourceBinding(root, bundlePath);
assert(bind.matches && bind.origin === 'compiler-map');
const sha = hash(fs.readFileSync(bundlePath));
const fixture = 'test/fixtures/upstream-skinning/rig.gltf';
const fixtureSha = hash(fs.readFileSync(path.join(root, fixture)));
(async () => {
    const server = await startExampleServer(root);
    let browser;
    try {
        browser = await require('playwright')[engine].launch({
            headless: true,
            ...launchOptions(engine),
            env: loopbackBrowserEnv(),
        });
        const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        const shell = server.origin + '/test/fixtures/crowd-pose/';
        await page.route(shell, (route) =>
            route.fulfill({
                contentType: 'text/html',
                body: '<!doctype html><link rel="icon" href="data:,"><canvas id="GameCanvas" width="320" height="240"></canvas>',
            }),
        );
        await page.goto(shell);
        const url = server.origin + '/' + bundleName.split('/').map(encodeURIComponent).join('/');
        const pending = page.waitForResponse(url);
        const fixturePending = page.waitForResponse(server.origin + '/' + fixture);
        const experimental = page.evaluate(
            async ({ url, fixture }) => {
                const A = await import(url);
                const {
                    Animation,
                    AnimationClip,
                    Component,
                    Camera,
                    Color,
                    createAirApp,
                    createStepClock,
                    GLTFLoader,
                    Node,
                    Scene,
                    _decorator,
                } = A;
                const app = await createAirApp({ canvas: '#GameCanvas', renderer: 'webgl2', pixelRatioCap: 1 });
                const gl = app.canvas.getContext('webgl2');
                if (!gl) throw Error('No WebGL2');
                const scene = new Scene('Scheduled marker correctness check only');
                const camNode = new Node('Camera');
                scene.addChild(camNode);
                camNode.setPosition(0, 0, 10);
                const cam = camNode.addComponent(Camera);
                cam.projection = Camera.ProjectionType.ORTHO;
                cam.orthoHeight = 3;
                cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
                cam.clearColor = new Color(0, 0, 0, 255);
                const fetched = await fetch('/' + fixture);
                if (!fetched.ok) throw Error('Authored rig missing');
                const model = await fetched.json();
                model.meshes[0].primitives = [model.meshes[0].primitives[0]];
                const asset = await new GLTFLoader().parseAsync(JSON.stringify(model));
                class Mark extends Component {
                    trace = [];
                    step = 0;
                    onCrowdMarker(label) {
                        this.trace.push({ step: this.step, label });
                    }
                }
                _decorator.ccclass('CrowdCorrectnessMarker')(Mark);
                const plans = ['native', 'event-guard', 'skip-all'];
                const lanes = plans.map((name) => {
                    const actor = asset.instantiate();
                    scene.addChild(actor.root);
                    const marker = actor.root.addComponent(Mark),
                        control = actor.root.getComponent(Animation);
                    const authored = actor.animations.find((v) => v.name === 'move');
                    const clip = new AnimationClip();
                    clip.name = name;
                    clip.duration = authored.duration;
                    clip.wrapMode = AnimationClip.WrapMode.Loop;
                    for (const track of authored.tracks) clip.addTrack(track);
                    // Interior, non-grid markers distinguish exact crossing from delayed or duplicate delivery.
                    clip.events = [
                        { frame: (clip.duration * 5) / 16, func: 'onCrowdMarker', params: ['first'] },
                        { frame: (clip.duration * 11) / 16, func: 'onCrowdMarker', params: ['second'] },
                    ];
                    const state = control.createState(clip);
                    return { name, state, actor, marker, clip, control };
                });
                app.run(scene);
                const clock = createStepClock();
                clock.begin();
                try {
                    // No partial pose sampling is performed for the guarded event-bearing clip.
                    for (const lane of lanes) {
                        if (lane.name === 'native' || (lane.name === 'event-guard' && lane.clip.events.length > 0))
                            lane.control.play(lane.clip.name);
                    }
                    const duration = lanes[0].clip.duration,
                        dt = duration / 8,
                        steps = 24;
                    for (let step = 0; step <= steps; step++) {
                        const visible = step % 8 === 0 || step % 8 === 2 || step % 8 === 6;
                        for (const lane of lanes) {
                            lane.marker.step = step;
                            lane.actor.root.setPosition(lane.name === 'native' || visible ? 0 : 30, 0, 0);
                            if (lane.name === 'skip-all' && visible) {
                                lane.state.time = step * dt;
                                lane.state.sample();
                            }
                        }
                        await clock.step(step === 0 ? 0 : dt);
                    }
                    return {
                        duration,
                        dt,
                        steps,
                        webgl: gl.getParameter(gl.VERSION),
                        glError: gl.getError(),
                        traces: lanes.map(({ name, marker, state }) => ({
                            name,
                            time: state.time,
                            trace: marker.trace,
                        })),
                    };
                } finally {
                    for (const lane of lanes) {
                        lane.state.stop();
                        lane.actor.dispose();
                        lane.clip.destroy();
                    }
                    asset.destroy();
                    clock.end();
                    await app.close();
                }
            },
            { url, fixture },
        );
        const [response, rig, result] = await Promise.all([pending, fixturePending, experimental]);
        assert(response.ok());
        assert.equal(hash(await response.body()), sha);
        assert(rig.ok());
        assert.equal(hash(await rig.body()), fixtureSha);
        assert.equal(hash(fs.readFileSync(path.join(root, fixture))), fixtureSha);
        assert.deepEqual(verifySourceBinding(root, bundlePath), bind);
        const exact = [3, 6, 11, 14, 19, 22].map((step, i) => ({ step, label: i % 2 ? 'second' : 'first' }));
        const delayed = [6, 6, 14, 14, 22, 22].map((step, i) => ({ step, label: i % 2 ? 'second' : 'first' }));
        const checks = {
            native: JSON.stringify(result.traces[0].trace) === JSON.stringify(exact),
            guard: JSON.stringify(result.traces[1].trace) === JSON.stringify(exact),
            negative: JSON.stringify(result.traces[2].trace) === JSON.stringify(delayed),
            pageErrorFree: !errors.length,
            glErrorFree: result.glError === 0,
        };
        const pass = Object.values(checks).every(Boolean);
        const report = {
            status: pass ? 'PASS' : 'FAIL',
            checks,
            expected: exact,
            browser: browser.version(),
            engine,
            tree: require('node:child_process')
                .execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8', cwd: root })
                .trim(),
            bundle: { path: bundleName, sha, bind },
            fixtureSha,
            scope: 'Forward looping, full native playback for event-bearing clips; not proof of event-safe pose throttling, shadows or performance.',
            scriptSha: hash(fs.readFileSync(__filename)),
            errors,
            ...result,
        };
        fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.log(JSON.stringify(report, null, 2));
        if (!pass) process.exitCode = 1;
    } finally {
        try {
            if (browser) await browser.close();
        } finally {
            await server.close();
        }
    }
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
