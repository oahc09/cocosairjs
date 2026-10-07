import { Graphics } from '../cocos/2d/components/graphics';
import { Color } from '../cocos/core/math';

/** Data only; replay uses the original Cocos Graphics component. Coordinates are Y up. */
export type AirGraphicsCommand =
    | { op: 'moveTo' | 'lineTo'; args: readonly [number, number] }
    | { op: 'bezierCurveTo'; args: readonly [number, number, number, number, number, number] }
    | { op: 'quadraticCurveTo'; args: readonly [number, number, number, number] }
    | { op: 'arc'; args: readonly [number, number, number, number, number, boolean] }
    | { op: 'rect' | 'ellipse'; args: readonly [number, number, number, number] }
    | { op: 'roundRect'; args: readonly [number, number, number, number, number] }
    | { op: 'circle'; args: readonly [number, number, number] }
    | { op: 'close' }
    | { op: 'fill'; paint: AirGraphicsPaint; rule?: 'nonzero' | 'evenodd' }
    | { op: 'stroke'; paint: AirSolidPaint; width: number; cap?: 'butt' | 'round' | 'square'; join?: 'miter' | 'round' | 'bevel' };
export interface AirSolidPaint { color: string; opacity?: number }
export interface AirGradientStop { offset: number; color: string; opacity?: number }
export type AirAffine2D = readonly [number, number, number, number, number, number];
export type AirGraphicsPaint = AirSolidPaint
    | { kind: 'linear'; from: readonly [number, number]; to: readonly [number, number]; stops: readonly AirGradientStop[] }
    | { kind: 'radial'; center: readonly [number, number]; radius: number; stops: readonly AirGradientStop[] }
    | { kind: 'pattern'; image: CanvasImageSource; width: number; height: number; textureSpace?: 'local' | 'global'; transform?: AirAffine2D; sourceURL?: string };
export interface AirGraphicsBounds { x: number; y: number; width: number; height: number }

const sizes: Record<string, number> = { moveTo: 2, lineTo: 2, bezierCurveTo: 6, quadraticCurveTo: 4, arc: 6, rect: 4, ellipse: 4, roundRect: 5, circle: 3 };
const hex = /^#[0-9a-f]{6}$/i;
function fail(message: string): never { throw new Error(`AIR_E_GRAPHICS_COMMAND: ${message}`); }
function finite(values: readonly number[]): void { if (!values.every(Number.isFinite)) fail('finite coordinates required'); }
function solid(paint: AirSolidPaint): void {
    if (!paint || !hex.test(paint.color) || !Number.isFinite(paint.opacity ?? 1) || (paint.opacity ?? 1) < 0 || (paint.opacity ?? 1) > 1) fail('use #rrggbb and opacity in [0,1]');
}
export function validateAirGraphicsCommands(commands: readonly AirGraphicsCommand[], bounds?: AirGraphicsBounds): void {
    if (!Array.isArray(commands)) fail('command array required');
    if (bounds) { finite([bounds.x, bounds.y, bounds.width, bounds.height]); if (bounds.width <= 0 || bounds.height <= 0) fail('positive bounds required'); }
    let path = false;
    for (const command of commands) {
        if (!command || typeof command !== 'object') fail('command object required');
        if (command.op in sizes) {
            const args = (command as { args: readonly (number | boolean)[] }).args;
            if (!Array.isArray(args) || args.length !== sizes[command.op]) fail('invalid arguments');
            finite(command.op === 'arc' ? args.slice(0, 5) as number[] : args as number[]);
            if (command.op === 'arc' && typeof args[5] !== 'boolean') fail('arc direction must be boolean');
            if (['arc', 'circle', 'roundRect'].includes(command.op) && (args[command.op === 'roundRect' ? 4 : 2] as number) < 0) fail('negative radius');
            if (command.op === 'ellipse' && ((args[2] as number) < 0 || (args[3] as number) < 0)) fail('negative ellipse radius');
            if (command.op === 'roundRect' && ((args[2] as number) <= 0 || (args[3] as number) <= 0)) fail('roundRect requires positive dimensions');
            if (['lineTo', 'bezierCurveTo', 'quadraticCurveTo'].includes(command.op) && !path) fail('path must begin with moveTo or a shape');
            path = true;
        } else if (command.op === 'close') { if (!path) fail('no path to close'); }
        else if (command.op === 'fill' || command.op === 'stroke') {
            if (!path) fail('no path to paint');
            const paint = command.paint;
            if (!paint || !('kind' in paint)) solid(paint as AirSolidPaint);
            else if (paint.kind === 'pattern') {
                finite([paint.width, paint.height]);
                if (!paint.image || paint.width <= 0 || paint.height <= 0 || !['local', 'global'].includes(paint.textureSpace ?? 'local')) fail('invalid pattern');
                if (paint.transform) { if (paint.transform.length !== 6) fail('affine transform needs six values'); finite(paint.transform); if (paint.transform[0] * paint.transform[3] === paint.transform[1] * paint.transform[2]) fail('singular pattern transform'); }
            } else if (paint.kind === 'linear' || paint.kind === 'radial') {
                if (paint.kind === 'linear') { finite([...paint.from, ...paint.to]); if (paint.from[0] === paint.to[0] && paint.from[1] === paint.to[1]) fail('zero gradient extent'); }
                else { finite([...paint.center, paint.radius]); if (paint.radius <= 0) fail('positive gradient radius required'); }
                if (!Array.isArray(paint.stops) || paint.stops.length < 2) fail('at least two gradient stops required');
                let previous = -1;
                for (const stop of paint.stops) { solid(stop); if (!Number.isFinite(stop.offset) || stop.offset < previous || stop.offset < 0 || stop.offset > 1) fail('ordered stops in [0,1] required'); previous = stop.offset; }
            } else fail('unknown paint');
            if (command.op === 'stroke') {
                solid(command.paint); finite([command.width]);
                if (command.width <= 0 || !['butt', 'round', 'square'].includes(command.cap ?? 'butt') || !['miter', 'round', 'bevel'].includes(command.join ?? 'miter')) fail('invalid stroke');
            } else if (!['nonzero', 'evenodd'].includes(command.rule ?? 'nonzero')) fail('invalid fill rule');
        } else fail('unknown operation');
    }
}
function nativeColor(paint: AirSolidPaint): Color { return new Color(parseInt(paint.color.slice(1, 3), 16), parseInt(paint.color.slice(3, 5), 16), parseInt(paint.color.slice(5, 7), 16), Math.round((paint.opacity ?? 1) * 255)); }

/** Solid native replay; richer paints/holes use rasterizeAirGraphics, never silently degrade. */
export function drawAirGraphics(graphics: Graphics, commands: readonly AirGraphicsCommand[], clear = true): void {
    validateAirGraphicsCommands(commands);
    if (commands.some((command) => command.op === 'fill' && ('kind' in command.paint || command.rule === 'evenodd'))) fail('native replay supports solid nonzero fills; use rasterizeAirGraphics for gradients/patterns/holes');
    if (clear) graphics.clear();
    for (const command of commands) {
        if (command.op === 'fill') { graphics.fillColor = nativeColor(command.paint as AirSolidPaint); graphics.fill(); }
        else if (command.op === 'stroke') {
            graphics.strokeColor = nativeColor(command.paint); graphics.lineWidth = command.width;
            graphics.lineCap = command.cap === 'round' ? Graphics.LineCap.ROUND : command.cap === 'square' ? Graphics.LineCap.SQUARE : Graphics.LineCap.BUTT;
            graphics.lineJoin = command.join === 'round' ? Graphics.LineJoin.ROUND : command.join === 'bevel' ? Graphics.LineJoin.BEVEL : Graphics.LineJoin.MITER;
            graphics.stroke();
        } else if (command.op === 'close') graphics.close();
        else (graphics[command.op] as (...args: any[]) => void).apply(graphics, command.args as any);
    }
}

const xml = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** SVG preserves original curves and per-paint styles; cannot reconstruct arbitrary Graphics.impl. */
export function airGraphicsCommandsToSvg(commands: readonly AirGraphicsCommand[], bounds: AirGraphicsBounds): string {
    validateAirGraphicsCommands(commands, bounds);
    let path = '', x = 0, y = 0, startX = 0, startY = 0, painted = false;
    const defs: string[] = [], body: string[] = [];
    const begin = (): void => { if (painted) { path = ''; painted = false; } };
    const move = (a: number, b: number): void => { path += `M${a} ${b} `; x = startX = a; y = startY = b; };
    const line = (a: number, b: number): void => { path += `L${a} ${b} `; x = a; y = b; };
    const ellipse = (cx: number, cy: number, rx: number, ry: number): void => {
        move(cx + rx, cy); path += `A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} Z `; x = cx + rx; y = cy;
    };
    const paintValue = (paint: AirGraphicsPaint): { value: string; opacity: number } => {
        if (!('kind' in paint)) return { value: paint.color, opacity: paint.opacity ?? 1 };
        const id = `air-paint-${defs.length}`;
        if (paint.kind === 'pattern') {
            if (paint.textureSpace === 'global') fail('SVG export needs local pattern coordinates; transform global patterns explicitly');
            if (!paint.sourceURL || !/^(?:data:image\/(?:png|jpeg|webp);base64,|https?:\/\/)/i.test(paint.sourceURL)) fail('pattern SVG needs a data:image or http(s) sourceURL');
            defs.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" width="${paint.width}" height="${paint.height}" patternTransform="matrix(${(paint.transform ?? [1, 0, 0, 1, 0, 0]).join(' ')})"><image href="${xml(paint.sourceURL)}" width="${paint.width}" height="${paint.height}" preserveAspectRatio="none" transform="translate(0 ${paint.height}) scale(1 -1)"/></pattern>`);
        } else {
            const stops = paint.stops.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}" stop-opacity="${s.opacity ?? 1}"/>`).join('');
            defs.push(paint.kind === 'linear'
                ? `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${paint.from[0]}" y1="${paint.from[1]}" x2="${paint.to[0]}" y2="${paint.to[1]}">${stops}</linearGradient>`
                : `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${paint.center[0]}" cy="${paint.center[1]}" r="${paint.radius}">${stops}</radialGradient>`);
        }
        return { value: `url(#${id})`, opacity: 1 };
    };
    for (const command of commands) {
        if (command.op === 'fill' || command.op === 'stroke') {
            const paint = paintValue(command.paint);
            body.push(command.op === 'fill' ? `<path d="${path.trim()}" fill="${paint.value}" fill-opacity="${paint.opacity}" fill-rule="${command.rule ?? 'nonzero'}"/>`
                : `<path d="${path.trim()}" fill="none" stroke="${paint.value}" stroke-opacity="${paint.opacity}" stroke-width="${command.width}" stroke-linecap="${command.cap ?? 'butt'}" stroke-linejoin="${command.join ?? 'miter'}"/>`);
            painted = true; continue;
        }
        begin();
        if (command.op === 'close') { path += 'Z '; x = startX; y = startY; continue; }
        const a = command.args as readonly [number, number, number, number, number, number];
        switch (command.op) {
        case 'moveTo': move(a[0], a[1]); break;
        case 'lineTo': line(a[0], a[1]); break;
        case 'bezierCurveTo': path += `C${a.join(' ')} `; x = a[4] as number; y = a[5] as number; break;
        case 'quadraticCurveTo': path += `Q${a.join(' ')} `; x = a[2]; y = a[3]; break;
        case 'circle': ellipse(a[0], a[1], a[2], a[2]); break;
        case 'ellipse': ellipse(a[0], a[1], a[2], a[3] as number); break;
        case 'rect': move(a[0], a[1]); line(a[0] + a[2], a[1]); line(a[0] + a[2], a[1] + (a[3] as number)); line(a[0], a[1] + (a[3] as number)); path += 'Z '; break;
        case 'roundRect': {
            const [rx, ry, w, h, radius] = a as readonly number[], r = Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2);
            if (w < 0 || h < 0) fail('roundRect requires positive dimensions');
            move(rx, ry + r); line(rx, ry + h - r); path += `A${r} ${r} 0 0 0 ${rx + r} ${ry + h} `;
            line(rx + w - r, ry + h); path += `A${r} ${r} 0 0 0 ${rx + w} ${ry + h - r} `;
            line(rx + w, ry + r); path += `A${r} ${r} 0 0 0 ${rx + w - r} ${ry} `;
            line(rx + r, ry); path += `A${r} ${r} 0 0 0 ${rx} ${ry + r} Z `; break;
        }
        case 'arc': {
            const [cx, cy, r, start, end, ccw] = command.args as readonly [number, number, number, number, number, boolean];
            const sx = cx + r * Math.cos(start), sy = cy + r * Math.sin(start);
            move(sx, sy); // Native Graphics.arc starts a new subpath.
            const tau = Math.PI * 2, raw = end - start;
            let delta = ccw ? ((raw % tau) + tau) % tau : -(((start - end) % tau + tau) % tau);
            if (Math.abs(raw) >= tau) delta = ccw ? tau : -tau;
            const count = Math.ceil(Math.abs(delta) / Math.PI);
            for (let i = 1; i <= count; i++) { const t = start + delta * i / count; x = cx + r * Math.cos(t); y = cy + r * Math.sin(t); path += `A${r} ${r} 0 0 ${ccw ? 1 : 0} ${x} ${y} `; }
            break;
        }
        }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.x} ${-bounds.y - bounds.height} ${bounds.width} ${bounds.height}"><defs>${defs.join('')}</defs><g transform="scale(1 -1)">${body.join('')}</g></svg>`;
}
