/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Independent numerical evaluation of retained production raw observations.
function classifyQuery(receipt, raw, { requirePositiveGap = false } = {}) {
    if (!raw || raw.schema !== 'box3d-production-esm-public-query-target-support-v1' || !raw.completedAt)
        return 'INVALID_RESULT';
    if (raw.hostErrors?.length) return 'FAIL_INFRA';
    if (receipt.exitCode !== 0) return raw.checks?.some((c) => c.pass === false) ? 'FAIL_PRODUCT' : 'FAIL_UNCLASSIFIED';
    if (
        raw.status !== 'PASS_LIMITED_PRODUCTION_QUERY_TARGET_SUPPORT' ||
        raw.healthyComplete !== true ||
        !raw.inputsUnchanged ||
        !Array.isArray(raw.checks) ||
        raw.checks.length < 30 ||
        !raw.checks.every((c) => c.pass === true)
    )
        return 'INVALID_RESULT';
    if (
        raw.close?.status !== 'released' ||
        raw.close?.physicsPreparation?.status !== 'closed' ||
        raw.close.physicsPreparation.cleanupErrors.length
    )
        return 'INVALID_RESULT';
    const near = (a, b, t = 0.01) => Number.isFinite(a) && Math.abs(a - b) <= t;
    const zero = (v) => v && v.x === 0 && v.y === 0 && v.z === 0;
    if (raw.querySamples?.length !== 2 || !raw.largeOffset || !raw.target || !raw.support) return 'INVALID_RESULT';
    for (const sample of raw.querySamples) {
        if (
            sample.sweep?.complete !== true ||
            sample.sweep.children?.length !== 2 ||
            sample.sweep.hits?.length !== 2 ||
            sample.ray?.complete !== true ||
            sample.ray.hits?.length !== 3 ||
            sample.zero?.hits?.length !== 0 ||
            sample.zero.nearestDistance !== null
        )
            return 'INVALID_RESULT';
        if (
            sample.sweep.hits.some((h) => h.collider !== 'wall') ||
            sample.ray.hits.map((h) => h.collider).join(',') !== 'head,held-offset,wall'
        )
            return 'FAIL_PRODUCT';
        if (
            ![2.5, 4.3].every((v, i) => near(sample.sweep.hits[i].distance, v)) ||
            ![0, 1, 4.5].every((v, i) => near(sample.ray.hits[i].distance, v)) ||
            !near(sample.sweep.nearestDistance, 2.5)
        )
            return 'FAIL_PRODUCT';
        if (sample.sweep.children[1].origin?.x !== 1.5 || sample.sweep.children[1].dimensions?.[0] !== 0.5)
            return 'FAIL_PRODUCT';
    }
    if (!(raw.querySamples[1].sweep.nativeStepIndex > raw.querySamples[0].sweep.nativeStepIndex)) return 'FAIL_PRODUCT';
    for (const [name, expected] of [
        ['large-offset-box', 4.4375],
        ['large-offset-capsule', 4.3375],
    ])
        if (
            !near(
                raw.largeOffset.hits?.find((h) => h.queryCollider === name && h.collider === 'wall')?.distance,
                expected,
            )
        )
            return 'FAIL_PRODUCT';
    if (
        raw.largeOffset.children?.[0].dimensions?.[0] !== 0.0625 ||
        raw.largeOffset.children?.[1].dimensions?.[1] !== 0.0625
    )
        return 'FAIL_PRODUCT';
    if (
        raw.overlap?.initialOverlap !== true ||
        !raw.overlap.overlaps?.some((p) => p.queryCollider === 'head' && p.collider === 'external-overlap') ||
        raw.overlap.hits?.length !== 0
    )
        return 'FAIL_PRODUCT';
    const t = raw.target,
        dt = Math.fround(0.1),
        h = dt / 4;
    if (
        !Number.isFinite(t.damping) ||
        t.damping < 0 ||
        t.substeps !== 4 ||
        t.admittedDt !== dt ||
        t.admittedTargetX !== Math.fround(30.1) ||
        !near(t.before?.position?.x, 30, 1e-6)
    )
        return 'INVALID_RESULT';
    const factor = 1 / (1 + h * t.damping),
        sum = factor === 1 ? 4 : (factor * (1 - factor ** 4)) / (1 - factor),
        predicted = t.before.position.x + h * ((Math.fround(30.1) - t.before.position.x) / dt) * sum;
    if (
        !near(t.after?.position?.x, predicted, 1e-5) ||
        t.after.position.x === t.before.position.x ||
        !zero(t.afterClear?.linearVelocity) ||
        !zero(t.afterClear?.angularVelocity)
    )
        return 'FAIL_PRODUCT';
    const s = raw.support,
        p = s.proof;
    if (
        p?.proven !== true ||
        p.collider !== 'support-table' ||
        p.queryCollider !== 'supported-sphere' ||
        !near(p.startGap, -0.000074, 1e-7) ||
        !near(p.endGap, 0.099926, 1e-7) ||
        p.planeNormal?.y !== 1 ||
        p.planeOffset !== 0 ||
        p.nativeMutationRevision !== s.up?.nativeMutationRevision ||
        s.downProof?.proven !== false
    )
        return 'FAIL_PRODUCT';
    if (
        !near(s.up.hits?.find((hit) => hit.collider === 'support-ceiling')?.distance, 0.080074) ||
        !s.diagonal?.hits?.some((hit) => hit.collider === 'support-side-wall') ||
        !near(s.departed?.position?.y, 0.549926, 1e-6) ||
        !zero(s.afterClear?.linearVelocity) ||
        !zero(s.afterClear?.angularVelocity)
    )
        return 'FAIL_PRODUCT';
    if (requirePositiveGap) return classifyPositiveGap(raw);
    return 'PASS_LIMITED';
}
function classifyPositiveGap(raw) {
    const g = raw?.positiveGap;
    if (
        raw?.queryFixtureVersion !== 3 ||
        g?.up?.complete !== true ||
        g?.down?.complete !== true ||
        !g ||
        g.up?.overlaps?.length !== 0 ||
        g.down?.overlaps?.length !== 0 ||
        g.copyStableAfterTick !== true ||
        g.copyStableAfterClose !== true
    )
        return 'INVALID_RESULT';
    const pair = g.up.hits?.find((hit) => hit.collider === 'positive-gap-table'),
        down = g.down.hits?.find((hit) => hit.collider === 'positive-gap-table');
    const zero = (hit) => hit && hit.fraction === 0 && hit.distance === 0;
    if (!zero(pair) || !zero(down) || !pair.normal || !['x', 'y', 'z'].every((axis) => pair.normal[axis] === 0))
        return 'FAIL_PRODUCT';
    const blocker = pair.blockingGeometry,
        query = g.up.children?.find((child) => child.collider === 'positive-gap-box');
    const valid = (geometry) =>
        geometry?.kind === 'box' &&
        geometry.support?.points?.length === 8 &&
        geometry.support.points.every((point) => ['x', 'y', 'z'].every((axis) => Number.isFinite(point[axis]))) &&
        Number.isFinite(geometry.support.origin?.y) &&
        geometry.support.radius === 0;
    if (!valid(blocker) || !valid(query) || blocker.collider !== 'positive-gap-table') return 'INVALID_RESULT';
    const startGap =
        query.support.origin.y +
        Math.min(...query.support.points.map((p) => p.y)) -
        blocker.support.origin.y -
        Math.max(...blocker.support.points.map((p) => p.y));
    const endGap = startGap + g.up.translation?.y;
    const near = (a, b, t = 1e-7) => Number.isFinite(a) && Math.abs(a - b) <= t;
    const proof = g.proof;
    if (
        !near(startGap, 0.00152) ||
        !near(endGap, 0.10152) ||
        proof?.proven !== true ||
        !near(proof.startGap, startGap) ||
        !near(proof.endGap, endGap) ||
        proof.queryCollider !== 'positive-gap-box' ||
        proof.collider !== 'positive-gap-table' ||
        proof.nativeMutationRevision !== g.up.nativeMutationRevision ||
        proof.planeNormal?.x !== 0 ||
        proof.planeNormal?.y !== 1 ||
        proof.planeNormal?.z !== 0 ||
        g.downProof?.proven !== false ||
        g.forgedProof?.proven !== false
    )
        return 'FAIL_PRODUCT';
    const ceiling = g.up.hits.find((hit) => hit.collider === 'positive-gap-ceiling');
    if (!(ceiling?.fraction > 0) || !near(ceiling.distance, 0.07848, 0.01)) return 'FAIL_PRODUCT';
    return 'PASS_LIMITED';
}
module.exports = { classifyQuery, classifyPositiveGap };
