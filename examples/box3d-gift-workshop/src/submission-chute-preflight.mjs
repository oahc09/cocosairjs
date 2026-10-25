/** Submission admission only. Does not relax packing or shipping geometry, or certify observation freshness. */
export const SUBMISSION_ADMISSION = Object.freeze({
    version: 'strict-chute-xz-preflight-1',
    scope: 'additional-explicit-submit-admission',
    packingThresholdsUnchanged: true,
    shippingThresholdsUnchanged: true,
    addsObservationFreshnessGuarantee: false,
});
export function finiteOrderedBounds(bounds) {
    return (
        ['min', 'max'].every(
            (key) => Array.isArray(bounds?.[key]) && bounds[key].length === 3 && bounds[key].every(Number.isFinite),
        ) && bounds.min.every((value, axis) => value <= bounds.max[axis])
    );
}
export function submissionChuteReason(observation) {
    if (
        !finiteOrderedBounds(observation?.chute) ||
        !Array.isArray(observation?.items) ||
        observation.items.length !== 2 ||
        observation.items.some((item) => !finiteOrderedBounds(item?.bounds))
    )
        return 'shipping-preflight-geometry-unavailable';
    return observation.items.every((item) =>
        [0, 2].every(
            (axis) =>
                item.bounds.min[axis] >= observation.chute.min[axis] &&
                item.bounds.max[axis] <= observation.chute.max[axis],
        ),
    )
        ? null
        : 'shipping-preflight-outside-chute';
}
