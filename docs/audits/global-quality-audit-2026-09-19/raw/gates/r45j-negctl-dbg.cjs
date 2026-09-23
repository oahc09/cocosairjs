'use strict';
const fs = require('fs'), cp = require('child_process');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const REL = 'docs/evidence/v12/v11chain-r45j/v11-chain-firefox-chunkA.json';
fs.mkdirSync('E:/AIProMax/cocosair-scratch/r45j-dbg', { recursive: true });
const j = JSON.parse(fs.readFileSync(REPO + REL, 'utf8'));
const r = j.results.find((x) => x.id === 'anim-position');
r.artifact.bytes += 1;
const file = 'E:/AIProMax/cocosair-scratch/r45j-dbg/' + REL.replace(/[\\/]/g, '_');
fs.writeFileSync(file, JSON.stringify(j));
const out = 'E:/AIProMax/cocosair-scratch/r45j-dbg/judge-out.json';
const res = cp.spawnSync(process.execPath, ['E:/AIProMax/cocosair-scratch/db-probe/r45j-reconcile-k.cjs'], {
    env: { ...process.env, R45J_FILES: JSON.stringify({ [REL]: file }), R45J_OUT: out }, encoding: 'utf8',
});
const o = JSON.parse(fs.readFileSync(out, 'utf8'));
console.log('exit', res.status, 'hard', JSON.stringify(o.hard), 'stale', JSON.stringify(o.stale));
console.log('injected readFrom used?', o.sources.firefox.some((s) => s.includes('r45j-dbg')));
console.log('stdout tail:', (res.stdout || '').split('\n').slice(0, 6).join(' | '));
