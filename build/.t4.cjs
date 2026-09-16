var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// tools/benchmark/validators/index.ts
var index_exports = {};
__export(index_exports, {
  VALIDATORS: () => VALIDATORS,
  animationPlaying: () => animationPlaying,
  assetLoaded: () => assetLoaded,
  capabilityStatus: () => capabilityStatus,
  frameDiff: () => frameDiff,
  materialProperty: () => materialProperty,
  noRuntimeError: () => noRuntimeError,
  nodeCount: () => nodeCount,
  nodeExists: () => nodeExists,
  resourceReleased: () => resourceReleased,
  runValidators: () => runValidators,
  sceneReady: () => sceneReady,
  transformEquals: () => transformEquals,
  visibleFrame: () => visibleFrame
});
module.exports = __toCommonJS(index_exports);
var near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
function pass(id, detail) {
  return { validatorId: id, state: "PASS", detail };
}
function fail(id, detail) {
  return { validatorId: id, state: "FAIL", detail };
}
var sceneReady = {
  id: "scene-ready",
  evaluate(snapshot) {
    if (!snapshot.scene) {
      return fail("scene-ready", "no running scene observed");
    }
    return pass("scene-ready", `scene=${snapshot.scene.name}`);
  }
};
var nodeExists = {
  id: "node-exists",
  evaluate(snapshot, params) {
    const name = String(params.name ?? "");
    const id = String(params.id ?? "");
    const hit = Object.values(snapshot.nodes).find((n) => (name ? n.name === name : true) && (id ? n.id === id : true));
    if (!hit) {
      return fail("node-exists", `node not found (name=${name || "*"}, id=${id || "*"})`);
    }
    return pass("node-exists", hit.id);
  }
};
var nodeCount = {
  id: "node-count",
  evaluate(snapshot, params) {
    if (!snapshot.scene) {
      return fail("node-count", "no scene");
    }
    const actual = snapshot.scene.nodeCount;
    if (params.min !== void 0 && actual < Number(params.min)) {
      return fail("node-count", `${actual} < min ${params.min}`);
    }
    if (params.equals !== void 0 && actual !== Number(params.equals)) {
      return fail("node-count", `${actual} != ${params.equals}`);
    }
    return pass("node-count", String(actual));
  }
};
var transformEquals = {
  id: "transform-equals",
  evaluate(snapshot, params) {
    const name = String(params.nodeName ?? "");
    const node = Object.values(snapshot.nodes).find((n) => n.name === name) ?? (params.nodeId ? snapshot.nodes[String(params.nodeId)] : void 0);
    if (!node) {
      return fail("transform-equals", `node not found: ${name || params.nodeId}`);
    }
    const space = params.space === "world" ? node.world : { position: node.local.position };
    if (params.position) {
      const expected = params.position;
      if (!expected.every((v, i) => near(space.position[i], v))) {
        return fail("transform-equals", `position ${JSON.stringify(space.position)} != ${JSON.stringify(expected)} (${params.space ?? "local"})`);
      }
    }
    if (params.scale && !node.local.scale) {
      return fail("transform-equals", "scale missing");
    }
    if (params.scale) {
      const expected = params.scale;
      if (!expected.every((v, i) => near(node.local.scale[i], v))) {
        return fail("transform-equals", `scale ${JSON.stringify(node.local.scale)} != ${JSON.stringify(expected)}`);
      }
    }
    return pass("transform-equals", name);
  }
};
var assetLoaded = {
  id: "asset-loaded",
  evaluate(snapshot, params) {
    if (!snapshot.assets) {
      return fail("asset-loaded", "no asset report");
    }
    const kind = params.kind ? String(params.kind) : null;
    const min = params.min !== void 0 ? Number(params.min) : 1;
    const counts = snapshot.assets.counts;
    const total = kind ? counts[kind] ?? 0 : Object.values(counts).reduce((s, n) => s + n, 0);
    if (total < min) {
      return fail("asset-loaded", `assets ${kind ?? "total"}=${total} < ${min}`);
    }
    const blocking = snapshot.assets.diagnostics.filter((d) => d.code === "MISSING_DEPENDENCY" || d.code === "DESTROYED_RESOURCE" || d.code === "TYPE_MISMATCH");
    if (blocking.length > 0) {
      return fail("asset-loaded", `diagnostics: ${blocking.map((d) => d.code).join(",")}`);
    }
    return pass("asset-loaded", `${kind ?? "total"}=${total}`);
  }
};
var animationPlaying = {
  id: "animation-playing",
  evaluate(snapshot) {
    const count = snapshot.scene?.componentsByType.Animation ?? 0;
    if (count === 0) {
      return fail("animation-playing", "no Animation component in scene");
    }
    return pass("animation-playing", `${count} animation component(s)`);
  }
};
var materialProperty = {
  id: "material-property",
  evaluate(snapshot, params) {
    if (!snapshot.assets) {
      return fail("material-property", "no asset report");
    }
    const min = params.min !== void 0 ? Number(params.min) : 1;
    if ((snapshot.assets.counts.Material ?? 0) < min) {
      return fail("material-property", `materials < ${min}`);
    }
    if (!snapshot.assets.ok) {
      return fail("material-property", `asset report not ok: ${snapshot.assets.diagnostics.map((d) => d.code).join(",")}`);
    }
    return pass("material-property");
  }
};
var noRuntimeError = {
  id: "no-runtime-error",
  evaluate(snapshot, params) {
    const max = params.max !== void 0 ? Number(params.max) : 0;
    if (snapshot.runtimeErrors.length > max) {
      return fail("no-runtime-error", `${snapshot.runtimeErrors.length} errors: ${snapshot.runtimeErrors.slice(0, 3).map((e) => `${e.category}:${e.message.slice(0, 60)}`).join(" | ")}`);
    }
    return pass("no-runtime-error");
  }
};
var visibleFrame = {
  id: "visible-frame",
  evaluate(snapshot) {
    if (!snapshot.capture) {
      return fail("visible-frame", "no frame captured");
    }
    if (!snapshot.centerPixel) {
      return fail("visible-frame", "no pixel sample");
    }
    const [r, g, b] = snapshot.centerPixel;
    const nearClear = Math.abs(r - 30) < 12 && Math.abs(g - 40) < 12 && Math.abs(b - 60) < 12;
    const nearBlack = r + g + b < 45;
    if (nearClear || nearBlack) {
      return fail("visible-frame", `center pixel ${r},${g},${b} looks like clear color`);
    }
    return pass("visible-frame", `center=${r},${g},${b}`);
  }
};
var frameDiff = {
  id: "frame-diff",
  evaluate(snapshot, params) {
    const before = params.beforePng;
    if (!snapshot.capture?.png) {
      return fail("frame-diff", "no current frame");
    }
    if (!before) {
      return fail("frame-diff", "no baseline frame provided");
    }
    if (before === snapshot.capture.png) {
      return fail("frame-diff", "frames identical (stale capture?)");
    }
    return pass("frame-diff");
  }
};
var capabilityStatus = {
  id: "capability-status",
  evaluate(snapshot, params) {
    const required = String(params.requires ?? "");
    const capability = snapshot.capability;
    if (!capability) {
      return fail("capability-status", `capability '${required}' not reported`);
    }
    if (required && capability.name !== required) {
      return fail("capability-status", `capability name mismatch: expected '${required}', got '${capability.name}'`);
    }
    if (capability.status === "unsupported") {
      return { validatorId: "capability-status", state: "EXPECTED_UNSUPPORTED", detail: required };
    }
    if (capability.status === "fallback") {
      return { validatorId: "capability-status", state: "EXPECTED_FALLBACK", detail: required };
    }
    return pass("capability-status", `${required}=${capability.status}`);
  }
};
var resourceReleased = {
  id: "resource-released",
  evaluate(snapshot) {
    if (!snapshot.assets) {
      return fail("resource-released", "no asset report");
    }
    const destroyed = snapshot.assets.diagnostics.filter((d) => d.code === "DESTROYED_RESOURCE");
    if (destroyed.length > 0) {
      return fail("resource-released", `${destroyed.length} destroyed resources`);
    }
    return pass("resource-released");
  }
};
var VALIDATORS = {
  "scene-ready": sceneReady,
  "node-exists": nodeExists,
  "node-count": nodeCount,
  "transform-equals": transformEquals,
  "asset-loaded": assetLoaded,
  "animation-playing": animationPlaying,
  "material-property": materialProperty,
  "no-runtime-error": noRuntimeError,
  "visible-frame": visibleFrame,
  "frame-diff": frameDiff,
  "capability-status": capabilityStatus,
  "resource-released": resourceReleased
};
function runValidators(ids, snapshot, paramsById = {}) {
  return ids.map((id) => {
    const validator = VALIDATORS[id];
    if (!validator) {
      return { validatorId: id, state: "NOT_EVALUATED", detail: "unknown validator id" };
    }
    return validator.evaluate(snapshot, paramsById[id] ?? {});
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  VALIDATORS,
  animationPlaying,
  assetLoaded,
  capabilityStatus,
  frameDiff,
  materialProperty,
  noRuntimeError,
  nodeCount,
  nodeExists,
  resourceReleased,
  runValidators,
  sceneReady,
  transformEquals,
  visibleFrame
});
