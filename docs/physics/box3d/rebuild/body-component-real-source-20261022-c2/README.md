# T10 validated initial body configuration source checkpoint

Status: SOURCE_ONLY_MOCK_CONTROL. This is the current corrected source checkpoint, not native/component acceptance.

It retains the full boundaries and preflight behavior described in the immutable c checkpoint. That prior run has an explicit failed TypeScript check (exit 2) because Array.flat is unavailable in the project's declared library. This version uses equivalent nested Array.some calls, without changing tsconfig, the rejection condition or an assertion. The c raw failures remain retained; this is a new run, not a relabelled result.

The 29 mock controls exercise actual AIR world/shared-body/IRigidBody source, including full initial serialized-field preflight, actual world diagnostics, pending geometry recovery, native-origin Node writeback, fixed control allowlisting and cleanup. Existing collider ownership is still represented by a mock reference, not a real collider. The actual existing-collider/native-WASM case remains pending shape/filter integration. The 34 original world-control mocks remain a separate regression subset. Public/default registration remains unchanged and unsupported.
