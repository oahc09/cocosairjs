import { createTestInput } from '../../tools/debug/test-input';

describe('opt-in synthetic DOM input ownership', () => {
    const canvas = () => document.getElementById('GameCanvas') as HTMLCanvasElement;
    test('validation rejects an entire malformed batch before mutation or dispatch', () => {
        const tool = createTestInput({ canvas: canvas() });
        const receive = jest.fn(); canvas().addEventListener('touchstart', receive);
        expect(() => tool.touch('start', [{id: 1,clientX: 2,clientY: 3},{id: 1,clientX: 4,clientY: 5}])).toThrow('AIR_E_TEST_INPUT_ARGUMENT');
        expect(() => tool.touch('start', [{id: 0,clientX: 2,clientY: 3}])).toThrow('AIR_E_TEST_INPUT_ARGUMENT');
        expect(() => tool.touch('start', [{id: 2,clientX: Infinity,clientY: 3}])).toThrow('AIR_E_TEST_INPUT_ARGUMENT');
        expect(tool.activeIds).toEqual([]); expect(receive).not.toHaveBeenCalled();
        canvas().removeEventListener('touchstart', receive); tool.dispose();
    });
    test('real DOM dispatch has untrusted events, independent contacts and symmetric terminal releases', () => {
        const events: Event[] = [];
        const receive = (event: Event) => events.push(event);
        for (const kind of ['keydown','keyup','touchstart','touchend','touchcancel']) canvas().addEventListener(kind,receive);
        const tool = createTestInput({ canvas: canvas() });
        const a = {id: 11,clientX: 2,clientY: 3}, b = {id: 12,clientX: 4,clientY: 5};
        const result = tool.touch('start',[a,b]);
        expect(result).toMatchObject({method:'SYNTHETIC',channel:'DOM_PAL',isTrusted:false,changedIds:[11,12]});
        expect((events[0] as TouchEvent).touches.length).toBe(2);
        tool.touch('end',[a]); expect(tool.activeIds).toEqual([12]);
        expect(() => tool.touch('move',[a])).toThrow('AIR_E_TEST_INPUT_SEQUENCE');
        tool.key('down','KeyA'); tool.key('down','KeyA');
        expect((events[3] as KeyboardEvent).repeat).toBe(true);
        tool.dispose(); tool.dispose();
        expect(events.map((e)=>e.type)).toEqual(['touchstart','touchend','keydown','keydown','keyup','touchcancel']);
        expect(events.every((e)=>e.isTrusted===false)).toBe(true); expect(tool.activeIds).toEqual([]);
        expect(() => tool.key('down','KeyA')).toThrow('AIR_E_TEST_INPUT_DISPOSED');
        for (const kind of ['keydown','keyup','touchstart','touchend','touchcancel']) canvas().removeEventListener(kind,receive);
    });
    test('session retirement and a new generation reject injection without changing contacts', () => {
        const session = {active:true,generation:1}, tool = createTestInput({canvas:canvas(),session});
        tool.touch('start',[{id: 31,clientX: 2,clientY: 3}]);
        session.active=false; expect(() => tool.key('down','KeyA')).toThrow('AIR_E_TEST_INPUT_INACTIVE');
        session.active=true; session.generation++;
        expect(() => tool.touch('end',[{id:31,clientX:2,clientY:3}])).toThrow('AIR_E_TEST_INPUT_INACTIVE');
        expect(tool.activeIds).toEqual([31]); tool.dispose(); expect(tool.activeIds).toEqual([]);
    });
});
