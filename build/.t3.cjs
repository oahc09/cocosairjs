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

// tools/benchmark/recipes/schema.ts
var schema_exports = {};
__export(schema_exports, {
  checkCoverage: () => checkCoverage,
  recipeStats: () => recipeStats
});
module.exports = __toCommonJS(schema_exports);
function recipeStats(recipes) {
  const live = recipes.filter((r) => r.status !== "deprecated");
  const validated = live.filter((r) => r.status === "validated" || r.status === "stable");
  return {
    catalogTotal: live.length,
    validatedCount: validated.length,
    stableCount: live.filter((r) => r.status === "stable").length
  };
}
function coverageProof(recipe, ctx) {
  return (ctx.evidence ?? []).some((e) => {
    const referenced = e.source.kind === "benchmark" ? recipe.benchmarkRefs.includes(e.source.id) && ctx.benchmarkIds.has(e.source.id) : recipe.exampleRefs.includes(e.source.id) && ctx.exampleHasEntry?.get(e.source.id) === true;
    return referenced && e.recipeId === recipe.id && e.recipeVersion === recipe.version && !!e.runId && !!e.revision && e.result === "PASS" && e.sceneSetup === recipe.sceneSetup && e.runtimeState === recipe.runtimeState && e.visualTarget === recipe.visualTarget && recipe.requiredAssets.every((x) => e.requiredAssets.includes(x)) && recipe.requiredCapabilities.every((x) => e.requiredCapabilities.includes(x)) && recipe.interactionSteps.every((x) => e.interactionSteps.includes(x)) && e.checks.scene && e.checks.interaction && e.checks.visual && e.checks.noRuntimeErrors && (recipe.status !== "stable" || e.checks.lifecycle);
  });
}
function checkCoverage(recipes, ctx) {
  const dangling = [];
  for (const recipe of recipes) {
    for (const b of recipe.benchmarkRefs) {
      if (!ctx.benchmarkIds.has(b)) {
        dangling.push(`${recipe.id}: benchmarkRef ${b} \u4E0D\u5B58\u5728`);
      }
    }
    for (const e of recipe.exampleRefs) {
      if (!ctx.exampleIds.has(e)) {
        dangling.push(`${recipe.id}: exampleRef ${e} \u4E0D\u5B58\u5728`);
      } else if (ctx.exampleHasEntry && ctx.exampleHasEntry.get(e) !== true) {
        dangling.push(`${recipe.id}: exampleRef ${e} \u65E0\u53EF\u8FD0\u884C\u5165\u53E3`);
      }
    }
    for (const v of recipe.validatorRefs) {
      if (!ctx.validatorIds.has(v)) {
        dangling.push(`${recipe.id}: validatorRef ${v} \u4E0D\u5B58\u5728`);
      }
    }
    if (recipe.status === "validated" || recipe.status === "stable") {
      for (const [field, value] of Object.entries({
        sceneSetup: recipe.sceneSetup,
        runtimeState: recipe.runtimeState,
        visualTarget: recipe.visualTarget
      })) {
        if (!value) {
          dangling.push(`${recipe.id}: ${field} required for ${recipe.status}`);
        }
      }
    }
    if (recipe.status === "validated" || recipe.status === "stable") {
      if (!coverageProof(recipe, ctx)) {
        dangling.push(`${recipe.id}: ${recipe.status} requires passing version-matched composite evidence`);
      }
    }
  }
  return dangling;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  checkCoverage,
  recipeStats
});
