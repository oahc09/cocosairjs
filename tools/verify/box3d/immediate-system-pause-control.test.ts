/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Original PhysicsSystem/World/owner source. Instrumented MOCK native binding only.
 * Product-contract RED is intentionally a failing assertion, not a passing feature.
 */
import { PhysicsSystem } from "../../../src/cocos/physics/framework/physics-system";
import { PhysicsMaterial } from "../../../src/cocos/physics/framework/assets/physics-material";
import { selector } from "../../../src/cocos/physics/framework/physics-selector";
import {
  director,
  DirectorEvent,
} from "../../../src/cocos/game";
import { Node } from "../../../src/cocos/scene-graph/node";
import { RigidBody } from "../../../src/cocos/physics/framework/components/rigid-body";
import { BoxCollider } from "../../../src/cocos/physics/framework/components/colliders/box-collider";
import {
  CCObject,
  isValid,
} from "../../../src/cocos/core/data/object";
import { createBox3DWorldAdapter } from "../../../src/air/physics/box3d/registration";
import { createAirPhysicsPreparation } from "../../../src/air/physics/preparation";
import { mockBinding } from "./immediate-system-pause-mock-binding";
const fs = require("node:fs"),
  crypto = require("node:crypto"),
  path = require("node:path");
const repo = path.resolve(__dirname, "../../..");
const original = {
  id: selector.id,
  wrapper: selector.wrapper,
  world: selector.physicsWorld,
  instance: PhysicsSystem.instance,
  backend: selector.backend.box3d,
};
const rows: any[] = [];
let row: any, current: any;
const nodes: Node[] = [],
  components: any[] = [];
let materials: Set<PhysicsMaterial>;
const eventLeases: Array<() => void> = [];
function encode(value: any): any {
  if (value === undefined) return { type: "undefined" };
  if (value instanceof Error)
    return {
      type: "error",
      name: value.name,
      message: value.message,
      code: (value as any).code ?? null,
    };
  if (typeof value === "bigint")
    return { type: "bigint", value: String(value) };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, encode(v)]),
    );
  return value;
}
function check(name: string, actual: any, expected: any): void {
  row.checks.push({
    name,
    actual: encode(actual),
    expected: encode(expected),
    passed: Object.is(actual, expected),
  });
}
function closeNumber(name: string, actual: number, expected: number): void {
  row.checks.push({
    name,
    actual,
    expected,
    tolerance: 1e-12,
    passed: Math.abs(actual - expected) < 1e-12,
  });
}
function capture(fn: () => void): { thrown: boolean; error: any } {
  try {
    fn();
    return { thrown: false, error: undefined };
  } catch (error) {
    return { thrown: true, error };
  }
}
function fixture(initialEnabled = true): any {
  const mock = mockBinding();
  const preparation = createAirPhysicsPreparation();
  const system = new (PhysicsSystem as any)() as PhysicsSystem;
  (PhysicsSystem as any)._instance = system;
  system.enable = initialEnabled;
  const options: any = {
    threading: "single",
    workerCount: 1,
    solverSubSteps: 4,
  };
  const lease: any = {
    binding: mock.binding,
    options,
    generation: preparation.generation,
    dispose() {
      mock.calls.push("module.dispose");
    },
  };
  preparation.own("box3d", "module", () => lease.dispose());
  (selector as any).physicsWorld = null;
  current = { ...mock, preparation, system, world: null };
  const prepare = createBox3DWorldAdapter(
    selector,
    {
      collisionMask: (group: number) => system.collisionMatrix[group],
      sleepThreshold: () => system.sleepThreshold,
    },
    undefined,
    { physicsSystem: () => system },
  );
  const prepared = prepare(lease, options, preparation) as { select(): void };
  prepared.select();
  current.world = new selector.wrapper.PhysicsWorld!();
  (selector as any).physicsWorld = current.world;
  system.fixedTimeStep = 1 / 60;
  system.maxSubSteps = 4;
  system.resetAccumulator(0);
  const owner = current.world.diagnostics().commandOwner;
  if (
    selector.id !== "box3d" ||
    system.physicsWorld !== current.world ||
    owner.materialObserverLeases !== 1 || !owner.systemControl.observed
  )
    throw new Error(
      "Fixture did not establish original System/world/material owner binding.",
    );
  row.setup = {
    actualSystem: true,
    actualWorld: true,
    actualOwner: true,
    materialObserverLeases: owner.materialObserverLeases,
    systemControlObservation: "ACTUAL_OWNER_REGISTERED",
    nativeBinding: "EXPLICIT_MOCK_NOT_WASM",
  };
  return current;
}
function events(before?: () => void): { before: number; after: number } {
  const counts = { before: 0, after: 0 };
  const onBefore = () => {
    counts.before++;
    before?.();
  };
  const onAfter = () => {
    counts.after++;
  };
  director.on(DirectorEvent.BEFORE_PHYSICS, onBefore);
  director.on(DirectorEvent.AFTER_PHYSICS, onAfter);
  eventLeases.push(
    () => director.off(DirectorEvent.BEFORE_PHYSICS, onBefore),
    () => director.off(DirectorEvent.AFTER_PHYSICS, onAfter),
  );
  return counts;
}
function state(f: any): any {
  return {
    enable: encode(f.system.enable),
    autoSimulation: encode(f.system.autoSimulation),
    accumulator: (f.system as any)._accumulator,
    subStepCount: (f.system as any)._subStepCount,
    mockStepCalls: f.calls.filter((v: string) => v === "step").length,
    diagnostics: f.world.diagnostics(),
  };
}
function control(name: string, fn: (f: any) => void, initialEnabled = true): void {
  test(name, () => {
    row = { name, status: "SETUP_PENDING", checks: [] };
    rows.push(row);
    let f: any;
    try {
      f = fixture(initialEnabled);
    } catch (error) {
      row.status = "SETUP_ERROR";
      row.setupError = encode(error);
      throw error;
    }
    row.before = state(f);
    try {
      fn(f);
    } catch (error) {
      row.status = "EXECUTION_ERROR_UNCLASSIFIED";
      row.executionError = encode(error);
      throw error;
    }
    row.after = state(f);
    row.status = row.checks.every((v: any) => v.passed)
      ? "PASS_SOURCE_WITH_MOCK_BINDING"
      : "RED_PRODUCT_CONTRACT_SOURCE_WITH_MOCK_BINDING";
    expect(row.checks.filter((v: any) => !v.passed)).toEqual([]);
  });
}
beforeEach(() => {
  materials = new Set(PhysicsMaterial.allMaterials);
});
afterEach(async () => {
  const errors: any[] = [];
  const attempt = (label: string, fn: () => void) => {
    try {
      fn();
    } catch (error) {
      errors.push({ label, error: encode(error) });
    }
  };
  for (const dispose of eventLeases.splice(0))
    attempt("event listener dispose", dispose);
  for (const c of components.splice(0).reverse()) {
    attempt("component onDisable", () => c.onDisable());
    attempt("component onDestroy", () => c.onDestroy());
  }
  let receipt: any = null;
  if (current) {
    try {
      receipt = await current.preparation.dispose();
    } catch (error) {
      errors.push({ label: "preparation dispose", error: encode(error) });
    }
  }
  for (const n of nodes.splice(0))
    attempt("node destroy", () => {
      if (isValid(n, true)) n.destroy();
    });
  for (const m of [...PhysicsMaterial.allMaterials])
    if (!materials.has(m))
      attempt("material destroy", () => {
        if (isValid(m, true)) m.destroy();
      });
  attempt("deferred destroy", () => CCObject._deferredDestroy());
  (selector as any).id = original.id;
  (selector as any).wrapper = original.wrapper;
  (selector as any).physicsWorld = original.world;
  (PhysicsSystem as any)._instance = original.instance;
  if (original.backend) selector.backend.box3d = original.backend;
  else delete selector.backend.box3d;
  row.cleanup = {
    errors,
    receipt: encode(receipt),
    finalWorld: encode(current?.world?.diagnostics()),
  };
  row.cleanupStatus =
    errors.length || (receipt && receipt.status !== "closed")
      ? "CLEANUP_ERROR"
      : "CLOSED";
  current = null;
  expect(row.cleanupStatus).toBe("CLOSED");
});
afterAll(() => {
  const loadedSources = Object.keys(require.cache)
    .filter(
      (p) => p.startsWith(repo + "/src/") || p.startsWith(repo + "/test/"),
    )
    .sort()
    .map((p) => ({
      path: path.relative(repo, p),
      sha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(p))
        .digest("hex"),
      bytes: fs.statSync(p).size,
    }));
  fs.writeFileSync(
    process.env.BOX3D_PAUSE_RAW!,
    JSON.stringify(
      {
        scope:
          "Original engine, System, World, owner and component functions with explicit mock native binding; JS control evidence only. No WASM, native solver, browser, rendering, actual physical motion or formal qualification.",
        fixtureLifecycle:
          "Original onLoad/onEnable manually called on unattached Nodes; no game.init or full app scheduler.",
        formalRequiredCells: { count: 2128, status: "NOT_RUN" },
        stagedCommandsSupported: false,
        unifiedTransactionsSupported: false,
        producerOwnerConnection: "NOT_INTEGRATED",
        targetOwnerConnection: "NOT_INTEGRATED",
        t12: "NOT_RUN",
        rows,
        loadedSources,
      },
      null,
      2,
    ) + "\n",
  );
});

control(
  "P01 enable=false must reject actual manual System.step before advancement",
  (f) => {
    const counts = events();
    f.system.enable = false;
    const result = capture(() => f.system.step(1 / 60));
    row.operation = encode(result);
    check("manual call refused while System-disabled", result.thrown, true);
    check(
      "no mock solver step",
      f.calls.filter((v: string) => v === "step").length,
      0,
    );
    check(
      "mock native index unchanged",
      f.world.diagnostics().native.nativeStepIndex,
      0,
    );
    check("manual emits no BEFORE", counts.before, 0);
    check("manual emits no AFTER", counts.after, 0);
    closeNumber(
      "automatic accumulator unchanged",
      (f.system as any)._accumulator,
      0,
    );
  },
);
control(
  "P02 BEFORE_PHYSICS disable must stop this frame and retain backlog and normal AFTER",
  (f) => {
    f.system.enable = true;
    f.system.autoSimulation = true;
    const counts = events(() => {
      f.system.enable = false;
    });
    const dt = 2.5 / 60;
    f.system.postUpdate(dt);
    row.events = counts;
    check("public disable committed", f.system.enable, false);
    check("one BEFORE event", counts.before, 1);
    check("one normal AFTER event", counts.after, 1);
    check(
      "no mock step after BEFORE pause",
      f.calls.filter((v: string) => v === "step").length,
      0,
    );
    closeNumber(
      "already-added backlog retained",
      (f.system as any)._accumulator,
      dt,
    );
    check("no successful substeps charged", (f.system as any)._subStepCount, 0);
  },
);
for (const property of ["enable", "autoSimulation"] as const) {
  control(
    `P03 ${property} rejects non-booleans with actual Box3D owner registered`,
    (f) => {
      const cases: any[] = [];
      row.inputs = cases;
      for (const value of [0, 1, null, undefined, { invalidBoolean: true }]) {
        f.system[property] = true;
        const result = capture(() => {
          f.system[property] = value;
        });
        cases.push({
          value: encode(value),
          thrown: result.thrown,
          error: encode(result.error),
          cache: encode(f.system[property]),
        });
        check(`strict refusal for ${String(value)}`, result.thrown, true);
        check(
          `previous cache retained for ${String(value)}`,
          f.system[property] === true,
          true,
        );
      }
      f.system[property] = true;
      check(
        "no mock solver call during control writes",
        f.calls.filter((v: string) => v === "step").length,
        0,
      );
    },
  );
}
control(
  "C01 autoSimulation=false is enabled manual scheduling, not disabled physics",
  (f) => {
    const counts = events();
    f.system.enable = true;
    f.system.autoSimulation = false;
    f.system.resetAccumulator(0.75 / 60);
    f.system.postUpdate(2 / 60);
    check(
      "automatic scheduling suppressed",
      f.calls.filter((v: string) => v === "step").length,
      0,
    );
    closeNumber(
      "manual-mode postUpdate retains accumulator",
      (f.system as any)._accumulator,
      0.75 / 60,
    );
    const result = capture(() => f.system.step(1 / 60));
    row.operation = encode(result);
    check("explicit manual step allowed", result.thrown, false);
    check(
      "one mock native step",
      f.world.diagnostics().native.nativeStepIndex,
      1,
    );
    check("System remains enabled", f.system.enable, true);
    check("manual scheduling emits no BEFORE", counts.before, 0);
    check("manual scheduling emits no AFTER", counts.after, 0);
    closeNumber(
      "explicit step retains separate accumulator",
      (f.system as any)._accumulator,
      0.75 / 60,
    );
    const extra = capture(() => f.system.step(1 / 60, 1 / 30, 2));
    check(
      "Cannon-style extra accumulator arguments still reject",
      extra.thrown,
      true,
    );
    check(
      "rejected extra arguments do not advance",
      f.world.diagnostics().native.nativeStepIndex,
      1,
    );
  },
);
control(
  "C02 disabled scene preflight and component assembly are existing positive controls",
  (f) => {
    f.system.enable = false;
    const n = new Node("pause-assembly-positive");
    nodes.push(n);
    const rb = n.addComponent(RigidBody);
    components.push(rb);
    (rb as any).onLoad();
    (rb as any).onEnable();
    const shape = n.addComponent(BoxCollider);
    components.push(shape);
    (shape as any).onLoad();
    (shape as any).onEnable();
    f.system.postUpdate(1 / 60);
    const d = f.world.diagnostics();
    check("body assembled without world fault", d.state, "ready");
    check("one actual-owner logical body", d.commandOwner.bodies, 1);
    check("two actual-owner components", d.commandOwner.components, 2);
    check("one disabled-System scene preflight", d.sceneSyncCalls, 1);
    check(
      "scene sync does not advance mock native solver",
      d.native.nativeStepIndex,
      0,
    );
    closeNumber(
      "disabled postUpdate adds no time",
      (f.system as any)._accumulator,
      0,
    );
  },
);

control('G01 autoSimulation=false in BEFORE stops automatic work, retains backlog and permits manual', (f) => {
    f.system.resetAccumulator(0.5 / 60);
    const counts = events(() => {
        f.system.autoSimulation = false;
    });
    f.system.postUpdate(2 / 60);
    check('BEFORE once', counts.before, 1);
    check('normal AFTER once', counts.after, 1);
    check('no automatic step', f.world.diagnostics().native.nativeStepIndex, 0);
    closeNumber('existing plus newly added backlog retained', (f.system as any)._accumulator, 2.5 / 60);
    check('owner not paused', f.world.diagnostics().commandOwner.systemControl.paused, false);
    check('queue remains ready', f.world.diagnostics().commandOwner.systemControl.queuePhase, 'ready');
    check(
        'auto-only change did not commit queue pause',
        f.world.diagnostics().commandOwner.systemControl.lastChange.queueCommitEntered,
        false,
    );
    const result = capture(() => f.system.step(1 / 60));
    check('manual remains allowed', result.thrown, false);
    check('one explicit mock step', f.world.diagnostics().native.nativeStepIndex, 1);
    closeNumber('manual leaves backlog intact', (f.system as any)._accumulator, 2.5 / 60);
});
for (const property of ['autoSimulation', 'enable'] as const) {
    control(`G02 ${property}=false between completed ticks stops next automatic tick without losing backlog`, (f) => {
        const originalSync = f.world.syncAfterEvents;
        let interventions = 0;
        f.world.syncAfterEvents = function () {
            originalSync.call(this);
            if (interventions++ === 0) f.system[property] = false;
        };
        eventLeases.push(() => {
            f.world.syncAfterEvents = originalSync;
        });
        row.injection =
            'HARNESS_EXPLICIT_BETWEEN_TICK_AFTER_ORIGINAL_SYNC_AFTER_EVENTS_RETURN; not native or component callback';
        const counts = events();
        f.system.postUpdate(3.5 / 60);
        check('exactly one completed automatic mock step', f.world.diagnostics().native.nativeStepIndex, 1);
        check('only successful first substep charged', (f.system as any)._subStepCount, 1);
        closeNumber('remaining backlog retained', (f.system as any)._accumulator, 2.5 / 60);
        check('one BEFORE', counts.before, 1);
        check('one normal AFTER', counts.after, 1);
        check(
            'owner pause follows enable only',
            f.world.diagnostics().commandOwner.systemControl.paused,
            property === 'enable',
        );
        const manual = capture(() => f.system.step(1 / 60));
        check('manual admission follows owner pause', manual.thrown, property === 'enable');
        closeNumber('manual attempt preserves backlog', (f.system as any)._accumulator, 2.5 / 60);
        f.system[property] = true;
        f.system.postUpdate(0);
        check(
            'retained backlog drains on resumed automatic scheduling',
            f.world.diagnostics().native.nativeStepIndex,
            property === 'enable' ? 3 : 4,
        );
        closeNumber('fractional backlog retained after catch-up', (f.system as any)._accumulator, 0.5 / 60);
        check('normal AFTER preserved after resume', counts.after, 2);
    });
}
control(
    'G03 initially disabled System is registered paused and permits non-target component assembly',
    (f) => {
        const before = f.world.diagnostics();
        check('private initial enabled read installed pause', before.commandOwner.systemControl.paused, true);
        check(
            'initial queue paused before component allocation',
            before.commandOwner.systemControl.queuePhase,
            'paused',
        );
        check('initial enable cache unchanged', f.system.enable, false);
        const n = new Node('initially-disabled-assembly');
        nodes.push(n);
        const rb = n.addComponent(RigidBody);
        components.push(rb);
        (rb as any).onLoad();
        (rb as any).onEnable();
        const box = n.addComponent(BoxCollider);
        components.push(box);
        (box as any).onLoad();
        (box as any).onEnable();
        f.system.postUpdate(2 / 60);
        const d = f.world.diagnostics();
        check('world remains ready', d.state, 'ready');
        check('one owner body', d.commandOwner.bodies, 1);
        check('two owner components', d.commandOwner.components, 2);
        check('disabled preflight only', d.sceneSyncCalls, 1);
        check('manual rejects in initial pause', capture(() => f.system.step(1 / 60)).thrown, true);
        check('zero mock native steps', f.world.diagnostics().native.nativeStepIndex, 0);
        closeNumber('no disabled-frame time accumulated', (f.system as any)._accumulator, 0);
        f.system.enable = true;
        f.system.autoSimulation = false;
        check('resume explicit manual succeeds', capture(() => f.system.step(1 / 60)).thrown, false);
        check('one mock native step after resume', f.world.diagnostics().native.nativeStepIndex, 1);
    },
    false,
);
for (const property of ['enable', 'autoSimulation'] as const) {
    control(`G04 strict ${property} invalid input leaves flags, queue, native calls and scopes unchanged`, (f) => {
        const hostile: any = {
            get valueOf() {
                throw Error('strict boolean must not coerce');
            },
        };
        for (const value of [undefined, null, 0, 1, '', 'false', [], {}, new Boolean(false), hostile]) {
            const calls = f.calls.length,
                before = f.world.diagnostics();
            const result = capture(() => {
                f.system[property] = value;
            });
            const after = f.world.diagnostics();
            check('strict invalid input rejected', result.thrown, true);
            check('enable retained', f.system.enable, true);
            check('auto retained', f.system.autoSimulation, true);
            check('no mock native API call', f.calls.length, calls);
            check('world remains recoverable ready', after.state, 'ready');
            check(
                'queue phase retained',
                after.commandOwner.systemControl.queuePhase,
                before.commandOwner.systemControl.queuePhase,
            );
            check('no queue reservation leaked', after.commandOwner.systemControl.preparedQueueControl, false);
            check('no owner control scope leaked', after.commandOwner.systemControl.unresolvedScopes, 0);
            check('no temporary mutation fence leaked', after.commandOwner.activeTemporaryScopes, 0);
        }
        check(
            'valid write still succeeds',
            capture(() => {
                f.system[property] = false;
            }).thrown,
            false,
        );
    });
}
for (const [label, primary] of [
    ['undefined', undefined],
    ['zero', 0],
] as const) {
    control(
        `G05 actual owner fault preserves ${label} first error; later System execution/control refuse without native`,
        (f) => {
            const originalStep = f.binding.step;
            f.binding.step = () => {
                f.calls.push('INJECTED_STEP_FAILURE');
                throw primary;
            };
            eventLeases.push(() => {
                f.binding.step = originalStep;
            });
            row.injection = 'EXPLICIT_MOCK_NATIVE_STEP_THROW_NOT_REAL_NATIVE_FAILURE';
            const failed = capture(() => f.system.step(1 / 60));
            check('step threw', failed.thrown, true);
            check('first thrown identity retained', failed.error, primary);
            const d = f.world.diagnostics();
            check('actual world faulted', d.state, 'faulted');
            check('first failure marker retained', d.failure.hasFailure, true);
            check('first failure identity retained', d.failure.error, primary);
            const calls = f.calls.length;
            for (const action of [
                () => f.system.step(1 / 60),
                () => f.system.postUpdate(2 / 60),
                () => {
                    f.system.enable = false;
                },
                () => {
                    f.system.autoSimulation = false;
                },
            ]) {
                check('faulted admission rejects', capture(action).thrown, true);
                check('no additional mock native call', f.calls.length, calls);
            }
            check('enable unchanged after refusal', f.system.enable, true);
            check('auto unchanged after refusal', f.system.autoSimulation, true);
            check(
                'no owner control scope leaked',
                f.world.diagnostics().commandOwner.systemControl.unresolvedScopes,
                0,
            );
        },
    );
}
control('G06 closed actual world rejects manual and automatic stepping with no native calls', (f) => {
    f.world.destroy();
    const d = f.world.diagnostics(),
        calls = f.calls.length;
    check('actual owner closed', d.commandOwner.phase, 'closed');
    check('actual System observer lease released', d.commandOwner.systemControl.observed, false);
    check('manual closed world rejects', capture(() => f.system.step(1 / 60)).thrown, true);
    check('automatic closed world rejects', capture(() => f.system.postUpdate(1 / 60)).thrown, true);
    check('no native calls after close', f.calls.length, calls);
    check('not resurrected', f.world.diagnostics().state, 'destroyed');
    row.boundary =
        'Released observer means later standalone flag assignments regain unobserved semantics; no artificial terminal System flag contract asserted.';
});
for (const property of ['enable', 'autoSimulation'] as const) {
    control(`G07 caught same-value and false ${property} writes during solver reject before cache mutation`, (f) => {
        const step = f.binding.step,
            nested: any[] = [];
        f.binding.step = (...args: any[]) => {
            nested.push(
                capture(() => {
                    f.system[property] = true;
                }),
            );
            nested.push(
                capture(() => {
                    f.system[property] = false;
                }),
            );
            return step(...args);
        };
        eventLeases.push(() => {
            f.binding.step = step;
        });
        row.injection = 'EXPLICIT_MOCK_BINDING_SOLVER_CALLBACK; actual System earliest mutation guard';
        const outcome = capture(() => f.system.step(1 / 60));
        check('outer completed mock tick unchanged by caught rejected configuration', outcome.thrown, false);
        check('both writes refused', nested.length === 2 && nested.every((v) => v.thrown), true);
        check('cache remains true', f.system[property], true);
        check('owner not partially paused', f.world.diagnostics().commandOwner.systemControl.paused, false);
        check('one actual mock step completes', f.world.diagnostics().native.nativeStepIndex, 1);
        check('no control scope leaked', f.world.diagnostics().commandOwner.systemControl.unresolvedScopes, 0);
    });
}
control('G08 thrown BEFORE preserves original throw and backlog, emits no AFTER', (f) => {
    const primary = { injectedBeforeFailure: true };
    const counts = events(() => {
        throw primary;
    });
    const result = capture(() => f.system.postUpdate(2.5 / 60));
    check('original event error retained', result.error, primary);
    check('BEFORE ran once', counts.before, 1);
    check('no AFTER after throwing event', counts.after, 0);
    check('no mock step', f.world.diagnostics().native.nativeStepIndex, 0);
    closeNumber('already-added backlog retained', (f.system as any)._accumulator, 2.5 / 60);
});
