"""Independently audit the fixed short-exit campaign. No device operations or report edits."""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import re
import traceback
import xml.etree.ElementTree as ET

from PIL import Image, ImageCms


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime-base', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--include-phone', action='store_true')
    args = parser.parse_args()
    root, out = Path(args.runtime_base).resolve(), Path(args.out).resolve()
    out.mkdir()
    hashes, results = {}, []
    sha = lambda b: hashlib.sha256(b).hexdigest()

    def require(value, message):
        if not value:
            raise ValueError(message)

    def read(file):
        file = Path(file).resolve()
        data = file.read_bytes()
        digest = sha(data)
        require(str(file) not in hashes or hashes[str(file)] == digest, 'Input changed: ' + str(file))
        hashes[str(file)] = digest
        return data

    def load(file):
        return json.loads(read(file))

    plan = [('baseline', name, 1, name != 'foreground') for name in ['foreground', 'home', 'settings']]
    plan += [('candidate', name, 1, False) for name in ['foreground', 'home', 'settings']]
    if args.include_phone:
        plan += [('phone', name, 4, False) for name in ['foreground', 'home', 'settings']]
    result = {'schema': 'air-background-exit-independent-audit-v1', 'deviceOperations': False,
              'inputMutations': False, 'completed': False, 'pass': False,
              'subset': True, 'releaseReady': False, 'cases': results}
    try:
        read(__file__)
        for kind, case, attempt, expected_timeout in plan:
            folder = root / ('android-background-exit-' + kind + '-' + case + '-attempt-' + str(attempt))
            report = load(folder / 'report.json')
            require(report['schema'] == 'air-android-background-exit-v1' and report['case'] == case, 'Report identity differs')
            require(report['inputsUnchanged'] and report['inputs'] == report['finalInputs'], 'Inputs did not close')
            for file, digest in report['inputs'].items():
                require(sha(read(file)) == digest, 'Executed input SHA differs: ' + file)
            producer = read(folder / 'collector-source.cjs')
            own = next(digest for file, digest in report['inputs'].items() if file.endswith('runtime-interop-android-background-exit.cjs'))
            require(sha(producer) == own, 'Original collector was not retained')
            session = load(folder / 'session.json')
            pid = session['pid']
            require(session['runId'] == report['runId'] and report['ready']['session'] == session, 'Native session differs')
            require(report['device']['pageBytes'] == (4096 if kind == 'phone' else 16384), 'Actual page size differs')
            if kind != 'phone':
                require(report['device']['qemu'] == '1' and report['compat'] == {'linker': 'fatal', 'pmDisabled': 'true'}, '16KB policy differs')
            require(report['ready']['runtime']['jsEngine'] == 'v8' and report['ready']['runtime']['backend'] == 'dawn', 'Wrong runtime')
            require(sha(read(report['apk']['file'])) == report['apk']['sha256'], 'APK identity differs')
            # Independently verify physical bounds and all original/compositor RGBA pixels.
            xml = read(folder / 'initial.ui.xml').decode()
            hierarchy = ET.fromstring(re.search(r'<hierarchy\b.*?</hierarchy>', xml, re.S).group())
            views = [n for n in hierarchy.iter('node') if n.get('package') == 'com.mystral.engine.interop' and n.get('class') == 'android.view.SurfaceView']
            require(len(views) == 1, 'Ambiguous actual SurfaceView')
            x, y, right, bottom = map(int, re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', views[0].get('bounds')).groups())
            bounds = report['visual']['bounds']
            require(bounds == {'x': x, 'y': y, 'width': right - x, 'height': bottom - y} and right-x == 320 and bottom-y == 240, 'Actual bounds differ')
            raw_bytes, srgb_bytes = read(folder / 'initial.screen.png'), read(folder / 'initial.screen-srgb.png')
            raw, srgb = Image.open(io.BytesIO(raw_bytes)), Image.open(io.BytesIO(srgb_bytes))
            meta = load(folder / 'initial.screen-color.json')
            require(sha(raw_bytes) == meta['input']['sha256'] and sha(srgb_bytes) == meta['output']['sha256'], 'Color metadata does not bind original images')
            icc = raw.info.get('icc_profile')
            if icc:
                require(meta['icc']['present'] and sha(icc) == meta['icc']['sha256'], 'Original ICC SHA differs')
                require(icc == base64.b64decode(meta['icc']['base64'], validate=True) == read(folder / 'initial.screen-source.icc'), 'Original ICC bytes differ')
                expected = ImageCms.profileToProfile(raw.convert('RGBA'), ImageCms.ImageCmsProfile(io.BytesIO(icc)), ImageCms.createProfile('sRGB'), renderingIntent=1, outputMode='RGBA', flags=0)
            else:
                require(not meta['icc']['present'] and raw_bytes == srgb_bytes, 'No-ICC image bytes were changed')
                expected = raw.convert('RGBA')
            require(expected.size == srgb.size and expected.tobytes() == srgb.convert('RGBA').tobytes(), 'Independent full-image RGBA replay differs')
            require(expected.getchannel('A').tobytes() == raw.convert('RGBA').getchannel('A').tobytes(), 'Alpha changed')
            crop_bytes = read(folder / 'initial.screen-crop.png')
            crop = Image.open(io.BytesIO(crop_bytes)).convert('RGBA')
            require(expected.crop((x, y, right, bottom)).tobytes() == crop.tobytes(), 'Physical crop pixels differ')
            counts = {'orange': 0, 'green': 0, 'blue': 0}
            for r, g, b, a in crop.getdata():
                counts['orange'] += int(r > g+50 and r > b+50)
                counts['green'] += int(g > r+50 and g > b+50)
                counts['blue'] += int(b > r+20 and b > g+10)
            require(counts['green'] > 1000 and counts['blue'] > 30000, 'Independent compositor oracle failed')
            for key, value in counts.items():
                require(report['visual']['colors'][key] == value, 'Stored pixel count differs')
            events = [json.loads(line) for line in read(folder / 'events.jsonl').splitlines() if line.strip()]
            event = report['input']
            require(event in events and event['isTrusted'] and event['taps'] == 1 and event['frames'] > 3 and not event['gpuErrors'], 'Real AIR input/draw differs')
            require(abs(event['clientX'] - 160) <= 1 and abs(event['clientY'] - 120) <= 1, 'Trusted coordinates differ')
            life = [json.loads(line) for line in read(folder / 'final-lifecycle.jsonl').splitlines() if line.strip()]
            require(sum(row['event'] == 'created' and row['pid'] == pid for row in life) == 1, 'Activity recreated')
            commands = []
            for file in sorted((folder / 'commands').glob('*.json')):
                command = load(file)
                command['stdout'] = read(file.with_suffix('.stdout'))
                read(file.with_suffix('.stderr'))
                commands.append(command)
            require(all(c['arguments'][:2] == ['-s', report['serial']] for c in commands), 'Wrong ADB target')
            if case != 'foreground':
                raw_activity = read(folder / 'stopped.activities.txt').decode()
                index = raw_activity.index('mActivityComponent=com.mystral.engine.interop/com.mystral.engine.MystralActivity')
                require(re.search(r'^\s*state=STOPPED\b', raw_activity[index:index+12000], re.M), 'App was not actually stopped')
                boundary = report['stopped']['paused']['elapsedRealtime']
                require(not any(r['event'] == 'resume' and r['elapsedRealtime'] > boundary for r in life), 'Exit was assisted by foreground resume')
                if case == 'settings':
                    require(report['stopped']['top'].startswith('com.android.settings/') and report['stopped']['destroyed'] in life, 'No real Settings Surface destruction')
            rows = []
            for line in read(folder / 'logcat.txt').decode().splitlines():
                m = re.match(r'^\s*(\d+\.\d+)\s+(\d+)\s+\d+\s+([VDIWEF])\s+([^:]+):\s?(.*)$', line)
                if m and int(m[2]) == pid and report['startEpoch'] <= float(m[1]) < report['endEpoch']:
                    rows.append((float(m[1]), m[4].strip(), m[5]))
            require(report['crashAudit']['pass'] and report['javascriptExceptions']['pass'], 'Crash/exception gate differs')
            require(not any(tag == 'MystralJS' and 'V8_EXCEPTION ' in text for _, tag, text in rows), 'Uncaught JS exception')
            ack = next(epoch for epoch, tag, text in rows if 'EXIT_STAGE finish-ack-written run=' + report['runId'] in text)
            snapshots, chunks, pending_seq, pending_total = [], [], None, None
            for epoch, tag, text in rows:
                if tag != 'MystralInterop' or not text.startswith('RESOURCE_SNAPSHOT_PART '):
                    continue
                m = re.fullmatch(r'RESOURCE_SNAPSHOT_PART (\d+) (\d+)/(\d+) (.*)', text)
                require(m is not None, 'Malformed resource PART')
                seq, index, total = map(int, m.group(1, 2, 3))
                if not chunks:
                    require(index == 0, 'Missing first resource PART')
                    pending_seq = seq
                    pending_total = total
                require(seq == pending_seq and index == len(chunks) and total == pending_total and total > 0, 'Interleaved/duplicated resource PART')
                require(m[4].isascii() and len(m[4]) <= 512 and (index == total-1 or len(m[4]) == 512), 'Resource transport chunk differs')
                chunks.append(m[4])
                if len(chunks) == total:
                    snap = json.loads(''.join(chunks)); require(snap['pid'] == pid and snap['sequence'] == seq, 'Resource payload identity differs')
                    snapshots.append(snap); chunks = []
            require(not chunks and snapshots and snapshots[0]['stage'] == 'init', 'Incomplete native resource stream')
            previous = None
            for snap in snapshots:
                require(len(snap['types']) == 18, 'Native resource inventory differs')
                if previous:
                    require(snap['sequence'] == previous['sequence'] + 1 and snap['steadyMs'] >= previous['steadyMs'], 'Resource sequence/clock regression')
                for name, row in snap['types'].items():
                    require(all(type(row[key]) is int and row[key] >= 0 for key in ['acquired', 'released', 'live', 'peak']), 'Invalid native counter')
                    require(row['acquired'] - row['released'] == row['live'] and row['peak'] >= row['live'], 'Native ledger conservation failed')
                for key in ['acquired', 'released', 'live']:
                    require(sum(row[key] for row in snap['types'].values()) == snap['total'][key], 'Native total differs')
                require(snap['types']['canvasTexture']['peak'] <= 1, 'Canvas texture not bounded')
                if snap['stage'] in ['periodic', 'cleanup']:
                    require(snap['types']['canvasTexture']['live'] == snap['types']['canvasView']['live'] == 0, 'Canvas lease survives frame boundary')
                require(snap['wrapper']['created'] - snap['wrapper']['finalized'] == snap['wrapper']['live'], 'Wrapper accounting differs')
                previous = snap
            if expected_timeout:
                require(not report['pass'] and not report['completed'] and not report['processCleanup']['normalExitBeforeStop'], 'Baseline timeout was relabelled')
                require(any('sdl-quit-pushed result=1' in text for _, _, text in rows), 'Baseline did not actually request native quit')
                require(not any('Finished main function' in text for _, _, text in rows), 'Baseline actually exited')
                require(snapshots[-1]['stage'] != 'cleanup', 'Baseline unexpectedly cleaned up')
                status = 'REPRODUCED_BASELINE_TIMEOUT'
            else:
                require(report['pass'] and report['completed'] and report['nativeExit']['code'] == 0 and report['teardown']['elapsedMs'] <= 10000, 'Normal bounded exit failed')
                require(load(folder / 'final-native-exit.json') == report['nativeExit'] and report['nativeExit']['pid'] == pid and not report['nativeExit']['error'], 'Original native exit identity differs')
                markers = ['runtime-reset-return', 'shutdown-jsEngine-return', 'context-surface-release-return', 'context-device-destroy-return', 'context-device-release-return', 'context-instance-release-return', 'shutdown-window-return', 'shutdown-complete', 'java-exit-notify-return']
                require(all(any('EXIT_STAGE ' + marker in text for _, _, text in rows) for marker in markers), 'Actual native teardown marker missing')
                sdl = next(epoch for epoch, tag, text in rows if tag == 'SDL' and text.strip() == 'Finished main function')
                require(0 <= sdl-ack <= 10, 'Independent native exit exceeded ten seconds')
                if kind != 'baseline':
                    require(any('EXIT_STAGE sdl-lifecycle-quit-dispatch' in text for _, _, text in rows), 'New lifecycle exit did not execute')
                require(any('SURFACE_CONTEXT_CLEANUP' in text and 'contextWindowRefs=0' in text for _, _, text in rows), 'Context refs did not clear')
                require(snapshots[-1]['stage'] == 'cleanup' and snapshots[-1]['total']['live'] == 0, 'Actual native refs remain')
                require(report['processCleanup']['normalExitBeforeStop'] and report['processCleanup']['pidGone'], 'Forced cleanup was substituted for exit')
                require(report['logcatClose']['closed']['observed'] and not report['logcatClose']['alreadyClosed'] and report['logcatClose']['elapsedMs'] <= 2000, 'Physical logcat close failed')
                status = 'PASS'
            results.append({'kind': kind, 'case': case, 'status': status, 'report': str(folder / 'report.json'),
                            'sourceReportSha256': hashes[str(folder / 'report.json')], 'pageBytes': report['device']['pageBytes'],
                            'profiled': bool(icc), 'fullImageRgbaReplayExact': True, 'snapshots': len(snapshots),
                            'lastNativeReferences': snapshots[-1]['total'], 'exitMs': report.get('teardown', {}).get('elapsedMs')})
        for file, digest in hashes.items():
            require(sha(Path(file).read_bytes()) == digest, 'Audit input changed before closure')
        result.update({'completed': True, 'pass': True})
    except Exception:
        result['error'] = traceback.format_exc()
    result['evidenceHashes'] = hashes
    (out / 'report.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'pass': result['pass'], 'cases': len(results), 'hashes': len(hashes), 'error': result.get('error')}))
    raise SystemExit(0 if result['pass'] else 1)


if __name__ == '__main__':
    main()
