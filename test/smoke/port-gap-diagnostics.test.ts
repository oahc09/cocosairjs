import { createAirDiagnostics } from '../../src/air/diagnostics';
import { _resetDebugSetting, _subscribeDiagnosticLogs, DebugMode, warn, warnID, errorID } from '../../src/cocos/core/platform/debug';
import { createAirApp } from '../../src/air/bootstrap';
import { Material } from '../../src/cocos/asset/assets/material';
import { createAgentSession } from '../../tools/debug/agent-session';

describe('port diagnostics: native generation, visibility and optional tool capture', () => {
    afterEach(() => _resetDebugSetting(DebugMode.ERROR));

    test('default errors do not capture native warnings; warnings capture IDs even with filtered console', () => {
        _resetDebugSetting(DebugMode.NONE);
        const errors = createAirDiagnostics();
        const warnings = createAirDiagnostics('warnings');
        warnID(16373, 'unknownUniform');
        expect(errors.snapshot()).toEqual([]);
        expect(warnings.snapshot()).toMatchObject([{ severity: 'warning', id: 16373, occurrences: 1 }]);
        expect(warnings.snapshot()[0].message).toContain('unknownUniform');
        errorID(16373, 'testError');
        expect(errors.snapshot()).toMatchObject([{ severity: 'error', id: 16373 }]);
        errors.destroy(); warnings.destroy();
    });

    test('bounded history deduplicates identical warnings, protects snapshots, and resets explicitly', () => {
        _resetDebugSetting(DebugMode.NONE);
        const channel = createAirDiagnostics('warnings');
        const observed: string[] = [];
        const off = channel.onMessage((entry) => observed.push(entry.message));
        for (let i = 0; i < 100; i++) warnID(16373, 'repeated');
        expect(channel.snapshot()).toHaveLength(1);
        expect(channel.snapshot()[0].occurrences).toBe(100);
        expect(observed).toHaveLength(1);
        expect(Object.isFrozen(channel.snapshot()[0])).toBe(true);
        for (let i = 0; i < 100; i++) warnID(16373, `unique-${i}`);
        expect(channel.snapshot()).toHaveLength(80);
        off(); off();
        channel.clear();
        warnID(16373, 'afterReset');
        expect(channel.snapshot()).toHaveLength(1);
        channel.destroy(); channel.destroy();
        warnID(16373, 'closed');
        expect(channel.snapshot()).toEqual([]);
    });

    test('failing/recursive observers do not interrupt logging; identical callbacks own independent subscriptions', () => {
        _resetDebugSetting(DebugMode.NONE);
        const events: string[] = [];
        const callback = (entry: { message: string }) => { events.push(entry.message); };
        const first = _subscribeDiagnosticLogs(callback);
        const second = _subscribeDiagnosticLogs(callback);
        const recursive = _subscribeDiagnosticLogs(() => { warn('nested'); throw new Error('observer failed'); });
        expect(() => warn('outer')).not.toThrow();
        expect(events.filter((message) => message === 'outer')).toHaveLength(2);
        first(); recursive();
        const before = events.length;
        warn('ownedBySecond');
        expect(events.length - before).toBe(1);
        second();
    });

    test('invalid options reject before bootstrap side effects', async () => {
        expect(() => createAirDiagnostics('invalid' as any)).toThrow('AIR_E_DIAGNOSTIC_MODE');
        await expect(createAirApp({ canvas: '#missing', diagnostics: 'invalid' as any })).rejects.toThrow('AIR_E_DIAGNOSTIC_MODE');
    });

    test('real HEADLESS material warning reaches native console and existing debug session once', async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        const consoleWarnings = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3, diagnostics: 'warnings' });
        app.diagnostics!.clear();
        const session = createAgentSession({ app });
        session.clearRuntimeErrors();
        const material = new Material();
        material.initialize({ effectName: 'builtin-unlit' });
        material.setProperty('portUnknownUniform', 1);
        material.setProperty('portUnknownUniform', 1);
        const messages = app.diagnostics!.snapshot().filter((entry) => entry.id === 16373);
        expect(messages).toMatchObject([{ occurrences: 2, severity: 'warning', id: 16373 }]);
        expect(consoleWarnings.mock.calls.some((args) => String(args[0]).includes('portUnknownUniform'))).toBe(true);
        const toolMessages = session.getRuntimeErrors().errors.filter((entry) => entry.category === 'engine-warning');
        expect(toolMessages).toHaveLength(1);
        expect(toolMessages[0]).toMatchObject({ source: 'cocos:16373' });
        expect(toolMessages[0].message).toContain('portUnknownUniform');
        session.close(); material.destroy(); app.diagnostics!.destroy();
        consoleWarnings.mockRestore();
    });
});
