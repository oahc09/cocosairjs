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

// tools/benchmark/recipes/recipes30.ts
var recipes30_exports = {};
__export(recipes30_exports, {
  RECIPES: () => RECIPES,
  RECIPES_CATALOG: () => RECIPES_CATALOG
});
module.exports = __toCommonJS(recipes30_exports);
var r = (id, name, status, description, refs, interaction, visual) => ({
  id,
  version: "1.0.0",
  name,
  status,
  // 由 evidence 驱动晋级（run-recipes-browser.cjs 验证后生效）
  targetStatus: status,
  description,
  sceneSetup: "Code First \u573A\u666F\uFF1AcreateAirApp(#GameCanvas) + \u76F8\u673A + \u5E73\u884C\u5149 + \u8D44\u4EA7/\u7F51\u683C\u8282\u70B9",
  requiredAssets: [],
  requiredCapabilities: ["webgl2"],
  runtimeState: "\u573A\u666F\u8FD0\u884C\u4E2D\uFF1Brenderer \u5C31\u7EEA\uFF1B\u65E0\u963B\u585E\u8FD0\u884C\u65F6\u9519\u8BEF",
  interactionSteps: interaction,
  visualTarget: visual,
  benchmarkRefs: refs.benchmarks,
  exampleRefs: refs.examples,
  validatorRefs: refs.validators,
  visualRefs: ["visible-frame"],
  tags: ["v06-recipe"]
});
var baseValidators = ["scene-ready", "node-exists", "no-runtime-error"];
var RECIPES = [
  // ---- Character R001-R005 ----
  r(
    "R001",
    "Character Showcase",
    "stable",
    "\u5C55\u793A\u4E00\u4E2A\u5E26\u6750\u8D28\u7684\u89D2\u8272\u7684\u6807\u51C6\u5448\u73B0\uFF1A\u52A0\u8F7D\u6A21\u578B\u3001\u53D6\u666F\u3001\u5149\u7167\u4E0E\u6E32\u67D3\u9A8C\u8BC1\u3002",
    { benchmarks: ["B001", "B042"], examples: ["gltf-viewer"], validators: baseValidators },
    ["\u6253\u5F00\u9875\u9762\u5373\u81EA\u52A8\u5C55\u793A", "\u62D6\u52A8\u753B\u5E03\u65CB\u8F6C\u89C6\u89D2\uFF08\u53EF\u9009\uFF09"],
    "\u6A21\u578B\u5728\u753B\u9762\u4E2D\u5FC3\u4E14\u7EB9\u7406\u53EF\u89C1"
  ),
  r(
    "R002",
    "Character Animation Viewer",
    "stable",
    "\u9AA8\u9ABC/\u53D8\u5F62\u52A8\u753B\u64AD\u653E\u67E5\u770B\u5668\uFF1A\u5B9E\u4F8B\u5316\u540E\u542F\u52A8\u9996\u4E2A AnimationClip \u5E76\u6301\u7EED\u6E32\u67D3\u3002",
    { benchmarks: ["B061", "B064"], examples: ["skinned-animation"], validators: [...baseValidators, "animation-playing"] },
    ["\u9875\u9762\u52A0\u8F7D\u540E\u81EA\u52A8\u64AD\u653E\u52A8\u753B", "\u5E27\u95F4\u753B\u9762\u5DEE\u5F02\u9A8C\u8BC1\u52A8\u753B\u786E\u5B9E\u5728\u64AD"],
    "\u52A8\u753B\u5E27\u95F4\u753B\u9762\u53D8\u5316\uFF08frame-diff \u901A\u8FC7\uFF09"
  ),
  r(
    "R003",
    "Character Interaction",
    "stable",
    "\u89D2\u8272\u4E0E\u8F93\u5165\u4EA4\u4E92\uFF1A\u952E\u76D8/\u6307\u9488\u4E8B\u4EF6\u9A71\u52A8\u89D2\u8272\u8282\u70B9\u4F4D\u79FB\u6216\u65CB\u8F6C\u3002",
    { benchmarks: ["B081", "B085"], examples: ["input"], validators: baseValidators },
    ["\u6309\u952E/\u62D6\u62FD\u89E6\u53D1\u89D2\u8272\u54CD\u5E94"],
    "\u89D2\u8272\u968F\u8F93\u5165\u4EA7\u751F\u4F4D\u59FF\u53D8\u5316"
  ),
  r(
    "R004",
    "Multi Character Scene",
    "stable",
    "\u591A\u89D2\u8272\u540C\u573A\u666F\uFF1A\u4E00\u4E2A\u8D44\u4EA7\u591A\u6B21\u5B9E\u4F8B\u5316\u5E76\u6446\u653E\u4E0D\u540C\u4F4D\u7F6E\u3002",
    { benchmarks: ["B045"], examples: ["gltf-viewer"], validators: [...baseValidators, "node-count"] },
    ["\u591A\u5B9E\u4F8B\u540C\u5C4F\u5448\u73B0"],
    "\u4E24\u5904\u4EE5\u4E0A\u6A21\u578B\u5B9E\u4F8B\u540C\u65F6\u53EF\u89C1"
  ),
  r(
    "R005",
    "Character Material Preview",
    "stable",
    "\u89D2\u8272\u6750\u8D28\u9884\u89C8\uFF1A\u4E3A\u6A21\u578B\u8282\u70B9\u66FF\u6362/\u6307\u5B9A\u6750\u8D28\u5E76\u6E32\u67D3\u9A8C\u8BC1\u3002",
    { benchmarks: ["B037", "B078"], examples: ["static-model"], validators: [...baseValidators, "material-property"] },
    ["\u67E5\u770B\u6750\u8D28\u53D8\u4F53"],
    "\u5404\u6750\u8D28\u53D8\u4F53\u6E32\u67D3\u6B63\u786E"
  ),
  // ---- Product / Model R006-R010 ----
  r(
    "R006",
    "Product Viewer",
    "stable",
    "\u4EA7\u54C1\u67E5\u770B\u5668\u57FA\u578B\uFF1A\u52A0\u8F7D glTF \u4EA7\u54C1\u6A21\u578B\u3001\u81EA\u52A8\u53D6\u666F\u3001\u9519\u8BEF\u4E3A\u96F6\u3002",
    { benchmarks: ["B042", "B079"], examples: ["gltf-viewer"], validators: [...baseValidators, "visible-frame"] },
    ["\u9875\u9762\u52A0\u8F7D\u5373\u5B8C\u6574\u5448\u73B0\u4EA7\u54C1"],
    "\u4EA7\u54C1\u5C45\u4E2D\u4E14\u7EB9\u7406\u5B8C\u6574"
  ),
  r(
    "R007",
    "360 Model Viewer",
    "stable",
    "360\xB0 \u67E5\u770B\uFF1A\u6307\u9488\u62D6\u62FD\u73AF\u7ED5\u6A21\u578B\uFF08\u76F8\u673A\u6216\u6A21\u578B\u65CB\u8F6C\uFF09\u3002",
    { benchmarks: ["B090"], examples: ["input"], validators: baseValidators },
    ["\u6309\u4F4F\u62D6\u62FD \u2192 \u6A21\u578B/\u76F8\u673A\u65CB\u8F6C"],
    "\u62D6\u62FD\u8FC7\u7A0B\u6A21\u578B\u59FF\u6001\u8FDE\u7EED\u53D8\u5316"
  ),
  r(
    "R008",
    "Exploded Model Showcase",
    "stable",
    "\u7206\u70B8\u56FE\u5C55\u793A\uFF1A\u6A21\u578B\u5B50\u8282\u70B9\u6309\u504F\u79FB\u5C55\u5F00\u5448\u73B0\u3002",
    { benchmarks: ["B004"], examples: ["gltf-viewer"], validators: [...baseValidators, "transform-equals"] },
    ["\u5C55\u5F00/\u6536\u8D77\u5207\u6362"],
    "\u5B50\u90E8\u4EF6\u6309\u504F\u79FB\u5206\u79BB\u6E32\u67D3"
  ),
  r(
    "R009",
    "Material Variant Viewer",
    "stable",
    "\u6750\u8D28\u53D8\u4F53\u5E76\u6392\u5BF9\u6BD4\uFF1A\u540C\u4E00\u51E0\u4F55\u4F53\u591A\u6750\u8D28\u5B9E\u4F8B\u3002",
    { benchmarks: ["B078"], examples: ["static-model"], validators: [...baseValidators, "material-property"] },
    ["\u5E76\u6392\u67E5\u770B\u53D8\u4F53"],
    "\u591A\u4E2A\u6750\u8D28\u5B9E\u4F8B\u540C\u65F6\u53EF\u89C1"
  ),
  r(
    "R010",
    "Model Comparison Viewer",
    "stable",
    "\u53CC\u6A21\u578B\u5BF9\u6BD4\uFF1A\u4E24\u4E2A\u6A21\u578B\u5B9E\u4F8B\u5DE6\u53F3\u5206\u5217\u6E32\u67D3\u3002",
    { benchmarks: ["B045", "B073"], examples: ["gltf-viewer"], validators: [...baseValidators, "node-count"] },
    ["\u540C\u5C4F\u5BF9\u6BD4\u4E24\u4E2A\u6A21\u578B"],
    "\u4E24\u6A21\u578B\u540C\u65F6\u53EF\u89C1"
  ),
  // ---- Camera / Presentation R011-R015 ----
  r(
    "R011",
    "Auto Framing",
    "stable",
    "\u81EA\u52A8\u53D6\u666F\uFF1AframeObject \u6309\u5305\u56F4\u76D2\u6846\u4F4F\u4EFB\u610F\u6A21\u578B\u3002",
    { benchmarks: ["B042", "B011"], examples: ["camera"], validators: [...baseValidators, "visible-frame"] },
    ["\u8C03\u7528 frameObject \u540E\u6A21\u578B\u6070\u597D\u5145\u6EE1\u89C6\u53E3"],
    "\u6A21\u578B\u5B8C\u6574\u5165\u753B\u4E14\u5C45\u4E2D"
  ),
  r(
    "R012",
    "Camera Tour",
    "stable",
    "\u76F8\u673A\u5DE1\u6E38\uFF1A\u76F8\u673A\u6CBF\u9884\u8BBE\u8DEF\u5F84\u8FDE\u7EED\u8FD0\u52A8\u6E32\u67D3\u3002",
    { benchmarks: ["B012", "B016"], examples: ["camera"], validators: [...baseValidators, "visible-frame"] },
    ["\u81EA\u52A8\u5DE1\u6E38\u64AD\u653E"],
    "\u5DE1\u6E38\u5404\u5E27\u753B\u9762\u8FDE\u7EED\u4E14\u6A21\u578B\u53EF\u89C1"
  ),
  r(
    "R013",
    "Cinematic Camera Transition",
    "stable",
    "\u76F8\u673A\u8FC7\u6E21\uFF1A\u4E24\u7EC4\u673A\u4F4D\u95F4\u5E73\u6ED1\u63D2\u503C\u5207\u6362\u3002",
    { benchmarks: ["B013", "B019"], examples: ["camera"], validators: baseValidators },
    ["\u89E6\u53D1\u8FC7\u6E21\u52A8\u753B"],
    "\u8FC7\u6E21\u8FC7\u7A0B\u753B\u9762\u5E73\u6ED1\u65E0\u8DF3\u53D8\u62A5\u9519"
  ),
  r(
    "R014",
    "Orthographic Product View",
    "stable",
    "\u6B63\u4EA4\u4EA7\u54C1\u89C6\u56FE\uFF1A\u7B49\u5C3A\u5BF8\u5448\u73B0\uFF08orthoHeight \u63A7\u5236\uFF09\u3002",
    { benchmarks: ["B020"], examples: ["camera"], validators: [...baseValidators, "visible-frame"] },
    ["\u5207\u6362\u6B63\u4EA4/\u900F\u89C6"],
    "\u6B63\u4EA4\u6A21\u5F0F\u4E0B\u8FD1\u8FDC\u7269\u4F53\u540C\u5C3A\u5BF8"
  ),
  r(
    "R015",
    "Multi Camera Presentation",
    "stable",
    "\u591A\u76F8\u673A\u5448\u73B0\uFF1A\u4E3B/\u526F\u76F8\u673A\u6309\u4F18\u5148\u7EA7\u7EC4\u5408\u8F93\u51FA\u3002",
    { benchmarks: ["B015"], examples: ["camera"], validators: baseValidators },
    ["\u53CC\u673A\u4F4D\u5448\u73B0"],
    "\u4E3B\u76F8\u673A\u753B\u9762\u6B63\u5E38\u6E32\u67D3"
  ),
  // ---- Interaction R016-R020 ----
  r(
    "R016",
    "Click To Animate",
    "validated",
    "\u70B9\u51FB\u89E6\u53D1\u52A8\u753B\uFF1A\u6307\u9488\u4E8B\u4EF6\u9A71\u52A8 Animation \u7EC4\u4EF6\u64AD\u653E\u3002",
    { benchmarks: ["B085", "B061"], examples: ["input"], validators: [...baseValidators, "animation-playing"] },
    ["\u70B9\u51FB \u2192 \u52A8\u753B\u64AD\u653E"],
    "\u52A8\u753B\u72B6\u6001\u968F\u70B9\u51FB\u5207\u6362"
  ),
  r(
    "R017",
    "Click To Change Material",
    "validated",
    "\u70B9\u51FB\u6362\u6750\u8D28\uFF1A\u4E8B\u4EF6\u5207\u6362\u8282\u70B9\u6750\u8D28\u5B9E\u4F8B\u3002",
    { benchmarks: ["B037"], examples: ["static-model"], validators: [...baseValidators, "material-property"] },
    ["\u70B9\u51FB \u2192 \u6750\u8D28\u5207\u6362"],
    "\u6750\u8D28\u5207\u6362\u6E32\u67D3\u5373\u65F6\u751F\u6548"
  ),
  r(
    "R018",
    "Drag Object",
    "stable",
    "\u62D6\u62FD\u7269\u4F53\uFF1A\u6307\u9488\u62D6\u52A8\u76F4\u63A5\u9A71\u52A8\u8282\u70B9\u4F4D\u59FF\u3002",
    { benchmarks: ["B090"], examples: ["input"], validators: baseValidators },
    ["\u6309\u4F4F\u62D6\u52A8 \u2192 \u7269\u4F53\u8DDF\u968F"],
    "\u7269\u4F53\u4F4D\u59FF\u968F\u62D6\u62FD\u8FDE\u7EED\u53D8\u5316"
  ),
  r(
    "R019",
    "Object Selection",
    "validated",
    "\u7269\u4F53\u9009\u4E2D\uFF1A\u6307\u9488\u4F4D\u7F6E\u53CD\u67E5\u573A\u666F\u8282\u70B9\u5E76\u9AD8\u4EAE\u53CD\u9988\u3002",
    { benchmarks: ["B086"], examples: ["input"], validators: baseValidators },
    ["\u70B9\u51FB\u7269\u4F53 \u2192 \u9009\u4E2D\u53CD\u9988"],
    "\u9009\u4E2D\u72B6\u6001\u5728\u753B\u9762\u53EF\u89C1"
  ),
  r(
    "R020",
    "Interactive Hotspot",
    "validated",
    "\u4EA4\u4E92\u70ED\u70B9\uFF1A\u8282\u70B9\u6302\u8F7D\u70ED\u70B9\u6807\u8BB0\u4E0E\u4E8B\u4EF6\u54CD\u5E94\u3002",
    { benchmarks: ["B007", "B083"], examples: ["hello-cube"], validators: baseValidators },
    ["\u70ED\u70B9\u60AC\u505C/\u70B9\u51FB\u53CD\u9988"],
    "\u70ED\u70B9\u6807\u8BB0\u53EF\u89C1\u4E14\u4E8B\u4EF6\u751F\u6548"
  ),
  // ---- Material / Visual R021-R025 ----
  r(
    "R021",
    "Glass Product",
    "stable",
    "\u73BB\u7483\u8D28\u611F\u4EA7\u54C1\uFF1Aalpha \u6DF7\u5408\u6750\u8D28\u53E0\u52A0\u6E32\u67D3\u3002",
    { benchmarks: ["B074"], examples: ["static-model"], validators: [...baseValidators, "visible-frame"] },
    ["\u67E5\u770B\u900F\u660E\u53E0\u52A0\u6548\u679C"],
    "\u900F\u660E\u4E0E\u5B9E\u5FC3\u7269\u4F53\u6B63\u786E\u53E0\u6E32"
  ),
  r(
    "R022",
    "Clearcoat Product",
    "validated",
    "\u6E05\u6F06\u5C42\u4EA7\u54C1\uFF1A\u6807\u51C6\u6750\u8D28\u9AD8\u5149\u5C42\u5448\u73B0\u3002",
    { benchmarks: ["B072"], examples: ["static-model"], validators: [...baseValidators, "material-property"] },
    ["\u67E5\u770B\u6E05\u6F06\u9AD8\u5149"],
    "\u9AD8\u5149\u5C42\u968F\u89C6\u89D2\u53D8\u5316"
  ),
  r(
    "R023",
    "Transmission Object",
    "validated",
    "\u900F\u5C04\u7269\u4F53\uFF1Atransmission \u6750\u8D28\u80FD\u529B\u5448\u73B0\uFF08\u80FD\u529B\u5408\u540C\uFF1Aunsupported \u65F6\u5E72\u51C0\u56DE\u9000\uFF09\u3002",
    { benchmarks: ["B055"], examples: ["static-model"], validators: [...baseValidators, "capability-status"] },
    ["\u67E5\u770B\u900F\u5C04\u6548\u679C\u6216\u56DE\u9000\u63D0\u793A"],
    "\u900F\u5C04\u6E32\u67D3\u6216\u53D7\u63A7\u56DE\u9000"
  ),
  r(
    "R024",
    "Anisotropic Material Showcase",
    "validated",
    "\u5404\u5411\u5F02\u6027\u6750\u8D28\u5C55\u793A\uFF08\u80FD\u529B\u5408\u540C\u540C\u4E0A\uFF09\u3002",
    { benchmarks: ["B056"], examples: ["static-model"], validators: [...baseValidators, "capability-status"] },
    ["\u67E5\u770B\u5404\u5411\u5F02\u6027\u6548\u679C\u6216\u56DE\u9000"],
    "\u5404\u5411\u5F02\u6027\u6E32\u67D3\u6216\u53D7\u63A7\u56DE\u9000"
  ),
  r(
    "R025",
    "Iridescent Material Showcase",
    "validated",
    "\u8679\u5F69\u6750\u8D28\u5C55\u793A\uFF08\u80FD\u529B\u5408\u540C\u540C\u4E0A\uFF09\u3002",
    { benchmarks: ["B053"], examples: ["static-model"], validators: [...baseValidators, "capability-status"] },
    ["\u67E5\u770B\u8679\u5F69\u6548\u679C\u6216\u56DE\u9000"],
    "\u8679\u5F69\u6E32\u67D3\u6216\u53D7\u63A7\u56DE\u9000"
  ),
  // ---- Experience R026-R030 ----
  r(
    "R026",
    "Interactive Wallpaper",
    "stable",
    "\u4EA4\u4E92\u58C1\u7EB8\uFF1A\u5168\u5C4F\u52A8\u6001\u80CC\u666F\u573A\u666F\uFF08\u52A8\u753B\u7F51\u683C + \u6307\u9488\u54CD\u5E94\uFF09\u3002",
    { benchmarks: ["B006", "B068"], examples: ["hello-cube"], validators: [...baseValidators, "visible-frame"] },
    ["\u80CC\u666F\u6301\u7EED\u52A8\u6548"],
    "\u5168\u5C4F\u753B\u9762\u6301\u7EED\u53D8\u5316\u65E0\u62A5\u9519"
  ),
  r(
    "R027",
    "3D Landing Hero",
    "stable",
    "3D \u843D\u5730\u9875 Hero\uFF1A\u6A21\u578B + \u81EA\u52A8\u53D6\u666F + \u5165\u573A\u52A8\u6548\u7EC4\u5408\u3002",
    { benchmarks: ["B049", "B011"], examples: ["gltf-viewer"], validators: [...baseValidators, "visible-frame"] },
    ["\u52A0\u8F7D\u5373\u5448\u73B0 Hero \u753B\u9762"],
    "Hero \u6A21\u578B\u5C45\u4E2D\u5B8C\u6574\u5448\u73B0"
  ),
  r(
    "R028",
    "Animated Logo Scene",
    "stable",
    "\u52A8\u6001 Logo\uFF1A\u51E0\u4F55\u4F53\u6784\u6210\u7684\u65CB\u8F6C/\u8109\u51B2 Logo \u573A\u666F\u3002",
    { benchmarks: ["B007", "B068"], examples: ["hello-cube"], validators: [...baseValidators, "visible-frame"] },
    ["Logo \u6301\u7EED\u52A8\u6548"],
    "Logo \u52A8\u6548\u8FDE\u7EED\u6E32\u67D3"
  ),
  r(
    "R029",
    "Simple Weather Scene",
    "validated",
    "\u7B80\u5355\u5929\u6C14\u573A\u666F\uFF1A\u7C92\u5EA6\u5316\u7684\u660E\u6697\u4E0E\u5149\u7167\u7EC4\u5408\u8868\u8FBE\u3002",
    { benchmarks: ["B023", "B024"], examples: ["hello-cube"], validators: [...baseValidators, "visible-frame"] },
    ["\u5207\u6362\u5929\u6C14\u7167\u660E"],
    "\u4E0D\u540C\u5149\u7167\u4E0B\u573A\u666F\u6B63\u5E38\u6E32\u67D3"
  ),
  r(
    "R030",
    "AI Generated Scene Prototype",
    "validated",
    "AI \u751F\u6210\u573A\u666F\u539F\u578B\uFF1A\u7531 agent session \u89C2\u5BDF\u9A71\u52A8\u7684\u6700\u5C0F\u751F\u6210\u5F0F\u7EC4\u5408\uFF08\u9A8C\u8BC1 Agent \u53CD\u9988\u73AF\uFF09\u3002",
    { benchmarks: ["B091", "B092", "B097"], examples: ["automation"], validators: [...baseValidators, "node-count"] },
    ["session \u521B\u5EFA\u8282\u70B9 \u2192 \u8BBE\u53D8\u6362 \u2192 \u6355\u5E27\u9A8C\u8BC1"],
    "session \u521B\u5EFA\u7684\u5185\u5BB9\u53EF\u89C1"
  )
];
var RECIPES_CATALOG = { revision: "recipes-r2", recipes: RECIPES };
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RECIPES,
  RECIPES_CATALOG
});
