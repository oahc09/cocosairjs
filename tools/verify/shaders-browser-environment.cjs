'use strict';
// Shared browser-environment helpers: real HTTP isolation server + navigation/DPR repair receipt
// + PURE TOTAL production environment receipt validator (used by both navigation and collector).
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');

function isFinitePositiveSafeInt (v) {
    return typeof v === 'number' && Number.isFinite(v) && Number.isSafeInteger(v) && v > 0;
}
function isFinitePositive (v) {
    return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** PURE TOTAL: validate an environment receipt against an AUTHORITATIVE frozen expected
 *  plan. Never trusts receipt.ok / receipt.errors / receipt.expected — all actual values
 *  are checked against `expected` directly. Null/undefined/malformed input → structured
 *  rejection, never a throw. */
function validateEnvironmentReceipt (receipt, expected) {
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
        return { ok: false, errors: ['receipt must be a non-null non-array object'] };
    }
    if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
        return { ok: false, errors: ['expected plan must be a non-null non-array object'] };
    }
    const errors = [];

    // Validate the authoritative expected plan itself
    const ev = expected.viewport;
    if (!ev || !isFinitePositiveSafeInt(ev.width) || !isFinitePositiveSafeInt(ev.height)) {
        errors.push('expected.viewport must be positive safe integers');
    }
    if (!isFinitePositive(expected.dpr)) errors.push('expected.dpr must be finite positive');
    if (expected.backing && (!isFinitePositiveSafeInt(expected.backing.w) || !isFinitePositiveSafeInt(expected.backing.h))) {
        errors.push('expected.backing must be positive safe integers');
    }
    if (errors.length > 0) return { ok: false, errors }; // authoritative plan invalid → reject

    // Phases: exactly two, navigation then repair (no duplicates, no extras)
    const phases = receipt.phases;
    if (!Array.isArray(phases) || phases.length !== 2) {
        errors.push(`phases must be exactly 2 (navigation + repair), got ${phases?.length ?? 'missing'}`);
        return { ok: false, errors };
    }
    const nav = phases[0]; const repair = phases[1];
    if (!nav || nav.id !== 'after-navigation') errors.push('phase[0] must be after-navigation');
    if (!repair || repair.id !== 'after-viewport-repair') errors.push('phase[1] must be after-viewport-repair');
    if (errors.length > 0) return { ok: false, errors };

    // HTTP status + delivered headers
    if (receipt.responseStatus !== 200) errors.push(`responseStatus ${receipt.responseStatus} !== 200`);
    if (receipt.waitError) errors.push('actual backing/profile wait failed');
    const dh = receipt.deliveredHeaders;
    if (!dh || typeof dh !== 'object') { errors.push('deliveredHeaders missing'); }
    else {
        if (dh.coop !== 'same-origin') errors.push(`delivered COOP "${dh.coop}" !== "same-origin"`);
        if (dh.coep !== 'require-corp') errors.push(`delivered COEP "${dh.coep}" !== "require-corp"`);
    }
    if (expected.headers?.coop && dh?.coop !== expected.headers.coop) errors.push('COOP does not match expected');
    if (expected.headers?.coep && dh?.coep !== expected.headers.coep) errors.push('COEP does not match expected');

    // Repair phase: all actual values against the authoritative plan
    if (!isFinitePositive(repair.dpr)) errors.push('repair DPR not finite positive');
    else if (repair.dpr !== expected.dpr) errors.push(`repair DPR ${repair.dpr} != expected ${expected.dpr}`);

    if (repair.backing && typeof repair.backing === 'object') {
        if (!isFinitePositiveSafeInt(repair.backing.w)) errors.push('repair backing.w not finite positive safeInt');
        if (!isFinitePositiveSafeInt(repair.backing.h)) errors.push('repair backing.h not finite positive safeInt');
        if (expected.backing && repair.backing.w !== expected.backing.w) errors.push(`backing.w ${repair.backing.w} != ${expected.backing.w}`);
        if (expected.backing && repair.backing.h !== expected.backing.h) errors.push(`backing.h ${repair.backing.h} != ${expected.backing.h}`);
    } else errors.push('repair backing missing/malformed');

    if (repair.css && typeof repair.css === 'object') {
        if (!isFinitePositiveSafeInt(repair.css.w)) errors.push('repair css.w not finite positive safeInt');
        if (!isFinitePositiveSafeInt(repair.css.h)) errors.push('repair css.h not finite positive safeInt');
        if (isFinitePositiveSafeInt(repair.css.w) && repair.css.w !== expected.viewport.width) {
            errors.push(`css.w ${repair.css.w} != viewport ${expected.viewport.width}`);
        }
        if (isFinitePositiveSafeInt(repair.css.h) && repair.css.h !== expected.viewport.height) {
            errors.push(`css.h ${repair.css.h} != viewport ${expected.viewport.height}`);
        }
    } else errors.push('repair css missing/malformed');

    if (expected.crossOriginIsolated === true && repair.coi !== true) errors.push(`repair COI ${repair.coi} !== true`);
    if (expected.crossOriginIsolated === false && repair.coi !== false) errors.push(`repair COI ${repair.coi} !== false`);

    // Navigation phase sanity: DPR may differ (that is the point of repair), but must be finite
    if (!isFinitePositive(nav.dpr)) errors.push('navigation DPR not finite positive');

    // Self-report consistency: independently valid data must not carry a failure self-report
    if (receipt.ok === false) errors.push('receipt self-reports ok=false but data validates');
    if (Array.isArray(receipt.errors) && receipt.errors.length > 0) errors.push('receipt self-reports errors but data validates');

    return { ok: errors.length === 0, errors };
}

/** Start a reverse proxy over the example server that adds COOP/COEP headers on the
 *  navigation document when `_isolate=1` is present in the URL query. Body bytes are
 *  forwarded exactly; the isolate parameter is cleanly removed from the upstream URL
 *  preserving all other query parameters and separators. */
async function startIsolationProxy (exampleServer, options = {}) {
    const isolateParam = options.isolateParam ?? '_isolate';
    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://localhost');
            const isolated = url.searchParams.get(isolateParam) === '1';
            url.searchParams.delete(isolateParam);
            const cleanSearch = url.search === '?' ? '' : url.search;
            const upstream = `${exampleServer.origin}${url.pathname}${cleanSearch}`;
            const upstreamRes = await new Promise((resolve, reject) => {
                http.get(upstream, resolve).on('error', reject);
            });
            const chunks = [];
            for await (const chunk of upstreamRes) chunks.push(chunk);
            const body = Buffer.concat(chunks);
            const headers = { 'Content-Type': upstreamRes.headers['content-type'] || 'application/octet-stream' };
            if (upstreamRes.headers['content-encoding']) {
                headers['Content-Encoding'] = upstreamRes.headers['content-encoding'];
            }
            if (isolated) {
                headers['Cross-Origin-Opener-Policy'] = 'same-origin';
                headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
            }
            headers['Content-Length'] = body.length;
            res.writeHead(upstreamRes.statusCode || 200, headers);
            res.end(body);
        } catch (e) { res.writeHead(502); res.end(String(e)); }
    });
    await new Promise((resolve, reject) => { server.listen(0, '127.0.0.1', resolve); server.on('error', reject); });
    let closing;
    let closed = false;
    return {
        origin: `http://127.0.0.1:${server.address().port}`,
        get closed () { return closed; },
        close: () => closing ??= new Promise((resolve, reject) => {
            server.close(error => {
                if (error) reject(error);
                else { closed = !server.listening; resolve(); }
            });
        }),
    };
}

/** Navigate to an isolated page and repair Firefox's COOP-induced DPR drop via the
 *  browser protocol: goto → AFTER-NAVIGATION setViewportSize reapply → verify receipt
 *  using the production pure validator. */
async function navigateWithDPRRepair (page, url, expected) {
    const receipt = { url, expected, phases: [] };
    const response = await page.goto(url);
    receipt.responseStatus = response?.status();
    receipt.deliveredHeaders = {
        coop: response?.headers()?.['cross-origin-opener-policy'] ?? null,
        coep: response?.headers()?.['cross-origin-embedder-policy'] ?? null,
    };
    const afterNav = await observeDPR(page);
    receipt.phases.push({ id: 'after-navigation', ...afterNav });

    // Protocol repair: reapply the same viewport AFTER navigation (proven R3)
    await page.setViewportSize({ width: expected.viewport.width, height: expected.viewport.height });
    // Await the actual profile, rather than assuming module import finished in 1s.
    try {
        await page.waitForFunction(plan => {
            const c = document.querySelector('canvas');
            return devicePixelRatio === plan.dpr && innerWidth === plan.viewport.width &&
                innerHeight === plan.viewport.height && crossOriginIsolated === plan.crossOriginIsolated &&
                c && c.width === plan.backing.w && c.height === plan.backing.h;
        }, expected, { polling: 50, timeout: 60000 });
    } catch (error) {
        receipt.waitError = String(error.stack || error);
    }
    const afterRepair = await observeDPR(page);
    receipt.phases.push({ id: 'after-viewport-repair', ...afterRepair });

    // Production validator: never trusts receipt self-reported flags
    const validation = validateEnvironmentReceipt(receipt, expected);
    receipt.ok = validation.ok;
    receipt.errors = validation.errors;
    return receipt;
}

async function observeDPR (page) {
    return page.evaluate(() => {
        const c = document.querySelector('canvas');
        return {
            dpr: devicePixelRatio,
            coi: typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : null,
            css: { w: innerWidth, h: innerHeight },
            backing: c ? { w: c.width, h: c.height } : null,
        };
    });
}

module.exports = { startIsolationProxy, navigateWithDPRRepair, observeDPR, validateEnvironmentReceipt };
