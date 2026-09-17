/* V1.1 F1 — Public API Inventory（tier 分类 + 仅 public + 含 constructor/property）。
 * 执行：node tools/examples/api-inventory.cjs
 * 产出：docs/example-api-inventory.json
 *
 * tier 分类规则：
 *   core     — Runtime / glTF / Camera / Input / Material 的导出类和顶层函数
 *   important — Animation / Skeleton / Tween / Primitive / Texture / Skeleton
 *   advanced  — 其余（Physics / Particle / Legacy / 内部模块等）
 */
var fs = require('fs');
var path = require('path');
var REPO = path.resolve(__dirname, '..', '..');
var DTS = path.join(REPO, 'build', 'cocosair.module.d.ts');
var OUT = path.join(REPO, 'docs', 'example-api-inventory.json');

var CORE_NS = /^((utils|geometry|math|gfx)\.|(Scene|Node|MeshRenderer|Camera|DirectionalLight|Light|SpotLight|PointLight|SphereLight|AmbientLight|ModelRenderer|Layers|Color|Vec3|Mesh|Material|Texture2D|GLTFLoader|GLTFAsset|GLTFInstance|GLTFExtensionRegistry|input|Input|createAirApp|frameObject|createMesh|builtinResMgr|primitives|MeshUtils|BatchingUtility|director|game|isValid|instantiate))/;
var IMPORTANT_NS = /((Animation|AnimationClip|SkeletalAnimation|Skeleton|SkinnedMeshRenderer|SkinnedMeshUnit|tween|TweenSystem|primitives|Texture2D|TextureCube|Material|EffectAsset|MeshUtils|Particle|Billboard|Line|Circle|Ellipse|Filled|Graphics|UIRenderer|widget|label|sprite))/i;

function classifyTier(fqName, kind) {
  if (CORE_NS.test(fqName)) return 'core';
  if (IMPORTANT_NS.test(fqName)) return 'important';
  return 'advanced';
}

(function main() {
  if (!fs.existsSync(DTS)) {
    console.error('[api-inventory] .d.ts not found. Run `npm run build:dts` first.');
    process.exit(1);
  }
  var source = fs.readFileSync(DTS, 'utf8');
  var lines = source.split('\n');
  var nsStack = [];
  var classStack = [];
  var units = {};
  var order = [];

  function addUnit(fqName, kind, tier, parent) {
    if (units[fqName]) return;
    units[fqName] = { kind: kind, tier: tier, coverageRequired: tier !== 'advanced', parent: parent || null };
    order.push(fqName);
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.trim();
    var nsPath = nsStack.join('.');
    var fqPrefix = nsPath ? nsPath + '.' : '';

    // Namespace open
    var ns = trimmed.match(/^export (?:declare )?namespace (\w+)/);
    if (ns) { nsStack.push(ns[1]); continue; }

    // Class open
    var cls = trimmed.match(/^export (?:declare )?class (\w+)/);
    if (cls) {
      var clsFq = fqPrefix + cls[1];
      classStack.push(clsFq);
      var tier = classifyTier(clsFq, 'class');
      addUnit(clsFq, 'class', tier);
      // Constructor as coverage unit
      addUnit(clsFq + '.constructor', 'constructor', tier, clsFq);
      continue;
    }

    // Close brace: pop class or namespace
    if (trimmed === '}') {
      if (classStack.length) { classStack.pop(); continue; }
      if (nsStack.length) { nsStack.pop(); continue; }
      continue;
    }

    // Skip private/protected
    if (/^\s*(private|protected)\s/.test(line)) continue;

    // Inside class: methods, properties
    if (classStack.length) {
      var curFq = classStack[classStack.length - 1];
      var curTier = units[curFq] ? units[curFq].tier : 'advanced';
      // Method
      var mm = trimmed.match(/^(?:(?:public|static|override|async|abstract)\s+)*(\w+)\s*\(/);
      if (mm && mm[1] !== 'constructor' && !trimmed.startsWith('*') && !trimmed.startsWith('/') && !trimmed.startsWith('#')) {
        var mFq = curFq + '.' + mm[1];
        var mKind = /\bstatic\b/.test(trimmed) ? 'static' : 'method';
        addUnit(mFq, mKind, curTier, curFq);
        continue;
      }
      // Constructor
      if (/constructor\s*\(/.test(trimmed)) {
        addUnit(curFq + '.constructor', 'constructor', curTier, curFq);
        continue;
      }
      // Property (public or readonly, no parens)
      var pm = trimmed.match(/^(?:(?:public|readonly|get\s|set\s)\s+)?(\w+)\s*[:;]/);
      if (pm && !trimmed.includes('(') && !trimmed.startsWith('*') && !trimmed.startsWith('/') &&
          !trimmed.startsWith('import') && !trimmed.startsWith('export') &&
          pm[1] !== 'if' && pm[1] !== 'for' && pm[1] !== 'while' && pm[1] !== 'return') {
        var pFq = curFq + '.' + pm[1];
        addUnit(pFq, 'property', curTier, curFq);
        continue;
      }
      continue;
    }

    // Top-level / namespace-level: functions and constants
    var fn = trimmed.match(/^export (?:declare )?function (\w+)/);
    if (fn) {
      var fnFq = fqPrefix + fn[1];
      addUnit(fnFq, 'function', classifyTier(fnFq, 'function'));
      continue;
    }
    var cst = trimmed.match(/^export (?:declare )?const (\w+)\s*[:=]/);
    if (cst) {
      var cstFq = fqPrefix + cst[1];
      addUnit(cstFq, 'constant', classifyTier(cstFq, 'constant'));
      continue;
    }
  }

  // Build output
  var tierCounts = { core: 0, important: 0, advanced: 0 };
  var output = { generatedAt: new Date().toISOString(), source: 'build/cocosair.module.d.ts', units: {}, tierSummary: {} };
  for (var j = 0; j < order.length; j++) {
    var fq = order[j];
    output.units[fq] = units[fq];
    tierCounts[units[fq].tier] = (tierCounts[units[fq].tier] || 0) + 1;
  }
  output.tierSummary = tierCounts;
  output.totalUnits = order.length;
  output.coverageRequiredUnits = order.filter(function(fq) { return units[fq].coverageRequired; }).length;

  fs.writeFileSync(OUT, JSON.stringify(output, null, 2) + '\n');
  console.log('[api-inventory] total=' + order.length +
    ' core=' + tierCounts.core + ' important=' + tierCounts.important + ' advanced=' + tierCounts.advanced +
    ' coverageRequired=' + output.coverageRequiredUnits);
})();
