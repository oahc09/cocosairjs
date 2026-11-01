import test from "node:test";
import assert from "node:assert/strict";
import {
  FIXED_DT,
  SUBSTEPS,
  clock,
  assertClock,
  pinPositions,
  down,
  assertLive,
  massChoice,
  targetPose,
  IdleQueue,
} from "../src/protocol.mjs";
test("ten distinct triangular pins; no CPU-generated motion evidence", () => {
  const p = pinPositions();
  assert.equal(p.length, 10);
  assert.equal(new Set(p.map((p) => JSON.stringify(p))).size, 10);
  assert.deepEqual(
    [0, 1, 2, 3].map((r) => p.filter((p) => p.z === -2 - r * 0.8).length),
    [1, 2, 3, 4],
  );
});
test("clock copies actual native float32 before exact check; double/incorrect substeps rejected", () => {
  const source = {
      tickIndex: 2,
      attemptId: 3,
      fixedDt: Math.fround(FIXED_DT),
      solverSubSteps: SUBSTEPS,
    },
    row = clock(source);
  source.fixedDt = 0;
  assert.equal(row.actualNativeFixedDt, Math.fround(FIXED_DT));
  assertClock(row);
  assert.ok(Object.isFrozen(row));
  for (const patch of [
    { actualNativeFixedDt: FIXED_DT },
    { actualNativeFixedDt: NaN },
    { actualSolverSubSteps: 1 },
  ])
    assert.throws(() => assertClock({ ...row, ...patch }));
});
test("fall policy: upright and 59 degrees excluded; 61 and upside-down count; invalid input rejects", () => {
  const rot = (d) => ({
    x: Math.sin((d * Math.PI) / 360),
    y: 0,
    z: 0,
    w: Math.cos((d * Math.PI) / 360),
  });
  assert.equal(down(rot(0)), false);
  assert.equal(down(rot(59)), false);
  assert.equal(down(rot(61)), true);
  assert.equal(down(rot(180)), true);
  assert.throws(() => down({ x: NaN, y: 0, z: 0, w: 1 }));
  assert.throws(() => down({ x: 0, y: 0, z: 0, w: 2 }));
});
test("mass choices bounded; no geometry mutation in policy", () => {
  for (const value of [0.5, 1, 2])
    assert.equal(massChoice(String(value)), value);
  for (const value of [0, -1, 3, Infinity, "junk"])
    assert.throws(() => massChoice(value));
});
test("target is bounded translation and unit Y rotation, not a body teleport or simulation", () => {
  for (let step = 1; step <= 600; step++) {
    const p = targetPose(step);
    assert.ok(Math.abs(p.position.x) <= 0.35);
    assert.equal(p.position.y, -0.15);
    assert.equal(p.position.z, -2.8);
    assert.ok(Math.abs(Math.hypot(p.rotation.y, p.rotation.w) - 1) < 1e-12);
  }
});
test("retired and stale actor guarded before native read", () => {
  assertLive({ alive: true, generation: 2 }, 2);
  assert.throws(() => assertLive({ alive: false, generation: 2 }, 2));
  assert.throws(() => assertLive({ alive: true, generation: 1 }, 2));
});
test("queued reset failure does not strand Close; operations serialize", async () => {
  const queue = new IdleQueue(),
    calls = [];
  let resolve;
  const blocked = new Promise((r) => {
    resolve = r;
  });
  const reset = queue.enqueue(async () => {
    calls.push("reset-start");
    await blocked;
    calls.push("reset-end");
    throw Error("release fault");
  });
  const caught = assert.rejects(reset, /release fault/);
  const close = queue.enqueue(async () => {
    calls.push("close");
    return "released";
  });
  await Promise.resolve();
  assert.deepEqual(calls, ["reset-start"]);
  resolve();
  await caught;
  assert.equal(await close, "released");
  assert.deepEqual(calls, ["reset-start", "reset-end", "close"]);
});
