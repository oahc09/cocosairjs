/* V1.1 §14 — Public API Inventory Tool。
 * 执行：node tools/examples/api-inventory.cjs
 * 产出：docs/example-api-inventory.json
 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const DTS = path.join(REPO, 'build', 'cocosair.module.d.ts');
const OUT = path.join(REPO, 'docs', 'example-api-inventory.json');

function parseDts(source) {
  var inventory = { classes: {}, functions: {}, constants: {}, interfaces: {} };
  var lines = source.split('\n');
  var nsStack = [];
  var currentClass = null;
  for (var i = 0; i < lines.length; i++) {
    var trimmed = lines[i].trim();
    // Namespace open
    var nsMatch = trimmed.match(/^export (?:declare )?namespace (\w+)/);
    if (nsMatch) { nsStack.push(nsMatch[1]); continue; }
    // Class open
    var clsMatch = trimmed.match(/^export (?:declare )?class (\w+)/);
    if (clsMatch) {
      currentClass = clsMatch[1];
      var fq = nsStack.length ? nsStack.join('.') + '.' + currentClass : currentClass;
      inventory.classes[fq] = { methods: [], properties: [], staticMethods: [] };
      continue;
    }
    // Close namespace/class (trimmed === '}')
    if (trimmed === '}') {
      if (currentClass) { currentClass = null; continue; }
      if (nsStack.length) nsStack.pop();
      continue;
    }
    // Inside class: methods and properties
    if (currentClass) {
      var fq = nsStack.length ? nsStack.join('.') + '.' + currentClass : currentClass;
      var mm = trimmed.match(/^(?:public |private |protected |static |override )*(\w+)\s*\(/);
      if (mm && mm[1] !== 'constructor') {
        if (trimmed.includes('static ')) {
          inventory.classes[fq].staticMethods.push(mm[1]);
        } else {
          inventory.classes[fq].methods.push(mm[1]);
        }
        continue;
      }
      var pm = trimmed.match(/^(?:public |readonly )(\w+)\s*[:;]/);
      if (pm && !trimmed.includes('(') && !trimmed.includes('private') && !trimmed.includes('protected')) {
        if (inventory.classes[fq].properties.indexOf(pm[1]) === -1) {
          inventory.classes[fq].properties.push(pm[1]);
        }
      }
      continue;
    }
    // Top-level / namespace-level functions
    if (!currentClass && nsStack.length >= 0) {
      var fnMatch = trimmed.match(/^export (?:declare )?function (\w+)/);
      if (fnMatch) {
        var fnFq = nsStack.length ? nsStack.join('.') + '.' + fnMatch[1] : fnMatch[1];
        inventory.functions[fnFq] = { kind: 'function' };
        continue;
      }
      var constMatch = trimmed.match(/^export (?:declare )?const (\w+)\s*[:=]/);
      if (constMatch) {
        var cFq = nsStack.length ? nsStack.join('.') + '.' + constMatch[1] : constMatch[1];
        inventory.constants[cFq] = { kind: 'constant' };
        continue;
      }
    }
  }
  return inventory;
}

(function main() {
  if (!fs.existsSync(DTS)) {
    console.error('[api-inventory] .d.ts not found. Run `npm run build:dts` first.');
    process.exit(1);
  }
  var source = fs.readFileSync(DTS, 'utf8');
  var inv = parseDts(source);
  var classCount = Object.keys(inv.classes).length;
  var funcCount = Object.keys(inv.functions).length;
  var constCount = Object.keys(inv.constants).length;
  var methodCount = 0;
  for (var cls in inv.classes) {
    methodCount += inv.classes[cls].methods.length + inv.classes[cls].staticMethods.length;
  }
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
    classes: inv.classes,
    functions: inv.functions,
    constants: inv.constants,
    interfaces: inv.interfaces,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(output, null, 2) + '\n');
  console.log('[api-inventory] classes=' + classCount + ' functions=' + funcCount + ' constants=' + constCount + ' methods=' + methodCount);
})();
