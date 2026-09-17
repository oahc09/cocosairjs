/* V1.1 §14 — Public API Inventory Tool（namespace-aware parser）。
 * 执行：node tools/examples/api-inventory.cjs
 * 产出：docs/example-api-inventory.json
 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const DTS = path.join(REPO, 'build', 'cocosair.module.d.ts');
const OUT = path.join(REPO, 'docs', 'example-api-inventory.json');

(function main() {
  if (!fs.existsSync(DTS)) {
    console.error('[api-inventory] .d.ts not found. Run `npm run build:dts` first.');
    process.exit(1);
  }
  var source = fs.readFileSync(DTS, 'utf8');
  var lines = source.split('\n');

  var classes = {};   // fqName -> { methods:[], properties:[], staticMethods:[], namespace:'' }
  var functions = {}; // fqName -> { kind:'function', namespace:'' }
  var constants = {}; // fqName -> { kind:'constant' }
  var nsStack = [];
  var classStack = [];
  var depth = 0;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.trim();
    var nsPath = nsStack.join('.');

    // --- namespace / class / function / const declarations ---
    var ns = trimmed.match(/^export (?:declare )?namespace (\w+)/);
    var cls = trimmed.match(/^export (?:declare )?class (\w+)/);
    var fn = trimmed.match(/^export (?:declare )?function (\w+)/);
    var cn = trimmed.match(/^export (?:declare )?const (\w+)\s*[:=]/);
    var iface = trimmed.match(/^export (?:declare )?interface (\w+)/);

    if (ns) {
      nsStack.push(ns[1]);
      depth++;
      // count opening braces on this line after the declaration
      var open = (line.match(/\{/g) || []).length;
      var close = (line.match(/\}/g) || []).length;
      depth += open - close - 1; // -1 for the declaration brace itself
      continue;
    }
    if (cls) {
      var clsFq = (nsPath ? nsPath + '.' : '') + cls[1];
      classStack.push(clsFq);
      classes[clsFq] = { methods: [], properties: [], staticMethods: [], namespace: nsPath };
      // count braces
      var openBr = (line.match(/\{/g) || []).length;
      var closeBr = (line.match(/\}/g) || []).length;
      if (openBr > closeBr) { depth += openBr - closeBr; }
      continue;
    }
    if (iface) {
      // Track interface body to skip its contents
      var io = (line.match(/\{/g) || []).length;
      var ic = (line.match(/\}/g) || []).length;
      depth += io - ic;
      continue;
    }
    if (fn && !classStack.length) {
      var fnFq = (nsPath ? nsPath + '.' : '') + fn[1];
      functions[fnFq] = { kind: 'function', namespace: nsPath };
      // single-line function might close itself
      var fo = (line.match(/\{/g) || []).length;
      var fc = (line.match(/\}/g) || []).length;
      depth += fo - fc;
      continue;
    }
    if (cn && !classStack.length) {
      var cFq = (nsPath ? nsPath + '.' : '') + cn[1];
      constants[cFq] = { kind: 'constant' };
      var co = (line.match(/\{/g) || []).length;
      var cc = (line.match(/\}/g) || []).length;
      depth += co - cc;
      continue;
    }

    // --- inside class: methods & properties ---
    if (classStack.length && trimmed && trimmed !== '}') {
      var fq = classStack[classStack.length - 1];
      if (!classes[fq]) { classes[fq] = { methods: [], properties: [], staticMethods: [] }; }
      var mm = trimmed.match(/^(?:(?:public|private|protected|static|override|abstract|async)\s+)*(\w+)\s*\(/);
      if (mm && mm[1] !== 'constructor' && !trimmed.startsWith('*') && !trimmed.startsWith('/')) {
        if (/\bstatic\b/.test(trimmed)) {
          classes[fq].staticMethods.push(mm[1]);
        } else if (!/\bprivate\b/.test(trimmed)) {
          classes[fq].methods.push(mm[1]);
        }
        // count braces in method body declaration line
        var mo = (line.match(/\{/g) || []).length;
        var mc = (line.match(/\}/g) || []).length;
        depth += mo - mc;
        continue;
      }
      var pm = trimmed.match(/^(?:public\s+|readonly\s+)?(\w+)\s*:/);
      if (pm && !trimmed.includes('(') && !trimmed.startsWith('*') && !trimmed.startsWith('/') &&
          !trimmed.startsWith('import') && pm[1] !== 'if' && pm[1] !== 'for') {
        if (classes[fq] && classes[fq].properties.indexOf(pm[1]) === -1) {
          classes[fq].properties.push(pm[1]);
        }
      }
    }

    // --- brace tracking (general) ---
    var opens = (line.match(/\{/g) || []).length;
    var closes = (line.match(/\}/g) || []).length;
    if (opens > 0 || closes > 0) { depth += opens - closes; }

    // --- pop namespace/class on closing brace ---
    if (trimmed === '}' && depth <= nsStack.length && nsStack.length > 0 && classStack.length === 0) {
      nsStack.pop();
    }
    if (trimmed === '}' && classStack.length > 0 && depth < nsStack.length) {
      classStack.pop();
    }
  }

  var classCount = Object.keys(classes).length;
  var funcCount = Object.keys(functions).length;
  var constCount = Object.keys(constants).length;
  var methodCount = 0;
  for (var c in classes) { methodCount += classes[c].methods.length + classes[c].staticMethods.length; }

  var output = {
    generatedAt: new Date().toISOString(),
    source: 'build/cocosair.module.d.ts',
    summary: {
      classes: classCount,
      functions: funcCount,
      constants: constCount,
      totalMethods: methodCount,
      totalCoverageUnits: classCount + funcCount + constCount + methodCount,
    },
    classes: classes,
    functions: functions,
    constants: constants,
  };
  fs.writeFileSync(OUT, JSON.stringify(output, null, 2) + '\n');
  console.log('[api-inventory] classes=' + classCount + ' functions=' + funcCount + ' constants=' + constCount + ' methods=' + methodCount);
})();
