import { AudioService, Scene } from '../../src';

describe('PG-05 audio channel validation', () => {
    test('volume changes without a loaded channel and rejects invalid values before mutation', () => {
        const service = new AudioService(new Scene('Audio validation'));
        service.stopBgm();
        expect(service.bgmState()).toBeNull();
        service.setBgmVolume(0.25);
        expect(service.bgmVolume).toBe(0.25);
        for (const value of [NaN, Infinity, -1, 1.01]) {
            expect(() => service.setBgmVolume(value)).toThrow();
            try { service.setBgmVolume(value); } catch (error) { expect(error.code).toBe('AIR_E_AUDIO_VOLUME'); }
            expect(service.bgmVolume).toBe(0.25);
        }
        service.dispose();
    });
});
