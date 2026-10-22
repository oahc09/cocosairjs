from pathlib import Path
base=Path('tools/verify/box3d');old='owner-material-cleanup-real-wasm';new='owner-material-collider-close-real-wasm'
for p in sorted(base.glob(old+'*')):
 if not p.is_file():continue
 target=base/p.name.replace(old,new);assert not target.exists();s=p.read_text().replace(old,new).replace('MATERIAL_CLEANUP','MATERIAL_COLLIDER_CLOSE').replace('material-cleanup-fixture','material-collider-close-fixture').replace('PASS_LIMITED_MATERIAL_CLEANUP','PASS_LIMITED_MATERIAL_COLLIDER_CLOSE')
 if p.name.endswith('.mjs') and not p.name.endswith('preload.mjs'):
  s=s.replace("['collider-cleanup', 'observer-lease-cleanup', 'public-default-cleanup']","['collider-close-cleanup']")
  s=s.replace('Actual AIR/Collider/System material identity and post-native cleanup failure','Actual AIR/Collider/System material identity and injected cleanup failure through original App.close lifecycle')
 target.write_text(s)
p=base/(new+'.test.ts');s=p.read_text();cut=s.index("        const cleanupCalls: string[] = [];");s=s[:cut]+'''        const beforeSetters = fixture.observations().calls.filter((v: any) => v.name === 'setShapeMaterial').length;
        const on = candidate.on;
        candidate.on = function () { throw 0; } as typeof candidate.on;
        let result: ReturnType<typeof attempt>;
        try { result = attempt(() => { collider.material = candidate; }); }
        finally { candidate.on = on; }
        check('business zero preserved before real close', result.threw && result.error === 0, errorView(result));
        const before = world.diagnostics();
        check('first world error is exact zero', before.failure.hasFailure && before.failure.error === 0, { present: before.failure.hasFailure, type: typeof before.failure.error, value: String(before.failure.error) });
        check('real candidate native material committed once', fixture.observations().calls.filter((v: any) => v.name === 'setShapeMaterial').length - beforeSetters === 1 && binding.getShapeMaterial(token, shape).friction === Math.fround(0.8), binding.getShapeMaterial(token, shape));
        const retry = attempt(() => system.step(1 / 60));
        check('faulted System refuses before native step', retry.threw && retry.error?.code === 'AIR_E_BOX3D_WORLD_FAULTED' && binding.stepDiagnostics(token).nativeStepIndex === 0, { retry: errorView(retry), native: binding.stepDiagnostics(token) });
        fixture.checkpoint('before-app-close-injection', { world: before, native: binding.stepDiagnostics(token) });
        const adapter = (collider as any)._shape;
        const update = adapter.updateEventListener, destroy = adapter.onDestroy, off = candidate.off;
        const actions: { action: string; originalReturned: boolean; injected: boolean; error?: string }[] = [];
        const once = new Set<string>();
        const invoke = (action: string, perform: () => void, injectedError: unknown): void => {
            const row = { action, originalReturned: false, injected: false, error: undefined as string | undefined };
            actions.push(row);
            try { perform(); row.originalReturned = true; }
            catch (error) { row.error = String(error); throw error; }
            if (!once.has(action)) { once.add(action); row.injected = true; throw injectedError; }
        };
        adapter.updateEventListener = function () { invoke('updateEventListener', () => update.call(this), undefined); };
        candidate.off = function (this: PhysicsMaterial, ...args: any[]) { invoke('candidate.off', () => off.apply(this, args as any), null); } as typeof candidate.off;
        adapter.onDestroy = function () { invoke('adapter.onDestroy', () => destroy.call(this), 'adapter-cleanup-secondary'); };
        // No direct callback, fake flags, manual component removal or swallowed native operation.
        // Original App.close owns scheduler/deferred/component destruction and its failure receipt.
        let close: any;
        try { closeAttempted = true; close = await app.close!(); }
        finally { adapter.updateEventListener = update; adapter.onDestroy = destroy; candidate.off = off; }
        const report = inspectPhysicsMaterialCleanup(collider);
        const observations = fixture.observations(), after = world.diagnostics();
        fixture.checkpoint('original-app-close-cleanup-outcome', { close, actions, world: after,
            reporter: report ? { consumed: report.consumed, deliveryReturned: report.deliveryReturned, errors: report.report?.errors.map((v) => ({ stage: v.stage, type: typeof v.error, value: String(v.error) })) } : null,
            owned: observations.beforeBindingDispose, loader: fixture.loader.diagnostics() });
        check('all three original cleanup operations returned before explicit injected throw', JSON.stringify(actions.filter((v) => v.injected).map((v) => v.action)) === JSON.stringify(['updateEventListener', 'candidate.off', 'adapter.onDestroy']) && actions.filter((v) => v.injected).every((v) => v.originalReturned), actions);
        check('post-unregister reporter retains first undefined and both secondary identities', !!report?.report && report.report.hasFailure && report.report.firstError === undefined && report.report.errors.length === 3 && report.report.errors[0].error === undefined && report.report.errors[1].error === null && report.report.errors[2].error === 'adapter-cleanup-secondary' && report.deliveryReturned, { errors: report?.report?.errors.map((v) => ({ stage: v.stage, type: typeof v.error, value: String(v.error) })), deliveryReturned: report?.deliveryReturned });
        check('App.close truthfully reports injected component cleanup failure rather than false release', close.status === 'failed' && close.failures.length > 0 && close.pending.includes('native-scene-destruction'), close);
        check('native preparation independently closed world and module', close.physicsPreparation.status === 'closed' && close.physicsPreparation.acquired.every((v: any) => v.cleanup === 'released'), close.physicsPreparation);
        check('world retained original business zero after terminal native teardown', after.failure.hasFailure && after.failure.error === 0 && after.state === 'destroyed', { state: after.state, present: after.failure.hasFailure, error: String(after.failure.error) });
        check('exactly one actual native world destroy and no solver replay', observations.calls.filter((v: any) => v.name === 'destroyWorld' && v.returned).length === 1 && observations.calls.filter((v: any) => v.name === 'step').length === 0, observations.calls.filter((v: any) => ['destroyWorld','step'].includes(v.name)));
        check('actual owned native core and bridge counters zero', observations.beforeBindingDispose?.coreBytes === '0' && observations.beforeBindingDispose?.bridge.liveBytes === '0' && observations.beforeBindingDispose?.bridge.liveAllocations === 0, observations.beforeBindingDispose);
        check('real loader disposed without observation errors', fixture.loader.diagnostics().status === 'DISPOSED' && observations.observationErrors.length === 0, fixture.loader.diagnostics());
        check('public unified activation remains unavailable', !after.commandOwner.stagedCommandsSupported && !after.commandOwner.unifiedTransactionsSupported, after.commandOwner);
    } catch (error) { failed = true; failure = error; }
    finally {
        if (app && !closeAttempted) { try { closeAttempted = true; fixture.checkpoint('fallback-close-after-earlier-failure', await app.close!()); } catch (error) { if (!failed) { failed = true; failure = error; } } }
        for (const asset of assets) { if (asset.isValid) asset.destroy(); }
    }
    if (!failed && checks.some((v) => !v.pass)) { failed = true; failure = new Error('App-close cleanup checks: ' + checks.filter((v) => !v.pass).map((v) => v.id).join('; ')); }
    fixture.checkpoint('final-assertions', { checks, failure: failed ? String(failure) : null, failed });
    if (failed) { fixture.fail(failure); throw failure; }
    fixture.complete('PASS_LIMITED_MATERIAL_COLLIDER_CLOSE');
});
'''
s=s.replace('let app: AirApp | undefined,','let closeAttempted = false;\n    let app: AirApp | undefined,');p.write_text(s)
