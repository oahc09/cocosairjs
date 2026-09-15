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
  TrialWorkspace: () => TrialWorkspace,
  sha256: () => import_policy2.sha256
});
module.exports = __toCommonJS(stdin_exports);
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var crypto = __toESM(require("crypto"));
var import_policy = require("./policy");
var import_policy2 = require("./policy");
void crypto;
class TrialWorkspace {
  paths;
  policy;
  ledger;
  constructor(paths, policy, ledger) {
    this.paths = paths;
    this.policy = policy;
    this.ledger = ledger;
  }
  /** 从 Immutable Fixture 创建隔离 Trial（fixture 只读复制）。 */
  static create(options) {
    const runId = `run-${crypto.randomUUID()}`;
    const runRoot = path.join(options.workRoot, runId);
    const workspace = path.join(runRoot, "workspace");
    const protectedDir = path.join(runRoot, "protected");
    fs.mkdirSync(workspace, { recursive: true });
    fs.mkdirSync(protectedDir, { recursive: true });
    if (!options.skipFixtureCopy) {
      copyTree(options.fixtureDir, workspace);
    }
    const policy = new import_policy.Policy(options.policyConfig, workspace);
    const ledgerFiles = options.ledgerFiles ?? [];
    const ledgerRoots = fs.existsSync(path.join(workspace, "protected")) ? ["protected"] : [];
    const ledger = new import_policy.IsolationLedger(workspace, ledgerFiles, [...ledgerRoots, "../protected"]);
    return new TrialWorkspace({ runRoot, workspace, protectedDir, manifestFile: path.join(runRoot, "manifest.json") }, policy, ledger);
  }
  /** §32：结束审计——受保护文件被篡改 = ISOLATION 突破。 */
  isolationViolations() {
    return this.ledger.violations();
  }
}
function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyTree(src, dst);
    } else {
      fs.copyFileSync(src, dst);
    }
  }
}
function listFilesRelative(dir, prefix = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...listFilesRelative(path.join(dir, entry.name), rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}
