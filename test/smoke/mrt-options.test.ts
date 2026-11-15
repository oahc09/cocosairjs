import { Format, LoadOp, StoreOp } from '../../src/cocos/gfx/base/define';
import { normalizeMRTOptions, mrtClear } from '../../src/air/rendering/mrt-options';

describe('Code First MRT input contract', () => {
    const options = () => ({ width: 64, height: 32, colorAttachments: [{ format: Format.RGBA16F }] });

    test('snapshots per-attachment state and values instead of retaining mutable caller arrays', () => {
        const clear: [number, number, number, number] = [0.25, 0.5, 1, 1];
        const input = {
            ...options(),
            colorAttachments: [
                { format: Format.RGBA16F, clearValue: clear, loadOp: LoadOp.LOAD, storeOp: StoreOp.STORE },
            ],
        };
        const normalized = normalizeMRTOptions(input);
        clear[0] = 99;
        input.colorAttachments[0].loadOp = LoadOp.CLEAR;
        expect(normalized.colors[0]).toMatchObject({
            clearValue: [0.25, 0.5, 1, 1],
            loadOp: LoadOp.LOAD,
            filter: 'nearest',
        });
        expect(Object.isFrozen(normalized.colors[0].clearValue)).toBe(true);
    });

    test('undefined/nonexistent formats and wrong option names never fall back to rgba8', () => {
        for (const input of [
            { ...options(), colorAttachments: [{ format: undefined }] },
            { ...options(), colorAttachments: [{ format: 99999 }] },
            { ...options(), format: Format.RGBA8 },
            { ...options(), samples: undefined },
        ])
            expect(() => normalizeMRTOptions(input as any)).toThrow();
    });

    test('preserves exact 32-bit IDs, validates signed/unsigned ranges and rejects fractions', () => {
        expect(mrtClear(Format.R32UI, [16777217, 0, 0, 0])[0]).toBe(16777217);
        expect(mrtClear(Format.R32I, [-2147483648, 0, 0, 0])[0]).toBe(-2147483648);
        for (const value of [-1, 0.5, 4294967296])
            expect(() => mrtClear(Format.R32UI, [value, 0, 0, 0])).toThrow(
                expect.objectContaining({ code: 'AIR_E_MRT_CLEAR_VALUE' }),
            );
    });

    test('invalid dimensions, fallback, load/store state and nonfinite clear values reject', () => {
        for (const input of [
            { ...options(), width: 0 },
            { ...options(), height: 3.5 },
            { ...options(), scale: Infinity },
            { ...options(), samples: 3 },
            { ...options(), sampleFallback: 'silent' },
            { ...options(), colorAttachments: [] },
            { ...options(), colorAttachments: [{ format: Format.RG16F, clearValue: [NaN, 0, 0, 0] }] },
            { ...options(), colorAttachments: [{ format: Format.RGBA8, loadOp: 999 }] },
        ])
            expect(() => normalizeMRTOptions(input as any)).toThrow();
    });
});
