#!/usr/bin/env python3
"""Linux kernel subreaper for one evidence attempt. Never runs a browser itself."""
import ctypes
import datetime
import hashlib
import json
import os
import pathlib
import selectors
import signal
import subprocess
import sys
import time

SCHEMA = 'example-evidence-custody-observation/1'
PR_SET_CHILD_SUBREAPER = 36
PR_GET_CHILD_SUBREAPER = 37
LIBC = ctypes.CDLL(None, use_errno=True)
ACTIVE = None
CURRENT_WORKER_FAILURE = 'Barrier stop rejected: collector worker is not the exact current process'


def subreaper(value=None):
    current = ctypes.c_int()
    if value is not None and LIBC.prctl(PR_SET_CHILD_SUBREAPER, int(value), 0, 0, 0) != 0:
        raise OSError(ctypes.get_errno(), 'PR_SET_CHILD_SUBREAPER failed')
    if LIBC.prctl(PR_GET_CHILD_SUBREAPER, ctypes.byref(current), 0, 0, 0) != 0:
        raise OSError(ctypes.get_errno(), 'PR_GET_CHILD_SUBREAPER failed')
    return current.value


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def identity(pid):
    def read():
        raw = pathlib.Path(f'/proc/{pid}/stat').read_text()
        fields = raw[raw.rfind(')') + 2:].split()
        namespace = os.readlink(f'/proc/{pid}/ns/pid')
        if (not raw.startswith(str(pid) + ' (') or len(fields) < 20 or not fields[19].isdigit()
                or not namespace.startswith('pid:[') or not namespace.endswith(']')
                or not namespace[5:-1].isdigit() or fields[0] not in ['R', 'S', 'D', 'T', 't', 'K', 'W', 'P', 'I', 'Z', 'X']):
            raise RuntimeError('Unknown process identity: malformed /proc metadata')
        return dict(pid=pid, state=fields[0], ppid=int(fields[1]), pgrp=int(fields[2]), startTicks=fields[19],
                    namespace=namespace)
    try:
        before, after = read(), read()
        # A forward exit is still present, never a successful barrier or proof of physical closure.
        if (any(before[key] != after[key] for key in ['pid', 'ppid', 'pgrp', 'startTicks', 'namespace'])
                or (before['state'] in ['Z', 'X'] and after['state'] not in ['Z', 'X'])):
            raise RuntimeError('Unknown process identity: /proc tuple changed during observation')
        return after
    except (FileNotFoundError, ProcessLookupError):
        return None


def same(row):
    current = identity(row['pid'])
    return current and current['startTicks'] == row['startTicks'] and current['namespace'] == row['namespace']


def child_state():
    try:
        result = os.waitid(os.P_ALL, 0, os.WEXITED | os.WNOHANG | os.WNOWAIT)
        return dict(echild=False, waitablePID=result.si_pid if result else None)
    except ChildProcessError:
        return dict(echild=True, waitablePID=None)


def own_children():
    # CONFIG_CHECKPOINT_RESTORE's /proc/.../children is optional. Adopted children
    # cannot disappear until this subreaper waitpids them; ECHILD is the final authority.
    children = []
    for entry in pathlib.Path('/proc').iterdir():
        if entry.name.isdigit():
            try:
                raw = (entry / 'stat').read_text()
            except (FileNotFoundError, ProcessLookupError):
                # A concurrent unrelated exit is harmless; unreadable process metadata fails closed.
                continue
            fields = raw[raw.rfind(')') + 2:].split()
            if int(fields[1]) == os.getpid():
                children.append(int(entry.name))
    return sorted(children)


def runtime_identity():
    if sys.platform != 'linux':
        raise RuntimeError('Linux anonymous pipes and PR_SET_CHILD_SUBREAPER are required')
    subreaper()
    executable = os.path.realpath(sys.executable)
    helper = os.path.realpath(__file__)
    return dict(schemaVersion='example-evidence-custody-runtime/1', platform='linux', ipc='inherited-anonymous-pipes/v1',
                python=dict(executablePath=executable, version='Python ' + sys.version.split()[0],
                            sha256=hashlib.sha256(pathlib.Path(executable).read_bytes()).hexdigest()),
                helper=dict(path=helper, sha256=hashlib.sha256(pathlib.Path(helper).read_bytes()).hexdigest()))


def validate_barrier_envelope(request, node_pid, namespace, token, sequence, accepted_start, rejected):
    if (not isinstance(request, dict) or type(request.get('workerPID')) is not int or request['workerPID'] <= 0
            or type(request.get('requestId')) is not int or request['requestId'] <= 0
            or not isinstance(request.get('workerStartTicks'), str) or not request['workerStartTicks'].isdigit()
            or not isinstance(request.get('runtimeId'), str) or not request['runtimeId'].startswith('runtime-')
            or not request['runtimeId'][8:].isdigit() or request.get('namespace') != namespace
            or request.get('nodeSupervisorPID') != node_pid or request.get('token') != token):
        raise RuntimeError('Barrier request identity or envelope mismatch')
    if rejected or request['requestId'] != sequence + 1 or request.get('phase') not in ['start', 'stop']:
        raise RuntimeError('Barrier request sequence or phase mismatch')
    if request['phase'] == 'stop':
        if (not accepted_start or accepted_start.get('ok') is not True
                or accepted_start.get('phase') != 'start' or request['requestId'] != accepted_start['requestId'] + 1
                or any(request[key] != accepted_start.get(key)
                       for key in ['workerPID', 'workerStartTicks', 'namespace', 'runtimeId', 'nodeSupervisorPID'])):
            raise RuntimeError('Barrier stop does not match the most recent successful start')
    elif accepted_start is not None:
        raise RuntimeError('Barrier start overlaps an unfinished runtime')


def check_barrier_request(request, peer, node_pid, namespace, token, sequence, accepted_start, rejected):
    """A historical start can correlate only a failure response, never authorize a current barrier."""
    validate_barrier_envelope(request, node_pid, namespace, token, sequence, accepted_start, rejected)
    current = (peer and peer['pid'] == request['workerPID'] and peer['ppid'] == node_pid
               and peer['startTicks'] == request['workerStartTicks'] and peer['namespace'] == namespace)
    if peer and peer.get('state') not in ['R', 'S', 'D', 'T', 't', 'K', 'W', 'P', 'I', 'Z', 'X']:
        raise RuntimeError('Unknown process identity: unsupported /proc state')
    if current and peer['state'] not in ['Z', 'X']:
        return None
    if request['phase'] == 'stop':
        return 'worker-exited' if current else 'worker-absent' if peer is None else 'worker-identity-mismatch'
    raise RuntimeError('Barrier request is not the exact current collector worker over inherited pipes')


def validate_diagnostic_config(config):
    limits = config['limits']
    profile = config.get('diagnosticProfile')
    if 'diagnosticProfile' in config:
        expected_limits = dict(startupMs=30000, closeMs=4000, innerMs=120000, abortMs=125000, forceMs=133000, finalMs=139000)
        if (not isinstance(profile, dict) or set(profile) != {'schemaVersion', 'freezeId', 'inputDigest', 'canonicalEligible'}
                or profile['schemaVersion'] != 'example-shutdown-target-profile/1' or profile['canonicalEligible'] is not False
                or any(not isinstance(profile[key], str) or len(profile[key]) != 64
                       or any(char not in '0123456789abcdef' for char in profile[key]) for key in ['freezeId', 'inputDigest'])
                or limits != expected_limits or any(type(limits[key]) is not int for key in expected_limits)
                or not (config.get('id') == 'collector-dodge' or (config.get('cpuCase') and config.get('id') == 'cpu-example'))):
            raise RuntimeError('Custodian target diagnostic profile mismatch')
    elif type(limits.get('startupMs')) is not int or not 0 < limits['startupMs'] <= 15000:
        raise RuntimeError('Ordinary custodian startup limit exceeds 15000ms')
    return profile


def run(config_path, node, supervisor):
    global ACTIVE
    config = json.loads(pathlib.Path(config_path).read_text())
    profile = validate_diagnostic_config(config)
    custody = config['custodian']
    limits = config['limits']
    started = datetime.datetime.fromisoformat(config['startedAt'].replace('Z', '+00:00')).timestamp()
    origin = time.monotonic() - (time.time() - started)
    elapsed = lambda: (time.monotonic() - origin) * 1000
    journal = open(custody['journal'], 'x', encoding='utf-8')
    report = dict(schemaVersion=SCHEMA, runtimeIdentity=runtime_identity(), custodian=identity(os.getpid()),
                  startedAt=utc(), endedAt=None, events=[], errors=[], forced=False, barriers=[], adopted=[],
                  initial=None, enabled=None, final=None, restored=None, innerSupervisor=None)

    def event(kind, **values):
        value = dict(type=kind, eventId=len(report['events']) + 1, utc=utc(), elapsedMs=elapsed(), **values)
        report['events'].append(value)
        journal.write(json.dumps(value, separators=(',', ':')) + '\n')
        journal.flush()
        return value

    def fail(message):
        if message not in report['errors']:
            report['errors'].append(message)
            event('custody-error', message=message)

    ACTIVE = dict(config=config, report=report, journal=journal, origin=origin, node=None, previous=None)
    if profile is not None:
        report.update(diagnosticProfile=profile, canonicalEligible=False)
        event('diagnostic-profile', diagnosticProfile=profile, limits=limits)
    interrupted = []
    signal.signal(signal.SIGTERM, lambda number, frame: interrupted.append('SIGTERM'))
    signal.signal(signal.SIGINT, lambda number, frame: interrupted.append('SIGINT'))
    expected_parent = custody['outerPID']
    if os.getppid() != expected_parent:
        raise RuntimeError('Custodian parent identity changed before PDEATHSIG setup')
    parent_death_signal = ctypes.c_int()
    if LIBC.prctl(1, int(signal.SIGTERM), 0, 0, 0) != 0 or LIBC.prctl(2, ctypes.byref(parent_death_signal), 0, 0, 0) != 0:
        raise OSError(ctypes.get_errno(), 'Custodian PDEATHSIG unavailable')
    if os.getppid() != expected_parent or parent_death_signal.value != int(signal.SIGTERM):
        raise RuntimeError('Custodian parent identity changed during PDEATHSIG setup')
    report['parentDeath'] = event('parent-death-signal', parentPID=expected_parent, signal='SIGTERM', observed=parent_death_signal.value)
    previous = subreaper()
    ACTIVE['previous'] = previous
    initial = child_state()
    if not initial['echild']:
        raise RuntimeError('Custodian already owns children before the attempt')
    report['initial'] = event('kernel-initial-echild', result='ECHILD', priorSubreaper=previous)
    if config.get('cpuCase') == 'custodian-disabled':
        raise RuntimeError('Intentional CPU control: subreaper unavailable')
    if subreaper(1) != 1:
        raise RuntimeError('Kernel did not enable child subreaper')
    report['enabled'] = event('kernel-subreaper-enabled', observed=1)
    if config.get('cpuCase') == 'custodian-early-exit':
        raise RuntimeError('Intentional CPU control: custodian exits before spawning the inner supervisor')
    if config.get('cpuCase') == 'custodian-killed':
        os.kill(os.getpid(), signal.SIGKILL)
    request_read, request_write = os.pipe()
    response_read, response_write = os.pipe()
    env = dict(os.environ, EXAMPLE_EVIDENCE_CUSTODIAN_REQUEST_FD=str(request_write),
               EXAMPLE_EVIDENCE_CUSTODIAN_RESPONSE_FD=str(response_read),
               EXAMPLE_EVIDENCE_CUSTODIAN_TOKEN=custody['token'], EXAMPLE_EVIDENCE_CUSTODIAN_PID=str(os.getpid()))
    node_process = subprocess.Popen([node, supervisor, '--custodian-inner=' + config_path],
                                    stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    env=env, start_new_session=True, close_fds=True,
                                    pass_fds=(request_write, response_read))
    os.close(request_write)
    os.close(response_read)
    os.set_blocking(response_write, False)
    ACTIVE['node'] = node_process
    node_row = identity(node_process.pid)
    if not node_row:
        raise RuntimeError('Inner supervisor identity unavailable')
    node_row.update(spawn=event('inner-supervisor-spawn', identity=node_row.copy()), exit=None,
                    stdoutEOF=None, stderrEOF=None)
    report['innerSupervisor'] = node_row
    selector = selectors.DefaultSelector()
    selector.register(request_read, selectors.EVENT_READ, 'control')
    control_buffer = b''
    selector.register(node_process.stdout, selectors.EVENT_READ, 'stdout')
    selector.register(node_process.stderr, selectors.EVENT_READ, 'stderr')
    if config.get('cpuCase') == 'custodian-postspawn-error':
        raise RuntimeError('Intentional CPU post-spawn exception')
    adopted = {}
    sequence = 0
    accepted_start = None
    rejected_stop = False
    drain_started = None
    deadline_aborted = False
    deadline_forced = False

    def kill_owned(row, reason):
        if not same(row):
            return
        fail(reason)
        report['forced'] = True
        os.kill(row['pid'], signal.SIGKILL)
        event('owned-signal', pid=row['pid'], startTicks=row['startTicks'], namespace=row['namespace'], signal='SIGKILL')

    def scan_adopted():
        for pid in own_children():
            if pid == node_process.pid:
                continue  # subprocess.Popen alone owns the inner Node waitpid.
            current = identity(pid)
            if not current or current['ppid'] != os.getpid() or current['namespace'] != report['custodian']['namespace']:
                raise RuntimeError('Adopted child identity changed during inspection')
            key = (pid, current['startTicks'])
            if key not in adopted:
                row = dict(current, observed=event('adopted-child', identity=current), reap=None, absent=None)
                adopted[key] = row
                report['adopted'] = list(adopted.values())
            row = adopted[key]
            if row['reap'] is not None:
                continue
            if not same(row):
                raise RuntimeError('Adopted child vanished without a waitpid receipt')
            reaped, status = os.waitpid(pid, os.WNOHANG)
            if reaped:
                code = os.WEXITSTATUS(status) if os.WIFEXITED(status) else None
                sig = signal.Signals(os.WTERMSIG(status)).name if os.WIFSIGNALED(status) else None
                row['reap'] = event('adopted-waitpid', pid=pid, startTicks=row['startTicks'], namespace=row['namespace'],
                                    rawStatus=status, code=code, signal=sig)
                if same(row):
                    raise RuntimeError('Reaped adopted child still has its original /proc identity')
                row['absent'] = event('adopted-absent', pid=pid, startTicks=row['startTicks'], namespace=row['namespace'])
                if code != 0 or sig:
                    fail(f'Adopted child exited uncleanly: {pid} code={code} signal={sig}')
        return [row for row in adopted.values() if row['reap'] is None]

    def cpu_close_worker_before_reply(request, peer):
        # CPU-only synchronization: force actual worker disappearance before the next custody observation.
        current = identity(peer['pid'])
        if (not current or current['ppid'] != node_process.pid or current['startTicks'] != peer['startTicks']
                or current['namespace'] != peer['namespace']):
            raise RuntimeError('CPU delayed response worker identity changed before signal')
        os.kill(peer['pid'], signal.SIGTERM)
        event('cpu-worker-signal', cpuOnly=True, pid=peer['pid'], startTicks=peer['startTicks'],
              namespace=peer['namespace'], ppid=current['ppid'], signal='SIGTERM')
        stop_deadline = min(elapsed() + limits['closeMs'], limits['finalMs'])
        while same(peer):
            if interrupted or elapsed() >= stop_deadline:
                raise RuntimeError('CPU delayed response worker did not close within the original deadline')
            time.sleep(0.001)
        event('cpu-worker-absent-before-ack', cpuOnly=True, pid=peer['pid'], startTicks=peer['startTicks'],
              namespace=peer['namespace'])
        marker_path = pathlib.Path(config['out']).parent / 'cpu-drain-ready.json'
        while not marker_path.exists():
            if interrupted or elapsed() >= stop_deadline:
                raise RuntimeError('CPU finalization handshake missed the original deadline')
            time.sleep(0.001)
        marker = json.loads(marker_path.read_text())
        if (marker.get('type') != 'cpu-custody-drain-ready' or marker.get('cpuOnly') is not True
                or marker.get('nodePID') != node_process.pid or marker.get('nodeStartTicks') != node_row['startTicks']
                or marker.get('namespace') != peer['namespace'] or marker.get('workerPID') != peer['pid']
                or marker.get('workerStartTicks') != peer['startTicks'] or marker.get('requestId') != request['requestId']
                or not isinstance(marker.get('workerCloseEventId'), int)):
            raise RuntimeError('CPU finalization handshake identity mismatch')
        event('cpu-drain-ready-observed', cpuOnly=True, marker=marker)

    def write_response(request, proof, **extra):
        payload = (json.dumps(dict(ok=proof['ok'], token=custody['token'], requestId=request['requestId'],
            runtimeId=request['runtimeId'], phase=request['phase'], custodianPID=os.getpid(),
            eventId=proof['eventId'], **extra)) + '\n').encode()
        if os.write(response_write, payload) != len(payload):
            raise RuntimeError('Truncated custody response write')
        return payload

    def handle_barrier(data):
        nonlocal sequence, accepted_start, rejected_stop
        request = json.loads(data)
        validate_barrier_envelope(request, node_process.pid, report['custodian']['namespace'],
                                  custody['token'], sequence, accepted_start, rejected_stop)
        peer_pid = request['workerPID']
        peer = identity(peer_pid)
        reason = check_barrier_request(request, peer, node_process.pid, report['custodian']['namespace'],
                                       custody['token'], sequence, accepted_start, rejected_stop)
        if (config.get('cpuCase') in ['custodian-late-stop', 'custodian-late-stop-cancel',
                                     'custodian-late-stop-deadline'] and request['phase'] == 'stop'):
            if reason is not None:
                raise RuntimeError('CPU late-stop control requires an initially current worker')
            cpu_close_worker_before_reply(request, peer)
            peer = identity(peer_pid)
            reason = check_barrier_request(request, peer, node_process.pid, report['custodian']['namespace'],
                                           custody['token'], sequence, accepted_start, rejected_stop)
            if reason is None:
                raise RuntimeError('CPU late-stop control did not establish current-worker rejection')
        request_id = request['requestId']
        sequence = request_id
        if reason is not None:
            # Preserve the failed request under the original timers. Never count history as a successful barrier.
            fail(CURRENT_WORKER_FAILURE)
            proof = event('runtime-custody-rejection', requestId=request_id, workerPID=peer_pid,
                          workerStartTicks=request['workerStartTicks'], namespace=request['namespace'],
                          nodeSupervisorPID=node_process.pid, runtimeId=request['runtimeId'], phase='stop',
                          startEventId=accepted_start['eventId'], reason=reason,
                          currentState={'worker-absent': 'ABSENT', 'worker-identity-mismatch': 'IDENTITY_MISMATCH',
                                        'worker-exited': 'EXITED'}[reason], currentPeer=peer,
                          ok=False, transport='inherited-anonymous-pipes/v1')
            accepted_start = None
            rejected_stop = True
            if config.get('cpuCase') == 'custodian-late-stop-cancel':
                if not same(node_row):
                    raise RuntimeError('CPU cancellation target identity changed')
                os.kill(node_process.pid, signal.SIGTERM)
                event('cpu-inner-signal', cpuOnly=True, pid=node_process.pid, startTicks=node_row['startTicks'],
                      namespace=node_row['namespace'], signal='SIGTERM')
            if config.get('cpuCase') not in ['custodian-late-stop-cancel', 'custodian-late-stop-deadline']:
                write_response(request, proof, rejection=reason, startEventId=proof['startEventId'],
                               workerPID=peer_pid, workerStartTicks=request['workerStartTicks'],
                               namespace=request['namespace'])
            return
        alive = scan_adopted()
        children = own_children()
        ok = not alive and children == [node_process.pid] and not report['errors'] and subreaper() == 1
        if not ok:
            fail('Runtime barrier found adopted or unclosed children')
        proof = event('runtime-custody-barrier', requestId=request_id, workerPID=peer_pid,
                      workerStartTicks=peer['startTicks'], namespace=peer['namespace'], nodeSupervisorPID=node_process.pid,
                      runtimeId=request.get('runtimeId'), phase=request['phase'],
                      directChildren=children, observedSubreaper=subreaper(), ok=ok, transport='inherited-anonymous-pipes/v1')
        report['barriers'].append(proof)
        accepted_start = proof if request['phase'] == 'start' and ok else None
        if config.get('cpuCase') == 'custodian-pipe-eof':
            os.close(response_write)
            raise RuntimeError('Intentional CPU custody pipe EOF')
        if config.get('cpuCase') in ['custodian-delayed-stop-ack', 'custodian-stop-drain-cancel', 'custodian-stop-drain-deadline'] and request['phase'] == 'stop':
            cpu_close_worker_before_reply(request, peer)
            if config.get('cpuCase') == 'custodian-stop-drain-cancel':
                if not same(node_row):
                    raise RuntimeError('CPU cancellation target identity changed')
                os.kill(node_process.pid, signal.SIGTERM)
                event('cpu-inner-signal', cpuOnly=True, pid=node_process.pid, startTicks=node_row['startTicks'],
                      namespace=node_row['namespace'], signal='SIGTERM')
            if config.get('cpuCase') != 'custodian-delayed-stop-ack':
                return  # Cancellation or the existing barrier timer must settle the actual in-flight wait.
        if config.get('cpuCase') != 'custodian-no-ack':
            payload = write_response(request, proof)
            if config.get('cpuCase') == 'custodian-duplicate-ack':
                os.write(response_write, payload)
        for row in alive:
            kill_owned(row, 'Runtime cannot continue with an adopted descendant')

    while True:
        for key, _ in selector.select(0.01):
            if key.data == 'control':
                data = os.read(request_read, 65536)
                if not data:
                    if control_buffer:
                        raise RuntimeError('Custody pipe EOF with truncated request')
                    selector.unregister(request_read)
                    os.close(request_read)
                else:
                    control_buffer += data
                    if len(control_buffer) > 65536:
                        raise RuntimeError('Oversized custody pipe request')
                    while b'\n' in control_buffer:
                        line, control_buffer = control_buffer.split(b'\n', 1)
                        handle_barrier(line)
            else:
                data = os.read(key.fileobj.fileno(), 65536)
                if data:
                    target = sys.stdout.buffer if key.data == 'stdout' else sys.stderr.buffer
                    target.write(data)
                    target.flush()
                else:
                    node_row[key.data + 'EOF'] = event('inner-supervisor-' + key.data + '-eof')
                    selector.unregister(key.fileobj)
                    key.fileobj.close()
        result = node_process.poll()
        if result is not None and node_row['exit'] is None:
            node_row['exit'] = event('inner-supervisor-waitpid', code=result if result >= 0 else None,
                                     signal=signal.Signals(-result).name if result < 0 else None)
            drain_started = elapsed()
            if result != 0:
                fail('Inner supervisor did not exit cleanly')
        alive = scan_adopted()
        if interrupted:
            fail('Custodian interrupted: ' + interrupted[0])
            for row in alive:
                kill_owned(row, 'Custodian interrupted with adopted child')
            kill_owned(node_row, 'Custodian interrupted with inner supervisor')
            interrupted.clear()
        if elapsed() >= limits['abortMs'] and not deadline_aborted:
            deadline_aborted = True
            fail('Custodian abort deadline')
            if same(node_row):
                os.kill(node_process.pid, signal.SIGTERM)
        if (elapsed() >= limits['forceMs'] or
                (drain_started is not None and elapsed() - drain_started >= limits['closeMs'])):
            for row in alive:
                kill_owned(row, 'Custodian close deadline with adopted child')
            if elapsed() >= limits['forceMs'] and not deadline_forced:
                deadline_forced = True
                kill_owned(node_row, 'Custodian force deadline')
        state = child_state()
        if node_row['exit'] and node_row['stdoutEOF'] and node_row['stderrEOF'] and state['echild']:
            report['final'] = event('kernel-final-echild', result='ECHILD')
            break
        if elapsed() >= limits['finalMs']:
            fail('Custodian final deadline without kernel ECHILD')
            for row in alive:
                kill_owned(row, 'Custodian final cleanup')
            kill_owned(node_row, 'Custodian final cleanup')
            # The emergency path retains custody and reaps rather than dropping newly adopted descendants.
            raise RuntimeError('Custodian final deadline without complete closure')
    report['adopted'] = list(adopted.values())
    if report['final']:
        observed = subreaper(previous)
        report['restored'] = event('kernel-subreaper-restored', observed=observed, expected=previous)
        if observed != previous:
            fail('Subreaper restore did not take effect')
    selector.close()
    os.close(response_write)
    report['endedAt'] = utc()
    with open(custody['observations'], 'x', encoding='utf-8') as output:
        json.dump(report, output, indent=2)
        output.write('\n')
    journal.close()
    ACTIVE = None
    return 0 if not report['errors'] and not report['forced'] and report['final'] and report['restored'] else 1


def emergency_cleanup(error):
    """Exceptions never discard an enabled subreaper while ordinary killable descendants remain."""
    global ACTIVE
    if ACTIVE is None:
        return
    context = ACTIVE
    config, report, journal = context['config'], context['report'], context['journal']
    node = context['node']
    def event(kind, **values):
        value = dict(type=kind, eventId=len(report['events']) + 1, utc=utc(),
                     elapsedMs=(time.monotonic() - context['origin']) * 1000, **values)
        report['events'].append(value)
        try:
            journal.write(json.dumps(value, separators=(',', ':')) + '\n')
            journal.flush()
        except Exception:
            pass
        return value
    report['errors'].append('Custodian exception: ' + str(error))
    event('custody-error', message='Custodian exception: ' + str(error))
    adopted = {(row['pid'], row['startTicks']): row for row in report['adopted']}
    # Start cleanup immediately; forceMs normally leaves six seconds before the absolute final bound.
    until = time.monotonic() + max(0.1, min(config['limits']['closeMs'] / 1000,
        (config['limits']['finalMs'] - (time.monotonic() - context['origin']) * 1000) / 1000))
    while True:
        if node is not None:
            code = node.poll()
            row = report['innerSupervisor']
            if row is None:
                current = identity(node.pid)
                if current:
                    row = dict(current, spawn=event('inner-supervisor-spawn', identity=current),
                               exit=None, stdoutEOF=None, stderrEOF=None)
                    report['innerSupervisor'] = row
            if row and code is not None and row['exit'] is None:
                row['exit'] = event('inner-supervisor-waitpid', code=code if code >= 0 else None,
                                    signal=signal.Signals(-code).name if code < 0 else None)
            for stream_name in ['stdout', 'stderr']:
                stream = getattr(node, stream_name)
                if row and not row[stream_name + 'EOF'] and stream and not stream.closed:
                    os.set_blocking(stream.fileno(), False)
                    try:
                        data = os.read(stream.fileno(), 65536)
                        if data:
                            target = sys.stdout.buffer if stream_name == 'stdout' else sys.stderr.buffer
                            try:
                                target.write(data)
                                target.flush()
                            except BrokenPipeError:
                                report['errors'].append('Outer log pipe closed during emergency cleanup')
                        else:
                            row[stream_name + 'EOF'] = event('inner-supervisor-' + stream_name + '-eof')
                            stream.close()
                    except BlockingIOError:
                        pass
        for pid in own_children():
            current = identity(pid)
            if not current:
                continue
            is_node = node is not None and pid == node.pid
            if not is_node:
                key = (pid, current['startTicks'])
                if key not in adopted:
                    adopted[key] = dict(current, observed=event('adopted-child', identity=current), reap=None, absent=None)
                row = adopted[key]
            if current['state'] != 'Z' and same(current):
                os.kill(pid, signal.SIGKILL)
                report['forced'] = True
                event('owned-signal', pid=pid, startTicks=current['startTicks'], namespace=current['namespace'], signal='SIGKILL')
            if not is_node:
                reaped, status = os.waitpid(pid, os.WNOHANG)
                if reaped:
                    row['reap'] = event('adopted-waitpid', pid=pid, startTicks=row['startTicks'], namespace=row['namespace'],
                        rawStatus=status, code=os.WEXITSTATUS(status) if os.WIFEXITED(status) else None,
                        signal=signal.Signals(os.WTERMSIG(status)).name if os.WIFSIGNALED(status) else None)
                    if not same(row):
                        row['absent'] = event('adopted-absent', pid=pid, startTicks=row['startTicks'], namespace=row['namespace'])
        streams_closed = node is None or (report['innerSupervisor'] and report['innerSupervisor']['exit'] and
            report['innerSupervisor']['stdoutEOF'] and report['innerSupervisor']['stderrEOF'])
        if child_state()['echild'] and streams_closed:
            report['final'] = event('kernel-final-echild', result='ECHILD')
            if context['previous'] is not None:
                actual = subreaper(context['previous'])
                report['restored'] = event('kernel-subreaper-restored', observed=actual, expected=context['previous'])
            break
        if time.monotonic() >= until:
            report['errors'].append('Emergency cleanup ended without ECHILD; custody is unclosed')
            break
        time.sleep(0.005)
    report['adopted'] = list(adopted.values())
    report['endedAt'] = utc()
    try:
        with open(config['custodian']['observations'], 'x', encoding='utf-8') as output:
            json.dump(report, output, indent=2)
            output.write('\n')
    finally:
        journal.close()
    ACTIVE = None


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['--identity']:
            prior = subreaper()
            if not child_state()['echild']:
                raise RuntimeError('Preflight process already owns children')
            try:
                if subreaper(1) != 1:
                    raise RuntimeError('Subreaper preflight enable failed')
                read_fd, write_fd = os.pipe()
                os.close(read_fd)
                os.close(write_fd)
            finally:
                if subreaper(prior) != prior:
                    raise RuntimeError('Subreaper preflight restore failed')
            print(json.dumps(runtime_identity()))
            sys.exit(0)
        sys.exit(run(sys.argv[1], sys.argv[2], sys.argv[3]))
    except Exception as error:
        try:
            emergency_cleanup(error)
        except Exception as cleanup_error:
            print('Custodian cleanup failed: ' + str(cleanup_error), file=sys.stderr)
        print('Evidence custodian failed: ' + str(error), file=sys.stderr)
        sys.exit(2)
