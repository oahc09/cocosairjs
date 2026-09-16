// tools/debug/agent-session.ts
import * as cc from "cocosair";

// tools/verify/runtime-assets.js
function inspectRuntimeAssets(root, types, collections = {}) {
  const { Node: Node2, Mesh, Material, Texture2D, Skeleton, AnimationClip, MeshRenderer: MeshRenderer2, SkinnedMeshRenderer: SkinnedMeshRenderer2, Animation: Animation2 } = types;
  const resources = [];
  const references = [];
  const diagnostics = [];
  const unchecked = [];
  const ids = /* @__PURE__ */ new Map();
  const counts = {};
  const issue = (code, location, message) => diagnostics.push({ code, location, message });
  function record(object, kind, location) {
    if (!object) {
      issue("MISSING_DEPENDENCY", location, `Missing ${kind}`);
      return null;
    }
    const ctor = types[kind];
    if (ctor && !(object instanceof ctor)) {
      issue("TYPE_MISMATCH", location, `Expected ${kind}`);
      return null;
    }
    if (!ids.has(object)) {
      counts[kind] = (counts[kind] || 0) + 1;
      const id = `${kind}:${counts[kind]}`;
      ids.set(object, id);
      const valid = types.isValid ? types.isValid(object, true) : object.isValid !== false;
      resources.push({ id, kind, name: object.name || "", valid });
      if (!valid) issue("DESTROYED_RESOURCE", location, `${id} is destroyed or pending destruction`);
    }
    return ids.get(object);
  }
  function reference(owner, field, object, kind) {
    const target = record(object, kind, `${owner}.${field}`);
    references.push({ owner, field, target });
    return target;
  }
  function inspectMaterial(material, location) {
    const id = record(material, "Material", location);
    if (!id) return;
    if (!material.effectAsset) issue("MISSING_EFFECT", location, "Material has no effect");
    const names = /* @__PURE__ */ new Set();
    for (const pass of material.passes) for (const name of Object.keys(pass.properties || {})) names.add(name);
    for (const name of names) {
      const property = material.getProperty(name);
      const values = Array.isArray(property) ? property : [property];
      for (const value of values) {
        if (value instanceof Texture2D) reference(id, name, value, "Texture2D");
      }
    }
    unchecked.push({ location: id, reason: "Only explicitly assigned Texture2D properties are visible; builtin/default sampler bindings are not inferred." });
  }
  function inspectClip(clip, node, location) {
    if (!record(clip, "AnimationClip", location)) return;
    let index = 0;
    for (const track of clip.tracks) {
      let target = node;
      let unknown = false;
      for (let i = 0; i < track.path.length; i++) {
        if (target == null) break;
        if (track.path.isHierarchyAt(i)) {
          const path = track.path.parseHierarchyAt(i);
          target = target instanceof Node2 ? path ? target.getChildByPath(path) : target : void 0;
        } else if (track.path.isComponentAt(i)) {
          target = target instanceof Node2 ? target.getComponent(track.path.parseComponentAt(i)) : void 0;
        } else if (track.path.isPropertyAt(i)) {
          target = target[track.path.parsePropertyAt(i)];
        } else if (track.path.isElementAt(i)) {
          target = target[track.path.parseElementAt(i)];
        } else {
          unknown = true;
          break;
        }
      }
      const trackLocation = `${location}.tracks[${index++}]`;
      if (unknown) unchecked.push({ location: trackLocation, reason: "Custom track path resolver cannot be checked without executing it." });
      else if (target == null) issue("ANIMATION_TARGET", trackLocation, "Animation target cannot be resolved");
      if (track.proxy) unchecked.push({ location: trackLocation, reason: "Custom value proxy execution is outside read-only inspection." });
    }
  }
  if (!(root instanceof Node2)) {
    issue("TYPE_MISMATCH", "root", "Expected Node");
  } else {
    const visit = (node) => {
      const id = record(node, "Node", node.name);
      for (const renderer of node.getComponents(MeshRenderer2)) {
        reference(id, "mesh", renderer.mesh, "Mesh");
        const slots = renderer.mesh ? renderer.mesh.struct.primitives.length : renderer.sharedMaterials.length;
        for (let slot = 0; slot < slots; slot++) {
          const material = renderer.sharedMaterials[slot];
          reference(id, `materials[${slot}]`, material, "Material");
          if (material instanceof Material) inspectMaterial(material, `${id}.materials[${slot}]`);
        }
        if (renderer instanceof SkinnedMeshRenderer2) {
          const skeleton = renderer.skeleton;
          reference(id, "skeleton", skeleton, "Skeleton");
          reference(id, "skinningRoot", renderer.skinningRoot, "Node");
          if (skeleton instanceof Skeleton) {
            if (skeleton.joints.length !== skeleton.bindposes.length) issue("BINDPOSE_COUNT", id, "Joint and bindpose counts differ");
            skeleton.joints.forEach((path, joint) => {
              const base = renderer.skinningRoot;
              if (!base || !(path ? base.getChildByPath(path) : base)) {
                issue("JOINT_REFERENCE", `${id}.joints[${joint}]`, `Unresolved joint '${path}'`);
              }
            });
          }
        }
      }
      for (const animation of node.getComponents(Animation2)) {
        animation.clips.forEach((clip, index) => inspectClip(clip, node, `${id}.clips[${index}]`));
      }
      for (const child of node.children) {
        references.push({ owner: id, field: "child", target: record(child, "Node", child.name) });
        visit(child);
      }
    };
    visit(root);
  }
  for (const [key, kind] of Object.entries({ meshes: "Mesh", materials: "Material", textures: "Texture2D", skeletons: "Skeleton", animations: "AnimationClip" })) {
    if (!collections[key]) continue;
    Array.from(collections[key]).forEach((asset, index) => record(asset, kind, `${key}[${index}]`));
  }
  return { ok: diagnostics.length === 0, counts, resources, references, diagnostics, unchecked };
}

// tools/debug/agent-session.ts
var AgentSessionError = class extends Error {
  constructor(code, message, cause) {
    super(message);
    this.code = code;
    this.cause = cause;
    this.name = "AgentSessionError";
  }
};
var OPERATION_ACTIONS = /* @__PURE__ */ new Set(["createNode", "addComponent", "setTransform", "loadAsset", "instantiateAsset"]);
var COMPONENT_WHITELIST = {
  MeshRenderer: cc.MeshRenderer,
  Camera: cc.Camera,
  DirectionalLight: cc.DirectionalLight,
  PointLight: cc.PointLight,
  SphereLight: cc.SphereLight,
  SpotLight: cc.SpotLight,
  Animation: cc.Animation
};
var DEFAULT_ERROR_LIMIT = 200;
var DEFAULT_REQUEST_WINDOW = 256;
var DEFAULT_CAPTURE_TIMEOUT = 5e3;
var INSPECT_ROWS_LIMIT = 500;
var REQUEST_RETENTION_MS = 6e4;
var collectors = /* @__PURE__ */ new WeakMap();
var Collector = class _Collector {
  constructor(limit) {
    this.limit = limit;
    this.entries = [];
    this.owners = /* @__PURE__ */ new Set();
    this.hook = null;
    this.seq = 0;
    this.dropped = 0;
  }
  static for(app, limit) {
    const key = app.canvas;
    let collector = collectors.get(key);
    if (!collector) {
      collector = new _Collector(limit);
      collectors.set(key, collector);
    }
    return collector;
  }
  attach(session) {
    this.owners.add(session);
    if (this.owners.size > 1 && this.hook) {
      return;
    }
    const ownership = { subscribers: /* @__PURE__ */ new Set(), ownedListeners: [], ownedContextWrap: null };
    const push = (category, message, source, requestId) => {
      this.emit({ seq: ++this.seq, time: (/* @__PURE__ */ new Date()).toISOString(), category, message, source, requestId });
    };
    if (window.__airErrorHub) {
      const unsubscribe = window.__airErrorHub.subscribe((entry) => {
        const known = entry.category;
        const category = known === "shader" || known === "link" || known === "unhandled-rejection" ? known : "window-error";
        push(category, entry.message, entry.source);
      });
      ownership.subscribers.add(unsubscribe);
    } else {
      const onError = ((event) => {
        const isResource = event.target && event.target.tagName;
        push("window-error", isResource ? `RESOURCE: ${event.target.src || event.target.tagName}` : String(event.error && event.error.stack || event.message).slice(0, 600));
      });
      const onRejection = ((event) => {
        push("unhandled-rejection", String(event.reason && (event.reason.stack || event.reason) || event.reason).slice(0, 600));
      });
      window.addEventListener("error", onError, true);
      window.addEventListener("unhandledrejection", onRejection);
      ownership.ownedListeners.push({ target: window, type: "error", fn: onError, capture: true });
      ownership.ownedListeners.push({ target: window, type: "unhandledrejection", fn: onRejection, capture: false });
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...rest) {
        const gl = original.apply(this, [type, ...rest]);
        if (!gl || typeof type !== "string" || type.indexOf("webgl") !== 0 || gl.__agentObserved) {
          return gl;
        }
        gl.__agentObserved = true;
        const check = (queryName, statusName, logName, category) => {
          const query = gl[queryName];
          gl[queryName] = (object, parameter) => {
            const okResult = query.call(gl, object, parameter);
            if (parameter === gl[statusName] && !okResult) {
              push(category, String(gl[logName](object)).slice(0, 600));
            }
            return okResult;
          };
        };
        check("getShaderParameter", "COMPILE_STATUS", "getShaderInfoLog", "shader");
        check("getProgramParameter", "LINK_STATUS", "getProgramInfoLog", "link");
        return gl;
      };
      ownership.ownedContextWrap = { original };
    }
    this.hook = ownership;
  }
  detach(session) {
    this.owners.delete(session);
    if (this.owners.size > 0 || !this.hook) {
      return;
    }
    const { ownedListeners, ownedContextWrap, subscribers } = this.hook;
    for (const unsub of subscribers) {
      unsub();
    }
    for (const { target, type, fn, capture } of ownedListeners) {
      target.removeEventListener(type, fn, capture);
    }
    if (ownedContextWrap) {
      HTMLCanvasElement.prototype.getContext = ownedContextWrap.original;
    }
    this.hook = null;
  }
  /** 唤醒等待中的 session（getRuntimeErrors 是拉取式，这里仅统一入口）。 */
  emit(entry) {
    this.entries.push(entry);
    while (this.entries.length > this.limit) {
      this.entries.shift();
      this.dropped++;
    }
  }
  /** session 自己的加载失败也进入缓冲（category session-load）。 */
  noteSessionLoad(message, requestId) {
    this.emit({ seq: ++this.seq, time: (/* @__PURE__ */ new Date()).toISOString(), category: "session-load", message, requestId });
  }
  list({ since, limit }) {
    let source = this.entries;
    if (since !== void 0) {
      source = this.entries.filter((e) => e.seq > since);
    }
    const capped = limit !== void 0 ? source.slice(-limit) : source.slice();
    return { errors: capped, dropped: this.dropped };
  }
  clear() {
    this.entries.length = 0;
    this.dropped = 0;
  }
};
var sceneIds = /* @__PURE__ */ new WeakMap();
var sceneIdCounter = 0;
var AgentSessionImpl = class _AgentSessionImpl {
  constructor(options) {
    this.options = options;
    this.closed = false;
    this.idCounter = 0;
    this.nodeIds = /* @__PURE__ */ new Map();
    this.nodesById = /* @__PURE__ */ new Map();
    this.componentIds = /* @__PURE__ */ new Map();
    this.assetIds = /* @__PURE__ */ new Map();
    this.assetsById = /* @__PURE__ */ new Map();
    this.ownedNodes = /* @__PURE__ */ new Set();
    this.ownedInstances = [];
    this.ownedAssets = /* @__PURE__ */ new Set();
    this.requestLog = /* @__PURE__ */ new Map();
    this.queue = Promise.resolve();
    this.captureSeq = 0;
    /** 进行中的 captureFrame：close 时取消监听/定时器并拒绝（§6.3 生命周期）。 */
    this.pendingCaptures = /* @__PURE__ */ new Set();
    this.id = `agent-session-${++_AgentSessionImpl.counter}`;
    this.collector = Collector.for(options.app, options.errorBufferLimit ?? DEFAULT_ERROR_LIMIT);
    this.collector.attach(this);
  }
  static {
    this.counter = 0;
  }
  /** 显式可写范围；未列出 = 只读观察。 */
  isWritable(node) {
    const writable = this.options.writableScenes ?? [];
    for (const scene of writable) {
      let cursor = node;
      while (cursor) {
        if (cursor === scene) {
          return true;
        }
        cursor = cursor.parent;
      }
    }
    return false;
  }
  requireOpen() {
    if (this.closed) {
      throw new AgentSessionError("SESSION_CLOSED", `session ${this.id} is closed`);
    }
  }
  /** 当前运行场景；未运行/已替换由可达性检查兜底。 */
  currentScene() {
    const scene = this.options.app.getScene();
    if (!scene) {
      throw new AgentSessionError("STALE_TARGET", "no running scene");
    }
    return scene;
  }
  reachable(node) {
    let cursor = node;
    const scene = this.currentScene();
    while (cursor) {
      if (cursor === scene) {
        return true;
      }
      cursor = cursor.parent;
    }
    return false;
  }
  // ---- ID 注册（session 内稳定；对象键，同名不同 ID）----
  nodeId(node) {
    let id = this.nodeIds.get(node);
    if (!id) {
      id = `node-${++this.idCounter}`;
      this.nodeIds.set(node, id);
      this.nodesById.set(id, node);
    }
    return id;
  }
  componentId(component) {
    let id = this.componentIds.get(component);
    if (!id) {
      id = `comp-${++this.idCounter}`;
      this.componentIds.set(component, id);
    }
    return id;
  }
  assetId(asset) {
    let id = this.assetIds.get(asset);
    if (!id) {
      id = `asset-${++this.idCounter}`;
      this.assetIds.set(asset, id);
      this.assetsById.set(id, asset);
    }
    return id;
  }
  /** 按 ID 取有效且仍在当前场景树中的节点；否则 STALE_TARGET（并回收 ID）。 */
  nodeById(targetId) {
    if (!targetId) {
      throw new AgentSessionError("INVALID_ARGUMENT", "targetId is required");
    }
    const node = this.nodesById.get(targetId);
    if (!node || !cc.isValid(node, true)) {
      this.nodesById.delete(targetId);
      if (node) {
        this.nodeIds.delete(node);
      }
      throw new AgentSessionError("STALE_TARGET", `unknown or destroyed target: ${targetId}`);
    }
    if (!this.reachable(node)) {
      throw new AgentSessionError("STALE_TARGET", `target ${targetId} is not in the running scene (scene replaced?)`);
    }
    return node;
  }
  static number3(value, field) {
    if (!Array.isArray(value) || value.length !== 3 || value.some((v) => typeof v !== "number" || !Number.isFinite(v))) {
      throw new AgentSessionError("INVALID_ARGUMENT", `${field} must be [x, y, z] finite numbers`);
    }
    return value;
  }
  // ---- 观察（§5）----
  inspectScene() {
    this.requireOpen();
    const scene = this.currentScene();
    let sceneId = sceneIds.get(scene);
    if (!sceneId) {
      sceneId = `scene-${++sceneIdCounter}`;
      sceneIds.set(scene, sceneId);
    }
    const componentsByType = {};
    let nodeCount = 0;
    let componentCount = 0;
    let cameraCount = 0;
    let lightCount = 0;
    let rendererCount = 0;
    const nodes = [];
    let truncated = false;
    const visit = (node, parentId) => {
      nodeCount++;
      for (const component of node.components) {
        componentCount++;
        const type = component.constructor.name;
        componentsByType[type] = (componentsByType[type] || 0) + 1;
        if (component instanceof cc.Camera) {
          cameraCount++;
        }
        if (component instanceof cc.DirectionalLight || component instanceof cc.SphereLight || component instanceof cc.SpotLight || component instanceof cc.PointLight) {
          lightCount++;
        }
        if (component instanceof cc.MeshRenderer || component instanceof cc.SkinnedMeshRenderer) {
          rendererCount++;
        }
      }
      const id = this.nodeId(node);
      if (nodes.length < INSPECT_ROWS_LIMIT) {
        nodes.push({ id, name: node.name, parentId });
      } else {
        truncated = true;
      }
      for (const child of node.children) {
        visit(child, id);
      }
    };
    visit(scene, null);
    const report = inspectRuntimeAssets(scene, cc);
    const byKind = report.counts;
    const total = Object.values(byKind).reduce((sum, n) => sum + n, 0);
    return {
      sceneId,
      name: scene.name || "",
      nodeCount,
      componentCount,
      componentsByType,
      cameraCount,
      lightCount,
      rendererCount,
      uniqueAssetCount: { total, byKind },
      nodes,
      truncated: truncated || report.resources.length > INSPECT_ROWS_LIMIT
    };
  }
  inspectNode(targetId) {
    this.requireOpen();
    const node = this.nodeById(targetId);
    const parent = node.parent;
    const euler = node.eulerAngles;
    const world = node.worldPosition;
    return {
      id: this.nodeId(node),
      name: node.name,
      parentId: parent ? this.nodeId(parent) : null,
      childrenIds: node.children.map((child) => this.nodeId(child)),
      active: node.activeInHierarchy,
      activeSelf: node.active,
      components: node.components.map((component) => ({
        id: this.componentId(component),
        type: component.constructor.name,
        enabled: component.enabledInHierarchy
      })),
      local: {
        position: [node.position.x, node.position.y, node.position.z],
        rotationEuler: [euler.x, euler.y, euler.z],
        scale: [node.scale.x, node.scale.y, node.scale.z]
      },
      world: { position: [world.x, world.y, world.z] }
    };
  }
  inspectAsset() {
    this.requireOpen();
    const scene = this.currentScene();
    const sessionCollections = { meshes: /* @__PURE__ */ new Set(), materials: /* @__PURE__ */ new Set(), textures: /* @__PURE__ */ new Set(), skeletons: /* @__PURE__ */ new Set(), animations: /* @__PURE__ */ new Set() };
    for (const asset of this.assetIds.keys()) {
      const owned = asset.owned;
      if (!owned) {
        continue;
      }
      const kindMap = [
        ["meshes", "meshes"],
        ["materials", "materials"],
        ["textures", "textures"],
        ["skeletons", "skeletons"],
        ["animations", "animations"]
      ];
      for (const [field, kind] of kindMap) {
        for (const item of owned[field] ?? []) {
          sessionCollections[kind].add(item);
        }
      }
    }
    const report = inspectRuntimeAssets(scene, cc, sessionCollections);
    const truncated = report.resources.length > INSPECT_ROWS_LIMIT;
    return {
      ok: report.ok,
      counts: report.counts,
      resources: truncated ? report.resources.slice(0, INSPECT_ROWS_LIMIT) : report.resources,
      references: truncated ? report.references.slice(0, INSPECT_ROWS_LIMIT) : report.references,
      diagnostics: report.diagnostics,
      unchecked: report.unchecked,
      truncated
    };
  }
  // ---- captureFrame（§6.3）----
  captureFrame() {
    this.requireOpen();
    const sceneAtRequest = this.currentScene();
    const canvas = this.options.app.canvas;
    return new Promise((resolve, reject) => {
      const pending = {
        cancel: () => {
          this.pendingCaptures.delete(pending);
          cc.director.off(cc.Director.EVENT_AFTER_DRAW, onDraw);
          clearTimeout(timer);
        },
        reject: (error) => {
          pending.cancel();
          reject(error);
        }
      };
      const timer = setTimeout(() => {
        pending.reject(new AgentSessionError(
          "CAPTURE_FAILED",
          `no rendered frame within ${this.options.captureTimeoutMs ?? DEFAULT_CAPTURE_TIMEOUT}ms`
        ));
      }, this.options.captureTimeoutMs ?? DEFAULT_CAPTURE_TIMEOUT);
      const onDraw = () => {
        try {
          if (this.closed) {
            pending.reject(new AgentSessionError("SESSION_CLOSED", `session ${this.id} is closed`));
            return;
          }
          if (this.currentScene() !== sceneAtRequest) {
            pending.reject(new AgentSessionError("CAPTURE_FAILED", "scene replaced between request and draw"));
            return;
          }
          pending.cancel();
          const sceneId = sceneIds.get(sceneAtRequest) ?? `scene:${sceneAtRequest.name}`;
          const png = canvas.toDataURL("image/png");
          if (!png || !png.startsWith("data:image/png")) {
            throw new Error("canvas produced no PNG data");
          }
          resolve({
            png,
            width: canvas.width,
            height: canvas.height,
            sceneId,
            frameIndex: ++this.captureSeq,
            sampledAt: (/* @__PURE__ */ new Date()).toISOString()
          });
        } catch (error) {
          pending.cancel();
          reject(new AgentSessionError(
            "CAPTURE_FAILED",
            `frame capture failed: ${error instanceof Error ? error.message : String(error)}`
          ));
        }
      };
      this.pendingCaptures.add(pending);
      cc.director.on(cc.Director.EVENT_AFTER_DRAW, onDraw);
    });
  }
  // ---- 错误收集（§6.4）----
  getRuntimeErrors(query) {
    this.requireOpen();
    if (query?.since !== void 0 && (!Number.isFinite(query.since) || query.since < 0)) {
      throw new AgentSessionError("INVALID_ARGUMENT", "since must be a non-negative seq number");
    }
    if (query?.limit !== void 0 && (!Number.isInteger(query.limit) || query.limit <= 0)) {
      throw new AgentSessionError("INVALID_ARGUMENT", "limit must be a positive integer");
    }
    return this.collector.list(query ?? {});
  }
  clearRuntimeErrors() {
    this.requireOpen();
    this.collector.clear();
  }
  // ---- 操作分发（§6.2）----
  dispatch(request) {
    if (this.closed) {
      return Promise.resolve(this.failure(request, new AgentSessionError("SESSION_CLOSED", `session ${this.id} is closed`)));
    }
    if (!request || typeof request.requestId !== "string" || !request.requestId || typeof request.action !== "string" || !request.action) {
      return Promise.resolve(this.failure(request, new AgentSessionError("INVALID_ARGUMENT", "requestId and action are required strings")));
    }
    const existing = this.requestLog.get(request.requestId);
    const now = Date.now();
    if (existing && (existing.status === "running" || now - existing.settledAt < REQUEST_RETENTION_MS)) {
      return Promise.resolve(this.failure(request, new AgentSessionError(
        "INVALID_ARGUMENT",
        `requestId '${request.requestId}' is ${existing.status === "running" ? "already executing" : "within the retention window"}; do not blind-retry create/addComponent`
      )));
    }
    for (const [key, record] of this.requestLog) {
      if (record.status === "done" && now - record.settledAt >= REQUEST_RETENTION_MS) {
        this.requestLog.delete(key);
      }
    }
    if (this.requestLog.size >= (this.options.requestIdWindow ?? DEFAULT_REQUEST_WINDOW) * 2) {
      const oldest = this.requestLog.keys().next().value;
      if (oldest !== void 0) {
        this.requestLog.delete(oldest);
      }
    }
    this.requestLog.set(request.requestId, { status: "running", settledAt: now });
    const run = this.queue.then(() => this.execute(request));
    this.queue = run.then(() => void 0, () => void 0);
    return run.then(
      (result) => {
        this.markDone(request.requestId);
        return { requestId: request.requestId, ok: true, result };
      },
      (error) => {
        this.markDone(request.requestId);
        if (error instanceof AgentSessionError) {
          return this.failure(request, error);
        }
        return {
          requestId: request.requestId,
          ok: false,
          error: { code: "LOAD_FAILED", message: error instanceof Error ? error.message : String(error) }
        };
      }
    );
  }
  markDone(requestId) {
    const record = this.requestLog.get(requestId);
    if (record) {
      record.status = "done";
      record.settledAt = Date.now();
    }
  }
  failure(request, error) {
    const cause = error.cause ?? void 0;
    return {
      requestId: request?.requestId ?? "",
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...cause && typeof cause === "object" && "code" in cause ? { cause: { code: String(cause.code), message: String(cause.message ?? "") } } : {}
      }
    };
  }
  async execute(request) {
    this.requireOpen();
    const { action } = request;
    if (!OPERATION_ACTIONS.has(action)) {
      throw new AgentSessionError("UNSUPPORTED_ACTION", `unknown action: ${action}`);
    }
    switch (action) {
      case "createNode":
        return this.opCreateNode(request);
      case "addComponent":
        return this.opAddComponent(request);
      case "setTransform":
        return this.opSetTransform(request);
      case "loadAsset":
        return this.opLoadAsset(request);
      case "instantiateAsset":
        return this.opInstantiateAsset(request);
      default:
        throw new AgentSessionError("UNSUPPORTED_ACTION", `unknown action: ${action}`);
    }
  }
  opCreateNode(request) {
    const params = request.params ?? {};
    const parent = this.nodeById(request.targetId ?? (typeof params.parentId === "string" ? params.parentId : void 0));
    if (!this.isWritable(parent)) {
      throw new AgentSessionError("OUT_OF_SCOPE", "parent node is not in the writable scope");
    }
    const name = typeof params.name === "string" ? params.name : "agent-node";
    const node = new cc.Node(name);
    parent.addChild(node);
    this.ownedNodes.add(node);
    return { nodeId: this.nodeId(node) };
  }
  opAddComponent(request) {
    const params = request.params ?? {};
    const node = this.nodeById(request.targetId);
    const typeName = typeof params.component === "string" ? params.component : "";
    const ctor = COMPONENT_WHITELIST[typeName];
    if (!ctor) {
      throw new AgentSessionError("INVALID_ARGUMENT", `component type '${typeName}' is not in the addComponent whitelist: ${Object.keys(COMPONENT_WHITELIST).join(", ")}`);
    }
    if (!this.isWritable(node)) {
      throw new AgentSessionError("OUT_OF_SCOPE", "target node is not in the writable scope");
    }
    const component = node.addComponent(ctor);
    return { componentId: this.componentId(component), type: component.constructor.name };
  }
  opSetTransform(request) {
    const params = request.params ?? {};
    const node = this.nodeById(request.targetId);
    if (!this.isWritable(node)) {
      throw new AgentSessionError("OUT_OF_SCOPE", "target node is not in the writable scope");
    }
    const space = params.space === "world" ? "world" : params.space === "local" ? "local" : "";
    if (!space) {
      throw new AgentSessionError("INVALID_ARGUMENT", "params.space must be 'local' or 'world'");
    }
    const plan = [];
    if (params.position !== void 0) {
      plan.push({ kind: "position", value: _AgentSessionImpl.number3(params.position, "params.position") });
    }
    if (params.rotationEuler !== void 0) {
      const value = _AgentSessionImpl.number3(params.rotationEuler, "params.rotationEuler");
      if (space === "world") {
        const parentEuler = node.parent ? node.parent.eulerAngles : null;
        if (parentEuler && (parentEuler.x || parentEuler.y || parentEuler.z)) {
          throw new AgentSessionError("INVALID_ARGUMENT", "world rotationEuler requires an unrotated parent in this version");
        }
      }
      plan.push({ kind: "rotationEuler", value });
    }
    if (params.scale !== void 0) {
      const value = _AgentSessionImpl.number3(params.scale, "params.scale");
      if (value.some((v) => v === 0)) {
        throw new AgentSessionError("INVALID_ARGUMENT", "scale components must be non-zero");
      }
      plan.push({ kind: "scale", value });
    }
    if (plan.length === 0) {
      throw new AgentSessionError("INVALID_ARGUMENT", "setTransform requires at least one of position / rotationEuler / scale");
    }
    const applied = [];
    for (const step of plan) {
      const [x, y, z] = step.value;
      if (step.kind === "position") {
        if (space === "local") {
          node.setPosition(x, y, z);
        } else {
          node.setWorldPosition(x, y, z);
        }
      } else if (step.kind === "rotationEuler") {
        node.setRotationFromEuler(x, y, z);
      } else {
        if (space === "local") {
          node.setScale(x, y, z);
        } else {
          node.setWorldScale(x, y, z);
        }
      }
      applied.push(step.kind);
    }
    return { applied };
  }
  opLoadAsset(request) {
    const params = request.params ?? {};
    const url = typeof params.url === "string" ? params.url : "";
    if (!url) {
      return Promise.reject(new AgentSessionError("INVALID_ARGUMENT", "params.url (string) is required"));
    }
    if (this.closed) {
      return Promise.reject(new AgentSessionError("SESSION_CLOSED", `session ${this.id} is closed`));
    }
    const loader = new cc.GLTFLoader();
    return loader.loadAsync(url).then((asset) => {
      if (this.closed) {
        throw new AgentSessionError("SESSION_CLOSED", `session ${this.id} closed while loading; asset left to its owner`);
      }
      asset.addRef();
      this.ownedAssets.add(asset);
      const summary = {
        url,
        sceneNames: asset.sceneNames ?? [],
        warnings: asset.warnings ?? [],
        meshes: asset.meshes?.length ?? 0,
        materials: asset.materials?.length ?? 0,
        textures: asset.textures?.length ?? 0,
        animations: asset.animations?.length ?? 0
      };
      return { assetId: this.assetId(asset), summary };
    }, (error) => {
      this.collector.noteSessionLoad(`loadAsset ${url} failed: ${error instanceof Error ? error.message : String(error)}`, request.requestId);
      const code = error?.code;
      throw new AgentSessionError(
        "LOAD_FAILED",
        `loadAsset failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
        code ? { code, message: error instanceof Error ? error.message : String(error) } : void 0
      );
    });
  }
  opInstantiateAsset(request) {
    const params = request.params ?? {};
    const assetId = request.targetId ?? (typeof params.assetId === "string" ? params.assetId : void 0);
    if (!assetId) {
      throw new AgentSessionError("INVALID_ARGUMENT", "targetId or params.assetId is required");
    }
    const asset = this.assetsById.get(assetId);
    if (!asset || !cc.isValid(asset, true)) {
      throw new AgentSessionError("STALE_TARGET", `unknown or destroyed asset: ${assetId}`);
    }
    const instantiate = asset.instantiate;
    if (typeof instantiate !== "function") {
      throw new AgentSessionError("UNSUPPORTED_ACTION", `asset ${assetId} has no instantiate capability`);
    }
    let parent = null;
    if (typeof params.parentId === "string") {
      parent = this.nodeById(params.parentId);
      if (!this.isWritable(parent)) {
        throw new AgentSessionError("OUT_OF_SCOPE", "params.parentId is not in the writable scope");
      }
    }
    const instance = instantiate.call(asset, typeof params.sceneIndex === "number" ? params.sceneIndex : void 0);
    if (parent) {
      parent.addChild(instance.root);
    }
    this.ownedInstances.push({
      id: `instance-${++this.idCounter}`,
      assetId,
      instance
    });
    const record = this.ownedInstances[this.ownedInstances.length - 1];
    return { instanceId: record.id, nodeId: this.nodeId(instance.root), assetId };
  }
  // ---- 生命周期 ----
  /**
   * 关闭 session：移除监听器与观察 hook，取消进行中的 capture，销毁 session 自有
   * 节点/实例，并只释放自己持有的资产引用（decRef——不销毁可能被共享的资产）；
   * 已有节点的显式编辑不自动撤销。之后所有请求返回 SESSION_CLOSED。
   */
  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.collector.detach(this);
    for (const pending of Array.from(this.pendingCaptures)) {
      pending.reject(new AgentSessionError("SESSION_CLOSED", `session ${this.id} is closed`));
    }
    this.pendingCaptures.clear();
    for (const instance of this.ownedInstances) {
      try {
        instance.instance.dispose();
      } catch {
      }
    }
    this.ownedInstances.length = 0;
    for (const asset of this.ownedAssets) {
      if (cc.isValid(asset, true)) {
        asset.decRef();
      }
    }
    this.ownedAssets.clear();
    for (const node of this.ownedNodes) {
      if (cc.isValid(node, true)) {
        node.destroy();
      }
    }
    this.ownedNodes.clear();
    this.nodesById.clear();
    this.nodeIds.clear();
    this.componentIds.clear();
    this.assetIds.clear();
    this.assetsById.clear();
    this.requestLog.clear();
  }
};
function createAgentSession(options) {
  return new AgentSessionImpl(options);
}

// tools/debug/panel.ts
var CSS = `
  position:fixed; top:8px; right:8px; bottom:8px; width:min(360px, 42vw); z-index:99998;
  background:rgba(12,14,24,.94); color:#cde; font:12px/1.45 ui-monospace,Consolas,monospace;
  border:1px solid #334; border-radius:10px; display:flex; flex-direction:column; overflow:hidden;
  box-shadow:0 4px 24px rgba(0,0,0,.5);
`;
var SECTION_CSS = `
  border-top:1px solid #263; padding:6px 8px; overflow:auto; min-height:34px; max-height:32%;
`;
var BTN_CSS = `
  background:#1c2b4a; color:#9cf; border:1px solid #345; border-radius:6px;
  padding:2px 8px; font:inherit; cursor:pointer;
`;
function el(tag, css, text) {
  const node = document.createElement(tag);
  if (css) {
    node.style.cssText = css;
  }
  if (text !== void 0) {
    node.textContent = text;
  }
  return node;
}
function createDebugPanel(options = {}) {
  const app = options.app ?? window.__airApp;
  const root = el("div", CSS);
  root.setAttribute("data-air-debug-panel", "true");
  const header = el("div", "display:flex;gap:6px;align-items:center;padding:6px 8px;flex:none");
  header.appendChild(el("b", "color:#fff", "cocosair debug"));
  const refreshBtn = el("button", BTN_CSS, "\u5237\u65B0");
  const captureBtn = el("button", BTN_CSS, "\u622A\u56FE");
  const closeBtn = el("button", BTN_CSS, "\u5173\u95ED");
  header.append(refreshBtn, captureBtn, closeBtn);
  const statusEl = el("div", "flex:none;padding:0 8px 4px;color:#89a");
  root.append(header, statusEl);
  const section = (title) => {
    const wrap = el("div", SECTION_CSS);
    wrap.appendChild(el("div", "color:#7eb8ff;margin-bottom:3px;flex:none", title));
    const body = el("div");
    wrap.appendChild(body);
    root.appendChild(wrap);
    return { wrap, body };
  };
  const tree = section("Scene Tree\uFF08\u70B9\u51FB\u8282\u70B9\u67E5\u770B\u53EA\u8BFB\u8BE6\u60C5\uFF09");
  const detail = section("Node \u8BE6\u60C5");
  const asset = section("Asset \u6E05\u5355\u4E0E\u8BCA\u65AD");
  const error = section("\u8FD0\u884C\u9519\u8BEF");
  const perf = section("\u6027\u80FD\u6458\u8981");
  const capture = section("\u622A\u56FE");
  const refs = {
    root,
    treeEl: tree.body,
    detailEl: detail.body,
    assetEl: asset.body,
    errorEl: error.body,
    perfEl: perf.body,
    captureEl: capture.body,
    statusEl
  };
  const { treeEl, detailEl, assetEl, errorEl, perfEl, captureEl } = refs;
  document.body.appendChild(root);
  if (!app) {
    statusEl.textContent = "\u672A\u627E\u5230 app\uFF1A\u9875\u9762\u9700\u663E\u5F0F\u66B4\u9732 window.__airApp\uFF08\u4E0D\u731C\u6D4B\u9690\u85CF\u5F15\u64CE\u72B6\u6001\uFF09";
    refreshBtn.disabled = captureBtn.disabled = true;
    const handle2 = {
      session: null,
      close() {
        root.remove();
      }
    };
    closeBtn.onclick = () => handle2.close();
    return handle2;
  }
  const session = createAgentSession({ app });
  statusEl.textContent = `session ${session.id}`;
  let closed = false;
  let timer;
  let raf = 0;
  const selected = { id: "" };
  const safe = (fn) => {
    try {
      fn();
    } catch (e) {
      statusEl.textContent = `panel error: ${e instanceof Error ? e.message : String(e)}`;
    }
  };
  const renderTree = () => safe(() => {
    const summary = session.inspectScene();
    statusEl.textContent = `scene=${summary.name} nodes=${summary.nodeCount} components=${summary.componentCount} assets=${summary.uniqueAssetCount.total}${summary.truncated ? " (truncated)" : ""}`;
    treeEl.textContent = "";
    const byId = new Map(summary.nodes.map((n) => [n.id, n]));
    const depth = (n) => {
      let d = 0;
      let p = n.parentId;
      while (p) {
        d++;
        p = byId.get(p)?.parentId ?? null;
      }
      return d;
    };
    for (const node of summary.nodes) {
      const row = el("div", "cursor:pointer;padding:1px 0 1px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis");
      row.style.paddingLeft = `${depth(node) * 14 + 4}px`;
      row.textContent = `\u25B8 ${node.name}  #${node.id}`;
      if (node.id === selected.id) {
        row.style.color = "#ffd97e";
      }
      row.onclick = () => {
        selected.id = node.id;
        safe(renderAll);
      };
      treeEl.appendChild(row);
    }
  });
  const renderDetail = () => safe(() => {
    detailEl.textContent = "";
    if (!selected.id) {
      detailEl.textContent = "\uFF08\u5728 Scene Tree \u4E2D\u9009\u62E9\u8282\u70B9\uFF09";
      return;
    }
    const view = session.inspectNode(selected.id);
    const add = (text) => {
      detailEl.appendChild(el("div", void 0, text));
    };
    add(`name: ${view.name}   id: ${view.id}`);
    add(`active: ${view.active} (self ${view.activeSelf})   parent: ${view.parentId ?? "\u2014"}`);
    add(`local pos: ${view.local.position.map((v) => +v.toFixed(3)).join(", ")}`);
    add(`local euler: ${view.local.rotationEuler.map((v) => +v.toFixed(1)).join(", ")}   scale: ${view.local.scale.map((v) => +v.toFixed(2)).join(", ")}`);
    add(`world pos: ${view.world.position.map((v) => +v.toFixed(3)).join(", ")}`);
    for (const c of view.components) {
      add(`\xB7 ${c.type} (${c.id})${c.enabled ? "" : " [disabled]"}`);
    }
  });
  const renderAssets = () => safe(() => {
    assetEl.textContent = "";
    const report = session.inspectAsset();
    const head = el("div");
    head.innerHTML = "";
    head.textContent = `ok=${report.ok} unique=${JSON.stringify(report.counts)}${report.truncated ? " (truncated)" : ""}`;
    assetEl.appendChild(head);
    for (const d of report.diagnostics) {
      assetEl.appendChild(el("div", "color:#ff9c8a", `! ${d.code} ${d.location}: ${d.message}`));
    }
    assetEl.appendChild(el("div", "color:#677", `unchecked=${report.unchecked.length}\uFF08\u53EA\u8BFB\u8FB9\u754C\uFF0C\u4E0D\u5224 PASS\uFF09`));
  });
  const renderErrors = () => safe(() => {
    errorEl.textContent = "";
    const { errors, dropped } = session.getRuntimeErrors({ limit: 50 });
    if (dropped > 0) {
      errorEl.appendChild(el("div", "color:#89a", `\u2026\u5DF2\u4E22\u5F03 ${dropped} \u6761`));
    }
    if (errors.length === 0) {
      errorEl.appendChild(el("div", "color:#677", "\uFF08\u65E0\uFF09"));
    }
    for (const e of errors) {
      const row = el("div", "color:#ffcf8a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis");
      row.textContent = `#${e.seq} ${e.category}: ${e.message.slice(0, 120)}`;
      row.title = e.message;
      errorEl.appendChild(row);
    }
  });
  const renderPerf = () => safe(() => {
    perfEl.textContent = "";
    const stats = window.__glStats;
    const lines = [
      `draws: ${stats ? stats.draws : "unavailable\uFF08\u65E0 prelude\uFF09"}`,
      `shader/link errs: ${stats ? stats.shaderErrs.length + stats.linkErrs.length : "unavailable"}`
    ];
    if (frameStat.samples > 1) {
      lines.push(`fps: ${frameStat.fps.toFixed(0)}   frame: ${frameStat.avgMs.toFixed(1)}ms`);
    }
    const mem = performance.memory;
    lines.push(`js heap: ${mem ? `${(mem.usedJSHeapSize / 1048576).toFixed(1)}MB` : "unavailable"}`);
    for (const line of lines) {
      perfEl.appendChild(el("div", void 0, line));
    }
  });
  const renderCapture = () => safe(() => {
    captureEl.textContent = "";
    captureEl.appendChild(el("div", "color:#677", "\u70B9\u51FB\u300C\u622A\u56FE\u300D\u83B7\u53D6 AFTER_DRAW \u65F6\u523B\u7684 canvas PNG"));
  });
  const frameStat = { samples: 0, last: 0, avgMs: 0, fps: 0, windowStart: 0, frames: 0 };
  const tick = (now) => {
    if (closed) {
      return;
    }
    if (frameStat.last) {
      const dt = now - frameStat.last;
      frameStat.avgMs = frameStat.avgMs ? frameStat.avgMs * 0.9 + dt * 0.1 : dt;
      frameStat.frames++;
      if (now - frameStat.windowStart > 1e3) {
        frameStat.fps = frameStat.frames * 1e3 / (now - frameStat.windowStart);
        frameStat.frames = 0;
        frameStat.windowStart = now;
        safe(renderPerf);
      }
    } else {
      frameStat.windowStart = now;
    }
    frameStat.last = now;
    frameStat.samples++;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  const renderAll = () => {
    renderTree();
    renderDetail();
    renderAssets();
    renderErrors();
    renderPerf();
  };
  refreshBtn.onclick = () => safe(renderAll);
  captureBtn.onclick = () => safe(async () => {
    captureEl.textContent = "capturing\u2026";
    try {
      const frame = await session.captureFrame();
      captureEl.textContent = "";
      const img = document.createElement("img");
      img.src = frame.png;
      img.style.cssText = "width:100%;border:1px solid #345;border-radius:4px;background:#000";
      captureEl.appendChild(img);
      captureEl.appendChild(el("div", "color:#677", `frame#${frame.frameIndex} ${frame.width}x${frame.height} @ ${frame.sampledAt}`));
      const link = el("a", "color:#9cf", "\u4E0B\u8F7D PNG");
      link.href = frame.png;
      link.download = `cocosair-frame-${frame.frameIndex}.png`;
      captureEl.appendChild(link);
    } catch (e) {
      captureEl.textContent = `capture failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  });
  const onKey = (e) => {
    if (e.altKey && (e.key === "d" || e.key === "D")) {
      root.style.display = root.style.display === "none" ? "flex" : "none";
    } else if (e.key === "Escape" && root.contains(document.activeElement)) {
      handle.close();
    }
  };
  window.addEventListener("keydown", onKey, true);
  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    cancelAnimationFrame(raf);
    if (timer !== void 0) {
      clearInterval(timer);
    }
    window.removeEventListener("keydown", onKey, true);
    session.close();
    root.remove();
  };
  const handle = { session, close };
  closeBtn.onclick = () => close();
  safe(renderAll);
  safe(renderCapture);
  timer = window.setInterval(() => {
    if (!closed && document.visibilityState === "visible") {
      safe(renderAll);
    }
  }, 1500);
  return handle;
}
export {
  createDebugPanel
};
