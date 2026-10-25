/** Explicit test admission only. Historical selectors and locks remain frozen. */
export function selectTransportCandidate(query) {
    const values = query.getAll('candidate');
    if (values.length === 0)
        return Object.freeze({ candidateId: 'legacy-sdk220', lockFile: 'transport-candidate-lock.json' });
    if (
        values.length !== 1 ||
        values[0] !== 'sdk223' ||
        query.getAll('transport').length !== 1 ||
        query.get('transport') !== 'committed-candidate' ||
        query.has('contacts')
    )
        throw new Error('Unknown, duplicate or incompatible explicit transport candidate');
    return Object.freeze({ candidateId: 'sdk223', lockFile: 'transport-candidate-sdk223-lock.json' });
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
    } else if (selection.candidateId !== 'legacy-sdk220') {
        throw new Error('Unknown transport candidate selection');
    }
}
