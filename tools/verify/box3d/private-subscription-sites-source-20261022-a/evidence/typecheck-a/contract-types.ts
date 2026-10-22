
 import { PhysicsMaterialTransactionRegistry, registerPhysicsMaterialDelegate } from './physics-material-transaction';
 import type { PhysicsMaterialDelegate, PhysicsMaterialCleanupObserver, PhysicsMaterialChange } from './physics-material-transaction';
 declare const target: object, delegate: PhysicsMaterialDelegate, cleanup: PhysicsMaterialCleanupObserver;
 const registry = new PhysicsMaterialTransactionRegistry();
 registry.register(target, delegate);
 registry.register(target, delegate, cleanup);
 registry.register(target, delegate, undefined, 'private');
 registerPhysicsMaterialDelegate(target, delegate, cleanup, 'legacy');
 // @ts-expect-error Fourth mode remains the exact trusted literal union.
 registry.register(target, delegate, cleanup, 'PRIVATE');
 // @ts-expect-error Cleanup remains third, not subscription mode.
 registry.register(target, delegate, 'private');
 declare const change: PhysicsMaterialChange;
 const capability: boolean = change.privateSubscriptions;
 // @ts-expect-error The copied capability is readonly.
 change.privateSubscriptions = false;
 