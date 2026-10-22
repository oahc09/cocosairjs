from pathlib import Path
r=Path('/workspace/scratch/62d43a81bbde/box3d-rebuild-20261022')
def edit(name,fn):
 p=r/name;s=p.read_text();s=fn(s);p.write_text(s)
def rep(s,a,b):
 assert s.count(a)==1,(a[:100],s.count(a));return s.replace(a,b)
def owner(s):
 s=rep(s,"type CopiedMaterialApplication =", """import { CCObjectFlags } from '../../../cocos/core/data/object';
import { registerPhysicsMaterialValuesOwner } from '../../../cocos/physics/framework/physics-material-values';
import type { MaterialValuesContext, MaterialValuesCopied, MaterialValuesOwnerLease,
    PreparedMaterialMembership, PreparedMaterialOwnerPlan, MaterialValuesDiagnostics } from '../../../cocos/physics/framework/physics-material-values-transaction';

export interface Box3DPreparedComponentMaterial {
    readonly shape: Box3DId | null;
    commitCaches(): void;
}
type PrepareComponentMaterial = (authority: object, material: Readonly<Box3DSurfaceMaterial>) => Box3DPreparedComponentMaterial;
type PrepareWorldMaterial = (material: Readonly<Box3DSurfaceMaterial>, includeDefault: boolean,
    components: readonly Box3DPreparedComponentMaterial[]) => PreparedMaterialOwnerPlan;

type CopiedMaterialApplication =""")
 s=rep(s,'    readonly applyMaterial?: CopiedMaterialApplication;','    readonly applyMaterial?: CopiedMaterialApplication;\n    readonly prepareMaterialValues?: PrepareComponentMaterial;')
 s=rep(s,'    material: PhysicsMaterial | null;\n    initialized: boolean;', '    material: PhysicsMaterial | null;\n    readonly prepareMaterialValues?: PrepareComponentMaterial;\n    initialized: boolean;')
 s=rep(s,'    readonly #system: PhysicsSystem;', '''    readonly #generation: number;
    #valuesLease: MaterialValuesOwnerLease | null = null;
    #valuesContext: MaterialValuesContext | null = null;
    #valuesScope: Box3DOwnerFenceScope | null = null;
    readonly #valuesAuthorities = new WeakMap<object, Readonly<{ key: object; material: Readonly<Box3DSurfaceMaterial>; context: MaterialValuesContext }>>();
    #lastValues: Readonly<{ sequence: number; actual: readonly number[] | null; failed: boolean; failure?: MaterialValuesDiagnostics }> | null = null;
    readonly #system: PhysicsSystem;''')
 s=rep(s,'        this.#system = system;','        this.#generation = generation;\n        this.#system = system;')
 s=rep(s,'            applyMaterial = seed.applyMaterial;','            applyMaterial = seed.applyMaterial,\n            prepareMaterialValues = seed.prepareMaterialValues;')
 s=rep(s,'        return Object.freeze({ adapter, component, kind, material, applyMaterial });','''        if (material) this.#assertMaterialLive(material);
        if (kind === 'collider' && this.#valuesLease && typeof prepareMaterialValues !== 'function')
            throw worldError('AIR_E_BOX3D_CONFIG', 'component identity admission', 'Missing private material-value preparation.');
        return Object.freeze({ adapter, component, kind, material, applyMaterial, prepareMaterialValues });''')
 s=rep(s,'        const { adapter, component, kind, material, applyMaterial } = this.copyComponentSeed(', '        const { adapter, component, kind, material, applyMaterial, prepareMaterialValues } = this.copyComponentSeed(')
 s=rep(s,'            kind,\n            material,\n            initialized: false,','            kind,\n            material,\n            prepareMaterialValues,\n            initialized: false,')
 s=rep(s,'                this.#registerMaterial(adapter, component as Collider, applyMaterial!);','''                if (this.#valuesLease && material)
                    this.#valuesLease.prepareMembership({ binding: adapter, before: null, after: material, role: 'explicit', initialized: false }).publish(material);
                this.#registerMaterial(adapter, component as Collider, applyMaterial!);''')
 s=rep(s,'            } catch (error) {\n                this.#components.delete(adapter);','''            } catch (error) {
                try {
                    if (this.#valuesLease && material)
                        this.#valuesLease.prepareMembership({ binding: adapter, before: material, after: null, role: 'explicit', initialized: false }).publish(null);
                } catch (cleanupError) { this.#recordCleanup('provisional-material-membership', cleanupError); this.#materialFault?.(error); }
                this.#components.delete(adapter);''')
 s=rep(s,'    installMaterialObservation(applyDefault: CopiedMaterialApplication, fault: (error: unknown) => void): void {','    installMaterialObservation(applyDefault: CopiedMaterialApplication, fault: (error: unknown) => void, prepareValues?: PrepareWorldMaterial): void {')
 s=rep(s,'        this.#materialFault = fault;\n        this.#registerMaterial(this.#system, this.#system, applyDefault);','''        this.#materialFault = fault;
        if (prepareValues) this.#installMaterialValues(prepareValues);
        this.#registerMaterial(this.#system, this.#system, applyDefault);''')
 marker='    /** Register against the original System source while construction still precedes selector assignment.'
 methods='''    #assertMaterialLive(asset: object): asserts asset is PhysicsMaterial {
        if (!(asset instanceof PhysicsMaterial) || typeof asset._objFlags !== 'number' ||
            (asset._objFlags & (CCObjectFlags.Destroyed | CCObjectFlags.ToDestroy | CCObjectFlags.Destroying)))
            throw worldError('AIR_E_BOX3D_DISPOSED', 'material ownership', 'Expected a live, non-destroying PhysicsMaterial.');
    }
    #requireValues(context: MaterialValuesContext): void {
        if (this.#valuesContext !== context || this.#phase !== 'material' || !this.#valuesScope)
            throw worldError('AIR_E_BOX3D_REENTRANT', 'private material values', 'No current private value scope.');
    }
    consumeMaterialValuesPreparation(authority: object, key: object, material: Readonly<Box3DSurfaceMaterial>): () => void {
        const entry = this.#valuesAuthorities.get(authority);
        if (!entry || entry.key !== key || entry.material !== material)
            throw worldError('AIR_E_BOX3D_REENTRANT', 'material value preparation', 'No exact private preparation authority.');
        this.#requireValues(entry.context);
        this.#valuesAuthorities.delete(authority);
        return () => { this.#requireValues(entry.context); this.assertSystemBinding(); };
    }
    #installMaterialValues(prepareWorld: PrepareWorldMaterial): void {
        this.#valuesLease = registerPhysicsMaterialValuesOwner(this.#world, this.#generation, {
            admitAsset: (asset) => this.#assertMaterialLive(asset),
            open: (context) => {
                this.#valuesContext = context;
                this.#valuesScope = this.#begin('material', [context.asset as PhysicsMaterial]);
            },
            prepare: (context, copied: MaterialValuesCopied) => {
                this.#requireValues(context);
                const material = copySurfaceMaterial({ friction: copied.native[0], restitution: copied.native[1] });
                let includeDefault = false;
                const components: Box3DPreparedComponentMaterial[] = [];
                for (const binding of context.bindings) {
                    if (binding.binding === this.#system) {
                        if (binding.role !== 'default' || this.#defaultMaterial !== context.asset)
                            throw worldError('AIR_E_BOX3D_CONFIG', 'default value roster', 'Stale default ownership.');
                        includeDefault = true;
                    } else {
                        const record = this.#component(binding.binding);
                        if (binding.role !== 'explicit' || record.kind !== 'collider' || !record.initialized ||
                            record.material !== context.asset || !record.prepareMaterialValues)
                            throw worldError('AIR_E_BOX3D_CONFIG', 'component value roster', 'Stale or provisional explicit ownership.');
                        const authority = Object.freeze({});
                        this.#valuesAuthorities.set(authority, { key: binding.binding, material, context });
                        try { components.push(record.prepareMaterialValues(authority, material)); }
                        finally { this.#valuesAuthorities.delete(authority); }
                    }
                }
                const plan = prepareWorld(material, includeDefault, Object.freeze(components));
                // Full membership/native preflight still applies to a no-change call; it performs no setters/cache commit.
                return copied.changed ? plan : Object.freeze({ native: Object.freeze([]), commitCaches() {} });
            },
            commit: (context, actual) => {
                this.#requireValues(context);
                this.#lastValues = Object.freeze({ sequence: context.sequence, actual, failed: false });
            },
            fault: (context, failure) => {
                this.#lastValues = Object.freeze({ sequence: context.sequence, actual: failure.actual, failed: true, failure });
                this.#materialFault!(failure.error);
            },
            dispose: (context) => {
                if (this.#valuesContext !== context) throw worldError('AIR_E_BOX3D_REENTRANT', 'value cleanup', 'Foreign cleanup context.');
                try { this.#valuesScope?.dispose(); }
                catch (error) { this.#recordCleanup('material-value-scope-dispose', error); this.#materialFault!(error); throw error; }
                this.#valuesScope = null;
                this.#valuesContext = null;
            },
        });
    }
'''
 s=rep(s,marker,methods+marker)
 s=rep(s,'        const guards = new Map<object, MutationGuardLease>();','''        const guards = new Map<object, MutationGuardLease>();
        let membership: PreparedMaterialMembership | null = null;
        let preparedAsset: object | null | undefined;
        let preserveMembership = false;
        const previousAsset = () => key === this.#system ? this.#defaultMaterial : this.#component(key).material;
        const prepareMembership = (asset: object | null, initialize: boolean): void => {
            if (!this.#valuesLease) return;
            if (membership && preparedAsset === asset) return;
            membership?.cancel();
            membership = null;
            preparedAsset = undefined;
            membership = this.#valuesLease.prepareMembership({ binding: key, before: previousAsset(), after: asset,
                role: key === this.#system ? 'default' : 'explicit', initialized: key === this.#system || initialize || this.#component(key).initialized });
            preparedAsset = asset;
        };''')
 s=rep(s,'            for (const [asset, guard] of guards) {','''            if (membership && !preserveMembership) {
                try { membership.cancel(); membership = null; preparedAsset = undefined; }
                catch (error) { this.#recordCleanup('material-membership-cancel', error); primary = error; failed = true; }
            }
            for (const [asset, guard] of guards) {''')
 s=rep(s,'                    businessFailure = undefined;\n                    this.#materialCleanups.add(cleanup);','''                    businessFailure = undefined;
                    preserveMembership = false;
                    this.#materialCleanups.add(cleanup);''')
 s=rep(s,'                    if (!guards.has(asset)) guards.set(asset, registerMutationGuard([asset], rejection));','''                    this.#assertMaterialLive(asset);
                    if (!guards.has(asset)) guards.set(asset, registerMutationGuard([asset], rejection));
                    if (value.operation === 'collider-material-clone' && asset !== previousAsset())
                        prepareMembership(asset, false);''')
 s=rep(s,'                        : null;\n                },\n                applyCopied:', '''                        : null;
                    prepareMembership(candidate.asset, value.operation === 'collider-material-initialize');
                },
                applyCopied:''')
 s=rep(s,"                    if (key === this.#system) this.#defaultMaterial = actual.material as PhysicsMaterial;", '''                    if (membership) {
                        if (actual.material !== preparedAsset) throw worldError('AIR_E_BOX3D_CONFIG', 'material membership', 'Actual identity differs from prepared identity.');
                        membership.publish(actual.material);
                        membership = null;
                        preparedAsset = undefined;
                    }
                    if (key === this.#system) this.#defaultMaterial = actual.material as PhysicsMaterial;''')
 s=rep(s,'                    const actual = failure.actual;','''                    preserveMembership = failure.effects.length > 0 || value.operation === 'collider-material-initialize';
                    const actual = failure.actual;''')
 s=rep(s,'                    if (report.hasFailure) this.#materialFault!(report.firstError);\n                },\n            },\n        );','''                    if (report.hasFailure) this.#materialFault!(report.firstError);
                },
            },
            this.#valuesLease ? 'private' : 'legacy',
        );''')
 s=rep(s,'        this.#materialLeases.get(adapter)?.dispose();','''        const component = this.#components.get(adapter);
        if (this.#valuesLease && this.#phase === 'idle' && component?.material)
            this.#valuesLease.prepareMembership({ binding: adapter, before: component.material, after: null,
                role: 'explicit', initialized: component.initialized }).publish(null);
        // Faulted native cleanup is not a release proof. Keep its roster until confirmed world teardown.
        this.#materialLeases.get(adapter)?.dispose();''')
 s=rep(s,'        for (const cleanup of [...this.#materialCleanups]) attempt(cleanup);','''        for (const cleanup of [...this.#materialCleanups]) attempt(cleanup);
        attempt(() => {
            this.#valuesScope?.dispose();
            this.#valuesScope = null;
            this.#valuesContext = null;
        });
        attempt(() => this.#valuesLease?.close(nativeTeardownConfirmed ? 'released' : 'unknown'));''')
 s=rep(s,'            pendingCommands: this.#queue.diagnostics().pending.length,','''            pendingCommands: this.#queue.diagnostics().pending.length,
            privateMaterialValues: Object.freeze({ observed: !!this.#valuesLease, roster: this.#valuesLease?.diagnostics() ?? null, last: this.#lastValues }),''')
 return s
edit('src/air/physics/box3d/world-command-owner.ts',owner)
def shared(s):
 s=rep(s,'    unregisterShapeMaterial(shape: Box3DId): void;','''    consumeMaterialValuesPreparation(adapter: object, authority: object, value: Readonly<Box3DSurfaceMaterial>): () => void;
    unregisterShapeMaterial(shape: Box3DId): void;''')
 marker='    updateShapeMaterial(reference: object, value: Box3DSurfaceMaterial | null): void {'
 s=rep(s,marker,'''    /** Private read-only preparation. The returned cache commit contains no native setter. */
    prepareMaterialValues(reference: object, authority: object, value: Readonly<Box3DSurfaceMaterial>) {
        const assertCurrent = this.#owner.consumeMaterialValuesPreparation(reference, authority, value);
        if (this.#closed || !this.#references.has(reference))
            throw worldError('AIR_E_BOX3D_DISPOSED', 'prepare shape material', 'Unknown live adapter.');
        const previous = this.#shapes.get(reference);
        const next = previous ? { token: previous.token, geometry: Object.freeze({ ...previous.geometry, material: value }) } : undefined;
        let committed = false;
        return Object.freeze({ shape: previous?.token ?? null, commitCaches: () => {
            assertCurrent();
            if (committed || this.#closed || !this.#references.has(reference) || this.#shapes.get(reference) !== previous)
                throw worldError('AIR_E_BOX3D_REENTRANT', 'commit shape material', 'Consumed or stale prepared cache.');
            committed = true;
            if (next) this.#shapes.set(reference, next);
        } });
    }
'''+marker)
 return s
edit('src/air/physics/box3d/shared-body.ts',shared)
def shape(s):
 a='''            applyMaterial: (authority, copied) => {
                this.body.applyCopiedMaterial(this, authority, copied);
                this.#material = copied;
                this.#geometry = Object.freeze({ ...this.#geometry!, material: copied });
            },'''
 b=a+'''
            prepareMaterialValues: (authority, copied) => {
                const body = this.body;
                const plan = body.prepareMaterialValues(this, authority, copied);
                const previous = this.#geometry;
                if (!previous) throw worldError('AIR_E_BOX3D_CONFIG', 'prepare material geometry', 'Missing initialized geometry.');
                const next = Object.freeze({ ...previous, material: copied });
                let committed = false;
                return Object.freeze({ shape: plan.shape, commitCaches: () => {
                    if (committed || this.#body !== body || this.#geometry !== previous)
                        throw worldError('AIR_E_BOX3D_REENTRANT', 'commit material geometry', 'Consumed or stale geometry.');
                    committed = true;
                    plan.commitCaches();
                    this.#material = copied;
                    this.#geometry = next;
                } });
            },'''
 return rep(s,a,b)
edit('src/air/physics/box3d/box-sphere-shape.ts',shape)
def world(s):
 a='''                (error) => {
                    this.invalidatePending();
                    this.fault(error);
                },
            );'''
 b='''                (error) => {
                    this.invalidatePending();
                    this.fault(error);
                },
                (material, includeDefault, components) => {
                    const updates = components.filter((component) => component.shape !== null)
                        .map((component) => ({ shape: component.shape!, material, inheritsDefault: false }));
                    if (includeDefault)
                        for (const [shape, inherited] of this.#materialShapes)
                            if (inherited) updates.push({ shape, material, inheritsDefault: true });
                    const plan = this.#prepareMaterialBatch(updates, includeDefault ? material : undefined);
                    return Object.freeze({ native: plan.native, commitCaches: () => {
                        plan.commitCaches();
                        for (const component of components) component.commitCaches();
                    } });
                },
            );'''
 s=rep(s,a,b)
 s=rep(s,'                    unregisterShapeMaterial: (shape) => this.unregisterMaterialShape(shape),','''                    consumeMaterialValuesPreparation: (adapter, authority, value) =>
                        this.#commandOwner.consumeMaterialValuesPreparation(authority, adapter, value),
                    unregisterShapeMaterial: (shape) => this.unregisterMaterialShape(shape),''')
 return s
edit('src/air/physics/box3d/world.ts',world)
print('WROTE_UNQUALIFIED_PRIVATE_MATERIAL_COMPOSITE')
