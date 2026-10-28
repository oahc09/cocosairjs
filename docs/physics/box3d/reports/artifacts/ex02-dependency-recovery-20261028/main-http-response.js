import {
  createAirApp,
  AIR_BUILD_NUMBER,
  AIR_REVISION,
  Scene,
  Node,
  Camera,
  DirectionalLight,
  MeshRenderer,
  Material,
  PhysicsMaterial,
  RigidBody,
  ERigidBodyType,
  BoxCollider,
  SphereCollider,
  Color,
  Vec3,
  Layers,
  primitives,
  utils,
  physics,
  director,
  Director,
  registerBox3DBeforeStep,
  readBox3DBodyMotion,
  createBox3DKinematicTarget,
  queryBox3DCommittedColliders
} from "cocosair";
import {
  FIXED_DT,
  SUBSTEPS,
  WINDOW_TICKS,
  clock,
  assertClock,
  pinPositions,
  down,
  assertLive,
  massChoice,
  targetPose,
  IdleQueue
} from "./protocol.mjs";
import { Lifecycle } from "./lifecycle.mjs";
import { releaseOwned, attemptStops } from "./cleanup.mjs";
const lifecycle = new Lifecycle();
const el = (id) => document.getElementById(id);
const button = (id) => el(id);
const history = [], log = [], operations = new IdleQueue();
let app, system, scene;
let hook, target;
let unsubscribe, identity;
let assets = [];
let actors = [], pins = [], ball, platform, run;
let generation = 0, tick = -1, attempt = -1, observed = -1, steps = 0;
let running = false, fired = false, impulsePending = false, geometryPending = true;
const status = (message) => {
  el("status").textContent = message;
};
function ui() {
  const blocked = !app || lifecycle.faulted || lifecycle.closed || lifecycle.closing || lifecycle.transitioning;
  button("start").disabled = blocked;
  button("reset").disabled = blocked;
  for (const id of ["center", "offcenter"]) button(id).disabled = blocked || !running || fired || impulsePending;
  button("mass-apply").disabled = blocked || !running;
  el("mass").disabled = blocked;
  button("close").disabled = !app || lifecycle.closed || lifecycle.closing || lifecycle.sdkCloseStarted;
  el("counts").textContent = `Generation ${generation} \xB7 native observations ${steps}/${WINDOW_TICKS} \xB7 fallen ${run?.score.length ?? 0}/10
Acceptance NOT_RUN \xB7 reset leak evidence NOT_RUN`;
}
function dispose() {
  hook?.dispose();
  hook = void 0;
  target?.dispose();
  target = void 0;
}
function fault(error, source) {
  log.push({ kind: "fault", source, error: String(error), generation, tick });
  lifecycle.faulted = true;
  running = false;
  if (run && run.status === "RUNNING") run.status = "FAULTED";
  queueMicrotask(() => {
    try {
      if (system) system.enable = false;
      dispose();
    } catch (e) {
      log.push({ kind: "cleanup-fault", error: String(e) });
    }
    status(
      `BLOCKED: ${error} \xB7 ${lifecycle.sdkCloseStarted ? "terminal Close already invoked; export and reload" : "Close preparation available"}; evidence retained`
    );
    ui();
  });
}
function idle(label, work, token = generation, owner = run) {
  queueMicrotask(() => {
    if (token !== generation || lifecycle.faulted || lifecycle.closed || lifecycle.closing || lifecycle.transitioning || !running) {
      owner?.requests.push({ label, status: "CANCELLED", generation: token });
      return;
    }
    try {
      work();
      owner?.requests.push({
        label,
        status: "SUBMITTED_AT_IDLE_NOT_RESULT",
        generation: token,
        afterTick: tick
      });
      ui();
    } catch (error) {
      fault(error, label);
    }
  });
}
function motion(actor2) {
  assertLive(actor2, generation);
  return readBox3DBodyMotion(actor2.body);
}
function paint(rgb) {
  const m = new Material();
  assets.push(m);
  m.initialize({ effectName: "builtin-standard" });
  m.setProperty("mainColor", new Color(rgb[0], rgb[1], rgb[2], 255));
  m.setProperty("roughness", 0.7);
  return m;
}
function visual(n, geometry2, material) {
  const mesh = utils.createMesh(geometry2);
  assets.push(mesh);
  const r = n.addComponent(MeshRenderer);
  r.mesh = mesh;
  r.setSharedMaterial(material, 0);
}
function actor(name, position, type, mass) {
  const n = new Node(name);
  n.active = false;
  scene.addChild(n);
  n.layer = Layers.Enum.DEFAULT;
  n.setPosition(position);
  const body = n.addComponent(RigidBody);
  body.type = type;
  body.mass = mass;
  body.useGravity = type === ERigidBodyType.DYNAMIC;
  body.allowSleep = false;
  body.linearDamping = 0.02;
  body.angularDamping = 0.02;
  const a = {
    id: `g${generation}:${name}`,
    generation,
    alive: true,
    node: n,
    body,
    colliders: []
  };
  actors.push(a);
  return a;
}
function box(a, size, center, material, surface) {
  const c = a.node.addComponent(BoxCollider);
  c.size = size;
  c.center = center;
  c.sharedMaterial = surface;
  a.colliders.push(c);
  const child = new Node("box visual");
  child.layer = Layers.Enum.DEFAULT;
  child.setPosition(center);
  a.node.addChild(child);
  visual(child, primitives.box({ width: size.x, height: size.y, length: size.z }), material);
}
function sphere(a, radius, center, material, surface) {
  const c = a.node.addComponent(SphereCollider);
  c.radius = radius;
  c.center = center;
  c.sharedMaterial = surface;
  a.colliders.push(c);
  const child = new Node("sphere visual");
  child.layer = Layers.Enum.DEFAULT;
  child.setPosition(center);
  a.node.addChild(child);
  visual(child, primitives.sphere(radius), material);
}
function activate(a, markerMaterial) {
  scene.addChild(a.node);
  a.node.active = true;
  if (markerMaterial) {
    const n = new Node(`${a.id}:native-COM`);
    n.layer = Layers.Enum.DEFAULT;
    n.active = false;
    scene.addChild(n);
    visual(n, primitives.sphere(0.065), markerMaterial);
    for (const size of [new Vec3(0.95, 0.015, 0.015), new Vec3(0.015, 0.95, 0.015), new Vec3(0.015, 0.015, 0.95)]) {
      const axis = new Node("native COM crosshair");
      axis.layer = Layers.Enum.DEFAULT;
      n.addChild(axis);
      visual(axis, primitives.box({ width: size.x, height: size.y, length: size.z }), markerMaterial);
    }
    a.marker = n;
  }
}
function geometry(a) {
  return a.colliders.map((c) => ({
    kind: c instanceof BoxCollider ? "box" : "sphere",
    center: { x: c.center.x, y: c.center.y, z: c.center.z },
    dimensions: c instanceof BoxCollider ? [c.size.x, c.size.y, c.size.z] : [c.radius]
  }));
}
function mount() {
  generation++;
  tick = attempt = observed = -1;
  steps = 0;
  fired = impulsePending = false;
  geometryPending = true;
  actors = [];
  pins = [];
  run = {
    generation,
    status: "RUNNING",
    acceptance: "NOT_RUN",
    frames: [],
    clocks: [],
    requests: [],
    geometry: [],
    score: []
  };
  history.push(run);
  scene = new Scene("box3d-compound-bowling");
  const cameraNode = new Node("Camera");
  scene.addChild(cameraNode);
  cameraNode.setPosition(7, 7, 10);
  cameraNode.lookAt(new Vec3(0, 0, -1));
  const camera = cameraNode.addComponent(Camera);
  camera.fov = 48;
  camera.near = 0.01;
  camera.far = 100;
  camera.visibility = Layers.Enum.DEFAULT;
  camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
  camera.clearColor = new Color(12, 22, 32, 255);
  const light = new Node("Light");
  scene.addChild(light);
  light.addComponent(DirectionalLight);
  light.setRotationFromEuler(-55, -20, 0);
  const surface = new PhysicsMaterial();
  assets.push(surface);
  surface.friction = 0.35;
  surface.restitution = 0.05;
  const ivory = paint([235, 222, 195]), green = paint([55, 225, 210]), orange = paint([230, 140, 65]), blue = paint([55, 85, 110]);
  const floor = actor("floor", new Vec3(0, -0.65, -1), ERigidBodyType.STATIC, 1);
  box(floor, new Vec3(10, 0.3, 15), new Vec3(), blue, surface);
  activate(floor);
  const lane = actor("approach lane", new Vec3(0, -0.15, 3.5), ERigidBodyType.STATIC, 1);
  box(lane, new Vec3(4.6, 0.3, 7.6), new Vec3(), blue, surface);
  activate(lane);
  platform = actor("kinematic platform", new Vec3(0, -0.15, -2.8), ERigidBodyType.KINEMATIC, 1);
  box(platform, new Vec3(4.6, 0.3, 5), new Vec3(), orange, surface);
  activate(platform);
  const mass = massChoice(el("mass").value);
  pins = pinPositions().map((p, i) => {
    const a = actor(`pin-${i + 1}`, new Vec3(p.x, p.y, p.z), ERigidBodyType.DYNAMIC, mass);
    box(a, new Vec3(0.32, 0.7, 0.32), new Vec3(0, -0.25, 0), ivory, surface);
    sphere(a, 0.23, new Vec3(0, 0.32, 0), ivory, surface);
    activate(a, green);
    return a;
  });
  ball = actor("ball", new Vec3(0, 0.38, 3.5), ERigidBodyType.DYNAMIC, 4);
  sphere(ball, 0.36, new Vec3(), orange, surface);
  activate(ball, green);
  app.run(scene);
  system.enable = true;
  for (const a of [...pins, ball]) {
    a.body.useCCD = a === ball;
    if (a.body.useCCD !== (a === ball)) throw Error("Mounted useCCD readback mismatch");
    a.body.setLinearVelocity(new Vec3());
    a.body.setAngularVelocity(new Vec3());
    const velocity = new Vec3(), angular = new Vec3();
    a.body.getLinearVelocity(velocity);
    a.body.getAngularVelocity(angular);
    run.requests.push({
      kind: "mounted-configuration",
      id: a.id,
      ccd: a.body.useCCD,
      velocity: { ...velocity },
      angularVelocity: { ...angular },
      requestedMass: a.body.mass
    });
  }
  target = createBox3DKinematicTarget(platform.body);
  target.setTarget(targetPose(1));
  run.requests.push({
    kind: "platform-target",
    pose: targetPose(1),
    status: "SUBMITTED_NOT_RESULT"
  });
  run.geometry.push({
    phase: "mounted",
    kind: "PUBLIC_COLLIDER_CONFIGURATION_NOT_NATIVE_GEOMETRY",
    pins: pins.map((a) => ({ id: a.id, geometry: geometry(a) }))
  });
  const token = generation, owner = run;
  hook = registerBox3DBeforeStep((context) => {
    try {
      if (token !== generation || !running || lifecycle.faulted) throw Error("Stale before-step");
      const c = clock(context);
      owner.clocks.push(c);
      assertClock(c);
      tick = context.tickIndex;
      attempt = context.attemptId;
      if (geometryPending) {
        for (const pin of pins) {
          const q = queryBox3DCommittedColliders(
            context,
            pin.colliders,
            { x: 0, y: 0, z: 1e-6 },
            { group: 1, mask: 4294967295, queryTrigger: false }
          );
          owner.geometry.push({
            phase: "before-step",
            tick,
            attempt,
            worldGeneration: q.worldGeneration,
            nativeStepIndex: q.nativeStepIndex,
            nativeMutationRevision: q.nativeMutationRevision,
            source: pin.id,
            body: motion(pin),
            children: q.children.map((c2) => ({
              kind: c2.kind,
              origin: c2.origin,
              rotation: c2.rotation,
              dimensions: c2.dimensions
            }))
          });
        }
        geometryPending = false;
      }
    } catch (error) {
      fault(error, "before-step");
      throw error;
    }
  });
  running = true;
  system.enable = true;
  status("\u539F\u751F\u8FD0\u884C \xB7 COM \u6807\u8BB0\u7B49\u5F85\u516C\u5F00\u8BFB\u56DE \xB7 NOT_RUN");
  ui();
}
function copyPoseCheck(a, m) {
  const p = a.node.worldPosition, q = a.node.worldRotation, r = m.rotation;
  const poseError = Math.max(
    Math.hypot(p.x - m.position.x, p.y - m.position.y, p.z - m.position.z),
    Math.min(
      Math.hypot(q.x - r.x, q.y - r.y, q.z - r.z, q.w - r.w),
      Math.hypot(q.x + r.x, q.y + r.y, q.z + r.z, q.w + r.w)
    )
  );
  const v = m.localCenter, u = {
    x: r.y * v.z - r.z * v.y,
    y: r.z * v.x - r.x * v.z,
    z: r.x * v.y - r.y * v.x
  };
  const expected = {
    x: m.position.x + v.x + 2 * (r.w * u.x + r.y * u.z - r.z * u.y),
    y: m.position.y + v.y + 2 * (r.w * u.y + r.z * u.x - r.x * u.z),
    z: m.position.z + v.z + 2 * (r.w * u.z + r.x * u.y - r.y * u.x)
  };
  return {
    poseError,
    comFrameConsistencyError: Math.hypot(
      expected.x - m.worldCOM.x,
      expected.y - m.worldCOM.y,
      expected.z - m.worldCOM.z
    )
  };
}
function afterPhysics() {
  if (!running || lifecycle.faulted || tick < 0 || observed === tick) return;
  try {
    observed = tick;
    steps++;
    const owner = run;
    const rows = [...pins, ball, platform].map((a) => {
      const m = motion(a);
      if (!m.enabled || m.massPending) throw Error("Disabled or mass-pending native observation");
      if (pins.includes(a) && down(m.rotation) && !owner.score.includes(a.id)) owner.score.push(a.id);
      if (a.marker) {
        a.marker.active = true;
        a.marker.setPosition(m.worldCOM.x, m.worldCOM.y, m.worldCOM.z);
      }
      return { id: a.id, motion: m, ...copyPoseCheck(a, m) };
    });
    const row = {
      generation,
      tick,
      attempt,
      step: steps,
      phase: "after-physics",
      actors: rows,
      score: [...owner.score]
    };
    owner.frames.push(row);
    el("observation").textContent = JSON.stringify(
      {
        step: steps,
        ball: rows[pins.length],
        firstPin: rows[0],
        platform: rows.at(-1)
      },
      null,
      2
    );
    if (steps >= WINDOW_TICKS)
      idle("end-observation-window", () => {
        running = false;
        system.enable = false;
        dispose();
        owner.status = "OBSERVATION_WINDOW_ENDED_NOT_ACCEPTANCE";
        status("\u89C2\u5BDF\u7A97\u53E3\u7ED3\u675F \xB7 \u539F\u751F\u8BC1\u636E\u5F85\u5BA1\u6838 \xB7 NOT_RUN");
      });
    else
      idle("platform-target", () => {
        const pose = targetPose(steps + 1);
        target.setTarget(pose);
        owner.requests.push({
          kind: "platform-target",
          afterTick: tick,
          pose,
          status: "SUBMITTED_NOT_RESULT"
        });
      });
    ui();
  } catch (error) {
    fault(error, "after-physics");
  }
}
function impulse(offset) {
  if (!running || fired || impulsePending || lifecycle.faulted || lifecycle.closing || lifecycle.transitioning)
    return;
  impulsePending = true;
  ui();
  const owner = run;
  idle("ball-impulse", () => {
    const before = motion(ball);
    if (before.massPending || !before.enabled) throw Error("Ball not ready");
    const relativePoint = new Vec3(offset ? 0.2 : 0, 0, 0), impulse2 = new Vec3(0, 0, -24);
    owner.requests.push({
      kind: "impulse-request",
      id: ball.id,
      phase: "idle",
      afterTick: tick,
      space: "world",
      relativePoint: { ...relativePoint },
      impulse: { ...impulse2 },
      absolutePointForDisplay: {
        x: before.worldCOM.x + relativePoint.x,
        y: before.worldCOM.y,
        z: before.worldCOM.z
      },
      before
    });
    ball.body.applyImpulse(impulse2, relativePoint);
    fired = true;
    impulsePending = false;
  });
}
function changeMass() {
  const requested = massChoice(el("mass").value), owner = run;
  idle("pin-mass-change", () => {
    const before = pins.map((a) => ({
      id: a.id,
      motion: motion(a),
      geometry: geometry(a)
    }));
    for (const a of pins) a.body.mass = requested;
    geometryPending = true;
    owner.requests.push({
      kind: "mass-request",
      requested,
      afterTick: tick,
      before,
      afterConfiguration: pins.map((a) => ({
        id: a.id,
        publicMass: a.body.mass,
        geometry: geometry(a)
      })),
      result: "PENDING_NATIVE_FRAME"
    });
  });
}
async function release(forClose = false) {
  running = false;
  const stopErrors = attemptStops([
    () => {
      if (system) system.enable = false;
    },
    () => {
      hook?.dispose();
      hook = void 0;
    },
    () => {
      target?.dispose();
      target = void 0;
    }
  ]);
  if (stopErrors.length)
    log.push({
      kind: "release-stop-fault",
      generation,
      forClose,
      errors: stopErrors
    });
  for (const a of actors) a.alive = false;
  if (run && run.status === "RUNNING") run.status = "INTERRUPTED";
  if (!app) throw Error("App unavailable");
  await releaseOwned({
    app,
    scene,
    assets,
    record: (row) => log.push({ ...row, generation })
  });
  if (stopErrors.length && !forClose) throw Error("Stop failed; scene flushed but reset is blocked");
}
function reset(start) {
  if (!app || !lifecycle.beginTransition()) return;
  running = false;
  ui();
  void operations.enqueue(async () => {
    await release();
    if (lifecycle.closing || lifecycle.closed || lifecycle.faulted) return;
    if (start) mount();
    else status("\u5DF2\u91CA\u653E\uFF1B\u5386\u53F2\u4FDD\u7559 \xB7 NOT_RUN");
  }).catch((error) => fault(error, "reset")).finally(() => {
    lifecycle.endTransition();
    ui();
  });
}
function close() {
  if (!app || !lifecycle.beginClose()) return;
  running = false;
  ui();
  void operations.enqueue(async () => {
    await release(true);
    director.off(Director.EVENT_AFTER_PHYSICS, afterPhysics);
    if (!app?.close) throw Error("Public close unavailable");
    lifecycle.startSdkClose();
    const receipt = await app.close();
    log.push({ kind: "close", generation, receipt });
    if (receipt.status !== "released") throw Error("Terminal SDK Close failed");
    unsubscribe?.();
    window.removeEventListener("error", windowError);
    window.removeEventListener("unhandledrejection", rejection);
    lifecycle.closed = true;
    status("\u5DF2\u5173\u95ED \xB7 \u9A8C\u6536 NOT_RUN");
  }).catch((error) => {
    log.push({ kind: "close-failed", error: String(error) });
    lifecycle.faulted = true;
    status(
      lifecycle.sdkCloseStarted ? `SDK Close failed: ${error}; terminal cached result, export evidence and reload (no cleanup retry)` : `Close preparation failed: ${error}; SDK close not invoked, preparation may be attempted again`
    );
  }).finally(() => {
    lifecycle.endClose(lifecycle.closed);
    ui();
  });
}
const windowError = (event) => fault(event.error ?? event.message, "window-error");
const rejection = (event) => fault(event.reason, "unhandled-rejection");
window.addEventListener("error", windowError);
window.addEventListener("unhandledrejection", rejection);
button("start").onclick = () => reset(true);
button("reset").onclick = () => reset(false);
button("close").onclick = close;
button("center").onclick = () => impulse(false);
button("offcenter").onclick = () => impulse(true);
button("mass-apply").onclick = changeMass;
button("export").onclick = () => {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          schema: "ex02-compound-bowling-v1",
          acceptance: "NOT_RUN",
          reset20: "NOT_RUN",
          build: AIR_BUILD_NUMBER,
          revision: AIR_REVISION,
          identity,
          runs: history,
          log
        },
        null,
        2
      )
    ],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url;
  a.download = "ex02-compound-bowling.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
};
async function boot() {
  const response = await fetch(new URL("../identity.json", import.meta.url));
  if (!response.ok) throw Error("Missing identity");
  identity = await response.json();
  app = await createAirApp({
    canvas: "#GameCanvas",
    screenMode: "container",
    container: "#scene-host",
    physics: "box3d",
    physicsOptions: {
      box3d: {
        assetBaseUrl: new URL("../runtime/physics/box3d/st/", import.meta.url).href,
        threading: "single",
        workerCount: 1,
        solverSubSteps: SUBSTEPS
      }
    }
  });
  if (!app.diagnostics || !app.releaseScene || !app.close)
    throw Error("Required public diagnostics/release/close unavailable");
  unsubscribe = app.diagnostics.onMessage((message) => {
    log.push({ kind: "diagnostic", message });
    if (message.severity === "error") fault(message.message, "engine-diagnostic");
  });
  system = physics.PhysicsSystem.instance;
  system.enable = false;
  system.autoSimulation = true;
  system.fixedTimeStep = FIXED_DT;
  system.maxSubSteps = 1;
  system.gravity = new Vec3(0, -9.81, 0);
  director.on(Director.EVENT_AFTER_PHYSICS, afterPhysics);
  status("Ready \xB7 \u5F00\u59CB\u5EFA\u7ACB\u65B0\u573A\u666F \xB7 NOT_RUN");
  ui();
}
ui();
void boot().catch((error) => fault(error, "boot"));
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL3dvcmtzcGFjZS9jb2Nvc2FpcmpzL2V4YW1wbGVzL2JveDNkLWNvbXBvdW5kLWJvd2xpbmcvc3JjL21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qKiBFWDAyIGNhbmRpZGF0ZTogcHVibGljIFNESzIyMyBvbmx5OyBDUFUgY2hlY2tzIGFyZSBub3QgcGh5c2ljcyBhY2NlcHRhbmNlLiAqL1xuaW1wb3J0IHtcbiAgICBjcmVhdGVBaXJBcHAsXG4gICAgQUlSX0JVSUxEX05VTUJFUixcbiAgICBBSVJfUkVWSVNJT04sXG4gICAgU2NlbmUsXG4gICAgTm9kZSxcbiAgICBDYW1lcmEsXG4gICAgRGlyZWN0aW9uYWxMaWdodCxcbiAgICBNZXNoUmVuZGVyZXIsXG4gICAgTWF0ZXJpYWwsXG4gICAgUGh5c2ljc01hdGVyaWFsLFxuICAgIFJpZ2lkQm9keSxcbiAgICBFUmlnaWRCb2R5VHlwZSxcbiAgICBCb3hDb2xsaWRlcixcbiAgICBTcGhlcmVDb2xsaWRlcixcbiAgICBDb2xvcixcbiAgICBWZWMzLFxuICAgIExheWVycyxcbiAgICBwcmltaXRpdmVzLFxuICAgIHV0aWxzLFxuICAgIHBoeXNpY3MsXG4gICAgZGlyZWN0b3IsXG4gICAgRGlyZWN0b3IsXG4gICAgcmVnaXN0ZXJCb3gzREJlZm9yZVN0ZXAsXG4gICAgcmVhZEJveDNEQm9keU1vdGlvbixcbiAgICBjcmVhdGVCb3gzREtpbmVtYXRpY1RhcmdldCxcbiAgICBxdWVyeUJveDNEQ29tbWl0dGVkQ29sbGlkZXJzLFxufSBmcm9tICdjb2Nvc2Fpcic7XG5pbXBvcnQgdHlwZSB7IEFpckFwcCwgQm94M0RCb2R5TW90aW9uLCBCb3gzREtpbmVtYXRpY1RhcmdldEhhbmRsZSB9IGZyb20gJ2NvY29zYWlyJztcbmltcG9ydCB7XG4gICAgRklYRURfRFQsXG4gICAgU1VCU1RFUFMsXG4gICAgV0lORE9XX1RJQ0tTLFxuICAgIGNsb2NrLFxuICAgIGFzc2VydENsb2NrLFxuICAgIHBpblBvc2l0aW9ucyxcbiAgICBkb3duLFxuICAgIGFzc2VydExpdmUsXG4gICAgbWFzc0Nob2ljZSxcbiAgICB0YXJnZXRQb3NlLFxuICAgIElkbGVRdWV1ZSxcbn0gZnJvbSAnLi9wcm90b2NvbC5tanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlIH0gZnJvbSAnLi9saWZlY3ljbGUubWpzJztcbmltcG9ydCB7IHJlbGVhc2VPd25lZCwgYXR0ZW1wdFN0b3BzIH0gZnJvbSAnLi9jbGVhbnVwLm1qcyc7XG5jb25zdCBsaWZlY3ljbGUgPSBuZXcgTGlmZWN5Y2xlKCk7XG50eXBlIFJvdyA9IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xudHlwZSBBY3RvciA9IHtcbiAgICBpZDogc3RyaW5nO1xuICAgIGdlbmVyYXRpb246IG51bWJlcjtcbiAgICBhbGl2ZTogYm9vbGVhbjtcbiAgICBub2RlOiBOb2RlO1xuICAgIGJvZHk6IFJpZ2lkQm9keTtcbiAgICBjb2xsaWRlcnM6IEFycmF5PEJveENvbGxpZGVyIHwgU3BoZXJlQ29sbGlkZXI+O1xuICAgIG1hcmtlcj86IE5vZGU7XG59O1xudHlwZSBSdW4gPSB7XG4gICAgZ2VuZXJhdGlvbjogbnVtYmVyO1xuICAgIHN0YXR1czogc3RyaW5nO1xuICAgIGFjY2VwdGFuY2U6ICdOT1RfUlVOJztcbiAgICBmcmFtZXM6IFJvd1tdO1xuICAgIGNsb2NrczogUm93W107XG4gICAgcmVxdWVzdHM6IFJvd1tdO1xuICAgIGdlb21ldHJ5OiBSb3dbXTtcbiAgICBzY29yZTogc3RyaW5nW107XG59O1xuY29uc3QgZWwgPSA8VCBleHRlbmRzIEhUTUxFbGVtZW50PihpZDogc3RyaW5nKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCkgYXMgVDtcbmNvbnN0IGJ1dHRvbiA9IChpZDogc3RyaW5nKSA9PiBlbDxIVE1MQnV0dG9uRWxlbWVudD4oaWQpO1xuY29uc3QgaGlzdG9yeTogUnVuW10gPSBbXSxcbiAgICBsb2c6IFJvd1tdID0gW10sXG4gICAgb3BlcmF0aW9ucyA9IG5ldyBJZGxlUXVldWUoKTtcbmxldCBhcHA6IEFpckFwcCB8IHVuZGVmaW5lZCwgc3lzdGVtOiBwaHlzaWNzLlBoeXNpY3NTeXN0ZW0sIHNjZW5lOiBTY2VuZTtcbmxldCBob29rOiBSZXR1cm5UeXBlPHR5cGVvZiByZWdpc3RlckJveDNEQmVmb3JlU3RlcD4gfCB1bmRlZmluZWQsIHRhcmdldDogQm94M0RLaW5lbWF0aWNUYXJnZXRIYW5kbGUgfCB1bmRlZmluZWQ7XG5sZXQgdW5zdWJzY3JpYmU6ICgoKSA9PiB2b2lkKSB8IHVuZGVmaW5lZCwgaWRlbnRpdHk6IHVua25vd247XG5sZXQgYXNzZXRzOiBBcnJheTxNYXRlcmlhbCB8IFBoeXNpY3NNYXRlcmlhbCB8IFJldHVyblR5cGU8dHlwZW9mIHV0aWxzLmNyZWF0ZU1lc2g+PiA9IFtdO1xubGV0IGFjdG9yczogQWN0b3JbXSA9IFtdLFxuICAgIHBpbnM6IEFjdG9yW10gPSBbXSxcbiAgICBiYWxsOiBBY3RvcixcbiAgICBwbGF0Zm9ybTogQWN0b3IsXG4gICAgcnVuOiBSdW4gfCB1bmRlZmluZWQ7XG5sZXQgZ2VuZXJhdGlvbiA9IDAsXG4gICAgdGljayA9IC0xLFxuICAgIGF0dGVtcHQgPSAtMSxcbiAgICBvYnNlcnZlZCA9IC0xLFxuICAgIHN0ZXBzID0gMDtcbmxldCBydW5uaW5nID0gZmFsc2UsXG4gICAgZmlyZWQgPSBmYWxzZSxcbiAgICBpbXB1bHNlUGVuZGluZyA9IGZhbHNlLFxuICAgIGdlb21ldHJ5UGVuZGluZyA9IHRydWU7XG5jb25zdCBzdGF0dXMgPSAobWVzc2FnZTogc3RyaW5nKSA9PiB7XG4gICAgZWwoJ3N0YXR1cycpLnRleHRDb250ZW50ID0gbWVzc2FnZTtcbn07XG5mdW5jdGlvbiB1aSgpIHtcbiAgICBjb25zdCBibG9ja2VkID0gIWFwcCB8fCBsaWZlY3ljbGUuZmF1bHRlZCB8fCBsaWZlY3ljbGUuY2xvc2VkIHx8IGxpZmVjeWNsZS5jbG9zaW5nIHx8IGxpZmVjeWNsZS50cmFuc2l0aW9uaW5nO1xuICAgIGJ1dHRvbignc3RhcnQnKS5kaXNhYmxlZCA9IGJsb2NrZWQ7XG4gICAgYnV0dG9uKCdyZXNldCcpLmRpc2FibGVkID0gYmxvY2tlZDtcbiAgICBmb3IgKGNvbnN0IGlkIG9mIFsnY2VudGVyJywgJ29mZmNlbnRlciddKSBidXR0b24oaWQpLmRpc2FibGVkID0gYmxvY2tlZCB8fCAhcnVubmluZyB8fCBmaXJlZCB8fCBpbXB1bHNlUGVuZGluZztcbiAgICBidXR0b24oJ21hc3MtYXBwbHknKS5kaXNhYmxlZCA9IGJsb2NrZWQgfHwgIXJ1bm5pbmc7XG4gICAgZWw8SFRNTFNlbGVjdEVsZW1lbnQ+KCdtYXNzJykuZGlzYWJsZWQgPSBibG9ja2VkO1xuICAgIGJ1dHRvbignY2xvc2UnKS5kaXNhYmxlZCA9ICFhcHAgfHwgbGlmZWN5Y2xlLmNsb3NlZCB8fCBsaWZlY3ljbGUuY2xvc2luZyB8fCBsaWZlY3ljbGUuc2RrQ2xvc2VTdGFydGVkO1xuICAgIGVsKCdjb3VudHMnKS50ZXh0Q29udGVudCA9XG4gICAgICAgIGBHZW5lcmF0aW9uICR7Z2VuZXJhdGlvbn0gXHUwMEI3IG5hdGl2ZSBvYnNlcnZhdGlvbnMgJHtzdGVwc30vJHtXSU5ET1dfVElDS1N9IFx1MDBCNyBmYWxsZW4gJHtydW4/LnNjb3JlLmxlbmd0aCA/PyAwfS8xMFxcbkFjY2VwdGFuY2UgTk9UX1JVTiBcdTAwQjcgcmVzZXQgbGVhayBldmlkZW5jZSBOT1RfUlVOYDtcbn1cbmZ1bmN0aW9uIGRpc3Bvc2UoKSB7XG4gICAgaG9vaz8uZGlzcG9zZSgpO1xuICAgIGhvb2sgPSB1bmRlZmluZWQ7XG4gICAgdGFyZ2V0Py5kaXNwb3NlKCk7XG4gICAgdGFyZ2V0ID0gdW5kZWZpbmVkO1xufVxuZnVuY3Rpb24gZmF1bHQoZXJyb3I6IHVua25vd24sIHNvdXJjZTogc3RyaW5nKSB7XG4gICAgbG9nLnB1c2goeyBraW5kOiAnZmF1bHQnLCBzb3VyY2UsIGVycm9yOiBTdHJpbmcoZXJyb3IpLCBnZW5lcmF0aW9uLCB0aWNrIH0pO1xuICAgIGxpZmVjeWNsZS5mYXVsdGVkID0gdHJ1ZTtcbiAgICBydW5uaW5nID0gZmFsc2U7XG4gICAgaWYgKHJ1biAmJiBydW4uc3RhdHVzID09PSAnUlVOTklORycpIHJ1bi5zdGF0dXMgPSAnRkFVTFRFRCc7XG4gICAgcXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKHN5c3RlbSkgc3lzdGVtLmVuYWJsZSA9IGZhbHNlO1xuICAgICAgICAgICAgZGlzcG9zZSgpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBsb2cucHVzaCh7IGtpbmQ6ICdjbGVhbnVwLWZhdWx0JywgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgfVxuICAgICAgICBzdGF0dXMoXG4gICAgICAgICAgICBgQkxPQ0tFRDogJHtlcnJvcn0gXHUwMEI3ICR7bGlmZWN5Y2xlLnNka0Nsb3NlU3RhcnRlZCA/ICd0ZXJtaW5hbCBDbG9zZSBhbHJlYWR5IGludm9rZWQ7IGV4cG9ydCBhbmQgcmVsb2FkJyA6ICdDbG9zZSBwcmVwYXJhdGlvbiBhdmFpbGFibGUnfTsgZXZpZGVuY2UgcmV0YWluZWRgLFxuICAgICAgICApO1xuICAgICAgICB1aSgpO1xuICAgIH0pO1xufVxuZnVuY3Rpb24gaWRsZShsYWJlbDogc3RyaW5nLCB3b3JrOiAoKSA9PiB2b2lkLCB0b2tlbiA9IGdlbmVyYXRpb24sIG93bmVyID0gcnVuKSB7XG4gICAgcXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgICB0b2tlbiAhPT0gZ2VuZXJhdGlvbiB8fFxuICAgICAgICAgICAgbGlmZWN5Y2xlLmZhdWx0ZWQgfHxcbiAgICAgICAgICAgIGxpZmVjeWNsZS5jbG9zZWQgfHxcbiAgICAgICAgICAgIGxpZmVjeWNsZS5jbG9zaW5nIHx8XG4gICAgICAgICAgICBsaWZlY3ljbGUudHJhbnNpdGlvbmluZyB8fFxuICAgICAgICAgICAgIXJ1bm5pbmdcbiAgICAgICAgKSB7XG4gICAgICAgICAgICBvd25lcj8ucmVxdWVzdHMucHVzaCh7IGxhYmVsLCBzdGF0dXM6ICdDQU5DRUxMRUQnLCBnZW5lcmF0aW9uOiB0b2tlbiB9KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgd29yaygpO1xuICAgICAgICAgICAgb3duZXI/LnJlcXVlc3RzLnB1c2goe1xuICAgICAgICAgICAgICAgIGxhYmVsLFxuICAgICAgICAgICAgICAgIHN0YXR1czogJ1NVQk1JVFRFRF9BVF9JRExFX05PVF9SRVNVTFQnLFxuICAgICAgICAgICAgICAgIGdlbmVyYXRpb246IHRva2VuLFxuICAgICAgICAgICAgICAgIGFmdGVyVGljazogdGljayxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdWkoKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGZhdWx0KGVycm9yLCBsYWJlbCk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cbmZ1bmN0aW9uIG1vdGlvbihhY3RvcjogQWN0b3IpIHtcbiAgICBhc3NlcnRMaXZlKGFjdG9yLCBnZW5lcmF0aW9uKTtcbiAgICByZXR1cm4gcmVhZEJveDNEQm9keU1vdGlvbihhY3Rvci5ib2R5KTtcbn1cbmZ1bmN0aW9uIHBhaW50KHJnYjogbnVtYmVyW10pIHtcbiAgICBjb25zdCBtID0gbmV3IE1hdGVyaWFsKCk7XG4gICAgYXNzZXRzLnB1c2gobSk7XG4gICAgbS5pbml0aWFsaXplKHsgZWZmZWN0TmFtZTogJ2J1aWx0aW4tc3RhbmRhcmQnIH0pO1xuICAgIG0uc2V0UHJvcGVydHkoJ21haW5Db2xvcicsIG5ldyBDb2xvcihyZ2JbMF0sIHJnYlsxXSwgcmdiWzJdLCAyNTUpKTtcbiAgICBtLnNldFByb3BlcnR5KCdyb3VnaG5lc3MnLCAwLjcpO1xuICAgIHJldHVybiBtO1xufVxuZnVuY3Rpb24gdmlzdWFsKG46IE5vZGUsIGdlb21ldHJ5OiBQYXJhbWV0ZXJzPHR5cGVvZiB1dGlscy5jcmVhdGVNZXNoPlswXSwgbWF0ZXJpYWw6IE1hdGVyaWFsKSB7XG4gICAgY29uc3QgbWVzaCA9IHV0aWxzLmNyZWF0ZU1lc2goZ2VvbWV0cnkpO1xuICAgIGFzc2V0cy5wdXNoKG1lc2gpO1xuICAgIGNvbnN0IHIgPSBuLmFkZENvbXBvbmVudChNZXNoUmVuZGVyZXIpO1xuICAgIHIubWVzaCA9IG1lc2g7XG4gICAgci5zZXRTaGFyZWRNYXRlcmlhbChtYXRlcmlhbCwgMCk7XG59XG5mdW5jdGlvbiBhY3RvcihuYW1lOiBzdHJpbmcsIHBvc2l0aW9uOiBWZWMzLCB0eXBlOiBFUmlnaWRCb2R5VHlwZSwgbWFzczogbnVtYmVyKSB7XG4gICAgY29uc3QgbiA9IG5ldyBOb2RlKG5hbWUpO1xuICAgIG4uYWN0aXZlID0gZmFsc2U7XG4gICAgc2NlbmUuYWRkQ2hpbGQobik7IC8vIFJldGFpbiBldmVuIGlmIGNvbnN0cnVjdGlvbiBmYWlscyBiZWZvcmUgYWN0aXZhdGlvbi9hcHAucnVuLlxuICAgIG4ubGF5ZXIgPSBMYXllcnMuRW51bS5ERUZBVUxUO1xuICAgIG4uc2V0UG9zaXRpb24ocG9zaXRpb24pO1xuICAgIGNvbnN0IGJvZHkgPSBuLmFkZENvbXBvbmVudChSaWdpZEJvZHkpO1xuICAgIGJvZHkudHlwZSA9IHR5cGU7XG4gICAgYm9keS5tYXNzID0gbWFzcztcbiAgICBib2R5LnVzZUdyYXZpdHkgPSB0eXBlID09PSBFUmlnaWRCb2R5VHlwZS5EWU5BTUlDO1xuICAgIGJvZHkuYWxsb3dTbGVlcCA9IGZhbHNlO1xuICAgIGJvZHkubGluZWFyRGFtcGluZyA9IDAuMDI7XG4gICAgYm9keS5hbmd1bGFyRGFtcGluZyA9IDAuMDI7XG4gICAgY29uc3QgYTogQWN0b3IgPSB7XG4gICAgICAgIGlkOiBgZyR7Z2VuZXJhdGlvbn06JHtuYW1lfWAsXG4gICAgICAgIGdlbmVyYXRpb24sXG4gICAgICAgIGFsaXZlOiB0cnVlLFxuICAgICAgICBub2RlOiBuLFxuICAgICAgICBib2R5LFxuICAgICAgICBjb2xsaWRlcnM6IFtdLFxuICAgIH07XG4gICAgYWN0b3JzLnB1c2goYSk7XG4gICAgcmV0dXJuIGE7XG59XG5mdW5jdGlvbiBib3goYTogQWN0b3IsIHNpemU6IFZlYzMsIGNlbnRlcjogVmVjMywgbWF0ZXJpYWw6IE1hdGVyaWFsLCBzdXJmYWNlOiBQaHlzaWNzTWF0ZXJpYWwpIHtcbiAgICBjb25zdCBjID0gYS5ub2RlLmFkZENvbXBvbmVudChCb3hDb2xsaWRlcik7XG4gICAgYy5zaXplID0gc2l6ZTtcbiAgICBjLmNlbnRlciA9IGNlbnRlcjtcbiAgICBjLnNoYXJlZE1hdGVyaWFsID0gc3VyZmFjZTtcbiAgICBhLmNvbGxpZGVycy5wdXNoKGMpO1xuICAgIGNvbnN0IGNoaWxkID0gbmV3IE5vZGUoJ2JveCB2aXN1YWwnKTtcbiAgICBjaGlsZC5sYXllciA9IExheWVycy5FbnVtLkRFRkFVTFQ7XG4gICAgY2hpbGQuc2V0UG9zaXRpb24oY2VudGVyKTtcbiAgICBhLm5vZGUuYWRkQ2hpbGQoY2hpbGQpO1xuICAgIHZpc3VhbChjaGlsZCwgcHJpbWl0aXZlcy5ib3goeyB3aWR0aDogc2l6ZS54LCBoZWlnaHQ6IHNpemUueSwgbGVuZ3RoOiBzaXplLnogfSksIG1hdGVyaWFsKTtcbn1cbmZ1bmN0aW9uIHNwaGVyZShhOiBBY3RvciwgcmFkaXVzOiBudW1iZXIsIGNlbnRlcjogVmVjMywgbWF0ZXJpYWw6IE1hdGVyaWFsLCBzdXJmYWNlOiBQaHlzaWNzTWF0ZXJpYWwpIHtcbiAgICBjb25zdCBjID0gYS5ub2RlLmFkZENvbXBvbmVudChTcGhlcmVDb2xsaWRlcik7XG4gICAgYy5yYWRpdXMgPSByYWRpdXM7XG4gICAgYy5jZW50ZXIgPSBjZW50ZXI7XG4gICAgYy5zaGFyZWRNYXRlcmlhbCA9IHN1cmZhY2U7XG4gICAgYS5jb2xsaWRlcnMucHVzaChjKTtcbiAgICBjb25zdCBjaGlsZCA9IG5ldyBOb2RlKCdzcGhlcmUgdmlzdWFsJyk7XG4gICAgY2hpbGQubGF5ZXIgPSBMYXllcnMuRW51bS5ERUZBVUxUO1xuICAgIGNoaWxkLnNldFBvc2l0aW9uKGNlbnRlcik7XG4gICAgYS5ub2RlLmFkZENoaWxkKGNoaWxkKTtcbiAgICB2aXN1YWwoY2hpbGQsIHByaW1pdGl2ZXMuc3BoZXJlKHJhZGl1cyksIG1hdGVyaWFsKTtcbn1cbmZ1bmN0aW9uIGFjdGl2YXRlKGE6IEFjdG9yLCBtYXJrZXJNYXRlcmlhbD86IE1hdGVyaWFsKSB7XG4gICAgc2NlbmUuYWRkQ2hpbGQoYS5ub2RlKTtcbiAgICBhLm5vZGUuYWN0aXZlID0gdHJ1ZTtcbiAgICBpZiAobWFya2VyTWF0ZXJpYWwpIHtcbiAgICAgICAgY29uc3QgbiA9IG5ldyBOb2RlKGAke2EuaWR9Om5hdGl2ZS1DT01gKTtcbiAgICAgICAgbi5sYXllciA9IExheWVycy5FbnVtLkRFRkFVTFQ7XG4gICAgICAgIG4uYWN0aXZlID0gZmFsc2U7XG4gICAgICAgIHNjZW5lLmFkZENoaWxkKG4pO1xuICAgICAgICB2aXN1YWwobiwgcHJpbWl0aXZlcy5zcGhlcmUoMC4wNjUpLCBtYXJrZXJNYXRlcmlhbCk7XG4gICAgICAgIC8vIEF4ZXMgZXh0ZW5kIG91dHNpZGUgdGhlIG9wYXF1ZSBib2R5IHNvIHRoZSBuYXRpdmUgQ09NIG1hcmtlciByZW1haW5zIGxlZ2libGUuXG4gICAgICAgIC8vIFRoZXNlIGNoaWxkIG1lc2hlcyBoYXZlIG5vIHBoeXNpY3M7IGFsbCB0aHJlZSBhcmUgY2VudGVyZWQgb24gdGhlIGV4YWN0IG5hdGl2ZSBDT00uXG4gICAgICAgIGZvciAoY29uc3Qgc2l6ZSBvZiBbbmV3IFZlYzMoMC45NSwgMC4wMTUsIDAuMDE1KSwgbmV3IFZlYzMoMC4wMTUsIDAuOTUsIDAuMDE1KSwgbmV3IFZlYzMoMC4wMTUsIDAuMDE1LCAwLjk1KV0pIHtcbiAgICAgICAgICAgIGNvbnN0IGF4aXMgPSBuZXcgTm9kZSgnbmF0aXZlIENPTSBjcm9zc2hhaXInKTtcbiAgICAgICAgICAgIGF4aXMubGF5ZXIgPSBMYXllcnMuRW51bS5ERUZBVUxUO1xuICAgICAgICAgICAgbi5hZGRDaGlsZChheGlzKTtcbiAgICAgICAgICAgIHZpc3VhbChheGlzLCBwcmltaXRpdmVzLmJveCh7IHdpZHRoOiBzaXplLngsIGhlaWdodDogc2l6ZS55LCBsZW5ndGg6IHNpemUueiB9KSwgbWFya2VyTWF0ZXJpYWwpO1xuICAgICAgICB9XG4gICAgICAgIGEubWFya2VyID0gbjtcbiAgICB9XG59XG5mdW5jdGlvbiBnZW9tZXRyeShhOiBBY3Rvcikge1xuICAgIHJldHVybiBhLmNvbGxpZGVycy5tYXAoKGMpID0+ICh7XG4gICAgICAgIGtpbmQ6IGMgaW5zdGFuY2VvZiBCb3hDb2xsaWRlciA/ICdib3gnIDogJ3NwaGVyZScsXG4gICAgICAgIGNlbnRlcjogeyB4OiBjLmNlbnRlci54LCB5OiBjLmNlbnRlci55LCB6OiBjLmNlbnRlci56IH0sXG4gICAgICAgIGRpbWVuc2lvbnM6IGMgaW5zdGFuY2VvZiBCb3hDb2xsaWRlciA/IFtjLnNpemUueCwgYy5zaXplLnksIGMuc2l6ZS56XSA6IFtjLnJhZGl1c10sXG4gICAgfSkpO1xufVxuZnVuY3Rpb24gbW91bnQoKSB7XG4gICAgZ2VuZXJhdGlvbisrO1xuICAgIHRpY2sgPSBhdHRlbXB0ID0gb2JzZXJ2ZWQgPSAtMTtcbiAgICBzdGVwcyA9IDA7XG4gICAgZmlyZWQgPSBpbXB1bHNlUGVuZGluZyA9IGZhbHNlO1xuICAgIGdlb21ldHJ5UGVuZGluZyA9IHRydWU7XG4gICAgYWN0b3JzID0gW107XG4gICAgcGlucyA9IFtdO1xuICAgIHJ1biA9IHtcbiAgICAgICAgZ2VuZXJhdGlvbixcbiAgICAgICAgc3RhdHVzOiAnUlVOTklORycsXG4gICAgICAgIGFjY2VwdGFuY2U6ICdOT1RfUlVOJyxcbiAgICAgICAgZnJhbWVzOiBbXSxcbiAgICAgICAgY2xvY2tzOiBbXSxcbiAgICAgICAgcmVxdWVzdHM6IFtdLFxuICAgICAgICBnZW9tZXRyeTogW10sXG4gICAgICAgIHNjb3JlOiBbXSxcbiAgICB9O1xuICAgIGhpc3RvcnkucHVzaChydW4pO1xuICAgIHNjZW5lID0gbmV3IFNjZW5lKCdib3gzZC1jb21wb3VuZC1ib3dsaW5nJyk7XG4gICAgY29uc3QgY2FtZXJhTm9kZSA9IG5ldyBOb2RlKCdDYW1lcmEnKTtcbiAgICBzY2VuZS5hZGRDaGlsZChjYW1lcmFOb2RlKTtcbiAgICBjYW1lcmFOb2RlLnNldFBvc2l0aW9uKDcsIDcsIDEwKTtcbiAgICBjYW1lcmFOb2RlLmxvb2tBdChuZXcgVmVjMygwLCAwLCAtMSkpO1xuICAgIGNvbnN0IGNhbWVyYSA9IGNhbWVyYU5vZGUuYWRkQ29tcG9uZW50KENhbWVyYSk7XG4gICAgY2FtZXJhLmZvdiA9IDQ4O1xuICAgIGNhbWVyYS5uZWFyID0gMC4wMTtcbiAgICBjYW1lcmEuZmFyID0gMTAwO1xuICAgIGNhbWVyYS52aXNpYmlsaXR5ID0gTGF5ZXJzLkVudW0uREVGQVVMVDtcbiAgICBjYW1lcmEuY2xlYXJGbGFncyA9IENhbWVyYS5DbGVhckZsYWcuU09MSURfQ09MT1I7XG4gICAgY2FtZXJhLmNsZWFyQ29sb3IgPSBuZXcgQ29sb3IoMTIsIDIyLCAzMiwgMjU1KTtcbiAgICBjb25zdCBsaWdodCA9IG5ldyBOb2RlKCdMaWdodCcpO1xuICAgIHNjZW5lLmFkZENoaWxkKGxpZ2h0KTtcbiAgICBsaWdodC5hZGRDb21wb25lbnQoRGlyZWN0aW9uYWxMaWdodCk7XG4gICAgbGlnaHQuc2V0Um90YXRpb25Gcm9tRXVsZXIoLTU1LCAtMjAsIDApO1xuICAgIGNvbnN0IHN1cmZhY2UgPSBuZXcgUGh5c2ljc01hdGVyaWFsKCk7XG4gICAgYXNzZXRzLnB1c2goc3VyZmFjZSk7XG4gICAgc3VyZmFjZS5mcmljdGlvbiA9IDAuMzU7XG4gICAgc3VyZmFjZS5yZXN0aXR1dGlvbiA9IDAuMDU7XG4gICAgY29uc3QgaXZvcnkgPSBwYWludChbMjM1LCAyMjIsIDE5NV0pLFxuICAgICAgICBncmVlbiA9IHBhaW50KFs1NSwgMjI1LCAyMTBdKSxcbiAgICAgICAgb3JhbmdlID0gcGFpbnQoWzIzMCwgMTQwLCA2NV0pLFxuICAgICAgICBibHVlID0gcGFpbnQoWzU1LCA4NSwgMTEwXSk7XG4gICAgY29uc3QgZmxvb3IgPSBhY3RvcignZmxvb3InLCBuZXcgVmVjMygwLCAtMC42NSwgLTEpLCBFUmlnaWRCb2R5VHlwZS5TVEFUSUMsIDEpO1xuICAgIGJveChmbG9vciwgbmV3IFZlYzMoMTAsIDAuMywgMTUpLCBuZXcgVmVjMygpLCBibHVlLCBzdXJmYWNlKTtcbiAgICBhY3RpdmF0ZShmbG9vcik7XG4gICAgY29uc3QgbGFuZSA9IGFjdG9yKCdhcHByb2FjaCBsYW5lJywgbmV3IFZlYzMoMCwgLTAuMTUsIDMuNSksIEVSaWdpZEJvZHlUeXBlLlNUQVRJQywgMSk7XG4gICAgYm94KGxhbmUsIG5ldyBWZWMzKDQuNiwgMC4zLCA3LjYpLCBuZXcgVmVjMygpLCBibHVlLCBzdXJmYWNlKTtcbiAgICBhY3RpdmF0ZShsYW5lKTtcbiAgICBwbGF0Zm9ybSA9IGFjdG9yKCdraW5lbWF0aWMgcGxhdGZvcm0nLCBuZXcgVmVjMygwLCAtMC4xNSwgLTIuOCksIEVSaWdpZEJvZHlUeXBlLktJTkVNQVRJQywgMSk7XG4gICAgYm94KHBsYXRmb3JtLCBuZXcgVmVjMyg0LjYsIDAuMywgNSksIG5ldyBWZWMzKCksIG9yYW5nZSwgc3VyZmFjZSk7XG4gICAgYWN0aXZhdGUocGxhdGZvcm0pO1xuICAgIGNvbnN0IG1hc3MgPSBtYXNzQ2hvaWNlKGVsPEhUTUxTZWxlY3RFbGVtZW50PignbWFzcycpLnZhbHVlKTtcbiAgICBwaW5zID0gcGluUG9zaXRpb25zKCkubWFwKChwOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXIgfSwgaTogbnVtYmVyKSA9PiB7XG4gICAgICAgIGNvbnN0IGEgPSBhY3RvcihgcGluLSR7aSArIDF9YCwgbmV3IFZlYzMocC54LCBwLnksIHAueiksIEVSaWdpZEJvZHlUeXBlLkRZTkFNSUMsIG1hc3MpO1xuICAgICAgICBib3goYSwgbmV3IFZlYzMoMC4zMiwgMC43LCAwLjMyKSwgbmV3IFZlYzMoMCwgLTAuMjUsIDApLCBpdm9yeSwgc3VyZmFjZSk7XG4gICAgICAgIHNwaGVyZShhLCAwLjIzLCBuZXcgVmVjMygwLCAwLjMyLCAwKSwgaXZvcnksIHN1cmZhY2UpO1xuICAgICAgICBhY3RpdmF0ZShhLCBncmVlbik7XG4gICAgICAgIHJldHVybiBhO1xuICAgIH0pO1xuICAgIGJhbGwgPSBhY3RvcignYmFsbCcsIG5ldyBWZWMzKDAsIDAuMzgsIDMuNSksIEVSaWdpZEJvZHlUeXBlLkRZTkFNSUMsIDQpO1xuICAgIHNwaGVyZShiYWxsLCAwLjM2LCBuZXcgVmVjMygpLCBvcmFuZ2UsIHN1cmZhY2UpO1xuICAgIGFjdGl2YXRlKGJhbGwsIGdyZWVuKTtcbiAgICBhcHAhLnJ1bihzY2VuZSk7IC8vIHN5bmNocm9ub3VzIG9uTG9hZDsgbm9uY2FjaGVkIGJvZHkgbWV0aG9kcyBiZWxvbmcgYWZ0ZXIgdGhpcyBib3VuZGFyeS5cbiAgICAvLyBQdWJsaWMgdmVsb2NpdHkvdGFyZ2V0IGNvbW1hbmRzIHJlcXVpcmUgdGhlIG9ic2VydmVkIG93bmVyIHRvIGJlIHVucGF1c2VkLlxuICAgIC8vIFRoaXMgc3luY2hyb25vdXMgc3RhY2sgaW5zdGFsbHMgdGhlIGhvb2sgYmVmb3JlIHRoZSBuZXh0IG5hdGl2ZSBmcmFtZSBjYW4gcnVuLlxuICAgIHN5c3RlbS5lbmFibGUgPSB0cnVlO1xuICAgIGZvciAoY29uc3QgYSBvZiBbLi4ucGlucywgYmFsbF0pIHtcbiAgICAgICAgYS5ib2R5LnVzZUNDRCA9IGEgPT09IGJhbGw7XG4gICAgICAgIGlmIChhLmJvZHkudXNlQ0NEICE9PSAoYSA9PT0gYmFsbCkpIHRocm93IEVycm9yKCdNb3VudGVkIHVzZUNDRCByZWFkYmFjayBtaXNtYXRjaCcpO1xuICAgICAgICBhLmJvZHkuc2V0TGluZWFyVmVsb2NpdHkobmV3IFZlYzMoKSk7XG4gICAgICAgIGEuYm9keS5zZXRBbmd1bGFyVmVsb2NpdHkobmV3IFZlYzMoKSk7XG4gICAgICAgIGNvbnN0IHZlbG9jaXR5ID0gbmV3IFZlYzMoKSxcbiAgICAgICAgICAgIGFuZ3VsYXIgPSBuZXcgVmVjMygpO1xuICAgICAgICBhLmJvZHkuZ2V0TGluZWFyVmVsb2NpdHkodmVsb2NpdHkpO1xuICAgICAgICBhLmJvZHkuZ2V0QW5ndWxhclZlbG9jaXR5KGFuZ3VsYXIpO1xuICAgICAgICBydW4ucmVxdWVzdHMucHVzaCh7XG4gICAgICAgICAgICBraW5kOiAnbW91bnRlZC1jb25maWd1cmF0aW9uJyxcbiAgICAgICAgICAgIGlkOiBhLmlkLFxuICAgICAgICAgICAgY2NkOiBhLmJvZHkudXNlQ0NELFxuICAgICAgICAgICAgdmVsb2NpdHk6IHsgLi4udmVsb2NpdHkgfSxcbiAgICAgICAgICAgIGFuZ3VsYXJWZWxvY2l0eTogeyAuLi5hbmd1bGFyIH0sXG4gICAgICAgICAgICByZXF1ZXN0ZWRNYXNzOiBhLmJvZHkubWFzcyxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHRhcmdldCA9IGNyZWF0ZUJveDNES2luZW1hdGljVGFyZ2V0KHBsYXRmb3JtLmJvZHkpOyAvLyBtb3VudGVkIGV4Y2x1c2l2ZSBsZWFzZSwgaWRsZSBvbmx5LlxuICAgIHRhcmdldC5zZXRUYXJnZXQodGFyZ2V0UG9zZSgxKSk7XG4gICAgcnVuLnJlcXVlc3RzLnB1c2goe1xuICAgICAgICBraW5kOiAncGxhdGZvcm0tdGFyZ2V0JyxcbiAgICAgICAgcG9zZTogdGFyZ2V0UG9zZSgxKSxcbiAgICAgICAgc3RhdHVzOiAnU1VCTUlUVEVEX05PVF9SRVNVTFQnLFxuICAgIH0pO1xuICAgIHJ1bi5nZW9tZXRyeS5wdXNoKHtcbiAgICAgICAgcGhhc2U6ICdtb3VudGVkJyxcbiAgICAgICAga2luZDogJ1BVQkxJQ19DT0xMSURFUl9DT05GSUdVUkFUSU9OX05PVF9OQVRJVkVfR0VPTUVUUlknLFxuICAgICAgICBwaW5zOiBwaW5zLm1hcCgoYSkgPT4gKHsgaWQ6IGEuaWQsIGdlb21ldHJ5OiBnZW9tZXRyeShhKSB9KSksXG4gICAgfSk7XG4gICAgY29uc3QgdG9rZW4gPSBnZW5lcmF0aW9uLFxuICAgICAgICBvd25lciA9IHJ1bjtcbiAgICBob29rID0gcmVnaXN0ZXJCb3gzREJlZm9yZVN0ZXAoKGNvbnRleHQpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmICh0b2tlbiAhPT0gZ2VuZXJhdGlvbiB8fCAhcnVubmluZyB8fCBsaWZlY3ljbGUuZmF1bHRlZCkgdGhyb3cgRXJyb3IoJ1N0YWxlIGJlZm9yZS1zdGVwJyk7XG4gICAgICAgICAgICBjb25zdCBjID0gY2xvY2soY29udGV4dCk7XG4gICAgICAgICAgICBvd25lci5jbG9ja3MucHVzaChjKTtcbiAgICAgICAgICAgIGFzc2VydENsb2NrKGMpO1xuICAgICAgICAgICAgdGljayA9IGNvbnRleHQudGlja0luZGV4O1xuICAgICAgICAgICAgYXR0ZW1wdCA9IGNvbnRleHQuYXR0ZW1wdElkO1xuICAgICAgICAgICAgLy8gQ29waWVkIG5hdGl2ZSBnZW9tZXRyeSBmb3IgYWxsIHRlbiBwaW5zIG9uIG1vdW50IGFuZCBhZnRlciBlYWNoIG1hc3MgcmVxdWVzdC5cbiAgICAgICAgICAgIC8vIFRpbnkgcHVibGljIHN3ZWVwIG9ubHkgb2J0YWlucyBjb21taXR0ZWQgcHJveGllczsgaGl0cyBhcmUgTk9UIGNvbGxpc2lvbiBldmlkZW5jZS5cbiAgICAgICAgICAgIGlmIChnZW9tZXRyeVBlbmRpbmcpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHBpbiBvZiBwaW5zKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHEgPSBxdWVyeUJveDNEQ29tbWl0dGVkQ29sbGlkZXJzKFxuICAgICAgICAgICAgICAgICAgICAgICAgY29udGV4dCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBpbi5jb2xsaWRlcnMsXG4gICAgICAgICAgICAgICAgICAgICAgICB7IHg6IDAsIHk6IDAsIHo6IDAuMDAwMDAxIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB7IGdyb3VwOiAxLCBtYXNrOiAweGZmZmZmZmZmLCBxdWVyeVRyaWdnZXI6IGZhbHNlIH0sXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIG93bmVyLmdlb21ldHJ5LnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgcGhhc2U6ICdiZWZvcmUtc3RlcCcsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aWNrLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXR0ZW1wdCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHdvcmxkR2VuZXJhdGlvbjogcS53b3JsZEdlbmVyYXRpb24sXG4gICAgICAgICAgICAgICAgICAgICAgICBuYXRpdmVTdGVwSW5kZXg6IHEubmF0aXZlU3RlcEluZGV4LFxuICAgICAgICAgICAgICAgICAgICAgICAgbmF0aXZlTXV0YXRpb25SZXZpc2lvbjogcS5uYXRpdmVNdXRhdGlvblJldmlzaW9uLFxuICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlOiBwaW4uaWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBib2R5OiBtb3Rpb24ocGluKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoaWxkcmVuOiBxLmNoaWxkcmVuLm1hcCgoYykgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBraW5kOiBjLmtpbmQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3JpZ2luOiBjLm9yaWdpbixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3RhdGlvbjogYy5yb3RhdGlvbixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkaW1lbnNpb25zOiBjLmRpbWVuc2lvbnMsXG4gICAgICAgICAgICAgICAgICAgICAgICB9KSksXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBnZW9tZXRyeVBlbmRpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGZhdWx0KGVycm9yLCAnYmVmb3JlLXN0ZXAnKTtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgcnVubmluZyA9IHRydWU7XG4gICAgc3lzdGVtLmVuYWJsZSA9IHRydWU7XG4gICAgc3RhdHVzKCdcdTUzOUZcdTc1MUZcdThGRDBcdTg4NEMgXHUwMEI3IENPTSBcdTY4MDdcdThCQjBcdTdCNDlcdTVGODVcdTUxNkNcdTVGMDBcdThCRkJcdTU2REUgXHUwMEI3IE5PVF9SVU4nKTtcbiAgICB1aSgpO1xufVxuZnVuY3Rpb24gY29weVBvc2VDaGVjayhhOiBBY3RvciwgbTogUmVhZG9ubHk8Qm94M0RCb2R5TW90aW9uPikge1xuICAgIGNvbnN0IHAgPSBhLm5vZGUud29ybGRQb3NpdGlvbixcbiAgICAgICAgcSA9IGEubm9kZS53b3JsZFJvdGF0aW9uLFxuICAgICAgICByID0gbS5yb3RhdGlvbjtcbiAgICBjb25zdCBwb3NlRXJyb3IgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5oeXBvdChwLnggLSBtLnBvc2l0aW9uLngsIHAueSAtIG0ucG9zaXRpb24ueSwgcC56IC0gbS5wb3NpdGlvbi56KSxcbiAgICAgICAgTWF0aC5taW4oXG4gICAgICAgICAgICBNYXRoLmh5cG90KHEueCAtIHIueCwgcS55IC0gci55LCBxLnogLSByLnosIHEudyAtIHIudyksXG4gICAgICAgICAgICBNYXRoLmh5cG90KHEueCArIHIueCwgcS55ICsgci55LCBxLnogKyByLnosIHEudyArIHIudyksXG4gICAgICAgICksXG4gICAgKTtcbiAgICAvLyBOYXRpdmUgbG9jYWxDZW50ZXIgLT4gd29ybGQgQ09NIGNvbnNpc3RlbmN5LCBuZXZlciBlc3RpbWF0ZWQgZnJvbSB2aXNpYmxlIGdlb21ldHJ5LlxuICAgIGNvbnN0IHYgPSBtLmxvY2FsQ2VudGVyLFxuICAgICAgICB1ID0ge1xuICAgICAgICAgICAgeDogci55ICogdi56IC0gci56ICogdi55LFxuICAgICAgICAgICAgeTogci56ICogdi54IC0gci54ICogdi56LFxuICAgICAgICAgICAgejogci54ICogdi55IC0gci55ICogdi54LFxuICAgICAgICB9O1xuICAgIGNvbnN0IGV4cGVjdGVkID0ge1xuICAgICAgICB4OiBtLnBvc2l0aW9uLnggKyB2LnggKyAyICogKHIudyAqIHUueCArIHIueSAqIHUueiAtIHIueiAqIHUueSksXG4gICAgICAgIHk6IG0ucG9zaXRpb24ueSArIHYueSArIDIgKiAoci53ICogdS55ICsgci56ICogdS54IC0gci54ICogdS56KSxcbiAgICAgICAgejogbS5wb3NpdGlvbi56ICsgdi56ICsgMiAqIChyLncgKiB1LnogKyByLnggKiB1LnkgLSByLnkgKiB1LngpLFxuICAgIH07XG4gICAgcmV0dXJuIHtcbiAgICAgICAgcG9zZUVycm9yLFxuICAgICAgICBjb21GcmFtZUNvbnNpc3RlbmN5RXJyb3I6IE1hdGguaHlwb3QoXG4gICAgICAgICAgICBleHBlY3RlZC54IC0gbS53b3JsZENPTS54LFxuICAgICAgICAgICAgZXhwZWN0ZWQueSAtIG0ud29ybGRDT00ueSxcbiAgICAgICAgICAgIGV4cGVjdGVkLnogLSBtLndvcmxkQ09NLnosXG4gICAgICAgICksXG4gICAgfTtcbn1cbmZ1bmN0aW9uIGFmdGVyUGh5c2ljcygpIHtcbiAgICBpZiAoIXJ1bm5pbmcgfHwgbGlmZWN5Y2xlLmZhdWx0ZWQgfHwgdGljayA8IDAgfHwgb2JzZXJ2ZWQgPT09IHRpY2spIHJldHVybjtcbiAgICB0cnkge1xuICAgICAgICBvYnNlcnZlZCA9IHRpY2s7XG4gICAgICAgIHN0ZXBzKys7XG4gICAgICAgIGNvbnN0IG93bmVyID0gcnVuITtcbiAgICAgICAgY29uc3Qgcm93cyA9IFsuLi5waW5zLCBiYWxsLCBwbGF0Zm9ybV0ubWFwKChhKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBtID0gbW90aW9uKGEpO1xuICAgICAgICAgICAgaWYgKCFtLmVuYWJsZWQgfHwgbS5tYXNzUGVuZGluZykgdGhyb3cgRXJyb3IoJ0Rpc2FibGVkIG9yIG1hc3MtcGVuZGluZyBuYXRpdmUgb2JzZXJ2YXRpb24nKTtcbiAgICAgICAgICAgIGlmIChwaW5zLmluY2x1ZGVzKGEpICYmIGRvd24obS5yb3RhdGlvbikgJiYgIW93bmVyLnNjb3JlLmluY2x1ZGVzKGEuaWQpKSBvd25lci5zY29yZS5wdXNoKGEuaWQpO1xuICAgICAgICAgICAgLy8gT25seSBub25waHlzaWNzIG1hcmtlciBub2RlcyBhcmUgcG9zaXRpb25lZCBoZXJlLiBOZXZlciBtb3ZlIGEgbGl2ZSBib2R5J3MgTm9kZS5cbiAgICAgICAgICAgIGlmIChhLm1hcmtlcikge1xuICAgICAgICAgICAgICAgIGEubWFya2VyLmFjdGl2ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgYS5tYXJrZXIuc2V0UG9zaXRpb24obS53b3JsZENPTS54LCBtLndvcmxkQ09NLnksIG0ud29ybGRDT00ueik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4geyBpZDogYS5pZCwgbW90aW9uOiBtLCAuLi5jb3B5UG9zZUNoZWNrKGEsIG0pIH07XG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCByb3cgPSB7XG4gICAgICAgICAgICBnZW5lcmF0aW9uLFxuICAgICAgICAgICAgdGljayxcbiAgICAgICAgICAgIGF0dGVtcHQsXG4gICAgICAgICAgICBzdGVwOiBzdGVwcyxcbiAgICAgICAgICAgIHBoYXNlOiAnYWZ0ZXItcGh5c2ljcycsXG4gICAgICAgICAgICBhY3RvcnM6IHJvd3MsXG4gICAgICAgICAgICBzY29yZTogWy4uLm93bmVyLnNjb3JlXSxcbiAgICAgICAgfTtcbiAgICAgICAgb3duZXIuZnJhbWVzLnB1c2gocm93KTtcbiAgICAgICAgZWwoJ29ic2VydmF0aW9uJykudGV4dENvbnRlbnQgPSBKU09OLnN0cmluZ2lmeShcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBzdGVwOiBzdGVwcyxcbiAgICAgICAgICAgICAgICBiYWxsOiByb3dzW3BpbnMubGVuZ3RoXSxcbiAgICAgICAgICAgICAgICBmaXJzdFBpbjogcm93c1swXSxcbiAgICAgICAgICAgICAgICBwbGF0Zm9ybTogcm93cy5hdCgtMSksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbnVsbCxcbiAgICAgICAgICAgIDIsXG4gICAgICAgICk7XG4gICAgICAgIGlmIChzdGVwcyA+PSBXSU5ET1dfVElDS1MpXG4gICAgICAgICAgICBpZGxlKCdlbmQtb2JzZXJ2YXRpb24td2luZG93JywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJ1bm5pbmcgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzeXN0ZW0uZW5hYmxlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgZGlzcG9zZSgpO1xuICAgICAgICAgICAgICAgIG93bmVyLnN0YXR1cyA9ICdPQlNFUlZBVElPTl9XSU5ET1dfRU5ERURfTk9UX0FDQ0VQVEFOQ0UnO1xuICAgICAgICAgICAgICAgIHN0YXR1cygnXHU4OUMyXHU1QkRGXHU3QTk3XHU1M0UzXHU3RUQzXHU2NzVGIFx1MDBCNyBcdTUzOUZcdTc1MUZcdThCQzFcdTYzNkVcdTVGODVcdTVCQTFcdTY4MzggXHUwMEI3IE5PVF9SVU4nKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICBpZGxlKCdwbGF0Zm9ybS10YXJnZXQnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgcG9zZSA9IHRhcmdldFBvc2Uoc3RlcHMgKyAxKTtcbiAgICAgICAgICAgICAgICB0YXJnZXQhLnNldFRhcmdldChwb3NlKTtcbiAgICAgICAgICAgICAgICBvd25lci5yZXF1ZXN0cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAga2luZDogJ3BsYXRmb3JtLXRhcmdldCcsXG4gICAgICAgICAgICAgICAgICAgIGFmdGVyVGljazogdGljayxcbiAgICAgICAgICAgICAgICAgICAgcG9zZSxcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzOiAnU1VCTUlUVEVEX05PVF9SRVNVTFQnLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIHVpKCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgZmF1bHQoZXJyb3IsICdhZnRlci1waHlzaWNzJyk7XG4gICAgfVxufVxuZnVuY3Rpb24gaW1wdWxzZShvZmZzZXQ6IGJvb2xlYW4pIHtcbiAgICBpZiAoIXJ1bm5pbmcgfHwgZmlyZWQgfHwgaW1wdWxzZVBlbmRpbmcgfHwgbGlmZWN5Y2xlLmZhdWx0ZWQgfHwgbGlmZWN5Y2xlLmNsb3NpbmcgfHwgbGlmZWN5Y2xlLnRyYW5zaXRpb25pbmcpXG4gICAgICAgIHJldHVybjtcbiAgICBpbXB1bHNlUGVuZGluZyA9IHRydWU7XG4gICAgdWkoKTtcbiAgICBjb25zdCBvd25lciA9IHJ1biE7XG4gICAgaWRsZSgnYmFsbC1pbXB1bHNlJywgKCkgPT4ge1xuICAgICAgICBjb25zdCBiZWZvcmUgPSBtb3Rpb24oYmFsbCk7XG4gICAgICAgIGlmIChiZWZvcmUubWFzc1BlbmRpbmcgfHwgIWJlZm9yZS5lbmFibGVkKSB0aHJvdyBFcnJvcignQmFsbCBub3QgcmVhZHknKTtcbiAgICAgICAgY29uc3QgcmVsYXRpdmVQb2ludCA9IG5ldyBWZWMzKG9mZnNldCA/IDAuMiA6IDAsIDAsIDApLFxuICAgICAgICAgICAgaW1wdWxzZSA9IG5ldyBWZWMzKDAsIDAsIC0yNCk7XG4gICAgICAgIG93bmVyLnJlcXVlc3RzLnB1c2goe1xuICAgICAgICAgICAga2luZDogJ2ltcHVsc2UtcmVxdWVzdCcsXG4gICAgICAgICAgICBpZDogYmFsbC5pZCxcbiAgICAgICAgICAgIHBoYXNlOiAnaWRsZScsXG4gICAgICAgICAgICBhZnRlclRpY2s6IHRpY2ssXG4gICAgICAgICAgICBzcGFjZTogJ3dvcmxkJyxcbiAgICAgICAgICAgIHJlbGF0aXZlUG9pbnQ6IHsgLi4ucmVsYXRpdmVQb2ludCB9LFxuICAgICAgICAgICAgaW1wdWxzZTogeyAuLi5pbXB1bHNlIH0sXG4gICAgICAgICAgICBhYnNvbHV0ZVBvaW50Rm9yRGlzcGxheToge1xuICAgICAgICAgICAgICAgIHg6IGJlZm9yZS53b3JsZENPTS54ICsgcmVsYXRpdmVQb2ludC54LFxuICAgICAgICAgICAgICAgIHk6IGJlZm9yZS53b3JsZENPTS55LFxuICAgICAgICAgICAgICAgIHo6IGJlZm9yZS53b3JsZENPTS56LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGJlZm9yZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGJhbGwuYm9keS5hcHBseUltcHVsc2UoaW1wdWxzZSwgcmVsYXRpdmVQb2ludCk7XG4gICAgICAgIGZpcmVkID0gdHJ1ZTtcbiAgICAgICAgaW1wdWxzZVBlbmRpbmcgPSBmYWxzZTtcbiAgICB9KTtcbn1cbmZ1bmN0aW9uIGNoYW5nZU1hc3MoKSB7XG4gICAgY29uc3QgcmVxdWVzdGVkID0gbWFzc0Nob2ljZShlbDxIVE1MU2VsZWN0RWxlbWVudD4oJ21hc3MnKS52YWx1ZSksXG4gICAgICAgIG93bmVyID0gcnVuITtcbiAgICBpZGxlKCdwaW4tbWFzcy1jaGFuZ2UnLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGJlZm9yZSA9IHBpbnMubWFwKChhKSA9PiAoe1xuICAgICAgICAgICAgaWQ6IGEuaWQsXG4gICAgICAgICAgICBtb3Rpb246IG1vdGlvbihhKSxcbiAgICAgICAgICAgIGdlb21ldHJ5OiBnZW9tZXRyeShhKSxcbiAgICAgICAgfSkpO1xuICAgICAgICBmb3IgKGNvbnN0IGEgb2YgcGlucykgYS5ib2R5Lm1hc3MgPSByZXF1ZXN0ZWQ7XG4gICAgICAgIGdlb21ldHJ5UGVuZGluZyA9IHRydWU7XG4gICAgICAgIG93bmVyLnJlcXVlc3RzLnB1c2goe1xuICAgICAgICAgICAga2luZDogJ21hc3MtcmVxdWVzdCcsXG4gICAgICAgICAgICByZXF1ZXN0ZWQsXG4gICAgICAgICAgICBhZnRlclRpY2s6IHRpY2ssXG4gICAgICAgICAgICBiZWZvcmUsXG4gICAgICAgICAgICBhZnRlckNvbmZpZ3VyYXRpb246IHBpbnMubWFwKChhKSA9PiAoe1xuICAgICAgICAgICAgICAgIGlkOiBhLmlkLFxuICAgICAgICAgICAgICAgIHB1YmxpY01hc3M6IGEuYm9keS5tYXNzLFxuICAgICAgICAgICAgICAgIGdlb21ldHJ5OiBnZW9tZXRyeShhKSxcbiAgICAgICAgICAgIH0pKSxcbiAgICAgICAgICAgIHJlc3VsdDogJ1BFTkRJTkdfTkFUSVZFX0ZSQU1FJyxcbiAgICAgICAgfSk7XG4gICAgfSk7XG59XG5hc3luYyBmdW5jdGlvbiByZWxlYXNlKGZvckNsb3NlID0gZmFsc2UpIHtcbiAgICBydW5uaW5nID0gZmFsc2U7XG4gICAgY29uc3Qgc3RvcEVycm9ycyA9IGF0dGVtcHRTdG9wcyhbXG4gICAgICAgICgpID0+IHtcbiAgICAgICAgICAgIGlmIChzeXN0ZW0pIHN5c3RlbS5lbmFibGUgPSBmYWxzZTtcbiAgICAgICAgfSxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgICAgaG9vaz8uZGlzcG9zZSgpO1xuICAgICAgICAgICAgaG9vayA9IHVuZGVmaW5lZDtcbiAgICAgICAgfSxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgICAgdGFyZ2V0Py5kaXNwb3NlKCk7XG4gICAgICAgICAgICB0YXJnZXQgPSB1bmRlZmluZWQ7XG4gICAgICAgIH0sXG4gICAgXSk7XG4gICAgaWYgKHN0b3BFcnJvcnMubGVuZ3RoKVxuICAgICAgICBsb2cucHVzaCh7XG4gICAgICAgICAgICBraW5kOiAncmVsZWFzZS1zdG9wLWZhdWx0JyxcbiAgICAgICAgICAgIGdlbmVyYXRpb24sXG4gICAgICAgICAgICBmb3JDbG9zZSxcbiAgICAgICAgICAgIGVycm9yczogc3RvcEVycm9ycyxcbiAgICAgICAgfSk7XG4gICAgZm9yIChjb25zdCBhIG9mIGFjdG9ycykgYS5hbGl2ZSA9IGZhbHNlO1xuICAgIGlmIChydW4gJiYgcnVuLnN0YXR1cyA9PT0gJ1JVTk5JTkcnKSBydW4uc3RhdHVzID0gJ0lOVEVSUlVQVEVEJztcbiAgICBpZiAoIWFwcCkgdGhyb3cgRXJyb3IoJ0FwcCB1bmF2YWlsYWJsZScpO1xuICAgIGF3YWl0IHJlbGVhc2VPd25lZCh7XG4gICAgICAgIGFwcCxcbiAgICAgICAgc2NlbmUsXG4gICAgICAgIGFzc2V0cyxcbiAgICAgICAgcmVjb3JkOiAocm93OiBSb3cpID0+IGxvZy5wdXNoKHsgLi4ucm93LCBnZW5lcmF0aW9uIH0pLFxuICAgIH0pO1xuICAgIGlmIChzdG9wRXJyb3JzLmxlbmd0aCAmJiAhZm9yQ2xvc2UpIHRocm93IEVycm9yKCdTdG9wIGZhaWxlZDsgc2NlbmUgZmx1c2hlZCBidXQgcmVzZXQgaXMgYmxvY2tlZCcpO1xufVxuZnVuY3Rpb24gcmVzZXQoc3RhcnQ6IGJvb2xlYW4pIHtcbiAgICBpZiAoIWFwcCB8fCAhbGlmZWN5Y2xlLmJlZ2luVHJhbnNpdGlvbigpKSByZXR1cm47XG4gICAgcnVubmluZyA9IGZhbHNlO1xuICAgIHVpKCk7XG4gICAgdm9pZCBvcGVyYXRpb25zXG4gICAgICAgIC5lbnF1ZXVlKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIGF3YWl0IHJlbGVhc2UoKTtcbiAgICAgICAgICAgIGlmIChsaWZlY3ljbGUuY2xvc2luZyB8fCBsaWZlY3ljbGUuY2xvc2VkIHx8IGxpZmVjeWNsZS5mYXVsdGVkKSByZXR1cm47XG4gICAgICAgICAgICBpZiAoc3RhcnQpIG1vdW50KCk7XG4gICAgICAgICAgICBlbHNlIHN0YXR1cygnXHU1REYyXHU5MUNBXHU2NTNFXHVGRjFCXHU1Mzg2XHU1M0YyXHU0RkREXHU3NTU5IFx1MDBCNyBOT1RfUlVOJyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaCgoZXJyb3I6IHVua25vd24pID0+IGZhdWx0KGVycm9yLCAncmVzZXQnKSlcbiAgICAgICAgLmZpbmFsbHkoKCkgPT4ge1xuICAgICAgICAgICAgbGlmZWN5Y2xlLmVuZFRyYW5zaXRpb24oKTtcbiAgICAgICAgICAgIHVpKCk7XG4gICAgICAgIH0pO1xufVxuZnVuY3Rpb24gY2xvc2UoKSB7XG4gICAgaWYgKCFhcHAgfHwgIWxpZmVjeWNsZS5iZWdpbkNsb3NlKCkpIHJldHVybjtcbiAgICBydW5uaW5nID0gZmFsc2U7XG4gICAgdWkoKTtcbiAgICB2b2lkIG9wZXJhdGlvbnNcbiAgICAgICAgLmVucXVldWUoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgLy8gRmF1bHRlZCBvd25lciBoYW5kbGVzIG1heSByZWplY3QgZXhwbGljaXQgZGlzcG9zYWw7IHB1YmxpYyBzY2VuZSB0ZWFyZG93biBzdGlsbCBydW5zLlxuICAgICAgICAgICAgLy8gUmV0YWluZWQgc3RvcCBmYWlsdXJlcyByZW1haW4gaW4gdGhlIGxvZzsgdGVybWluYWwgU0RLIGNsb3NlIG93bnMgZmluYWwgb3duZXIgdGVhcmRvd24uXG4gICAgICAgICAgICBhd2FpdCByZWxlYXNlKHRydWUpO1xuICAgICAgICAgICAgZGlyZWN0b3Iub2ZmKERpcmVjdG9yLkVWRU5UX0FGVEVSX1BIWVNJQ1MsIGFmdGVyUGh5c2ljcyk7XG4gICAgICAgICAgICBpZiAoIWFwcD8uY2xvc2UpIHRocm93IEVycm9yKCdQdWJsaWMgY2xvc2UgdW5hdmFpbGFibGUnKTtcbiAgICAgICAgICAgIGxpZmVjeWNsZS5zdGFydFNka0Nsb3NlKCk7IC8vIFNESzIyMyBwZXJtYW5lbnRseSBjYWNoZXMgdGhpcyBQcm9taXNlLCBldmVuIG9uIGZhaWx1cmUuXG4gICAgICAgICAgICBjb25zdCByZWNlaXB0ID0gYXdhaXQgYXBwLmNsb3NlKCk7XG4gICAgICAgICAgICBsb2cucHVzaCh7IGtpbmQ6ICdjbG9zZScsIGdlbmVyYXRpb24sIHJlY2VpcHQgfSk7XG4gICAgICAgICAgICBpZiAocmVjZWlwdC5zdGF0dXMgIT09ICdyZWxlYXNlZCcpIHRocm93IEVycm9yKCdUZXJtaW5hbCBTREsgQ2xvc2UgZmFpbGVkJyk7XG4gICAgICAgICAgICB1bnN1YnNjcmliZT8uKCk7XG4gICAgICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignZXJyb3InLCB3aW5kb3dFcnJvcik7XG4gICAgICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigndW5oYW5kbGVkcmVqZWN0aW9uJywgcmVqZWN0aW9uKTtcbiAgICAgICAgICAgIGxpZmVjeWNsZS5jbG9zZWQgPSB0cnVlO1xuICAgICAgICAgICAgc3RhdHVzKCdcdTVERjJcdTUxNzNcdTk1RUQgXHUwMEI3IFx1OUE4Q1x1NjUzNiBOT1RfUlVOJyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaCgoZXJyb3I6IHVua25vd24pID0+IHtcbiAgICAgICAgICAgIGxvZy5wdXNoKHsga2luZDogJ2Nsb3NlLWZhaWxlZCcsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgICAgICAgICAgbGlmZWN5Y2xlLmZhdWx0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgc3RhdHVzKFxuICAgICAgICAgICAgICAgIGxpZmVjeWNsZS5zZGtDbG9zZVN0YXJ0ZWRcbiAgICAgICAgICAgICAgICAgICAgPyBgU0RLIENsb3NlIGZhaWxlZDogJHtlcnJvcn07IHRlcm1pbmFsIGNhY2hlZCByZXN1bHQsIGV4cG9ydCBldmlkZW5jZSBhbmQgcmVsb2FkIChubyBjbGVhbnVwIHJldHJ5KWBcbiAgICAgICAgICAgICAgICAgICAgOiBgQ2xvc2UgcHJlcGFyYXRpb24gZmFpbGVkOiAke2Vycm9yfTsgU0RLIGNsb3NlIG5vdCBpbnZva2VkLCBwcmVwYXJhdGlvbiBtYXkgYmUgYXR0ZW1wdGVkIGFnYWluYCxcbiAgICAgICAgICAgICk7XG4gICAgICAgIH0pXG4gICAgICAgIC5maW5hbGx5KCgpID0+IHtcbiAgICAgICAgICAgIGxpZmVjeWNsZS5lbmRDbG9zZShsaWZlY3ljbGUuY2xvc2VkKTtcbiAgICAgICAgICAgIHVpKCk7XG4gICAgICAgIH0pO1xufVxuY29uc3Qgd2luZG93RXJyb3IgPSAoZXZlbnQ6IEVycm9yRXZlbnQpID0+IGZhdWx0KGV2ZW50LmVycm9yID8/IGV2ZW50Lm1lc3NhZ2UsICd3aW5kb3ctZXJyb3InKTtcbmNvbnN0IHJlamVjdGlvbiA9IChldmVudDogUHJvbWlzZVJlamVjdGlvbkV2ZW50KSA9PiBmYXVsdChldmVudC5yZWFzb24sICd1bmhhbmRsZWQtcmVqZWN0aW9uJyk7XG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignZXJyb3InLCB3aW5kb3dFcnJvcik7XG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigndW5oYW5kbGVkcmVqZWN0aW9uJywgcmVqZWN0aW9uKTtcbmJ1dHRvbignc3RhcnQnKS5vbmNsaWNrID0gKCkgPT4gcmVzZXQodHJ1ZSk7XG5idXR0b24oJ3Jlc2V0Jykub25jbGljayA9ICgpID0+IHJlc2V0KGZhbHNlKTtcbmJ1dHRvbignY2xvc2UnKS5vbmNsaWNrID0gY2xvc2U7XG5idXR0b24oJ2NlbnRlcicpLm9uY2xpY2sgPSAoKSA9PiBpbXB1bHNlKGZhbHNlKTtcbmJ1dHRvbignb2ZmY2VudGVyJykub25jbGljayA9ICgpID0+IGltcHVsc2UodHJ1ZSk7XG5idXR0b24oJ21hc3MtYXBwbHknKS5vbmNsaWNrID0gY2hhbmdlTWFzcztcbmJ1dHRvbignZXhwb3J0Jykub25jbGljayA9ICgpID0+IHtcbiAgICBjb25zdCBibG9iID0gbmV3IEJsb2IoXG4gICAgICAgIFtcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hOiAnZXgwMi1jb21wb3VuZC1ib3dsaW5nLXYxJyxcbiAgICAgICAgICAgICAgICAgICAgYWNjZXB0YW5jZTogJ05PVF9SVU4nLFxuICAgICAgICAgICAgICAgICAgICByZXNldDIwOiAnTk9UX1JVTicsXG4gICAgICAgICAgICAgICAgICAgIGJ1aWxkOiBBSVJfQlVJTERfTlVNQkVSLFxuICAgICAgICAgICAgICAgICAgICByZXZpc2lvbjogQUlSX1JFVklTSU9OLFxuICAgICAgICAgICAgICAgICAgICBpZGVudGl0eSxcbiAgICAgICAgICAgICAgICAgICAgcnVuczogaGlzdG9yeSxcbiAgICAgICAgICAgICAgICAgICAgbG9nLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgbnVsbCxcbiAgICAgICAgICAgICAgICAyLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgXSxcbiAgICAgICAgeyB0eXBlOiAnYXBwbGljYXRpb24vanNvbicgfSxcbiAgICApO1xuICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYiksXG4gICAgICAgIGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgYS5ocmVmID0gdXJsO1xuICAgIGEuZG93bmxvYWQgPSAnZXgwMi1jb21wb3VuZC1ib3dsaW5nLmpzb24nO1xuICAgIGEuY2xpY2soKTtcbiAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodXJsKSwgMTAwMCk7XG59O1xuYXN5bmMgZnVuY3Rpb24gYm9vdCgpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKG5ldyBVUkwoJy4uL2lkZW50aXR5Lmpzb24nLCBpbXBvcnQubWV0YS51cmwpKTtcbiAgICBpZiAoIXJlc3BvbnNlLm9rKSB0aHJvdyBFcnJvcignTWlzc2luZyBpZGVudGl0eScpO1xuICAgIGlkZW50aXR5ID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgIGFwcCA9IGF3YWl0IGNyZWF0ZUFpckFwcCh7XG4gICAgICAgIGNhbnZhczogJyNHYW1lQ2FudmFzJyxcbiAgICAgICAgc2NyZWVuTW9kZTogJ2NvbnRhaW5lcicsXG4gICAgICAgIGNvbnRhaW5lcjogJyNzY2VuZS1ob3N0JyxcbiAgICAgICAgcGh5c2ljczogJ2JveDNkJyxcbiAgICAgICAgcGh5c2ljc09wdGlvbnM6IHtcbiAgICAgICAgICAgIGJveDNkOiB7XG4gICAgICAgICAgICAgICAgYXNzZXRCYXNlVXJsOiBuZXcgVVJMKCcuLi9ydW50aW1lL3BoeXNpY3MvYm94M2Qvc3QvJywgaW1wb3J0Lm1ldGEudXJsKS5ocmVmLFxuICAgICAgICAgICAgICAgIHRocmVhZGluZzogJ3NpbmdsZScsXG4gICAgICAgICAgICAgICAgd29ya2VyQ291bnQ6IDEsXG4gICAgICAgICAgICAgICAgc29sdmVyU3ViU3RlcHM6IFNVQlNURVBTLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICB9KTtcbiAgICBpZiAoIWFwcC5kaWFnbm9zdGljcyB8fCAhYXBwLnJlbGVhc2VTY2VuZSB8fCAhYXBwLmNsb3NlKVxuICAgICAgICB0aHJvdyBFcnJvcignUmVxdWlyZWQgcHVibGljIGRpYWdub3N0aWNzL3JlbGVhc2UvY2xvc2UgdW5hdmFpbGFibGUnKTtcbiAgICB1bnN1YnNjcmliZSA9IGFwcC5kaWFnbm9zdGljcy5vbk1lc3NhZ2UoKG1lc3NhZ2UpID0+IHtcbiAgICAgICAgbG9nLnB1c2goeyBraW5kOiAnZGlhZ25vc3RpYycsIG1lc3NhZ2UgfSk7XG4gICAgICAgIGlmIChtZXNzYWdlLnNldmVyaXR5ID09PSAnZXJyb3InKSBmYXVsdChtZXNzYWdlLm1lc3NhZ2UsICdlbmdpbmUtZGlhZ25vc3RpYycpO1xuICAgIH0pO1xuICAgIHN5c3RlbSA9IHBoeXNpY3MuUGh5c2ljc1N5c3RlbS5pbnN0YW5jZTtcbiAgICBzeXN0ZW0uZW5hYmxlID0gZmFsc2U7XG4gICAgc3lzdGVtLmF1dG9TaW11bGF0aW9uID0gdHJ1ZTtcbiAgICBzeXN0ZW0uZml4ZWRUaW1lU3RlcCA9IEZJWEVEX0RUO1xuICAgIHN5c3RlbS5tYXhTdWJTdGVwcyA9IDE7XG4gICAgc3lzdGVtLmdyYXZpdHkgPSBuZXcgVmVjMygwLCAtOS44MSwgMCk7XG4gICAgZGlyZWN0b3Iub24oRGlyZWN0b3IuRVZFTlRfQUZURVJfUEhZU0lDUywgYWZ0ZXJQaHlzaWNzKTtcbiAgICBzdGF0dXMoJ1JlYWR5IFx1MDBCNyBcdTVGMDBcdTU5Q0JcdTVFRkFcdTdBQ0JcdTY1QjBcdTU3M0FcdTY2NkYgXHUwMEI3IE5PVF9SVU4nKTtcbiAgICB1aSgpO1xufVxudWkoKTtcbnZvaWQgYm9vdCgpLmNhdGNoKChlcnJvcikgPT4gZmF1bHQoZXJyb3IsICdib290JykpO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBQ0E7QUFBQSxFQUNJO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BQ0c7QUFFUDtBQUFBLEVBQ0k7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FDRztBQUNQLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsY0FBYyxvQkFBb0I7QUFDM0MsTUFBTSxZQUFZLElBQUksVUFBVTtBQXFCaEMsTUFBTSxLQUFLLENBQXdCLE9BQWUsU0FBUyxlQUFlLEVBQUU7QUFDNUUsTUFBTSxTQUFTLENBQUMsT0FBZSxHQUFzQixFQUFFO0FBQ3ZELE1BQU0sVUFBaUIsQ0FBQyxHQUNwQixNQUFhLENBQUMsR0FDZCxhQUFhLElBQUksVUFBVTtBQUMvQixJQUFJLEtBQXlCLFFBQStCO0FBQzVELElBQUksTUFBOEQ7QUFDbEUsSUFBSSxhQUF1QztBQUMzQyxJQUFJLFNBQWtGLENBQUM7QUFDdkYsSUFBSSxTQUFrQixDQUFDLEdBQ25CLE9BQWdCLENBQUMsR0FDakIsTUFDQSxVQUNBO0FBQ0osSUFBSSxhQUFhLEdBQ2IsT0FBTyxJQUNQLFVBQVUsSUFDVixXQUFXLElBQ1gsUUFBUTtBQUNaLElBQUksVUFBVSxPQUNWLFFBQVEsT0FDUixpQkFBaUIsT0FDakIsa0JBQWtCO0FBQ3RCLE1BQU0sU0FBUyxDQUFDLFlBQW9CO0FBQ2hDLEtBQUcsUUFBUSxFQUFFLGNBQWM7QUFDL0I7QUFDQSxTQUFTLEtBQUs7QUFDVixRQUFNLFVBQVUsQ0FBQyxPQUFPLFVBQVUsV0FBVyxVQUFVLFVBQVUsVUFBVSxXQUFXLFVBQVU7QUFDaEcsU0FBTyxPQUFPLEVBQUUsV0FBVztBQUMzQixTQUFPLE9BQU8sRUFBRSxXQUFXO0FBQzNCLGFBQVcsTUFBTSxDQUFDLFVBQVUsV0FBVyxFQUFHLFFBQU8sRUFBRSxFQUFFLFdBQVcsV0FBVyxDQUFDLFdBQVcsU0FBUztBQUNoRyxTQUFPLFlBQVksRUFBRSxXQUFXLFdBQVcsQ0FBQztBQUM1QyxLQUFzQixNQUFNLEVBQUUsV0FBVztBQUN6QyxTQUFPLE9BQU8sRUFBRSxXQUFXLENBQUMsT0FBTyxVQUFVLFVBQVUsVUFBVSxXQUFXLFVBQVU7QUFDdEYsS0FBRyxRQUFRLEVBQUUsY0FDVCxjQUFjLFVBQVUsNkJBQTBCLEtBQUssSUFBSSxZQUFZLGdCQUFhLEtBQUssTUFBTSxVQUFVLENBQUM7QUFBQTtBQUNsSDtBQUNBLFNBQVMsVUFBVTtBQUNmLFFBQU0sUUFBUTtBQUNkLFNBQU87QUFDUCxVQUFRLFFBQVE7QUFDaEIsV0FBUztBQUNiO0FBQ0EsU0FBUyxNQUFNLE9BQWdCLFFBQWdCO0FBQzNDLE1BQUksS0FBSyxFQUFFLE1BQU0sU0FBUyxRQUFRLE9BQU8sT0FBTyxLQUFLLEdBQUcsWUFBWSxLQUFLLENBQUM7QUFDMUUsWUFBVSxVQUFVO0FBQ3BCLFlBQVU7QUFDVixNQUFJLE9BQU8sSUFBSSxXQUFXLFVBQVcsS0FBSSxTQUFTO0FBQ2xELGlCQUFlLE1BQU07QUFDakIsUUFBSTtBQUNBLFVBQUksT0FBUSxRQUFPLFNBQVM7QUFDNUIsY0FBUTtBQUFBLElBQ1osU0FBUyxHQUFHO0FBQ1IsVUFBSSxLQUFLLEVBQUUsTUFBTSxpQkFBaUIsT0FBTyxPQUFPLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDeEQ7QUFDQTtBQUFBLE1BQ0ksWUFBWSxLQUFLLFNBQU0sVUFBVSxrQkFBa0Isc0RBQXNELDZCQUE2QjtBQUFBLElBQzFJO0FBQ0EsT0FBRztBQUFBLEVBQ1AsQ0FBQztBQUNMO0FBQ0EsU0FBUyxLQUFLLE9BQWUsTUFBa0IsUUFBUSxZQUFZLFFBQVEsS0FBSztBQUM1RSxpQkFBZSxNQUFNO0FBQ2pCLFFBQ0ksVUFBVSxjQUNWLFVBQVUsV0FDVixVQUFVLFVBQ1YsVUFBVSxXQUNWLFVBQVUsaUJBQ1YsQ0FBQyxTQUNIO0FBQ0UsYUFBTyxTQUFTLEtBQUssRUFBRSxPQUFPLFFBQVEsYUFBYSxZQUFZLE1BQU0sQ0FBQztBQUN0RTtBQUFBLElBQ0o7QUFDQSxRQUFJO0FBQ0EsV0FBSztBQUNMLGFBQU8sU0FBUyxLQUFLO0FBQUEsUUFDakI7QUFBQSxRQUNBLFFBQVE7QUFBQSxRQUNSLFlBQVk7QUFBQSxRQUNaLFdBQVc7QUFBQSxNQUNmLENBQUM7QUFDRCxTQUFHO0FBQUEsSUFDUCxTQUFTLE9BQU87QUFDWixZQUFNLE9BQU8sS0FBSztBQUFBLElBQ3RCO0FBQUEsRUFDSixDQUFDO0FBQ0w7QUFDQSxTQUFTLE9BQU9BLFFBQWM7QUFDMUIsYUFBV0EsUUFBTyxVQUFVO0FBQzVCLFNBQU8sb0JBQW9CQSxPQUFNLElBQUk7QUFDekM7QUFDQSxTQUFTLE1BQU0sS0FBZTtBQUMxQixRQUFNLElBQUksSUFBSSxTQUFTO0FBQ3ZCLFNBQU8sS0FBSyxDQUFDO0FBQ2IsSUFBRSxXQUFXLEVBQUUsWUFBWSxtQkFBbUIsQ0FBQztBQUMvQyxJQUFFLFlBQVksYUFBYSxJQUFJLE1BQU0sSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDO0FBQ2pFLElBQUUsWUFBWSxhQUFhLEdBQUc7QUFDOUIsU0FBTztBQUNYO0FBQ0EsU0FBUyxPQUFPLEdBQVNDLFdBQWtELFVBQW9CO0FBQzNGLFFBQU0sT0FBTyxNQUFNLFdBQVdBLFNBQVE7QUFDdEMsU0FBTyxLQUFLLElBQUk7QUFDaEIsUUFBTSxJQUFJLEVBQUUsYUFBYSxZQUFZO0FBQ3JDLElBQUUsT0FBTztBQUNULElBQUUsa0JBQWtCLFVBQVUsQ0FBQztBQUNuQztBQUNBLFNBQVMsTUFBTSxNQUFjLFVBQWdCLE1BQXNCLE1BQWM7QUFDN0UsUUFBTSxJQUFJLElBQUksS0FBSyxJQUFJO0FBQ3ZCLElBQUUsU0FBUztBQUNYLFFBQU0sU0FBUyxDQUFDO0FBQ2hCLElBQUUsUUFBUSxPQUFPLEtBQUs7QUFDdEIsSUFBRSxZQUFZLFFBQVE7QUFDdEIsUUFBTSxPQUFPLEVBQUUsYUFBYSxTQUFTO0FBQ3JDLE9BQUssT0FBTztBQUNaLE9BQUssT0FBTztBQUNaLE9BQUssYUFBYSxTQUFTLGVBQWU7QUFDMUMsT0FBSyxhQUFhO0FBQ2xCLE9BQUssZ0JBQWdCO0FBQ3JCLE9BQUssaUJBQWlCO0FBQ3RCLFFBQU0sSUFBVztBQUFBLElBQ2IsSUFBSSxJQUFJLFVBQVUsSUFBSSxJQUFJO0FBQUEsSUFDMUI7QUFBQSxJQUNBLE9BQU87QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOO0FBQUEsSUFDQSxXQUFXLENBQUM7QUFBQSxFQUNoQjtBQUNBLFNBQU8sS0FBSyxDQUFDO0FBQ2IsU0FBTztBQUNYO0FBQ0EsU0FBUyxJQUFJLEdBQVUsTUFBWSxRQUFjLFVBQW9CLFNBQTBCO0FBQzNGLFFBQU0sSUFBSSxFQUFFLEtBQUssYUFBYSxXQUFXO0FBQ3pDLElBQUUsT0FBTztBQUNULElBQUUsU0FBUztBQUNYLElBQUUsaUJBQWlCO0FBQ25CLElBQUUsVUFBVSxLQUFLLENBQUM7QUFDbEIsUUFBTSxRQUFRLElBQUksS0FBSyxZQUFZO0FBQ25DLFFBQU0sUUFBUSxPQUFPLEtBQUs7QUFDMUIsUUFBTSxZQUFZLE1BQU07QUFDeEIsSUFBRSxLQUFLLFNBQVMsS0FBSztBQUNyQixTQUFPLE9BQU8sV0FBVyxJQUFJLEVBQUUsT0FBTyxLQUFLLEdBQUcsUUFBUSxLQUFLLEdBQUcsUUFBUSxLQUFLLEVBQUUsQ0FBQyxHQUFHLFFBQVE7QUFDN0Y7QUFDQSxTQUFTLE9BQU8sR0FBVSxRQUFnQixRQUFjLFVBQW9CLFNBQTBCO0FBQ2xHLFFBQU0sSUFBSSxFQUFFLEtBQUssYUFBYSxjQUFjO0FBQzVDLElBQUUsU0FBUztBQUNYLElBQUUsU0FBUztBQUNYLElBQUUsaUJBQWlCO0FBQ25CLElBQUUsVUFBVSxLQUFLLENBQUM7QUFDbEIsUUFBTSxRQUFRLElBQUksS0FBSyxlQUFlO0FBQ3RDLFFBQU0sUUFBUSxPQUFPLEtBQUs7QUFDMUIsUUFBTSxZQUFZLE1BQU07QUFDeEIsSUFBRSxLQUFLLFNBQVMsS0FBSztBQUNyQixTQUFPLE9BQU8sV0FBVyxPQUFPLE1BQU0sR0FBRyxRQUFRO0FBQ3JEO0FBQ0EsU0FBUyxTQUFTLEdBQVUsZ0JBQTJCO0FBQ25ELFFBQU0sU0FBUyxFQUFFLElBQUk7QUFDckIsSUFBRSxLQUFLLFNBQVM7QUFDaEIsTUFBSSxnQkFBZ0I7QUFDaEIsVUFBTSxJQUFJLElBQUksS0FBSyxHQUFHLEVBQUUsRUFBRSxhQUFhO0FBQ3ZDLE1BQUUsUUFBUSxPQUFPLEtBQUs7QUFDdEIsTUFBRSxTQUFTO0FBQ1gsVUFBTSxTQUFTLENBQUM7QUFDaEIsV0FBTyxHQUFHLFdBQVcsT0FBTyxLQUFLLEdBQUcsY0FBYztBQUdsRCxlQUFXLFFBQVEsQ0FBQyxJQUFJLEtBQUssTUFBTSxPQUFPLEtBQUssR0FBRyxJQUFJLEtBQUssT0FBTyxNQUFNLEtBQUssR0FBRyxJQUFJLEtBQUssT0FBTyxPQUFPLElBQUksQ0FBQyxHQUFHO0FBQzNHLFlBQU0sT0FBTyxJQUFJLEtBQUssc0JBQXNCO0FBQzVDLFdBQUssUUFBUSxPQUFPLEtBQUs7QUFDekIsUUFBRSxTQUFTLElBQUk7QUFDZixhQUFPLE1BQU0sV0FBVyxJQUFJLEVBQUUsT0FBTyxLQUFLLEdBQUcsUUFBUSxLQUFLLEdBQUcsUUFBUSxLQUFLLEVBQUUsQ0FBQyxHQUFHLGNBQWM7QUFBQSxJQUNsRztBQUNBLE1BQUUsU0FBUztBQUFBLEVBQ2Y7QUFDSjtBQUNBLFNBQVMsU0FBUyxHQUFVO0FBQ3hCLFNBQU8sRUFBRSxVQUFVLElBQUksQ0FBQyxPQUFPO0FBQUEsSUFDM0IsTUFBTSxhQUFhLGNBQWMsUUFBUTtBQUFBLElBQ3pDLFFBQVEsRUFBRSxHQUFHLEVBQUUsT0FBTyxHQUFHLEdBQUcsRUFBRSxPQUFPLEdBQUcsR0FBRyxFQUFFLE9BQU8sRUFBRTtBQUFBLElBQ3RELFlBQVksYUFBYSxjQUFjLENBQUMsRUFBRSxLQUFLLEdBQUcsRUFBRSxLQUFLLEdBQUcsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTTtBQUFBLEVBQ3JGLEVBQUU7QUFDTjtBQUNBLFNBQVMsUUFBUTtBQUNiO0FBQ0EsU0FBTyxVQUFVLFdBQVc7QUFDNUIsVUFBUTtBQUNSLFVBQVEsaUJBQWlCO0FBQ3pCLG9CQUFrQjtBQUNsQixXQUFTLENBQUM7QUFDVixTQUFPLENBQUM7QUFDUixRQUFNO0FBQUEsSUFDRjtBQUFBLElBQ0EsUUFBUTtBQUFBLElBQ1IsWUFBWTtBQUFBLElBQ1osUUFBUSxDQUFDO0FBQUEsSUFDVCxRQUFRLENBQUM7QUFBQSxJQUNULFVBQVUsQ0FBQztBQUFBLElBQ1gsVUFBVSxDQUFDO0FBQUEsSUFDWCxPQUFPLENBQUM7QUFBQSxFQUNaO0FBQ0EsVUFBUSxLQUFLLEdBQUc7QUFDaEIsVUFBUSxJQUFJLE1BQU0sd0JBQXdCO0FBQzFDLFFBQU0sYUFBYSxJQUFJLEtBQUssUUFBUTtBQUNwQyxRQUFNLFNBQVMsVUFBVTtBQUN6QixhQUFXLFlBQVksR0FBRyxHQUFHLEVBQUU7QUFDL0IsYUFBVyxPQUFPLElBQUksS0FBSyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQ3BDLFFBQU0sU0FBUyxXQUFXLGFBQWEsTUFBTTtBQUM3QyxTQUFPLE1BQU07QUFDYixTQUFPLE9BQU87QUFDZCxTQUFPLE1BQU07QUFDYixTQUFPLGFBQWEsT0FBTyxLQUFLO0FBQ2hDLFNBQU8sYUFBYSxPQUFPLFVBQVU7QUFDckMsU0FBTyxhQUFhLElBQUksTUFBTSxJQUFJLElBQUksSUFBSSxHQUFHO0FBQzdDLFFBQU0sUUFBUSxJQUFJLEtBQUssT0FBTztBQUM5QixRQUFNLFNBQVMsS0FBSztBQUNwQixRQUFNLGFBQWEsZ0JBQWdCO0FBQ25DLFFBQU0scUJBQXFCLEtBQUssS0FBSyxDQUFDO0FBQ3RDLFFBQU0sVUFBVSxJQUFJLGdCQUFnQjtBQUNwQyxTQUFPLEtBQUssT0FBTztBQUNuQixVQUFRLFdBQVc7QUFDbkIsVUFBUSxjQUFjO0FBQ3RCLFFBQU0sUUFBUSxNQUFNLENBQUMsS0FBSyxLQUFLLEdBQUcsQ0FBQyxHQUMvQixRQUFRLE1BQU0sQ0FBQyxJQUFJLEtBQUssR0FBRyxDQUFDLEdBQzVCLFNBQVMsTUFBTSxDQUFDLEtBQUssS0FBSyxFQUFFLENBQUMsR0FDN0IsT0FBTyxNQUFNLENBQUMsSUFBSSxJQUFJLEdBQUcsQ0FBQztBQUM5QixRQUFNLFFBQVEsTUFBTSxTQUFTLElBQUksS0FBSyxHQUFHLE9BQU8sRUFBRSxHQUFHLGVBQWUsUUFBUSxDQUFDO0FBQzdFLE1BQUksT0FBTyxJQUFJLEtBQUssSUFBSSxLQUFLLEVBQUUsR0FBRyxJQUFJLEtBQUssR0FBRyxNQUFNLE9BQU87QUFDM0QsV0FBUyxLQUFLO0FBQ2QsUUFBTSxPQUFPLE1BQU0saUJBQWlCLElBQUksS0FBSyxHQUFHLE9BQU8sR0FBRyxHQUFHLGVBQWUsUUFBUSxDQUFDO0FBQ3JGLE1BQUksTUFBTSxJQUFJLEtBQUssS0FBSyxLQUFLLEdBQUcsR0FBRyxJQUFJLEtBQUssR0FBRyxNQUFNLE9BQU87QUFDNUQsV0FBUyxJQUFJO0FBQ2IsYUFBVyxNQUFNLHNCQUFzQixJQUFJLEtBQUssR0FBRyxPQUFPLElBQUksR0FBRyxlQUFlLFdBQVcsQ0FBQztBQUM1RixNQUFJLFVBQVUsSUFBSSxLQUFLLEtBQUssS0FBSyxDQUFDLEdBQUcsSUFBSSxLQUFLLEdBQUcsUUFBUSxPQUFPO0FBQ2hFLFdBQVMsUUFBUTtBQUNqQixRQUFNLE9BQU8sV0FBVyxHQUFzQixNQUFNLEVBQUUsS0FBSztBQUMzRCxTQUFPLGFBQWEsRUFBRSxJQUFJLENBQUMsR0FBd0MsTUFBYztBQUM3RSxVQUFNLElBQUksTUFBTSxPQUFPLElBQUksQ0FBQyxJQUFJLElBQUksS0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLGVBQWUsU0FBUyxJQUFJO0FBQ3JGLFFBQUksR0FBRyxJQUFJLEtBQUssTUFBTSxLQUFLLElBQUksR0FBRyxJQUFJLEtBQUssR0FBRyxPQUFPLENBQUMsR0FBRyxPQUFPLE9BQU87QUFDdkUsV0FBTyxHQUFHLE1BQU0sSUFBSSxLQUFLLEdBQUcsTUFBTSxDQUFDLEdBQUcsT0FBTyxPQUFPO0FBQ3BELGFBQVMsR0FBRyxLQUFLO0FBQ2pCLFdBQU87QUFBQSxFQUNYLENBQUM7QUFDRCxTQUFPLE1BQU0sUUFBUSxJQUFJLEtBQUssR0FBRyxNQUFNLEdBQUcsR0FBRyxlQUFlLFNBQVMsQ0FBQztBQUN0RSxTQUFPLE1BQU0sTUFBTSxJQUFJLEtBQUssR0FBRyxRQUFRLE9BQU87QUFDOUMsV0FBUyxNQUFNLEtBQUs7QUFDcEIsTUFBSyxJQUFJLEtBQUs7QUFHZCxTQUFPLFNBQVM7QUFDaEIsYUFBVyxLQUFLLENBQUMsR0FBRyxNQUFNLElBQUksR0FBRztBQUM3QixNQUFFLEtBQUssU0FBUyxNQUFNO0FBQ3RCLFFBQUksRUFBRSxLQUFLLFlBQVksTUFBTSxNQUFPLE9BQU0sTUFBTSxrQ0FBa0M7QUFDbEYsTUFBRSxLQUFLLGtCQUFrQixJQUFJLEtBQUssQ0FBQztBQUNuQyxNQUFFLEtBQUssbUJBQW1CLElBQUksS0FBSyxDQUFDO0FBQ3BDLFVBQU0sV0FBVyxJQUFJLEtBQUssR0FDdEIsVUFBVSxJQUFJLEtBQUs7QUFDdkIsTUFBRSxLQUFLLGtCQUFrQixRQUFRO0FBQ2pDLE1BQUUsS0FBSyxtQkFBbUIsT0FBTztBQUNqQyxRQUFJLFNBQVMsS0FBSztBQUFBLE1BQ2QsTUFBTTtBQUFBLE1BQ04sSUFBSSxFQUFFO0FBQUEsTUFDTixLQUFLLEVBQUUsS0FBSztBQUFBLE1BQ1osVUFBVSxFQUFFLEdBQUcsU0FBUztBQUFBLE1BQ3hCLGlCQUFpQixFQUFFLEdBQUcsUUFBUTtBQUFBLE1BQzlCLGVBQWUsRUFBRSxLQUFLO0FBQUEsSUFDMUIsQ0FBQztBQUFBLEVBQ0w7QUFDQSxXQUFTLDJCQUEyQixTQUFTLElBQUk7QUFDakQsU0FBTyxVQUFVLFdBQVcsQ0FBQyxDQUFDO0FBQzlCLE1BQUksU0FBUyxLQUFLO0FBQUEsSUFDZCxNQUFNO0FBQUEsSUFDTixNQUFNLFdBQVcsQ0FBQztBQUFBLElBQ2xCLFFBQVE7QUFBQSxFQUNaLENBQUM7QUFDRCxNQUFJLFNBQVMsS0FBSztBQUFBLElBQ2QsT0FBTztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ04sTUFBTSxLQUFLLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksVUFBVSxTQUFTLENBQUMsRUFBRSxFQUFFO0FBQUEsRUFDL0QsQ0FBQztBQUNELFFBQU0sUUFBUSxZQUNWLFFBQVE7QUFDWixTQUFPLHdCQUF3QixDQUFDLFlBQVk7QUFDeEMsUUFBSTtBQUNBLFVBQUksVUFBVSxjQUFjLENBQUMsV0FBVyxVQUFVLFFBQVMsT0FBTSxNQUFNLG1CQUFtQjtBQUMxRixZQUFNLElBQUksTUFBTSxPQUFPO0FBQ3ZCLFlBQU0sT0FBTyxLQUFLLENBQUM7QUFDbkIsa0JBQVksQ0FBQztBQUNiLGFBQU8sUUFBUTtBQUNmLGdCQUFVLFFBQVE7QUFHbEIsVUFBSSxpQkFBaUI7QUFDakIsbUJBQVcsT0FBTyxNQUFNO0FBQ3BCLGdCQUFNLElBQUk7QUFBQSxZQUNOO0FBQUEsWUFDQSxJQUFJO0FBQUEsWUFDSixFQUFFLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxLQUFTO0FBQUEsWUFDMUIsRUFBRSxPQUFPLEdBQUcsTUFBTSxZQUFZLGNBQWMsTUFBTTtBQUFBLFVBQ3REO0FBQ0EsZ0JBQU0sU0FBUyxLQUFLO0FBQUEsWUFDaEIsT0FBTztBQUFBLFlBQ1A7QUFBQSxZQUNBO0FBQUEsWUFDQSxpQkFBaUIsRUFBRTtBQUFBLFlBQ25CLGlCQUFpQixFQUFFO0FBQUEsWUFDbkIsd0JBQXdCLEVBQUU7QUFBQSxZQUMxQixRQUFRLElBQUk7QUFBQSxZQUNaLE1BQU0sT0FBTyxHQUFHO0FBQUEsWUFDaEIsVUFBVSxFQUFFLFNBQVMsSUFBSSxDQUFDQyxRQUFPO0FBQUEsY0FDN0IsTUFBTUEsR0FBRTtBQUFBLGNBQ1IsUUFBUUEsR0FBRTtBQUFBLGNBQ1YsVUFBVUEsR0FBRTtBQUFBLGNBQ1osWUFBWUEsR0FBRTtBQUFBLFlBQ2xCLEVBQUU7QUFBQSxVQUNOLENBQUM7QUFBQSxRQUNMO0FBQ0EsMEJBQWtCO0FBQUEsTUFDdEI7QUFBQSxJQUNKLFNBQVMsT0FBTztBQUNaLFlBQU0sT0FBTyxhQUFhO0FBQzFCLFlBQU07QUFBQSxJQUNWO0FBQUEsRUFDSixDQUFDO0FBQ0QsWUFBVTtBQUNWLFNBQU8sU0FBUztBQUNoQixTQUFPLGlHQUErQjtBQUN0QyxLQUFHO0FBQ1A7QUFDQSxTQUFTLGNBQWMsR0FBVSxHQUE4QjtBQUMzRCxRQUFNLElBQUksRUFBRSxLQUFLLGVBQ2IsSUFBSSxFQUFFLEtBQUssZUFDWCxJQUFJLEVBQUU7QUFDVixRQUFNLFlBQVksS0FBSztBQUFBLElBQ25CLEtBQUssTUFBTSxFQUFFLElBQUksRUFBRSxTQUFTLEdBQUcsRUFBRSxJQUFJLEVBQUUsU0FBUyxHQUFHLEVBQUUsSUFBSSxFQUFFLFNBQVMsQ0FBQztBQUFBLElBQ3JFLEtBQUs7QUFBQSxNQUNELEtBQUssTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxDQUFDO0FBQUEsTUFDckQsS0FBSyxNQUFNLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLENBQUM7QUFBQSxJQUN6RDtBQUFBLEVBQ0o7QUFFQSxRQUFNLElBQUksRUFBRSxhQUNSLElBQUk7QUFBQSxJQUNBLEdBQUcsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRTtBQUFBLElBQ3ZCLEdBQUcsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRTtBQUFBLElBQ3ZCLEdBQUcsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRTtBQUFBLEVBQzNCO0FBQ0osUUFBTSxXQUFXO0FBQUEsSUFDYixHQUFHLEVBQUUsU0FBUyxJQUFJLEVBQUUsSUFBSSxLQUFLLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRTtBQUFBLElBQzdELEdBQUcsRUFBRSxTQUFTLElBQUksRUFBRSxJQUFJLEtBQUssRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFO0FBQUEsSUFDN0QsR0FBRyxFQUFFLFNBQVMsSUFBSSxFQUFFLElBQUksS0FBSyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUU7QUFBQSxFQUNqRTtBQUNBLFNBQU87QUFBQSxJQUNIO0FBQUEsSUFDQSwwQkFBMEIsS0FBSztBQUFBLE1BQzNCLFNBQVMsSUFBSSxFQUFFLFNBQVM7QUFBQSxNQUN4QixTQUFTLElBQUksRUFBRSxTQUFTO0FBQUEsTUFDeEIsU0FBUyxJQUFJLEVBQUUsU0FBUztBQUFBLElBQzVCO0FBQUEsRUFDSjtBQUNKO0FBQ0EsU0FBUyxlQUFlO0FBQ3BCLE1BQUksQ0FBQyxXQUFXLFVBQVUsV0FBVyxPQUFPLEtBQUssYUFBYSxLQUFNO0FBQ3BFLE1BQUk7QUFDQSxlQUFXO0FBQ1g7QUFDQSxVQUFNLFFBQVE7QUFDZCxVQUFNLE9BQU8sQ0FBQyxHQUFHLE1BQU0sTUFBTSxRQUFRLEVBQUUsSUFBSSxDQUFDLE1BQU07QUFDOUMsWUFBTSxJQUFJLE9BQU8sQ0FBQztBQUNsQixVQUFJLENBQUMsRUFBRSxXQUFXLEVBQUUsWUFBYSxPQUFNLE1BQU0sNkNBQTZDO0FBQzFGLFVBQUksS0FBSyxTQUFTLENBQUMsS0FBSyxLQUFLLEVBQUUsUUFBUSxLQUFLLENBQUMsTUFBTSxNQUFNLFNBQVMsRUFBRSxFQUFFLEVBQUcsT0FBTSxNQUFNLEtBQUssRUFBRSxFQUFFO0FBRTlGLFVBQUksRUFBRSxRQUFRO0FBQ1YsVUFBRSxPQUFPLFNBQVM7QUFDbEIsVUFBRSxPQUFPLFlBQVksRUFBRSxTQUFTLEdBQUcsRUFBRSxTQUFTLEdBQUcsRUFBRSxTQUFTLENBQUM7QUFBQSxNQUNqRTtBQUNBLGFBQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxRQUFRLEdBQUcsR0FBRyxjQUFjLEdBQUcsQ0FBQyxFQUFFO0FBQUEsSUFDekQsQ0FBQztBQUNELFVBQU0sTUFBTTtBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsTUFBTTtBQUFBLE1BQ04sT0FBTztBQUFBLE1BQ1AsUUFBUTtBQUFBLE1BQ1IsT0FBTyxDQUFDLEdBQUcsTUFBTSxLQUFLO0FBQUEsSUFDMUI7QUFDQSxVQUFNLE9BQU8sS0FBSyxHQUFHO0FBQ3JCLE9BQUcsYUFBYSxFQUFFLGNBQWMsS0FBSztBQUFBLE1BQ2pDO0FBQUEsUUFDSSxNQUFNO0FBQUEsUUFDTixNQUFNLEtBQUssS0FBSyxNQUFNO0FBQUEsUUFDdEIsVUFBVSxLQUFLLENBQUM7QUFBQSxRQUNoQixVQUFVLEtBQUssR0FBRyxFQUFFO0FBQUEsTUFDeEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0o7QUFDQSxRQUFJLFNBQVM7QUFDVCxXQUFLLDBCQUEwQixNQUFNO0FBQ2pDLGtCQUFVO0FBQ1YsZUFBTyxTQUFTO0FBQ2hCLGdCQUFRO0FBQ1IsY0FBTSxTQUFTO0FBQ2YsZUFBTyxtR0FBNEI7QUFBQSxNQUN2QyxDQUFDO0FBQUE7QUFFRCxXQUFLLG1CQUFtQixNQUFNO0FBQzFCLGNBQU0sT0FBTyxXQUFXLFFBQVEsQ0FBQztBQUNqQyxlQUFRLFVBQVUsSUFBSTtBQUN0QixjQUFNLFNBQVMsS0FBSztBQUFBLFVBQ2hCLE1BQU07QUFBQSxVQUNOLFdBQVc7QUFBQSxVQUNYO0FBQUEsVUFDQSxRQUFRO0FBQUEsUUFDWixDQUFDO0FBQUEsTUFDTCxDQUFDO0FBQ0wsT0FBRztBQUFBLEVBQ1AsU0FBUyxPQUFPO0FBQ1osVUFBTSxPQUFPLGVBQWU7QUFBQSxFQUNoQztBQUNKO0FBQ0EsU0FBUyxRQUFRLFFBQWlCO0FBQzlCLE1BQUksQ0FBQyxXQUFXLFNBQVMsa0JBQWtCLFVBQVUsV0FBVyxVQUFVLFdBQVcsVUFBVTtBQUMzRjtBQUNKLG1CQUFpQjtBQUNqQixLQUFHO0FBQ0gsUUFBTSxRQUFRO0FBQ2QsT0FBSyxnQkFBZ0IsTUFBTTtBQUN2QixVQUFNLFNBQVMsT0FBTyxJQUFJO0FBQzFCLFFBQUksT0FBTyxlQUFlLENBQUMsT0FBTyxRQUFTLE9BQU0sTUFBTSxnQkFBZ0I7QUFDdkUsVUFBTSxnQkFBZ0IsSUFBSSxLQUFLLFNBQVMsTUFBTSxHQUFHLEdBQUcsQ0FBQyxHQUNqREMsV0FBVSxJQUFJLEtBQUssR0FBRyxHQUFHLEdBQUc7QUFDaEMsVUFBTSxTQUFTLEtBQUs7QUFBQSxNQUNoQixNQUFNO0FBQUEsTUFDTixJQUFJLEtBQUs7QUFBQSxNQUNULE9BQU87QUFBQSxNQUNQLFdBQVc7QUFBQSxNQUNYLE9BQU87QUFBQSxNQUNQLGVBQWUsRUFBRSxHQUFHLGNBQWM7QUFBQSxNQUNsQyxTQUFTLEVBQUUsR0FBR0EsU0FBUTtBQUFBLE1BQ3RCLHlCQUF5QjtBQUFBLFFBQ3JCLEdBQUcsT0FBTyxTQUFTLElBQUksY0FBYztBQUFBLFFBQ3JDLEdBQUcsT0FBTyxTQUFTO0FBQUEsUUFDbkIsR0FBRyxPQUFPLFNBQVM7QUFBQSxNQUN2QjtBQUFBLE1BQ0E7QUFBQSxJQUNKLENBQUM7QUFDRCxTQUFLLEtBQUssYUFBYUEsVUFBUyxhQUFhO0FBQzdDLFlBQVE7QUFDUixxQkFBaUI7QUFBQSxFQUNyQixDQUFDO0FBQ0w7QUFDQSxTQUFTLGFBQWE7QUFDbEIsUUFBTSxZQUFZLFdBQVcsR0FBc0IsTUFBTSxFQUFFLEtBQUssR0FDNUQsUUFBUTtBQUNaLE9BQUssbUJBQW1CLE1BQU07QUFDMUIsVUFBTSxTQUFTLEtBQUssSUFBSSxDQUFDLE9BQU87QUFBQSxNQUM1QixJQUFJLEVBQUU7QUFBQSxNQUNOLFFBQVEsT0FBTyxDQUFDO0FBQUEsTUFDaEIsVUFBVSxTQUFTLENBQUM7QUFBQSxJQUN4QixFQUFFO0FBQ0YsZUFBVyxLQUFLLEtBQU0sR0FBRSxLQUFLLE9BQU87QUFDcEMsc0JBQWtCO0FBQ2xCLFVBQU0sU0FBUyxLQUFLO0FBQUEsTUFDaEIsTUFBTTtBQUFBLE1BQ047QUFBQSxNQUNBLFdBQVc7QUFBQSxNQUNYO0FBQUEsTUFDQSxvQkFBb0IsS0FBSyxJQUFJLENBQUMsT0FBTztBQUFBLFFBQ2pDLElBQUksRUFBRTtBQUFBLFFBQ04sWUFBWSxFQUFFLEtBQUs7QUFBQSxRQUNuQixVQUFVLFNBQVMsQ0FBQztBQUFBLE1BQ3hCLEVBQUU7QUFBQSxNQUNGLFFBQVE7QUFBQSxJQUNaLENBQUM7QUFBQSxFQUNMLENBQUM7QUFDTDtBQUNBLGVBQWUsUUFBUSxXQUFXLE9BQU87QUFDckMsWUFBVTtBQUNWLFFBQU0sYUFBYSxhQUFhO0FBQUEsSUFDNUIsTUFBTTtBQUNGLFVBQUksT0FBUSxRQUFPLFNBQVM7QUFBQSxJQUNoQztBQUFBLElBQ0EsTUFBTTtBQUNGLFlBQU0sUUFBUTtBQUNkLGFBQU87QUFBQSxJQUNYO0FBQUEsSUFDQSxNQUFNO0FBQ0YsY0FBUSxRQUFRO0FBQ2hCLGVBQVM7QUFBQSxJQUNiO0FBQUEsRUFDSixDQUFDO0FBQ0QsTUFBSSxXQUFXO0FBQ1gsUUFBSSxLQUFLO0FBQUEsTUFDTCxNQUFNO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxNQUNBLFFBQVE7QUFBQSxJQUNaLENBQUM7QUFDTCxhQUFXLEtBQUssT0FBUSxHQUFFLFFBQVE7QUFDbEMsTUFBSSxPQUFPLElBQUksV0FBVyxVQUFXLEtBQUksU0FBUztBQUNsRCxNQUFJLENBQUMsSUFBSyxPQUFNLE1BQU0saUJBQWlCO0FBQ3ZDLFFBQU0sYUFBYTtBQUFBLElBQ2Y7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0EsUUFBUSxDQUFDLFFBQWEsSUFBSSxLQUFLLEVBQUUsR0FBRyxLQUFLLFdBQVcsQ0FBQztBQUFBLEVBQ3pELENBQUM7QUFDRCxNQUFJLFdBQVcsVUFBVSxDQUFDLFNBQVUsT0FBTSxNQUFNLGlEQUFpRDtBQUNyRztBQUNBLFNBQVMsTUFBTSxPQUFnQjtBQUMzQixNQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsZ0JBQWdCLEVBQUc7QUFDMUMsWUFBVTtBQUNWLEtBQUc7QUFDSCxPQUFLLFdBQ0EsUUFBUSxZQUFZO0FBQ2pCLFVBQU0sUUFBUTtBQUNkLFFBQUksVUFBVSxXQUFXLFVBQVUsVUFBVSxVQUFVLFFBQVM7QUFDaEUsUUFBSSxNQUFPLE9BQU07QUFBQSxRQUNaLFFBQU8sK0RBQW9CO0FBQUEsRUFDcEMsQ0FBQyxFQUNBLE1BQU0sQ0FBQyxVQUFtQixNQUFNLE9BQU8sT0FBTyxDQUFDLEVBQy9DLFFBQVEsTUFBTTtBQUNYLGNBQVUsY0FBYztBQUN4QixPQUFHO0FBQUEsRUFDUCxDQUFDO0FBQ1Q7QUFDQSxTQUFTLFFBQVE7QUFDYixNQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsV0FBVyxFQUFHO0FBQ3JDLFlBQVU7QUFDVixLQUFHO0FBQ0gsT0FBSyxXQUNBLFFBQVEsWUFBWTtBQUdqQixVQUFNLFFBQVEsSUFBSTtBQUNsQixhQUFTLElBQUksU0FBUyxxQkFBcUIsWUFBWTtBQUN2RCxRQUFJLENBQUMsS0FBSyxNQUFPLE9BQU0sTUFBTSwwQkFBMEI7QUFDdkQsY0FBVSxjQUFjO0FBQ3hCLFVBQU0sVUFBVSxNQUFNLElBQUksTUFBTTtBQUNoQyxRQUFJLEtBQUssRUFBRSxNQUFNLFNBQVMsWUFBWSxRQUFRLENBQUM7QUFDL0MsUUFBSSxRQUFRLFdBQVcsV0FBWSxPQUFNLE1BQU0sMkJBQTJCO0FBQzFFLGtCQUFjO0FBQ2QsV0FBTyxvQkFBb0IsU0FBUyxXQUFXO0FBQy9DLFdBQU8sb0JBQW9CLHNCQUFzQixTQUFTO0FBQzFELGNBQVUsU0FBUztBQUNuQixXQUFPLDhDQUFrQjtBQUFBLEVBQzdCLENBQUMsRUFDQSxNQUFNLENBQUMsVUFBbUI7QUFDdkIsUUFBSSxLQUFLLEVBQUUsTUFBTSxnQkFBZ0IsT0FBTyxPQUFPLEtBQUssRUFBRSxDQUFDO0FBQ3ZELGNBQVUsVUFBVTtBQUNwQjtBQUFBLE1BQ0ksVUFBVSxrQkFDSixxQkFBcUIsS0FBSyw0RUFDMUIsNkJBQTZCLEtBQUs7QUFBQSxJQUM1QztBQUFBLEVBQ0osQ0FBQyxFQUNBLFFBQVEsTUFBTTtBQUNYLGNBQVUsU0FBUyxVQUFVLE1BQU07QUFDbkMsT0FBRztBQUFBLEVBQ1AsQ0FBQztBQUNUO0FBQ0EsTUFBTSxjQUFjLENBQUMsVUFBc0IsTUFBTSxNQUFNLFNBQVMsTUFBTSxTQUFTLGNBQWM7QUFDN0YsTUFBTSxZQUFZLENBQUMsVUFBaUMsTUFBTSxNQUFNLFFBQVEscUJBQXFCO0FBQzdGLE9BQU8saUJBQWlCLFNBQVMsV0FBVztBQUM1QyxPQUFPLGlCQUFpQixzQkFBc0IsU0FBUztBQUN2RCxPQUFPLE9BQU8sRUFBRSxVQUFVLE1BQU0sTUFBTSxJQUFJO0FBQzFDLE9BQU8sT0FBTyxFQUFFLFVBQVUsTUFBTSxNQUFNLEtBQUs7QUFDM0MsT0FBTyxPQUFPLEVBQUUsVUFBVTtBQUMxQixPQUFPLFFBQVEsRUFBRSxVQUFVLE1BQU0sUUFBUSxLQUFLO0FBQzlDLE9BQU8sV0FBVyxFQUFFLFVBQVUsTUFBTSxRQUFRLElBQUk7QUFDaEQsT0FBTyxZQUFZLEVBQUUsVUFBVTtBQUMvQixPQUFPLFFBQVEsRUFBRSxVQUFVLE1BQU07QUFDN0IsUUFBTSxPQUFPLElBQUk7QUFBQSxJQUNiO0FBQUEsTUFDSSxLQUFLO0FBQUEsUUFDRDtBQUFBLFVBQ0ksUUFBUTtBQUFBLFVBQ1IsWUFBWTtBQUFBLFVBQ1osU0FBUztBQUFBLFVBQ1QsT0FBTztBQUFBLFVBQ1AsVUFBVTtBQUFBLFVBQ1Y7QUFBQSxVQUNBLE1BQU07QUFBQSxVQUNOO0FBQUEsUUFDSjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDSjtBQUFBLElBQ0o7QUFBQSxJQUNBLEVBQUUsTUFBTSxtQkFBbUI7QUFBQSxFQUMvQjtBQUNBLFFBQU0sTUFBTSxJQUFJLGdCQUFnQixJQUFJLEdBQ2hDLElBQUksU0FBUyxjQUFjLEdBQUc7QUFDbEMsSUFBRSxPQUFPO0FBQ1QsSUFBRSxXQUFXO0FBQ2IsSUFBRSxNQUFNO0FBQ1IsYUFBVyxNQUFNLElBQUksZ0JBQWdCLEdBQUcsR0FBRyxHQUFJO0FBQ25EO0FBQ0EsZUFBZSxPQUFPO0FBQ2xCLFFBQU0sV0FBVyxNQUFNLE1BQU0sSUFBSSxJQUFJLG9CQUFvQixZQUFZLEdBQUcsQ0FBQztBQUN6RSxNQUFJLENBQUMsU0FBUyxHQUFJLE9BQU0sTUFBTSxrQkFBa0I7QUFDaEQsYUFBVyxNQUFNLFNBQVMsS0FBSztBQUMvQixRQUFNLE1BQU0sYUFBYTtBQUFBLElBQ3JCLFFBQVE7QUFBQSxJQUNSLFlBQVk7QUFBQSxJQUNaLFdBQVc7QUFBQSxJQUNYLFNBQVM7QUFBQSxJQUNULGdCQUFnQjtBQUFBLE1BQ1osT0FBTztBQUFBLFFBQ0gsY0FBYyxJQUFJLElBQUksZ0NBQWdDLFlBQVksR0FBRyxFQUFFO0FBQUEsUUFDdkUsV0FBVztBQUFBLFFBQ1gsYUFBYTtBQUFBLFFBQ2IsZ0JBQWdCO0FBQUEsTUFDcEI7QUFBQSxJQUNKO0FBQUEsRUFDSixDQUFDO0FBQ0QsTUFBSSxDQUFDLElBQUksZUFBZSxDQUFDLElBQUksZ0JBQWdCLENBQUMsSUFBSTtBQUM5QyxVQUFNLE1BQU0sdURBQXVEO0FBQ3ZFLGdCQUFjLElBQUksWUFBWSxVQUFVLENBQUMsWUFBWTtBQUNqRCxRQUFJLEtBQUssRUFBRSxNQUFNLGNBQWMsUUFBUSxDQUFDO0FBQ3hDLFFBQUksUUFBUSxhQUFhLFFBQVMsT0FBTSxRQUFRLFNBQVMsbUJBQW1CO0FBQUEsRUFDaEYsQ0FBQztBQUNELFdBQVMsUUFBUSxjQUFjO0FBQy9CLFNBQU8sU0FBUztBQUNoQixTQUFPLGlCQUFpQjtBQUN4QixTQUFPLGdCQUFnQjtBQUN2QixTQUFPLGNBQWM7QUFDckIsU0FBTyxVQUFVLElBQUksS0FBSyxHQUFHLE9BQU8sQ0FBQztBQUNyQyxXQUFTLEdBQUcsU0FBUyxxQkFBcUIsWUFBWTtBQUN0RCxTQUFPLG9FQUEyQjtBQUNsQyxLQUFHO0FBQ1A7QUFDQSxHQUFHO0FBQ0gsS0FBSyxLQUFLLEVBQUUsTUFBTSxDQUFDLFVBQVUsTUFBTSxPQUFPLE1BQU0sQ0FBQzsiLAogICJuYW1lcyI6IFsiYWN0b3IiLCAiZ2VvbWV0cnkiLCAiYyIsICJpbXB1bHNlIl0KfQo=
