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
var stdin_exports = {};
__export(stdin_exports, {
  IsolationLedger: () => IsolationLedger,
  Policy: () => Policy,
  PolicyDeniedError: () => PolicyDeniedError,
  resolveWithin: () => resolveWithin,
  sha256: () => sha256
});
module.exports = __toCommonJS(stdin_exports);
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var import_crypto = require("crypto");
class PolicyDeniedError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "PolicyDeniedError";
  }
  code;
}
const EVAL_STYLE_FLAGS = /* @__PURE__ */ new Set(["-e", "--eval", "-p", "--print", "-c", "--command", "--exec"]);
const DEFAULT_DENY_COMMAND_FRAGMENTS = [
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
class Policy {
  constructor(config, workspaceRoot) {
    this.config = config;
    this.workspaceRoot = workspaceRoot;
  }
  config;
  workspaceRoot;
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
}
class IsolationLedger {
  constructor(workspaceRoot, files, protectedRoots) {
    this.files = files;
    this.protectedRoots = protectedRoots;
    this.workspaceRoot = workspaceRoot;
    for (const rel of files) {
      const abs = path.resolve(this.workspaceRoot, rel);
      this.baseline.set(rel, fs.existsSync(abs) ? sha256(fs.readFileSync(abs)) : "<missing>");
    }
    for (const dir of protectedRoots) {
      this.dirBaselines.set(dir, this.dirManifest(dir));
    }
  }
  files;
  protectedRoots;
  baseline = /* @__PURE__ */ new Map();
  dirBaselines = /* @__PURE__ */ new Map();
  workspaceRoot;
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
}
function sha256(data) {
  const buf = typeof data === "string" || !Buffer.isBuffer(data) ? fs.readFileSync(data) : data;
  return (0, import_crypto.createHash)("sha256").update(buf).digest("hex");
}
