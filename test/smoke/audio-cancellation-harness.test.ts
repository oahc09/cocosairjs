import { spawnSync } from 'child_process';
import * as path from 'path';

function ownershipProbe(script: string): any {
    const trackerPath = path.resolve(__dirname, '../../tools/verify/audio-cancellation/owned-process-tracker.cjs');
    const result = spawnSync(
        process.execPath,
        [
            '-e',
            `const cp = require('child_process');
             const EventEmitter = require('events');
             cp.spawn = () => Object.assign(new EventEmitter(), { pid: 0 });
             const tracker = require(${JSON.stringify(trackerPath)});
             ${script}`,
        ],
        { encoding: 'utf8', timeout: 10000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    return JSON.parse(result.stdout.trim());
}

describe('audio browser process ownership', () => {
    it('tracks the exact configured default Playwright executable without a local wrapper', () => {
        const result = ownershipProbe(`
            const executable = require('path').resolve('playwright', 'webkit-999', 'pw_run.sh');
            tracker.configureBrowserExecutable(executable);
            cp.spawn(executable, ['--inspector-pipe'], { detached: true });
            console.log(JSON.stringify(tracker.rows.map(row => row.role)));`);
        expect(result).toEqual(['browser']);
    });

    it('does not infer browser ownership from an unrelated wrapper-like command', () => {
        const result = ownershipProbe(`
            tracker.configureBrowserExecutable(require('path').resolve('playwright', 'webkit-999', 'pw_run.sh'));
            cp.spawn(require('path').resolve('unrelated-run-webkit-local-deps.sh'), [], { detached: true });
            console.log(JSON.stringify(tracker.rows));`);
        expect(result).toEqual([]);
    });

    it('rejects relative executable paths and ownership changes after an owned spawn', () => {
        const result = ownershipProbe(`
            const errors = [];
            try { tracker.configureBrowserExecutable('pw_run.sh'); } catch (e) { errors.push(e.message); }
            const executable = require('path').resolve('playwright', 'webkit-999', 'pw_run.sh');
            tracker.configureBrowserExecutable(executable);
            cp.spawn(executable, ['--inspector-pipe'], { detached: true });
            try { tracker.configureBrowserExecutable(require('path').resolve('other', 'browser')); } catch (e) { errors.push(e.message); }
            console.log(JSON.stringify(errors));`);
        expect(result).toEqual([
            'Browser executable must be an absolute path',
            'Configure browser ownership before spawning owned processes',
        ]);
    });
});
