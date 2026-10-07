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
export {
  createAirHTMLSource,
  getAirHTMLSourceSupport
};
//# sourceMappingURL=html-source.js.map
