import test from "node:test";
import assert from "node:assert/strict";
import { Lifecycle } from "../src/lifecycle.mjs";
import { IdleQueue } from "../src/protocol.mjs";
test("multiclick/reset admission and close during transition", async () => {
  const gate = new Lifecycle(),
    queue = new IdleQueue();
  let release;
  const blocked = new Promise((r) => (release = r)),
    calls = [];
  assert.equal(gate.beginTransition(), true);
  assert.equal(gate.beginTransition(), false);
  const resetting = queue
    .enqueue(async () => {
      calls.push("release");
      await blocked;
      if (!gate.closing && !gate.closed && !gate.faulted) calls.push("mount");
    })
    .finally(() => gate.endTransition());
  assert.equal(gate.beginClose(), true);
  assert.equal(gate.beginClose(), false);
  assert.equal(gate.beginTransition(), false);
  const closing = queue.enqueue(async () => {
    calls.push("close");
    gate.endClose(true);
  });
  release();
  await Promise.all([resetting, closing]);
  assert.deepEqual(calls, ["release", "close"]);
  assert.equal(gate.closed, true);
  assert.equal(gate.beginTransition(), false);
  assert.equal(gate.beginClose(), false);
});
test("fault blocks reset but not preparation; pre-SDK preparation failure permits another attempt", () => {
  const gate = new Lifecycle();
  gate.faulted = true;
  assert.equal(gate.beginTransition(), false);
  assert.equal(gate.beginClose(), true);
  gate.endClose(false);
  assert.equal(gate.closed, false);
  assert.equal(gate.closing, false);
  assert.equal(gate.beginClose(), true);
  gate.endClose(true);
  assert.equal(gate.closed, true);
});
test("failed release does not strand queued Close or transition finally", async () => {
  const gate = new Lifecycle(),
    queue = new IdleQueue();
  assert.ok(gate.beginTransition());
  const reset = queue
    .enqueue(async () => {
      throw Error("release failed");
    })
    .finally(() => gate.endTransition());
  const observed = assert.rejects(reset, /release failed/);
  assert.ok(gate.beginClose());
  const close = queue.enqueue(async () => {
    gate.endClose(true);
  });
  await observed;
  await close;
  assert.equal(gate.transitioning, false);
  assert.equal(gate.closed, true);
});
test("SDK close invoked then failed is terminal, not a retry of cached SDK promise", () => {
  const gate = new Lifecycle();
  assert.ok(gate.beginClose());
  gate.startSdkClose();
  gate.endClose(false);
  assert.equal(gate.sdkCloseStarted, true);
  assert.equal(gate.beginClose(), false);
  assert.equal(gate.beginTransition(), false);
});
