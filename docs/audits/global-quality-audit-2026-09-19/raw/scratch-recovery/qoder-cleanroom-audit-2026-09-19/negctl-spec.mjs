import { createRequire } from 'module';
const require = createRequire('E:/AIProMax/github/cocosair.js/package.json');
const path='E:/AIProMax/github/cocosair.js';
const sc = require(path+'/tools/verify/v11-spec-common.cjs');
const fs=require('fs');
const id='camera-multi';
const raw=fs.readFileSync(path+'/examples/'+id+'/example.json','utf8');
const spec=JSON.parse(raw);
const live=sc.specFingerprintOf ? sc.specFingerprintOf(spec) : null;
const rec=(spec.api&&spec.api.__promotion)||spec.promotionEvidence||(spec.promotionEvidence);
console.log('helper keys:', Object.keys(sc).join(','));
console.log('recorded promotionEvidence =', rec);
if (live){
  console.log('live fingerprint        =', live);
  console.log('CONTROL-1 (binds, honest):', live===rec ? 'MATCH -> gate would PASS' : 'MISMATCH -> gate REJECTS (would flag stale!)');
  // tamper a gated field (drop a claim) and recompute: stale evidence must change the fingerprint
  const t=JSON.parse(raw); delete t.api.claims[0];
  const liveT=sc.specFingerprintOf(t);
  console.log('CONTROL-2 (teeth)        : tampered live =', liveT, '=> changed?', liveT!==live);
  // status/promotionEvidence are EXCLUDED from fingerprint (per anti-stale design) -> toggling status must NOT change it
  const s=JSON.parse(raw); s.status='draft';
  const liveS=sc.specFingerprintOf(s);
  console.log('CONTROL-3 (exclusion)    : status->draft live =', liveS, '=> unchanged vs live?', liveS===live);
}
