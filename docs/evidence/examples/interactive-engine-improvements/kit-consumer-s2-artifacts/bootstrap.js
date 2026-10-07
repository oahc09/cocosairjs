// C:/Users/caosh/AppData/Local/Temp/ier-installed-kit-ZHyN8h/node_modules/cocosair.js/build/npm/bootstrap.js
var registryKey = /* @__PURE__ */ Symbol.for("cocosair.bootstrap.v1");
function airBootstrapRegistry() {
  const globals = globalThis;
  return globals[registryKey] ?? (globals[registryKey] = { status: "idle" });
}
function airError(code, message) {
  return Object.assign(new Error(`[${code}] ${message}`), { code });
}
function normalizeAirOptions(options) {
  if (!options || typeof options !== "object") throw airError("AIR_E_APP_OPTIONS", "createAirApp requires an options object.");
  const physics = options.physics ?? "builtin", diagnostics = options.diagnostics ?? "errors";
  if (physics !== "builtin" && physics !== "cannon") throw airError("AIR_E_PHYSICS_BACKEND", "physics must be builtin or cannon.");
  if (diagnostics !== "errors" && diagnostics !== "warnings") throw airError("AIR_E_DIAGNOSTIC_MODE", "diagnostics must be errors or warnings.");
  if (typeof document === "undefined" || typeof HTMLCanvasElement === "undefined") {
    throw airError("AIR_E_CANVAS", "createAirApp requires a browser document and canvas.");
  }
  let canvas = options.canvas;
  if (typeof canvas === "string") {
    try {
      canvas = document.querySelector(canvas);
    } catch {
      throw airError("AIR_E_CANVAS", `Invalid canvas selector '${options.canvas}'.`);
    }
  }
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw airError("AIR_E_CANVAS", `Canvas '${options.canvas}' did not match a <canvas> element.`);
  }
  const decoy = document.getElementById("GameCanvas");
  if (decoy && decoy !== canvas) {
    throw airError("AIR_E_CANVAS_CONFLICT", 'Page already contains another element with id "GameCanvas"; select that canvas or remove the conflicting id.');
  }
  if (options.renderMode !== void 0 && ![0, 1, 2, 3].includes(options.renderMode)) {
    throw airError("AIR_E_RENDER_MODE", "renderMode must be an engine render mode integer (0..3); browser startup requires WebGL 2.");
  }
  const legacyCap = Number(globalThis.__CCDPR_CAP__);
  const pixelRatioCap = options.pixelRatioCap ?? (Number.isFinite(legacyCap) && legacyCap > 0 ? legacyCap : 2);
  if (typeof pixelRatioCap !== "number" || !Number.isFinite(pixelRatioCap) || pixelRatioCap <= 0) {
    throw airError("AIR_E_PIXEL_RATIO_CAP", "pixelRatioCap must be a finite positive number.");
  }
  const resolution = options.designResolution;
  if (resolution !== void 0 && (!resolution || !Number.isFinite(resolution.width) || resolution.width <= 0 || !Number.isFinite(resolution.height) || resolution.height <= 0 || ![0, 1, 2, 3, 4].includes(resolution.policy))) {
    throw airError("AIR_E_DESIGN_RESOLUTION", "designResolution requires finite positive width/height and a native policy integer (0..4).");
  }
  const context = options.contextLoss ?? {};
  if (options.screenMode !== void 0 && !["window", "container"].includes(options.screenMode)) {
    throw airError("AIR_E_SCREEN_MODE", "screenMode must be window or container.");
  }
  if (options.container !== void 0 && options.screenMode !== "container") {
    throw airError("AIR_E_CONTAINER", "container requires screenMode: container.");
  }
  let container = options.container;
  if (typeof container === "string") {
    try {
      container = document.querySelector(container);
    } catch {
      throw airError("AIR_E_CONTAINER", "Invalid container selector.");
    }
  }
  if (options.screenMode === "container") {
    if (options.container === void 0) container = document.getElementById("GameDiv") ?? canvas.parentElement;
    if (!(container instanceof HTMLElement) || container === document.body || container === document.documentElement || !container.contains(canvas) || container === canvas) {
      throw airError("AIR_E_CONTAINER", "Container must be an existing non-body ancestor of the canvas.");
    }
    const frame = document.getElementById("GameDiv");
    if (frame && (!frame.contains(canvas) || !container.contains(frame))) {
      throw airError("AIR_E_CONTAINER_CONFLICT", "GameDiv must contain the canvas inside the selected container.");
    }
    const inner = document.getElementById("Cocos3dGameContainer");
    if (inner && (!inner.contains(canvas) || !container.contains(inner) || frame && !frame.contains(inner))) {
      throw airError("AIR_E_CONTAINER_CONFLICT", "Cocos3dGameContainer belongs to a different canvas or frame.");
    }
  }
  if (!context || typeof context !== "object" || context.autoPause !== void 0 && typeof context.autoPause !== "boolean" || context.reload !== void 0 && typeof context.reload !== "function" || context.onEvent !== void 0 && typeof context.onEvent !== "function") {
    throw airError("AIR_E_CONTEXT_OPTIONS", "contextLoss requires optional boolean autoPause and function reload/onEvent.");
  }
  return Object.freeze({
    canvas,
    renderMode: options.renderMode ?? 0,
    physics,
    diagnostics,
    pixelRatioCap,
    screenMode: options.screenMode,
    container,
    designResolution: resolution && Object.freeze({ width: resolution.width, height: resolution.height, policy: resolution.policy }),
    contextLoss: Object.freeze({ autoPause: context.autoPause ?? true, reload: context.reload, onEvent: context.onEvent })
  });
}
function equalAirOptions(a, b) {
  return a.canvas === b.canvas && a.renderMode === b.renderMode && a.physics === b.physics && a.diagnostics === b.diagnostics && a.pixelRatioCap === b.pixelRatioCap && a.screenMode === b.screenMode && a.container === b.container && a.designResolution?.width === b.designResolution?.width && a.designResolution?.height === b.designResolution?.height && a.designResolution?.policy === b.designResolution?.policy && a.contextLoss.autoPause === b.contextLoss.autoPause && a.contextLoss.reload === b.contextLoss.reload && a.contextLoss.onEvent === b.contextLoss.onEvent;
}
function prepareAirContainer(options) {
  if (options.screenMode !== "container") return void 0;
  let frame = document.getElementById("GameDiv");
  if (!frame) {
    frame = document.createElement("div");
    frame.id = "GameDiv";
    frame.style.width = "100%";
    frame.style.height = "100%";
    options.canvas.parentElement.insertBefore(frame, options.canvas);
    frame.appendChild(options.canvas);
  }
  let inner = document.getElementById("Cocos3dGameContainer");
  if (inner && (!frame.contains(inner) || !inner.contains(options.canvas))) {
    throw airError("AIR_E_CONTAINER_CONFLICT", "Cocos3dGameContainer must contain the canvas inside GameDiv.");
  }
  if (!inner) {
    inner = document.createElement("div");
    inner.id = "Cocos3dGameContainer";
    inner.style.width = "100%";
    inner.style.height = "100%";
    options.canvas.parentElement.insertBefore(inner, options.canvas);
    inner.appendChild(options.canvas);
  }
  options.canvas.style.width = "100%";
  options.canvas.style.height = "100%";
  options.canvas.style.display = "block";
  if (frame.clientWidth <= 0 || frame.clientHeight <= 0) {
    throw airError("AIR_E_CONTAINER_SIZE", "Container must have a positive layout size at startup; show it before createAirApp.");
  }
  return frame;
}
function admitAirOptions(options) {
  const state = airBootstrapRegistry();
  if (state.status === "closed") throw airError("AIR_E_APP_CLOSED", "This runtime is closed; reload the document before creating another app.");
  if (state.status === "failed") throw airError("AIR_E_APP_RELOAD_REQUIRED", "Runtime initialization failed; reload the document before retrying.");
  if (state.options && !equalAirOptions(state.options, options)) {
    throw airError("AIR_E_APP_CONFLICT", "An app already owns another canvas or configuration; reuse its options or reload the document.");
  }
  return state;
}
function createAirApp(options) {
  try {
    const normalized = normalizeAirOptions(options), state = admitAirOptions(normalized);
    if (state.initPromise) return state.initPromise;
    if (state.loadPromise) return state.loadPromise;
    prepareAirContainer(normalized);
    state.options = normalized;
    state.status = "initializing";
    const globals = globalThis;
    globals.__CC_CANVAS__ = normalized.canvas;
    globals.__CCDPR_CAP__ = normalized.pixelRatioCap;
    state.loadPromise = import("./cocosair.module-EIMOUO42.js").then((runtime) => runtime.createAirApp(normalized)).catch((error) => {
      state.status = "failed";
      state.failure = error;
      throw error;
    });
    return state.loadPromise;
  } catch (error) {
    return Promise.reject(error);
  }
}
export {
  createAirApp
};
