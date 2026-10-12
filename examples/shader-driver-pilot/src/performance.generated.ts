// Native instrumentation adapted from frozen E05; no rendering outside AIR.
export function makePerformance(context: any) {
    const { director, Director, game, gl, device, canvas, memory, snapshot, ensure } = context;
    const perf = {
        active: false,
        frames: [] as any[],
        updateCalls: [] as { frame: number; ms: number }[],
        commands: [] as any[],
        draws: [] as any[],
        queue: [] as any[],
        queries: [] as { query: WebGLQuery; frame: number }[],
        gpu: [] as { frame: number; ms: number }[],
        queryEvents: [] as any[],
        queryFrame: 0,
        startedAtMs: 0,
        readPixelsDuringWindow: 0,
        fixedStart: null as any,
        restorers: [] as (() => void)[],
        last: 0,
        begin: 0,
        currentQuery: null as WebGLQuery | null,
        extension: null as any,
    };
    function startPerformance() {
        ensure();
        if (perf.active) throw new Error('PERF_ACTIVE');
        context.prepare();
        perf.active = true;
        perf.startedAtMs = performance.now();
        perf.readPixelsDuringWindow = 0;
        perf.last = 0;
        perf.frames = [];
        perf.updateCalls = [];
        perf.commands = [];
        perf.draws = [];
        perf.queue = [];
        perf.gpu = [];
        perf.queryEvents = [];
        perf.extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        function wrap(object: any, key: string, array: any[]) {
            const original = object[key];
            object[key] = function (...args: any[]) {
                const t = performance.now();
                try {
                    return original.apply(this, args);
                } finally {
                    array.push({ frame: director.getTotalFrames(), operation: key, ms: performance.now() - t });
                }
            };
            perf.restorers.push(() => (object[key] = original));
        }
        const command = device.commandBuffer as any;
        for (const key of [
            'begin',
            'end',
            'beginRenderPass',
            'endRenderPass',
            'bindPipelineState',
            'bindDescriptorSet',
            'bindInputAssembler',
            'draw',
        ])
            if (typeof command[key] === 'function') wrap(command, key, perf.commands);
        const readPixelsOriginal = gl.readPixels;
        gl.readPixels = function (...args: any[]) {
            perf.readPixelsDuringWindow++;
            return (readPixelsOriginal as any).apply(this, args);
        };
        perf.restorers.push(() => (gl.readPixels = readPixelsOriginal));
        for (const key of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'])
            wrap(gl, key, perf.draws);
        wrap(device.queue, 'submit', perf.queue);
        director.on(Director.EVENT_BEFORE_DRAW, perfBefore);
        director.on(Director.EVENT_AFTER_DRAW, perfAfter);
        context.listeners(2, 0);
        perf.fixedStart = snapshot();
        game.resume();
    }
    function perfBefore() {
        perf.begin = performance.now();
        if (perf.extension && !perf.currentQuery) {
            const q = gl.createQuery();
            if (q) {
                perf.currentQuery = q;
                perf.queryFrame = director.getTotalFrames();
                perf.queryEvents.push({ frame: perf.queryFrame, event: 'begin' });
                gl.beginQuery(perf.extension.TIME_ELAPSED_EXT, q);
            }
        }
    }
    function perfAfter() {
        const now = performance.now();
        if (perf.last)
            perf.frames.push({
                frame: director.getTotalFrames(),
                intervalMs: now - perf.last,
                renderEnvelopeMs: now - perf.begin,
                drawCalls: device.numDrawCalls,
                bufferBytes: memory().bufferSize,
                textureBytes: memory().textureSize,
            });
        perf.last = now;
        if (perf.currentQuery) {
            gl.endQuery(perf.extension.TIME_ELAPSED_EXT);
            perf.queries.push({ query: perf.currentQuery, frame: perf.queryFrame });
            perf.queryEvents.push({ frame: perf.queryFrame, event: 'end' });
            perf.currentQuery = null;
        }
        pollQueries();
    }
    function pollQueries() {
        for (let i = perf.queries.length - 1; i >= 0; i--) {
            const entry = perf.queries[i],
                q = entry.query;
            if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
                const disjoint = !!gl.getParameter(perf.extension.GPU_DISJOINT_EXT);
                const nanoseconds = gl.getQueryParameter(q, gl.QUERY_RESULT);
                perf.queryEvents.push({ frame: entry.frame, event: 'resolved', disjoint, nanoseconds });
                if (!disjoint) perf.gpu.push({ frame: entry.frame, ms: nanoseconds / 1e6 });
                gl.deleteQuery(q);
                perf.queryEvents.push({ frame: entry.frame, event: 'deleted', nativeIsQueryAfter: gl.isQuery(q) });
                perf.queries.splice(i, 1);
            }
        }
    }

    async function stopPerformance() {
        perf.active = false;
        game.pause();
        director.off(Director.EVENT_BEFORE_DRAW, perfBefore);
        director.off(Director.EVENT_AFTER_DRAW, perfAfter);
        context.listeners(0, 2);
        for (const restore of perf.restorers.splice(0)) restore();
        for (let i = 0; i < 25 && perf.queries.length; i++) {
            pollQueries();
            if (perf.queries.length) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        for (const entry of perf.queries.splice(0)) {
            perf.queryEvents.push({ frame: entry.frame, event: 'timeout' });
            gl.deleteQuery(entry.query);
            perf.queryEvents.push({
                frame: entry.frame,
                event: 'deleted',
                nativeIsQueryAfter: gl.isQuery(entry.query),
            });
        }
        return {
            fixedStart: perf.fixedStart,
            fixedEnd: snapshot(),
            frames: perf.frames,
            updateCalls: perf.updateCalls,
            commands: perf.commands,
            draws: perf.draws,
            queueBookkeeping: perf.queue,
            gpuSamples: perf.gpu,
            queryEvents: perf.queryEvents,
            warmupFrames: 30,
            window: {
                start: perf.frames[0]?.frame,
                end: perf.frames.at(-1)?.frame,
                startedAtMs: perf.startedAtMs,
                endedAtMs: performance.now(),
                durationMs: perf.frames.reduce((n, r) => n + r.intervalMs, 0),
            },
            timerAvailable: !!perf.extension,
            readPixelsDuringWindow: perf.readPixelsDuringWindow,
            device: { renderer: device.renderer, vendor: device.vendor },
            viewport: {
                width: innerWidth,
                height: innerHeight,
                dpr: devicePixelRatio,
                backing: { width: canvas.width, height: canvas.height },
            },
            memory: memory(),
            methods: {
                commands: 'CPU native gfx method wall envelope; includes immediate GL dispatch, not pure encoding',
                draws: 'CPU actual GL draw dispatch only, same Cocos context',
                queue: 'CPU statistics bookkeeping, not GPU command submission',
                frames: 'native AFTER_DRAW callback interval, not monitor presentation',
                gpu: 'TOOL_DIAGNOSTIC same-context native BEFORE_DRAW/AFTER_DRAW TIME_ELAPSED_EXT',
                passes: 'native one-pass consumer; verified from actual commands and GL draw dispatch',
                instrumentation:
                    'instrumented Driver Pilot: native gfx method wrappers, GL draw wrappers, and per-frame uniform receipts',
            },
        };
    }

    return {
        startPerformance,
        stopPerformance,
        isActive: () => perf.active,
        recordUpdate: (ms: number) => {
            if (perf.active) perf.updateCalls.push({ frame: director.getTotalFrames(), ms });
        },
    };
}
