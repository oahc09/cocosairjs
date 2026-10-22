/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Original PhysicsSystem/World/owner source. Instrumented MOCK native binding only.
 * Product-contract RED is intentionally a failing assertion, not a passing feature.
 */
import { PhysicsSystem } from "../box3d-rebuild-20261022/src/cocos/physics/framework/physics-system";
import { PhysicsMaterial } from "../box3d-rebuild-20261022/src/cocos/physics/framework/assets/physics-material";
import { selector } from "../box3d-rebuild-20261022/src/cocos/physics/framework/physics-selector";
import {
  director,
  DirectorEvent,
} from "../box3d-rebuild-20261022/src/cocos/game";
import { Node } from "../box3d-rebuild-20261022/src/cocos/scene-graph/node";
import { RigidBody } from "../box3d-rebuild-20261022/src/cocos/physics/framework/components/rigid-body";
import { BoxCollider } from "../box3d-rebuild-20261022/src/cocos/physics/framework/components/colliders/box-collider";
import {
  CCObject,
  isValid,
} from "../box3d-rebuild-20261022/src/cocos/core/data/object";
import { createBox3DWorldAdapter } from "../box3d-rebuild-20261022/src/air/physics/box3d/registration";
import { createAirPhysicsPreparation } from "../box3d-rebuild-20261022/src/air/physics/preparation";
import { mockBinding } from "./mock-native-binding";
const fs = require("node:fs"),
  crypto = require("node:crypto"),
  path = require("node:path");
const repo = path.resolve(__dirname, "../box3d-rebuild-20261022");
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
function fixture(): any {
  const mock = mockBinding();
  const preparation = createAirPhysicsPreparation();
  const system = new (PhysicsSystem as any)() as PhysicsSystem;
  (PhysicsSystem as any)._instance = system;
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
    owner.materialObserverLeases !== 1
  )
    throw new Error(
      "Fixture did not establish original System/world/material owner binding.",
    );
  row.setup = {
    actualSystem: true,
    actualWorld: true,
    actualOwner: true,
    materialObserverLeases: owner.materialObserverLeases,
    systemControlObservation: "NOT_INTEGRATED",
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
function control(name: string, fn: (f: any) => void): void {
  test(name, () => {
    row = { name, status: "SETUP_PENDING", checks: [] };
    rows.push(row);
    let f: any;
    try {
      f = fixture();
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
