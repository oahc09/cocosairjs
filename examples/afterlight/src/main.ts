/** AFTERLIGHT — an original HDR light sculpture, with an actual mirrored-camera capture. */
import {
    createAirApp,
    createAirPostProcess,
    createAirRenderTarget,
    Scene,
    Node,
    Camera,
    MeshRenderer,
    Vec3,
    Vec4,
    Color,
    Layers,
    utils,
    primitives,
    director,
    Director,
    PipelineEventType,
} from 'cocosair';
import { makeSculptureMaterial } from './materials.js';

async function main(): Promise<void> {
    const app = await createAirApp({ canvas: '#GameCanvas', pixelRatioCap: 1.5 });
    const scene = new Scene('AFTERLIGHT');
    const objects = new Node('Light sculpture');
    scene.addChild(objects);
    const owned: { destroy(): unknown }[] = [];
    const animated: { node: Node; phase: number; speed: number }[] = [];
    const materials: ReturnType<typeof makeSculptureMaterial>[] = [];
    const palette = [new Vec4(0.015, 0.56, 0.85, 1), new Vec4(1, 0.27, 0.065, 1), new Vec4(0.28, 0.32, 0.37, 1)];
    const makeMaterial = (name: string, color: Vec4, intensity: number, core = false) => {
        const resource = makeSculptureMaterial(name, false, core);
        materials.push(resource);
        resource.material.setProperty('tint', color);
        resource.material.setProperty(
            'settings',
            new Vec4(core ? 1 : intensity > 0.1 ? 2 : 0, intensity, core ? 0.85 : 0, core ? 1 : 0),
        );
        return resource.material;
    };
    const cyan = makeMaterial('afterlight-ion', palette[0], 4.8);
    const warm = makeMaterial('afterlight-ember', palette[1], 4);
    const metal = makeMaterial('afterlight-titanium', palette[2], 0.07);
    const steel = makeMaterial('afterlight-machined-silver', new Vec4(0.5, 0.57, 0.64, 1), 0.09);
    const brass = makeMaterial('afterlight-brushed-brass', new Vec4(0.4, 0.23, 0.09, 1), 0.08);
    const core = makeMaterial('afterlight-core', palette[0], 1, true);
    const quiet = makeMaterial('afterlight-dust', new Vec4(0.12, 0.35, 0.5, 1), 0.4);
    const mesh = (geometry: Parameters<typeof utils.createMesh>[0]) => {
        const m = utils.createMesh(geometry);
        owned.push(m);
        return m;
    };
    const tube = (radius: number, width: number, arc = Math.PI * 2) =>
        mesh(primitives.torus(radius, width, { radialSegments: 12, tubularSegments: 160, arc }));
    const add = (
        name: string,
        geometry: ReturnType<typeof utils.createMesh>,
        material: typeof cyan,
        parent = objects,
    ) => {
        const n = new Node(name);
        n.layer = Layers.Enum.DEFAULT;
        parent.addChild(n);
        const r = n.addComponent(MeshRenderer);
        r.mesh = geometry;
        r.setSharedMaterial(material, 0);
        return n;
    };
    const assembly = new Node('Suspended gyroscope');
    objects.addChild(assembly);
    assembly.setPosition(0, 3.5, 0);
    // Native torus lies in XZ; rotation places each ring in an independent orbital plane.
    const outer = add('Titanium shell', tube(2.65, 0.14), metal, assembly);
    outer.setRotationFromEuler(82, 0, -15);
    const outerLight = add('Ion arc', tube(2.65, 0.023, Math.PI * 1.62), cyan, outer);
    outerLight.setPosition(0, 0.17, 0);
    const middle = add('Ember orbit', tube(2.2, 0.027, Math.PI * 1.65), warm, assembly);
    middle.setRotationFromEuler(36, 0, 38);
    const middleHousing = add('Ember ceramic channel', tube(2.2, 0.061, Math.PI * 1.65), metal, middle);
    middleHousing.setPosition(0, -0.058, 0);
    const inner = add('Inner ion orbit', tube(1.72, 0.018, Math.PI * 1.8), cyan, assembly);
    inner.setRotationFromEuler(115, 25, 16);
    const innerHousing = add('Inner ceramic channel', tube(1.72, 0.039, Math.PI * 1.8), steel, inner);
    innerHousing.setPosition(0, -0.036, 0);
    animated.push(
        { node: outer, phase: -15, speed: 2 },
        { node: middle, phase: 38, speed: -3 },
        { node: inner, phase: 16, speed: 4 },
    );
    const sphere = add('Liquid obsidian core', mesh(primitives.sphere(1.14, { segments: 64 })), core, assembly);
    sphere.layer = 1 << 22;
    const backGuide = add('Rear cyan light guide', tube(0.82, 0.012, Math.PI * 1.4), cyan, assembly);
    backGuide.setRotationFromEuler(90, 0, 30);
    backGuide.setPosition(0, 0, -1.65);
    const warmGuide = add('Rear amber light guide', tube(0.64, 0.009, Math.PI * 0.85), warm, assembly);
    warmGuide.setRotationFromEuler(90, 0, -40);
    warmGuide.setPosition(0.05, 0, -1.7);
    const lip = add('Polished outer lip', tube(2.81, 0.018), steel, outer);
    const innerLip = add('Inner polished lip', tube(2.49, 0.012), steel, outer);
    lip.setPosition(0, 0.045, 0);
    innerLip.setPosition(0, 0.065, 0);
    const screwMesh = mesh(primitives.cylinder(0.027, 0.027, 0.045, { radialSegments: 12 }));
    const slotMesh = mesh(primitives.box({ width: 0.038, height: 0.004, length: 0.008 }));
    const bracketMesh = mesh(primitives.box({ width: 0.11, height: 0.17, length: 0.24 }));
    for (let i = 0; i < 36; i++) {
        const angle = (i / 36) * Math.PI * 2;
        const screw = add('Machined fastener', screwMesh, steel, outer);
        screw.setPosition(Math.sin(angle) * 2.66, 0.145, Math.cos(angle) * 2.66);
        const slot = add('Fastener recess', slotMesh, metal, screw);
        slot.setPosition(0, 0.025, 0);
        slot.setRotationFromEuler(0, i * 17, 0);
        if (i % 3 === 0) {
            const clamp = add('Insulated arc retainer', bracketMesh, brass, outer);
            clamp.setPosition(Math.sin(angle) * 2.65, 0.12, Math.cos(angle) * 2.65);
            clamp.setRotationFromEuler(0, (angle * 180) / Math.PI, 0);
        }
    }
    const beadMesh = mesh(primitives.sphere(0.035, { segments: 8 }));
    for (let i = 0; i < 34; i++) {
        const a = (i / 34) * Math.PI * 2;
        const bead = add('Orbital marker', beadMesh, i % 5 === 0 ? warm : steel, assembly);
        bead.setPosition(Math.cos(a) * 2.65, Math.sin(a) * 2.65 * 0.99, 0.13);
        bead.setScale(i % 5 === 0 ? 1.8 : 0.65, i % 5 === 0 ? 1.8 : 0.65, i % 5 === 0 ? 1.8 : 0.65);
    }
    const base = add('Obsidian plinth', mesh(primitives.cylinder(2.6, 2.9, 0.24, { radialSegments: 128 })), metal);
    base.setPosition(0, 0.2, 0);
    const lowerBase = add(
        'Pedestal lower bevel',
        mesh(primitives.cylinder(2.89, 2.82, 0.09, { radialSegments: 128 })),
        steel,
    );
    lowerBase.setPosition(0, 0.055, 0);
    const topBase = add(
        'Engraved instrument plate',
        mesh(primitives.cylinder(2.5, 2.6, 0.07, { radialSegments: 128 })),
        metal,
    );
    topBase.setPosition(0, 0.355, 0);
    for (const radius of [1.65, 1.72, 2.35, 2.42, 2.56]) {
        const ring = add('Concentric machining', tube(radius, 0.007), steel);
        ring.setPosition(0, 0.395, 0);
    }
    const hub = add(
        'Suspension emitter housing',
        mesh(primitives.cylinder(0.4, 0.6, 0.35, { radialSegments: 64 })),
        steel,
    );
    hub.setPosition(0, 0.54, 0);
    const hubSeam = add('Suspension emitter', tube(0.43, 0.014), cyan);
    hubSeam.setPosition(0, 0.69, 0);
    const baseRing = add('Plinth light seam', tube(2.78, 0.018), cyan);
    baseRing.setPosition(0, 0.135, 0);
    const inset = add('Ember floor trace', tube(3.48, 0.012, Math.PI * 1.68), warm);
    inset.setPosition(0, 0.025, 0);
    inset.setRotationFromEuler(0, 12, 0);
    const box = mesh(primitives.box({ width: 0.12, height: 0.16, length: 0.48 }));
    for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2,
            n = add('Radial graduation', box, i % 8 === 0 ? brass : metal);
        n.setPosition(Math.sin(a) * 3.55, 0.03, Math.cos(a) * 3.55);
        n.setRotationFromEuler(0, (a * 180) / Math.PI, 0);
    }
    const dustMesh = mesh(primitives.sphere(0.012, { segments: 6 }));
    let seed = 73;
    const rand = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    for (let i = 0; i < 45; i++) {
        const n = add('Airborne mote', dustMesh, quiet);
        n.setPosition((rand() - 0.5) * 20, rand() * 9 + 0.3, (rand() - 0.5) * 14);
    }
    const cameraNode = new Node('Main Camera');
    scene.addChild(cameraNode);
    const camera = cameraNode.addComponent(Camera);
    camera.visibility = Layers.Enum.DEFAULT | (1 << 21) | (1 << 22);
    camera.fov = 44;
    camera.near = 0.1;
    camera.far = 160;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(1, 3, 6, 255);
    camera.priority = 1;
    const reflectionNode = new Node('Reflection Camera');
    scene.addChild(reflectionNode);
    const reflectionCamera = reflectionNode.addComponent(Camera);
    reflectionCamera.visibility = Layers.Enum.DEFAULT | (1 << 22);
    reflectionCamera.fov = 44;
    reflectionCamera.near = 0.1;
    reflectionCamera.far = 160;
    reflectionCamera.priority = -10;
    reflectionCamera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    reflectionCamera.clearColor = new Color(0, 0, 0, 255);
    const reflection = createAirRenderTarget({
        name: 'afterlight-reflection',
        width: window.innerWidth,
        height: window.innerHeight,
        scale: 0.65,
        colorFormat: 'rgba16f',
        depthFormat: 'depth24-stencil8',
        filter: 'linear',
    });
    const detachReflection = reflection.attachCamera(reflectionCamera, () => {
        reflection.resize(director.root!.mainWindow!.width, director.root!.mainWindow!.height);
        reflectionCamera.camera.update(true);
    });
    const floorResource = makeSculptureMaterial('afterlight-reflective-floor', true);
    materials.push(floorResource);
    const floorNode = add(
        'Wet basalt',
        mesh({
            positions: [-300, 0, -300, 300, 0, -300, -300, 0, 300, 300, 0, 300],
            normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
            indices: [0, 2, 1, 1, 2, 3],
        }),
        floorResource.material,
    );
    floorNode.layer = 1 << 21; // Never capture the floor into its own reflection.
    const unbindReflection = reflection.bindColor(floorResource.material, 'captureTexture');
    // Background -> floor reflection -> main output. Neither capture samples itself.
    const transmissionNode = new Node('Glass background camera');
    scene.addChild(transmissionNode);
    const transmissionCamera = transmissionNode.addComponent(Camera);
    transmissionCamera.visibility = Layers.Enum.DEFAULT; // Excludes both the glass and reflective floor.
    transmissionCamera.fov = camera.fov;
    transmissionCamera.near = 0.1;
    transmissionCamera.far = 160;
    transmissionCamera.priority = -20;
    transmissionCamera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    transmissionCamera.clearColor = camera.clearColor;
    const transmission = createAirRenderTarget({
        name: 'afterlight-glass-background',
        width: window.innerWidth,
        height: window.innerHeight,
        colorFormat: 'rgba16f',
        depthFormat: 'depth24-stencil8',
        filter: 'linear',
    });
    const detachTransmission = transmission.attachCamera(transmissionCamera, () => {
        transmission.resize(director.root!.mainWindow!.width, director.root!.mainWindow!.height);
        transmissionCamera.camera.update(true);
    });
    const unbindTransmission = transmission.bindColor(core, 'captureTexture');
    const updateReflection = (native: unknown) => {
        if (native === reflectionCamera.camera)
            floorResource.material.setProperty('captureViewProj', reflectionCamera.camera.matViewProj);
        if (native === transmissionCamera.camera)
            core.setProperty('captureViewProj', transmissionCamera.camera.matViewProj);
    };
    director.root!.pipelineEvent.on(PipelineEventType.RENDER_CAMERA_END, updateReflection);
    const post = createAirPostProcess(camera, {
        levels: 6,
        samples: 4,
        exposure: 0.85,
        toneMapping: 'aces',
        bloom: { intensity: 0.35, threshold: 1.1, softKnee: 0.6, scatter: 0.72 },
    });
    let time = 0,
        playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        disposed = false,
        azimuth = 0.3,
        pitch = 0.25,
        distance = 14.8;
    const frame = () => {
        const aspect = window.innerWidth / window.innerHeight;
        const d = distance * Math.max(1, 0.85 / aspect);
        const pos = new Vec3(Math.sin(azimuth) * d, 3 + d * Math.sin(pitch), Math.cos(azimuth) * d);
        cameraNode.setPosition(pos);
        cameraNode.lookAt(new Vec3(0, 2.7, 0));
        transmissionNode.setPosition(pos);
        transmissionNode.lookAt(new Vec3(0, 2.7, 0));
        reflectionNode.setPosition(pos.x, -pos.y, pos.z);
        reflectionNode.lookAt(new Vec3(0, -2.7, 0), new Vec3(0, -1, 0));
    };
    frame();
    const update = () => {
        const dt = director.root!.frameTime;
        if (playing) time += dt;
        const clock = new Vec4(time, 0, 0, 0);
        materials.forEach((r) => r.material.setProperty('clock', clock));
        animated.forEach(({ node, phase, speed }, i) =>
            node.setRotationFromEuler([82, 36, 115][i], i === 2 ? 25 : 0, phase + time * speed),
        );
        sphere.setRotationFromEuler(0, time * 3, 0);
    };
    director.on(Director.EVENT_AFTER_UPDATE, update);
    const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!;
    let drag: { x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', (e) => {
        drag = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
        if (!drag) return;
        azimuth -= (e.clientX - drag.x) * 0.004;
        pitch = Math.max(0.08, Math.min(0.65, pitch + (e.clientY - drag.y) * 0.003));
        drag = { x: e.clientX, y: e.clientY };
        frame();
    });
    canvas.addEventListener('pointerup', () => {
        drag = null;
    });
    canvas.addEventListener('pointercancel', () => {
        drag = null;
    });
    canvas.addEventListener(
        'wheel',
        (e) => {
            e.preventDefault();
            distance = Math.max(10, Math.min(22, distance + e.deltaY * 0.01));
            frame();
        },
        { passive: false },
    );
    const bloom = document.querySelector<HTMLInputElement>('#bloom')!;
    document.querySelector<HTMLSelectElement>('#surface')!.addEventListener('change', (event) => {
        const glass = (event.target as HTMLSelectElement).value === 'glass';
        core.setProperty('settings', new Vec4(1, 1, 0.85, glass ? 1 : 0));
    });
    bloom.addEventListener('change', () => {
        post.setOptions({ bloom: { enabled: bloom.checked } });
        document.querySelector('#bloom-state')!.textContent = bloom.checked ? 'ON' : 'OFF';
    });
    document
        .querySelector<HTMLSelectElement>('#tone')!
        .addEventListener('change', (e) =>
            post.setOptions({ toneMapping: (e.target as HTMLSelectElement).value as 'aces' | 'reinhard' }),
        );
    const exposure = document.querySelector<HTMLInputElement>('#exposure')!;
    exposure.addEventListener('input', () => {
        post.setOptions({ exposure: Number(exposure.value) });
        document.querySelector('#exposure-value')!.textContent = Number(exposure.value).toFixed(2);
    });
    const pause = document.querySelector<HTMLButtonElement>('#pause')!;
    pause.textContent = playing ? 'Pause motion' : 'Resume motion';
    pause.setAttribute('aria-pressed', String(!playing));
    pause.addEventListener('click', () => {
        playing = !playing;
        pause.textContent = playing ? 'Pause motion' : 'Resume motion';
        pause.setAttribute('aria-pressed', String(!playing));
    });
    document.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', () => {
        azimuth = 0.3;
        pitch = 0.25;
        distance = 14.8;
        time = 0;
        frame();
    });
    const resize = () => frame();
    window.addEventListener('resize', resize);
    const dispose = async () => {
        if (disposed) return;
        disposed = true;
        director.off(Director.EVENT_AFTER_UPDATE, update);
        window.removeEventListener('resize', resize);
        director.root!.pipelineEvent.off(PipelineEventType.RENDER_CAMERA_END, updateReflection);
        post.dispose();
        unbindReflection();
        detachReflection();
        reflection.dispose();
        unbindTransmission();
        detachTransmission();
        transmission.dispose();
        await app.releaseScene!();
        for (const r of materials) {
            r.material.destroy();
            r.effect.destroy();
        }
        owned.forEach((r) => r.destroy());
    };
    app.run(scene);
    (window as any).__afterlight = {
        app,
        post,
        reflection,
        transmission,
        dispose,
        getState: () => ({
            time,
            playing,
            disposed,
            azimuth,
            pitch,
            cameraAspect: camera.camera.aspect,
            reflectionAspect: reflectionCamera.camera.aspect,
            targets: post.info.ownedTargets,
            settings: post.info.settings,
        }),
        freeze: () => {
            playing = false;
            time = 2;
            pause.textContent = 'Resume motion';
            pause.setAttribute('aria-pressed', 'true');
            update();
            frame();
        },
    };
    director.once(Director.EVENT_AFTER_DRAW, () => {
        (window as any).__appReady = true;
        document.body.classList.add('ready');
        document.querySelector('#status')!.textContent = 'WEBGL 2 / LINEAR HDR';
    });
}
main().catch((error) => {
    console.error(error);
    document.querySelector('#status')!.textContent = 'Unable to start: ' + String(error);
});
