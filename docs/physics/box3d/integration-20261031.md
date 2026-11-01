# Box3D integration candidate — 2026-10-31

This is an **experimental, explicitly selected single-threaded backend**. It is not completion of the original 35-task / 91-category / nine-example / G0–G8 plan. The original plan remains in `ai/plans/box3d-v1.2-reference.md`.

## Integration identity

- Base main: `e0faf47269d45ffd16eed3bf557ae6e1efec894a`.
- Feature input: `6d07953764afb6c0579f1f3bdec797b0712413ce`.
- Common ancestor: `b573be0741db9e2a13d38ce7e65870b97a1f5fbc`.
- The current main WebGPU, gradient, Box2D synchronization, source-map publication and safe development-server behavior are retained. Existing Gallery records remain unchanged; EX02 is a draft.
- Historic SDK217–235 reports and candidate locks are not evidence for this candidate. A new build must obtain its own build number, source hashes, native receipt and browser results.

## Selection and distribution

`physics-box3d` is **not** in `DEFAULT_FEATURES`. The default builtin/Cannon/Box2D runtime does not acquire Box3D assets. A distribution that selects Box3D must build the pinned native source, pass its artifact audit/consumer gate, and ship the matching `physics/box3d/st/` assets with its JS. Do not copy an old WASM into a new SDK or bypass its manifest hashes.

```bash
# Install the exact official toolchain described by tools/physics/box3d/versions.lock.json.
npm ci
node tools/physics/box3d/build.mjs --out tools/physics/box3d/output/local-candidate
# Follow tools/physics/box3d/README.md for audit and consumer commands.
AIR_FEATURES="$(node -e "console.log([...require('./tools/build/default-features.cjs').DEFAULT_FEATURES,'physics-box3d'].join(','))")" \
AIR_BOX3D_ST_BUILD_DIR="$PWD/tools/physics/box3d/output/local-candidate" \
AIR_OUT_DIR="$PWD/build-box3d" node tools/build/build.cjs --format esm
node tools/build/build-dts.cjs
```

The native output must be repository-contained: the input/compile inventory intentionally rejects parent-directory paths. Declaration generation uses the default `build/` directory and does not follow `AIR_OUT_DIR`.

```ts
const app = await createAirApp({
    canvas: '#GameCanvas',
    physics: 'box3d',
    physicsOptions: {
        box3d: {
            assetBaseUrl: new URL('./physics/box3d/st/', import.meta.url).href,
            threading: 'single',
            workerCount: 1,
            solverSubSteps: 4,
        },
    },
});
```

Use normal Cocos scene/rigid-body/collider components. Mutations, observation handles, stepping, release and close retain explicit ownership and phase checks; unsupported operations fail rather than silently switching backends. The native bridge is MIT-licensed; upstream source, binding source, patch chain and ABI schema are pinned and audited separately.

## Current verification ledger

- Fresh merged-source TypeScript check: exit 0, including the cleanup fix.
- Cleanup robustness: hostile error stringification, throwing getters and revoked Proxies cannot skip later independent resources. Failures remain failures and blocked dependencies remain retained. Preparation/app tests: 29/29; public feature wiring: 8/8.
- Current native ST attempt6: build / audit / consumer PASS, 47 commands / 138 inputs / 87 compiled units / 63 evidence files; final source hash drift is zero. Audit SHA256: `a47afe4abe2474d2600600e2b51eee9f3c3a2a2e7ec98f563d33e547e9be9541`. Original five patches and ordered input prefixes are preserved; patch6 releases only fully empty sleeping solver sets after disable. Native storage coverage expands from the retained 51 checks to 153, and WASM from the retained 12 to 17. The final new fixture is RED against old ST5, GREEN against ST6; an independent identical C probe confirms trim13→trim0 without changing the strict trim guard. Attempt3 is superseded, attempt4 failed in an outdated test VM, and attempt5 predates this core correction.
- Fresh declarations: PASS after fixing temporary PAL module mapping and missing `_on` return types without modifying frozen PAL source. Strict consumers use `skipLibCheck=false`; ESNext and Node16 pass. DTS regression tests: 15/15.
- Default dev #245 and min #246 builds pass. Default regression: 28 original Jest suites / 277 assertions, Box2D WASM 12 tests and native 3 cases; zero skips and zero drift across 2,183 sampled inputs. Real WPE WebKit 26.5 verifies both default builds with builtin and Cannon, 90 fixed steps, public raycast, normal close, and no page/console errors. Cannon sphere reaches y=0.499614; builtin keeps y=3 as expected. Local screenshots were inspected after compositor presentation.
- Optional Box3D ESM #247 is retained as **FAIL / NOT ADMITTED**: query normal-close failed empty-world storage accounting; terminal module counters reaching zero did not erase that failure. Patch6/ST6 repairs the orphaned sleeping solver set without relaxing trim or accounting guards.
- Current optional SDK **#248** (SHA256 `c2fc14b2d8007fa0d09728971ed9fbccd5e9167580b46c3a176bcb17249c260e`; ST manifest `5876dd1f3ef34ce41ef42a7aadb12f73c2a7939891e98e40464c052a6d42b2a8`) passed **197 public WASM checks** across the four newly identified cases. This is a bounded public-contract result, not full game qualification.
- EX02 current SDK248 browser attempt7 passed its **20 actual reset pairs / 13 checks**, with terminal module release VERIFIED and no page/console/HTTP errors. Status remains `LIMITED_OBSERVED_LIFECYCLE`: no complete per-cycle native/GPU census or retired-access proof.
- Expanded default run is explicitly **not all-green**: 218 suites = 136 passed / 82 failed; 1,768 assertions = 1,633 passed / 135 failed, zero pending. After restoring three exact-main fixtures, a separate rerun passed 3 suites / 18 assertions. Do not rewrite the original run: the other **79 failed suites remain unqualified**, rather than presumed fixed or harmless.
- EX09 browser attempt5 is retained as **FAIL / TIMEOUT** at the unchanged 10,800-tick game limit: 2/3 orders, score 200, six items actually weighed, no browser errors. Attempt6 then completed one **PASS_THREE_ORDER_BROWSER** automated public-input run: 3 orders / 308 points, 10,298 real controlled frames; order commits at ticks 3,231 / 6,841 / 10,291, with 509 ticks remaining. All six required items were genuinely weighed and consumed; six others remain. Two real RAF observations at the end preserve `autoSimulation=false`, item/head/door poses, native-step and query stamps. Browser close and server exit were confirmed; 8 runtime / 1,574 source / 11 fixture hashes had no drift. This does not erase attempt4's conservative overlap rejection or attempt5's timeout. It is one scripted public-input scenario, **not human UI acceptance, performance/mobile qualification, or complete G5**.

- Automatic GitHub Actions remain disabled. Local tests do not stand in for unexecuted CI or browser checks.

## Examples and limits

Five example implementations exist: rigid-body playground, compound bowling, CCD range, trigger lifecycle and gift workshop. Original EX05/06 joint/terrain and EX07/08 advanced examples are not delivered by this integration. Multi-threading, automatic threading selection, replay and the complete controller/performance/mobile matrix remain unqualified.

EX02's browser collector is capped at `LIMITED_OBSERVED_LIFECYCLE`: repeated rebuilds and owned-resource receipts are not a complete native/GPU allocation census, nor proof of no retired-generation native read. A queued Close does not establish Close during an unresolved release wait.

EX09's default URL is a diagnostic view, not the complete game. The explicit `candidate=integration-20261031` selector requires a new exact runtime/build/manifest lock and four fresh qualification cases; old selectors retain their original locks. A real three-order run must use normal input and public motion/query APIs, score/ledger checks, consumed-body retirement and terminal simulation stability. It must not force success or teleport physics bodies.

Historical frozen-contract tests whose expected API fingerprints predate later branch changes are not relabelled as current PASS. Preserve their original inputs/results and use newly identified, independently checked current gates.

## Publication boundary

These are local integration artifacts, not evidence that a PR was opened or merged.
The source overlay must be applied to the exact base main listed above; the SDK248
optional runtime is separate from default dist245/246. The final package includes a
per-payload SHA256 inventory and read-back ZIP verification. Historical failures and
limits remain recorded; automatic Actions remain disabled.
