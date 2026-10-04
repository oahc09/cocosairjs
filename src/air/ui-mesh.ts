import { ccclass, requireComponent } from 'cc.decorator';
import { UIRenderer } from '../cocos/2d/framework/ui-renderer';
import { UITransform } from '../cocos/2d/framework/ui-transform';
import { SpriteFrame, SpriteFrameEvent } from '../cocos/2d/assets/sprite-frame';
import { dynamicAtlasManager } from '../cocos/2d/utils/dynamic-atlas/atlas-manager';
import type { TextureBase } from '../cocos/asset/assets/texture-base';
import type { IAssembler } from '../cocos/2d/renderer/base';
import type { IBatcher } from '../cocos/2d/renderer/i-batcher';

/** Positions are local XY pairs; UV pairs address the frame with (0,0) at its bottom-left. */
export interface AirUIMeshGeometry {
    readonly positions: ReadonlyArray<number>;
    readonly uvs: ReadonlyArray<number>;
    readonly indices: ReadonlyArray<number>;
}
const EMPTY: AirUIMeshGeometry = Object.freeze({ positions: Object.freeze([]), uvs: Object.freeze([]), indices: Object.freeze([]) });
function fail(field: string, message: string): never {
    const error = new Error(`AIR_E_UI_MESH_GEOMETRY: ${field}: ${message}`);
    Object.assign(error, { code: 'AIR_E_UI_MESH_GEOMETRY', field }); throw error;
}
function copyGeometry(value: AirUIMeshGeometry): AirUIMeshGeometry {
    if (!value || !Array.isArray(value.positions) || !Array.isArray(value.uvs) || !Array.isArray(value.indices)) fail('geometry', 'three arrays required');
    const { positions, uvs, indices } = value, count = positions.length / 2;
    // A bounded chunk fits the default native UI buffer; larger meshes must be partitioned explicitly.
    if (!Number.isInteger(count) || count < 3 || count > 1024) fail('positions', '3..1024 XY vertices required');
    if (uvs.length !== positions.length) fail('uvs', 'one UV pair per vertex required');
    if (!positions.every(Number.isFinite)) fail('positions', 'finite coordinates required');
    if (!uvs.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) fail('uvs', 'finite frame coordinates in [0,1] required');
    if (indices.length < 3 || indices.length > 4095 || indices.length % 3) fail('indices', '1..1365 triangles required');
    if (!indices.every((n) => Number.isInteger(n) && n >= 0 && n < count)) fail('indices', 'vertex index outside geometry');
    return Object.freeze({ positions: Object.freeze(positions.slice()), uvs: Object.freeze(uvs.slice()), indices: Object.freeze(indices.slice()) });
}

const assembler: IAssembler = {
    updateRenderData(component) {
        const mesh = component as AirUIMesh, geometry = mesh.geometry, frame = mesh.spriteFrame;
        if (!frame || !geometry.indices.length) return;
        dynamicAtlasManager.packToDynamicAtlas(mesh, frame);
        mesh.refreshFrame();
        const data = mesh.renderData || mesh.requestRenderData(), count = geometry.positions.length / 2;
        if (data.vertexCount !== count || data.indexCount !== geometry.indices.length) {
            data.dataLength = count; data.resize(count, geometry.indices.length);
            data.chunk.setIndexBuffer(geometry.indices);
        }
        const vb = data.chunk.vb, stride = data.floatStride, uv = frame.uv;
        for (let i = 0; i < count; i++) {
            data.data[i].x = geometry.positions[i * 2]; data.data[i].y = geometry.positions[i * 2 + 1];
            const u = geometry.uvs[i * 2], v = geometry.uvs[i * 2 + 1], offset = i * stride;
            vb[offset + 3] = (uv[0] * (1 - u) + uv[2] * u) * (1 - v) + (uv[4] * (1 - u) + uv[6] * u) * v;
            vb[offset + 4] = (uv[1] * (1 - u) + uv[3] * u) * (1 - v) + (uv[5] * (1 - u) + uv[7] * u) * v;
        }
        assembler.updateColor!(mesh); data.vertDirty = true; data.updateRenderData(mesh, frame);
    },
    updateColor(component) {
        const data = component.renderData; if (!data?.chunk) return;
        const color = component.color, vb = data.chunk.vb;
        for (let i = 0; i < data.vertexCount; i++) {
            const offset = i * data.floatStride + 5;
            vb[offset] = color.r / 255; vb[offset + 1] = color.g / 255; vb[offset + 2] = color.b / 255; vb[offset + 3] = color.a / 255;
        }
    },
    fillBuffers(component) {
        const mesh = component as AirUIMesh, data = mesh.renderData; if (!data?.chunk) return;
        const chunk = data.chunk, matrix = mesh.node.worldMatrix, vb = chunk.vb;
        if (mesh._flagChangedVersion !== mesh.node.flagChangedVersion || data.vertDirty) {
            for (let i = 0; i < data.vertexCount; i++) {
                const { x, y } = data.data[i], offset = i * data.floatStride;
                const w = matrix.m03 * x + matrix.m07 * y + matrix.m15, inverse = w ? 1 / w : 1;
                vb[offset] = (matrix.m00 * x + matrix.m04 * y + matrix.m12) * inverse;
                vb[offset + 1] = (matrix.m01 * x + matrix.m05 * y + matrix.m13) * inverse;
                vb[offset + 2] = (matrix.m02 * x + matrix.m06 * y + matrix.m14) * inverse;
            }
            data.vertDirty = false; mesh._flagChangedVersion = mesh.node.flagChangedVersion;
        }
        const indices = Uint16Array.from(mesh.geometry.indices, (index) => index + chunk.vertexOffset);
        chunk.vertexAccessor.appendIndices(chunk.bufferId, indices); chunk.meshBuffer.setDirty();
    },
};

/** Native UI renderer: shares Sprite materials, stencil masks, sibling order and batch buffers. */
@ccclass('AirUIMesh')
@requireComponent(UITransform)
export class AirUIMesh extends UIRenderer {
    private _geometry: AirUIMeshGeometry = EMPTY;
    private _frame: SpriteFrame | null = null;
    private _textureLeases = new Set<TextureBase>();
    private _disposed = false;
    get geometry(): AirUIMeshGeometry { return this._geometry; }
    get disposed(): boolean { return this._disposed; }
    get spriteFrame(): SpriteFrame | null { return this._frame; }
    set spriteFrame(value: SpriteFrame | null) {
        if (this._disposed) throw Object.assign(new Error('AIR_E_UI_MESH_DISPOSED'), { code: 'AIR_E_UI_MESH_DISPOSED' });
        if (value === this._frame) return;
        if (value && (!(value instanceof SpriteFrame) || !value.isValid || !value.texture?.isValid)) {
            throw Object.assign(new Error('AIR_E_UI_MESH_FRAME'), { code: 'AIR_E_UI_MESH_FRAME' });
        }
        const texture = value?.texture || null;
        texture?.addRef(); value?.addRef(); this.releaseFrame();
        this._frame = value;
        if (texture) this._textureLeases.add(texture);
        this.refreshFrame();
        value?.on(SpriteFrameEvent.UV_UPDATED, this.uvChanged, this);
        if (this.renderData) this.renderData.textureDirty = true;
        this.markForUpdateRenderData();
    }
    setGeometry(value: AirUIMeshGeometry): void {
        if (this._disposed) throw Object.assign(new Error('AIR_E_UI_MESH_DISPOSED'), { code: 'AIR_E_UI_MESH_DISPOSED' });
        this._geometry = copyGeometry(value); this._colorDirty(); this.markForUpdateRenderData();
    }
    clear(): void { this._geometry = EMPTY; this.destroyRenderData(); this.markForUpdateRenderData(); }
    /** Clears this renderer and releases its frame/texture leases. Does not destroy the node or shared assets. */
    dispose(): void {
        if (this._disposed) return;
        this._disposed = true; this.clear(); this.releaseFrame();
    }
    public onDestroy(): void { this.dispose(); super.onDestroy(); }
    protected _flushAssembler(): void { this._assembler = assembler; this.markForUpdateRenderData(); }
    protected _canRender(): boolean { return super._canRender() && !this._disposed && !!this._frame && this._geometry.indices.length > 0; }
    protected _render(renderer: IBatcher): void { renderer.commitComp(this, this.renderData, this._frame, assembler, null); }
    /** @internal Keeps the packed texture and original page alive through dynamic-atlas restoration. */
    refreshFrame(): void {
        const texture = this._frame?.texture || null;
        if (texture && !this._textureLeases.has(texture)) {
            texture.addRef(); this._textureLeases.add(texture);
            if (this.renderData) this.renderData.textureDirty = true;
        }
        const original = this._frame?.original?._texture;
        if (original && !this._textureLeases.has(original)) { original.addRef(); this._textureLeases.add(original); }
    }
    private uvChanged(): void {
        this.refreshFrame();
        this.markForUpdateRenderData();
    }
    private releaseFrame(): void {
        const frame = this._frame; this._frame = null;
        frame?.off(SpriteFrameEvent.UV_UPDATED, this.uvChanged, this); frame?.decRef();
        this._textureLeases.forEach((texture) => texture.decRef()); this._textureLeases.clear();
    }
}
