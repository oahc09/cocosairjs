/** Optional, engine-free recipes. Pass native node-local coordinates; do not subtract a screen center here. */
export function pickBoardCell(
    point: { x: number; y: number },
    width: number,
    height: number,
    columns: number,
    rows: number,
    anchorX = 0.5,
    anchorY = 0.5,
): { row: number; column: number } | null {
    if (
        ![point.x, point.y, width, height, columns, rows, anchorX, anchorY].every(Number.isFinite) ||
        width <= 0 ||
        height <= 0 ||
        !Number.isInteger(columns) ||
        !Number.isInteger(rows) ||
        columns <= 0 ||
        rows <= 0
    )
        throw new Error('Invalid board geometry');
    const x = point.x + width * anchorX,
        y = height * (1 - anchorY) - point.y;
    // Top and left included; bottom and right excluded. No clamping of outside input.
    if (x < 0 || x >= width || y < 0 || y >= height) return null;
    return { row: Math.floor((y / height) * rows), column: Math.floor((x / width) * columns) };
}

export function createSeededRandom(seed: number) {
    if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) throw new Error('seed must be a nonzero uint32');
    let state = seed >>> 0;
    return {
        next(): number {
            state ^= state << 13;
            state ^= state >>> 17;
            state ^= state << 5;
            state >>>= 0;
            return state / 0x100000000;
        },
        snapshot(): number {
            return state;
        },
        restore(value: number): void {
            if (!Number.isInteger(value) || value < 1 || value > 0xffffffff)
                throw new Error('random state must be a nonzero uint32');
            state = value >>> 0;
        },
    };
}

/** Solvable sliding-puzzle setup by legal moves, not permutation plus an unproved parity fix. */
export function shuffleSlidingBoard(size: number, steps: number, seed: number): number[] {
    if (!Number.isInteger(size) || size < 2 || size > 32 || !Number.isInteger(steps) || steps < 0 || steps > 100000)
        throw new Error('Invalid sliding board size/steps');
    const random = createSeededRandom(seed),
        cells = Array.from({ length: size * size }, (_, i) => (i + 1) % (size * size));
    let empty = cells.length - 1,
        previous = -1;
    for (let i = 0; i < steps; i++) {
        const row = Math.floor(empty / size),
            column = empty % size;
        const choices = [
            row > 0 ? empty - size : -1,
            row < size - 1 ? empty + size : -1,
            column > 0 ? empty - 1 : -1,
            column < size - 1 ? empty + 1 : -1,
        ].filter((v) => v >= 0 && v !== previous);
        const next = choices[Math.floor(random.next() * choices.length)];
        cells[empty] = cells[next];
        cells[next] = 0;
        previous = empty;
        empty = next;
    }
    return cells;
}

/** Include quantized visible state in key. Only commit the key after a successful draw. */
export function createVisualGate() {
    let previous: string | undefined,
        draws = 0;
    return {
        draw(key: string, render: () => void): boolean {
            if (typeof key !== 'string') throw new Error('visual key must be a string');
            if (key === previous) return false;
            render();
            previous = key;
            draws++;
            return true;
        },
        invalidate(): void {
            previous = undefined;
        },
        get draws() {
            return draws;
        },
    };
}
