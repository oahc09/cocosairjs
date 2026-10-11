Derived from `src/air/scene-stack.ts` (2026-10-10).

# SceneStack: persistent-page navigation

`SceneStack` runs business navigation inside one long-lived `Scene`: each "page" is a `Node` subtree, `push`/`pop` move between them, and returned-to pages keep their component state because they are hidden, not destroyed (`src/air/scene-stack.ts:1-12`, `:47`). For a full scene replacement use `app.run()` (owned by the application skill), not `SceneStack`.

```js
const stack = new SceneStack(scene, { canvas, maxCachedPages: 4 });
const menu = await stack.push(() => buildMenu(), 'Menu');
const level = await stack.push(() => buildLevel(), 'Level', { transitionMs: 250 });
await stack.pop(); // level destroyed, menu becomes visible with state preserved
```

## Options and defaults

- `maxCachedPages` defaults to 4 - the LRU ceiling for inactive pages (`src/air/scene-stack.ts:37`, `:61`).
- `canvas` is the input-block target; when omitted the constructor falls back to `document.getElementById('GameCanvas')` (`src/air/scene-stack.ts:38-40`, `:62-63`). Unlike the dom action backend, `SceneStack` does auto-discover the canvas here.
- Getters: `top`, `depth`, `cachedCount`, `inTransition` (`src/air/scene-stack.ts:67-70`); `inputBlockedCount` is an observable tally of blocked events, mainly for tests (`src/air/scene-stack.ts:56-57`).

## push and the dual-page window

`push(build, name, { transitionMs })` adds the built node to the scene and pushes its handle on the stack (`src/air/scene-stack.ts:78-85`). With `transitionMs` 0 (default) the previous page is retired immediately (`src/air/scene-stack.ts:86-90`). During a transition, the previous page is left active and the new page renders on top, so both pages draw for that window before the previous one is retired (`src/air/scene-stack.ts:83`, `:91-101`). A new navigation supersedes an in-flight transition immediately: `_finishTransition` clears the timer, ends the input block, retires everything below the new top, and resolves the pending promise so no waiter hangs (`src/air/scene-stack.ts:72-77`, `:125-136`).

Retiring a page sets `node.active = false` and marks the handle not visible while keeping it in the cache, so component and subtree state survive (`src/air/scene-stack.ts:138-144`). `pop` destroys the top page and re-activates the next cached page, removing it from the cache (`src/air/scene-stack.ts:109-122`).

## Input block during transitions

`_beginInputBlock` installs one capture-phase listener on the canvas that calls `e.stopImmediatePropagation()` and increments `inputBlockedCount` for `mousedown`, `mouseup`, `mousemove`, `touchstart`, `touchmove`, `touchend`, `keydown`, `keyup` and `wheel` (`src/air/scene-stack.ts:160-169`). Because it is capture phase on the same element, it runs before the PAL bubble listeners and so cuts input off for the dual-page window rather than only hiding it (`src/air/scene-stack.ts:155-159`). `_endInputBlock` removes them symmetrically with the matching capture option (`src/air/scene-stack.ts:171-177`).

## LRU eviction

When the cache exceeds `maxCachedPages`, the oldest cached page is evicted. The eviction path removes the handle from the navigation stack (`this._stack.splice(index, 1)`) before calling `oldest.node.destroy()`, so an evicted page can never be re-shown by a later `pop()` (`src/air/scene-stack.ts:145-152`). This ordering matters: destroying first would leave a dangling, invalid handle mid-stack.

## dispose

`dispose()` finishes any in-flight transition, ends the input block, and destroys every node in both the stack and the cache guarded by `isValid()`, then clears the arrays - the cleanup entry for tests and page teardown (`src/air/scene-stack.ts:179-187`).
