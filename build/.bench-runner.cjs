var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// tools/benchmark/runner/trial.ts
var trial_exports = {};
__export(trial_exports, {
  TrialRunner: () => TrialRunner,
  buildManifest: () => buildManifest
});
module.exports = __toCommonJS(trial_exports);
var import_fs = require("fs");
var fs4 = __toESM(require("fs"));
var path3 = __toESM(require("path"));

// tools/benchmark/runner/harness.ts
var fs2 = __toESM(require("fs"));

// tools/benchmark/runner/patch.ts
function applyPatch(source, diff) {
  const hunks = parseHunks(diff);
  if (hunks.length === 0) {
    throw new Error("patch contains no hunks");
  }
  const lines = source.split("\n");
  let offset = 0;
  for (const hunk of hunks) {
    const start = hunk.oldStart - 1 + offset;
    let check = start;
    for (const line of hunk.lines) {
      if (line.startsWith(" ") || line.startsWith("-")) {
        const actual = lines[check];
        if (actual !== line.slice(1)) {
          throw new Error(`patch context mismatch at line ${check + 1}: expected ${JSON.stringify(line.slice(1))}, got ${JSON.stringify(actual)}`);
        }
        check++;
      }
    }
    let cursor = start;
    const rebuilt = [];
    for (const line of hunk.lines) {
      if (line.startsWith(" ")) {
        rebuilt.push(lines[cursor++]);
      } else if (line.startsWith("-")) {
        cursor++;
      } else if (line.startsWith("+")) {
        rebuilt.push(line.slice(1));
      }
    }
    const consumed = cursor - start;
    lines.splice(start, consumed, ...rebuilt);
    offset += rebuilt.length - consumed;
  }
  return lines.join("\n");
}
function parseHunks(diff) {
  const hunks = [];
  let current = null;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff ") || raw.startsWith("--- ") || raw.startsWith("+++ ") || raw.startsWith("index ")) {
      continue;
    }
    const match = raw.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (match) {
      current = {
        oldStart: Number(match[1]),
        oldLines: match[2] === void 0 ? 1 : Number(match[2]),
        newStart: Number(match[3]),
        newLines: match[4] === void 0 ? 1 : Number(match[4]),
        lines: []
      };
      hunks.push(current);
      continue;
    }
    if (current && (raw.startsWith(" ") || raw.startsWith("-") || raw.startsWith("+"))) {
      current.lines.push(raw);
    }
  }
  return hunks;
}

// tools/benchmark/runner/policy.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var import_crypto = require("crypto");
var PolicyDeniedError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "PolicyDeniedError";
  }
};
var EVAL_STYLE_FLAGS = /* @__PURE__ */ new Set(["-e", "--eval", "-p", "--print", "-c", "--command", "--exec"]);
var DEFAULT_DENY_COMMAND_FRAGMENTS = [
  "git reset",
  "git clean",
  "git checkout",
  "git commit",
  "git push",
  "rm ",
  "rmdir",
  "del ",
  "kill ",
  "curl",
  "wget",
  "Invoke-WebRequest",
  "powershell",
  "cmd ",
  "bash",
  "sh ",
  "&",
  "|",
  ">",
  "<",
  ";",
  "`",
  "$("
];
function resolveWithin(root, target) {
  if (path.isAbsolute(target) && !target.startsWith(root)) {
    const resolved2 = path.resolve(target);
    if (resolved2.startsWith(root + path.sep) || resolved2 === root) {
      return resolved2;
    }
    throw new PolicyDeniedError("PATH_OUT_OF_SCOPE", `absolute path outside workspace: ${target}`);
  }
  if (/^[a-zA-Z]:/.test(target)) {
    throw new PolicyDeniedError("PATH_OUT_OF_SCOPE", `drive-qualified path outside workspace: ${target}`);
  }
  const resolved = path.resolve(root, target);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new PolicyDeniedError("PATH_OUT_OF_SCOPE", `path escapes workspace: ${target}`);
  }
  return resolved;
}
function withinAny(resolved, roots) {
  return roots.some((r) => resolved === r || resolved.startsWith(r + path.sep));
}
var Policy = class {
  constructor(config, workspaceRoot) {
    this.config = config;
    this.workspaceRoot = workspaceRoot;
  }
  abs(rel) {
    return resolveWithin(this.workspaceRoot, rel);
  }
  roots(paths) {
    return paths.map((p) => this.abs(p));
  }
  /** 读校验：受保护根完全不可见；可读根之外 READ_NOT_ALLOWED。 */
  assertReadable(relPath) {
    const resolved = this.abs(relPath);
    if (withinAny(resolved, this.roots(this.config.protectedPaths))) {
      throw new PolicyDeniedError("PROTECTED_RESOURCE", `protected path is not readable: ${relPath}`);
    }
    if (!withinAny(resolved, this.roots(this.config.readablePaths)) && !withinAny(resolved, this.roots(this.config.writablePaths))) {
      throw new PolicyDeniedError("READ_NOT_ALLOWED", `path outside readable scope: ${relPath}`);
    }
    return resolved;
  }
  /** 写校验：可写根之外一律拒绝；受保护根 WRITE_NOT_ALLOWED。 */
  assertWritable(relPath) {
    const resolved = this.abs(relPath);
    if (withinAny(resolved, this.roots(this.config.protectedPaths))) {
      throw new PolicyDeniedError("PROTECTED_RESOURCE", `protected path is not writable: ${relPath}`);
    }
    if (!withinAny(resolved, this.roots(this.config.writablePaths))) {
      throw new PolicyDeniedError("WRITE_NOT_ALLOWED", `path outside writable scope: ${relPath}`);
    }
    return resolved;
  }
  /** §25-27：命令白名单 + 参数归一化校验 + 默认禁止片段。 */
  assertCommand(command, args = []) {
    const entry = this.config.allowedCommands.find((c) => c.command === command);
    if (!entry) {
      throw new PolicyDeniedError("COMMAND_NOT_ALLOWED", `command not in allowlist: ${command}`);
    }
    const raw = [command, ...args].join(" ");
    for (const flag of args) {
      if (EVAL_STYLE_FLAGS.has(flag)) {
        throw new PolicyDeniedError("COMMAND_NOT_ALLOWED", `eval-style flag is not allowed: ${flag} (equivalent to arbitrary code execution)`);
      }
    }
    for (const fragment of DEFAULT_DENY_COMMAND_FRAGMENTS) {
      if (raw.includes(fragment)) {
        throw new PolicyDeniedError("COMMAND_NOT_ALLOWED", `forbidden fragment '${fragment.trim()}' in: ${raw}`);
      }
    }
    if (!entry.allowAnyArgs) {
      for (const arg of args) {
        if (arg.startsWith("-")) {
          continue;
        }
        const resolved = this.abs(arg);
        if (!withinAny(resolved, this.roots(this.config.allowedPathRoots.length ? this.config.allowedPathRoots : this.config.writablePaths))) {
          throw new PolicyDeniedError("PATH_OUT_OF_SCOPE", `command argument outside allowed roots: ${arg}`);
        }
      }
    }
    return { command, args };
  }
  /** §29：网络默认 offline/localhost-only。 */
  assertNetworkHost(host) {
    if (host === "localhost" || host === "127.0.0.1") {
      return;
    }
    if (!this.config.allowedNetworkHosts.includes(host)) {
      throw new PolicyDeniedError("NETWORK_NOT_ALLOWED", `network host not allowed: ${host}`);
    }
  }
};
var IsolationLedger = class {
  constructor(workspaceRoot, files, protectedRoots) {
    this.files = files;
    this.protectedRoots = protectedRoots;
    this.baseline = /* @__PURE__ */ new Map();
    this.dirBaselines = /* @__PURE__ */ new Map();
    this.workspaceRoot = workspaceRoot;
    for (const rel of files) {
      const abs = path.resolve(this.workspaceRoot, rel);
      this.baseline.set(rel, fs.existsSync(abs) ? sha256(fs.readFileSync(abs)) : "<missing>");
    }
    for (const dir of protectedRoots) {
      this.dirBaselines.set(dir, this.dirManifest(dir));
    }
  }
  dirManifest(dir) {
    const abs = path.resolve(this.workspaceRoot, dir);
    if (!fs.existsSync(abs)) {
      return "<missing-dir>";
    }
    const entries = [];
    const walk = (current, prefix) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walk(path.join(current, entry.name), rel);
        } else {
          entries.push(`${rel}:${sha256(fs.readFileSync(path.join(current, entry.name)))}`);
        }
      }
    };
    walk(abs, "");
    entries.sort();
    return entries.join("|") || "<empty-dir>";
  }
  /** 返回被篡改/新增/删除的受保护条目；空 = 通过。 */
  violations() {
    const changed = [];
    for (const [rel, expected] of this.baseline) {
      const abs = path.resolve(this.workspaceRoot, rel);
      const actual = fs.existsSync(abs) ? sha256(fs.readFileSync(abs)) : "<missing>";
      if (actual !== expected) {
        changed.push(rel);
      }
    }
    for (const [dir, expected] of this.dirBaselines) {
      if (this.dirManifest(dir) !== expected) {
        changed.push(`${dir}/*`);
      }
    }
    return changed;
  }
};
function sha256(data) {
  const buf = typeof data === "string" || !Buffer.isBuffer(data) ? fs.readFileSync(data) : data;
  return (0, import_crypto.createHash)("sha256").update(buf).digest("hex");
}

// tools/benchmark/runner/sandbox.ts
var import_child_process = require("child_process");
var TAIL = 8e3;
var CommandSandbox = class {
  constructor(cwdRoot) {
    this.cwdRoot = cwdRoot;
    this.ledger = [];
    this.live = /* @__PURE__ */ new Set();
  }
  records() {
    return [...this.ledger];
  }
  /**
   * 受控执行：仅接受白名单内命令（policy.assertCommand 已校验参数）。
   * shell 永远关闭 —— 管道/重定向/命令链天然不可达（§26）。
   */
  async run(command, args, options = {}) {
    const cwd = options.cwd ?? this.cwdRoot;
    const timeoutMs = options.timeoutMs ?? 12e4;
    const startedAt = (/* @__PURE__ */ new Date()).toISOString();
    let child;
    try {
      child = (0, import_child_process.spawn)(command, args, { cwd, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      const record2 = {
        pid: null,
        command,
        args,
        cwd,
        startedAt,
        timeoutMs,
        exitCode: null,
        killed: false,
        stdoutTail: "",
        stderrTail: String(error).slice(0, TAIL)
      };
      this.ledger.push(record2);
      return { ok: false, timedOut: false, exitCode: null, stdout: "", stderr: String(error), record: record2 };
    }
    this.live.add(child);
    const record = {
      pid: child.pid ?? null,
      command,
      args,
      cwd,
      startedAt,
      timeoutMs,
      exitCode: null,
      killed: false,
      stdoutTail: "",
      stderrTail: ""
    };
    this.ledger.push(record);
    const result = await new Promise((resolve2) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let killed = false;
      const timer = setTimeout(() => {
        timedOut = true;
        killed = true;
        killTree(child);
      }, timeoutMs);
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (error) => {
        stderr += String(error);
        clearTimeout(timer);
        this.live.delete(child);
        resolve2({ code: null, stdout, stderr, timedOut, killed });
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        this.live.delete(child);
        resolve2({ code, stdout, stderr, timedOut, killed });
      });
    });
    record.exitCode = result.code;
    record.killed = result.killed;
    record.stdoutTail = result.stdout.slice(-TAIL);
    record.stderrTail = result.stderr.slice(-TAIL);
    return {
      ok: !result.timedOut && result.code === 0,
      timedOut: result.timedOut,
      exitCode: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
      record
    };
  }
  /** §28：Trial 结束清理——停止全部存活子进程树。 */
  async dispose() {
    for (const child of Array.from(this.live)) {
      killTree(child);
      this.live.delete(child);
    }
  }
};
function killTree(child) {
  if (child.pid === void 0 || child.exitCode !== null) {
    return;
  }
  try {
    if (process.platform === "win32") {
      (0, import_child_process.spawn)("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
    } else {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }
  } catch {
  }
}

// tools/benchmark/runner/harness.ts
var Harness = class {
  constructor(workspace, policy) {
    this.workspace = workspace;
    this.policy = policy;
    this.runtimeChannel = null;
    this.denials = [];
    this.sandbox = new CommandSandbox(workspace.paths.workspace);
  }
  attachRuntime(channel) {
    this.runtimeChannel = channel;
  }
  async execute(action) {
    try {
      const payload = await this.dispatch(action);
      return { action, ok: true, payload };
    } catch (error) {
      if (error instanceof PolicyDeniedError) {
        const denial = { action: action.type, code: error.code, message: error.message };
        this.denials.push(denial);
        return { action, ok: false, denial };
      }
      return { action, ok: false, denial: { code: "POLICY_DENIED", message: String(error instanceof Error ? error.message : error) } };
    }
  }
  async dispatch(action) {
    switch (action.type) {
      case "read-file": {
        const abs = this.policy.assertReadable(action.path);
        return fs2.readFileSync(abs, "utf8");
      }
      case "write-file": {
        const abs = this.policy.assertWritable(action.path);
        fs2.mkdirSync(abs.substring(0, Math.max(abs.lastIndexOf("\\"), abs.lastIndexOf("/"))), { recursive: true });
        fs2.writeFileSync(abs, action.content, "utf8");
        return { bytes: Buffer.byteLength(action.content) };
      }
      case "patch-file": {
        const abs = this.policy.assertWritable(action.path);
        const before = fs2.existsSync(abs) ? fs2.readFileSync(abs, "utf8") : "";
        const after = applyPatch(before, action.diff);
        fs2.writeFileSync(abs, after, "utf8");
        return { bytes: Buffer.byteLength(after) };
      }
      case "run-command": {
        const checked = this.policy.assertCommand(action.command, action.args ?? []);
        const result = await this.sandbox.run(checked.command, checked.args, {
          cwd: this.workspace.paths.workspace,
          timeoutMs: action.timeoutMs
        });
        return {
          ok: result.ok,
          timedOut: result.timedOut,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr
        };
      }
      case "request-runtime-inspection": {
        if (!this.runtimeChannel) {
          throw new PolicyDeniedError("POLICY_DENIED", "runtime channel not attached");
        }
        return this.runtimeChannel.inspect(action.query);
      }
      case "request-frame-capture": {
        if (!this.runtimeChannel) {
          throw new PolicyDeniedError("POLICY_DENIED", "runtime channel not attached");
        }
        return this.runtimeChannel.captureFrame();
      }
      case "request-error-report": {
        if (!this.runtimeChannel) {
          throw new PolicyDeniedError("POLICY_DENIED", "runtime channel not attached");
        }
        return this.runtimeChannel.errorReport({ since: action.since, limit: action.limit });
      }
      case "finish":
        return { acknowledged: true };
      default:
        throw new PolicyDeniedError("POLICY_DENIED", `unknown action type: ${action.type}`);
    }
  }
  async dispose() {
    await this.sandbox.dispose();
  }
};

// tools/benchmark/runner/workspace.ts
var fs3 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
var crypto = __toESM(require("crypto"));
var TrialWorkspace = class _TrialWorkspace {
  constructor(paths, policy, ledger) {
    this.paths = paths;
    this.policy = policy;
    this.ledger = ledger;
  }
  /** 从 Immutable Fixture 创建隔离 Trial（fixture 只读复制）。 */
  static create(options) {
    const runId = `run-${crypto.randomUUID()}`;
    const runRoot = path2.join(options.workRoot, runId);
    const workspace = path2.join(runRoot, "workspace");
    const protectedDir = path2.join(runRoot, "protected");
    fs3.mkdirSync(workspace, { recursive: true });
    fs3.mkdirSync(protectedDir, { recursive: true });
    if (!options.skipFixtureCopy) {
      copyTree(options.fixtureDir, workspace);
    }
    const policy = new Policy(options.policyConfig, workspace);
    const ledgerFiles = options.ledgerFiles ?? [];
    const ledgerRoots = fs3.existsSync(path2.join(workspace, "protected")) ? ["protected"] : [];
    const ledger = new IsolationLedger(workspace, ledgerFiles, [...ledgerRoots, "../protected"]);
    return new _TrialWorkspace({ runRoot, workspace, protectedDir, manifestFile: path2.join(runRoot, "manifest.json") }, policy, ledger);
  }
  /** §32：结束审计——受保护文件被篡改 = ISOLATION 突破。 */
  isolationViolations() {
    return this.ledger.violations();
  }
};
function copyTree(from, to) {
  fs3.mkdirSync(to, { recursive: true });
  for (const entry of fs3.readdirSync(from, { withFileTypes: true })) {
    const src = path2.join(from, entry.name);
    const dst = path2.join(to, entry.name);
    if (entry.isDirectory()) {
      copyTree(src, dst);
    } else {
      fs3.copyFileSync(src, dst);
    }
  }
}

// tools/benchmark/validators/index.ts
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

// tools/benchmark/runner/trial.ts
var TrialRunner = class {
  constructor(runtime) {
    this.runtime = runtime;
    this.lastStartError = null;
  }
  /** Reference Track（§7/§9/§11）。 */
  async runReference(options) {
    const benchmark = options.benchmark;
    const policyConfig = this.policyConfig(benchmark);
    if (!(0, import_fs.existsSync)(options.fixtureDir)) {
      const missing = TrialWorkspace.create({
        workRoot: options.workRoot,
        fixtureDir: options.fixtureDir,
        policyConfig,
        skipFixtureCopy: true
      });
      return this.outcome(missing, options, "INFRA_FAILURE", "NOT_EVALUATED", "NOT_EVALUATED", "INFRASTRUCTURE", "fixture missing", 0, false, []);
    }
    const workspace = TrialWorkspace.create({
      workRoot: options.workRoot,
      fixtureDir: options.fixtureDir,
      policyConfig
    });
    try {
      if (benchmark.benchmarkType !== "runtime-control" && benchmark.referenceImplementation && options.referenceDir) {
        const refFile = path3.join(options.referenceDir, benchmark.referenceImplementation);
        if (!(0, import_fs.existsSync)(refFile)) {
          return this.outcome(workspace, options, "INFRA_FAILURE", "NOT_EVALUATED", "NOT_EVALUATED", "INFRASTRUCTURE", "reference implementation missing", 0, false, []);
        }
        fs4.copyFileSync(refFile, path3.join(workspace.paths.workspace, "src", "main.ts"));
      }
      const channel = await this.safeStart(workspace, benchmark, options);
      if (!channel) {
        return this.outcome(workspace, options, "INFRA_FAILURE", "NOT_EVALUATED", "NOT_EVALUATED", "INFRASTRUCTURE", this.lastStartError || "runtime start failed", 0, false, []);
      }
      if (benchmark.referenceOperations?.length) {
        if (!channel.executeReference) {
          return this.outcome(workspace, options, "INFRA_FAILURE", "NOT_EVALUATED", "NOT_EVALUATED", "INFRASTRUCTURE", "runtime lacks executeReference", 0, false, []);
        }
        for (const op of benchmark.referenceOperations) {
          await channel.executeReference(op);
        }
      }
      const snapshot = await channel.snapshot();
      const results = runValidators([...benchmark.validators, ...benchmark.visualValidators ?? []], snapshot, benchmark.validatorParams);
      const capUnsupported = snapshot.capability?.status === "unsupported";
      const stableCode = snapshot.capability?.name === "draco-decoder" ? /decoder-required/ : null;
      const effective = results.map((r) => {
        if (capUnsupported && stableCode && r.validatorId === "no-runtime-error" && r.state === "FAIL") {
          const offending = snapshot.runtimeErrors.filter((e) => !stableCode.test(e.message));
          if (offending.length === 0) {
            return { ...r, state: "EXPECTED_UNSUPPORTED", detail: "stable decoder-required error verified" };
          }
        }
        return r;
      });
      const allPass = effective.every((r) => r.state === "PASS" || r.state === "EXPECTED_UNSUPPORTED" || r.state === "EXPECTED_FALLBACK");
      const engineResult = allPass ? results.some((r) => r.state === "EXPECTED_UNSUPPORTED") ? "EXPECTED_UNSUPPORTED" : results.some((r) => r.state === "EXPECTED_FALLBACK") ? "EXPECTED_FALLBACK" : "PASS" : "FAIL";
      await this.runtime.stop();
      return this.outcome(
        workspace,
        options,
        "VALID",
        engineResult,
        "NOT_EVALUATED",
        engineResult === "FAIL" ? "ENGINE" : "NONE",
        void 0,
        0,
        false,
        [],
        results
      );
    } catch (error) {
      await this.runtime.stop().catch(() => void 0);
      return this.outcome(workspace, options, "INFRA_FAILURE", "NOT_EVALUATED", "NOT_EVALUATED", "INFRASTRUCTURE", `reference harness: ${String(error)}`, 0, false, []);
    }
  }
  /** Agent Track（§12/§13/§20-22）：仅在 Reference PASS 后由调用方启动。 */
  async runAgent(options, driver) {
    const benchmark = options.benchmark;
    const policyConfig = this.policyConfig(benchmark);
    const workspace = TrialWorkspace.create({
      workRoot: options.workRoot,
      fixtureDir: options.fixtureDir,
      policyConfig
    });
    const harness = new Harness(workspace, workspace.policy);
    let repairs = 0;
    let firstSubmissionCompilePass = false;
    let submitted = false;
    try {
      const run = await driver.startTask({
        requestNext: async () => ({ remainingRepairs: benchmark.repairBudget - repairs }),
        task: {
          benchmarkId: benchmark.id,
          prompt: benchmark.prompt,
          writablePaths: benchmark.writablePaths,
          readablePaths: benchmark.readablePaths,
          knowledgePaths: this.knowledgePaths(benchmark),
          repairBudget: benchmark.repairBudget,
          timeBudgetMs: benchmark.timeBudgetMs
        }
      });
      await run.submitTask({
        benchmarkId: benchmark.id,
        prompt: benchmark.prompt,
        writablePaths: benchmark.writablePaths,
        readablePaths: benchmark.readablePaths,
        knowledgePaths: this.knowledgePaths(benchmark),
        repairBudget: benchmark.repairBudget,
        timeBudgetMs: benchmark.timeBudgetMs
      });
      let feedback = null;
      while (true) {
        const action = await run.nextAction({
          feedback: feedback ?? void 0,
          remainingRepairs: benchmark.repairBudget - repairs
        });
        if (action.type === "finish") {
          await run.finish();
          break;
        }
        const outcome = await harness.execute(action);
        if (action.type === "write-file" || action.type === "patch-file") {
          if (!submitted) {
            submitted = true;
            const compile2 = await this.freshBuild(workspace);
            firstSubmissionCompilePass = compile2.success;
            feedback = await this.evaluate(workspace, benchmark, options, compile2, harness);
            feedback.policy.denied = [...harness.denials];
            await run.provideFeedback(feedback);
            if (feedback.compile.success && feedback.validation.every((v) => v.state === "PASS" || v.state === "EXPECTED_FALLBACK" || v.state === "EXPECTED_UNSUPPORTED")) {
              await this.runtime.stop().catch(() => void 0);
              await harness.dispose();
              return this.outcome(workspace, options, "VALID", "NOT_EVALUATED", "PASS", "NONE", void 0, repairs, firstSubmissionCompilePass, harness.denials, feedback.validation);
            }
            continue;
          }
          repairs += 1;
          if (repairs > benchmark.repairBudget) {
            await run.provideFeedback(await this.evaluate(workspace, benchmark, options, { success: false, diagnostics: ["repair budget exhausted"] }, harness));
            await this.runtime.stop().catch(() => void 0);
            await harness.dispose();
            return this.outcome(workspace, options, "VALID", "NOT_EVALUATED", "BUDGET_EXHAUSTED", "AGENT", "repair budget exhausted", repairs - 1, firstSubmissionCompilePass, harness.denials);
          }
          const compile = await this.freshBuild(workspace);
          feedback = await this.evaluate(workspace, benchmark, options, compile, harness);
          feedback.policy.denied = [...harness.denials];
          await run.provideFeedback(feedback);
          if (feedback.compile.success && feedback.validation.every((v) => v.state === "PASS" || v.state === "EXPECTED_FALLBACK" || v.state === "EXPECTED_UNSUPPORTED")) {
            await this.runtime.stop().catch(() => void 0);
            await harness.dispose();
            return this.outcome(workspace, options, "VALID", "NOT_EVALUATED", "PASS", "NONE", void 0, repairs, firstSubmissionCompilePass, harness.denials, feedback.validation);
          }
          continue;
        }
        void outcome;
      }
      await this.runtime.stop().catch(() => void 0);
      await harness.dispose();
      const gaveUpSummary = "agent finished";
      const stillFailing = feedback ? !feedback.validation.every((v) => v.state === "PASS") : true;
      return this.outcome(workspace, options, "VALID", "NOT_EVALUATED", stillFailing ? "FAIL" : "PASS", stillFailing ? "AGENT" : "NONE", stillFailing ? gaveUpSummary : void 0, repairs, firstSubmissionCompilePass, harness.denials, feedback?.validation);
    } catch (error) {
      await this.runtime.stop().catch(() => void 0);
      await harness.dispose();
      return this.outcome(workspace, options, "VALID", "NOT_EVALUATED", "FAIL", "AGENT", String(error instanceof Error ? error.message : error), repairs, firstSubmissionCompilePass, harness.denials);
    }
  }
  /** Fresh Build 占位：源码级 TypeScript 语法校验（真实管线由 Browser Runtime 注入）。 */
  async freshBuild(workspace) {
    const candidates = ["src/main.ts", "main.ts"].map((rel) => path3.join(workspace.paths.workspace, rel));
    const entry = candidates.find((p) => (0, import_fs.existsSync)(p));
    if (!entry) {
      return { success: false, diagnostics: ["main.ts missing after submission"] };
    }
    const source = fs4.readFileSync(entry, "utf8");
    const pairs = { ")": "(", "]": "[", "}": "{" };
    const stack = [];
    let inStr = null;
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (inStr) {
        if (ch === inStr && source[i - 1] !== "\\") {
          inStr = null;
        }
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inStr = ch;
        continue;
      }
      if (ch === "(" || ch === "[" || ch === "{") {
        stack.push(ch);
      } else if (pairs[ch]) {
        if (stack.pop() !== pairs[ch]) {
          return { success: false, diagnostics: [`unbalanced '${ch}' at offset ${i}`] };
        }
      }
    }
    if (stack.length > 0) {
      return { success: false, diagnostics: [`unclosed '${stack[stack.length - 1]}'`] };
    }
    return { success: true, diagnostics: [] };
  }
  async evaluate(workspace, benchmark, options, compile, harness) {
    if (!compile.success) {
      return {
        compile,
        runtime: { errors: [] },
        inspection: { scene: null, nodes: [], assets: null },
        validation: [{ validatorId: "compile", state: "FAIL", detail: compile.diagnostics.join(";") }],
        visual: {},
        policy: { denied: [...harness.denials] }
      };
    }
    const channel = await this.safeStart(workspace, benchmark, options);
    if (!channel) {
      return {
        compile: { success: false, diagnostics: ["runtime failed to start"] },
        runtime: { errors: [] },
        inspection: { scene: null, nodes: [], assets: null },
        validation: [],
        visual: {},
        policy: { denied: [...harness.denials] }
      };
    }
    const snapshot = await channel.snapshot();
    const validation = runValidators([...benchmark.validators, ...benchmark.visualValidators ?? []], snapshot, benchmark.validatorParams);
    return {
      compile: { success: true, diagnostics: [] },
      runtime: { errors: snapshot.runtimeErrors },
      inspection: { scene: snapshot.scene, nodes: Object.values(snapshot.nodes), assets: snapshot.assets },
      validation,
      visual: snapshot.capture ? { screenshot: snapshot.capture.png } : {},
      policy: { denied: [...harness.denials] }
    };
  }
  async safeStart(workspace, benchmark, options) {
    try {
      void benchmark;
      void options;
      this.lastStartError = null;
      return await this.runtime.start(workspace, benchmark);
    } catch (error) {
      this.lastStartError = String(error instanceof Error ? error.message : error);
      return null;
    }
  }
  knowledgePaths(_benchmark) {
    return [];
  }
  policyConfig(benchmark) {
    return {
      writablePaths: benchmark.writablePaths,
      readablePaths: benchmark.readablePaths,
      protectedPaths: benchmark.protectedPaths,
      allowedCommands: benchmark.allowedCommands,
      allowedPathRoots: benchmark.writablePaths,
      allowedNetworkHosts: benchmark.allowedNetworkHosts
    };
  }
  outcome(workspace, options, trialResult, engineResult, agentResult, failureDomain, failureReason, repairs, firstSubmissionCompilePass, denials, validators = []) {
    const violations = workspace.isolationViolations();
    if (violations.length > 0) {
      return {
        trialResult: "INVALID_RUN",
        engineResult: "NOT_EVALUATED",
        agentResult: "NOT_EVALUATED",
        failureDomain: "ISOLATION",
        failureReason: `protected files tampered: ${violations.join(", ")}`,
        repairs,
        firstSubmissionCompilePass,
        policyDenials: denials,
        validators
      };
    }
    void options;
    return { trialResult, engineResult, agentResult, failureDomain, failureReason, repairs, firstSubmissionCompilePass, policyDenials: denials, validators, workspaceDir: workspace.paths.workspace };
  }
};
function buildManifest(options, benchmark, fixtureHash, referenceHash) {
  return {
    cocosairRevision: options.cocosairRevision,
    benchmarkCatalogRevision: options.catalogRevision,
    benchmarkId: benchmark.id,
    benchmarkVersion: benchmark.version,
    startingFixtureHash: fixtureHash,
    referenceImplementationHash: referenceHash,
    os: options.environment.os,
    browser: options.environment.browser,
    viewport: options.environment.viewport,
    webglBackend: options.environment.webglBackend,
    agentProfile: options.agentProfile,
    knowledgeProfile: benchmark.knowledgeProfile,
    allowedTools: benchmark.allowedTools,
    allowedCommands: benchmark.allowedCommands.map((c) => c.command),
    networkPolicy: benchmark.allowedNetworkHosts.length ? benchmark.allowedNetworkHosts.join(",") : "offline",
    repairBudget: benchmark.repairBudget,
    timeBudgetMs: benchmark.timeBudgetMs,
    cacheMode: options.cacheMode,
    randomSeed: options.randomSeed
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TrialRunner,
  buildManifest
});
