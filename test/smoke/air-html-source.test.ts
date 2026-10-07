import { createAirHTMLSource, getAirHTMLSourceSupport } from '../../src/air/html-source';

test('experimental HTML entry rejects unsupported browser before mutating DOM or texture', () => {
    const canvas = document.createElement('canvas'), element = document.createElement('div'); canvas.appendChild(element);
    const texture = { width: 1, height: 1, reset: jest.fn(), getGFXTexture: jest.fn() };
    expect(getAirHTMLSourceSupport(canvas).supported).toBe(false);
    expect(() => createAirHTMLSource({ canvas, element, texture })).toThrow('AIR_E_HTML_SOURCE_UNSUPPORTED');
    expect(canvas.hasAttribute('content')).toBe(false); expect(element.hasAttribute('drawable')).toBe(false); expect(texture.reset).not.toHaveBeenCalled();
});
test('paint upload restores binding; geometry, snapshot and disposal are explicit', () => {
    const canvas = document.createElement('canvas'), element = document.createElement('div'); canvas.appendChild(element);
    Object.defineProperties(element, { offsetWidth: { value: 10 }, offsetHeight: { value: 20 } });
    const prior = {}, owned = {}, snapshot = { width: 10, height: 20, close: jest.fn() };
    const gl = { TEXTURE_2D: 3553, TEXTURE_BINDING_2D: 32873, RGBA: 6408, UNSIGNED_BYTE: 5121, NO_ERROR: 0, getError: () => 0, isTexture: () => true, isContextLost: () => false, getParameter: () => prior, bindTexture: jest.fn(), texElementSubImage2D: jest.fn() };
    Object.assign(canvas, { requestPaint: jest.fn(), captureElementImage: () => snapshot, updateElementGeometry: jest.fn(), clearElementGeometry: jest.fn(), getContext: () => gl });
    const texture = { width: 10, height: 20, reset: jest.fn(), getGFXTexture: () => ({ gpuTexture: { glTexture: owned, glTarget: 3553, mipLevel: 1, glFormat: 6408, glType: 5121 } }) };
    const onUpdate = jest.fn(), handle = createAirHTMLSource({ canvas, element, texture, resolution: 1, snapshot: true, onUpdate });
    canvas.dispatchEvent(new Event('paint')); canvas.dispatchEvent(new Event('paint')); expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(gl.bindTexture.mock.calls).toEqual([[3553, owned], [3553, prior]]);
    handle.updateGeometry({ canvasTransform: { a: 2, d: 2 } }); expect((canvas as any).updateElementGeometry).toHaveBeenCalledWith(snapshot, { canvasTransform: { a: 2, d: 2 } });
    handle.dispose(); handle.dispose(); expect(snapshot.close).toHaveBeenCalledTimes(1); expect(element.hasAttribute('drawable')).toBe(false); expect(canvas.hasAttribute('content')).toBe(false);
    canvas.dispatchEvent(new Event('paint')); expect(onUpdate).toHaveBeenCalledTimes(1); expect(() => handle.update()).toThrow('DISPOSED');
});
