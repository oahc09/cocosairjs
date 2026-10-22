/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Test helper copied from the identified actual-source owner fixture, NOT product source.
 * MOCK ONLY: it is not WASM, a native solver, browser or physical qualification.
 */
const copy = (value: any): any =>
  value === undefined
    ? { type: "undefined" }
    : JSON.parse(
        JSON.stringify(value, (_key, v) =>
          typeof v === "bigint" ? String(v) : v,
        ),
      );
function frozen(value: any): any {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) frozen(v);
    Object.freeze(value);
  }
  return value;
}
/** Deliberately NOT a solver. Step moves enabled nonstatic origins by exactly +0.25 X for writeback controls. */
export function mockBinding() {
  let id = 0,
    step = 0,
    completed = false,
    available = false,
    live = false;
  const calls: string[] = [],
    bodies = new Map<any, any>(),
    shapes = new Map<any, any>();
  let gravity = [0, -10, 0],
    sleeping = true;
  const token = () => Object.freeze({ id: ++id });
  const state = (body: any) => frozen(copy(bodies.get(body).state));
  const mutate = (name: string, body: any, patch: any) => {
    calls.push(name);
    Object.assign(bodies.get(body).state, patch);
    available = false;
    return state(body);
  };
  const binding: any = {
    identity: frozen({ abiVersion: 1, variant: "st-simd" }),
    createWorld() {
      calls.push("createWorld");
      live = true;
      return token();
    },
    destroyWorld() {
      calls.push("destroyWorld");
      live = false;
      bodies.clear();
      shapes.clear();
    },
    step() {
      calls.push("step");
      step++;
      completed = available = true;
      for (const b of bodies.values())
        if (b.state.enabled && b.state.type !== 0) b.pose[0] += 0.25;
    },
    stepDiagnostics: () => ({
      nativeStepIndex: step,
      nativeCompleted: completed,
      snapshotAvailable: available,
    }),
    readStepSnapshot: (world: any) =>
      frozen({
        worldId: world.id,
        stepIndex: step,
        bodyMoves: [],
        contactsOfOwnedBodies: [],
      }),
    getGravity: () => [...gravity],
    setGravity(_w: any, g: number[]) {
      gravity = [...g];
      available = false;
      calls.push("setGravity");
    },
    isSleepingEnabled: () => sleeping,
    setSleepingEnabled(_w: any, value: boolean) {
      sleeping = value;
      available = false;
      calls.push("setSleepingEnabled");
    },
    debugSnapshot: (_w: any, flags: number, jointScale: number) =>
      frozen({ flags, jointScale, supportedFlags: 5, primitives: [] }),
    liveBytes: () => (live ? BigInt(64) : BigInt(0)),
    worldCounts: () => ({
      counts: new Uint32Array([bodies.size, shapes.size, 0, 0]),
      liveBytes: live ? BigInt(64) : BigInt(0),
    }),
    createBody(_w: any, definition: any) {
      calls.push("createBody");
      const t = token();
      bodies.set(t, {
        pose: [...definition.position, ...definition.rotation, 0, 0, 0],
        state: {
          type: definition.type,
          enabled: true,
          awake: true,
          sleeping: false,
          sleepy: false,
          sleepEnabled: true,
          ccd: false,
          sleepTime: 0,
          sleepVelocity: 0,
          sleepThreshold: 0.1,
          linearDamping: 0,
          angularDamping: 0,
          gravityScale: 1,
          linearVelocity: [1, 2, 3],
          angularVelocity: [0, 0, 0],
          force: [0, 0, 0],
          torque: [0, 0, 0],
          linearFactor: [1, 1, 1],
          angularFactor: [1, 1, 1],
          mass: 1,
          localCenter: [0, 0, 0],
          inertia: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          worldCenter: [0, 0, 0],
          requestedMass: 1,
          massPending: false,
          sensorMassFallback: false,
        },
      });
      return t;
    },
    destroyBody(body: any) {
      calls.push("destroyBody");
      if (!bodies.delete(body)) throw Error("Mock body not owned");
    },
    bodyState: (_w: any, body: any) => state(body),
    bodyTransforms: (_w: any, ids: any[]) =>
      ids.reduce(
        (all: number[], body: any) => all.concat(bodies.get(body).pose),
        [],
      ),
    setBodyType: (_w: any, b: any, v: any) =>
      mutate("setBodyType", b, { type: v }),
    setBodyEnabled: (_w: any, b: any, v: any) =>
      mutate("setBodyEnabled", b, { enabled: v }),
    setBodyMass: (_w: any, b: any, v: any) =>
      mutate("setBodyMass", b, { mass: v, requestedMass: v }),
    setBodyDamping: (_w: any, b: any, x: any, y: any) =>
      mutate("setBodyDamping", b, { linearDamping: x, angularDamping: y }),
    setBodyGravityScale: (_w: any, b: any, v: any) =>
      mutate("setBodyGravityScale", b, { gravityScale: v }),
    setBodySleepEnabled: (_w: any, b: any, v: any) =>
      mutate("setBodySleepEnabled", b, { sleepEnabled: v }),
    setBodySleepThreshold: (_w: any, b: any, v: any) =>
      mutate("setBodySleepThreshold", b, { sleepThreshold: v }),
    setBodyAwake: (_w: any, b: any, v: any) =>
      mutate("setBodyAwake", b, { awake: v }),
    setBodyCCD: (_w: any, b: any, v: any) =>
      mutate("setBodyCCD", b, { ccd: v }),
    setBodyMotionFactors: (_w: any, b: any, x: any, y: any) =>
      mutate("setBodyMotionFactors", b, {
        linearFactor: [...x],
        angularFactor: [...y],
      }),
    setBodyLinearVelocity: (_w: any, b: any, v: any) =>
      mutate("setBodyLinearVelocity", b, { linearVelocity: [...v] }),
    setBodyAngularVelocity: (_w: any, b: any, v: any) =>
      mutate("setBodyAngularVelocity", b, { angularVelocity: [...v] }),
    applyBodyForce: (_w: any, b: any, v: any) =>
      mutate("applyBodyForce", b, { force: [...v] }),
    applyBodyImpulse: (_w: any, b: any, v: any) =>
      mutate("applyBodyImpulse", b, { linearVelocity: [...v] }),
    applyBodyTorque: (_w: any, b: any, v: any) =>
      mutate("applyBodyTorque", b, { torque: [...v] }),
    clearBodyForces: (_w: any, b: any) =>
      mutate("clearBodyForces", b, { force: [0, 0, 0], torque: [0, 0, 0] }),
    clearBodyVelocity: (_w: any, b: any) =>
      mutate("clearBodyVelocity", b, {
        linearVelocity: [0, 0, 0],
        angularVelocity: [0, 0, 0],
      }),
    clearBodyState: (_w: any, b: any) =>
      mutate("clearBodyState", b, {
        force: [0, 0, 0],
        torque: [0, 0, 0],
        linearVelocity: [0, 0, 0],
        angularVelocity: [0, 0, 0],
      }),
    createOffsetBox(body: any) {
      calls.push("createOffsetBox");
      const t = token();
      shapes.set(t, {
        body,
        material: { friction: 0.6, restitution: 0 },
        filter: { group: 1, mask: 0xffffffff },
      });
      return t;
    },
    createOffsetSphere(body: any) {
      calls.push("createOffsetSphere");
      const t = token();
      shapes.set(t, {
        body,
        material: { friction: 0.6, restitution: 0 },
        filter: { group: 1, mask: 0xffffffff },
      });
      return t;
    },
    destroyShape(t: any) {
      calls.push("destroyShape");
      if (!shapes.delete(t)) throw Error("Mock shape not owned");
    },
    configureShapeEvents() {
      calls.push("configureShapeEvents");
    },
    getShapeMaterial: (_w: any, t: any) => ({ ...shapes.get(t).material }),
    setShapeMaterial(_w: any, t: any, m: any) {
      calls.push("setShapeMaterial");
      shapes.get(t).material = { ...m };
    },
    getShapeFilter: (_w: any, t: any) => ({ ...shapes.get(t).filter }),
    setShapeFilter(_w: any, t: any, f: any) {
      calls.push("setShapeFilter");
      return (shapes.get(t).filter = frozen({ ...f }));
    },
    setShapeFilters(_w: any, ids: any[], f: any) {
      calls.push("setShapeFilters");
      return ids.map((t) => (shapes.get(t).filter = frozen({ ...f })));
    },
  };
  return { binding, calls, bodies, shapes };
}
