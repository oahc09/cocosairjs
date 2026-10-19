import * as cc from 'cocosair';
import {
    targets,
    advanceMotion,
    poseError,
    sectionProgress,
    PART_COUNT,
    RANGE_END,
    POSE_TOLERANCE,
    CUES,
    PartPose,
} from './timeline-contract.js';
const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!,
    host = document.querySelector<HTMLElement>('#host')!,
    range = document.querySelector<HTMLInputElement>('#range')!,
    speedInput = document.querySelector<HTMLInputElement>('#speed')!;
const app = await cc.createAirApp({ canvas, screenMode: 'container', container: host }),
    scope = cc.createSessionScope();
scope.activate();
// 浏览器矩阵/规格门禁的 bench 合同：会话探针从 window.__airApp 接入运行时。
(window as unknown as Record<string, unknown>).__airApp = app;
const dom = new AbortController(),
    events: Record<string, unknown>[] = [],
    commands: Record<string, unknown>[] = [],
    parts: cc.Node[] = [],
    cueNodes: cc.Node[] = [],
    owned: (cc.Mesh | cc.Material)[] = [];
const scene = new cc.Scene('interactive-timeline'),
    cameraNode = new cc.Node('camera');
scene.addChild(cameraNode);
cameraNode.setPosition(0, 0, 6);
cameraNode.lookAt(new cc.Vec3());
const camera = cameraNode.addComponent(cc.Camera);
camera.projection = cc.Camera.ProjectionType.ORTHO;
camera.orthoHeight = 2.5;
camera.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new cc.Color(15, 25, 40, 255);
const assembly = new cc.Node('18-teaching-groups'),
    audioGroup = new cc.Node('12-audio-cues');
scene.addChild(assembly);
scene.addChild(audioGroup);
audioGroup.active = false;
function own<T extends cc.Mesh | cc.Material>(a: T): T {
    a.addRef();
    owned.push(a);
    return a;
}
let mesh = own(
    cc.utils.createMesh({
        positions: [-0.11, -0.11, 0, 0.11, -0.11, 0, -0.11, 0.11, 0, 0.11, 0.11, 0],
        indices: [0, 1, 2, 1, 3, 2],
    }),
);
let material = own(new cc.Material());
material.initialize({ effectName: 'builtin-unlit' });
material.setProperty('mainColor', new cc.Color(242, 65, 65, 255));
let green = own(new cc.Material());
green.initialize({ effectName: 'builtin-unlit' });
green.setProperty('mainColor', new cc.Color(45, 235, 95, 255));
function node(parent: cc.Node, name: string, mat: cc.Material): cc.Node {
    const n = new cc.Node(name);
    parent.addChild(n);
    const r = n.addComponent(cc.MeshRenderer);
    r.mesh = mesh;
    r.setSharedMaterial(mat, 0);
    return n;
}
for (let i = 0; i < PART_COUNT; i++) parts.push(node(assembly, `part-group-${i}`, material));
for (let i = 0; i < CUES.length; i++) {
    const n = node(audioGroup, `cue-${i}`, green);
    n.setPosition(((i % 4) - 1.5) * 0.6, (Math.floor(i / 4) - 1) * 0.6, 0);
    n.active = false;
    cueNodes.push(n);
}
let mode = 'assembly',
    stage = 0,
    target = targets(0),
    current = targets(0),
    paused = false,
    speed = 1,
    logicalTime = 0,
    frames = 0,
    sequence = 0,
    submitted = 0,
    submissionTimestamp = '',
    disposed = false;
let retiredRangeContact = false;
let retiredSnapshot: Record<string, unknown> | null = null;
let motionToken = scope.token(),
    dragToken: ReturnType<typeof scope.token> | null = null,
    dragCommits = 0,
    releasePromise: Promise<unknown> | null = null,
    scrollReceipt: Record<string, unknown> = {};
let ctx: AudioContext | null = null,
    buffer: AudioBuffer | null = null,
    source: AudioBufferSourceNode | null = null,
    gain: GainNode | null = null,
    analyser: AnalyserNode | null = null;
let audioReady = false,
    audioPlaying = false,
    audioPaused = false,
    muted = false,
    origin = 0,
    audioTime = 0,
    sourceCreates = 0,
    sourceStops = 0,
    endedCurrent = 0,
    endedStale = 0,
    lastAudioTime = -1;
let audioToken = scope.token(),
    cueRecords: Record<string, unknown>[] = [],
    voiceId = 0,
    lastAudioError = '';
const pendingTimers = new Map<ReturnType<typeof setTimeout>, (value: unknown) => void>();
const startedSources: { id: number; generation: number; offset: number; stopped: boolean; ended?: boolean }[] = [];
const record = (type: string, e?: Event, detail: Record<string, unknown> = {}) =>
    events.push({
        type,
        sequence: ++sequence,
        generation: scope.generation,
        isTrusted: e?.isTrusted ?? false,
        wallTime: new Date().toISOString(),
        ...detail,
    });
function newSession(reason: string): void {
    if (dragToken) retiredRangeContact = true;
    scope.deactivate(reason);
    scope.activate();
    motionToken = scope.token();
    dragToken = null;
    record('session', undefined, { reason });
}
function readPoses(): PartPose[] {
    return parts.map((n) => ({
        position: [n.position.x, n.position.y, n.position.z],
        scale: [n.scale.x, n.scale.y, n.scale.z],
    }));
}
function applyPoses(p: readonly PartPose[]): void {
    p.forEach((v, i) => {
        parts[i].setPosition(...v.position);
        parts[i].setScale(...v.scale);
    });
}
applyPoses(current);
function stopVoice(): void {
    if (source) {
        const id = voiceId;
        source.onended = null;
        try {
            source.stop();
        } catch (error) {
            lastAudioError = String(error);
        }
        source.disconnect();
        source = null;
        sourceStops++;
        const v = startedSources.find((x) => x.id === id);
        if (v) v.stopped = true;
    }
    audioPlaying = false;
}
function choose(next: number, e?: Event): void {
    if (disposed) throw Error('TIMELINE_DISPOSED');
    newSession('target');
    stage = next;
    target = targets(next);
    record('target', e, { stage });
}
function setMode(next: string, e?: Event): void {
    stopVoice();
    newSession('mode');
    mode = next;
    assembly.active = next === 'assembly';
    audioGroup.active = next === 'audio';
    record('mode', e, { mode });
}
function reset(e?: Event): void {
    paused = false;
    audioPaused = false;
    stopVoice();
    newSession('reset');
    stage = 0;
    target = targets(0);
    current = targets(0);
    applyPoses(current);
    cameraNode.setPosition(0, 0, 6);
    camera.orthoHeight = 2.5;
    logicalTime = 0;
    range.value = '0';
    audioTime = 0;
    lastAudioTime = -1;
    cueRecords = [];
    cueNodes.forEach((n) => (n.active = false));
    record('reset', e);
}
function seek(value: number, e?: Event): void {
    if (disposed) throw Error('TIMELINE_DISPOSED');
    newSession('seek');
    const time = Math.max(0, Math.min(RANGE_END, value));
    logicalTime = time;
    range.value = String(Math.round(time));
    target = targets(time >= RANGE_END ? 2 : time > RANGE_END / 2 ? 1 : 0);
    stage = time >= RANGE_END ? 2 : time > RANGE_END / 2 ? 1 : 0;
    current = targets(stage);
    applyPoses(current);
    cameraNode.setPosition(0, 0, 6 + stage);
    camera.orthoHeight = 2.5 + stage * 0.25;
    if (mode === 'audio') {
        const remainPaused = audioPaused;
        stopVoice();
        audioTime = Math.min(buffer?.duration ?? 16.2, (time / RANGE_END) * 16.2);
        lastAudioTime = audioTime;
        cueNodes.forEach((n, i) => (n.active = CUES[i] <= audioTime));
        cueRecords = [];
        startVoice(audioTime, remainPaused);
    }
    record('seek', e, { time });
}
function startVoice(offset = 0, remainPaused = false): void {
    if (disposed) throw Error('TIMELINE_DISPOSED');
    if (!ctx || !buffer || !gain || !analyser) {
        record('audio-not-ready');
        return;
    }
    stopVoice();
    newSession('audio-source');
    audioToken = scope.token();
    const active = ctx,
        voice = active.createBufferSource();
    voice.buffer = buffer;
    voice.connect(gain);
    source = voice;
    origin = active.currentTime - offset;
    audioTime = offset;
    lastAudioTime = offset;
    audioPaused = remainPaused;
    paused = remainPaused;
    audioPlaying = true;
    voiceId++;
    sourceCreates++;
    startedSources.push({ id: voiceId, generation: scope.generation, offset, stopped: false });
    const token = audioToken;
    voice.onended = () => {
        voice.disconnect();
        const item = startedSources.find((x) => x.id === voiceId);
        if (token.isCurrent()) {
            endedCurrent++;
            audioPlaying = false;
            if (source === voice) source = null;
            if (item) item.ended = true;
        } else endedStale++;
    };
    // Both calls are made inside the original trusted click stack; no await before resume/start.
    void (remainPaused ? active.suspend() : active.resume()).catch((error) => {
        lastAudioError = String(error);
    });
    voice.start(0, Math.min(offset, buffer.duration - 0.001));
}
function advanceScene(dt: number): void {
    if (disposed) return;
    frames++;
    if (mode === 'assembly' && !paused && motionToken.isCurrent()) {
        logicalTime = Math.min(RANGE_END, logicalTime + Math.min(dt, 0.1) * speed);
        current = advanceMotion(readPoses(), target, dt * speed);
        applyPoses(current);
        const blend = 1 - Math.exp(-18 * Math.min(dt * speed, 0.1));
        cameraNode.setPosition(0, 0, cameraNode.position.z + (6 + stage - cameraNode.position.z) * blend);
        camera.orthoHeight += (2.5 + stage * 0.25 - camera.orthoHeight) * blend;
    }
    if (mode === 'audio' && ctx && audioPlaying && !audioPaused && audioToken.isCurrent()) {
        // Audio time can advance between getter reads, even within this JS frame.
        const contextTime = ctx.currentTime;
        audioTime = Math.min(buffer?.duration ?? 16.2, Math.max(0, contextTime - origin));
        for (let i = 0; i < CUES.length; i++)
            if (CUES[i] > lastAudioTime && CUES[i] <= audioTime) {
                cueNodes[i].active = true;
                cueRecords.push({
                    cueId: i,
                    targetAudioTime: CUES[i],
                    nodeActivationTime: audioTime,
                    contextTime,
                    origin,
                    generation: scope.generation,
                    frame: cc.director.getTotalFrames(),
                    wallTime: new Date().toISOString(),
                });
            }
        lastAudioTime = audioTime;
    }
    const error = Math.max(
        poseError(readPoses(), target),
        Math.abs(cameraNode.position.z - (6 + stage)),
        Math.abs(camera.orthoHeight - (2.5 + stage * 0.25)),
    );
    document.querySelector('#state')!.textContent =
        `${mode} · generation ${scope.generation} · target ${stage} · ${paused ? 'paused' : error <= POSE_TOLERANCE ? 'converged' : 'moving'} · error ${error.toFixed(5)} · time ${logicalTime.toFixed(2)}`;
    document.querySelector('#audio-state')!.textContent =
        `新音轨16.2s · audio ${audioTime.toFixed(3)} · ${ctx?.state ?? 'not-ready'} · sources ${sourceCreates} · mute ${muted}`;
}
function afterDraw(): void {
    submitted = sequence;
    submissionTimestamp = new Date().toISOString();
}
class TimelineDriver extends cc.Component {
    update(dt: number): void {
        advanceScene(dt);
    }
}
const driverNode = new cc.Node('timeline-driver');
scene.addChild(driverNode);
driverNode.addComponent(TimelineDriver);
const deterministic = new URLSearchParams(location.search).get('test') === '1',
    stepClock = deterministic ? cc.createStepClock() : null;
cc.director.on(cc.Director.EVENT_AFTER_DRAW, afterDraw);
await app.run(scene);
// §25 Lifecycle Contract（资源粒度、惰性）：仅 __lifecycle() 调用时才执行一轮
// 共享 quad mesh 与红/绿两份材质的 真实释放 → 泄漏核对 → 重建并重新绑定全部部件/提示节点。
// 终态 release()（TIMELINE_DISPOSED/app.close 语义）与音频/会话生命周期不受影响。
{
    const { installAssetLifecycle } = await import('../../shared/asset-lifecycle.js');
    const renderers = (): cc.MeshRenderer[] =>
        [...parts, ...cueNodes]
            .map((node) => node.getComponent(cc.MeshRenderer))
            .filter((r): r is cc.MeshRenderer => r !== null);
    const heldList = () => [
        { name: 'timeline-mesh', ref: mesh },
        { name: 'timeline-material', ref: material },
        { name: 'timeline-green', ref: green },
    ];
    installAssetLifecycle({
        label: 'interactive-timeline',
        hold: () => (disposed ? [] : heldList()),
        release: () => {
            const retiredMesh = mesh,
                retiredMaterial = material,
                retiredGreen = green;
            for (const renderer of renderers()) {
                renderer.mesh = null;
                renderer.setSharedMaterial(null, 0);
            }
            mesh = null!;
            material = null!;
            green = null!;
            for (const asset of [retiredMesh, retiredMaterial, retiredGreen]) {
                asset.decRef();
                asset.destroy();
            }
        },
        reacquire: async () => {
            mesh = own(
                cc.utils.createMesh({
                    positions: [-0.11, -0.11, 0, 0.11, -0.11, 0, -0.11, 0.11, 0, 0.11, 0.11, 0],
                    indices: [0, 1, 2, 1, 3, 2],
                }),
            );
            material = own(new cc.Material());
            material.initialize({ effectName: 'builtin-unlit' });
            material.setProperty('mainColor', new cc.Color(242, 65, 65, 255));
            green = own(new cc.Material());
            green.initialize({ effectName: 'builtin-unlit' });
            green.setProperty('mainColor', new cc.Color(45, 235, 95, 255));
            for (const renderer of renderers()) {
                renderer.mesh = mesh;
                renderer.setSharedMaterial(
                    cueNodes.some((n) => n.getComponent(cc.MeshRenderer) === renderer) ? green : material,
                    0,
                );
            }
            return heldList();
        },
    });
}
if (stepClock) {
    stepClock.begin();
    await stepClock.step(0);
}
for (const [id, fn] of [
    ['assembly', (e: Event) => setMode('assembly', e)],
    ['audio-mode', (e: Event) => setMode('audio', e)],
    ['target0', (e: Event) => choose(0, e)],
    ['target1', (e: Event) => choose(1, e)],
    ['target2', (e: Event) => choose(2, e)],
    [
        'pause',
        (e: Event) => {
            paused = true;
            audioPaused = true;
            void ctx?.suspend();
            record('pause', e);
        },
    ],
    [
        'resume',
        (e: Event) => {
            paused = false;
            audioPaused = false;
            void ctx?.resume();
            record('resume', e);
        },
    ],
    ['reset', (e: Event) => reset(e)],
    ['back', (e: Event) => choose(Math.max(0, stage - 1), e)],
    [
        'replay',
        (e: Event) => {
            reset(e);
            if (mode === 'audio') startVoice(0);
            else choose(1, e);
            record('replay', e);
        },
    ],
    [
        'play',
        (e: Event) => {
            setMode('audio', e);
            cueRecords = [];
            cueNodes.forEach((n) => (n.active = false));
            startVoice(0);
            record('play', e);
        },
    ],
    [
        'mute',
        (e: Event) => {
            muted = !muted;
            if (gain) gain.gain.value = muted ? 0 : 0.5;
            record('mute', e, { muted });
        },
    ],
] as [string, (e: Event) => void][])
    document.querySelector('#' + id)!.addEventListener('click', fn, { signal: dom.signal });
range.addEventListener(
    'pointerdown',
    () => {
        retiredRangeContact = false;
        dragToken = scope.token();
    },
    { signal: dom.signal },
);
range.addEventListener(
    'pointerup',
    (e) => {
        const accepted = !!dragToken?.isCurrent();
        if (accepted) {
            dragCommits++;
            retiredRangeContact = false;
        }
        dragToken = null;
        record('range-release', e, { accepted });
    },
    { signal: dom.signal },
);
range.addEventListener('keydown', () => (retiredRangeContact = false), { signal: dom.signal });
range.addEventListener(
    'input',
    (e) => {
        if (retiredRangeContact) {
            range.value = String(Math.round(logicalTime));
            record('stale-range-input', e);
            return;
        }
        const held = !!dragToken?.isCurrent();
        seek(Number(range.value), e);
        if (held) {
            dragToken = scope.token();
            retiredRangeContact = false;
        }
    },
    { signal: dom.signal },
);
speedInput.addEventListener(
    'input',
    (e) => {
        speed = Number(speedInput.value);
        material.setProperty(
            'mainColor',
            speed >= 2 ? new cc.Color(235, 175, 40, 255) : new cc.Color(242, 65, 65, 255),
        );
        record('speed', e, { speed });
    },
    { signal: dom.signal },
);
window.addEventListener(
    'resize',
    (e) => {
        newSession('resize');
        record('resize', e);
    },
    { signal: dom.signal },
);
function onScroll(e: Event): void {
    const offsets = Array.from(
            document.querySelectorAll<HTMLElement>('section'),
            (s) => s.getBoundingClientRect().top + scrollY,
        ),
        r = sectionProgress(scrollY, innerHeight, document.documentElement.scrollHeight, offsets);
    scrollReceipt = {
        ...r,
        offsets,
        scrollY,
        viewportHeight: innerHeight,
        documentHeight: document.documentElement.scrollHeight,
    };
    if (document.querySelector<HTMLInputElement>('#scroll-mode')!.checked) seek(r.progress * RANGE_END);
    record('scroll', e, scrollReceipt);
}
window.addEventListener('scroll', onScroll, { signal: dom.signal, passive: true });
async function loadAudio(): Promise<void> {
    try {
        const AudioConstructor =
            globalThis.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioConstructor) throw Error('WEB_AUDIO_UNAVAILABLE');
        ctx = new AudioConstructor();
        gain = ctx.createGain();
        gain.gain.value = 0.5;
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        gain.connect(analyser);
        analyser.connect(ctx.destination);
        const response = await fetch(new URL('../assets/original-16s.wav', import.meta.url));
        if (!response.ok) throw Error('AUDIO_HTTP_' + response.status);
        buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        if (disposed) {
            await ctx.close();
            return;
        }
        audioReady = true;
        document.querySelector<HTMLButtonElement>('#play')!.disabled = false;
        record('audio-ready', undefined, { duration: buffer.duration });
    } catch (error) {
        lastAudioError = String(error);
    }
}
const audioLoad = deterministic ? Promise.resolve() : loadAudio();
function snapshot(): Record<string, unknown> {
    if (disposed && retiredSnapshot) {
        const saved = JSON.parse(JSON.stringify(retiredSnapshot));
        return {
            ...saved,
            capturedBeforeDisposal: true,
            disposed,
            frames,
            sequence,
            submitted,
            ownedRefs: owned.map((a) => a.refCount),
            audio: {
                ...saved.audio,
                state: ctx?.state,
                sourceCreates,
                sourceStops,
                startedSources: startedSources.map((v) => ({ ...v })),
            },
        };
    }
    const data = new Float32Array(analyser?.fftSize ?? 0);
    if (analyser) analyser.getFloatTimeDomainData(data);
    const rms = data.length ? Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length) : null,
        r = canvas.getBoundingClientRect();
    return {
        mode,
        stage,
        clock: {
            method: deterministic ? 'STEP_CLOCK' : 'NATIVE_PACER',
            stepped: stepClock?.stepped ?? null,
            stepping: stepClock?.stepping ?? false,
        },
        generation: scope.generation,
        status:
            Math.max(
                poseError(readPoses(), target),
                Math.abs(cameraNode.position.z - (6 + stage)),
                Math.abs(camera.orthoHeight - (2.5 + stage * 0.25)),
            ) <= POSE_TOLERANCE
                ? 'converged'
                : 'moving',
        target: target.map((p) => ({ ...p })),
        poses: readPoses(),
        camera: { z: cameraNode.position.z, orthoHeight: camera.orthoHeight },
        paused,
        speed,
        logicalTime,
        rangeValue: Number(range.value),
        dragCommits,
        frames,
        sequence,
        submitted,
        submissionTimestamp,
        materialColor: (() => {
            const c = material.getProperty('mainColor') as cc.Color;
            return { r: c.r, g: c.g, b: c.b, a: c.a };
        })(),
        events: events.map((e) => ({ ...e })),
        scroll: scrollReceipt,
        disposed,
        audio: {
            ready: audioReady,
            time: audioTime,
            currentTime: ctx?.currentTime ?? null,
            origin,
            state: ctx?.state ?? null,
            duration: buffer?.duration ?? null,
            playing: audioPlaying,
            paused: audioPaused,
            muted,
            sourceCreates,
            sourceStops,
            startedSources: startedSources.map((v) => ({ ...v })),
            endedCurrent,
            endedStale,
            error: lastAudioError,
            cues: cueRecords.map((r) => ({ ...r })),
            activeNodes: cueNodes.map((n) => n.active),
            nodePositions: cueNodes.map((n) => ({ x: n.position.x, y: n.position.y, z: n.position.z })),
            rms,
            tap: 'post-gain AnalyserNode before destination',
            recordingSupported: typeof MediaRecorder !== 'undefined',
        },
        layout: {
            rect: { left: r.left, top: r.top, width: r.width, height: r.height },
            backing: { width: canvas.width, height: canvas.height },
            dpr: devicePixelRatio,
        },
        ownedRefs: owned.map((a) => a.refCount),
    };
}
function release(): Promise<unknown> {
    if (releasePromise) return releasePromise;
    retiredSnapshot = snapshot();
    disposed = true;
    dom.abort();
    newSession('release');
    for (const [id, resolve] of pendingTimers) {
        clearTimeout(id);
        resolve({ accepted: false, reason: 'release', current: scope.generation });
    }
    pendingTimers.clear();
    stopVoice();
    cc.director.off(cc.Director.EVENT_AFTER_DRAW, afterDraw);
    document
        .querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input')
        .forEach((el) => (el.disabled = true));
    releasePromise = (async () => {
        await Promise.allSettled([audioLoad]);
        if (ctx?.state !== 'closed') await ctx?.close();
        gain?.disconnect();
        analyser?.disconnect();
        driverNode.removeFromParent();
        driverNode.destroy();
        for (const n of [...parts, ...cueNodes]) {
            const renderer = n.getComponent(cc.MeshRenderer)!;
            renderer.mesh = null;
            renderer.setSharedMaterial(null, 0);
            n.removeFromParent();
            n.destroy();
        }
        const refs = owned.map((a) => {
            const before = a.refCount;
            a.decRef();
            return { before, after: a.refCount };
        });
        const scopeReceipt = await scope.dispose();
        await app.close?.();
        return { refs, scopeReceipt, domAborted: dom.signal.aborted, audioContextState: ctx?.state };
    })();
    return releasePromise;
}
document.querySelector('#release')!.addEventListener('click', () => void release(), { signal: dom.signal });
window.addEventListener('pagehide', () => void release(), { signal: dom.signal });
(window as unknown as Record<string, unknown>).__timeline = {
    snapshot,
    release,
    step: (dt: number) => {
        if (disposed) throw Error('TIMELINE_DISPOSED');
        if (!stepClock) throw Error('SINGLE_CLOCK_TEST_MODE_REQUIRED');
        return stepClock.step(dt);
    },
    lateTarget: (next: number, delay: number) => {
        const token = scope.token();
        return new Promise((resolve) => {
            const id = setTimeout(() => {
                pendingTimers.delete(id);
                const accepted = token.isCurrent() && !disposed;
                if (accepted) choose(next);
                commands.push({ token: token.generation, accepted, current: scope.generation });
                resolve({ accepted, current: scope.generation, token: token.generation });
            }, delay);
            pendingTimers.set(id, resolve);
        });
    },
};
