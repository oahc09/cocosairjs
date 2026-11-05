import { createAirHTMLSource, getAirHTMLSourceSupport } from '../../src/air/html-source';

test('experimental HTML entry rejects unsupported browser before mutating DOM or texture', () => {
    const canvas = document.createElement('canvas');
    const element = document.createElement('div');
    canvas.appendChild(element);
    const texture = { width: 1, height: 1, reset: jest.fn(), getGFXTexture: jest.fn() };
    expect(getAirHTMLSourceSupport(canvas).supported).toBe(false);
    expect(() => createAirHTMLSource({ canvas, element, texture })).toThrow('AIR_E_HTML_SOURCE_UNSUPPORTED');
    expect(canvas.hasAttribute('content')).toBe(false);
    expect(element.hasAttribute('drawable')).toBe(false);
    expect(texture.reset).not.toHaveBeenCalled();
});
test('paint upload restores binding; geometry, snapshot and disposal are explicit', () => {
    const canvas = document.createElement('canvas');
    const element = document.createElement('div');
    canvas.appendChild(element);
    Object.defineProperties(element, { offsetWidth: { value: 10 }, offsetHeight: { value: 20 } });
    const prior = {};
    const owned = {};
    const snapshot = { width: 10, height: 20, close: jest.fn() };
    const gl = {
        TEXTURE_2D: 3553,
        TEXTURE_BINDING_2D: 32873,
        RGBA: 6408,
        UNSIGNED_BYTE: 5121,
        NO_ERROR: 0,
        getError: () => 0,
        isTexture: () => true,
        isContextLost: () => false,
        getParameter: () => prior,
        bindTexture: jest.fn(),
        texElementSubImage2D: jest.fn(),
    };
    Object.assign(canvas, {
        requestPaint: jest.fn(),
        captureElementImage: () => snapshot,
        updateElementGeometry: jest.fn(),
        clearElementGeometry: jest.fn(),
        getContext: () => gl,
    });
    const texture = {
        width: 10,
        height: 20,
        reset: jest.fn(),
        getGFXTexture: () => ({
            gpuTexture: { glTexture: owned, glTarget: 3553, mipLevel: 1, glFormat: 6408, glType: 5121 },
        }),
    };
    const onUpdate = jest.fn();
    const handle = createAirHTMLSource({ canvas, element, texture, resolution: 1, snapshot: true, onUpdate });
    canvas.dispatchEvent(new Event('paint'));
    canvas.dispatchEvent(new Event('paint'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(gl.bindTexture.mock.calls).toEqual([
        [3553, owned],
        [3553, prior],
    ]);
    handle.updateGeometry({ canvasTransform: { a: 2, d: 2 } });
    expect((canvas as any).updateElementGeometry).toHaveBeenCalledWith(snapshot, { canvasTransform: { a: 2, d: 2 } });
    handle.dispose();
    handle.dispose();
    expect(snapshot.close).toHaveBeenCalledTimes(1);
    expect(element.hasAttribute('drawable')).toBe(false);
    expect(canvas.hasAttribute('content')).toBe(false);
    canvas.dispatchEvent(new Event('paint'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(() => handle.update()).toThrow('DISPOSED');
});

function createSupportedSourceFixture() {
    const canvas = document.createElement('canvas');
    const element = document.createElement('div');
    canvas.appendChild(element);
    Object.defineProperties(element, { offsetWidth: { value: 10 }, offsetHeight: { value: 20 } });
    const snapshot = { width: 10, height: 20, close: jest.fn() };
    const gl = {
        TEXTURE_2D: 3553,
        TEXTURE_BINDING_2D: 32873,
        RGBA: 6408,
        UNSIGNED_BYTE: 5121,
        NO_ERROR: 0,
        getError: () => 0,
        isTexture: () => true,
        isContextLost: () => false,
        getParameter: () => null,
        bindTexture: jest.fn(),
        texElementSubImage2D: jest.fn(),
    };
    const surface = Object.assign(canvas, {
        requestPaint: jest.fn(),
        captureElementImage: () => snapshot,
        updateElementGeometry: jest.fn(),
        clearElementGeometry: jest.fn(),
        getContext: () => gl,
    });
    const texture = {
        width: 10,
        height: 20,
        reset: jest.fn(),
        getGFXTexture: () => ({
            gpuTexture: { glTexture: {}, glTarget: 3553, mipLevel: 1, glFormat: 6408, glType: 5121 },
        }),
    };
    return { canvas, element, surface, texture, snapshot, gl };
}

test.each([false, true])('failed initial paint restores original DOM attributes (%s) and permits retry', (existing) => {
    const { canvas, element, surface, texture, gl } = createSupportedSourceFixture();
    if (existing) {
        canvas.setAttribute('content', 'original-content');
        canvas.setAttribute('layoutsubtree', 'original-layout');
        element.setAttribute('drawable', 'original-drawable');
    }
    const addListener = jest.spyOn(canvas, 'addEventListener');
    const removeListener = jest.spyOn(canvas, 'removeEventListener');
    const failure = new Error('initial paint request failed');
    surface.requestPaint.mockImplementationOnce(() => {
        throw failure;
    });
    expect(() => createAirHTMLSource({ canvas, element, texture, resolution: 1 })).toThrow(failure);
    expect(removeListener).toHaveBeenCalledWith('paint', addListener.mock.calls[0][1]);
    expect(canvas.getAttribute('content')).toBe(existing ? 'original-content' : null);
    expect(canvas.getAttribute('layoutsubtree')).toBe(existing ? 'original-layout' : null);
    expect(element.getAttribute('drawable')).toBe(existing ? 'original-drawable' : null);
    canvas.dispatchEvent(new Event('paint'));
    expect(gl.texElementSubImage2D).not.toHaveBeenCalled();

    const retry = createAirHTMLSource({ canvas, element, texture, resolution: 1 });
    canvas.dispatchEvent(new Event('paint'));
    expect(retry.status).toBe('ready');
    retry.dispose();
    expect(canvas.getAttribute('content')).toBe(existing ? 'original-content' : null);
    expect(canvas.getAttribute('layoutsubtree')).toBe(existing ? 'original-layout' : null);
    expect(element.getAttribute('drawable')).toBe(existing ? 'original-drawable' : null);
});

test('failed construction leaves another source on the same canvas leased and usable', () => {
    const { canvas, element, surface, texture } = createSupportedSourceFixture();
    const first = createAirHTMLSource({ canvas, element, texture, resolution: 1 });
    const other = document.createElement('div');
    canvas.appendChild(other);
    const failure = new Error('second paint request failed');
    surface.requestPaint.mockImplementationOnce(() => {
        throw failure;
    });
    expect(() => createAirHTMLSource({ canvas, element: other, texture, resolution: 1 })).toThrow(failure);
    expect(canvas.getAttribute('content')).toBe('drawable');
    expect(canvas.getAttribute('layoutsubtree')).toBe('');
    expect(element.getAttribute('drawable')).toBe('');
    expect(other.hasAttribute('drawable')).toBe(false);
    canvas.dispatchEvent(new Event('paint'));
    expect(first.status).toBe('ready');

    const retry = createAirHTMLSource({ canvas, element: other, texture, resolution: 1 });
    first.dispose();
    expect(canvas.getAttribute('content')).toBe('drawable');
    retry.dispose();
    expect(canvas.hasAttribute('content')).toBe(false);
    expect(canvas.hasAttribute('layoutsubtree')).toBe(false);
});

test('failed construction releases a synchronously captured snapshot even when cleanup throws', () => {
    const { canvas, element, surface, texture, snapshot } = createSupportedSourceFixture();
    const failure = new Error('initial paint request failed');
    surface.requestPaint.mockImplementationOnce(() => {
        canvas.dispatchEvent(new Event('paint'));
        throw failure;
    });
    surface.clearElementGeometry.mockImplementationOnce(() => {
        throw new Error('geometry cleanup failed');
    });
    snapshot.close.mockImplementationOnce(() => {
        throw new Error('snapshot cleanup failed');
    });
    let thrown: unknown;
    try {
        createAirHTMLSource({ canvas, element, texture, resolution: 1, snapshot: true });
    } catch (error) {
        thrown = error;
    }
    expect(thrown).toBe(failure);
    expect(surface.clearElementGeometry).toHaveBeenCalledWith(snapshot);
    expect(snapshot.close).toHaveBeenCalledTimes(1);
    expect(canvas.hasAttribute('content')).toBe(false);
    expect(canvas.hasAttribute('layoutsubtree')).toBe(false);
    expect(element.hasAttribute('drawable')).toBe(false);
    const retry = createAirHTMLSource({ canvas, element, texture, resolution: 1 });
    retry.dispose();
});

test('partial DOM initialization failure releases the element lease and restores canvas attributes', () => {
    const { canvas, element, texture } = createSupportedSourceFixture();
    const failure = new Error('drawable setup failed');
    jest.spyOn(element, 'setAttribute').mockImplementationOnce(() => {
        throw failure;
    });
    expect(() => createAirHTMLSource({ canvas, element, texture, resolution: 1 })).toThrow(failure);
    expect(canvas.hasAttribute('content')).toBe(false);
    expect(canvas.hasAttribute('layoutsubtree')).toBe(false);
    const retry = createAirHTMLSource({ canvas, element, texture, resolution: 1 });
    retry.dispose();
});
