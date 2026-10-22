# T10 body-control observation correction

Status: SOURCE_ONLY_MOCK_CONTROL. No native, public component, browser, complete T10/T11 or C36 acceptance follows.

The preceding b-red run retains its exact source and original exit 1: two actual AIR world-diagnostics assertions failed. A known pre-mutation argument rejection incorrectly invalidated the completed observation; an unclassified native error after a simulated mutation incorrectly left the world ready.

This correction invalidates only after successful body control, or on an uncertain/post-write failure before faulting. The specified argument, locked-world and pending-mass rejection codes preserve diagnostics and pending events. Generic AIR_E_BOX3D_NATIVE is deliberately uncertain because both pre-mutation native status and post-mutation readback can emit it. It faults conservatively until a qualified facade phase marker distinguishes these cases. This is an open native contract boundary, not full setter rollback qualification.

Last-reference release now commits reference deletion only after native destruction succeeds. Failure faults the owner and leaves the registered shared body for world cleanup. Constructor threshold validation precedes allocation; a successful allocation immediately invalidates the prior observation even if later initialization rolls back the allocation.

Seventeen source-control tests use explicit native/Node mocks, including actual Box3DPhysicsWorld diagnostics and its pending-event/step path. They are not real physics. The earlier 34 world-control mocks are a retained regression subset. Registration remains unchanged and components remain unsupported on the public/default path. The a snapshot and b-red evidence are immutable.
