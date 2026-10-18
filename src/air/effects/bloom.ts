/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
/**
 * Cocos AIR — 单 pass 全屏泛光（AIR 原创，上游无同名文件）。
 *
 * 参数面命名对齐逆向得到的 Unity 设置类 `UnityEngine.Rendering.PostProcessing.Bloom`
 * （`_re/il2cpp/dump.cs:466378-466400`：intensity/threshold/softKnee/clamp/diffusion/
 * anamorphicRatio/color/fastMode/dirtTexture/dirtIntensity）。
 *
 * 与 Unity 的差别必须说清楚：`BloomRenderer` 走的是多级 mip 降采样 + 升采样链
 * （dump.cs 里 `BloomRenderer.Pass` 的 Downsample13/4、Upsample13/4），本模块是一个
 * **单 pass** 的黄金角圆盘采样近似，没有 mip 链，也没有 dirt 纹理
 * （`dirtTexture`/`dirtIntensity` 直接拒绝）。它证明的是同一套全屏 pass 机器能承载第二个
 * 像素效果，不是 Unity Bloom 的逐位还原。
 *
 * 公式（全部在 RT 的 0..1 LDR 值上）：
 *   lum   = dot(c, vec3(0.2126, 0.7152, 0.0722))
 *   knee  = threshold * softKnee
 *   w     = softKnee > 0 ? clamp(lum - threshold + knee, 0, 2 * knee)^2 / (4 * knee) : max(lum - threshold, 0)
 *   w     = min(w, clamp)
 *   bloom = mean over N taps of prefilter(sample(uv + offset))，N = fastMode ? 8 : 16
 *   rgb   = min(src + bloom * color.rgb * intensity * color.a, 1)
 */
import { Camera } from '../../cocos/misc/camera-component';
import { Color, Vec4 } from '../../cocos/core/math';
import { createAirScreenEffect } from '../rendering/screen-effect';
import { AirScreenPass, createAirScreenPass } from '../rendering/screen-pass';
import type { AirTargetColorFormat } from '../rendering/render-target';

const BLOOM_BODY = `const float AIR_GOLDEN_ANGLE = 2.399963229728653;
vec3 air_bloomPrefilter(vec3 c) {
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float knee = max(airBloom0.x * airBloom0.y, 0.000001);
    float soft = clamp(lum - airBloom0.x + knee, 0.0, 2.0 * knee);
    float w = airBloom0.y > 0.0001 ? (soft * soft) / (4.0 * knee) : max(lum - airBloom0.x, 0.0);
    return c * min(w, max(airBloom0.z, 0.0));
}
void main() {
    vec4 src = texture(sourceTexture, v_uv);
    int taps = airBloom1.z > 0.5 ? 8 : 16;
    vec2 texel = vec2(1.0 / max(airBloom3.x, 1.0), 1.0 / max(airBloom3.y, 1.0));
    vec2 stretch = vec2(1.0 + airBloom1.y, 1.0 - airBloom1.y);
    float radius = max(airBloom1.x, 0.0);
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 16; i++) {
        if (i >= taps) { break; }
        float fi = float(i);
        float angle = fi * AIR_GOLDEN_ANGLE;
        float rr = sqrt((fi + 0.5) / float(taps));
        vec2 offset = vec2(cos(angle) * stretch.x, sin(angle) * stretch.y) * (rr * radius) * texel;
        acc += air_bloomPrefilter(texture(sourceTexture, v_uv + offset).rgb);
    }
    acc /= float(taps);
    vec3 glow = acc * airBloom2.xyz * (max(airBloom0.w, 0.0) * airBloom2.w);
    cc_FragColor = vec4(min(src.rgb + glow, vec3(1.0)), src.a);
}`;

export interface AirBloomOptions {
    /** @en Weight of the added glow. @zh 叠加辉光的权重。 */
    intensity?: number;
    /** @en Luminance a tap must pass before it contributes. @zh 采样点亮度超过该阈值才贡献辉光。 */
    threshold?: number;
    /** @en Soft-knee width as a fraction of the threshold, 0..1. @zh 以阈值比例表达的软拐点宽度，0..1。 */
    softKnee?: number;
    /** @en Per-tap contribution cap in LDR units. @zh 单个采样点贡献的上限（LDR 0..1 量纲）。 */
    clamp?: number;
    /** @en Kernel radius in device pixels. @zh 卷积核半径，单位是设备像素。 */
    diffusion?: number;
    /** @en -1 vertical streak, 0 isotropic, 1 horizontal streak. @zh -1 竖向拉丝，0 各向同性，1 横向拉丝。 */
    anamorphicRatio?: number;
    /** @en Tint multiplied into the glow. @zh 辉光叠加时乘上的色调。 */
    color?: Color;
    /** @en Eight taps instead of sixteen. @zh 用 8 个采样点代替 16 个。 */
    fastMode?: boolean;
    /** @en Quad layer for the underlying pass. @zh 底层 pass 的 quad 图层。 */
    layer?: number;
    /** @en Render-target colour format, same trade-off as the vignette pass. @zh RT 颜色格式，取舍同暗角 pass。 */
    colorFormat?: AirTargetColorFormat;
    /**
     * @en Render-target multisample count; set it to the window framebuffer's count so anti-aliased
     *  edges survive the round trip unchanged. `pass.info.samples` reports what the target got.
     * @zh RT 的采样数；设成屏幕帧缓冲的采样数，抗锯齿边缘才能在往返后保持不变。实际档位看
     *  `pass.info.samples`。
     */
    samples?: 1 | 2 | 4 | 8;
    /** @en Name prefix for the owned effect and nodes. @zh 自建 effect 与节点的名字前缀。 */
    name?: string;
}

interface AirBloomSettings {
    intensity: number;
    threshold: number;
    softKnee: number;
    clamp: number;
    diffusion: number;
    anamorphicRatio: number;
    color: Color;
    fastMode: boolean;
}

function fail (code: string, message: string): never {
    const error = new Error(`[${code}] ${message}`);
    Object.assign(error, { code });
    throw error;
}

function checked (value: number, label: string, min: number, max: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
        fail('AIR_E_BLOOM_OPTION', `${label} must be a finite number in [${min}, ${max}]`);
    return value;
}

function rejectDirt (next: AirBloomOptions): void {
    if ('dirtTexture' in next || 'dirtIntensity' in next)
        fail('AIR_E_BLOOM_DIRT', 'the dirt-texture part of Unity Bloom is not implemented; leave dirtTexture/dirtIntensity out');
}

let bloomSerial = 0;

export interface AirBloom {
    readonly pass: AirScreenPass;
    readonly settings: Readonly<AirBloomSettings>;
    setOptions (next: AirBloomOptions): void;
    setEnabled (enabled: boolean): void;
    dispose (): void;
}

/**
 * @en Post-process one camera with a single-pass bloom.
 * @zh 给一个相机接上单 pass 泛光。生命周期与 `attachAirVignette` 相同：`dispose()` 归还源相机
 *  的输出并释放本句柄创建的 effect/材质/节点/render target。
 */
export function attachAirBloom (camera: Camera, options: AirBloomOptions = {}): AirBloom {
    if (!camera || !(camera instanceof Camera)) fail('AIR_E_BLOOM_CAMERA', 'camera must be a Camera component');
    let settings: AirBloomSettings = {
        intensity: 1.0,
        threshold: 0.6,
        softKnee: 0.5,
        clamp: 1.0,
        diffusion: 12.0,
        anamorphicRatio: 0.0,
        color: new Color(255, 255, 255, 255),
        fastMode: false,
    };
    const assign = (next: AirBloomOptions): void => {
        rejectDirt(next);
        const merged: AirBloomSettings = {
            intensity: next.intensity ?? settings.intensity,
            threshold: next.threshold ?? settings.threshold,
            softKnee: next.softKnee ?? settings.softKnee,
            clamp: next.clamp ?? settings.clamp,
            diffusion: next.diffusion ?? settings.diffusion,
            anamorphicRatio: next.anamorphicRatio ?? settings.anamorphicRatio,
            color: next.color ?? settings.color,
            fastMode: next.fastMode ?? settings.fastMode,
        };
        if (!(merged.color instanceof Color)) fail('AIR_E_BLOOM_OPTION', 'color must be a Color');
        checked(merged.intensity, 'intensity', 0, 8);
        checked(merged.threshold, 'threshold', 0, 1);
        checked(merged.softKnee, 'softKnee', 0, 1);
        checked(merged.clamp, 'clamp', 0, 1);
        checked(merged.diffusion, 'diffusion', 0, 64);
        checked(merged.anamorphicRatio, 'anamorphicRatio', -1, 1);
        settings = merged;
    };
    assign(options);

    const name = options.name ?? `air-bloom-${++bloomSerial}`;
    const effect = createAirScreenEffect({
        name,
        constants: ['airBloom0', 'airBloom1', 'airBloom2', 'airBloom3'],
        samplers: ['sourceTexture'],
        body: BLOOM_BODY,
        defaults: { airBloom0: [0.6, 0.5, 1, 1], airBloom1: [12, 0, 0, 0], airBloom2: [1, 1, 1, 1], airBloom3: [1, 1, 0, 0] },
    });
    let pass: AirScreenPass;
    const apply = (): void => {
        const size = pass.target.info;
        const color = settings.color;
        pass.setConstant('airBloom0', new Vec4(settings.threshold, settings.softKnee, settings.clamp, settings.intensity));
        pass.setConstant('airBloom1', new Vec4(settings.diffusion, settings.anamorphicRatio, settings.fastMode ? 1 : 0, 0));
        pass.setConstant('airBloom2', new Vec4(color.r / 255, color.g / 255, color.b / 255, color.a / 255));
        pass.setConstant('airBloom3', new Vec4(size.width, size.height, 0, 0));
    };
    pass = createAirScreenPass({ camera, effect, sampler: 'sourceTexture', layer: options.layer, colorFormat: options.colorFormat, samples: options.samples, name, onResize: apply });
    apply();

    let disposed = false;
    return {
        get pass (): AirScreenPass { return pass; },
        get settings (): Readonly<AirBloomSettings> { return { ...settings, color: new Color(settings.color.r, settings.color.g, settings.color.b, settings.color.a) }; },
        setOptions (next: AirBloomOptions): void {
            if (disposed) fail('AIR_E_BLOOM_DISPOSED', 'bloom has been disposed');
            assign(next);
            apply();
        },
        setEnabled (enabled: boolean): void {
            if (disposed) fail('AIR_E_BLOOM_DISPOSED', 'bloom has been disposed');
            pass.setEnabled(enabled);
        },
        dispose (): void {
            if (disposed) return;
            disposed = true;
            pass.dispose();
        },
    };
}
