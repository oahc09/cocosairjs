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
function git (root, args) {
  try { return cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}
// Recorded revisions are only meaningful if they name a commit this repository can
// reach; a copy with a synthetic HEAD must not produce acceptable evidence.
function revisionInHistory (root, revision) {
  if (!revision) return false;
  try { cp.execFileSync('git', ['merge-base', '--is-ancestor', revision, 'HEAD'], { cwd: root, stdio: 'ignore' }); return true; } catch { return false; }
}
function metadata(root) {
  const head = git(root, ['rev-parse', 'HEAD']);
  return { baseRevision: head, gitAvailable: head !== null, workingTree: true, sourceHash: sourceHash(root) };
}
module.exports = { sourceHash, metadata, revisionInHistory };
