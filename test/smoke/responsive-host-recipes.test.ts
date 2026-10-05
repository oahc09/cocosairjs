import { pickBoardCell, createSeededRandom, shuffleSlidingBoard, createVisualGate } from '../../tools/recipes/board-state';
import { labelNode } from '../../src/air/ui-kit';
import { Node } from '../../src/cocos/scene-graph/node';
import { Label } from '../../src/cocos/2d/components/label';
const { aggregateAttempts } = require('../../tools/verify/integration-attempts.cjs');

test.each([[4, 4], [10, 20], [16, 16]])('cell picking %ix%i uses local coordinates and rejects outside', (columns, rows) => {
    expect(pickBoardCell({ x: 0, y: 0 }, 480, 480, columns, rows)).toEqual({ row: rows / 2, column: columns / 2 });
    expect(pickBoardCell({ x: -240, y: 240 }, 480, 480, columns, rows)).toEqual({ row: 0, column: 0 });
    expect(pickBoardCell({ x: 240, y: 0 }, 480, 480, columns, rows)).toBeNull();
    expect(pickBoardCell({ x: 0, y: -240 }, 480, 480, columns, rows)).toBeNull();
});
test('seed restore repeats sequence and legal-move shuffle has independently checked solvability parity', () => {
    const random = createSeededRandom(42); random.next(); const state = random.snapshot(); const next = random.next(); random.restore(state);
    expect(random.next()).toBe(next);
    for (const size of [2, 3, 4]) {
        const cells = shuffleSlidingBoard(size, 80, 42);
        expect(cells).toEqual(shuffleSlidingBoard(size, 80, 42));
        expect([...cells].sort((a, b) => a - b)).toEqual(Array.from({ length: size * size }, (_, i) => i));
        const tiles = cells.filter(v => v !== 0); let inversions = 0;
        for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) if (tiles[i] > tiles[j]) inversions++;
        const fromBottom = size - Math.floor(cells.indexOf(0) / size);
        expect(size % 2 ? inversions % 2 : (inversions + fromBottom) % 2).toBe(size % 2 ? 0 : 1);
    }
});
test('visible pulse invalidates cache without changing rules; unchanged idle key does not render', () => {
    const gate = createVisualGate(), render = jest.fn(), rule = { score: 0, cells: [1, 2, 3] };
    for (const pulse of [10, 9, 0, 0]) gate.draw(JSON.stringify({ rule, pulse }), render);
    expect(render).toHaveBeenCalledTimes(3); expect(rule).toEqual({ score: 0, cells: [1, 2, 3] });
    gate.invalidate(); gate.draw(JSON.stringify({ rule, pulse: 0 }), render); expect(gate.draws).toBe(4);
});
test('Label helper explicitly controls wrap while preserving native default when omitted', () => {
    const root = new Node('root');
    expect(() => labelNode(root, 'bad', 'invalid', { enableWrapText: 'false' as any })).toThrow('AIR_E_LABEL_WRAP');
    expect(root.children.length).toBe(0);
    const plain = labelNode(root, 'RIGHT', 'default').getComponent(Label)!;
    const single = labelNode(root, 'RIGHT', 'single', { enableWrapText: false, overflow: Label.Overflow.SHRINK }).getComponent(Label)!;
    const multi = labelNode(root, 'explanation', 'multi', { enableWrapText: true }).getComponent(Label)!;
    expect(single.enableWrapText).toBe(false); expect(multi.enableWrapText).toBe(true);
    expect(plain.enableWrapText).toBe(new Node().addComponent(Label).enableWrapText);
    root.destroy();
});
test('attempt aggregation counts shared hosts once, leaves missing history unknown and rejects fabricated zero', () => {
    const row = { project: 'game-1', batch: 'batch-1', attemptId: 'one', integrationId: 'host-1', reason: 'measured',
        category: 'application-development', status: 'PASS', calls: 5, measuredAt: '2026-10-05T00:00:00Z',
        fingerprints: { source: 'a'.repeat(64), harness: 'b'.repeat(64), runtime: 'c'.repeat(64) }, staticCallSites: ['main.ts:1'], executedCases: ['click'] };
    const missing = { ...row, project: 'game-2', attemptId: 'two', status: 'UNKNOWN', calls: null, reason: 'history missing',
        staticCallSites: null, executedCases: null, fingerprints: { source: null, harness: null, runtime: null } };
    const summary = aggregateAttempts([row, missing]); expect(summary.projects).toBe(2); expect(summary.sharedIntegrations).toBe(1);
    expect(summary.calls).toEqual({ knownTotal: 5, unknownAttempts: 1, complete: false });
    expect(summary.executedCases).toEqual({ knownDistinct: 1, knownExecutions: 1, unknownInventories: 1, complete: false });
    expect(summary.staticCallSites.knownDistinct).toBe(1);
    expect(() => aggregateAttempts([row, { ...missing, calls: 0 }])).toThrow('unknown history');
    expect(() => aggregateAttempts([row, row])).toThrow('duplicate');
    expect(() => aggregateAttempts([{ ...missing, executedCases: [] }])).toThrow('must stay null');
    expect(() => aggregateAttempts([])).toThrow('missing history');
    expect(() => aggregateAttempts([row], ['game-1', 'game-2'])).toThrow('missing project history');
    expect(aggregateAttempts([row, missing], ['game-1', 'game-2']).projectScopeVerified).toBe(true);
});
