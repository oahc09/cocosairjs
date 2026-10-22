# Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
from pathlib import Path
import hashlib, json, shutil, subprocess
root=Path(__file__).resolve().parent
base=root.parent/'box3d-rebuild-20261022'
products=['src/cocos/physics/framework/physics-material-transaction.ts','src/cocos/physics/framework/components/colliders/collider.ts','src/cocos/physics/framework/physics-system.ts']
support=['src/cocos/physics/framework/physics-state-observer.ts','src/cocos/core/data/mutation-guard.ts','src/cocos/core/event/eventify.ts','src/cocos/core/event/callbacks-invoker.ts','AGENTS.md','.prettierrc.json','.prettierignore','docs/physics/box3d/contracts/shared-material-values-decisions-v1.md']
inputs={}
for rel in products+support:
    dest=root/'inputs/product'/rel
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(base/rel,dest)
    inputs[rel]={'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'bytes':dest.stat().st_size}
for rel in products:
    dest=root/rel
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(base/rel,dest)
(root/'input-manifest.json').write_text(json.dumps({'baseHead':'9df645b4a84e73c86ffd460b59cbd6e2ab732cbb','inputs':inputs},indent=2)+'\n')
p=root/products[0]; s=p.read_text()
s=s.replace('export interface PhysicsMaterialChange {','export type PhysicsMaterialSubscriptionMode = \'private\' | \'legacy\';\nexport interface PhysicsMaterialChange {\n    /** Copied trusted registration capability, never inferred from public state. */\n    readonly privateSubscriptions: boolean;')
s=s.replace('    readonly copied: PhysicsMaterialDelegate;','    readonly copied: PhysicsMaterialDelegate;\n    readonly privateSubscriptions: boolean;')
s=s.replace('        cleanup?: PhysicsMaterialCleanupObserver,\n    ): PhysicsMaterialDelegateLease {','        cleanup?: PhysicsMaterialCleanupObserver,\n        subscriptionMode?: PhysicsMaterialSubscriptionMode,\n    ): PhysicsMaterialDelegateLease {')
s=s.replace('        let copied!: PhysicsMaterialDelegate;','        let copied!: PhysicsMaterialDelegate;\n        let privateSubscriptions = false;')
s=s.replace('                copied = copyFunctions(delegate);','                const mode = subscriptionMode === undefined ? \'legacy\' : subscriptionMode;\n                if (mode !== \'private\' && mode !== \'legacy\')\n                    throw new TypeError(\'Expected private or legacy material subscription mode.\');\n                privateSubscriptions = mode === \'private\';\n                copied = copyFunctions(delegate);')
s=s.replace('entry = { original: delegate, copied, cleanup: copiedCleanup };','entry = { original: delegate, copied, privateSubscriptions, cleanup: copiedCleanup };')
s=s.replace('        const result: PhysicsMaterialChange = Object.freeze({','        const result: PhysicsMaterialChange = Object.freeze({\n            privateSubscriptions: entry.privateSubscriptions,')
s=s.replace('    cleanup?: PhysicsMaterialCleanupObserver,\n): PhysicsMaterialDelegateLease {\n    return registry.register(target, delegate, cleanup);','    cleanup?: PhysicsMaterialCleanupObserver,\n    subscriptionMode?: PhysicsMaterialSubscriptionMode,\n): PhysicsMaterialDelegateLease {\n    return registry.register(target, delegate, cleanup, subscriptionMode);')
p.write_text(s)
p=root/products[1]; s=p.read_text()
s=s.replace('// Only observed paths retain candidate listener identities for independent teardown.','// Observed paths retain legacy listeners; an empty set also selects independent private teardown.')
s=s.replace('                    change.prepare(() => ({ before: this._materialIdentity(), candidate: this._materialIdentity() }));','                    if (change.privateSubscriptions) retainObservedMaterial(this, null);\n                    change.prepare(() => ({ before: this._materialIdentity(), candidate: this._materialIdentity() }));',1)
s=s.replace('''                    retainObservedMaterial(this, previous);
                    change.effect('listener-edit-entered');
                    previous.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    observedMaterialAssets.get(this)!.delete(previous);''','''                    if (!change.privateSubscriptions) {
                        retainObservedMaterial(this, previous);
                        change.effect('listener-edit-entered');
                        previous.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                        observedMaterialAssets.get(this)!.delete(previous);
                    }''')
s=s.replace('''                    retainObservedMaterial(this, cloned);
                    cloned.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    this._isSharedMaterial = false;
                    change.effect('listeners-complete');''','''                    if (!change.privateSubscriptions) {
                        retainObservedMaterial(this, cloned);
                        cloned.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    }
                    this._isSharedMaterial = false;
                    if (!change.privateSubscriptions) change.effect('listeners-complete');''')
s=s.replace('''                change.prepare(() => ({ before: this._materialIdentity(), candidate: { kind: 'collider-material', material: value, shared: this._isSharedMaterial } }));''','''                if (change.privateSubscriptions) retainObservedMaterial(this, null);
                change.prepare(() => ({ before: this._materialIdentity(), candidate: { kind: 'collider-material', material: value, shared: this._isSharedMaterial } }));''')
s=s.replace('''                    retainObservedMaterial(this, this._material);
                    change.effect('listener-edit-entered');
                    this._material?.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    if (this._material) observedMaterialAssets.get(this)!.delete(this._material);
                    retainObservedMaterial(this, value);
                    value?.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);''','''                    if (!change.privateSubscriptions) {
                        retainObservedMaterial(this, this._material);
                        change.effect('listener-edit-entered');
                        this._material?.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                        if (this._material) observedMaterialAssets.get(this)!.delete(this._material);
                        retainObservedMaterial(this, value);
                        value?.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    }''')
s=s.replace('''                    change.effect('cache-written');
                    change.effect('listeners-complete');''','''                    change.effect('cache-written');
                    if (!change.privateSubscriptions) change.effect('listeners-complete');''')
s=s.replace('''                change.prepare(() => ({ before: this._materialIdentity(), candidate: this._materialIdentity() }));
                this._shape.onLoad!();
                retainObservedMaterial(this, this._material);
                change.effect('listener-edit-entered');
                this._material?.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                change.effect('listeners-complete');''','''                if (change.privateSubscriptions) retainObservedMaterial(this, null);
                change.prepare(() => ({ before: this._materialIdentity(), candidate: this._materialIdentity() }));
                this._shape.onLoad!();
                if (!change.privateSubscriptions) {
                    retainObservedMaterial(this, this._material);
                    change.effect('listener-edit-entered');
                    this._material?.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    change.effect('listeners-complete');
                }''')
p.write_text(s)
p=root/products[2]; s=p.read_text()
s=s.replace('''                change.effect('listener-edit-entered');
                if (this._material !== material) this._material?.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);''','''                if (!change.privateSubscriptions) {
                    change.effect('listener-edit-entered');
                    if (this._material !== material) this._material?.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                }''')
s=s.replace('''                this._material.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                change.effect('listeners-complete');''','''                if (!change.privateSubscriptions) {
                    this._material.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    change.effect('listeners-complete');
                }''')
p.write_text(s)
print(json.dumps({'inputFiles':len(inputs),'candidateProductFiles':len(products),'inputs':inputs},indent=2))
