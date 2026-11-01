/** Static guardrails only; not runtime tests. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(
  new URL("../src/main.ts", import.meta.url),
  "utf8",
).replace(/\s+/g, "");
test("no private physics bypass or body teleport in target update", () => {
  assert.doesNotMatch(
    source,
    /world\.impl|\.physicsWorld|\.simulate\(|\.step\(|\.nativeHandle/,
  );
  assert.match(source, /target!\.setTarget\(pose\)/);
  assert.doesNotMatch(source, /platform\.node\.set(Position|Rotation)/);
});
test("mount occurs before noncached CCD/velocity and kinematic lease", () => {
  const mount = source.indexOf("app!.run(scene)");
  for (const text of [
    "a.body.useCCD=a===ball",
    "a.body.setLinearVelocity",
    "target=createBox3DKinematicTarget",
  ])
    assert.ok(source.indexOf(text) > mount);
});
test("native COM not visual estimated; explicit acceptance boundary", () => {
  assert.match(source, /a\.marker\.setPosition\(m\.worldCOM\.x/);
  assert.match(source, /ball\.body\.applyImpulse\(impulse,relativePoint\)/);
  assert.match(source, /reset20:['"]NOT_RUN['"]/);
  assert.doesNotMatch(source, /acceptance:['"]PASS['"]/);
});

test("mounted owner is enabled before velocity and kinematic target admission", () => {
  const mount = source.indexOf("app!.run(scene)");
  const enabled = source.indexOf("system.enable=true", mount);
  assert.ok(enabled > mount);
  for (const text of [
    "a.body.setLinearVelocity",
    "target=createBox3DKinematicTarget",
  ])
    assert.ok(source.indexOf(text) > enabled);
});
