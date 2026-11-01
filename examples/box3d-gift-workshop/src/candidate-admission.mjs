/** Explicit test admission only. Historical selectors and locks remain frozen. */
export function selectTransportCandidate(query) {
    const values = query.getAll('candidate');
    if (values.length === 0)
        return Object.freeze({ candidateId: 'legacy-sdk220', lockFile: 'transport-candidate-lock.json' });
    if (
        values.length !== 1 ||
        !['sdk223', 'integration-20261031'].includes(values[0]) ||
        query.getAll('transport').length !== 1 ||
        query.get('transport') !== 'committed-candidate' ||
        query.has('contacts')
    )
        throw new Error('Unknown, duplicate or incompatible explicit transport candidate');
    return Object.freeze({ candidateId: values[0], lockFile: `transport-candidate-${values[0]}-lock.json` });
}

export function validateTransportCandidate(selection, lock, build, identity) {
    if (
        lock?.status !== 'READY_FOR_VERIFICATION' ||
        lock.expectedBuild !== build ||
        identity?.runtimeSha256 !== lock.runtimeSha256 ||
        identity?.runtimeAssets?.['manifest.json']?.sha256 !== lock.manifestSha256
    )
        throw new Error('Transport candidate does not match the frozen runtime/manifest');
    if (selection.candidateId === 'sdk223') {
        if (
            lock.candidateId !== 'sdk223' ||
            build !== 223 ||
            lock.businessStatus !== 'NOT_RUN' ||
            !['committedQueries', 'committedRay', 'kinematicTarget', 'fixedAtIdle', 'boxSupportDeparture'].every(
                (key) => lock.qualification?.[key] === true,
            )
        )
            throw new Error('SDK223 candidate lacks explicit limited qualification');
    } else if (selection.candidateId === 'integration-20261031') {
        if (
            lock.candidateId !== 'integration-20261031' ||
            !Number.isSafeInteger(build) ||
            !/^[a-f0-9]{64}$/.test(lock.runtimeSha256) ||
            !/^[a-f0-9]{64}$/.test(lock.manifestSha256) ||
            lock.businessStatus !== 'NOT_RUN' ||
            !/^[a-f0-9]{64}$/.test(lock.qualificationEvidence?.mapSha256 ?? '') ||
            !['committedQueries', 'committedRay', 'kinematicTarget', 'fixedAtIdle', 'boxSupportDeparture'].every(
                (key) => lock.qualification?.[key] === true,
            )
        )
            throw new Error('Integration candidate lacks explicit limited qualification');
    } else if (selection.candidateId !== 'legacy-sdk220') {
        throw new Error('Unknown transport candidate selection');
    }
}
