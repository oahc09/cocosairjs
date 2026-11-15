/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 of the Software, and to permit persons to whom the Software is furnished to
 do so, subject to the following conditions:

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
import {
    BlendFactor,
    BlendOp,
    ColorMask,
    Format,
    FormatInfos,
    FormatType,
    ShaderStageFlagBit,
} from '../../cocos/gfx/base/define';
import type { BlendState, BlendTarget } from '../../cocos/gfx/base/pipeline-sub-state';
import type { IWebGL2GPUShader } from '../../cocos/gfx/webgl2/webgl2-gpu-objects';
import { reflectGLSLFragmentOutputNames } from './shader-output-interface';

interface AttachmentState {
    buffers: number[];
    active: number[];
    formats: readonly Format[];
}
interface IndexedBlend {
    enableiOES(target: number, index: number): void;
    disableiOES(target: number, index: number): void;
    blendEquationSeparateiOES(index: number, color: number, alpha: number): void;
    blendFuncSeparateiOES(index: number, src: number, dst: number, srcAlpha: number, dstAlpha: number): void;
    colorMaskiOES(index: number, r: boolean, g: boolean, b: boolean, a: boolean): void;
}
interface IndexedState {
    extension: IndexedBlend | null;
    touched: boolean;
    signatures: number[][];
}
const framebuffers = new WeakMap<WebGLFramebuffer, AttachmentState>();
const programs = new WeakMap<IWebGL2GPUShader, { program: WebGLProgram; locations: Set<number> }>();
const indexed = new WeakMap<WebGL2RenderingContext, IndexedState>();

export function registerWebGL2Attachments(framebuffer: WebGLFramebuffer, buffers: number[], formats: Format[]): void {
    framebuffers.set(framebuffer, { buffers: buffers.slice(), active: buffers.slice(), formats: formats.slice() });
}
export function forgetWebGL2Attachments(framebuffer: WebGLFramebuffer): void {
    framebuffers.delete(framebuffer);
}
export function invalidateWebGL2IndexedBlend(gl: WebGL2RenderingContext): void {
    const state = indexed.get(gl);
    if (state) state.signatures.length = 0;
}

/** Restore shared native state before clears: cached target zero describes the non-indexed state. */
export function beginWebGL2AttachmentPass(
    gl: WebGL2RenderingContext,
    framebuffer: WebGLFramebuffer | null,
    target: BlendTarget,
    ops: readonly number[],
    factors: readonly number[],
): void {
    const state = indexed.get(gl);
    if (state?.touched) {
        if (target.blend) gl.enable(gl.BLEND);
        else gl.disable(gl.BLEND);
        gl.blendEquationSeparate(ops[target.blendEq], ops[target.blendAlphaEq]);
        gl.blendFuncSeparate(
            factors[target.blendSrc],
            factors[target.blendDst],
            factors[target.blendSrcAlpha],
            factors[target.blendDstAlpha],
        );
        const mask = target.blendColorMask;
        gl.colorMask(!!(mask & ColorMask.R), !!(mask & ColorMask.G), !!(mask & ColorMask.B), !!(mask & ColorMask.A));
        state.touched = false;
        state.signatures.length = 0;
    }
    const attachments = framebuffer && framebuffers.get(framebuffer);
    if (!attachments || attachments.buffers.length < 2) return;
    let changed = false;
    for (let i = 0; i < attachments.buffers.length; ++i) {
        if (attachments.active[i] !== attachments.buffers[i]) changed = true;
        attachments.active[i] = attachments.buffers[i];
    }
    if (changed) gl.drawBuffers(attachments.active);
}

function linkedLocations(gl: WebGL2RenderingContext, shader: IWebGL2GPUShader, limit: number): Set<number> {
    const cached = programs.get(shader);
    if (cached?.program === shader.glProgram) return cached.locations;
    const source = shader.gpuStages.find((stage) => stage.type === ShaderStageFlagBit.FRAGMENT)?.source;
    const reflected =
        source === undefined
            ? { status: 'unknown' as const, reason: 'No fragment stage.' }
            : reflectGLSLFragmentOutputNames(source);
    if (reflected.status === 'unknown' || !shader.glProgram) {
        throw Object.assign(
            new Error(
                `Cannot determine MRT fragment outputs: ${reflected.status === 'unknown' ? reflected.reason : 'No linked program.'}`,
            ),
            { code: 'AIR_E_FRAGMENT_OUTPUTS_UNKNOWN', shader: shader.name, stage: 'fragment' },
        );
    }
    const locations = new Set<number>();
    for (const output of reflected.outputs) {
        for (let i = 0; i < (output.array ? limit : 1); ++i) {
            const location = gl.getFragDataLocation(
                shader.glProgram,
                output.array ? `${output.name}[${i}]` : output.name,
            );
            if (location >= 0) locations.add(location);
        }
    }
    programs.set(shader, { program: shader.glProgram, locations });
    return locations;
}

/** Called at each actual draw, even when the PSO did not change between render passes. */
export function applyWebGL2AttachmentOutputs(
    gl: WebGL2RenderingContext,
    framebuffer: WebGLFramebuffer | null,
    shader: IWebGL2GPUShader | null,
    blend: BlendState | null,
    limit: number,
    ops: readonly number[],
    factors: readonly number[],
): void {
    const attachments = framebuffer && framebuffers.get(framebuffer);
    if (!attachments || attachments.buffers.length < 2 || !shader || !blend) return;
    const locations = linkedLocations(gl, shader, limit);
    let constantColor = false,
        constantAlpha = false;
    for (let i = 0; i < attachments.buffers.length; ++i) {
        const target = blend.targets[blend.isIndepend ? i : 0];
        if (!target)
            throw Object.assign(new Error(`WEBGL2_BLEND_TARGET_MISSING: ${i}`), {
                code: 'WEBGL2_BLEND_TARGET_MISSING',
                index: i,
            });
        const type = FormatInfos[attachments.formats[i]].type;
        if (
            !locations.has(i) ||
            !target.blend ||
            type === FormatType.INT ||
            type === FormatType.UINT ||
            target.blendEq === BlendOp.MIN ||
            target.blendEq === BlendOp.MAX
        )
            continue;
        const src = target.blendSrc,
            dst = target.blendDst;
        if (
            src === BlendFactor.CONSTANT_COLOR ||
            src === BlendFactor.ONE_MINUS_CONSTANT_COLOR ||
            dst === BlendFactor.CONSTANT_COLOR ||
            dst === BlendFactor.ONE_MINUS_CONSTANT_COLOR
        )
            constantColor = true;
        if (
            src === BlendFactor.CONSTANT_ALPHA ||
            src === BlendFactor.ONE_MINUS_CONSTANT_ALPHA ||
            dst === BlendFactor.CONSTANT_ALPHA ||
            dst === BlendFactor.ONE_MINUS_CONSTANT_ALPHA
        )
            constantAlpha = true;
    }
    if (constantColor && constantAlpha)
        throw Object.assign(
            new Error('WebGL2 cannot mix RGB constant-color and constant-alpha factors across active targets.'),
            { code: 'WEBGL2_MIXED_BLEND_CONSTANT_UNSUPPORTED' },
        );
    let changed = false,
        integerBlend = false;
    for (let i = 0; i < attachments.buffers.length; ++i) {
        const buffer = locations.has(i) ? attachments.buffers[i] : gl.NONE;
        if (attachments.active[i] !== buffer) changed = true;
        attachments.active[i] = buffer;
        const type = FormatInfos[attachments.formats[i]].type;
        if (buffer !== gl.NONE && blend.targets[0].blend && (type === FormatType.INT || type === FormatType.UINT))
            integerBlend = true;
    }
    if (changed) gl.drawBuffers(attachments.active);
    let state = indexed.get(gl);
    if (!blend.isIndepend && !integerBlend && !state?.touched) return;
    if (!state) {
        state = {
            extension: gl.getExtension('OES_draw_buffers_indexed') as IndexedBlend | null,
            touched: false,
            signatures: [],
        };
        indexed.set(gl, state);
    }
    const ext = state.extension;
    if (!ext)
        throw Object.assign(new Error('This MRT blend combination requires OES_draw_buffers_indexed.'), {
            code: 'WEBGL2_INDEPENDENT_BLEND_UNSUPPORTED',
        });
    state.touched = true;
    for (let i = 0; i < attachments.buffers.length; ++i) {
        const target = blend.targets[blend.isIndepend ? i : 0];
        if (!target) throw new Error(`WEBGL2_BLEND_TARGET_MISSING: ${i}`);
        const type = FormatInfos[attachments.formats[i]].type;
        const integer = type === FormatType.INT || type === FormatType.UINT;
        const enabled = target.blend && !integer && locations.has(i) ? 1 : 0;
        const mask = locations.has(i) ? target.blendColorMask : ColorMask.NONE;
        const signature = state.signatures[i] || (state.signatures[i] = []);
        if (signature[0] !== enabled) {
            if (enabled) ext.enableiOES(gl.BLEND, i);
            else ext.disableiOES(gl.BLEND, i);
        }
        if (signature[1] !== target.blendEq || signature[2] !== target.blendAlphaEq)
            ext.blendEquationSeparateiOES(i, ops[target.blendEq], ops[target.blendAlphaEq]);
        if (
            signature[3] !== target.blendSrc ||
            signature[4] !== target.blendDst ||
            signature[5] !== target.blendSrcAlpha ||
            signature[6] !== target.blendDstAlpha
        )
            ext.blendFuncSeparateiOES(
                i,
                factors[target.blendSrc],
                factors[target.blendDst],
                factors[target.blendSrcAlpha],
                factors[target.blendDstAlpha],
            );
        if (signature[7] !== mask)
            ext.colorMaskiOES(
                i,
                !!(mask & ColorMask.R),
                !!(mask & ColorMask.G),
                !!(mask & ColorMask.B),
                !!(mask & ColorMask.A),
            );
        signature[0] = enabled;
        signature[1] = target.blendEq;
        signature[2] = target.blendAlphaEq;
        signature[3] = target.blendSrc;
        signature[4] = target.blendDst;
        signature[5] = target.blendSrcAlpha;
        signature[6] = target.blendDstAlpha;
        signature[7] = mask;
    }
}
