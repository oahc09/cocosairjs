// src/air/app-config.ts
var registryKey = /* @__PURE__ */ Symbol.for("cocosair.bootstrap.v1");
function airBootstrapRegistry() {
  const globals = globalThis;
  return globals[registryKey] ?? (globals[registryKey] = { status: "idle" });
}
function airError(code, message) {
  return Object.assign(new Error(`[${code}] ${message}`), { code });
}
function normalizeAirOptions(options) {
  if (!options || typeof options !== "object")
    throw airError("AIR_E_APP_OPTIONS", "createAirApp requires an options object.");
  const physics = options.physics ?? "builtin", diagnostics = options.diagnostics ?? "errors";
  if (physics !== "builtin" && physics !== "cannon")
    throw airError("AIR_E_PHYSICS_BACKEND", "physics must be builtin or cannon.");
  if (diagnostics !== "errors" && diagnostics !== "warnings")
    throw airError("AIR_E_DIAGNOSTIC_MODE", "diagnostics must be errors or warnings.");
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
    throw airError(
      "AIR_E_CANVAS_CONFLICT",
      'Page already contains another element with id "GameCanvas"; select that canvas or remove the conflicting id.'
    );
  }
  const existingFrame = document.getElementById("GameDiv");
  const existingContainer = document.getElementById("Cocos3dGameContainer");
  if (existingFrame && !existingFrame.contains(canvas) || existingContainer && (!existingContainer.contains(canvas) || existingFrame && !existingFrame.contains(existingContainer))) {
    throw airError(
      "AIR_E_CONTAINER_CONFLICT",
      "Existing GameDiv/Cocos3dGameContainer must belong to the selected canvas."
    );
  }
  if (options.renderMode !== void 0 && ![0, 1, 2, 3].includes(options.renderMode)) {
    throw airError(
      "AIR_E_RENDER_MODE",
      "renderMode must be an engine render mode integer (0..3); browser startup requires WebGL 2."
    );
  }
  const legacyCap = Number(globalThis.__CCDPR_CAP__);
  const pixelRatioCap = options.pixelRatioCap ?? (Number.isFinite(legacyCap) && legacyCap > 0 ? legacyCap : 2);
  if (typeof pixelRatioCap !== "number" || !Number.isFinite(pixelRatioCap) || pixelRatioCap <= 0) {
    throw airError("AIR_E_PIXEL_RATIO_CAP", "pixelRatioCap must be a finite positive number.");
  }
  const resolution = options.designResolution;
  if (resolution !== void 0 && (!resolution || !Number.isFinite(resolution.width) || resolution.width <= 0 || !Number.isFinite(resolution.height) || resolution.height <= 0 || ![0, 1, 2, 3, 4].includes(resolution.policy))) {
    throw airError(
      "AIR_E_DESIGN_RESOLUTION",
      "designResolution requires finite positive width/height and a native policy integer (0..4)."
    );
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
    if (options.container === void 0) {
      const admitted = airBootstrapRegistry().options;
      container = admitted?.canvas === canvas && admitted.screenMode === "container" ? admitted.container : existingFrame ?? existingContainer?.parentElement ?? canvas.parentElement;
    }
    if (!(container instanceof HTMLElement) || container === document.body || container === document.documentElement || !container.contains(canvas) || container === canvas || container === existingContainer) {
      throw airError("AIR_E_CONTAINER", "Container must be an existing non-body ancestor of the canvas.");
    }
    const frame = document.getElementById("GameDiv");
    if (frame && (!frame.contains(canvas) || !container.contains(frame))) {
      throw airError(
        "AIR_E_CONTAINER_CONFLICT",
        "GameDiv must contain the canvas inside the selected container."
      );
    }
    const inner = document.getElementById("Cocos3dGameContainer");
    if (inner && (!inner.contains(canvas) || !container.contains(inner) || frame && !frame.contains(inner))) {
      throw airError("AIR_E_CONTAINER_CONFLICT", "Cocos3dGameContainer belongs to a different canvas or frame.");
    }
  }
  if (!context || typeof context !== "object" || context.autoPause !== void 0 && typeof context.autoPause !== "boolean" || context.reload !== void 0 && typeof context.reload !== "function" || context.onEvent !== void 0 && typeof context.onEvent !== "function") {
    throw airError(
      "AIR_E_CONTEXT_OPTIONS",
      "contextLoss requires optional boolean autoPause and function reload/onEvent."
    );
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
    contextLoss: Object.freeze({
      autoPause: context.autoPause ?? true,
      reload: context.reload,
      onEvent: context.onEvent
    })
  });
}
function equalAirOptions(a, b) {
  return a.canvas === b.canvas && a.renderMode === b.renderMode && a.physics === b.physics && a.diagnostics === b.diagnostics && a.pixelRatioCap === b.pixelRatioCap && a.screenMode === b.screenMode && a.container === b.container && a.designResolution?.width === b.designResolution?.width && a.designResolution?.height === b.designResolution?.height && a.designResolution?.policy === b.designResolution?.policy && a.contextLoss.autoPause === b.contextLoss.autoPause && a.contextLoss.reload === b.contextLoss.reload && a.contextLoss.onEvent === b.contextLoss.onEvent;
}
function admitAirOptions(options) {
  const state = airBootstrapRegistry();
  if (state.status === "closed")
    throw airError("AIR_E_APP_CLOSED", "This runtime is closed; reload the document before creating another app.");
  if (state.status === "failed")
    throw airError(
      "AIR_E_APP_RELOAD_REQUIRED",
      "Runtime initialization failed; reload the document before retrying."
    );
  if (state.options && !equalAirOptions(state.options, options)) {
    throw airError(
      "AIR_E_APP_CONFLICT",
      "An app already owns another canvas or configuration; reuse its options or reload the document."
    );
  }
  return state;
}
function requestAirApp(options, load) {
  try {
    const normalized = normalizeAirOptions(options), state = admitAirOptions(normalized);
    if (state.initPromise) return state.initPromise;
    const globals = globalThis;
    if (globals.__CC_CANVAS__ && globals.__CC_CANVAS__ !== normalized.canvas) {
      throw airError(
        "AIR_E_CANVAS_CONFLICT",
        "A different canvas was explicitly selected; reuse it or reload the document."
      );
    }
    state.options = normalized;
    state.status = "initializing";
    state.initPromise = Promise.resolve().then(load).then((initialize) => {
      globals.__CC_CANVAS__ = normalized.canvas;
      globals.__CCDPR_CAP__ = normalized.pixelRatioCap;
      return initialize(normalized);
    }).then(
      (app) => {
        state.app = app;
        state.status = "ready";
        return app;
      },
      (error) => {
        state.status = "failed";
        state.failure = error;
        throw error;
      }
    );
    return state.initPromise;
  } catch (error) {
    return Promise.reject(error);
  }
}

// src/air/html-source.ts
var canvasLeases = /* @__PURE__ */ new WeakMap();
var elementLeases = /* @__PURE__ */ new WeakSet();
function getAirHTMLSourceSupport(canvas) {
  const surface = canvas;
  if (typeof surface.requestPaint !== "function" || typeof surface.captureElementImage !== "function" || typeof surface.updateElementGeometry !== "function" || typeof surface.clearElementGeometry !== "function")
    return { supported: false, reason: "HTML-in-Canvas APIs unavailable; experimental browser support is required" };
  const gl = canvas.getContext("webgl2");
  return gl && typeof gl.texElementSubImage2D === "function" ? { supported: true, reason: null } : { supported: false, reason: "WebGL2 texElementSubImage2D unavailable" };
}
function createAirHTMLSource(options) {
  const { canvas, element, texture } = options, support = getAirHTMLSourceSupport(canvas);
  if (!support.supported) throw Object.assign(new Error(`AIR_E_HTML_SOURCE_UNSUPPORTED: ${support.reason}`), { code: "AIR_E_HTML_SOURCE_UNSUPPORTED" });
  const resolution = options.resolution ?? canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
  if (element.parentNode !== canvas || elementLeases.has(element) || !Number.isFinite(resolution) || resolution <= 0) throw new Error("AIR_E_HTML_SOURCE_OPTIONS: unique direct canvas child and positive resolution required");
  const surface = canvas, gl = canvas.getContext("webgl2");
  const lease = canvasLeases.get(canvas) ?? { count: 0, original: canvas.getAttribute("content"), layout: canvas.getAttribute("layoutsubtree") }, oldDrawable = element.getAttribute("drawable");
  lease.count++;
  canvasLeases.set(canvas, lease);
  elementLeases.add(element);
  canvas.setAttribute("content", "drawable");
  canvas.setAttribute("layoutsubtree", "");
  element.setAttribute("drawable", "");
  let disposed = false, pending = true, snapshot = null, failed = false;
  let status = "waiting", lastError = null, snapshotSize = null;
  const alive = () => {
    if (disposed) throw new Error("AIR_E_HTML_SOURCE_DISPOSED");
  };
  const paint = () => {
    if (disposed || failed || !pending && (options.autoUpdate === false || options.snapshot)) return;
    pending = false;
    try {
      if (gl.isContextLost()) throw new Error("AIR_E_HTML_SOURCE_CONTEXT_LOST");
      if (element.parentNode !== canvas) throw new Error("AIR_E_HTML_SOURCE_ELEMENT_MOVED");
      const width = snapshotSize?.[0] ?? Math.ceil(element.offsetWidth * resolution), height = snapshotSize?.[1] ?? Math.ceil(element.offsetHeight * resolution);
      if (width <= 0 || height <= 0) throw new Error("AIR_E_HTML_SOURCE_SIZE");
      if (texture.width !== width || texture.height !== height) texture.reset({ width, height, mipmapLevel: 1 });
      const target = texture.getGFXTexture();
      const gpu = target?.gpuTexture;
      if (!gpu?.glTexture || !gl.isTexture(gpu.glTexture) || gpu.glTarget !== gl.TEXTURE_2D || gpu.mipLevel !== 1 || gpu.glFormat !== gl.RGBA || gpu.glType !== gl.UNSIGNED_BYTE)
        throw new Error("AIR_E_HTML_SOURCE_TEXTURE: native single-mip RGBA8 WebGL2 Texture2D required");
      if (options.snapshot && !snapshot) {
        snapshot = surface.captureElementImage(element);
        snapshotSize = [width, height];
      }
      const previous = gl.getParameter(gl.TEXTURE_BINDING_2D);
      try {
        gl.bindTexture(gl.TEXTURE_2D, gpu.glTexture);
        gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, snapshot ?? element, { width, height });
      } finally {
        gl.bindTexture(gl.TEXTURE_2D, previous);
      }
      const error = gl.getError();
      if (error !== gl.NO_ERROR) throw new Error(`AIR_E_HTML_SOURCE_UPLOAD: WebGL error ${error}`);
      status = "ready";
      lastError = null;
      options.onUpdate?.();
    } catch (error) {
      failed = true;
      status = "failed";
      lastError = error;
      options.onError?.(error);
    }
  };
  canvas.addEventListener("paint", paint);
  surface.requestPaint();
  return {
    texture,
    get status() {
      return status;
    },
    get error() {
      return lastError;
    },
    update() {
      alive();
      failed = false;
      pending = true;
      status = "waiting";
      surface.requestPaint();
    },
    updateGeometry(geometry) {
      alive();
      surface.updateElementGeometry(snapshot ?? element, geometry);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      status = "disposed";
      canvas.removeEventListener("paint", paint);
      let cleanupError = null;
      try {
        surface.clearElementGeometry(snapshot ?? element);
      } catch (error) {
        cleanupError = error;
      }
      try {
        snapshot?.close();
      } catch (error) {
        cleanupError = cleanupError ?? error;
      }
      snapshot = null;
      elementLeases.delete(element);
      lease.count--;
      if (element.getAttribute("drawable") === "") {
        if (oldDrawable === null) element.removeAttribute("drawable");
        else element.setAttribute("drawable", oldDrawable);
      }
      if (lease.count === 0) {
        canvasLeases.delete(canvas);
        if (canvas.getAttribute("content") === "drawable") {
          if (lease.original === null) canvas.removeAttribute("content");
          else canvas.setAttribute("content", lease.original);
        }
        if (canvas.getAttribute("layoutsubtree") === "") {
          if (lease.layout === null) canvas.removeAttribute("layoutsubtree");
          else canvas.setAttribute("layoutsubtree", lease.layout);
        }
      }
      if (cleanupError) throw cleanupError;
    }
  };
}

// src/air/safe-bootstrap.ts
function createAirApp(options) {
  return requestAirApp(options, async () => {
    await import("./cocosair.module.js");
    const initialize = airBootstrapRegistry().initialize;
    if (!initialize) throw airError("AIR_E_RUNTIME_ENTRY", "The loaded runtime did not register its initializer.");
    return initialize;
  });
}
export {
  createAirApp,
  createAirHTMLSource,
  getAirHTMLSourceSupport
};
//# sourceMappingURL=bootstrap.js.map
