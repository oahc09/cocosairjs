import { Texture2D } from '../cocos/asset/assets/texture-2d';
import { AirGraphicsBounds, AirGraphicsCommand, AirGraphicsPaint, AirAffine2D, validateAirGraphicsCommands } from './graphics-commands';

export interface AirGraphicsRasterOptions {
    bounds: AirGraphicsBounds;
    resolution?: number;
    /** Local -> world affine matrix. Required for global patterns. Call update when it changes. */
    worldTransform?: AirAffine2D;
}
/** Canvas2D rasterizes rich paints into a native Texture2D. Explicit updates; no perpetual upload loop. */
export function rasterizeAirGraphics(commands: readonly AirGraphicsCommand[], options: AirGraphicsRasterOptions): {
    readonly texture: Texture2D; readonly canvas: HTMLCanvasElement;
    update(commands?: readonly AirGraphicsCommand[], options?: AirGraphicsRasterOptions): void; dispose(): void;
} {
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
    if (!context) throw new Error('AIR_E_GRAPHICS_CANVAS');
    const texture = new Texture2D(); texture.setMipFilter(Texture2D.Filter.NONE);
    texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
    let disposed = false, currentCommands = commands, currentOptions = options;
    const rgba = (paint: { color: string; opacity?: number }): string => {
        const value = parseInt(paint.color.slice(1), 16); return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${paint.opacity ?? 1})`;
    };
    const update = (nextCommands = currentCommands, nextOptions = currentOptions): void => {
        if (disposed) throw new Error('AIR_E_GRAPHICS_RASTER_DISPOSED');
        validateAirGraphicsCommands(nextCommands, nextOptions.bounds);
        const { bounds } = nextOptions, resolution = nextOptions.resolution ?? 1;
        if (!Number.isFinite(resolution) || resolution <= 0 || Math.ceil(bounds.width * resolution) > 8192 || Math.ceil(bounds.height * resolution) > 8192) throw new Error('AIR_E_GRAPHICS_RESOLUTION');
        const world = nextOptions.worldTransform;
        if (world && (world.length !== 6 || !world.every(Number.isFinite) || world[0] * world[3] === world[1] * world[2])) throw new Error('AIR_E_GRAPHICS_WORLD_TRANSFORM');
        for (const c of nextCommands) if (c.op === 'fill' && 'kind' in c.paint && c.paint.kind === 'pattern' && c.paint.textureSpace === 'global' && !world) throw new Error('AIR_E_GRAPHICS_WORLD_TRANSFORM');
        canvas.width = Math.ceil(bounds.width * resolution); canvas.height = Math.ceil(bounds.height * resolution);
        context.setTransform(resolution, 0, 0, -resolution, -bounds.x * resolution, (bounds.y + bounds.height) * resolution);
        let path = new Path2D(), painted = false;
        const style = (paint: AirGraphicsPaint): string | CanvasGradient | CanvasPattern => {
            if (!('kind' in paint)) return rgba(paint);
            if (paint.kind === 'pattern') {
                // Draw the resource at the specified tile dimensions before repeating it.
                const tile = document.createElement('canvas'); tile.width = Math.ceil(paint.width); tile.height = Math.ceil(paint.height);
                const tileContext = tile.getContext('2d'); if (!tileContext) throw new Error('AIR_E_GRAPHICS_CANVAS');
                tileContext.drawImage(paint.image, 0, 0, tile.width, tile.height);
                const pattern = context.createPattern(tile, 'repeat'); if (!pattern) throw new Error('AIR_E_GRAPHICS_PATTERN');
                let transform = new DOMMatrix(paint.transform ? [...paint.transform] : undefined);
                if (paint.textureSpace === 'global') transform = new DOMMatrix([...world!]).inverse().multiply(transform);
                pattern.setTransform(transform.multiply(new DOMMatrix([paint.width / tile.width, 0, 0, -paint.height / tile.height, 0, paint.height]))); return pattern;
            }
            const gradient = paint.kind === 'linear' ? context.createLinearGradient(...paint.from, ...paint.to)
                : context.createRadialGradient(...paint.center, 0, ...paint.center, paint.radius);
            for (const stop of paint.stops) gradient.addColorStop(stop.offset, rgba(stop)); return gradient;
        };
        for (const command of nextCommands) {
            if (command.op === 'fill') { context.fillStyle = style(command.paint); context.fill(path, command.rule ?? 'nonzero'); painted = true; continue; }
            if (command.op === 'stroke') {
                context.strokeStyle = rgba(command.paint); context.lineWidth = command.width; context.lineCap = command.cap ?? 'butt'; context.lineJoin = command.join ?? 'miter';
                context.stroke(path); painted = true; continue;
            }
            if (painted) { path = new Path2D(); painted = false; }
            if (command.op === 'close') { path.closePath(); continue; }
            const a = command.args as readonly number[];
            switch (command.op) {
            case 'moveTo': path.moveTo(a[0], a[1]); break;
            case 'lineTo': path.lineTo(a[0], a[1]); break;
            case 'bezierCurveTo': path.bezierCurveTo(a[0], a[1], a[2], a[3], a[4], a[5]); break;
            case 'quadraticCurveTo': path.quadraticCurveTo(a[0], a[1], a[2], a[3]); break;
            case 'arc': path.moveTo(a[0] + a[2] * Math.cos(a[3]), a[1] + a[2] * Math.sin(a[3])); path.arc(a[0], a[1], a[2], a[3], a[4], !command.args[5]); break;
            case 'rect': path.rect(a[0], a[1], a[2], a[3]); break;
            case 'roundRect': {
                const [x, y, w, h] = a, r = Math.min(a[4], w / 2, h / 2);
                path.moveTo(x, y + r); path.lineTo(x, y + h - r); path.arc(x + r, y + h - r, r, Math.PI, Math.PI / 2, true);
                path.lineTo(x + w - r, y + h); path.arc(x + w - r, y + h - r, r, Math.PI / 2, 0, true);
                path.lineTo(x + w, y + r); path.arc(x + w - r, y + r, r, 0, -Math.PI / 2, true);
                path.lineTo(x + r, y); path.arc(x + r, y + r, r, -Math.PI / 2, -Math.PI, true); path.closePath(); break;
            }
            case 'circle': path.moveTo(a[0] + a[2], a[1]); path.arc(a[0], a[1], a[2], 0, -Math.PI * 2, true); path.closePath(); break;
            case 'ellipse': path.moveTo(a[0] + a[2], a[1]); path.ellipse(a[0], a[1], a[2], a[3], 0, 0, -Math.PI * 2, true); path.closePath(); break;
            }
        }
        // Source rows are top-first, matching native Sprite UVs. No global pixelStore mutation.
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        if (texture.width !== canvas.width || texture.height !== canvas.height) texture.reset({ width: canvas.width, height: canvas.height, mipmapLevel: 1, format: Texture2D.PixelFormat.RGBA8888 });
        texture.uploadData(new Uint8Array(pixels.data.buffer));
        currentCommands = nextCommands; currentOptions = nextOptions;
    };
    try { update(); } catch (error) { texture.destroy(); throw error; }
    return { texture, canvas, update, dispose() { if (disposed) return; disposed = true; texture.destroy(); canvas.width = canvas.height = 0; } };
}
