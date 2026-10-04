const { createAirApp } = await import('/build/bootstrap.js');
const app = await createAirApp({ canvas: '#GameCanvas', diagnostics: 'warnings' });
const { AssetBank, JsonAsset, TextAsset, ImageAsset, Scene, game, director, assetManager } = await import('/build/cocosair.module.js');
app.run(new Scene('AssetBankRequests')); game.pause();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errorOf = async (promise) => { try { await promise; return { code: 'UNEXPECTED_PASS' }; } catch (e) { return { code: e.code, message: String(e), cause: String(e.cause) }; } };
async function run(origin) {
    const bank = new AssetBank(), progress = [], suffix = origin + '/typed.json';
    const plain = await bank.load(origin + '/without-suffix?kind=json', { ext: 'JSON', onProgress: (n, total) => progress.push([n, total]) });
    const noSuffix = { json: plain.json, isJson: plain instanceof JsonAsset, refs: plain.refCount, subscribers: bank.refCount(origin + '/without-suffix?kind=json', 'json'), progress };
    const inferred = await bank.load(suffix); const text = await bank.load(suffix, { ext: 'txt' });
    const types = { inferredJson: inferred instanceof JsonAsset, explicitText: text instanceof TextAsset, distinct: inferred !== text, text: text.text, json: inferred.json };
    const image = await bank.load(origin + '/without-suffix?kind=png', { ext: 'png' });
    const decoded = { isImage: image instanceof ImageAsset, width: image.width, height: image.height };
    const peerURL = origin + '/delayed-peer?kind=json', controller = new AbortController();
    const cancelled = errorOf(bank.load(peerURL, { ext: 'json', signal: controller.signal }));
    const peer = bank.load(peerURL, { ext: 'json' }); await sleep(100); controller.abort();
    const survivor = await peer;
    const shared = { cancelled: await cancelled, peerJson: survivor.json, subscribers: bank.refCount(peerURL, 'json'), engineRefs: survivor.refCount };
    const abandonedURL = origin + '/delayed-abandoned?kind=json', cancelAll = new AbortController();
    const abandoned = errorOf(bank.load(abandonedURL, { ext: 'json', signal: cancelAll.signal }));
    await sleep(100); cancelAll.abort(); const allCancelled = await abandoned;
    await sleep(700); director.tick(0);
    const late = { error: allCancelled, subscribers: bank.refCount(abandonedURL, 'json'), inFlight: bank.inFlightCount, cached: !!assetManager.assets.get(abandonedURL) };
    const revokedURL = origin + '/delayed-revoked?kind=json';
    const revoked = errorOf(bank.load(revokedURL, { ext: 'json' })); await sleep(100); bank.releaseAll();
    const revocation = await revoked; await sleep(700); director.tick(0);
    const afterRevocation = { error: revocation, size: bank.size, inFlight: bank.inFlightCount, cached: !!assetManager.assets.get(revokedURL) };
    const missing = await errorOf(bank.load(origin + '/missing', { ext: 'json' }));
    const cors = await errorOf(bank.load(origin + '/cors-denied', { ext: 'json' }));
    const sharedURL = origin + '/shared.json', bankA = new AssetBank(), bankB = new AssetBank();
    const a = await bankA.load(sharedURL), b = await bankB.load(sharedURL);
    const ownership = { sameAsset: a === b, before: b.refCount };
    bankA.releaseAll(); director.tick(0); Object.assign(ownership, { afterOne: b.refCount, peerValid: b.isValid, peerJson: b.json });
    bankB.releaseAll(); director.tick(0); Object.assign(ownership, { afterBoth: b.refCount, finalSize: bankB.size });
    bank.releaseAll(); director.tick(0);
    return { noSuffix, types, decoded, shared, late, afterRevocation, missing, cors, ownership,
        underlyingCancelSupported: AssetBank.underlyingCancelSupported, finalSize: bank.size, finalInFlight: bank.inFlightCount };
}
async function runCsp(origin) {
    const violations = [], listener = (event) => violations.push({ blockedURI: event.blockedURI, effectiveDirective: event.effectiveDirective });
    document.addEventListener('securitypolicyviolation', listener);
    const policy = document.createElement('meta'); policy.httpEquiv = 'Content-Security-Policy'; policy.content = "connect-src 'self'"; document.head.appendChild(policy);
    const bank = new AssetBank(), error = await errorOf(bank.load(origin + '/csp-denied', { ext: 'json' }));
    await sleep(50); bank.releaseAll(); document.removeEventListener('securitypolicyviolation', listener);
    return { error, violations, size: bank.size, inFlight: bank.inFlightCount };
}
window.__assetBankProbe = { ready: true, run, runCsp, close: () => app.close() };
