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

// tools/benchmark/driver/profile-a001.ts
var profile_a001_exports = {};
__export(profile_a001_exports, {
  PROFILE_A001: () => PROFILE_A001,
  createA001Driver: () => createA001Driver,
  createA001Run: () => createA001Run
});
module.exports = __toCommonJS(profile_a001_exports);

// tools/benchmark/driver/manual-driver.ts
var ManualAgentDriver = class {
  constructor(id = "manual-A000") {
    this.task = null;
    /** 脚本化动作队列：自动测试时逐个弹出作为 nextAction 的返回值。 */
    this.scripted = [];
    /** 人工模式：Prompt 与待反馈的记录（外部进程读取/写入 scriptedActions.json 交互）。 */
    this.log = [];
    this.id = id;
  }
  /** 注入脚本动作序列（自动化测试专用；人工模式不调用）。 */
  script(...actions) {
    this.scripted.push(...actions);
  }
  /** 人工/脚本模式通用的动作追加入口（外部导入修改后由 Runner 提交）。 */
  push(action) {
    this.log.push(`push:${action.type}`);
    this.scripted.push(action);
  }
  async startTask(context) {
    this.task = context.task;
    return {
      submitTask: async (task) => {
        this.task = task;
        this.log.push(`task:${task.benchmarkId}`);
      },
      nextAction: async (_input) => {
        const next = this.scripted.shift();
        if (!next) {
          return { type: "finish", summary: "manual: no more scripted actions (awaiting human input)" };
        }
        this.log.push(`next:${next.type}`);
        return next;
      },
      provideFeedback: async (feedback) => {
        this.log.push(`feedback:compile=${feedback.compile.success},validators=${feedback.validation.length},denied=${feedback.policy.denied.length}`);
      },
      finish: async () => ({ summary: "manual driver finished" })
    };
  }
  /** 供 Reporter/调试读取的交互日志。 */
  transcript() {
    return [...this.log];
  }
};

// tools/benchmark/driver/profile-a001.ts
var PROFILE_A001 = {
  profileId: "A001",
  driver: "ManualAgentDriver(scripted)",
  model: "scripted-reference-solver",
  modelVersion: "v06-r1",
  systemInstruction: "\u6309 Benchmark Prompt \u751F\u6210\u6700\u5C0F\u6B63\u786E\u89E3\uFF1B\u6240\u6709\u52A8\u4F5C\u7ECF Harness\uFF1B\u9047\u7B56\u7565\u62D2\u7EDD\u4FEE\u6B63\u81EA\u8EAB\u884C\u4E3A\u3002",
  knowledgeProfile: "K2",
  allowedTools: ["read-file", "write-file", "patch-file", "run-command", "request-runtime-inspection", "request-frame-capture", "request-error-report", "finish"],
  repairBudget: 5,
  randomness: "n/a (scripted)"
};
function createA001Driver(benchmarkId, solutionProvider) {
  const driver = new ManualAgentDriver(PROFILE_A001.profileId);
  const actions = solutionProvider(benchmarkId);
  driver.script(...actions);
  return {
    id: PROFILE_A001.profileId,
    startTask: (context) => driver.startTask(context)
  };
}
function createA001Run(driver) {
  void driver;
  throw new Error("use driver.startTask(context) directly");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PROFILE_A001,
  createA001Driver,
  createA001Run
});
