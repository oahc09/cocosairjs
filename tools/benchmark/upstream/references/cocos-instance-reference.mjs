/** Protected Cocos AU04/AU10 configuration. Actual public loader, native animation and settled destruction. */
export async function runCocosInstanceReference(taskId, { cc, canvas, resourceURLs }) {
    if (!['AU04', 'AU10'].includes(taskId)) throw Error(`Unsupported instance reference ${taskId}`);
    const url = resourceURLs['skin-rig'];
    if (!url) throw Error('Frozen skin-rig URL required');
    const app = await cc.createAirApp({ canvas, pixelRatioCap: 1 });
    const scene = new cc.Scene('protected-instance-reference');
    const cameraNode = new cc.Node('paired-camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(0, 0, 10);
    const camera = cameraNode.addComponent(cc.Camera);
    camera.projection = cc.Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 4;
    camera.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new cc.Color(0, 0, 0, 255);
    app.run(scene);
    const clock = cc.createStepClock();
    clock.begin();
    const gl = app.canvas.getContext('webgl2');
    if (!gl) throw Error('Real WebGL2 required');
    const assets = new Set(),
        instances = new Set(),
        parents = new Set(),
        ids = new WeakMap();
    let nextId = 0;
    const id = (object) => {
        if (!ids.has(object)) ids.set(object, `cocos-instance-${++nextId}`);
        return ids.get(object);
    };
    const tuple = (v) => [v.x, v.y, v.z];
    const skin = (instance) => instance.root.getComponentsInChildren(cc.SkinnedMeshRenderer)[0];
    const load = async () => {
        const asset = await new cc.GLTFLoader({ request: { httpCache: 'no-store' } }).loadAsync(url);
        assets.add(asset);
        return asset;
    };
    const make = (asset, index) => {
        const instance = asset.instantiate(),
            parent = new cc.Node(`owned-parent-${index}`);
        instances.add(instance);
        parents.add(parent);
        scene.addChild(parent);
        parent.addChild(instance.root);
        parent.setPosition((index - 1) * 2.5, 0, 0);
        parent.setScale(
            ...[
                [0.5, 0.5, 1],
                [0.75, 0.3, 1],
                [-0.5, 0.75, 1],
            ][index % 3],
        );
        return { instance, parent };
    };
    const sample = (entry, time) => {
        const animation = entry.instance.root.getComponent(cc.Animation);
        animation.play('move');
        const state = animation.getState('move');
        state.time = time;
        state.sample();
        animation.pause();
    };
    const observe = (entry) => {
        const instance = entry.instance,
            renderer = skin(instance);
        const joint = instance.root.getChildByPath('Ancestor__0/RootBone__1');
        return {
            rootId: id(instance.root),
            skeletonId: id(joint),
            mixerId: id(instance.root.getComponent(cc.Animation)),
            geometryId: id(renderer.mesh),
            textureId: id(renderer.getSharedMaterial(0).getProperty('mainTexture')),
            clipId: id(instance.animations[0]),
            bone: tuple(joint.position),
            weight: renderer.getWeight(0, 0),
            ancestor: { position: tuple(entry.parent.position), scale: tuple(entry.parent.scale) },
        };
    };
    const pixels = () => {
        const bytes = new Uint8Array(app.canvas.width * app.canvas.height * 4);
        gl.readPixels(0, 0, app.canvas.width, app.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        if (gl.getError() !== gl.NO_ERROR) throw Error('Reference readback failed');
        return Array.from(bytes);
    };
    let observerListeners = 0;
    const settle = async () => {
        const submissions = [],
            events = [];
        for (let i = 0; i < 2; i++) {
            const observed = [],
                update = () => observed.push('update'),
                draw = () => observed.push('draw');
            cc.director.on(cc.Director.EVENT_AFTER_UPDATE, update);
            cc.director.on(cc.Director.EVENT_AFTER_DRAW, draw);
            observerListeners += 2;
            try {
                const frame = cc.director.getTotalFrames();
                await clock.step(0);
                await Promise.resolve();
                if (observed.join(',') !== 'update,draw' || cc.director.getTotalFrames() <= frame)
                    throw Error('Incomplete actual engine settlement');
                submissions.push(frame);
                events.push(observed);
            } finally {
                cc.director.off(cc.Director.EVENT_AFTER_UPDATE, update);
                cc.director.off(cc.Director.EVENT_AFTER_DRAW, draw);
                observerListeners -= 2;
            }
        }
        return { submissions, events };
    };
    const dispose = (entry) => {
        entry.instance.dispose();
        entry.instance.dispose();
        entry.parent.destroy();
        instances.delete(entry.instance);
        parents.delete(entry.parent);
    };
    const close = async () => {
        clock.end();
        for (const instance of instances) instance.dispose();
        for (const parent of parents) parent.destroy();
        for (const asset of assets) asset.destroy();
        return { released: await app.releaseScene(), closed: await app.close() };
    };
    try {
        const asset = await load(),
            entries = Array.from({ length: taskId === 'AU04' ? 3 : 2 }, (_, i) => make(asset, i));
        await settle();
        entries.forEach((entry, i) => sample(entry, [0.25, 0.75, 1.5][i]));
        await settle();
        let cases;
        if (taskId === 'AU04') {
            const independent = entries.map(observe);
            const nativeResources = [...asset.meshes, ...asset.textures];
            const validityBefore = nativeResources.map((resource) => resource.isValid);
            dispose(entries[0]);
            await settle();
            const validityAfter = nativeResources.map((resource) => resource.isValid);
            cases = [
                { id: 'three-instances', instances: independent },
                {
                    id: 'destroy-first',
                    remaining: entries.slice(1).map(observe),
                    sharedResourceDisposeEvents: validityAfter.filter((alive, i) => validityBefore[i] && !alive).length,
                    disposalObservation: 'native shared asset validity transitions, not total GPU memory',
                    pixels: pixels(),
                },
            ];
        } else {
            const survivorBefore = entries.map(observe),
                survivorPixelsBefore = pixels();
            const survivorMaterials = entries.map((entry) => skin(entry.instance).getMaterialInstance(0));
            await settle();
            const ledger = {
                roots: entries.length,
                materials: survivorMaterials.filter((m) => m.isValid).length,
                textures: asset.textures.filter((t) => t.isValid).length,
                geometries: asset.meshes.filter((m) => m.isValid).length,
                listeners: observerListeners,
            };
            const cycles = [];
            for (let cycle = 0; cycle < 30; cycle++) {
                const loaded = await load(),
                    entry = make(loaded, 2);
                await settle();
                const beforeChange = observe(entry);
                sample(entry, 1.5);
                const material = skin(entry.instance).getMaterialInstance(0);
                material.setProperty('mainColor', new cc.Color(100 + cycle, 200, 120, 255));
                const afterChange = observe(entry),
                    cycleTextures = [...loaded.textures],
                    cycleMeshes = [...loaded.meshes];
                await settle();
                dispose(entry);
                loaded.destroy();
                assets.delete(loaded);
                const settlement = await settle();
                cycles.push({
                    cycle,
                    ...settlement,
                    load: { url, assetId: id(loaded), reusedSurvivorAsset: loaded === asset, completed: true },
                    beforeChange,
                    afterChange,
                    releaseCalls: 2,
                    releaseErrors: [],
                    retained: {
                        roots: entries.filter((e) => e.instance.root.isValid).length,
                        materials: survivorMaterials.filter((m) => m.isValid).length + (material.isValid ? 1 : 0),
                        textures:
                            asset.textures.filter((t) => t.isValid).length +
                            cycleTextures.filter((t) => t.isValid).length,
                        geometries:
                            asset.meshes.filter((m) => m.isValid).length + cycleMeshes.filter((m) => m.isValid).length,
                        listeners: observerListeners,
                    },
                    releasedRootValid: entry.instance.root.isValid,
                    releasedMaterialValid: material.isValid,
                    survivorBefore,
                    survivorAfter: entries.map(observe),
                    survivorBeforePixels: survivorPixelsBefore,
                    survivorAfterPixels: pixels(),
                });
            }
            cases = [
                {
                    id: 'thirty-cycles',
                    baseline: ledger,
                    cycles,
                    totalGpuMemoryBytes: null,
                    survivorCount: entries.length,
                    survivorBefore,
                    survivorAfter: entries.map(observe),
                    survivorPixelsBefore,
                    survivorPixelsAfter: pixels(),
                },
            ];
        }
        const report = {
            schema: 'upstream-agent-observation/1',
            contractId: `upstream-agent-observation/1:${taskId}`,
            taskId,
            engine: 'cocosair',
            status: 'OBSERVED_NOT_VALIDATED',
            cases,
        };
        Object.defineProperty(report, 'close', { value: close, enumerable: false });
        return report;
    } catch (error) {
        await close();
        throw error;
    }
}
