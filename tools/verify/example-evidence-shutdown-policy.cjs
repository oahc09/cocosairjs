'use strict';
/** Versioned disposition of raw kernel statuses. It does not claim signal-sender attribution. */
const POLICY = 'browser-shutdown/2';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tuple = (a, b) => !!a && !!b && ['pid', 'startTicks', 'namespace'].every((key) => a[key] === b[key]);
const identity = (row, namespace) =>
    row &&
    Number.isSafeInteger(row.pid) &&
    row.pid > 0 &&
    Number.isSafeInteger(row.ppid) &&
    row.ppid >= 0 &&
    Number.isSafeInteger(row.pgrp) &&
    row.pgrp >= 0 &&
    /^\d+$/.test(row.startTicks || '') &&
    row.namespace === namespace;
const live = (row) => row && ['R', 'S', 'D', 'T', 't', 'K', 'W', 'P', 'I'].includes(row.state);
const validImage = (value) =>
    value &&
    Number.isSafeInteger(value.device) &&
    value.device >= 0 &&
    Number.isSafeInteger(value.inode) &&
    value.inode > 0 &&
    Number.isSafeInteger(value.bytes) &&
    value.bytes > 0 &&
    /^\d+$/.test(value.mtimeNs || '') &&
    /^[a-f0-9]{64}$/.test(value.sha256 || '');
const roles = new Set([
    'unspecified',
    'unknown',
    'gpu-process',
    'utility',
    'renderer',
    'zygote',
    'broker',
    'ppapi',
    'ppapi-broker',
]);
function validateShutdownPolicy(receipt, raw) {
    const errors = [];
    const fail = (reason) => errors.push(`Shutdown policy: ${reason}`);
    const eventIs = (row, type) =>
        row?.type === type && raw.events.some((event) => event.eventId === row.eventId && same(event, row));
    const image = raw.browserImage;
    if (
        !eventIs(image, 'frozen-browser-image') ||
        !validImage(image.image) ||
        image.cpuDummy !== receipt.cpuDummy ||
        (!receipt.cpuDummy && image.image.sha256 !== receipt.runtimeIdentity?.executableSha256)
    )
        fail('frozen executable witness missing');
    const closings = raw.barriers.filter((proof) => proof.phase === 'closing');
    for (const runtime of receipt.runtimes) {
        const found = closings.filter((proof) => proof.runtimeId === runtime.runtimeId);
        if (found.length !== 1) {
            fail('closing boundary not unique');
            continue;
        }
        const closing = found[0],
            snapshot = closing.snapshot;
        const stop = raw.barriers.find((proof) => proof.phase === 'stop' && proof.runtimeId === runtime.runtimeId);
        const ack = receipt.events.find(
            (event) =>
                event.type === 'custody-barrier-ack' &&
                event.phase === 'closing' &&
                event.runtimeId === runtime.runtimeId,
        );
        const browser = receipt.browsers.find((row) => row.runtimeId === runtime.runtimeId);
        const authorized = runtime.closeAuthorized;
        const functional = snapshot?.functionalResult;
        if (
            closing.policy !== POLICY ||
            closing.ok !== true ||
            !snapshot ||
            !tuple(snapshot.browser, browser) ||
            !identity(snapshot.browser, receipt.worker.namespace) ||
            !live(snapshot.browser) ||
            snapshot.browser.ppid !== receipt.worker.pid ||
            !same(snapshot.image, image?.image) ||
            snapshot.cpuDummy !== receipt.cpuDummy ||
            !Array.isArray(snapshot.candidates) ||
            snapshot.candidates.length > 255 ||
            !Array.isArray(snapshot.issues) ||
            !Number.isFinite(closing.deadlineMs) ||
            !(closing.elapsedMs < closing.deadlineMs) ||
            !same(closing.closeBudget, {
                originEventId: runtime.stopBegin.eventId,
                originElapsedMs: runtime.stopBegin.supervisorElapsedMs,
                deadlineMs: runtime.stopBegin.supervisorElapsedMs + receipt.limits.closeMs,
            })
        )
            fail('invalid pre-close live browser boundary');
        if (
            !functional ||
            typeof functional.path !== 'string' ||
            !Number.isSafeInteger(functional.bytes) ||
            functional.bytes <= 0 ||
            !/^[a-f0-9]{64}$/.test(functional.sha256 || '') ||
            functional.completed !== snapshot.completed ||
            functional.result !== snapshot.result
        )
            fail('pre-close functional original missing');
        if (
            !ack ||
            !authorized ||
            !receipt.events.some((event) => same(event, authorized) && event.type === 'close-authorized') ||
            !(ack.eventId < authorized.eventId && authorized.eventId < browser?.exit?.eventId) ||
            authorized.runtimeId !== runtime.runtimeId ||
            authorized.launchId !== browser?.launchId ||
            authorized.healthy !== true ||
            snapshot.healthy !== true ||
            !same(authorized.functionalResult, functional)
        )
            fail('close call lacks acknowledged healthy boundary');
        if (
            !stop ||
            stop.policy !== POLICY ||
            !stop.closure ||
            stop.elapsedMs > closing.deadlineMs ||
            !same(stop.closeBudget, closing.closeBudget) ||
            stop.closure.browsers?.length !== 1 ||
            stop.closure.servers?.length !== 1 ||
            !tuple(stop.closure.browsers[0], browser) ||
            !same(stop.closure.browsers[0].exit, browser.exit) ||
            !same(stop.closure.browsers[0].close, browser.close) ||
            !same(
                stop.closure.servers[0].close,
                receipt.servers.find((row) => row.runtimeId === runtime.runtimeId)?.close,
            )
        )
            fail('stop closure differs from original process events');
    }
    const dispositions = raw.events.filter((event) => event.type === 'adopted-disposition');
    if (dispositions.length !== raw.adopted.length) fail('adopted disposition cardinality differs');
    for (const row of raw.adopted) {
        const disposition = row.disposition;
        if (
            !eventIs(disposition, 'adopted-disposition') ||
            disposition.policy !== POLICY ||
            !tuple(disposition, row) ||
            !(row.absent.eventId < disposition.eventId)
        ) {
            fail('raw status disposition missing');
            continue;
        }
        if (row.reap.rawStatus === 0 && row.reap.code === 0 && row.reap.signal === null) {
            if (
                disposition.result !== 'clean-exit' ||
                disposition.closingEventId !== null ||
                disposition.candidate !== null
            )
                fail('clean exit disposition mismatch');
            continue;
        }
        const closing = closings.find((event) => event.eventId === disposition.closingEventId);
        const candidate = disposition.candidate;
        const stop =
            closing && raw.barriers.find((proof) => proof.phase === 'stop' && proof.runtimeId === closing.runtimeId);
        if (
            row.reap.rawStatus !== 15 ||
            row.reap.signal !== 'SIGTERM' ||
            row.reap.code !== null ||
            disposition.result !== 'shutdown-compatible' ||
            !closing ||
            !stop ||
            !candidate ||
            !(closing.eventId < row.observed.eventId && row.observed.eventId < row.reap.eventId) ||
            !closing.snapshot.candidates.some((value) => same(value, candidate)) ||
            !tuple(candidate.identity, row) ||
            !identity(candidate.before, receipt.worker.namespace) ||
            !identity(candidate.identity, receipt.worker.namespace) ||
            !tuple(candidate.before, candidate.identity) ||
            candidate.before.ppid !== candidate.identity.ppid ||
            candidate.before.pgrp !== candidate.identity.pgrp ||
            !live(candidate.before) ||
            !live(candidate.identity) ||
            !same(candidate.image, image?.image) ||
            candidate.imageMatchesFrozen !== true ||
            !roles.has(candidate.role) ||
            !['PASS', 'FAIL'].includes(closing.snapshot.result) ||
            closing.snapshot.completed !== true ||
            closing.snapshot.healthy !== true ||
            !(closing.eventId < row.reap.eventId && disposition.eventId < stop.eventId) ||
            !Array.isArray(candidate.lineage)
        ) {
            fail('signal lacks shutdown-compatible identity and phase proof');
            continue;
        }
        let parent = candidate.identity.ppid;
        const seen = new Set([row.pid]);
        for (const ancestor of candidate.lineage) {
            if (
                !identity(ancestor, receipt.worker.namespace) ||
                ancestor.pid !== parent ||
                seen.has(ancestor.pid) ||
                !live(ancestor) ||
                ancestor.namespace !== row.namespace
            )
                fail('candidate lineage broken');
            seen.add(ancestor.pid);
            parent = ancestor.ppid;
        }
        if (parent !== closing.snapshot.browser.pid) fail('candidate does not descend from the acknowledged browser');
    }
    return errors;
}
module.exports = { POLICY, validateShutdownPolicy };
