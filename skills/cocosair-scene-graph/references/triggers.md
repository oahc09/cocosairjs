# scene graph triggers

The original “refcount contract below” and “contracts below” refer to the refcount and lifecycle bullets in [Contracts](contracts.md). Source annotations refer to the AIR checkout.

## When to use what

- "Which attach, re-parent, lookup, active or pooling method do I want, and what does it emit?" -> [node-ops.md](node-ops.md).
- "Which layer bit may I use, and does the default camera already see it?" -> [layers.md](layers.md).
- "Which subscriptions does `node.destroy()` release and which must I unsubscribe by hand?" -> [node-events.md](node-events.md).
- "When do `scene.globals` edits reach the renderer, and where can I read effective values back?" -> [scene-globals.md](scene-globals.md).
- "How do I release a scene or `SceneAsset` without leaking refs?" -> the refcount contract below plus [scene-globals.md](scene-globals.md).
- "Exact lifecycle order and `dt` units?" -> the contracts below plus the lifecycle table in [node-ops.md](node-ops.md).
