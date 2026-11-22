import { Animation, Camera, Color, createAirApp, createStepClock, GLTFLoader, Node, Scene } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas', diagnostics: 'warnings', pixelRatioCap: 1 });
const gl = app.canvas.getContext('webgl2');
if (!gl) throw Error('The crowd experiment requires an actual WebGL2 device');
const scene = new Scene('Scoped crowd pose experiment');
const cameraNode = new Node('Fixed projection; scripted translation');
scene.addChild(cameraNode);
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.ORTHO;
camera.orthoHeight = 4;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(0, 0, 0, 255);

const response = await fetch('../upstream-skinning/rig.gltf');
if (!response.ok) throw Error('Shared authored skin fixture missing');
const model = await response.json();
model.meshes[0].primitives = [model.meshes[0].primitives[0]];
const asset = await new GLTFLoader().parseAsync(JSON.stringify(model));
const actors = Array.from({ length: 200 }, (_, i) => {
    const parent = new Node('actor-' + i);
    const x = ((i % 20) - 9.5) * 2.4;
    const y = (Math.floor(i / 20) - 4.5) * 2.1;
    const instance = asset.instantiate();
    parent.setPosition(x, y, 0);
    parent.setScale(0.35, 0.35, 0.35);
    parent.addChild(instance.root);
    scene.addChild(parent);
    const controller = instance.root.getComponent(Animation);
    const state = controller?.getState('move');
    if (!state) throw Error('Expected authored move clip');
    return { i, x, y, state, parent, instance };
});

app.run(scene);
const clock = createStepClock();
function sample(actor: (typeof actors)[number], time: number) {
    // Manually sampling an existing native Cocos animation state, not patching AnimationManager.
    actor.state.time = time;
    actor.state.sample();
}

async function run(selective: boolean) {
    clock.begin();
    try {
        for (const actor of actors) sample(actor, 0);
        const captures = [];
        const updates = [];
        const micros = [];
        const errors = [];
        let skipped = 0;
        let reentries = 0;
        let previous = new Set<number>();
        for (let frame = 0; frame < 60; frame++) {
            const cx = [-8, 0, 8, 0, -8][Math.floor(frame / 12)];
            cameraNode.setPosition(cx, 0, 10);
            const time = ((frame * 7) % 119) / 60;
            const horizontal = (camera.orthoHeight * app.canvas.width) / app.canvas.height + 2;
            const vertical = camera.orthoHeight + 2;
            const candidates = new Set<number>();
            for (const actor of actors) {
                if (Math.abs(actor.x - cx) <= horizontal && Math.abs(actor.y) <= vertical) {
                    candidates.add(actor.i);
                    if (frame && !previous.has(actor.i)) reentries++;
                }
            }
            previous = candidates;
            const start = performance.now();
            let updated = 0;
            for (const actor of actors) {
                if (selective && !candidates.has(actor.i)) continue;
                sample(actor, time);
                updated++;
            }
            micros.push((performance.now() - start) * 1000);
            updates.push(updated);
            skipped += actors.length - updated;
            await clock.step(0);
            if (frame % 12 === 0 || frame % 12 === 11) {
                const data = new Uint8Array(app.canvas.width * app.canvas.height * 4);
                gl!.readPixels(0, 0, app.canvas.width, app.canvas.height, gl!.RGBA, gl!.UNSIGNED_BYTE, data);
                errors.push(gl!.getError());
                let visiblePixels = 0;
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i] > 8 || data[i + 1] > 8 || data[i + 2] > 8) visiblePixels++;
                }
                const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
                captures.push({
                    frame,
                    visiblePixels,
                    sha256: Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(''),
                });
            }
        }
        micros.sort((a, b) => a - b);
        return {
            updates,
            captures,
            errors,
            skipped,
            reentries,
            poseSamplingCpuP95Us: micros[Math.ceil(micros.length * 0.95) - 1],
        };
    } finally {
        clock.end();
    }
}

async function close() {
    for (const actor of actors) {
        actor.instance.dispose();
        actor.parent.destroy();
    }
    asset.destroy();
    await app.close();
}
Object.assign(window, { __crowdPoseExperiment: { run, close } });
