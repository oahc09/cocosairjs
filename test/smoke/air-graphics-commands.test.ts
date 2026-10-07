import { airGraphicsCommandsToSvg, drawAirGraphics, validateAirGraphicsCommands, AirGraphicsCommand } from '../../src/air/graphics-commands';
import { Node } from '../../src/cocos/scene-graph/node';
import { Graphics } from '../../src/cocos/2d/components/graphics';

const bounds = { x: -10, y: -20, width: 200, height: 100 };
describe('graphics command contracts', () => {
    test('native replay and SVG preserve separate fill/stroke snapshots and original curves', () => {
        const commands: AirGraphicsCommand[] = [
            { op: 'moveTo', args: [0, 0] }, { op: 'bezierCurveTo', args: [10, 20, 30, 40, 50, 0] }, { op: 'close' },
            { op: 'fill', paint: { color: '#ff0000', opacity: 0.5 } }, { op: 'stroke', paint: { color: '#0000ff' }, width: 4, cap: 'round' },
            { op: 'circle', args: [80, 20, 12] }, { op: 'fill', paint: { color: '#00ff00' } },
        ];
        const svg = airGraphicsCommandsToSvg(commands, bounds);
        expect(svg).toContain('viewBox="-10 -80 200 100"'); expect(svg).toContain('C10 20 30 40 50 0');
        const paths = new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('path');
        expect(paths.length).toBe(3); expect(paths[0].getAttribute('d')).toBe(paths[1].getAttribute('d'));
        expect(paths[2].getAttribute('d')).not.toContain('C10'); expect(paths[0].getAttribute('fill-opacity')).toBe('0.5');
        const node = new Node(), graphics = node.addComponent(Graphics);
        jest.spyOn(graphics, 'fill').mockImplementation(() => { graphics.impl!.updatePathOffset = true; });
        jest.spyOn(graphics, 'stroke').mockImplementation(() => { graphics.impl!.updatePathOffset = true; });
        drawAirGraphics(graphics, commands); expect(graphics.impl?.paths.length).toBe(2); expect(graphics.lineWidth).toBe(4);
        expect(graphics.fillColor.g).toBe(255); node.destroy();
    });
    test('gradient/holes SVG is explicit and native replay rejects before changing geometry', () => {
        const commands: AirGraphicsCommand[] = [{ op: 'rect', args: [0, 0, 100, 100] }, { op: 'circle', args: [50, 50, 20] },
            { op: 'fill', rule: 'evenodd', paint: { kind: 'radial', center: [50, 50], radius: 50, stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }] } }];
        const svg = airGraphicsCommandsToSvg(commands, bounds); expect(svg).toContain('fill-rule="evenodd"'); expect(svg).toContain('gradientUnits="userSpaceOnUse"');
        const node = new Node(), graphics = node.addComponent(Graphics); graphics.rect(0, 0, 10, 10);
        expect(() => drawAirGraphics(graphics, commands)).toThrow('native replay'); expect(graphics.impl?.paths.length).toBe(1); node.destroy();
    });
    test('arc covers full circle with two SVG arcs and respects direction', () => {
        const svg = airGraphicsCommandsToSvg([{ op: 'arc', args: [0, 0, 10, 0, Math.PI * 2, false] }, { op: 'stroke', width: 1, paint: { color: '#ffffff' } }], bounds);
        expect((svg.match(/A10 10/g) ?? []).length).toBe(2);
    });
    test.each([
        [{ op: 'lineTo', args: [0, 0] }], [{ op: 'circle', args: [0, 0, -1] }], [{ op: 'rect', args: [0, 0, NaN, 5] }],
        [{ op: 'rect', args: [0, 0, 5, 5] }, { op: 'fill', paint: { color: 'url(javascript:x)' } }],
        [{ op: 'rect', args: [0, 0, 5, 5] }, { op: 'stroke', paint: { color: '#ffffff' }, width: 0 }],
        [{ op: 'rect', args: [0, 0, 5, 5] }, { op: 'fill', paint: { kind: 'linear', from: [0, 0], to: [5, 5], stops: [{ offset: 1, color: '#ffffff' }, { offset: 0, color: '#ffffff' }] } }],
    ])('invalid commands rejected', (...commands) => expect(() => validateAirGraphicsCommands(commands as AirGraphicsCommand[])).toThrow('AIR_E_GRAPHICS_COMMAND'));
});
