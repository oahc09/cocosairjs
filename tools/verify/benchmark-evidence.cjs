const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
function sourceHash(root) {
  const entries=[];
  function walk(dir) {
    for(const e of fs.readdirSync(dir,{withFileTypes:true})) {
      if(e.name==='work')continue;
      const p=path.join(dir,e.name);
      if(e.isDirectory())walk(p);else entries.push([path.relative(root,p).replace(/\\/g,'/'),crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]);
    }
  }
  walk(path.join(root,'tools/benchmark'));
  // Recipe browser scenarios consume this local glTF fixture. Evidence becomes stale
  // when the fixture changes even if the TypeScript sources do not.
  const recipeAssets=[path.join(root,'examples/gltf-viewer/assets/BoxTextured.glb'),path.join(root,'examples/gltf-viewer/assets/AnimatedMorphCube.glb')];
  for(const asset of recipeAssets){if(fs.existsSync(asset))entries.push([path.relative(root,asset).replace(/\\/g,'/'),crypto.createHash('sha256').update(fs.readFileSync(asset)).digest('hex')]);}
  entries.push(['build/cocosair.module.js',crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'build/cocosair.module.js'))).digest('hex')]);
  entries.push(['build/cocosair.module.d.ts',crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'build/cocosair.module.d.ts'))).digest('hex')]);
  return crypto.createHash('sha256').update(JSON.stringify(entries.sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');
}
function metadata(root) {
  return {baseRevision:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),workingTree:true,sourceHash:sourceHash(root)};
}
module.exports = { sourceHash, metadata };
