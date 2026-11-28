/** Diagnose the pilot's producer and consumer separately instead of interpreting a final PNG alone. */
export function glassPassReport(control, active, readPng, PNG) {
    const pngs = {};
    const compact = ({ final, intermediate }, name) => {
        const { pixels, ...pass } = intermediate;
        const image = readPng(final, PNG);
        const file = name + '-final.png';
        pngs[file] = image.bytes;
        const frame = {
            frameIndex: final.frameIndex,
            sampledAt: final.sampledAt,
            width: final.width,
            height: final.height,
            png: file,
            sha256: image.sha256,
        };
        if (pixels) {
            const readback = readPng(pixels, PNG);
            const attachmentFile = name + '-background.png';
            pngs[attachmentFile] = readback.bytes;
            pass.background = { png: attachmentFile, sha256: readback.sha256, contrastPixels: readback.contrastPixels };
        }
        return { frame, pass };
    };
    const low = compact(control, 'control');
    const high = compact(active, 'active');
    const a = PNG.sync.read(pngs[low.frame.png]);
    const b = PNG.sync.read(pngs[high.frame.png]);
    if (a.width !== b.width || a.height !== b.height) throw new Error('Final viewport changed between samples.');
    let changedPixels = 0;
    for (let i = 0; i < a.data.length; i += 4) {
        if (
            Math.abs(a.data[i] - b.data[i]) +
                Math.abs(a.data[i + 1] - b.data[i + 1]) +
                Math.abs(a.data[i + 2] - b.data[i + 2]) >
            9
        )
            changedPixels++;
    }
    const passes = [low.pass, high.pass];
    let diagnosis;
    if (passes.some((p) => p.readback === 'MISSING_CAPTURE')) diagnosis = 'BACKGROUND_NOT_CAPTURED';
    else if (passes.some((p) => p.readback !== 'AVAILABLE' || !p.background)) diagnosis = 'READBACK_UNVERIFIED';
    else if (passes.some((p) => p.background.contrastPixels < 1000)) diagnosis = 'BACKGROUND_EMPTY';
    else if (low.pass.background.sha256 !== high.pass.background.sha256) diagnosis = 'BACKGROUND_CHANGED';
    else if (
        passes.some((p) => !p.bindingMatches || !p.consumer?.enabled || p.producer.priority >= p.consumer.priority)
    )
        diagnosis = 'COMPOSITE_INPUT_INVALID';
    else if (
        !Number.isFinite(low.pass.transmission) ||
        !Number.isFinite(high.pass.transmission) ||
        Math.abs(low.pass.transmission) > 1e-5 ||
        Math.abs(high.pass.transmission - 0.95) > 1e-5
    )
        diagnosis = 'TRANSMISSION_CONTROL_UNVERIFIED';
    else if (changedPixels < 50) diagnosis = 'COMPOSITE_NO_EFFECT';
    else diagnosis = 'TRANSMISSION_OBSERVED';
    return {
        pngs,
        report: {
            diagnosis,
            control: low,
            active: high,
            comparison: {
                transmission: [0, 0.95],
                changedPixels,
                minChangedPixels: 50,
                minBackgroundContrastPixels: 1000,
            },
        },
    };
}
