from pathlib import Path
r=Path('/workspace/scratch/62d43a81bbde/box3d-rebuild-20261022')
c=r.parent/'box3d-pause-owner-candidate-20261022'
p=c/'world-command-owner.ts';s=p.read_text()
s=s.replace("import { Box3DCommandQueue } from './command-queue';", "import { Box3DCommandQueue } from './command-queue';\nimport type { PreparedCommandPause } from './command-queue';\nimport { registerPhysicsSystemControl } from '../../../cocos/physics/framework/physics-system-control';\nimport type { PhysicsSystemControlLease, PhysicsSystemControlState } from '../../../cocos/physics/framework/physics-system-control';")
s=s.replace("| 'material' | 'faulted'", "| 'material' | 'control' | 'faulted'")
s=s.replace("    #materialContext:", "    #systemControlLease: PhysicsSystemControlLease | null = null;\n    #systemPaused = false;\n    readonly #controlCleanups = new Set<() => void>();\n    #lastControl: Readonly<{ operation: string; cacheEnabled: boolean | null; cacheAutoSimulation: boolean | null; queueCommitEntered: boolean; queueCommitReturned: boolean; failed: boolean; actualRead: string }> | null = null;\n    #materialContext:")
anchor='    validateDefaultMaterial(material: PhysicsMaterial): void {'
insert='''    /** Register against the original System source while construction still precedes selector assignment.
     * Only later execution/transition admission requires the live System/world binding.
     * The queue is an actual owner participant. Producers are not yet installed and are not
     * represented by an empty, allegedly-qualified roster.
     */
    installSystemControlObservation(fault: (error: unknown) => void): void {
        if (this.#systemControlLease)
            throw worldError('AIR_E_BOX3D_CONFIG', 'System observation', 'Already installed.');
        let context: Readonly<PhysicsStateChangeContext> | null = null;
        let scope: Box3DOwnerFenceScope | null = null;
        let transition: PreparedCommandPause | null = null;
        let expected: PhysicsSystemControlState | null = null;
        let entered = false, returned = false, failed = false, failure: unknown;
        const requireContext = (value: Readonly<PhysicsStateChangeContext>): void => {
            if (value !== context || !scope || this.#phase !== 'control')
                throw worldError('AIR_E_BOX3D_REENTRANT', 'System observation', 'Inactive private control context.');
        };
        const remember = (actual: PhysicsSystemControlState | null, actualRead: string): void => {
            this.#lastControl = Object.freeze({
                operation: context?.operation ?? 'system-initial-state',
                cacheEnabled: actual?.enabled ?? null,
                cacheAutoSimulation: actual?.autoSimulation ?? null,
                queueCommitEntered: entered,
                queueCommitReturned: returned,
                failed,
                actualRead,
            });
        };
        const cleanup = (): void => {
            let cleanupFailed = false, first: unknown;
            try {
                transition?.dispose();
                transition = null;
            } catch (error) {
                this.#recordCleanup('system-control-queue-dispose', error);
                cleanupFailed = true; first = error;
            }
            try {
                scope?.dispose();
                scope = null;
            } catch (error) {
                // Scope records each actual leaf error itself.
                if (!cleanupFailed) first = error;
                cleanupFailed = true;
            }
            if (cleanupFailed) {
                fault(failed ? failure : first);
                throw first;
            }
            context = null;
            expected = null;
            this.#controlCleanups.delete(cleanup);
        };
        const lease = registerPhysicsSystemControl(this.#system, {
            open: (value) => {
                context = value;
                entered = returned = failed = false;
                failure = undefined;
                this.#controlCleanups.add(cleanup);
                scope = this.#begin('control');
            },
            preflight: (value, before, candidate) => {
                requireContext(value);
                if (before.kind !== 'system-control' || candidate.kind !== 'system-control' ||
                    before.enabled === this.#systemPaused ||
                    (value.operation === 'system-enable' && before.autoSimulation !== candidate.autoSimulation) ||
                    (value.operation === 'system-auto-simulation' && before.enabled !== candidate.enabled))
                    throw worldError('AIR_E_BOX3D_CONFIG', 'System control preflight', 'Inconsistent copied control state.');
                expected = candidate;
                // Allocate and reserve every installed participant before System writes its cache.
                if (value.operation === 'system-enable')
                    transition = this.#queue.preparePauseTransition(!candidate.enabled);
            },
            commit: (value, actual) => {
                requireContext(value);
                if (actual.kind !== 'system-control' || !expected ||
                    actual.enabled !== expected.enabled || actual.autoSimulation !== expected.autoSimulation)
                    throw worldError('AIR_E_BOX3D_CONFIG', 'System control commit', 'Actual private cache does not match candidate.');
                if (transition) {
                    entered = true;
                    transition.commit();
                    returned = true;
                    this.#systemPaused = !actual.enabled;
                }
                remember(actual, 'copied');
            },
            fail: (_value, report) => {
                if (!failed) { failed = true; failure = report.error; }
                remember(report.actual?.kind === 'system-control' ? report.actual : null, report.actualRead);
                // A rejected input before cache/effect entry is recoverable. Any changed/unknown
                // cache or entered participant commit faults; never pretend metadata was rolled back.
                if (report.effects.length || entered) fault(failure);
            },
            dispose: () => cleanup(),
        }, () => this.systemControlDisposition());
        this.#systemControlLease = lease;
        const initial = lease.initialState;
        if (!initial.enabled) {
            const initialTransition = this.#queue.preparePauseTransition(true);
            try {
                initialTransition.commit();
                this.#systemPaused = true;
            } finally { initialTransition.dispose(); }
        }
    }
    systemControlDisposition(): 'ready' | 'paused' {
        this.assertConfiguration('System execution admission');
        this.assertSystemBinding();
        return this.#systemPaused ? 'paused' : 'ready';
    }
    assertSteppingAllowed(operation: string): void {
        if (this.systemControlDisposition() === 'paused')
            throw worldError('AIR_E_BOX3D_CONFIG', operation, 'The observed PhysicsSystem owner is paused.');
    }
'''
assert anchor in s;s=s.replace(anchor,insert+anchor)
s=s.replace("phase: 'preflight' | 'dispatch' | 'material',", "phase: 'preflight' | 'dispatch' | 'material' | 'control',")
s=s.replace("    beginStep(): Box3DOwnerFenceScope {\n        return", "    beginStep(): Box3DOwnerFenceScope {\n        this.assertSteppingAllowed('begin step');\n        return")
s=s.replace("        for (const cleanup of [...this.#materialCleanups]) attempt(cleanup);", "        for (const cleanup of [...this.#controlCleanups]) attempt(cleanup);\n        attempt(() => {\n            try { this.#systemControlLease?.dispose(); }\n            catch (error) { this.#recordCleanup('system-control-unregister', error); throw error; }\n            this.#systemControlLease = null;\n        });\n        for (const cleanup of [...this.#materialCleanups]) attempt(cleanup);")
s=s.replace("            stagedCommandsSupported: false,", "            systemControl: Object.freeze({\n                observed: !!this.#systemControlLease, paused: this.#systemPaused,\n                queuePhase: this.#queue.diagnostics().phase, preparedQueueControl: this.#queue.diagnostics().preparedControl,\n                unresolvedScopes: this.#controlCleanups.size, lastChange: this.#lastControl,\n                producers: 'NOT_INTEGRATED',\n            }),\n            stagedCommandsSupported: false,")
p.write_text(s)
p=c/'world.ts';s=p.read_text();needle="            );\n        } catch (error) {\n            this.fault(error);\n            throw error;\n        }\n    }\n    private assertReadyState"
replacement="            );\n            this.#commandOwner.installSystemControlObservation((error) => {\n                this.invalidatePending();\n                this.fault(error);\n            });\n        } catch (error) {\n            this.fault(error);\n            throw error;\n        }\n    }\n    private assertReadyState"
assert needle in s;s=s.replace(needle,replacement,1)
s=s.replace("        this.assertReady('step');", "        this.assertReady('step');\n        this.#commandOwner.assertSteppingAllowed('step');",1)
p.write_text(s)
print('owner/world candidates updated, not landed')
