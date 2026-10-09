/** Example-only conversions for a borderless, axis-aligned canvas. */
export interface CanvasPoint {
    x: number;
    y: number;
}

/** DOM client CSS pixels → drawing-buffer pixels, origin at bottom left. */
export function clientToCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number): CanvasPoint | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || canvas.width <= 0 || canvas.height <= 0) return null;
    return {
        x: ((clientX - rect.left) * canvas.width) / rect.width,
        y: ((rect.bottom - clientY) * canvas.height) / rect.height,
    };
}

/** Drawing-buffer pixels → DOM client CSS pixels; inverse of clientToCanvasPoint. */
export function canvasToClientPoint(canvas: HTMLCanvasElement, x: number, y: number): CanvasPoint | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || canvas.width <= 0 || canvas.height <= 0) return null;
    return {
        x: rect.left + (x * rect.width) / canvas.width,
        y: rect.bottom - (y * rect.height) / canvas.height,
    };
}
