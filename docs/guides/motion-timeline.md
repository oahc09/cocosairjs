# Interactive motion timelines

Use `createAirMotionTimeline` when a user needs to scrub to an absolute time or interrupt a short presentation motion. It samples scalar channels directly; it does not replay Tween actions, control AnimationClip or skeletal tracks, or schedule another animation loop. Animation data resolves logical channel IDs against a table supplied by the application, never arbitrary engine object paths.

```ts
import {
    attachAirMotionDriver,
    bindAirMotionNode,
    bindAirMotionOpacity,
    bindAirMotionUniform,
    createAirMotionTimeline,
} from 'cocosair';

// Call after app.run(scene). The material instance's glass0 should already be a Vec4.
const driver = attachAirMotionDriver(scene, app.session);
const channels = {
    x: bindAirMotionNode(panel, 'position.x'),
    opacity: bindAirMotionOpacity(panelOpacity),
    bend: bindAirMotionUniform(renderer.getMaterialInstance(0)!, 'glass0', { component: 'z' }),
};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const timeline = createAirMotionTimeline(
    [
        { label: 'enter', at: 0 },
        {
            group: [
                { channel: 'x', to: 0, duration: 0.6, ease: 'spring', at: 0 },
                { channel: 'bend', to: 0.3, duration: 0.4, ease: 'outCubic', at: 0 },
            ],
            at: { label: 'enter' },
        },
        { channel: 'opacity', to: 255, duration: 0.2, at: { afterEnd: -0.15 } },
    ],
    channels,
    { reducedMotion },
);
driver.setTimeline(timeline);
timeline.play();
// Scrub without running completion callbacks:
timeline.pause();
timeline.seek(0.24);
```

- Positions and durations are in seconds. Numeric positions start at the containing group's origin. An omitted position appends to its current end. Labels are local to a group and must be declared before references. Groups can overlap, including tracks targeting the same channel.
- For one channel, the latest start not after the requested time wins; declaration order breaks a tie. The winner holds its endpoint until superseded, so an older segment does not reappear after a shorter override. If `from` is omitted, it is sampled from previous segments at the new segment's start or the captured baseline. A zero duration is a step. Use one logical ID and one active owner per actual property; unrelated Tween or user writes to the same property are not blended.
- `seek()` clamps and samples without running `onFinish`. It does not pause or resume. `revert()` pauses and restores the creation baseline; `dispose()` drops bindings and completion without resetting the pose. Replace a playing timeline by first compiling the new one from live channel values, then using `driver.setTimeline(newTimeline)` and `newTimeline.play()`. With omitted `from`, this preserves the position at interruption; the new spring does not inherit velocity.
- The scene driver uses ordinary engine update deltas, including fixed test steps. Releasing the session or destroying the scene retires playback. The reduced-motion option reaches the end immediately on `play()`; explicit seeking is still available. It is a policy value, not a browser subscription; the application owns preference changes.
- Built-in Node bindings cover local position and scale axes; opacity uses the native 0–255 setter. Uniform binding accepts initialized float or float4 components on a renderer-owned material instance and an explicit pass. It does not mutate shared materials or bind textures, arrays, or arbitrary object paths. This path favors predictable authoring over bulk per-frame uniform streaming.
- `createAirMotionStagger({columns, rows, layers, step, from, seed})` returns row-major offsets. Corner/center distance modes start from the nearest cell; random mode permutes indices deterministically with a local seed. Use its output as track positions for repeatable batches. It does not animate DOM, SVG or CSS.

For native WebGL2 verification of the drag, live refraction, scrubbing and scene release, see the [E11 motion probe](../../tools/verify/rendering-iteration/README.md#e11-liquid-glass-motion). It does not certify reference-image fidelity or GPU performance.
