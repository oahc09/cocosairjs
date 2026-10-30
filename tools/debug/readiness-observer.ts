/** Verification-side observation only. Never ticks, warms, compiles, loads or changes the app. */
export interface AirReadinessInspection {
    status: 'available' | 'unknown' | 'failed';
    details: unknown;
}
export interface AirSubmissionReceipt {
    id: string;
    scene: string;
    afterDraw: boolean;
    frame: number;
}
export interface AirPresentationReceipt {
    source: 'browser-compositor';
    submissionId: string;
    sha256: string;
    width: number;
    height: number;
    contentValidated: boolean;
}
export interface AirReadinessOptions {
    engineCreated: Promise<unknown>;
    resources: readonly { name: string; promise: Promise<unknown> }[];
    inspectPasses: () => AirReadinessInspection | Promise<AirReadinessInspection>;
    waitForSubmission: () => Promise<AirSubmissionReceipt>;
    waitForPresentation: (submission: AirSubmissionReceipt) => Promise<AirPresentationReceipt>;
    snapshotBusiness: () => unknown;
    timeoutMs: number;
    signal?: AbortSignal;
    fault?: Promise<Error>;
    cleanup?: () => void;
}
export interface AirReadinessReport {
    status: 'READY' | 'BLOCKED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';
    stages: { name: string; status: string; elapsedMs: number; details?: unknown }[];
    businessBefore: unknown;
    businessAfter?: unknown;
    businessUnchanged?: boolean;
    lastStage: string;
    error?: { code: string; message: string };
}

function canonical(value: unknown): string {
    const visit = (input: any): any => {
        if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
        if (typeof input === 'number' && Number.isFinite(input)) return input;
        if (Array.isArray(input)) return input.map(visit);
        if (input && Object.getPrototypeOf(input) === Object.prototype)
            return Object.fromEntries(
                Object.keys(input)
                    .sort()
                    .map((key) => [key, visit(input[key])]),
            );
        throw new Error('business snapshot must contain finite JSON values, without cycles or opaque objects');
    };
    return JSON.stringify(visit(value));
}
function failure(code: string, message: string): Error & { code: string } {
    return Object.assign(new Error(message), { code });
}
function settled<T>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
    return promise.then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error }),
    );
}

/**
 * Observe supplied promises and actual stage receipts. The caller owns the application and
 * resource cancellation. A timeout only stops observation and removes observer-owned hooks.
 * `available` requires actual pass evidence; absent GPU/compiler observations stay `unknown`.
 * A compositor receipt must come from an external screenshot validator, never GPU readback alone.
 */
export async function observeAirFirstFrame(options: AirReadinessOptions): Promise<AirReadinessReport> {
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)
        throw failure('READINESS_OPTIONS', 'timeoutMs must be finite and positive');
    const start = performance.now();
    const before = canonical(options.snapshotBusiness());
    const report: AirReadinessReport = {
        status: 'FAILED',
        stages: [],
        businessBefore: JSON.parse(before),
        lastStage: 'engine-created',
    };
    // Attach rejection handlers immediately, even while an earlier stage is pending.
    const engine = settled(options.engineCreated);
    const resources = settled(
        Promise.all(
            options.resources.map(async (resource) => {
                await resource.promise;
                return resource.name;
            }),
        ),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    const terminal = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(failure('READINESS_TIMEOUT', `deadline ${options.timeoutMs}ms exceeded`)),
            options.timeoutMs,
        );
        abort = () => reject(failure('READINESS_ABORTED', 'readiness observation aborted'));
        if (options.signal?.aborted) abort();
        else options.signal?.addEventListener('abort', abort, { once: true });
        options.fault?.then((error) => reject(failure('READINESS_DEVICE_OR_SHADER_FAILURE', error.message)), reject);
    });
    const stage = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
        report.lastStage = name;
        const row = { name, status: 'pending', elapsedMs: performance.now() - start };
        report.stages.push(row);
        try {
            const value = await Promise.race([run(), terminal]);
            row.status = 'observed';
            return value;
        } catch (error) {
            row.status = 'failed';
            throw error;
        } finally {
            row.elapsedMs = performance.now() - start;
        }
    };
    const unwrap = async <T>(promise: ReturnType<typeof settled<T>>): Promise<T> => {
        const result = await promise;
        if (!result.ok) throw result.error;
        return result.value;
    };
    try {
        await stage('engine-created', () => unwrap(engine));
        const names = await stage('declared-resources', () => unwrap(resources));
        report.stages[report.stages.length - 1].details = names;
        const inspection = await stage('scene-passes', async () => options.inspectPasses());
        report.stages[report.stages.length - 1].details = inspection;
        if (inspection.status === 'unknown') {
            report.status = 'BLOCKED';
            throw failure('READINESS_PASS_UNKNOWN', 'scene Shader/Pass availability is not observable');
        }
        if (inspection.status !== 'available') throw failure('READINESS_PASS_FAILED', 'scene Shader/Pass failed');
        const submission = await stage('frame-submitted', options.waitForSubmission);
        if (
            !submission.afterDraw ||
            !submission.id ||
            !submission.scene ||
            !Number.isInteger(submission.frame) ||
            submission.frame < 0
        )
            throw failure('READINESS_SUBMISSION_INVALID', 'missing actual scene/frame submission receipt');
        report.stages[report.stages.length - 1].details = submission;
        const presentation = await stage('browser-presented', () => options.waitForPresentation(submission));
        report.stages[report.stages.length - 1].details = presentation;
        if (
            presentation.source !== 'browser-compositor' ||
            presentation.submissionId !== submission.id ||
            !/^[0-9a-f]{64}$/.test(presentation.sha256) ||
            !presentation.contentValidated ||
            !Number.isInteger(presentation.width) ||
            !Number.isInteger(presentation.height) ||
            presentation.width < 1 ||
            presentation.height < 1
        )
            throw failure('READINESS_PRESENTATION_INVALID', 'a matching validated compositor screenshot is required');
        report.status = 'READY';
    } catch (error) {
        const code = (error as { code?: string })?.code || 'READINESS_STAGE_FAILED';
        report.error = { code, message: String((error as Error)?.message || error) };
        if (code === 'READINESS_TIMEOUT') report.status = 'TIMED_OUT';
        else if (code === 'READINESS_ABORTED') report.status = 'ABORTED';
        else if (code !== 'READINESS_PASS_UNKNOWN') report.status = 'FAILED';
    } finally {
        clearTimeout(timer);
        if (abort) options.signal?.removeEventListener('abort', abort);
        try {
            const after = canonical(options.snapshotBusiness());
            report.businessAfter = JSON.parse(after);
            report.businessUnchanged = before === after;
            if (!report.businessUnchanged) {
                report.status = 'FAILED';
                report.error = {
                    code: 'READINESS_BUSINESS_ADVANCED',
                    message: 'business state changed during readiness observation',
                };
            }
        } catch (error) {
            report.status = 'FAILED';
            report.error = { code: 'READINESS_SNAPSHOT_FAILED', message: String(error) };
        }
        try {
            options.cleanup?.();
        } catch (error) {
            report.status = 'FAILED';
            report.error = { code: 'READINESS_CLEANUP_FAILED', message: String(error) };
        }
    }
    return report;
}
