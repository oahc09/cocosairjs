# Fixed-snapshot example evidence campaigns

This **manual milestone workflow** collects genuine browser results in small, bounded attempts, then publishes one complete, strictly validated campaign. A subset is never a release PASS. The current ordinary-browser scope is **182 examples and 183 sessions**, including the extra interactive-geometry mode. Scope is derived from independent discovery of all example specifications, matched one-to-one against the live manifest before filtering DevTools, rather than a permanent numeric allowlist. Every non-DevTools example and every declared mode must be present; deleting an ID from the manifest or changing only its DevTools flag cannot shrink the campaign. A missing entry page is an error, not a reason to skip its example.

The five historical `requiresDevTools` examples remain a separate contract, collected by `tools/verify/devtools-examples.cjs`. Their evidence neither fills ordinary-browser gaps nor becomes current merely because the ordinary campaign passed.

## Before freezing

1. Finish the runtime, SDK, example, dependency, validator, collector, supervisor, and consumer changes. Run the focused CPU tests, including their negative controls.
2. Format all edited source and tooling with the repository's Prettier configuration, then check the same paths. Do this **before** freezing or collecting evidence. Do not format generated evidence, extracted source, or third-party assets. Formatting after capture changes source bytes and invalidates the freeze.
3. Install actual project dependencies with `npm ci` in a clean checkout, or the repository's documented install procedure in an existing worktree. `node_modules` must be a real dependency directory for declaration generation. Do not substitute a symlink to another checkout to make declaration generation appear successful.
4. Build the current main runtime, its declarations, and the separate Spark runtime/declarations. Keep the real exit codes and logs; an existing build file does not establish a fresh build.

   ```bash
   npm run build:all
   npm run build:spark
   ```

   Runtime builds advance the build counter. Rebuilding after freezing changes the candidate and requires a new campaign. Spark is a separate shipped artifact and must not be omitted from build or fingerprint checks.

5. This bounded evidence collector requires Linux with `/proc` and Python 3 standard-library support for the process-local child-subreaper and private inherited-pipe custody protocol. This requirement applies to the collector, not to the browser runtime SDK. Preflight must identify the real interpreter and helper bytes and reject unsupported custody; there is no polling-only fallback.

6. Check browser tooling before consuming a browser budget: Playwright must resolve in the authorized tooling environment, its selected browser binary must exist, and the browser executable/version must match the identity recorded by the freeze. Installing project npm dependencies alone does not install that browser. Check local references with the collector's workspace preflight; cross-example imports, shared modules, recipe dependencies, assets, and served build inputs must resolve without rewriting source imports or flattening their layout.

   This CPU-only preflight validates every non-DevTools workspace without launching a browser or writing canonical evidence:

   ```bash
   node - <<'NODE'
   const fs = require('fs');
   const path = require('path');
   const workspace = require('./tools/verify/example-workspace.cjs');
   const root = process.cwd();
   const inputs = workspace.listWorkspaceInputs(root);
   const manifest = JSON.parse(fs.readFileSync('examples/files.json', 'utf8'));
   for (const example of manifest.examples.filter((entry) => !entry.requiresDevTools)) {
       workspace.validateReferences(root, example, inputs);
   }
   for (const name of ['cocosair.module.js', 'cocosair.module.js.map', 'cocosair.module.min.js', 'cocosair.module.min.js.map', 'cocosair.module.d.ts', 'spark.module.js', 'spark.module.js.map', 'spark.module.d.ts']) {
       const file = path.join(root, 'build', name);
       const stat = fs.lstatSync(file);
       if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) throw Error('Invalid build input: ' + file);
   }
   console.log('Workspace dependencies and required build files are present.');
   NODE
   ```

The freeze records the complete input inventory and SHA-256 hashes, exact ordered scope/modes, browser identity, main and Spark build artifacts and declarations, collection tooling, both CI workflows, contracts, and bounded execution limits. Only `promotion` fields in specification/manifest metadata receive publication-specific normalization. Their original raw hashes and values are also retained. Status, manifest generation time/revision, and all other metadata remain part of the immutable input contract.

## Freeze, collect, and retain every attempt

Use one new directory outside the repository for each campaign. Keep the freeze, raw reports, receipts, stdout/stderr, screenshots, response-body CAS, attempt records, segments, and merged output under that directory. Do not reuse an existing attempt directory.

```bash
CAMPAIGN=/absolute/external/path/to/new-example-campaign
node tools/verify/example-evidence-campaign.cjs freeze \
    --out="$CAMPAIGN/freeze.json"

node tools/verify/run-example-evidence-campaign.cjs \
    --freeze="$CAMPAIGN/freeze.json" \
    --id=html-texture-experimental \
    --out="$CAMPAIGN/attempts/html-texture-experimental/1" \
    --execute-authorized
```

`--execute-authorized` records the caller's already-obtained execution authorization; the flag is not a replacement for permission. The freeze command identifies the browser but does not run the example suite. The orchestrator runs **one** exact frozen ID per invocation, covering that ID's declared modes, and never promotes metadata or overwrites canonical evidence. Repeat it for every frozen ID using small, deterministic, serial batches. Do not launch the next attempt until the preceding supervisor has confirmed physical closure.

The supervised collector fixes `ESBUILD_WORKER_THREADS=0` before the first esbuild load and records the actual mode in its observer receipt. Its synchronous build/transform calls then use esbuild's synchronous subprocess path, which waits for the compiler and collects its pipes before returning. The default synchronous API internally starts a persistent, unreferenced worker-thread service; merely awaiting `esbuild.stop()` does not prove that service has exited. Do not substitute a mode that can leave a compiler child behind, ignore a zombie, or relax forced-closure validation. Real compiler output-equivalence and process-lifecycle controls cover this constraint.

The supervisor bounds original invocation-to-readiness, native-frame readiness (or the UI shell's explicit DOM readiness), attempt duration, graceful close, abort, and final stop. Receipts identify the real worker and browser PID/start identity/namespace, native exit and stdio close, and the in-worker HTTP server's listen/close events. A fabricated server process, a timeout flag without physical closure, or a matching screenshot alone is insufficient. A Python parent holds process-local child-subreaper custody so a browser descendant cannot evade ownership by creating a new process group. Inner Node receipts stay provisional until all adopted children have been waited, kernel absence is established, and the custodian has genuinely exited and closed its streams. A runtime-close barrier uses private inherited file descriptors and the existing verified parent/worker IPC channel. It blocks a subsequent mode while an adopted child or zombie remains; unexpected identity, sequence, EOF, or missing acknowledgement fails closed. Raw custody receipts, logs, and provisional receipts are retained with hashes. If the worker exits with a custody acknowledgement in flight, retain the failure, drain only within the original barrier and absolute deadlines, and write the provisional failure receipt before closing the private pipes. Cancellation must still interrupt that drain; a late acknowledgement cannot turn a failed worker into a PASS. Unknown ownership, missing close, forced termination, or a startup deadline failure stops the campaign. Do not lengthen timeouts or wait for natural media end to manufacture a PASS.

An authenticated next stop request can arrive after its previously started worker has exited or changed identity. It remains rejected: the earlier start is correlation evidence, not current identity authority. Return an explicit failed response only for that exact prior-start/request/runtime chain, retain a separate rejection record, and close the chain permanently. This lets the inner supervisor persist its failure receipt within the original deadlines instead of losing it to an immediate custodian kill. Never record the rejected request as a successful barrier, infer absence from an unreadable identity, accept a late response after its pending deadline, or permit another runtime after rejection. Invalid tokens, unknown request origins, and sequence violations retain emergency fail-closed handling. A complete failure receipt and kernel closure still do not satisfy campaign admission.

Abort cleanup retains its original failure. A genuine child exit/close event or an exact, stable terminal-process observation only avoids an unusable IPC send; it does not establish reaping or absence. Preserve the request, target identity, send and asynchronous result chain. Any pending result must settle within the original close and absolute deadlines, including cancellation during finalization. Only the diagnostic CPU `browser-nonzero` control may classify an asynchronous `EPIPE` as an expected secondary failure, and only with that unique sending chain, proof that the same worker had exited or was terminal when the callback ran, and all original failed-receipt and physical-closure evidence. The production attempt remains FAIL. Unknown identities, a still-live worker, synchronous exceptions, other errors, and historical `EPIPE` records without that chain remain rejected.

Apply the same bounded delivery lifecycle to custody-response forwarding. A strictly validated rejection that proves the original worker is no longer authorized is retained with its exact request, worker, and custody event, but is not forwarded to that worker. This skip preserves the root failure; it does not acknowledge a successful stop. Other responses use the same exact child identity and terminal-state guard as abort delivery. Register any asynchronous send before finalization can seal the receipt, and settle it within the original request deadline or cancellation. A rejected response, skipped delivery, or failed send cannot reopen the custody chain or change the attempt to PASS.

Owned-process diagnostics are descriptive only. The supervisor records bounded, identity-checked observations at first ownership and on receipt of a runtime stop-begin event, retaining only fixed executable/role/flag enums. It never publishes raw command lines, arbitrary paths, unknown argument values, or hashes of those private values. A disappeared, reused, unreadable, or already-zombie process remains explicitly unknown; a later adopted-child record may be correlated only by its exact namespace, PID, and start ticks. These observations cannot identify a signal sender or turn a signalled child, failed custody barrier, or incomplete attempt into a PASS.

Each attempt and segment is immutable and remains `partial: true`, `completed: false`. Retain the first failed result even if an explicitly admitted same-input retry later passes. An allowed retry uses the next attempt number and a new directory:

```bash
node tools/verify/run-example-evidence-campaign.cjs \
    --freeze="$CAMPAIGN/freeze.json" \
    --id=html-texture-experimental --attempt=2 \
    --out="$CAMPAIGN/attempts/html-texture-experimental/2" \
    --execute-authorized
```

Resume is permitted only while the entire frozen input set and browser/tooling identity still match. **Any source, SDK, example, shared dependency, asset, contract, or collection-tool change requires a new freeze and fresh evidence.** Do not edit a stored fingerprint, copy an old PASS row, delete a failure, lower an example's status, or reinterpret a partial shard as full completion. Retain invalidated campaigns as historical records; they cannot supply rows to the new candidate.

## Strict merge and constrained publication

Merge every segment, including all retries, with the same freeze. The command below obtains a deterministic segment list without dropping earlier attempts:

```bash
SEGMENTS=$(node -e 'const fs=require("fs"),p=require("path"),d=p.join(process.argv[1],"segments"); process.stdout.write(fs.readdirSync(d).filter(n=>n.endsWith(".json")).sort().map(n=>p.join(d,n)).join(","))' "$CAMPAIGN")
node tools/verify/example-evidence-campaign.cjs merge \
    --freeze="$CAMPAIGN/freeze.json" --segments="$SEGMENTS" \
    --out="$CAMPAIGN/merged.json"
node tools/verify/example-evidence-campaign.cjs check \
    --evidence="$CAMPAIGN/merged.json"
```

### Example-owned specialized controls

Declared controlled-step or offscreen-render APIs must be exercised through the example's real controls and checked for their effects, not counted by calling exports from the harness. The ordinary Driver Pilot adapter runs only the frozen default holographic primary session. It preserves the existing 11 API claims and records the exact zero/positive step snapshots, per-frame time/uniform ledger, independent linear-pixel oracle, render-target disposal, actual renderer material restoration, and subsequent native-pacer progress. The shared consumer recomputes this raw protocol and rejects missing, mismatched, or non-driver reuse. This limited session does not replace the dedicated multi-engine Driver Pilot acceptance matrix.

Keep synchronous harness observations inside the API tracer's `observing` guard, restored in `finally`; never hold it across an `await` or around real example actions. Restore the native pacer in `finally` and retain any probe or restoration error as a failure. A newly declared control-only API requires a reviewed executable adapter plus effect assertions and negative tests before collecting a fresh full campaign. Do not delete the claim or manufacture invocation counts to satisfy coverage.

The strict validator checks the complete current scope, unique IDs/attempt numbers, exact modes, frozen input hashes, declared validator coverage, recomputed API proof, screenshots, every recorded served response body, raw collector/receipt/log provenance, and actual process/server closure. Unknown schemas, incomplete coverage, duplicate IDs/modes, changed bytes, absent proof, forced exits, or omitted failed attempts cannot publish. A diagnostic merge with `--allow-partial` remains incomplete and is never publishable.

After the full merged campaign passes review, publish it with:

```bash
node tools/verify/publish-example-evidence.cjs \
    --campaign="$CAMPAIGN/merged.json" --source-dir="$CAMPAIGN"
node tools/verify/example-evidence-campaign.cjs check
npm run verify:example-chain
```

The publisher copies the entire source campaign into `docs/evidence/example-campaigns/<freeze-id>/`, preserving original raw report, receipt, log, PNG, and response-body bytes. It derives canonical artifact paths afresh from the copied immutable attempts. Every dereferenced provenance file must be inside the repository and use portable relative references; deleting the original external campaign must not break verification. Absolute launch/output paths inside an unmodified historical raw receipt describe the capture environment and are not publication artifact references.

Before any canonical mutation, the publisher constructs and validates a complete staged file set with real input copies. Publication may refresh only an **existing** `promotion` field of an example that was already `stable`, deriving the value with `specCommon.promotionOf` from that example's full current result. It changes only the corresponding existing promotion in `examples/files.json`. All statuses, draft promotions, `generatedAt`, `revision`, and every other field remain unchanged. It does not run Gallery manifest regeneration or the legacy promote/demote operation. Its publication manifest binds the exact allowed file delta and resulting raw hashes to the freeze.

Publication is a guarded multi-file transaction, not an assertion that many filesystem writes can be one rename. It retains and fsyncs the exact old bytes of every existing target in a separate staging backup, then writes and fsyncs `docs/evidence/.examples-publication-incomplete.json` with the backup location and before/after hashes. It installs immutable provenance, then atomically replaces individual allowed metadata files. `docs/evidence/examples-verified.json` is the last payload written. The guard is removed only after delivered hashes and normalized inputs verify. Strict consumers fail closed whenever the guard exists, even if an older canonical report remains readable.

If publication is interrupted, stop. Keep the guard, immutable package, and retained staging files. Inspect its listed before/after hashes and restore a consistent pre-publication state or complete a reviewed recovery; **never delete the guard merely to clear a gate**. The publisher refuses automatic retries over an incomplete transaction or an existing immutable package. Do not run the old canonical collector as a workaround.

## Routine PR checks and manual full evidence

The default `Code quality / quality` job is deliberately small for rapid iteration:

- Install dependencies and verify the committed Spark generated sources.
- Check formatting and types, then build development/minified runtime, source maps,
  declarations, and the separate Spark bundle.
- Run focused bootstrap, scene, runtime-asset and audio cancellation unit tests,
  shader rotation and resource-lifecycle regressions, and the compact shutdown-policy suite.
- Run five bounded real Chromium examples: `shader-driver-pilot` (the original
  15 samples / 60 channels / ±2 tolerance), `glass-refraction`, `gltf-viewer`
  (resource ownership/release), `input` (interaction), and `spark-splats`
  (the separate runtime bundle).

Each example uses the existing strict single-attempt runner, with the production
30-second infrastructure startup wait, four-second close and 139-second final bounds.
Startup includes input/runtime checks and process/page initialization; it is not
a product performance acceptance metric. The shared `example-evidence-limits.json`
is used by the campaign, supervisor and Python custodian. No retries are added.
Earlier 15-second timeout originals remain failures. Failures stop
the job and retain originals. The five-example results are **partial smoke**,
never a complete campaign, and are not merged, published or written over canonical
evidence. A stale canonical report is not a routine PR prerequisite. No full
three-browser matrix, duplicate supervision suite or external reference checkout
runs on the default path. Core CI green does not claim complete example coverage.

### Manual milestone collection

`.github/workflows/example-evidence.yml` runs only through `workflow_dispatch`.
Select the intended revision explicitly. The runner checks out that exact revision,
has read-only repository permissions, keeps no checkout credentials, and never
pushes changes. It retains the full CPU contract suites and exact discovered scope.
It installs dependencies and prepares ignored package copies without rebuilding
the committed SDK; all tracked build hashes are checked before and after collection.

A clean checkout lacks the ignored `output/spark-runtime-tree-manifest.json`.
Both workflows snapshot the three committed Spark generated-source files, run the
official generator, and require the original SHA-256 values and tracked diff to
remain unchanged. Do not hand-write this receipt or silently repair stale source.

The manual runner creates a fresh browser/Python freeze, runs HTML, shader-driver
and Spark pilots, then every remaining frozen ID/mode. It retains the same
174-second TERM /178-second KILL outer bound per invocation. Its 90-minute job
records the budget before installation and stops starting attempts before the
80-minute deadline to reserve publication/upload time. Every failure retains
partial originals and prevents publication. Only strict full success creates a
publication artifact; old canonical files are never relabelled as new results.

Review the complete portable package, exact committed candidate identity and
promotion-only delta before applying it to a branch in a normal commit. Full
coverage, release audits, full test discovery and multi-browser validation remain
explicit milestone work. Historical failures remain historical failures; narrowing
the default PR gate does not turn them into PASS or bypass strict publication.

## Auxiliary GPU mismatch diagnostics

The Driver Pilot collector may retain a separate diagnostic replay after its original pixel readback. It must preserve the original pixels, sample locations, dimensions, tolerance, validator failure, and API proof. A replay is interpretable only after the unchanged submitted shader, copied uniform data, and draw state reproduce every original sample byte exactly. Instrumented UV, SDF, and transition values are auxiliary observations from a separately compiled program, never replacement acceptance pixels or evidence that the original compiler evaluated every intermediate identically. Restore all touched GL state and dispose temporary resources; retain diagnostic failures and limitations. Do not hide original GL errors, alter example behavior, or relax a pixel oracle to clear a collection gate.

A process may first be observed by `/proc` between fork and detached process-group
creation. Preserve that first observation. A later exact browser-spawn event may
prove the same PID/start-ticks/namespace became its own group leader, provided
its embedded initial identity and detached group match and the spawn precedes
group observation. Retain every previously known group member and require all
exact disappearance events before group-empty. Missing, mismatched, or late
leader proof must fail; never rewrite an old receipt to repair its verdict.

## Shutdown signal diagnostics

The versioned `example-evidence-attempt/2` and `browser-shutdown/2` contract
separates application measurements from resource closure. Before closing, retain
the complete immutable application result. An authenticated synchronous closing
ACK must confirm the live browser and the original functional artifact before
context/browser shutdown begins. The original four-second budget covers the ACK,
close operations, and kernel drain together; it is never renewed at a phase change.
The supervisor preserves its own clock's budget reference, while the custodian
uses a conservative local remainder. No cross-process sub-millisecond clock
comparison establishes causality.

Keep every raw waitpid status, exact disappearance, and final ECHILD. Exit-zero
children require physical collection but no complete pre-close child snapshot.
A raw SIGTERM can be classified `shutdown-compatible` only for that exact child
observed live before closing, with its browser ancestry and frozen executable
image bound to the same identity. Role strings are finite diagnostic enums, not
an authority or a fixed GPU/audio allowlist. Unknown identity or missing live
proof cannot earn this classification. It does not prove who sent the signal.
Page crashes and unexpected browser disconnections latch failures. Parent
failures, other signals, forced cleanup, unresolved identities, and leftovers
remain failures. An application assertion failure can have a clean physical
shutdown; its overall result still fails. Earlier schemas and recorded failures
are never reinterpreted by this new policy.

The application original must be a bounded, no-follow regular file within its
attempt. Retain screenshots, probe values, API proofs, and all pre-close HTTP
observations without replacement; only explicitly defined closing observations
may be appended. Publish complete originals atomically without clobbering an
existing record, and wait for the actual writer's terminal receipt before reading.

Signal tracing is an independent manually dispatched troubleshooting workflow.
It is not a dependency or admission gate for the ordinary complete campaign.
The retained legacy trace classifier does not support the new shutdown schema.
Its manual workflow rejects that version before dependency installation or any
browser/tracer launch. It is temporarily unavailable on this revision; the
following legacy protocol remains documented for historical originals, not as a
claim of current diagnostic compatibility.
The separate shutdown-trace probe runs outside the existing outer supervisor.
It never replaces the browser executable or inserts a process into the
Python-to-inner-Node custody channel. Its reports are diagnostic-only with
`canonicalEligible: false`; they cannot be merged or published as example
evidence. The ordinary campaign uses another fresh freeze and all original
182-example / 183-session admission rules.

Run the parser tests first. The official runner then makes one non-privileged,
self-spawned strace availability probe. A ptrace restriction is a diagnostic
failure: do not change sysctl, capabilities, seccomp, sandbox flags, or security
settings to enable tracing. Never retry a denied local probe through escalation.
Known-sender CPU controls must retain the original positive and negative
verdicts, exact exit/stdio-close receipts, and kernel ECHILD before browser
diagnostics can start.

The traced/untraced diagnostic CPU pairs use the same existing production
`DEFAULT_LIMITS`: now 30-second startup, 4-second close, and the unchanged
120/125/133/139-second inner/abort/force/final deadlines. Tracing adds observation
overhead, so these pairs remain separate from lifecycle regression tests.
The regression fixtures use explicit ready handshakes and a fixed bounded test
envelope; obsolete 800/300-millisecond cold-start constants are not product
performance requirements. The current shared startup and close bounds are 30/4 seconds. Retain
any earlier instrumented short-budget failure as FAIL; a new diagnostic budget
does not reclassify it. The 600-second phase limit and 180-second remaining-time
admission check still apply to every pair member.

The target-browser signal investigation uses a separate fixed
`example-shutdown-target-profile/1` profile for both traced and untraced runs:
30-second startup, 4-second close, and the same 120/125/133/139-second absolute
deadlines. Its startup clock begins at the independent runner's entry and includes
all input and runtime checks. This allows observation overhead; it is not a
production startup-performance result. The ordinary frozen campaign now has the same 30-second startup bound but still
rejects diagnostic profiles, including records with their
labels removed or mismatched original artifacts. Keep earlier 15-second failures
unchanged.

The independent target runner binds its profile to the ordinary freeze's exact
input identity and verifies inputs and runtime before and after execution. It
retains the collector output and full custody originals, but creates no ordinary
attempt, segment, admission, or publication record. The profile is bound through
the outer request, Python observation, inner pending receipt, observer, and final
receipt. Explicit diagnostic validation reuses the existing identity and closure
rules; unknown profiles or arbitrary deadline overrides fail. Only the dedicated
signal report may consume this profile, always with `canonicalEligible: false`.

The tracer wrapper also has two explicit real-process CPU cancellation controls:
TERM delivered to that wrapper and a parser input-limit cancellation. These must
remain failed diagnostics while proving outer/custodian/inner identity-linked
closure, adopted-process reaping and absence, final ECHILD, and tracer
exit/stdio-close plus FIFO EOF. Their retained originals are uploaded separately;
a missing pending receipt cannot satisfy ordinary campaign admission. The live
control suite receives the original global deadline, reserves its full two-case
budget before starting, and rechecks 180 seconds of remaining time before each
case. A failed case must finish cleanup before the suite stops; it must never
start its next case while the failed case has unknown closure. A failure
to prove closure stops the job before any target browser. These controls do not
establish safety after a wrapper or parent SIGKILL; missing closure in that case
is UNKNOWN and stops the job.

The TERM control uses the existing hanging CPU fixture. The input-limit control
uses the existing delayed-stop-ACK fixture, whose original custodian produces a
real signal syscall. Arm the reduced parser limit before publishing readiness;
retain the input-byte boundary and require new traced bytes to cross it. A
control that never triggers its intended cancellation fails. Neither control
adds a process to the production custody chain.

The live trace observes only `kill`, `tkill`, `tgkill`, and
`pidfd_send_signal`, plus selected TERM/KILL deliveries. Record that exact filter
in each diagnostic report. Kernel wait/reap and ECHILD proof continues to come
from the original custody artifacts; offline compatibility with historical wait
records does not expand the live filter. Fixed killed-by terminal markers are
diagnostic observations only: they establish neither a signal sender nor
physical closure. An unfinished syscall terminated with its own traced thread
has no inferred return value and cannot establish successful signal delivery.
The fixed no-siginfo `stopped by SIGTERM` / `stopped by SIGKILL` records are stop
observations only. They have no sender identity or exit status, cannot establish
delivery attribution or closure, and do not resolve a pending syscall.
Persist fixed numeric identities, signal and result enums, and bounded
filtered records. Do not retain raw argv, environment values, arbitrary text,
or address contents. Mark filtered traces as such rather than calling them
complete raw strace logs. Bind sender and target to their exact PID namespace,
start ticks and executable-image observations; ambiguous or missing links stay
UNKNOWN. Process-role hints are not executable authentication.
Retain a separate attribution entry for every signaled adopted descendant, within
the existing identity and output bounds. Match each exact descendant independently
against its own sender, delivery, authenticated executable images, lifecycle, and
waitpid/absence records. Do not assume a single descendant or require a particular
role hint. Preserve every unmatched or unsupported case as UNKNOWN. The aggregate
is MATCHED only when the nonempty full set is matched; one attributed child cannot
stand in for another. A complete diagnostic can retain an expected, fully closed
failed attempt, but it never changes that original production failure.
Use the recorded timestamp precision when checking causality. A send must occur
within its browser's shutdown lifetime; delivery is bounded by that recipient's
reap record, rather than an assumed ordering before the sender's close event.
Sample threads and their children only inside already-proven owned processes.
Each thread observation must retain its own start ticks, the same process leader,
namespace, and verified ancestry before and after bounded reads. Threads and
processes share the existing identity/output limits. Missing, reused, changed, or
unreadable identities cannot establish a sender or recipient; never infer a
thread identity from its process leader alone.
A valid four-syscall trace can be empty after a normal close. It remains UNKNOWN
only when the parser, real traced-root identity, original result classification,
and complete physical closure all validate. Availability and known-sender
controls still require their real signal correlation; an empty trace cannot
satisfy either proof.

Each diagnostic keeps its explicitly recorded fixed profile. The whole diagnostic
phase is bounded to the lesser of 600 seconds and the remaining original job
budget, with one untraced target control and at most
six traced target attempts. Do not start another target with fewer than 180
seconds remaining; stop after the first complete attribution of every signaled
descendant in that attempt, otherwise retain
UNKNOWN. At least one complete untraced/traced target pair is required; an
unexecuted or half-finished pair cannot satisfy the diagnostic preflight. Keep
every attempt, including failed and untraced results. Any missing
physical closure, output overflow, timeout, ptrace failure, or incomplete trace
ends the diagnostic phase and prevents the ordinary campaign from starting.
No count of successful repeats can erase an earlier failed attempt.

### Authenticated shutdown rejection and failed originals

A valid private-IPC request can describe an unsuccessful lifecycle: a browser may
already have exited, a functional original may be unavailable, or an otherwise
complete browser exit may be nonzero. These observations never authorize closing
or become a successful barrier. The custodian records a fixed semantic rejection,
returns `ok: false`, permanently closes that request chain, and lets the existing
failure cleanup preserve the inner receipt within the original close deadline.
The raw failure, nonzero exit, and failed final admission remain visible. No case
name or exit code is promoted to success. Unknown observations remain failed.

Token, sequence, trusted-peer and budget-reference violations are protocol
failures, outside this recoverable response boundary. Emergency cleanup retains
the outer raw cause; it must not be labelled a clean receipt. Semantic rejection
does not renew the close clock: a writer or adopted process still present at the
original deadline is force-cleaned and the attempt remains failed.

### Resource-release observations

Resource lifecycle checks wait for two completed engine UPDATE-to-DRAW cycles with distinct increasing director frame numbers and a microtask checkpoint between them. Browser requestAnimationFrame callbacks plus a sleep do not establish that deferred engine destruction ran: GLTF root teardown can enqueue asset destruction in a microtask, and capture teardown can enqueue its RenderTexture for the following batch. Each settlement has one fixed eight-second deadline, is also bounded by the existing whole-attempt deadline, and retains its actual frame observations; missing updates, late frames, or still-live owned resources remain failures. Never manually flush the private destroy queue, change object flags, drop resource entries, or replace real cleanup predicates with constants.

The immutable application result retains the complete lifecycle report, including both settlement phases and per-resource release/reacquire observations. Private MaterialInstance ownership must be retired explicitly and verified by its real destroy call and cleared passes; an explicit asset reference must also be balanced. Scene readback uses the non-allocating getRenderMaterial API, including existing per-slot instances, rather than the allocating material getter. These rules do not alter pixel tolerances or make physical browser closure stand in for resource cleanup.
