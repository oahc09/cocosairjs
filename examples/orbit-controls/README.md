# Orbit Controls

Run `npm run dev -- --example orbit-controls`, then drag the canvas or scroll the mouse wheel.
The example binds native `input` touch events (including engine-simulated mouse touches) and `MOUSE_WHEEL` once. UI nodes may swallow touch events; this example contains only a 3D scene.

`src/orbit-state.ts` keeps spherical coordinates and integrates exponential angular damping exactly: velocity decays by `exp(-damping * dt)`. It does not create a second animation clock. The component applies the resulting position and calls native `Node.lookAt()` each frame. A release after a stationary hold cancels stale drag velocity; touch cancellation also stops inertia.

`window.__orbitProbe()` exposes angles, angular velocity, radius, drag/wheel counts and DOM capture/bubble counts. Browser acceptance should drag for a fixed duration, release, then measure velocity decay at fixed elapsed times. A 200ms sample is a measurement point rather than a minimum movement duration. Unit tests compare equal elapsed time with different frame partitions.

DOM capture is an observation channel in this example; it does not zoom again. The engine's PAL stops canvas wheel bubbling, so a parent/window bubble listener does not receive the same wheel event. Use either engine wheel input or a DOM capture handler to control zoom, never both. See [input contract](../../docs/manual/input-and-events.md).

The focused browser regression uses the current development bundle and a temporary server with in-memory TS compilation:

```bash
node tools/verify/competitive-input-browser.cjs --engine=all --screenshots=output/playwright/competitive-input
```

Run it from the repository root with Playwright resolvable (use the configured tooling environment or `NODE_PATH`) and matching browser binaries installed. It checks real DOM drag/wheel delivery, changed canvas screenshots, capture/bubble behavior, exception reporting, and subsequent listeners/events. It does not rebuild or write canonical evidence; screenshots are written only when `--screenshots` is supplied. `--engine=chromium` limits a diagnostic run to one browser.
