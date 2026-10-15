import {
    createAirApp,
    Scene,
    Node,
    Component,
    AudioSource,
    AudioClip,
    assetManager,
    isValid,
} from '/build/cocosair.module.js';

const records = [],
    sources = [],
    nodes = [],
    clips = [];
let app,
    scene,
    source,
    frames = 0,
    ready = false,
    fault = null,
    epoch = 0,
    disposed = false,
    currentClip = 'a';
const row = (type, data = {}) => records.push({ type, at: performance.now(), epoch, ...data });
function state() {
    return {
        ready,
        frames,
        fault,
        epoch,
        disposed,
        currentClip,
        source:
            source && isValid(source, true)
                ? { state: source.state, time: source.currentTime, playing: source.playing }
                : null,
        sources: sources.map((s) => ({ valid: isValid(s), strict: isValid(s, true) })),
        nodes: nodes.map((n) => ({ valid: isValid(n), strict: isValid(n, true) })),
        clips: clips.map((c) => ({ valid: isValid(c), strict: isValid(c, true) })),
        records,
    };
}
function draw() {
    document.querySelector('#status').textContent = JSON.stringify(
        { ready, frames, epoch, currentClip, disposed, fault },
        null,
        2,
    );
}
function sourceReady(s) {
    return Promise.race([
        s.getSampleRate(),
        new Promise((_, reject) => setTimeout(() => reject(Error('source readiness exceeded 6s')), 6000)),
    ]);
}
async function makeSource() {
    const node = new Node('native audio source ' + sources.length);
    const s = node.addComponent(AudioSource);
    s.playOnAwake = false;
    s.volume = 0.25;
    s.clip = clips[0];
    scene.addChild(node);
    sources.push(s);
    nodes.push(node);
    node.on(AudioSource.EventType.STARTED, () =>
        row('STARTED', { sourceIndex: sources.indexOf(s), state: s.state, time: s.currentTime }),
    );
    node.on(AudioSource.EventType.ENDED, () =>
        row('ENDED', { sourceIndex: sources.indexOf(s), state: s.state, time: s.currentTime }),
    );
    await sourceReady(s);
    return s;
}
const actions = {
    play() {
        ++epoch;
        row('play-request');
        source.play();
    },
    stop() {
        const requestedEpoch = epoch;
        row('stop-request');
        // Explicit candidate integration: retain matching epoch and 250 ms bound.
        const started = performance.now();
        source.stopAsync().then(
            () =>
                row('stop-complete', {
                    requestedEpoch,
                    matchingEpoch: epoch === requestedEpoch,
                    elapsed: performance.now() - started,
                    state: source.state,
                    time: source.currentTime,
                    playing: source.playing,
                }),
            (error) => {
                fault = String(error);
                row('stop-rejected', { error: fault });
            },
        );
    },
    pause() {
        row('pause-request');
        source.pause();
    },
    async aba() {
        ++epoch;
        row('clip-replace-request');
        ready = false;
        source.clip = clips[1];
        source.clip = clips[0];
        await sourceReady(source);
        currentClip = 'a';
        ready = true;
        row('clip-replace-ready');
    },
    async clipB() {
        ++epoch;
        row('clip-replace-request');
        ready = false;
        source.clip = clips[1];
        await sourceReady(source);
        currentClip = 'b';
        ready = true;
        row('clip-replace-ready');
    },
    destroy() {
        ++epoch;
        row('destroy-request');
        source.node.destroy();
    },
    async fresh() {
        ready = false;
        source = await makeSource();
        currentClip = 'a';
        ready = true;
        row('fresh-ready');
    },
    async release() {
        ++epoch;
        row('release-request');
        await app.releaseScene();
        disposed = true;
        ready = false;
        row('release-complete');
    },
    gesture() {
        row('extra-gesture');
    },
};
for (const [name, action] of Object.entries(actions)) {
    const button = document.createElement('button');
    button.id = name;
    button.textContent = name;
    button.addEventListener('click', () => {
        try {
            Promise.resolve(action()).then(draw, (error) => {
                fault = String(error);
                row('failure', { fault });
                draw();
            });
        } catch (error) {
            fault = String(error);
            row('failure', { fault });
            draw();
        }
    });
    document.querySelector('#buttons').appendChild(button);
}
window.__audioQA = { snapshot: state, programmaticPlay: () => actions.play() };
try {
    app = await createAirApp({
        canvas: '#GameCanvas',
        screenMode: 'container',
        container: '#host',
        pixelRatioCap: 1,
        diagnostics: 'warnings',
    });
    scene = new Scene('Audio cancellation regression');
    class FrameCounter extends Component {
        update() {
            frames++;
        }
    }
    const node = new Node('frame counter');
    node.addComponent(FrameCounter);
    scene.addChild(node);
    app.run(scene);
    for (const name of ['a', 'b']) {
        const clip = await new Promise((resolve, reject) =>
            assetManager.loadRemote(
                '/qa-' + name + '.wav',
                {
                    ext: '.wav',
                    audioLoadMode: AudioClip.AudioType.DOM_AUDIO,
                },
                (error, value) =>
                    error
                        ? reject(error)
                        : value instanceof AudioClip
                          ? resolve(value)
                          : reject(Error('AudioClip expected')),
            ),
        );
        clips.push(clip);
        app.session.own(() => assetManager.releaseAsset(clip), 'test clip ' + name);
    }
    source = await makeSource();
    ready = true;
    row('ready');
    draw();
} catch (error) {
    fault = String(error);
    row('startup-failure', { fault });
    draw();
}
