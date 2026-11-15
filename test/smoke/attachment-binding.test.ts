import type { Material } from '../../src/cocos/asset/assets/material';
import type { TextureBase } from '../../src/cocos/asset/assets/texture-base';
import { Type } from '../../src/cocos/gfx/base/define';
import { genHandle } from '../../src/cocos/render-scene/core/pass-utils';
import { bindAttachmentTexture } from '../../src/air/rendering/attachment-binding';

function fixture(lastType = Type.SAMPLER2D) {
    const original = {};
    let shared: unknown = original;
    const descriptors: unknown[] = [original, null, original];
    const material = {
        isValid: true,
        passes: [Type.SAMPLER2D, null, lastType].map((type) => ({
            getHandle: () => (type === null ? 0 : genHandle(2, type, 1)),
        })),
        getProperty: () => shared,
        setProperty: jest.fn((_property: string, value: unknown, index: number) => {
            shared = value;
            descriptors[index] = value;
        }),
    };
    return { material, descriptors, original };
}

test('attachment binding skips shadow passes and restores every descriptor sharing a property map', () => {
    const { material, descriptors, original } = fixture();
    const view = {} as TextureBase;
    const binding = bindAttachmentTexture(material as unknown as Material, 'mainTexture', view, 'TEST_BIND');
    expect(descriptors).toEqual([view, null, view]);
    binding.rebind();
    expect(material.setProperty.mock.calls.map((call) => call[2])).toEqual([0, 2, 0, 2]);
    binding.unbind();
    expect(descriptors).toEqual([original, null, original]);
    const calls = material.setProperty.mock.calls.length;
    binding.unbind();
    binding.rebind();
    expect(material.setProperty).toHaveBeenCalledTimes(calls);
});

test('incompatible or explicit missing passes reject before changing material state', () => {
    const { material } = fixture(Type.FLOAT4);
    const view = {} as TextureBase;
    for (const pass of [undefined, 1, -1, 3]) {
        expect(() =>
            bindAttachmentTexture(material as unknown as Material, 'mainTexture', view, 'TEST_BIND', pass),
        ).toThrow(expect.objectContaining({ code: 'TEST_BIND' }));
    }
    expect(material.setProperty).not.toHaveBeenCalled();
    const binding = bindAttachmentTexture(material as unknown as Material, 'mainTexture', view, 'TEST_BIND', 0);
    binding.unbind();
});
