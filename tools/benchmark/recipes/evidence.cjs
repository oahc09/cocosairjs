const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function sha256 (value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fileHash (file) {
  return sha256(fs.readFileSync(file));
}

/** Hash exactly what can change one Recipe result: definition, generated source,
 * validators, runner contract, and every local asset copied into the workspace. */
function scenarioHash (repo, recipe, scenario) {
  const assets = (scenario.assets || []).map((relative) => ({
    path: relative.replace(/\\/g, '/'),
    hash: fileHash(path.join(repo, relative)),
  }));
  return sha256(JSON.stringify({
    recipe,
    source: scenario.source,
    action: scenario.action,
    validatorParams: scenario.validatorParams || {},
    assets,
    validators: fileHash(path.join(repo, 'tools/benchmark/validators/index.ts')),
    schema: fileHash(path.join(repo, 'tools/benchmark/recipes/schema.ts')),
    runner: fileHash(path.join(repo, 'tools/benchmark/recipes/run-recipes-browser.cjs')),
  }));
}

function artifactHash (file) {
  return fs.existsSync(file) ? fileHash(file) : null;
}

module.exports = { artifactHash, scenarioHash };
