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
 * Cocos AIR — 全屏暗角（AIR 原创，上游无同名文件）。
 *
 * 参数面命名对齐逆向得到的 Unity 设置类 `UnityEngine.Rendering.PostProcessing.Vignette`
 * （`_re/il2cpp/dump.cs:467360-467396`：mode/color/center/intensity/smoothness/roundness/
 * rounded/mask/opacity）。这是行为等价的独立实现：Unity 的私有 shader 源码不在二进制里，
 * 逐位公式无法从 dump.cs 还原，所以下面的数学由本模块自定义并写死在文档里。
 *
 * `uv` 为 0..1 视口坐标，`k` 是归一化平方距离（视口边处为 1.0）：
 *   d = abs(uv * 2 - 1 - center * 2) * intensity
 *   d = pow(max(d, 0), roundness)
 *   classic: k = dot(d, d)
 *   rounded: k = (length(vec2(d.x * aspect, d.y)) / max(aspect, 1))^2，aspect 为 RT 宽高比
 *   v = smoothstep(1 - smoothness, 1, k)
 *   rgb = mix(src.rgb, src.rgb * color.rgb, clamp(v * opacity * color.a, 0, 1))
 * `mode: masked` 需要遮罩纹理，本模块未实现；逆向到的 profile 只用了 Classic。
 */
import { Camera } from '../../cocos/misc/camera-component';
import { Color, Vec4 } from '../../cocos/core/math';
import { createAirScreenEffect } from '../rendering/screen-effect';
import { AirScreenPass, createAirScreenPass } from '../rendering/screen-pass';
import type { AirTargetColorFormat } from '../rendering/render-target';

const VIGNETTE_BODY = `void main() {
    vec4 src = texture(sourceTexture, v_uv);
    vec2 d = abs(v_uv * 2.0 - 1.0 - airVignette0.xy * 2.0) * airVignette0.z;
    d = pow(max(d, vec2(0.0, 0.0)), vec2(max(airVignette1.x, 0.0001)));
    float aspect = max(airVignette1.w, 0.0001);
    float k;
    if (airVignette1.z > 0.5) {
        float r = length(vec2(d.x * aspect, d.y)) / max(aspect, 1.0);
        k = r * r;
    } else {
        k = dot(d, d);
    }
    float v = smoothstep(1.0 - clamp(airVignette0.w, 0.0001, 1.0), 1.0, k);
    float amount = clamp(v * airVignette1.y * airVignette2.w, 0.0, 1.0);
    cc_FragColor = vec4(mix(src.rgb, src.rgb * airVignette2.xyz, amount), src.a);
}`;

export interface AirVignetteOptions {
    /** @en Only `classic` exists; `masked` would need a mask texture this module does not carry. @zh 只实现 `classic`；`masked` 需要本模块未提供的遮罩纹理。 */
    mode?: 'classic';
    /** @en Tint multiplied into the darkened area. @zh 变暗区域乘上的色调。 */
    color?: Color;
    /** @en Falloff centre, expressed as an offset from the viewport centre (Unity's convention). @zh 暗角中心，按 Unity 约定用相对视口中心的偏移表达。 */
    center?: { x: number; y: number };
    /** @en Size of the clear area; larger shrinks the vignette. @zh 亮区大小，越大暗角越小。 */
    intensity?: number;
    /** @en Width of the falloff band, 0..1. @zh 过渡带宽度，0..1。 */
    smoothness?: number;
    /** @en Exponent applied to each axis before the distance is measured. @zh 距离度量前施加在每个轴上的指数。 */
    roundness?: number;
    /** @en Circular instead of rectangular falloff. @zh 用圆形衰减替代矩形衰减。 */
    rounded?: boolean;
    /** @en Overall strength, 0..1. @zh 总体强度，0..1。 */
    opacity?: number;
    /** @en Quad layer for the underlying pass. @zh 底层 pass 的 quad 图层。 */
    layer?: number;
    /**
     * @en Render-target colour format. The default `rgba8` keeps the source camera's own output
     *  byte-exact for solid colours; `srgb8-alpha8` is the option for pipelines that blend
     *  partial-coverage fragments against an sRGB backbuffer.
     * @zh RT 颜色格式。默认 `rgba8` 对纯色像素保持源相机输出一致；`srgb8-alpha8` 是给
     *  "半覆盖片元要按 sRGB 帧缓冲混合"的场景准备的开关。
     */
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

interface AirVignetteSettings {
    mode: 'classic';
    color: Color;
    center: { x: number; y: number };
    intensity: number;
    smoothness: number;
    roundness: number;
    rounded: boolean;
    opacity: number;
}

function fail (code: string, message: string): never {
    const error = new Error(`[${code}] ${message}`);
    Object.assign(error, { code });
    throw error;
}

function checked (value: number, label: string, min: number, max: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
        fail('AIR_E_VIGNETTE_OPTION', `${label} must be a finite number in [${min}, ${max}]`);
    return value;
}

let vignetteSerial = 0;

export interface AirVignette {
    /** @en Underlying full-screen pass; its `target` is where the source camera now renders. @zh 底层全屏 pass，其 `target` 就是源相机现在的输出。 */
    readonly pass: AirScreenPass;
    readonly settings: Readonly<AirVignetteSettings>;
    setOptions (next: AirVignetteOptions): void;
    setEnabled (enabled: boolean): void;
    dispose (): void;
}

/**
 * @en Post-process one camera with a full-screen vignette.
 * @zh 给一个相机接上全屏暗角。返回句柄持有 effect、材质、节点与 render target，`dispose()`
 *  按 sampler unbind → camera detach → 资源释放回收，并把源相机接回原来的输出。
 */
export function attachAirVignette (camera: Camera, options: AirVignetteOptions = {}): AirVignette {
    if (!camera || !(camera instanceof Camera)) fail('AIR_E_VIGNETTE_CAMERA', 'camera must be a Camera component');
    let settings: AirVignetteSettings = {
        mode: 'classic',
        color: new Color(0, 0, 0, 255),
        center: { x: 0, y: 0 },
        intensity: 1.0,
        smoothness: 0.2,
        roundness: 1.0,
        rounded: false,
        opacity: 1.0,
    };
    // Validation happens before anything is created, so a rejected option never leaves a
    // registered effect or a re-targeted camera behind.
    const assign = (next: AirVignetteOptions): void => {
        if (next.mode !== undefined && next.mode !== 'classic') fail('AIR_E_VIGNETTE_MODE', `mode ${String(next.mode)} is not implemented; only classic is available`);
        const merged: AirVignetteSettings = {
            mode: 'classic',
            color: next.color ?? settings.color,
            center: { x: next.center?.x ?? settings.center.x, y: next.center?.y ?? settings.center.y },
            intensity: next.intensity ?? settings.intensity,
            smoothness: next.smoothness ?? settings.smoothness,
            roundness: next.roundness ?? settings.roundness,
            rounded: next.rounded ?? settings.rounded,
            opacity: next.opacity ?? settings.opacity,
        };
        if (!(merged.color instanceof Color)) fail('AIR_E_VIGNETTE_OPTION', 'color must be a Color');
        checked(merged.center.x, 'center.x', -1, 1);
        checked(merged.center.y, 'center.y', -1, 1);
        checked(merged.intensity, 'intensity', 0, 4);
        checked(merged.smoothness, 'smoothness', 0, 1);
        checked(merged.roundness, 'roundness', 0.05, 8);
        checked(merged.opacity, 'opacity', 0, 1);
        settings = merged;
    };
    assign(options);

    const name = options.name ?? `air-vignette-${++vignetteSerial}`;
    const effect = createAirScreenEffect({
        name,
        constants: ['airVignette0', 'airVignette1', 'airVignette2'],
        samplers: ['sourceTexture'],
        body: VIGNETTE_BODY,
        defaults: { airVignette0: [0, 0, 1, 0.2], airVignette1: [1, 1, 0, 1], airVignette2: [0, 0, 0, 1] },
    });
    let pass: AirScreenPass;
    const apply = (): void => {
        const size = pass.target.info;
        const color = settings.color;
        pass.setConstant('airVignette0', new Vec4(settings.center.x, settings.center.y, settings.intensity, settings.smoothness));
        pass.setConstant('airVignette1', new Vec4(settings.roundness, settings.opacity, settings.rounded ? 1 : 0, size.width / size.height));
        pass.setConstant('airVignette2', new Vec4(color.r / 255, color.g / 255, color.b / 255, color.a / 255));
    };
    // On failure the pass has already released everything it created, including the effect.
    pass = createAirScreenPass({ camera, effect, sampler: 'sourceTexture', layer: options.layer, colorFormat: options.colorFormat, samples: options.samples, name, onResize: apply });
    apply();

    let disposed = false;
    return {
        get pass (): AirScreenPass { return pass; },
        get settings (): Readonly<AirVignetteSettings> { return { ...settings, center: { ...settings.center }, color: new Color(settings.color.r, settings.color.g, settings.color.b, settings.color.a) }; },
        setOptions (next: AirVignetteOptions): void {
            if (disposed) fail('AIR_E_VIGNETTE_DISPOSED', 'vignette has been disposed');
            assign(next);
            apply();
        },
        setEnabled (enabled: boolean): void {
            if (disposed) fail('AIR_E_VIGNETTE_DISPOSED', 'vignette has been disposed');
            pass.setEnabled(enabled);
        },
        dispose (): void {
            if (disposed) return;
            disposed = true;
            pass.dispose();
        },
    };
}
