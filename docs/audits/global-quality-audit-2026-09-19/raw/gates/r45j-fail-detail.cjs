'use strict';
const fs = require('fs');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const D = REPO + 'docs/evidence/v12/v11chain-r45j/';
for (const eng of ['firefox', 'webkit']) {
    for (const c of ['A', 'B']) {
        const j = JSON.parse(fs.readFileSync(D + `v11-chain-${eng}-chunk${c}.json`, 'utf8'));
        console.log(`=== ${eng} chunk${c}: browser=${j.browser} measuredAt=${j.measuredAt} ${j.runPass}/${j.runTotal} candFp=${j.candidateFingerprint}`);
        for (const r of j.results) {
            if (r.result === 'PASS') continue;
            console.log(`  FAIL ${r.id} candFp=${r.candidateFingerprint}`);
            console.log('    errors:', JSON.stringify(r.errors).slice(0, 700));
            if (r.expectationGaps && r.expectationGaps.length) console.log('    gaps:', JSON.stringify(r.expectationGaps).slice(0, 400));
            if (r.apiProof) {
                const bad = r.apiProof.filter((a) => a.proof !== 'verified');
                if (bad.length) console.log('    nonVerifiedProofs:', JSON.stringify(bad.slice(0, 4)));
            }
        }
    }
}
