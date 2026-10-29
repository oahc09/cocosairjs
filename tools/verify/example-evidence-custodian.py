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
import stat
import subprocess
import sys
import time

DEFAULT_LIMITS = json.loads(pathlib.Path(__file__).with_name('example-evidence-limits.json').read_text())
if (not isinstance(DEFAULT_LIMITS, dict)
        or set(DEFAULT_LIMITS) != {'startupMs', 'closeMs', 'innerMs', 'abortMs', 'forceMs', 'finalMs'}
        or any(type(value) is not int or value <= 0 for value in DEFAULT_LIMITS.values())
        or not (max(DEFAULT_LIMITS['startupMs'], DEFAULT_LIMITS['closeMs']) < DEFAULT_LIMITS['innerMs']
                < DEFAULT_LIMITS['abortMs'] < DEFAULT_LIMITS['forceMs'] < DEFAULT_LIMITS['finalMs'])):
    raise RuntimeError('Invalid shared evidence deadline configuration')
SCHEMA = 'example-evidence-custody-observation/2'
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
        try:
            namespace = os.readlink(f'/proc/{pid}/ns/pid')
        except (FileNotFoundError, ProcessLookupError):
            if pathlib.Path(f'/proc/{pid}/stat').exists():
                raise RuntimeError('Unknown process identity: namespace unavailable while process remains')
            raise
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
    if rejected or request['requestId'] != sequence + 1 or request.get('phase') not in ['start', 'closing', 'stop']:
        raise RuntimeError('Barrier request sequence or phase mismatch')
    if request['phase'] in ['closing', 'stop']:
        if (not accepted_start or accepted_start.get('ok') is not True
                or accepted_start.get('phase') != 'start' or request['requestId'] != accepted_start['requestId'] + (1 if request['phase'] == 'closing' else 2)
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
    if request['phase'] in ['closing', 'stop']:
        return 'worker-exited' if current else 'worker-absent' if peer is None else 'worker-identity-mismatch'
    raise RuntimeError('Barrier request is not the exact current collector worker over inherited pipes')


def validate_diagnostic_config(config):
    limits = config['limits']
    profile = config.get('diagnosticProfile')
    if 'diagnosticProfile' in config:
        expected_limits = dict(DEFAULT_LIMITS, startupMs=30000)
        if (not isinstance(profile, dict) or set(profile) != {'schemaVersion', 'freezeId', 'inputDigest', 'canonicalEligible'}
                or profile['schemaVersion'] != 'example-shutdown-target-profile/1' or profile['canonicalEligible'] is not False
                or any(not isinstance(profile[key], str) or len(profile[key]) != 64
                       or any(char not in '0123456789abcdef' for char in profile[key]) for key in ['freezeId', 'inputDigest'])
                or limits != expected_limits or any(type(limits[key]) is not int for key in expected_limits)
                or not (config.get('id') == 'collector-dodge' or (config.get('cpuCase') and config.get('id') == 'cpu-example'))):
            raise RuntimeError('Custodian target diagnostic profile mismatch')
    elif (not isinstance(limits, dict) or set(limits) != set(DEFAULT_LIMITS)
            or any(type(limits[key]) is not int or not 0 < limits[key] <= maximum
                   for key, maximum in DEFAULT_LIMITS.items())
            or not (max(limits['startupMs'], limits['closeMs']) < limits['innerMs']
                    < limits['abortMs'] < limits['forceMs'] < limits['finalMs'])):
        raise RuntimeError('Ordinary custodian limits exceed configured bounds or order')
    return profile



def atomic_json_new(file, value):
    """Publish complete immutable bytes without replacing an existing original."""
    target = pathlib.Path(file)
    temporary = target.with_name(target.name + '.writing-' + str(os.getpid()))
    with open(temporary, 'x', encoding='utf-8') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.link(temporary, target)  # Atomic visibility and no-clobber, including interruption recovery.
    temporary.unlink()


def exact_tuple(first, second):
    return bool(first and second and all(first.get(key) == second.get(key)
                for key in ['pid', 'startTicks', 'namespace']))


def read_functional_original(functional, root, check_deadline):
    """Read one immutable regular original through no-follow directory descriptors."""
    if (not isinstance(functional, dict) or not isinstance(functional.get('path'), str)
            or type(functional.get('bytes')) is not int or not 0 < functional['bytes'] <= 16777216
            or not isinstance(functional.get('sha256'), str) or len(functional['sha256']) != 64
            or any(char not in '0123456789abcdef' for char in functional['sha256'])):
        raise RuntimeError('Closing functional original missing')
    target = pathlib.Path(functional['path'])
    base = pathlib.Path(os.path.abspath(root))
    if not target.is_absolute() or '..' in target.parts or len(target.parts) > 256:
        raise RuntimeError('Closing functional original path invalid')
    target.relative_to(base)  # Lexical scope check; no symlink resolution can grant access.
    descriptors = []
    try:
        check_deadline()
        parent = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK)
        descriptors.append(parent)
        for component in target.parts[1:-1]:
            check_deadline()
            parent = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK,
                             dir_fd=parent)
            descriptors.append(parent)
        file = os.open(target.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        descriptors.append(file)
        before = os.fstat(file)
        if not stat.S_ISREG(before.st_mode) or before.st_size != functional['bytes']:
            raise RuntimeError('Closing functional original is not the declared bounded regular file')
        blocks, remaining = [], before.st_size + 1
        while remaining:
            check_deadline()
            block = os.read(file, min(65536, remaining))
            if not block:
                break
            blocks.append(block)
            remaining -= len(block)
        after = os.fstat(file)
        keys = ['st_dev', 'st_ino', 'st_mode', 'st_size', 'st_mtime_ns', 'st_ctime_ns']
        if any(getattr(before, key) != getattr(after, key) for key in keys):
            raise RuntimeError('Closing functional original changed during read')
        content = b''.join(blocks)
        check_deadline()
        if len(content) != functional['bytes'] or hashlib.sha256(content).hexdigest() != functional['sha256']:
            raise RuntimeError('Closing functional original bytes mismatch')
        value = json.loads(content)
        check_deadline()
        return value
    finally:
        for descriptor in reversed(descriptors):
            os.close(descriptor)


class ShutdownRejected(RuntimeError):
    """Authenticated lifecycle evidence failed; rejection never grants closing authority."""
    REASONS = frozenset([
        'closing-browser-unavailable', 'closing-browser-not-live', 'closing-functional-invalid',
        'closing-image-unverified', 'closing-snapshot-unavailable', 'closing-browser-changed',
        'closing-health-failed', 'close-budget-expired', 'stop-without-closing',
        'stop-receipts-incomplete', 'stop-browser-identity-mismatch', 'stop-browser-exit-failed',
        'stop-browser-still-present', 'stop-server-not-closed', 'stop-observation-unavailable',
    ])

    def __init__(self, reason):
        if reason not in self.REASONS:
            raise ValueError('Unknown shutdown rejection category')
        self.reason = reason
        super().__init__(reason)


def shutdown_observation(reason, operation):
    """Only called after the envelope/current worker/budget are authenticated.

    An unavailable observation remains an explicit FAIL. It does not mean absence,
    authorize an action, or justify killing the receipt writer before its deadline.
    Protocol errors and arbitrary programming exceptions remain outside this boundary.
    """
    try:
        return operation()
    except ShutdownRejected:
        raise
    except (OSError, RuntimeError, ValueError):
        raise ShutdownRejected(reason) from None


def stop_shutdown_evidence(request, closing, same_process=same):
    if not closing:
        raise ShutdownRejected('stop-without-closing')
    # A rewritten authority/budget reference is a protocol violation, not a lifecycle result.
    if request.get('closeBudget') != closing['closeBudget']:
        raise RuntimeError('Stop changed the original closing budget')
    closure = request.get('closure')
    if (not isinstance(closure, dict) or not isinstance(closure.get('browsers'), list)
            or not isinstance(closure.get('servers'), list) or len(closure['browsers']) != 1
            or len(closure['servers']) != 1 or not isinstance(closure['browsers'][0], dict)
            or not isinstance(closure['servers'][0], dict)):
        raise ShutdownRejected('stop-receipts-incomplete')
    browser, server = closure['browsers'][0], closure['servers'][0]
    if not exact_tuple(browser, closing['snapshot']['browser']):
        raise ShutdownRejected('stop-browser-identity-mismatch')
    if any(not isinstance(browser.get(name), dict) or browser[name].get('code') != 0
           or browser[name].get('signal') is not None for name in ['exit', 'close']):
        raise ShutdownRejected('stop-browser-exit-failed')
    if shutdown_observation('stop-observation-unavailable', lambda: same_process(browser)):
        raise ShutdownRejected('stop-browser-still-present')
    if not server.get('close'):
        raise ShutdownRejected('stop-server-not-closed')
    return closure


def image_metadata(stat):
    # Linux dev_t/ino_t can exceed JavaScript's exact numeric range. Never send them as JSON numbers.
    return dict(device=str(stat.st_dev), inode=str(stat.st_ino), bytes=stat.st_size,
                mtimeNs=str(stat.st_mtime_ns))


def browser_shutdown_snapshot(request, config, worker, check_deadline):
    """Pre-close live evidence only. Missing child observations never imply a crash or absence."""
    wanted = request.get('browser')
    browser = shutdown_observation('closing-browser-unavailable', lambda: identity(wanted['pid'])) if isinstance(wanted, dict) and type(wanted.get('pid')) is int else None
    if (not exact_tuple(browser, wanted) or browser['ppid'] != worker['pid'] or browser['state'] in ['Z', 'X']):
        raise ShutdownRejected('closing-browser-not-live')
    functional = request.get('functionalResult')
    value = shutdown_observation('closing-functional-invalid', lambda: read_functional_original(
        functional, pathlib.Path(config['out']).parent, check_deadline))
    if (not isinstance(value, dict) or value.get('schemaVersion') != 'example-functional-result/2'
            or value.get('id') != config['id'] or value.get('completed') != functional.get('completed')
            or value.get('result') != functional.get('result')):
        raise ShutdownRejected('closing-functional-invalid')
    frozen = config['_frozenBrowserImage']
    frozen_hash = frozen['sha256']

    def image_of(pid):
        check_deadline()
        before = os.stat(f'/proc/{pid}/exe')
        value = image_metadata(before)
        after = os.stat(f'/proc/{pid}/exe')
        if value != image_metadata(after):
            raise RuntimeError('image-changed')
        value['sha256'] = frozen_hash if all(value[key] == frozen[key] for key in value) else None
        return value

    image = image_of(browser['pid'])
    if image['sha256'] != frozen_hash:
        raise ShutdownRejected('closing-image-unverified')
    rows, issues = [], []
    known = {browser['pid']: browser}
    for _ in range(256):
        added = False
        for entry in pathlib.Path('/proc').iterdir():
            check_deadline()
            if not entry.name.isdigit() or int(entry.name) in known:
                continue
            try:
                raw = (entry / 'stat').read_text()
                fields = raw[raw.rfind(')') + 2:].split()
                if int(fields[1]) not in known:
                    continue
                try:
                    row = identity(int(entry.name))
                except (OSError, RuntimeError):
                    issues.append(dict(pid=int(entry.name), reason='observation-unavailable'))
                    continue
                if row and row['ppid'] in known and row['namespace'] == browser['namespace']:
                    if len(known) >= 256:
                        raise RuntimeError('Closing snapshot identity bound exceeded')
                    known[row['pid']] = row
                    added = True
            except (FileNotFoundError, ProcessLookupError):
                continue
        if not added:
            break
    for pid, original in known.items():
        check_deadline()
        if pid == browser['pid']:
            continue
        try:
            before = identity(pid)
            if (not exact_tuple(before, original) or before['ppid'] != original['ppid']
                    or before['state'] in ['Z', 'X']):
                issues.append(dict(pid=pid, reason='not-proven-live'))
                continue
            candidate_image = image_of(pid)
            with open(f'/proc/{pid}/cmdline', 'rb') as command:
                data = command.read(65537)
            role = 'unspecified'
            if len(data) > 65536 or not data.endswith(b'\0'):
                role = 'unknown'
            else:
                values = [arg[7:] for arg in data.split(b'\0') if arg.startswith(b'--type=')]
                allowed = [b'gpu-process', b'utility', b'renderer', b'zygote', b'broker', b'ppapi', b'ppapi-broker']
                role = values[0].decode('ascii') if len(values) == 1 and values[0] in allowed else 'unspecified' if not values else 'unknown'
            after = identity(pid)
            if (not exact_tuple(before, after) or before['ppid'] != after['ppid'] or before['pgrp'] != after['pgrp']
                    or after['state'] in ['Z', 'X'] or image_of(pid) != candidate_image):
                issues.append(dict(pid=pid, reason='unstable-observation'))
                continue
            lineage = []
            parent = before['ppid']
            while parent != browser['pid']:
                ancestor = known.get(parent)
                current = identity(parent)
                if not exact_tuple(ancestor, current) or current['ppid'] != ancestor['ppid'] or current['state'] in ['Z', 'X']:
                    raise RuntimeError('lineage-unavailable')
                lineage.append(current)
                parent = current['ppid']
                if len(lineage) > 256:
                    raise RuntimeError('lineage-bound')
            rows.append(dict(identity=after, before=before, lineage=lineage, role=role, image=candidate_image,
                             imageMatchesFrozen=candidate_image['sha256'] == frozen_hash))
        except (OSError, RuntimeError):
            issues.append(dict(pid=pid, reason='observation-unavailable'))
    check_deadline()
    final_browser = identity(browser['pid'])
    if (not exact_tuple(browser, final_browser) or final_browser['state'] in ['Z', 'X']
            or final_browser['ppid'] != worker['pid'] or image_of(browser['pid']) != image):
        raise ShutdownRejected('closing-browser-changed')
    if request.get('healthy') is not True or value.get('completed') is not True or value.get('result') not in ['PASS', 'FAIL']:
        raise ShutdownRejected('closing-health-failed')
    return dict(browser=final_browser, image=image, candidates=rows, issues=issues, functionalResult=functional,
                healthy=request.get('healthy') is True, completed=value.get('completed') is True,
                result=value.get('result'), cpuDummy=bool(config.get('cpuCase')))


def run(config_path, node, supervisor):
    global ACTIVE
    config = json.loads(pathlib.Path(config_path).read_text())
    profile = validate_diagnostic_config(config)
    executable = node if config.get('cpuCase') else config['runtimeIdentity'].get('host', {}).get('executablePath', config['runtimeIdentity'].get('executablePath'))
    with open(executable, 'rb') as image:
        before = os.fstat(image.fileno())
        digest = hashlib.file_digest(image, 'sha256').hexdigest()
        after = os.fstat(image.fileno())
    keys = ['st_dev', 'st_ino', 'st_size', 'st_mtime_ns']
    if any(getattr(before, key) != getattr(after, key) for key in keys):
        raise RuntimeError('Browser image changed during launch authentication')
    if not config.get('cpuCase') and digest != config['runtimeIdentity']['executableSha256']:
        raise RuntimeError('Browser image differs from frozen executable')
    config['_frozenBrowserImage'] = dict(image_metadata(after), sha256=digest)
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
    report['browserImage'] = event('frozen-browser-image', image=config['_frozenBrowserImage'], cpuDummy=bool(config.get('cpuCase')))
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
    rejected_close_deadline = None
    drain_started = None
    deadline_aborted = False
    deadline_forced = False
    closings = {}

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
                disposition = 'clean-exit' if code == 0 and sig is None else 'unexpected-exit'
                closing_event = None
                candidate = None
                if sig == 'SIGTERM' and status == 15:
                    for closing in closings.values():
                        snapshot = closing['snapshot']
                        found = next((item for item in snapshot['candidates'] if exact_tuple(item['identity'], row)), None)
                        if (found and found['imageMatchesFrozen'] and snapshot['healthy'] and snapshot['completed']
                                and snapshot['result'] in ['PASS', 'FAIL'] and closing['ok'] and not report['forced']
                                and not interrupted and closing['eventId'] < row['observed']['eventId'] < row['reap']['eventId']
                                and closing['elapsedMs'] < row['reap']['elapsedMs']):
                            disposition, closing_event, candidate = 'shutdown-compatible', closing['eventId'], found
                            break
                row['disposition'] = event('adopted-disposition', pid=pid, startTicks=row['startTicks'],
                    namespace=row['namespace'], result=disposition, closingEventId=closing_event,
                    candidate=candidate, policy='browser-shutdown/2')
                if disposition == 'unexpected-exit':
                    fail(f'Adopted child exited outside acknowledged shutdown: {pid} code={code} signal={sig}')
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
        nonlocal sequence, accepted_start, rejected_stop, rejected_close_deadline
        request = json.loads(data)
        validate_barrier_envelope(request, node_process.pid, report['custodian']['namespace'],
                                  custody['token'], sequence, accepted_start, rejected_stop)
        peer_pid = request['workerPID']
        try:
            peer = identity(peer_pid)
            reason = check_barrier_request(request, peer, node_process.pid, report['custodian']['namespace'],
                                           custody['token'], sequence, accepted_start, rejected_stop)
        except (OSError, RuntimeError):
            if request['phase'] == 'start':
                raise
            peer, reason = None, 'worker-observation-unknown'

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
                          nodeSupervisorPID=node_process.pid, runtimeId=request['runtimeId'], phase=request['phase'],
                          startEventId=accepted_start['eventId'], reason=reason,
                          currentState={'worker-absent': 'ABSENT', 'worker-identity-mismatch': 'IDENTITY_MISMATCH',
                                        'worker-exited': 'EXITED', 'worker-observation-unknown': 'UNKNOWN'}[reason], currentPeer=peer,
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
        snapshot = None
        closure = None
        closing = closings.get(request['runtimeId'])
        deadline = min((request.get('deadlineEpochMs', 0) / 1000 - started) * 1000,
                       elapsed() + limits['closeMs'], limits['finalMs'])
        close_budget = request.get('closeBudget')
        if request['phase'] != 'start':
            if (not isinstance(close_budget, dict) or set(close_budget) != {'originEventId', 'originElapsedMs', 'deadlineMs'}
                    or type(close_budget['originEventId']) is not int or close_budget['originEventId'] <= 0
                    or any(type(close_budget[key]) not in [int, float] for key in ['originElapsedMs', 'deadlineMs'])
                    or not 0 <= close_budget['originElapsedMs'] < close_budget['deadlineMs']
                    or close_budget['deadlineMs'] != close_budget['originElapsedMs'] + limits['closeMs']):
                raise RuntimeError('Closing supervisor budget reference invalid')
        def check_deadline():
            if interrupted or elapsed() >= deadline:
                raise ShutdownRejected('close-budget-expired')
        try:
            if request['phase'] == 'closing':
                check_deadline()
                snapshot = shutdown_observation('closing-snapshot-unavailable',
                    lambda: browser_shutdown_snapshot(request, config, peer, check_deadline))
            if request['phase'] == 'stop':
                if closing:
                    deadline = min(deadline, closing['deadlineMs'])
                check_deadline()
                closure = stop_shutdown_evidence(request, closing)
        except ShutdownRejected as rejection:
            # Failure response and receipt preservation are not a successful close ACK.
            # This branch never reauthorizes this chain or resets its original clock.
            fail('Runtime shutdown rejected: ' + rejection.reason)
            proof = event('runtime-custody-barrier', requestId=request_id, workerPID=peer_pid,
                workerStartTicks=peer['startTicks'], namespace=peer['namespace'], nodeSupervisorPID=node_process.pid,
                runtimeId=request['runtimeId'], phase=request['phase'], deadlineMs=deadline, closeBudget=close_budget,
                directChildren=own_children(), observedSubreaper=subreaper(), ok=False,
                transport='inherited-anonymous-pipes/v1', snapshot=None, closure=None,
                rejectionReason=rejection.reason, policy='browser-shutdown/2')
            report['barriers'].append(proof)
            accepted_start = None
            rejected_stop = True
            rejected_close_deadline = deadline
            write_response(request, proof)
            return
        alive = scan_adopted()
        children = own_children()
        if request['phase'] == 'stop':
            # Spend only the original closing remainder. Alive is pending, never immediately a failure.
            while (alive or children != [node_process.pid]) and elapsed() < deadline and not interrupted:
                time.sleep(min(0.005, max(0, deadline - elapsed()) / 1000))
                alive = scan_adopted()
                children = own_children()
        drained = not alive and children == [node_process.pid]
        ok = (request['phase'] == 'closing' or drained) and not report['errors'] and subreaper() == 1 and elapsed() < deadline
        if not ok:
            fail('Runtime barrier did not close within its original budget')
        proof = event('runtime-custody-barrier', requestId=request_id, workerPID=peer_pid,
                      workerStartTicks=peer['startTicks'], namespace=peer['namespace'], nodeSupervisorPID=node_process.pid,
                      runtimeId=request.get('runtimeId'), phase=request['phase'], deadlineMs=deadline, closeBudget=close_budget,
                      directChildren=children, observedSubreaper=subreaper(), ok=ok, transport='inherited-anonymous-pipes/v1',
                      snapshot=snapshot, closure=closure, policy='browser-shutdown/2')
        report['barriers'].append(proof)
        if request['phase'] == 'start' and ok:
            accepted_start = proof
        elif request['phase'] == 'closing' and ok:
            closings[request['runtimeId']] = proof
        elif request['phase'] == 'stop' or not ok:
            accepted_start = None
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
        if not ok:
            for row in alive:
                kill_owned(row, 'Failed runtime cannot continue with an adopted descendant')

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
        if rejected_close_deadline is not None and elapsed() >= rejected_close_deadline:
            for row in alive:
                kill_owned(row, 'Rejected shutdown exceeded its original close budget')
            kill_owned(node_row, 'Rejected shutdown receipt writer exceeded its original close budget')
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
    atomic_json_new(custody['observations'], report)
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
        atomic_json_new(config['custodian']['observations'], report)
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
