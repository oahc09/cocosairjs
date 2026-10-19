# Router mistake archive

These original wrong/right examples are preserved from the source snapshot, including its historical canvas-import warning. That warning conflicts with the current main-entry admission rule: importing main before canvas creation is supported. For current setup, follow [application](../../cocosair-application/SKILL.md) and [environment](environment.md). The archive is not new runtime evidence.

## Common Mistakes

### [HIGH] Importing the main entry before the canvas exists

Wrong:

```html
<script type="module">
  const { createAirApp } = await import('cocosair.js'); // #GameCanvas not in DOM yet
</script>
```

Correct:

```html
<canvas id="GameCanvas"></canvas>
<script type="module">
  import { createAirApp } from 'cocosair.js';
  const app = await createAirApp({ canvas: '#GameCanvas' });
  const cc = await import('cocosair.js');
</script>
```

Pages adapted from Creator or other engines add the canvas from script; the screen adapter initializes during main-entry import, so startup fails before any app code runs.

### [HIGH] Assuming the Creator asset pipeline exists

Wrong:

```ts
assetManager.loadAny({ bundle: 'resources', path: 'models/robot' });
```

Correct:

```ts
import { Scene, Node } from 'cocosair.js';
// Build the scene in code with the original classes - there is no resources bundle to load from.
const scene = new Scene('Main');
scene.addChild(new Node('Robot')); // Scene extends Node: attach children to it directly
// Load models through the documented glTF path; route every other asset through cocosair-assets.
```

AIR ships no Creator Editor or `.scene`/Prefab/`resources` bundle pipeline; a Creator-parity load fails on the missing bundle instead of falling back.

### [MEDIUM] Treating a docs mention as a usable capability

Wrong:

```ts
// "the repo has pose-graph notes, so I can ship pose-graph animation" - assume reachability from a mention.
import { MarionetteController } from 'cocosair.js'; // absent from the default entry: marionette is not in the default feature set
```

Correct:

```ts
// Answer from a layer you state yourself - this is not an engine export:
type CapabilityLayer = 'source-export' | 'bundle-reachable' | 'browser-verified';
// Then cite that entry's .d.ts and current evidence; the pose graph is neither.
```

Docs enumerate the engine surface; bundle reachability and browser verification are separate candidates, and conflating them produces demos that cannot run.
