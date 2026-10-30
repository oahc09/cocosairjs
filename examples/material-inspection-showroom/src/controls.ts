/** Example input contract, independent of rendering and the loader's schema validation. */
export interface MaterialControls {
    uvScale: number;
    uvRotation: number;
    iridescence: number;
    ior: number;
    thicknessMin: number;
    thicknessMax: number;
}
export function validateControls(value: MaterialControls): void {
    if (!Object.values(value).every(Number.isFinite))
        throw new TypeError('All material inputs must be finite numbers.');
    if (value.uvScale <= 0) throw new RangeError('UV scale must be positive.');
    if (value.iridescence < 0 || value.iridescence > 1) throw new RangeError('Iridescence must be in [0, 1].');
    if (value.ior < 1) throw new RangeError('Film IOR must be >= 1; there is no invented upper bound.');
    if (value.thicknessMin < 0 || value.thicknessMax < value.thicknessMin)
        throw new RangeError('Film thickness must satisfy 0 <= min <= max, in nanometers.');
}
export function uvRows(value: MaterialControls): [number[], number[]] {
    validateControls(value);
    const c = Math.cos(value.uvRotation) * value.uvScale;
    const s = Math.sin(value.uvRotation) * value.uvScale;
    return [
        [c, s, 0, 0],
        [-s, c, 0, 0],
    ];
}
