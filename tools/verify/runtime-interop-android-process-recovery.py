"""Exercise retained-task recovery after controlled background process termination.

Writes only a new attempt directory and the dedicated debug package. No device policy changes.
"""
import argparse
import hashlib
import io
import json
import re
import subprocess
import time
import traceback
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageCms


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['serial', 'apk', 'host-source', 'out', 'expected-page-size']:
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--cycles', type=int, default=2)
    parser.add_argument('--termination', choices=['am-kill', 'uid-sigkill'], required=True)
    parser.add_argument('--install', action='store_true')
    args = parser.parse_args()
    if args.cycles < 1 or args.cycles > 3:
        raise ValueError('Use one to three explicit background process terminations')
    out, apk, source = Path(args.out).resolve(), Path(args.apk).resolve(), Path(args.host_source).resolve()
    out.mkdir(); (out / 'commands').mkdir()
    package = 'com.mystral.engine.interop'
    component = package + '/com.mystral.engine.MystralActivity'
    sha = lambda b: hashlib.sha256(b).hexdigest()
    report = {'schema': 'air-android-process-recovery-v1', 'createdAt': time.time(), 'serial': args.serial,
              'runId': 'process-recovery-' + str(time.time_ns() // 1000000), 'cycles': args.cycles,
              'scope': 'Controlled termination of STOPPED background process, retained task and cold scene recovery; not real LMK/OOM or JS heap persistence',
              'terminationMethod': args.termination,
              'budgets': {'killMs': 10000, 'newReadyMs': 30000, 'renderMs': 15000, 'finalExitMs': 10000},
              'phases': [], 'commandCount': 0, 'subset': True, 'releaseReady': False, 'completed': False, 'pass': False}
    def save(name, value):
        p = out / name
        if isinstance(value, bytes): p.write_bytes(value)
        else: p.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')
    def require(value, message):
        if not value: raise ValueError(message)
    def deadline(ms): return time.monotonic() + ms / 1000
    def adb(values, until=None, binary=False):
        until = deadline(15000) if until is None else until
        left = until - time.monotonic(); require(left > 0, 'Original deadline exceeded')
        report['commandCount'] += 1
        name = 'commands/' + str(report['commandCount']).zfill(5)
        arguments = ['adb', '-s', args.serial, *values]
        row = {'arguments': arguments, 'startedAt': time.time(), 'timeoutSeconds': min(15, left)}
        try:
            p = subprocess.run(arguments, capture_output=True, timeout=row['timeoutSeconds'])
            save(name + '.stdout', p.stdout); save(name + '.stderr', p.stderr); row['exitCode'] = p.returncode
            require(p.returncode == 0, 'ADB command failed: ' + ' '.join(values))
            require(time.monotonic() <= until, 'Original command deadline exceeded')
            return p.stdout if binary else p.stdout.decode().strip()
        except subprocess.TimeoutExpired as e:
            save(name + '.stdout', e.stdout or b''); save(name + '.stderr', e.stderr or b''); row['error'] = str(e); raise
        finally:
            row['finishedAt'] = time.time(); save(name + '.json', row)
    def shell(*values, until=None): return adb(['shell', *values], until)
    def private(name, until=None): return adb(['exec-out', 'run-as', package, 'cat', name], until, True)
    def local(session, name, until=None): return json.loads(private('files/interop/' + session['runId'] + '/' + name, until))
    def wait(operation, until):
        last = None
        while time.monotonic() < until:
            try:
                value = operation()
                if value:
                    require(time.monotonic() <= until, 'Original wait deadline exceeded'); return value
            except Exception as e: last = e
            time.sleep(min(.1, max(0, until-time.monotonic())))
        raise TimeoutError('Original wait deadline exceeded: ' + str(last))
    def activity(label, until=None):
        raw = shell('dumpsys', 'activity', 'activities', package, until=until)
        save(label + '.activities.txt', raw.encode())
        ids = set(re.findall(r'ActivityRecord\{[^\n]*com\.mystral\.engine\.MystralActivity[^\n]*\bt(\d+)\b', raw))
        require(len(ids) == 1, 'Dedicated retained task is absent or ambiguous')
        start = raw.find('mActivityComponent=' + component)
        require(start >= 0, 'Dedicated Activity record is missing')
        section = raw[start:]
        stop = re.search(r'\n\s*\* Hist ', section)
        if stop: section = section[:stop.start()]
        return {'taskId': int(next(iter(ids))), 'stopped': bool(re.search(r'^\s*state=STOPPED\b', section, re.M)), 'raw': raw}
    def package_pids(raw):
        lines = raw.splitlines()
        require(lines and lines[0].split() == ['PID', 'NAME'], 'Invalid process table header')
        rows = [line.split(None, 1) for line in lines[1:] if line.strip()]
        return [int(pid) for pid, name in rows if name == package or name.startswith(package + ':')]
    def processes(label, until=None):
        raw = shell('ps', '-A', '-o', 'PID,NAME', until=until)
        save(label + '.processes.txt', raw.encode())
        return package_pids(raw)
    mappings = []
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    def connect(session):
        port = adb(['forward', 'tcp:0', 'tcp:' + session['origin'].rsplit(':', 1)[1]])
        mappings.append(port)
        def request(route, body=None, until=None):
            until = deadline(15000) if until is None else until
            data = None if body is None else json.dumps(body).encode()
            req = urllib.request.Request('http://127.0.0.1:' + port + route, data=data,
                    headers={'X-Interop-Token': session['token'], 'Content-Type': 'application/json'})
            with opener.open(req, timeout=max(.001, min(15, until-time.monotonic()))) as r:
                value = json.load(r)
            require(time.monotonic() <= until, 'Original HTTP deadline exceeded'); return value
        return request
    def teardown(session, until):
        rows = []
        for line in (out / 'logcat.txt').read_text(errors='replace').splitlines():
            m = re.match(r'^\s*(\d+\.\d+)\s+(\d+)\s+(\d+)\s+[VDIWEF]\s+([^:]+):\s?(.*)$', line)
            if m and int(m[2]) == session['pid']:
                rows.append({'epoch':float(m[1]), 'tid':int(m[3]), 'tag':m[4].strip(), 'message':m[5]})
        lease = next((r for r in rows if 'ACTIVITY_NATIVE_LEASE epoch=' + str(session['activityEpoch']) + ' acquired=1' in r['message']), None)
        if not lease: return None
        owned_rows = [r for r in rows if r['tid'] == lease['tid'] and r['epoch'] >= lease['epoch']]
        markers = ['runtime-reset-return','shutdown-jsEngine-return','context-surface-release-return','context-device-destroy-return','context-device-release-return','context-instance-release-return','shutdown-window-return','shutdown-complete','java-exit-notify-return']
        release = next((r for r in owned_rows if r['message'] == 'ACTIVITY_NATIVE_RELEASE epoch=' + str(session['activityEpoch'])), None)
        sdl = next((r for r in owned_rows if r['tag'] == 'SDL' and r['message'].strip() == 'Finished main function'), None)
        if not (release and sdl and all(any('EXIT_STAGE ' + name in r['message'] for r in owned_rows) for name in markers)): return None
        require(time.monotonic() <= until, 'Original owner teardown deadline exceeded')
        return {'pass':True,'ownerTid':lease['tid'],'releaseEpochSeconds':release['epoch'],'sdlReturnEpochSeconds':sdl['epoch'],'markers':markers}
    owned = False; log = None; log_file = None; latest = None; latest_request = None
    save('collector-source.py', Path(__file__).read_bytes())
    try:
        source_map = json.loads((apk.parent / 'source-verified.json').read_text())
        tracked = [Path(__file__).resolve(), apk, apk.parent / 'source-verified.json', apk.parent / 'build-report.json']
        for file, digest in source_map.items():
            p = source / file; require(sha(p.read_bytes()) == digest, 'Host source differs: ' + file); tracked.append(p)
        report['inputs'] = {str(p): sha(p.read_bytes()) for p in tracked}
        report['apkSha256'] = sha(apk.read_bytes())
        build = json.loads((apk.parent / 'build-report.json').read_text())
        require(build['pass'] and build['apk']['sha256'] == report['apkSha256'] and build['androidStl'] == 'c++_static' and build['sdlVersion'] == '3.2.30' and build['v8StartupMode'] == 'embedded', 'Build/APK profile differs')
        report['pageBytes'] = int(shell('getconf', 'PAGE_SIZE'))
        require(report['pageBytes'] == int(args.expected_page_size), 'Actual page size differs')
        report['compat'] = {name: shell('getprop', name) for name in ['bionic.linker.16kb.app_compat.enabled', 'pm.16kb.app_compat.disabled']}
        if report['pageBytes'] == 16384:
            require(list(report['compat'].values()) == ['fatal', 'true'], 'Strict 16KB compatibility required')
        report['device'] = {'model': shell('getprop', 'ro.product.model'), 'qemu': shell('getprop', 'ro.kernel.qemu')}
        power, policy = shell('dumpsys', 'power'), shell('dumpsys', 'window', 'policy')
        save('preflight-power.txt', power.encode()); save('preflight-policy.txt', policy.encode())
        states = re.findall(r'\b(?:showing|inputRestricted|mKeyguardShowing)\s*[=:]\s*(true|false)', policy)
        require('mWakefulness=Awake' in power and states and set(states) == {'false'}, 'Manual unlocked/Awake admission required')
        if args.install: adb(['install', '-r', str(apk)])
        installed = next(l[8:] for l in shell('pm', 'path', package).splitlines() if l.startswith('package:'))
        require(shell('sha256sum', installed).split()[0] == report['apkSha256'], 'Installed APK differs')
        owned = True
        log_file = (out / 'logcat.txt').open('xb')
        log = subprocess.Popen(['adb', '-s', args.serial, 'logcat', '-v', 'epoch', '-T', '1', 'MystralInterop:V', 'MystralRuntime:V', 'MystralJS:V', 'SDL:V', 'AndroidRuntime:E', 'libc:F', 'DEBUG:F', '*:S'], stdout=log_file, stderr=log_file)
        shell('am', 'force-stop', package)
        report['startEpoch'] = int(shell('date', '+%s'))
        shell('am', 'start', '-W', '-n', component, '--es', 'run_id', report['runId'])
        until = deadline(20000)
        latest = wait(lambda: json.loads(private('files/interop/' + report['runId'] + '/session.json', until)), until)
        for index in range(args.cycles + 1):
            session = latest; phase = {'index': index, 'session': session}; report['phases'].append(phase)
            save('phase-' + str(index) + '.session.json', session)
            if index:
                previous = report['phases'][index-1]['session']
                require(session['pid'] != previous['pid'] and session['runId'] != previous['runId'] and session['token'] != previous['token'], 'Process recovery must change PID and create a new isolated session')
                require(session['parentRunId'] == previous['runId'] and session['activityEpoch'] == 1, 'Session lineage/Activity identity differs')
            current_task = activity('phase-' + str(index) + '-ready')
            phase['taskId'] = current_task['taskId']
            if index: require(phase['taskId'] == report['phases'][index-1]['taskId'], 'Recovery created a new task')
            require(processes('phase-' + str(index) + '-ready') == [session['pid']], 'Actual package PID differs')
            request = connect(session); latest_request = request
            ready_until = deadline(30000)
            ready = wait(lambda: (v if (v := request('/state', until=ready_until))['reportSaved'] else None), ready_until)
            require(ready['runtime']['nativeStarted'] and ready['runtime']['jsEngine'] == 'v8' and ready['runtime']['backend'] == 'dawn', 'Native scene was not ready')
            phase['ready'] = ready; save('phase-' + str(index) + '.state.json', ready)
            render_until = deadline(15000)
            xml = adb(['exec-out', 'uiautomator', 'dump', '/dev/tty'], render_until); save('phase-' + str(index) + '.ui.xml', xml.encode())
            tree = ET.fromstring(re.search(r'<hierarchy\b.*?</hierarchy>', xml, re.S).group())
            views = [n for n in tree.iter('node') if n.get('package') == package and n.get('class') == 'android.view.SurfaceView']
            require(len(views) == 1, 'Actual native SurfaceView ambiguous')
            x, y, right, bottom = map(int, re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', views[0].get('bounds')).groups())
            require((right-x,bottom-y)==(320,240), 'Real Surface size differs')
            shell('input', 'tap', str((x+right)//2), str((y+bottom)//2), until=render_until)
            def event():
                raw = private('files/interop/' + session['runId'] + '/events.jsonl', render_until)
                save('phase-' + str(index) + '.events.jsonl', raw)
                return next((v for line in raw.splitlines() if (v := json.loads(line)).get('stage') == 'demo-input' and v.get('taps') == 1), None)
            phase['input'] = wait(event, render_until)
            require(phase['input']['isTrusted'] and phase['input']['frames'] > 3 and not phase['input']['gpuErrors'], 'Actual input or AIR draw failed')
            raw = adb(['exec-out', 'screencap', '-p'], render_until, True); save('phase-' + str(index) + '.screen.png', raw)
            image = Image.open(io.BytesIO(raw)).convert('RGBA'); original = Image.open(io.BytesIO(raw)); icc = original.info.get('icc_profile')
            if icc:
                save('phase-' + str(index) + '.icc', icc)
                image = ImageCms.profileToProfile(image, ImageCms.ImageCmsProfile(io.BytesIO(icc)), ImageCms.createProfile('sRGB'), renderingIntent=1, outputMode='RGBA', flags=0)
            image.save(out / ('phase-' + str(index) + '.screen-srgb.png'))
            crop = image.crop((x,y,right,bottom)); crop.save(out / ('phase-' + str(index) + '.crop.png'))
            phase['bounds'] = {'x':x,'y':y,'width':320,'height':240}
            green = sum(g > r+50 and g > b+50 for r,g,b,a in crop.getdata()); blue = sum(b > r+20 and b > g+10 for r,g,b,a in crop.getdata())
            require(green>1000 and blue>30000, 'Real compositor did not show the current scene')
            phase['visual'] = {'green':green,'blue':blue,'profiled':bool(icc)}
            if index < args.cycles:
                prefix = 'phase-' + str(index)
                phase['backgroundMode'] = 'home' if index % 2 == 0 else 'settings'
                if phase['backgroundMode'] == 'home': shell('input', 'keyevent', 'KEYCODE_HOME')
                else: shell('am', 'start', '-W', '-a', 'android.settings.SETTINGS')
                stopped_until = deadline(15000)
                stopped = wait(lambda: (v if (v := activity(prefix + '-stopped', stopped_until))['stopped'] else None), stopped_until)
                phase['stoppedTaskId'] = stopped['taskId']
                require(stopped['taskId'] == phase['taskId'] and processes(prefix + '-before-kill') == [session['pid']], 'Background owner/task changed before kill')
                phase['killRequestedAt'] = time.time()
                kill_until = deadline(10000)
                if args.termination == 'am-kill':
                    shell('am', 'kill', '--user', 'current', package, until=kill_until)
                else:
                    # Same debug-package UID only, with the just-verified sole
                    # package PID. Preserve the system task and its saved state.
                    shell('run-as', package, '/system/bin/kill', '-9', str(session['pid']), until=kill_until)
                wait(lambda: not processes(prefix + '-after-kill', kill_until), kill_until)
                phase['killObservedAt'] = time.time()
                phase['termination'] = args.termination + '-background-without-normal-teardown'
                retained = activity(prefix + '-retained', kill_until)
                require(retained['taskId'] == phase['taskId'], 'System discarded the original task')
                files = shell('run-as', package, 'ls', 'files/interop/' + session['runId'])
                save(prefix + '.files-after-kill.txt', files.encode())
                require('native-exit.json' not in files.splitlines(), 'Controlled kill was replaced by normal exit')
                phase['preservedFiles'] = {}
                for name in ['session.json', 'lifecycle.jsonl', 'events.jsonl', 'report.json']:
                    data = private('files/interop/' + session['runId'] + '/' + name)
                    save(prefix + '.preserved-' + name, data)
                    phase['preservedFiles'][name] = sha(data)
                save(prefix + '.lifecycle.jsonl', private('files/interop/' + session['runId'] + '/lifecycle.jsonl'))
                phase['resumeRequestedAt'] = time.time()
                new_until = deadline(30000)
                shell('am', 'task', 'focus', str(phase['taskId']), until=new_until)
                def next_session():
                    value = json.loads(private('files/interop/latest-session.json', new_until))
                    return value if value.get('parentRunId') == session['runId'] and value['pid'] != session['pid'] else None
                latest = wait(next_session, new_until)
                phase['recoveredSessionAt'] = time.time()
                for name, digest in phase['preservedFiles'].items():
                    data = private('files/interop/' + session['runId'] + '/' + name)
                    save(prefix + '.rechecked-' + name, data)
                    require(sha(data) == digest, 'Recovery overwrote the terminated session')
            else:
                exit_until = deadline(10000); request('/finish', {}, exit_until)
                phase['nativeExit'] = wait(lambda: local(session, 'native-exit.json', exit_until), exit_until)
                require(phase['nativeExit']['code'] == 0 and not phase['nativeExit']['error'], 'Final native session did not exit')
                phase['teardown'] = wait(lambda: teardown(session, exit_until), exit_until)
                save('phase-' + str(index) + '.lifecycle.jsonl', private('files/interop/' + session['runId'] + '/lifecycle.jsonl'))
        report['completed'] = True
    except Exception:
        report['error'] = traceback.format_exc()
    finally:
        if owned:
            if latest:
                for name in ['lifecycle.jsonl','events.jsonl','native-exit.json']:
                    try: save('last-' + name, private('files/interop/' + latest['runId'] + '/' + name))
                    except Exception: pass
            report['processCleanup'] = {
                'finalNormalExitBeforeStop': bool(report['completed'] and report['phases'][-1].get('teardown', {}).get('pass')),
                'packageProcessesGone': False,
            }
            try:
                cleanup_until = deadline(report['budgets']['finalExitMs'])
                shell('am', 'force-stop', package, until=cleanup_until)

                def package_stopped():
                    raw = shell('ps', '-A', '-o', 'PID,NAME', until=cleanup_until)
                    save('processes-after-stop.txt', raw.encode())
                    return not package_pids(raw)

                report['processCleanup']['packageProcessesGone'] = wait(package_stopped, cleanup_until)
            except Exception:
                report['cleanupError'] = traceback.format_exc()
        for port in mappings:
            try: adb(['forward','--remove','tcp:'+port])
            except Exception: report['forwardError'] = traceback.format_exc()
        if log:
            before = time.monotonic(); early = log.poll() is not None; log.terminate()
            try: log.wait(timeout=2); report['logcatClose'] = {'observed':True,'elapsedMs':(time.monotonic()-before)*1000,'early':early}
            except subprocess.TimeoutExpired: report['logcatError']='Physical logcat close timed out'
            if early: report['logcatError']='Logcat closed before shutdown request'
            log_file.close()
        if 'inputs' in report:
            report['finalInputs'] = {file:sha(Path(file).read_bytes()) for file in report['inputs']}
            report['inputsUnchanged'] = report['inputs'] == report['finalInputs']
        report['pass'] = bool(
            report['completed']
            and report.get('inputsUnchanged')
            and report.get('processCleanup', {}).get('packageProcessesGone')
            and not any(report.get(key) for key in ('error', 'logcatError', 'forwardError', 'cleanupError'))
        )
        report['status'] = 'PASS' if report['pass'] else 'FAIL'; report['finishedAt'] = time.time()
        save('report.json', report)
        print(json.dumps({'pass':report['pass'],'phases':len(report['phases']),'out':str(out),'error':report.get('error')}))
    raise SystemExit(0 if report['pass'] else 1)


if __name__ == '__main__':
    main()
