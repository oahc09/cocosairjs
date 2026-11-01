/** CPU orchestration negatives, not SDK/native lifecycle acceptance. The double is explicit. */
import test from "node:test";
import assert from "node:assert/strict";
import { releaseOwned, attemptStops } from "../src/cleanup.mjs";
function fixture({
  unmounted = false,
  failFirst = false,
  destroyThrows = false,
  flushStuck = false,
} = {}) {
  const calls = [],
    rows = [],
    pending = [];
  const scene = {
    isValid: true,
    destroy() {
      calls.push("scene.destroy");
      pending.push(this);
    },
  };
  const asset = {
    isValid: true,
    destroy() {
      calls.push("asset.destroy");
      if (destroyThrows) throw Error("asset failure");
      pending.push(this);
    },
  };
  let current = unmounted ? null : scene,
    count = 0;
  const app = {
    getScene() {
      return current;
    },
    async releaseScene() {
      calls.push("release");
      count++;
      if (count === 1 && failFirst) return { status: "failed" };
      if (current) {
        current.destroy();
        current = null;
      }
      if (!(count === 2 && flushStuck))
        for (const o of pending.splice(0)) o.isValid = false;
      return { status: "released" };
    },
  };
  return {
    app,
    scene,
    assets: [asset],
    record: (r) => rows.push(r),
    calls,
    rows,
    asset,
  };
}
test("scene release precedes asset destroy and second public flush; no post-receipt pending asset", async () => {
  const f = fixture();
  await releaseOwned(f);
  assert.deepEqual(f.calls, [
    "release",
    "scene.destroy",
    "asset.destroy",
    "release",
  ]);
  assert.equal(f.assets.length, 0);
  assert.equal(f.asset.isValid, false);
});
test("unmounted candidate explicitly destroyed before public flush", async () => {
  const f = fixture({ unmounted: true });
  await releaseOwned(f);
  assert.deepEqual(f.calls, [
    "scene.destroy",
    "release",
    "asset.destroy",
    "release",
  ]);
});
test("failed first scene release never destroys potentially-live shared asset", async () => {
  const f = fixture({ failFirst: true });
  await assert.rejects(releaseOwned(f), /Scene release failed/);
  assert.equal(f.assets[0], f.asset);
  assert.deepEqual(f.calls, ["release"]);
});
test("asset failure preserves identity and still flushes successful destruction requests", async () => {
  const f = fixture({ destroyThrows: true });
  await assert.rejects(releaseOwned(f), /incomplete/);
  assert.equal(f.assets[0], f.asset);
  assert.equal(f.calls.at(-1), "release");
});
test("released receipt alone does not drop a still-valid asset", async () => {
  const f = fixture({ flushStuck: true });
  await assert.rejects(releaseOwned(f), /incomplete/);
  assert.equal(f.assets[0], f.asset);
});

test("refused handle disposal cannot skip remaining stops and public cleanup", async () => {
  const f = fixture(),
    calls = [];
  const errors = attemptStops([
    () => {
      calls.push("hook");
      throw Error("faulted owner");
    },
    () => calls.push("target"),
  ]);
  assert.deepEqual(calls, ["hook", "target"]);
  assert.equal(errors.length, 1);
  await releaseOwned(f);
  assert.equal(f.assets.length, 0);
});
