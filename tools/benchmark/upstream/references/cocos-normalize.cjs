/** Convert retained native observations; absent values remain blockers, never invented success. */
const { SCHEMA, contractId, validateObservation } = require('./observations.cjs');
function envelope(taskId, cases) {
    return {
        schema: SCHEMA,
        taskId,
        contractId: contractId(taskId),
        engine: 'cocosair',
        status: 'OBSERVED_NOT_VALIDATED',
        cases,
    };
}
function normalizeCocos(taskId, raw) {
    let cases;
    if (taskId === 'AU07') {
        if (!raw?.pairedRaw?.blend)
            throw Error('AU07 requires fixture pairedRaw.blend, including actual together-pixels and material IDs');
        cases = raw.pairedRaw.blend;
    } else if (taskId === 'AU08') {
        if (!raw?.pairedRaw?.targets)
            throw Error(
                'AU08 requires fixture pairedRaw.targets, including native camera/target IDs and post-settlement validity',
            );
        cases = raw.pairedRaw.targets;
    } else if (taskId === 'AU09') {
        if (!raw?.results) throw Error('AU09 requires native skinning results for both RGB and RGBA');
        cases = raw.results.map((row) => ({
            id: row.color,
            camera: raw.camera,
            instances: row.independent,
            frustum: row.frustum.map((r) => ({
                weight: r.weight,
                x: r.x,
                jointChains: r.state.jointChains,
                bounds: r.state.bounds,
                coloredPixels: r.pixels.colored,
                drawCalls: r.pixels.drawCalls,
            })),
        }));
    } else if (taskId === 'AU11') {
        if (!raw?.rows) throw Error('AU11 requires the real readiness collector report rows');
        cases = raw.rows.map((row) => {
            const report = row.observation?.report;
            if (!report) throw Error(`AU11/${row.mode}: readiness terminal report missing`);
            if (['shader-failure', 'context-lost'].includes(row.mode))
                return {
                    id: row.mode,
                    terminal: report.status,
                    failureSource: report.error?.code === 'READINESS_DEVICE_OR_SHADER_FAILURE' ? row.mode : null,
                    presented: report.stages.some((s) => s.name === 'browser-presented' && s.status === 'observed'),
                    businessBefore: report.businessBefore,
                    businessAfter: report.businessAfter,
                };
            const submitted = report.stages.find((s) => s.name === 'frame-submitted')?.details;
            const presented = report.stages.find((s) => s.name === 'browser-presented')?.details;
            return {
                id: row.mode,
                terminal: report.status,
                stages: report.stages.map((s) => s.name),
                submissionId: submitted?.id,
                presentation: { ...presented, pixels: row.compositor?.center },
                readbackPixels: row.compositor?.readback,
                businessBefore: report.businessBefore,
                businessAfter: report.businessAfter,
                // This is a source-bound capability declaration, not an invented runtime call counter.
                observerAuthority: row.observerAuthority,
            };
        });
    } else {
        throw Error(
            `${taskId}: no complete native normalization is admitted; consult the task-specific reference manifest gaps`,
        );
    }
    const observation = envelope(taskId, cases);
    validateObservation(observation);
    return observation;
}
module.exports = { normalizeCocos, envelope };
