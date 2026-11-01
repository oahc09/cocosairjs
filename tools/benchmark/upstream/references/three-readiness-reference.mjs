/** Protected AU11 browser source. Importing this module performs no browser or network work. */
import { disposeAsset } from './three-reference.mjs';

export const THREE_READINESS_OBSERVER_AUTHORITY = Object.freeze({
    kind: 'receipt-only',
    render: false,
    compile: false,
    advance: false,
});
const MODES = Object.freeze(['cold', 'delayed-resource', 'offscreen', 'shader-failure', 'context-lost']);
const frozenCopy = (value) => structuredClone(value);
const deferred = () => {
    let resolve;
    const promise = new Promise((settle) => {
        resolve = settle;
    });
    return { promise, resolve };
};
const issue = (source, message, details = null) => Object.assign(new Error(message), { source, details });

/** This observer has no renderer, scene, scheduler, compiler, or business mutation capability. */
export async function observeThreeReadinessReceipts({
    mode,
    engine,
    resources,
    passes,
    submission,
    presentation,
    fault,
    timeout,
    snapshotBusiness,
    readSubmission,
}) {
    const businessBefore = frozenCopy(snapshotBusiness());
    const stages = [];
    const wait = async (promise) => {
        const result = await Promise.race([
            promise.then(
                (value) => ({ value }),
                (error) => ({ error }),
            ),
            fault.then((error) => ({ error })),
            timeout.then((error) => ({ error })),
        ]);
        if (result.error) throw result.error;
        return result.value;
    };
    try {
        await wait(engine);
        stages.push('engine-created');
        const resourceReceipt = await wait(resources);
        stages.push('declared-resources');
        const passReceipt = await wait(passes);
        if (passReceipt.status !== 'available')
            throw issue('scene-passes', 'Native pass evidence was not available.', passReceipt);
        stages.push('scene-passes');
        const submitted = await wait(submission);
        stages.push('frame-submitted');
        const presented = await wait(presentation);
        stages.push('browser-presented');
        const businessAfter = frozenCopy(snapshotBusiness());
        return {
            id: mode,
            terminal: 'READY',
            status: 'READY',
            stages,
            businessBefore,
            businessAfter,
            submissionId: submitted.id,
            presentation: presented,
            readbackPixels: readSubmission().pixels,
            resourceReceipt,
            passReceipt,
            observerAuthority: THREE_READINESS_OBSERVER_AUTHORITY,
        };
    } catch (error) {
        return {
            id: mode,
            terminal: error.source === 'timeout' || error.source === 'unsupported' ? 'BLOCKED' : 'FAILED',
            status: error.source === 'timeout' || error.source === 'unsupported' ? 'BLOCKED' : 'FAILED',
            failureSource: error.source || 'application',
            presented: stages.includes('browser-presented'),
            stages,
            businessBefore,
            businessAfter: frozenCopy(snapshotBusiness()),
            error: { name: error.name, message: error.message, details: error.details || null },
            observerAuthority: THREE_READINESS_OBSERVER_AUTHORITY,
        };
    }
}

/**
 * Application setup returns immediately. Assign its result to window.__readiness if desired.
 * Every mode needs a fresh browser context and the pinned public native THREE/GLTFLoader.
 * The caller binds authenticated resource URLs and supplies a genuine compositor screenshot
 * receipt through present({source, submissionId, sha256, pixels, width, height}).
 * completion resolves one raw AU11 case, not a validation verdict. Always call close afterward.
 */
export function startThreeReadiness({ THREE, GLTFLoader, canvas, resourceURLs, mode = 'cold', snapshotBusiness }) {
    if (!MODES.includes(mode)) throw new RangeError('Unknown three readiness mode');
    if (String(THREE?.REVISION) !== '186' || typeof GLTFLoader !== 'function') {
        throw issue('unsupported', 'Pinned public three@0.186.1 and GLTFLoader are required.');
    }
    if (!canvas || typeof canvas.getContext !== 'function')
        throw issue('unsupported', 'A fresh browser canvas is required.');
    for (const id of ['inspection-rig', 'checker']) {
        if (typeof resourceURLs?.[id] !== 'string' || !resourceURLs[id]) {
            throw issue('unsupported', `Missing frozen resourceURLs['${id}'].`);
        }
    }
    const business = { animationTime: 0, physicsStepCount: 0, applicationUpdateCount: 0, randomSeed: 12345 };
    const snapshot = snapshotBusiness || (() => business);
    const submit = deferred(),
        present = deferred(),
        fault = deferred(),
        deadline = deferred();
    const disposables = new Set(),
        restores = [];
    let renderer,
        gl,
        asset,
        target,
        scene,
        camera,
        closed = false,
        resourceSettled = false,
        failure = null;
    let currentProgram = null,
        drawCount = 0;
    let drawnPrograms = new Set();
    const state = {
        mode,
        submission: null,
        readback: null,
        shaderFault: null,
        contextLost: null,
        report: null,
        observerAuthority: THREE_READINESS_OBSERVER_AUTHORITY,
    };
    const emitFault = (error) => {
        if (!failure) {
            failure = error;
            fault.resolve(error);
        }
        return error;
    };
    const ensureOpen = () => {
        if (closed) throw issue('closed', 'Readiness application was closed.');
        if (failure) throw failure;
    };
    const own = (value) => {
        disposables.add(value);
        return value;
    };
    const observeContext = () => {
        const wrap = (name, before) => {
            const original = gl[name];
            gl[name] = function (...args) {
                before(...args);
                return original.apply(this, args);
            };
            restores.push(() => {
                gl[name] = original;
            });
        };
        wrap('useProgram', (program) => {
            currentProgram = program;
        });
        for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
            wrap(name, () => {
                drawCount++;
                const program = currentProgram || gl.getParameter(gl.CURRENT_PROGRAM);
                if (program) drawnPrograms.add(program);
            });
        }
    };
    const onLost = (event) => {
        event.preventDefault();
        state.contextLost = { type: event.type, contextIsLost: gl?.isContextLost() ?? null };
        emitFault(issue('context-lost', 'Actual webglcontextlost event received.', state.contextLost));
    };
    const timer = setTimeout(
        () => deadline.resolve(issue('timeout', 'Readiness receipts exceeded the 15000ms budget.')),
        15000,
    );
    const engine = Promise.resolve().then(() => {
        ensureOpen();
        gl = canvas.getContext('webgl2', {
            alpha: false,
            antialias: false,
            depth: true,
            stencil: true,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
        });
        if (!gl) throw issue('unsupported', 'WebGL2 is unavailable.');
        canvas.addEventListener('webglcontextlost', onLost);
        observeContext();
        renderer = new THREE.WebGLRenderer({
            canvas,
            context: gl,
            antialias: false,
            alpha: false,
            premultipliedAlpha: false,
        });
        renderer.setPixelRatio(1);
        renderer.setSize(640, 360, false);
        renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.setClearColor(new THREE.Color().setRGB(8 / 255, 16 / 255, 32 / 255, THREE.LinearSRGBColorSpace), 1);
        renderer.debug.checkShaderErrors = true;
        renderer.debug.onShaderError = (context, program, vertexShader, fragmentShader) => {
            state.shaderFault = {
                compiled: context.getShaderParameter(fragmentShader, context.COMPILE_STATUS),
                vertexCompiled: context.getShaderParameter(vertexShader, context.COMPILE_STATUS),
                linked: context.getProgramParameter(program, context.LINK_STATUS),
                log: context.getShaderInfoLog(fragmentShader),
                source: context.getShaderSource(fragmentShader),
                programLog: context.getProgramInfoLog(program),
                scope: 'Native ShaderMaterial and WebGLRenderer shader compile/link diagnostics.',
            };
            emitFault(
                issue(
                    'shader-failure',
                    'Native ShaderMaterial program compilation or linkage failed.',
                    state.shaderFault,
                ),
            );
        };
        return { revision: String(THREE.REVISION), contextAttributes: renderer.getContextAttributes() };
    });
    const resources = engine
        .then(async () => {
            if (mode === 'delayed-resource') await new Promise((resolve) => setTimeout(resolve, 150));
            ensureOpen();
            const manager = new THREE.LoadingManager();
            const rigURL = new URL(resourceURLs['inspection-rig'], globalThis.location.href).href;
            const checkerURL = new URL('checker.png', rigURL).href;
            manager.setURLModifier((url) =>
                new URL(url, globalThis.location.href).href === checkerURL ? resourceURLs.checker : url,
            );
            asset = await new GLTFLoader(manager).loadAsync(resourceURLs['inspection-rig']);
            if (closed) {
                disposeAsset(asset);
                asset = null;
                throw issue('closed', 'Native load completed after application close.');
            }
            ensureOpen();
            scene = new THREE.Scene();
            scene.add(asset.scene);
            const controlGeometry = own(new THREE.PlaneGeometry(2, 2));
            const controlMaterial = own(
                mode === 'shader-failure'
                    ? new THREE.ShaderMaterial({
                          vertexShader:
                              'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
                          fragmentShader: 'void main() { gl_FragColor = THREE_READINESS_NATIVE_UNDECLARED; }',
                      })
                    : new THREE.MeshBasicMaterial({
                          color: new THREE.Color().setRGB(240 / 255, 120 / 255, 30 / 255, THREE.LinearSRGBColorSpace),
                          toneMapped: false,
                      }),
            );
            const control = new THREE.Mesh(controlGeometry, controlMaterial);
            control.position.z = 1;
            control.renderOrder = 100;
            scene.add(control);
            scene.add(new THREE.AmbientLight(0xffffff, 1));
            camera = new THREE.OrthographicCamera(-2, 2, 1.125, -1.125, 0.1, 20);
            camera.position.set(0, 0, 5);
            camera.lookAt(0, 0, 0);
            if (mode === 'offscreen') {
                target = own(
                    new THREE.WebGLRenderTarget(64, 64, {
                        format: THREE.RGBAFormat,
                        type: THREE.UnsignedByteType,
                        depthBuffer: true,
                        stencilBuffer: true,
                        samples: 0,
                    }),
                );
                target.texture.colorSpace = THREE.LinearSRGBColorSpace;
            }
            return {
                url: rigURL,
                checkerURL: resourceURLs.checker,
                rootId: asset.scene.uuid,
                declaredDelayMs: mode === 'delayed-resource' ? 150 : 0,
                offscreenSize: target ? [target.width, target.height] : null,
            };
        })
        .finally(() => {
            resourceSettled = true;
        });
    const passes = resources.then(async () => {
        ensureOpen();
        if (mode === 'context-lost') {
            const extension = gl.getExtension('WEBGL_lose_context');
            if (!extension)
                throw issue('unsupported', 'WEBGL_lose_context is unavailable; no synthetic loss substituted.');
            extension.loseContext();
            const error = await fault.promise;
            throw error;
        }
        // These are application-owned preparation/submission actions. The observer only waits
        // for the promises and never receives any method that can call them.
        await renderer.compileAsync(scene, camera);
        ensureOpen();
        drawnPrograms = new Set();
        drawCount = 0;
        const renderPasses = [];
        if (target) {
            renderer.setRenderTarget(target);
            renderer.render(scene, camera);
            renderPasses.push({
                destination: 'offscreen',
                frame: renderer.info.render.frame,
                drawCalls: renderer.info.render.calls,
            });
        }
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        renderPasses.push({
            destination: 'canvas',
            frame: renderer.info.render.frame,
            drawCalls: renderer.info.render.calls,
        });
        ensureOpen();
        const programs = [...drawnPrograms].map((program) => ({
            linked: gl.getProgramParameter(program, gl.LINK_STATUS),
            log: gl.getProgramInfoLog(program),
        }));
        const rgba = new Uint8Array(4);
        gl.readPixels(
            Math.floor(canvas.width / 2),
            Math.floor(canvas.height / 2),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            rgba,
        );
        const glError = gl.getError();
        const passReceipt = {
            status:
                programs.length && drawCount && programs.every((program) => program.linked) && glError === gl.NO_ERROR
                    ? 'available'
                    : 'unknown',
            programs,
            drawCount,
            glError,
            renderPasses,
        };
        state.passReceipt = passReceipt;
        if (passReceipt.status !== 'available') return passReceipt;
        state.readback = Array.from(rgba);
        state.submission = {
            id: `${scene.uuid}:${renderer.info.render.frame}`,
            frame: renderer.info.render.frame,
            sceneId: scene.uuid,
            canvasSize: [canvas.width, canvas.height],
            afterNativeRender: true,
        };
        submit.resolve(state.submission);
        return passReceipt;
    });
    // A rejected app promise is a real fault. Attach handlers immediately so delayed native
    // failures cannot become unhandled while the observer is awaiting an earlier stage.
    for (const promise of [engine, resources, passes]) promise.catch((error) => emitFault(error));
    state.present = (receipt) => {
        ensureOpen();
        if (
            !state.submission ||
            receipt?.source !== 'browser-compositor' ||
            receipt.submissionId !== state.submission.id ||
            !/^[0-9a-f]{64}$/.test(receipt.sha256 || '') ||
            !Array.isArray(receipt.pixels) ||
            receipt.pixels.length !== 4 ||
            receipt.pixels.some((value) => !Number.isInteger(value) || value < 0 || value > 255) ||
            receipt.width !== canvas.width ||
            receipt.height !== canvas.height ||
            receipt.contentValidated !== true ||
            !state.readback ||
            receipt.pixels.some((value, index) => Math.abs(value - state.readback[index]) > 2)
        ) {
            throw emitFault(
                issue(
                    'presentation',
                    'Compositor receipt must bind this submission, screenshot SHA256, dimensions and center RGBA bytes.',
                ),
            );
        }
        present.resolve(frozenCopy(receipt));
    };
    state.close = async () => {
        if (closed) return state.closeReceipt;
        closed = true;
        clearTimeout(timer);
        if (!state.report) emitFault(issue('closed', 'Application closed before readiness completed.'));
        const failures = [];
        const release = (name, action) => {
            try {
                action();
            } catch (error) {
                failures.push({ name, message: String(error?.message || error) });
            }
        };
        if (asset) release('asset', () => disposeAsset(asset));
        for (const resource of disposables) release(resource.type || 'owned-resource', () => resource.dispose());
        disposables.clear();
        if (renderer) release('renderer', () => renderer.dispose());
        canvas.removeEventListener('webglcontextlost', onLost);
        for (const restore of restores.reverse()) release('observation-wrapper', restore);
        state.closeReceipt = {
            status: failures.length ? 'failed' : 'released',
            pending: resourceSettled ? [] : ['native-loader-request'],
            failures,
        };
        return state.closeReceipt;
    };
    state.completion = observeThreeReadinessReceipts({
        mode,
        engine,
        resources,
        passes,
        submission: submit.promise,
        presentation: present.promise,
        fault: fault.promise,
        timeout: deadline.promise,
        snapshotBusiness: snapshot,
        readSubmission: () => ({ pixels: state.readback }),
    }).then((report) => {
        clearTimeout(timer);
        state.report = report;
        return report;
    });
    return state;
}
