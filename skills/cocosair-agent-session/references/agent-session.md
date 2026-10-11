Derived from tools/debug/agent-session.ts, tools/dev/dev-server.cjs, examples/automation/main.ts, src/air/diagnostics.ts on 2026-10-10.

# Agent session request protocol (devtools face)

Everything here lives in `tools/debug/**` and is served by the dev server. It is NOT on the `cocosair` runtime export and must not be imported from `cocosair` in shipped app code.

## Attach

`createAgentSession(options)` is the explicit attach factory (`tools/debug/agent-session.ts:935`). The options shape is `{ app, writableScenes?, errorBufferLimit?, requestIdWindow?, captureTimeoutMs? }` (`tools/debug/agent-session.ts:139-149`):

- `app` is the `AirApp` instance, normally the same object the page published as `window.__airApp`.
- `writableScenes` is the explicit write scope. Omitted or empty means read-only, and any write to a node outside the listed scenes fails with `OUT_OF_SCOPE` (`tools/debug/agent-session.ts:141`, `:366-376`).
- Defaults: error buffer 200 (`DEFAULT_ERROR_LIMIT`, `:163`), requestId window 256 (`DEFAULT_REQUEST_WINDOW`, `:164`), capture timeout 5000ms (`DEFAULT_CAPTURE_TIMEOUT`, `:165`).

The dev server compiles these entries on demand and mounts them under `/__debug/`, keeping `cocosair` external so the session shares the page's single engine instance (`tools/dev/dev-server.cjs:193`, `:207`, `:337-341`). The automation example attaches with `await import('/__debug/agent-session.js')` (`examples/automation/main.ts:50`) and then `createAgentSession({ app, writableScenes: [scene] })` (`examples/automation/main.ts:89`).

## Single-request shape

One request is `AgentRequest { requestId: string; action: string; targetId?: string; params?: Record<string, unknown> }` (`tools/debug/agent-session.ts:48-53`). `dispatch(request)` returns a `Promise<AgentResponse>` where the response is a tagged union of two arms (`tools/debug/agent-session.ts:665`, `:60-68`): success is `{ requestId: string; ok: true; result: unknown }`, and failure is `{ requestId: string; ok: false; error: { code: AgentErrorCode; message: string; cause?: { code?: string; message?: string } } }`.

A missing or non-string `requestId`/`action` is itself rejected as `INVALID_ARGUMENT` (`tools/debug/agent-session.ts:669-672`). A closed session short-circuits every request to `SESSION_CLOSED` (`tools/debug/agent-session.ts:666-668`). Non-`AgentSessionError` throws from an action surface as `LOAD_FAILED` with the raw message preserved (`tools/debug/agent-session.ts:697-705`).

## Error codes

`AgentErrorCode` is the frozen minimal set (`tools/debug/agent-session.ts:31-38`):

| Code               | Meaning                                                         | Source line                       |
| ------------------ | --------------------------------------------------------------- | --------------------------------- |
| INVALID_ARGUMENT   | bad/missing params, whitelist miss, or a duplicate requestId    | `tools/debug/agent-session.ts:32` |
| STALE_TARGET       | unknown id, destroyed node, replaced scene, or no running scene | `tools/debug/agent-session.ts:33` |
| OUT_OF_SCOPE       | write target is not inside `writableScenes`                     | `tools/debug/agent-session.ts:34` |
| UNSUPPORTED_ACTION | action not in the operation set, or asset lacks instantiate     | `tools/debug/agent-session.ts:35` |
| LOAD_FAILED        | asset load rejected (glTF code kept in `cause`)                 | `tools/debug/agent-session.ts:36` |
| SESSION_CLOSED     | session already closed                                          | `tools/debug/agent-session.ts:37` |
| CAPTURE_FAILED     | captureFrame timeout, scene swap, or no PNG                     | `tools/debug/agent-session.ts:38` |

## requestId retention and FIFO

The retention contract is the most-misread part:

- A repeat `requestId` is rejected as `INVALID_ARGUMENT` while it is still `running` OR when it settled less than 60s ago (`tools/debug/agent-session.ts:673-678`; `REQUEST_RETENTION_MS = 60_000` at `:168`). It is NOT an idempotent replay that hands back the original result.
- Records outside the retention time are garbage-collected on each dispatch (`tools/debug/agent-session.ts:680-682`).
- The log is hard-capped at `requestIdWindow * 2` entries; over that the oldest key is dropped FIFO (`tools/debug/agent-session.ts:683-686`), with `requestIdWindow` defaulting to 256 (`:164`).

So "256" is the retention-window SIZE default and "60000ms" is the retention TIME; treat both as guardrails against blind write-retries, not as a replay cache.

## Write actions

Only whitelisted actions run, dispatched serially so a failure never interleaves (`tools/debug/agent-session.ts:151`, `:689-691`):

- `createNode` adds a node under a writable parent and returns `{ nodeId }` (`tools/debug/agent-session.ts:745-756`).
- `addComponent` accepts only the `COMPONENT_WHITELIST` types (`MeshRenderer`, `Camera`, `DirectionalLight`, `PointLight`, `SphereLight`, `SpotLight`, `Animation`), never an arbitrary string import, and returns `{ componentId, type }` (`tools/debug/agent-session.ts:153-161`, `:758-771`).
- `setTransform` validates every parameter before applying any, so an illegal request leaves no partial mutation, and it requires `params.space` to be `local` or `world` (`tools/debug/agent-session.ts:773-824`).
- `loadAsset` goes through the public `GLTFLoader`, holds one session-owned `addRef`, and never destroys shared cache assets on close (`tools/debug/agent-session.ts:826-863`).
- `instantiateAsset` instantiates a known asset and registers the instance for cleanup (`tools/debug/agent-session.ts:865-893`).

`close()` removes listeners and observation hooks, cancels pending captures, destroys session-owned nodes/instances, and only `decRef`s assets the session itself added; explicit edits made to pre-existing nodes are not rolled back (`tools/debug/agent-session.ts:897-931`).
