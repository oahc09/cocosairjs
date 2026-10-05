export function createBoardModel(columns = 4, rows = 4) {
    let hits = 0,
        selected = -1,
        pulse = 0,
        paused = false;
    return {
        pick(row: number, column: number): void {
            if (paused) return;
            if (
                !Number.isInteger(row) ||
                !Number.isInteger(column) ||
                row < 0 ||
                row >= rows ||
                column < 0 ||
                column >= columns
            )
                throw new Error('outside board');
            selected = row * columns + column;
            hits++;
            pulse = 0.35;
        },
        tick(dt: number): void {
            if (!paused) pulse = Math.max(0, pulse - dt);
        },
        pause(value: boolean): void {
            paused = value;
        },
        reset(newColumns = columns, newRows = rows): void {
            if (![newColumns, newRows].every((v) => Number.isInteger(v) && v > 0 && v <= 20))
                throw new Error('invalid board size');
            columns = newColumns;
            rows = newRows;
            hits = 0;
            selected = -1;
            pulse = 0;
            paused = false;
        },
        snapshot() {
            return { columns, rows, hits, selected, pulse, paused };
        },
        // Test setup only; never performs the operation under test.
        fixture(value: { selected: number; hits: number; pulse: number }): void {
            if (
                !Number.isInteger(value.selected) ||
                value.selected < 0 ||
                value.selected >= rows * columns ||
                !Number.isInteger(value.hits) ||
                value.hits < 0 ||
                !Number.isFinite(value.pulse) ||
                value.pulse < 0 ||
                value.pulse > 0.35
            )
                throw new Error('invalid nonterminal fixture');
            selected = value.selected;
            hits = value.hits;
            pulse = value.pulse;
        },
    };
}
