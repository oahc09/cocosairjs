from pathlib import Path
import json
root=Path('.');old='owner-system-pause-real-wasm';new='owner-shared-material-real-wasm'
for p in Path('tools/verify/box3d').glob(old+'*'):
 if not p.is_file():continue
 text=p.read_text().replace(old,new).replace('SYSTEM_PAUSE','SHARED_MATERIAL').replace('system-pause','shared-material').replace('PASS_LIMITED_SYSTEM_PAUSE','PASS_LIMITED_SHARED_MATERIAL')
 if p.suffix=='.mjs' and p.name==old+'.mjs':
  text=text.replace("['pause-lifecycle']","['invalid-negative', 'detach-public', 'owned-destroy', 'notification-order']")
  text=text.replace('finite immediate pause, manual admission, scheduling backlog, paused component assembly and successful cleanup. Explicit post-original-step fixture callback tests between-tick recheck, not physical event dispatch, browser, producer-owner, unified commands or full Gate.','finite shared-material coefficient cache, public subscription independence, ownership destroy admission and notification order. Source RED is retained as failure, not a qualification. No native injection, browser, producer-owner, unified commands or full Gate.')
  text=text.replace("'JSDOM imports actual AIR source; the one between-tick wrapper calls original world.step then the real System setter'","'JSDOM imports actual AIR source; original material entrypoints and public listener APIs; no injected native failures'")
 dest=p.with_name(p.name.replace(old,new));assert not dest.exists();dest.write_text(text)
p=Path('tools/verify/box3d/'+new+'-inputs.cjs');s=p.read_text();s=s.replace("'src/cocos/physics/framework/physics-material-transaction.ts',","'src/cocos/physics/framework/physics-material-transaction.ts',\n    'src/cocos/core/event/callbacks-invoker.ts',\n    'src/cocos/core/event/eventify.ts',");p.write_text(s)
p=Path('tools/verify/box3d/'+new+'.test.ts');s=p.read_text();prefix=s[:s.index("test('actual AIR/System")];prefix=prefix.replace("import { RigidBody }", "import { PhysicsMaterial } from '../../../src/cocos/physics/framework/assets/physics-material';\nimport { RigidBody }");prefix=prefix.replace('    observations(): any;','    shapes(): import(\'../../../src/air/physics/box3d/binding/facade.mjs\').Box3DId[];\n    observations(): any;');p.write_text(prefix+'''test('actual shared PhysicsMaterial contract before private-lane implementation', async () => {
    let app: AirApp | undefined, asset: PhysicsMaterial | undefined, failed = false, failure: unknown;
    const checks: { id: string; pass: boolean; actual: unknown }[] = [];
    const check = (id: string, pass: boolean, actual: unknown) => checks.push({ id, pass, actual });
    try {
        registerBox3DFeature({ createLoader: () => fixture.loader });
        registerBox3DWorldAdapter(createBox3DWorldAdapter(selector, {
            collisionMask: (group) => PhysicsSystem.instance.collisionMatrix[group],
            sleepThreshold: () => PhysicsSystem.instance.sleepThreshold,
        }, undefined, { physicsSystem: () => PhysicsSystem.instance }));
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3, physics: 'box3d',
            physicsOptions: { box3d: { threading: 'single', workerCount: 1, solverSubSteps: 4 } } });
        game.pause();
        const system = PhysicsSystem.instance, world = system.physicsWorld as Box3DPhysicsWorld;
        system.autoSimulation = false;
        const scene = new Scene('shared-material-' + fixture.expected);
        director.runSceneImmediate(scene); game.pause();
        asset = new PhysicsMaterial(); asset.friction = 0.3;
        const binding = fixture.binding(), token = fixture.token();
        const notifications: unknown[] = [];
        if (fixture.expected === 'notification-order') asset.on(PhysicsMaterial.EVENT_UPDATE, () => {
            notifications.push(fixture.shapes().map((shape) => binding.getShapeMaterial(token, shape)));
        });
        const colliders: BoxCollider[] = [];
        for (let i = 0; i < 2; i++) {
            const node = new Node('shared-consumer-' + i); node.setPosition(i * 4, 10, 0);
            node.addComponent(RigidBody); const collider = node.addComponent(BoxCollider);
            collider.sharedMaterial = asset; scene.addChild(node); colliders.push(collider);
        }
        const shapes = fixture.shapes(), materials = () => shapes.map((shape) => binding.getShapeMaterial(token, shape));
        check('two actual active native shapes share exact asset identity', shapes.length === 2 && colliders.every((c) => c.sharedMaterial === asset), { shapes: shapes.length, materials: materials() });
        const before = { friction: asset.friction, materials: materials(), flags: (asset as any)._objFlags };
        let result: ReturnType<typeof attempt>;
        if (fixture.expected === 'invalid-negative') {
            result = attempt(() => { asset!.friction = -1; });
            check('invalid owned coefficient refused before actual asset cache changes', result.threw && asset.friction === before.friction, { result: view(result), before, actual: asset.friction, native: materials(), owner: world.diagnostics() });
        } else if (fixture.expected === 'detach-public') {
            asset.removeAll(PhysicsMaterial.EVENT_UPDATE);
            result = attempt(() => { asset!.friction = 0.8; });
            const native = materials();
            check('public notification removal cannot detach physical propagation', !result.threw && native.every((m) => m.friction === Math.fround(0.8)), { result: view(result), native, actual: asset.friction, owner: world.diagnostics() });
        } else if (fixture.expected === 'owned-destroy') {
            let returned: boolean | undefined;
            result = attempt(() => { returned = asset!.destroy(); });
            check('still-owned asset destroy refuses before deferred flags and registry mutation', result.threw && (asset as any)._objFlags === before.flags && PhysicsMaterial.allMaterials.includes(asset), { result: view(result), returned, beforeFlags: before.flags, actualFlags: (asset as any)._objFlags, remainsRegistered: PhysicsMaterial.allMaterials.includes(asset), native: materials(), owner: world.diagnostics() });
        } else {
            result = attempt(() => { asset!.friction = 0.8; });
            const observed = notifications as {friction: number; restitution: number}[][];
            check('public listener registered first sees all physical propagation already completed', !result.threw && observed.length === 1 && observed[0].every((m) => m.friction === Math.fround(0.8)), { result: view(result), notifications, actual: asset.friction, finalNative: materials(), owner: world.diagnostics() });
        }
        check('no hidden physics step or unified activation', binding.stepDiagnostics(token).nativeStepIndex === 0 && !world.diagnostics().commandOwner.unifiedTransactionsSupported, world.diagnostics());
        fixture.checkpoint('source-contract-verdict-before-close', { expected: fixture.expected, checks });
    } catch (error) { failed = true; failure = error; }
    finally {
        if (app) {
            try {
                const close = await app.close!(), observations = fixture.observations();
                check('actual App close releases native preparation', close.status === 'released', close);
                check('actual core and bridge allocations reach zero', observations.beforeBindingDispose?.coreBytes === '0' && observations.beforeBindingDispose?.bridge.liveBytes === '0' && observations.beforeBindingDispose?.bridge.liveAllocations === 0, observations.beforeBindingDispose);
                fixture.checkpoint('source-contract-final-verdict', { expected: fixture.expected, checks, close });
            } catch (error) { if (!failed) { failed = true; failure = error; } }
        }
        try { asset?.destroy(); } catch (error) { fixture.checkpoint('post-close-asset-cleanup-error', { error: String(error) }); }
    }
    if (failed) { fixture.fail(failure); throw failure; }
    try { expect(checks.filter((x) => !x.pass)).toEqual([]); fixture.complete('PASS_LIMITED_SHARED_MATERIAL'); }
    catch (error) { fixture.fail(error); throw error; }
});
''')
print('Created seven independent actual-source RED fixture files; product unchanged.')
