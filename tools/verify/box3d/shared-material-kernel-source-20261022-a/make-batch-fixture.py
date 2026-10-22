from pathlib import Path
old='owner-material-native-failure';new='owner-material-batch-preflight-real-wasm'
for p in Path('tools/verify/box3d').glob(old+'*'):
 if not p.is_file():continue
 s=p.read_text().replace(old,new).replace('MATERIAL_NATIVE_FAILURE','MATERIAL_BATCH_PREFLIGHT').replace('material-native-failure','material-batch-preflight').replace('default-readback-failure','second-shape-preflight-failure').replace('PASS_LIMITED_MATERIAL_NATIVE_FAILURE','PASS_LIMITED_MATERIAL_BATCH_PREFLIGHT')
 dest=p.with_name(p.name.replace(old,new));assert not dest.exists();dest.write_text(s)
p=Path('tools/verify/box3d/'+new+'-preload.mjs');s=p.read_text().replace('nativeSetCalls: 0, injected: 0','nativeSetCalls: 0, nativePreflightReads: 0, injected: 0');s=s.replace("if (report.injection.armed && name === 'setShapeMaterial') ++report.injection.nativeSetCalls;","if (report.injection.armed && name === 'setShapeMaterial') ++report.injection.nativeSetCalls;\n                        if (report.injection.armed && name === 'getShapeMaterial') ++report.injection.nativePreflightReads;")
s=s.replace('report.injection.nativeSetCalls > 0 &&','report.injection.nativeSetCalls === 0 &&\n                            report.injection.nativePreflightReads === 2 &&').replace('readReturnedAfterWrite = true','readReturnedAfterWrite = false').replace('EXPLICIT_FIXTURE_READBACK_FAILURE_AFTER_REAL_MATERIAL_READ_RETURN','EXPLICIT_FIXTURE_SECOND_PREFLIGHT_READ_RETURNED_THEN_JS_THROW').replace('EXPLICIT_MATERIAL_READBACK_FAILURE','EXPLICIT_SECOND_PREFLIGHT_FAILURE');p.write_text(s)
p=Path('tools/verify/box3d/'+new+'.mjs');s=p.read_text();start=s.index('    scope:');end=s.index('\n    node:',start);s=s[:start]+"    scope: 'Actual AIR/System/World and current N4 WASM, two inherited native shapes. Explicit one-shot JS throw after the second real preflight read returned: verify zero setters, unchanged caches and reusable owner; then successful two-shape propagation. Not shared-value ownership wiring, browser or full Gate.',"+s[end:];p.write_text(s)
p=Path('tools/verify/box3d/'+new+'.test.ts');s=p.read_text();prefix=s[:s.index("test(")];p.write_text(prefix+'''test('all real native material preflight reads precede any setter', async () => {
    let app: AirApp | undefined, failed = false, failure: unknown;
    const checks: { id: string; pass: boolean; actual: unknown }[] = [];
    const check = (id: string, pass: boolean, actual: unknown) => checks.push({ id, pass, actual });
    try {
        registerBox3DFeature({ createLoader: () => fixture.loader });
        registerBox3DWorldAdapter(createBox3DWorldAdapter(selector, {
            collisionMask: (group) => PhysicsSystem.instance.collisionMatrix[group],
            sleepThreshold: () => PhysicsSystem.instance.sleepThreshold,
        }, undefined, { physicsSystem: () => PhysicsSystem.instance }));
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3, physics: 'box3d', physicsOptions: { box3d: { threading: 'single', workerCount: 1, solverSubSteps: 4 } } });
        game.pause(); const system = PhysicsSystem.instance, world = system.physicsWorld as Box3DPhysicsWorld;
        system.autoSimulation = false;
        const scene = new Scene('native-material-batch'); director.runSceneImmediate(scene); game.pause();
        for (let i = 0; i < 2; i++) { const n = new Node('inherited-' + i); n.setPosition(i * 4, 10, 0); n.addComponent(RigidBody); n.addComponent(BoxCollider); scene.addChild(n); }
        const binding = fixture.binding(), token = fixture.token(), shapes = fixture.shapes();
        const native = () => shapes.map((shape) => binding.getShapeMaterial(token, shape));
        const before = { native: native(), worldMaterial: world.diagnostics().material };
        const candidate = new PhysicsMaterial(); candidate.friction = 0.8;
        fixture.armNativeReadbackFailure();
        const refused = attempt(() => world.setDefaultMaterial(candidate));
        const observation = fixture.observations();
        check('second actual native preflight returned before explicit throw and no setter', shapes.length === 2 && refused.threw && refused.error?.code === 'EXPLICIT_SECOND_PREFLIGHT_FAILURE' && observation.injection.nativePreflightReads === 2 && observation.injection.nativeSetCalls === 0, { refused: errorView(refused), injection: observation.injection });
        check('preflight failure preserves both native values and world coefficient cache', JSON.stringify(native()) === JSON.stringify(before.native) && JSON.stringify(world.diagnostics().material) === JSON.stringify(before.worldMaterial), { before, after: { native: native(), worldMaterial: world.diagnostics().material } });
        check('no-effect refusal returns owner ready with all temporary scopes released', world.diagnostics().state === 'ready' && world.diagnostics().commandOwner.activeTemporaryScopes === 0, world.diagnostics());
        const success = attempt(() => world.setDefaultMaterial(candidate));
        check('next legitimate operation writes both real shapes exactly once', !success.threw && fixture.observations().injection.nativeSetCalls === 2 && native().every((v) => v.friction === Math.fround(0.8)), { success: errorView(success), native: native(), injection: fixture.observations().injection });
        check('no hidden step or unified activation', binding.stepDiagnostics(token).nativeStepIndex === 0 && !world.diagnostics().commandOwner.unifiedTransactionsSupported, world.diagnostics());
        fixture.checkpoint('native-batch-finite-verdict', { checks });
    } catch (error) { failed = true; failure = error; }
    finally {
        if (app) try { const close = await app.close!(), observations = fixture.observations(); check('actual App releases native preparation', close.status === 'released', close); check('core and bridge allocations zero', observations.beforeBindingDispose?.coreBytes === '0' && observations.beforeBindingDispose?.bridge.liveBytes === '0' && observations.beforeBindingDispose?.bridge.liveAllocations === 0, observations.beforeBindingDispose); fixture.checkpoint('native-batch-final-verdict', { checks, close }); } catch (error) { if (!failed) { failed = true; failure = error; } }
    }
    if (failed) { fixture.fail(failure); throw failure; }
    try { expect(checks.filter((c) => !c.pass)).toEqual([]); fixture.complete('PASS_LIMITED_MATERIAL_BATCH_PREFLIGHT'); } catch (error) { fixture.fail(error); throw error; }
});
''')
print('Prepared dedicated two-native-shape preflight fixture.')
