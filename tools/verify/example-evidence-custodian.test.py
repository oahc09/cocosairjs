#!/usr/bin/env python3
"""Pure CPU protocol tests. No subprocess, signal, subreaper, browser, or tracing is run here."""
import importlib.util
import pathlib
import tempfile
import hashlib
import json
import os
import types
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('custodian', pathlib.Path(__file__).with_name('example-evidence-custodian.py'))
HELPER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HELPER)


class BarrierIdentityTests(unittest.TestCase):
    def setUp(self):
        self.peer = dict(pid=101, ppid=99, startTicks='100', namespace='pid:[1]', state='S', pgrp=101)
        self.start = dict(workerPID=101, workerStartTicks='100', namespace='pid:[1]', nodeSupervisorPID=99,
                          runtimeId='runtime-1', phase='start', requestId=1, eventId=5, ok=True)
        self.stop = dict(self.start, token='private-token', phase='stop', requestId=3)
        self.stop.pop('ok')
        self.stop.pop('eventId')

    def check(self, request=None, peer='default', sequence=2, start='default', rejected=False):
        return HELPER.check_barrier_request(self.stop if request is None else request,
            self.peer if peer == 'default' else peer, 99, 'pid:[1]', 'private-token', sequence,
            self.start if start == 'default' else start, rejected)

    def test_current_worker_required_for_success(self):
        self.assertIsNone(self.check())
        request = dict(self.stop, phase='start', requestId=1)
        self.assertIsNone(self.check(request, sequence=0, start=None))

    def test_absent_worker_only_correlates_failure(self):
        self.assertEqual(self.check(peer=None), 'worker-absent')
        self.assertIs(self.start['ok'], True)  # Correlation does not mutate or upgrade the historical proof.

    def test_pid_reuse_namespace_and_parent_mismatch_never_pass(self):
        for changed in [dict(startTicks='101'), dict(namespace='pid:[2]'), dict(ppid=88), dict(pid=102)]:
            with self.subTest(changed=changed):
                self.assertEqual(self.check(peer=dict(self.peer, **changed)), 'worker-identity-mismatch')

    def test_exited_worker_is_rejected_and_unknown_state_is_fatal(self):
        for state in ['Z', 'X']:
            with self.subTest(state=state):
                self.assertEqual(self.check(peer=dict(self.peer, state=state)), 'worker-exited')
                with self.assertRaises(RuntimeError):
                    self.check(dict(self.stop, phase='start', requestId=1),
                               peer=dict(self.peer, state=state), sequence=0, start=None)
        with self.assertRaises(RuntimeError):
            self.check(peer=dict(self.peer, state='?'))

    def test_wrong_envelope_unknown_peer_and_old_runtime_are_fatal(self):
        for request in [[], {}, dict(self.stop, workerPID=True), dict(self.stop, requestId=True),
                        dict(self.stop, token='wrong'), dict(self.stop, nodeSupervisorPID=88),
                        dict(self.stop, workerPID=102), dict(self.stop, workerStartTicks='101'),
                        dict(self.stop, namespace='pid:[2]'), dict(self.stop, requestId=1),
                        dict(self.stop, requestId=4), dict(self.stop, runtimeId='runtime-2'),
                        dict(self.stop, runtimeId='bad'), dict(self.stop, phase='bogus')]:
            with self.subTest(request=request), self.assertRaises(RuntimeError):
                self.check(request, peer=None)
        with self.assertRaises(RuntimeError):
            self.check(dict(self.stop, phase='start', requestId=1), peer=None, sequence=0, start=None)

    def test_missing_failed_or_stale_start_cannot_correlate(self):
        for start in [None, dict(self.start, ok=False), dict(self.start, requestId=0),
                      dict(self.start, runtimeId='runtime-0'), dict(self.start, workerStartTicks='99')]:
            with self.subTest(start=start), self.assertRaises(RuntimeError):
                self.check(peer=None, start=start)
        with self.assertRaises(RuntimeError):
            self.check(dict(self.stop, phase='start'), peer=self.peer)

    def test_rejected_chain_cannot_reopen_or_repeat(self):
        for request in [self.stop, dict(self.stop, requestId=3), dict(self.stop, phase='start', requestId=3)]:
            with self.subTest(request=request), self.assertRaises(RuntimeError):
                self.check(request, sequence=2, start=None, rejected=True)

    @staticmethod
    def stat_row(state, pid=101, ppid=99, pgrp=101, ticks='100'):
        fields = [state, str(ppid), str(pgrp)] + ['0'] * 16 + [ticks]
        return str(pid) + ' (cpu) ' + ' '.join(fields)

    def test_forward_terminal_observation_only_produces_failed_barriers(self):
        for before, after in [('R', 'Z'), ('R', 'X'), ('S', 'Z'), ('Z', 'X')]:
            with self.subTest(before=before, after=after), \
                    patch.object(HELPER.pathlib.Path, 'read_text',
                                 side_effect=[self.stat_row(before), self.stat_row(after)]), \
                    patch.object(HELPER.os, 'readlink', return_value='pid:[1]'):
                observed = HELPER.identity(101)
                self.assertEqual(observed, dict(self.peer, state=after))
                self.assertEqual(self.check(peer=observed), 'worker-exited')
                with self.assertRaises(RuntimeError):
                    self.check(dict(self.stop, phase='start', requestId=1), peer=observed, sequence=0, start=None)

    def test_cpu_wait_keeps_forward_exit_present_until_actual_absence(self):
        # Exercise the real same()/identity() path used by the unchanged CPU wait loop.
        with patch.object(HELPER.pathlib.Path, 'read_text', side_effect=[
                self.stat_row('R'), self.stat_row('Z'), self.stat_row('Z'), self.stat_row('Z'),
                FileNotFoundError(),
        ]) as reads, patch.object(HELPER.os, 'readlink', return_value='pid:[1]'), \
                patch.object(HELPER.os, 'kill') as signals:
            self.assertIs(HELPER.same(self.peer), True, 'R to Z cannot be called absent')
            self.assertIs(HELPER.same(self.peer), True, 'an unreaped Z cannot be called closed')
            self.assertIsNone(HELPER.same(self.peer), 'only the later actual absence ends the wait')
            self.assertEqual(reads.call_count, 5)
            signals.assert_not_called()

    def test_forward_exit_does_not_hide_tuple_reuse_or_unknown_observations(self):
        for change in [dict(pid=102), dict(ticks='101'), dict(ppid=88), dict(pgrp=88)]:
            with self.subTest(change=change), \
                    patch.object(HELPER.pathlib.Path, 'read_text',
                                 side_effect=[self.stat_row('R'), self.stat_row('Z', **change)]), \
                    patch.object(HELPER.os, 'readlink', return_value='pid:[1]'):
                with self.assertRaises(RuntimeError):
                    HELPER.identity(101)
        with patch.object(HELPER.pathlib.Path, 'read_text', side_effect=[self.stat_row('R'), self.stat_row('Z')]), \
                patch.object(HELPER.os, 'readlink', side_effect=['pid:[1]', 'pid:[2]']):
            with self.assertRaisesRegex(RuntimeError, 'tuple changed'):
                HELPER.identity(101)
        for before, after in [('Z', 'R'), ('X', 'R'), ('R', '?')]:
            with self.subTest(before=before, after=after), \
                    patch.object(HELPER.pathlib.Path, 'read_text',
                                 side_effect=[self.stat_row(before), self.stat_row(after)]), \
                    patch.object(HELPER.os, 'readlink', return_value='pid:[1]'):
                with self.assertRaises(RuntimeError):
                    HELPER.identity(101)

    def test_identity_unknown_is_not_absence(self):
        for error in [PermissionError('denied'), OSError('unreadable')]:
            with self.subTest(error=error), patch.object(HELPER.pathlib.Path, 'read_text', side_effect=error):
                with self.assertRaises(type(error)):
                    HELPER.identity(101)
        for raw in ['garbage', '101 (cpu) S 99', '101 (cpu) ? ' + ' '.join(['0'] * 19), '102 (cpu) ' + ' '.join(['0'] * 20)]:
            with self.subTest(raw=raw), patch.object(HELPER.pathlib.Path, 'read_text', return_value=raw), \
                    patch.object(HELPER.os, 'readlink', return_value='pid:[1]'):
                with self.assertRaises(RuntimeError):
                    HELPER.identity(101)
        fields = ['S', '99', '101'] + ['0'] * 16 + ['100']
        first = '101 (cpu) ' + ' '.join(fields)
        fields[19] = '101'
        second = '101 (cpu) ' + ' '.join(fields)
        with patch.object(HELPER.pathlib.Path, 'read_text', side_effect=[first, second]), \
                patch.object(HELPER.os, 'readlink', return_value='pid:[1]'):
            with self.assertRaisesRegex(RuntimeError, 'tuple changed'):
                HELPER.identity(101)
        fields[19] = '100'
        fields[0] = 'Z'
        exited = '101 (cpu) ' + ' '.join(fields)
        with patch.object(HELPER.pathlib.Path, 'read_text', side_effect=[exited, first]), \
                patch.object(HELPER.os, 'readlink', return_value='pid:[1]'):
            with self.assertRaisesRegex(RuntimeError, 'tuple changed'):
                HELPER.identity(101)
        for error in [FileNotFoundError(), ProcessLookupError()]:
            with patch.object(HELPER.pathlib.Path, 'read_text', side_effect=error):
                self.assertIsNone(HELPER.identity(101))


class FunctionalOriginalTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='bounded-functional-')
        self.addCleanup(self.temporary.cleanup)
        self.root = pathlib.Path(self.temporary.name)
        self.file = self.root / 'original.json'
        self.content = b'{"result":"PASS"}'
        self.file.write_bytes(self.content)
        self.ref = dict(path=str(self.file), bytes=len(self.content), sha256=hashlib.sha256(self.content).hexdigest())

    def read(self, ref=None, check=lambda: None):
        return HELPER.read_functional_original(self.ref if ref is None else ref, self.root, check)

    def test_regular_file_and_every_read_are_bounded_by_original_deadline(self):
        checks = []
        self.assertEqual(self.read(check=lambda: checks.append(True)), {'result': 'PASS'})
        self.assertGreater(len(checks), 3)
        with self.assertRaises(TimeoutError), patch.object(HELPER.os, 'open') as opens:
            self.read(check=lambda: (_ for _ in ()).throw(TimeoutError('original deadline')))
        opens.assert_not_called()
        count = 0
        def expires():
            nonlocal count
            count += 1
            if count == 4:
                raise TimeoutError('original deadline')
        with self.assertRaises(TimeoutError):
            self.read(check=expires)

    def test_fifo_directory_links_and_escape_cannot_block_or_substitute_original(self):
        fifo = self.root / 'fifo'
        os.mkfifo(fifo)
        link = self.root / 'link'
        link.symlink_to(self.file)
        directory = self.root / 'directory'
        directory.mkdir()
        ancestor = self.root / 'ancestor'
        ancestor.symlink_to(self.root, target_is_directory=True)
        for candidate in [fifo, link, directory, ancestor / self.file.name, self.root / '..' / self.file.name]:
            with self.subTest(candidate=candidate), self.assertRaises((OSError, RuntimeError, ValueError)):
                self.read(dict(self.ref, path=str(candidate)))

    def test_actual_size_digest_metadata_and_unknown_reads_cannot_be_accepted(self):
        for delta in [dict(bytes=1), dict(bytes=16777217), dict(bytes=True), dict(sha256='0' * 64)]:
            with self.subTest(delta=delta), self.assertRaises(RuntimeError):
                self.read(dict(self.ref, **delta))
        with open(self.file, 'wb') as stream:
            stream.truncate(16777217)
        with self.assertRaises(RuntimeError), patch.object(HELPER.os, 'read') as reads:
            self.read()
        reads.assert_not_called()
        self.file.write_bytes(self.content)
        before = self.file.stat()
        keys = ['st_dev', 'st_ino', 'st_mode', 'st_size', 'st_mtime_ns', 'st_ctime_ns']
        for key in keys:
            changed = types.SimpleNamespace(**{name: getattr(before, name) + (1 if name == key else 0) for name in keys})
            with self.subTest(key=key), patch.object(HELPER.os, 'fstat', side_effect=[before, changed]), self.assertRaises(RuntimeError):
                self.read()
        for error in [PermissionError('unreadable'), OSError('unknown I/O')]:
            with self.subTest(error=error), patch.object(HELPER.os, 'read', side_effect=error), self.assertRaises(type(error)):
                self.read()

    def test_atomic_publication_is_complete_and_never_clobbers_an_original(self):
        destination = self.root / 'published.json'
        HELPER.atomic_json_new(destination, {'complete': True})
        self.assertEqual(json.loads(destination.read_text()), {'complete': True})
        with self.assertRaises(FileExistsError):
            HELPER.atomic_json_new(destination, {'complete': False})
        self.assertEqual(json.loads(destination.read_text()), {'complete': True})


class ShutdownRejectionTests(unittest.TestCase):
    def setUp(self):
        self.browser = dict(pid=102, ppid=101, startTicks='200', namespace='pid:[1]', state='S', pgrp=102)
        self.budget = dict(originEventId=9, originElapsedMs=100, deadlineMs=4100)
        self.closing = dict(closeBudget=self.budget, snapshot=dict(browser=self.browser))
        self.request = dict(closeBudget=self.budget, closure=dict(
            browsers=[dict(self.browser, exit=dict(code=0, signal=None), close=dict(code=0, signal=None))],
            servers=[dict(close=dict(type='server-close'))]))

    def rejection(self, reason, action):
        with self.assertRaises(HELPER.ShutdownRejected) as caught:
            action()
        self.assertEqual(caught.exception.reason, reason)

    def test_every_lifecycle_rejection_is_explicit_and_never_converts_to_success(self):
        for reason in HELPER.ShutdownRejected.REASONS:
            with self.subTest(reason=reason):
                self.rejection(reason, lambda: HELPER.shutdown_observation(
                    'closing-snapshot-unavailable', lambda: (_ for _ in ()).throw(HELPER.ShutdownRejected(reason))))
        with self.assertRaises(ValueError):
            HELPER.ShutdownRejected('arbitrary-text')
        for error in [PermissionError(), OSError(), RuntimeError(), ValueError()]:
            self.rejection('closing-snapshot-unavailable', lambda: HELPER.shutdown_observation(
                'closing-snapshot-unavailable', lambda: (_ for _ in ()).throw(error)))
        with self.assertRaises(TypeError):
            HELPER.shutdown_observation('closing-snapshot-unavailable', lambda: (_ for _ in ()).throw(TypeError()))

    def test_stop_evidence_rejection_matrix_and_protocol_boundary(self):
        import copy
        def check(request=None, closing='original', current=None):
            return HELPER.stop_shutdown_evidence(self.request if request is None else request,
                self.closing if closing == 'original' else closing, same_process=lambda _: current)
        self.assertEqual(check(), self.request['closure'])
        self.rejection('stop-without-closing', lambda: check(closing=None))
        for closure in [None, {}, dict(browsers=[], servers=[]), dict(browsers=[None], servers=[{}])]:
            self.rejection('stop-receipts-incomplete', lambda: check(dict(self.request, closure=closure)))
        for delta in [dict(pid=103), dict(startTicks='201'), dict(namespace='pid:[2]')]:
            changed = copy.deepcopy(self.request); changed['closure']['browsers'][0].update(delta)
            self.rejection('stop-browser-identity-mismatch', lambda: check(changed))
        for event in ['exit', 'close']:
            for value in [None, {}, dict(code=7, signal=None), dict(code=None, signal='SIGTERM'), dict(code=0, signal='SIGKILL')]:
                changed = copy.deepcopy(self.request); changed['closure']['browsers'][0][event] = value
                self.rejection('stop-browser-exit-failed', lambda: check(changed))
        self.rejection('stop-browser-still-present', lambda: check(current=self.browser))
        changed = copy.deepcopy(self.request); changed['closure']['servers'][0]['close'] = None
        self.rejection('stop-server-not-closed', lambda: check(changed))
        self.rejection('stop-observation-unavailable', lambda: HELPER.stop_shutdown_evidence(
            self.request, self.closing, same_process=lambda _: (_ for _ in ()).throw(PermissionError())))
        changed = copy.deepcopy(self.request); changed['closeBudget']['deadlineMs'] += 1
        with self.assertRaises(RuntimeError) as caught:
            check(changed)
        self.assertNotIsInstance(caught.exception, HELPER.ShutdownRejected)

    def test_closing_liveness_and_functional_rejections_preserve_unknown(self):
        worker = dict(pid=101)
        request = dict(browser=self.browser, functionalResult={}, healthy=True)
        config = dict(out='/tmp/cpu/collector.json', id='cpu-example')
        for observation in [None, dict(self.browser, state='Z'), dict(self.browser, state='X'),
                            dict(self.browser, startTicks='999'), dict(self.browser, ppid=99)]:
            with patch.object(HELPER, 'identity', return_value=observation):
                self.rejection('closing-browser-not-live', lambda: HELPER.browser_shutdown_snapshot(
                    request, config, worker, lambda: None))
        with patch.object(HELPER, 'identity', side_effect=PermissionError()):
            self.rejection('closing-browser-unavailable', lambda: HELPER.browser_shutdown_snapshot(
                request, config, worker, lambda: None))
        with patch.object(HELPER, 'identity', return_value=self.browser), \
                patch.object(HELPER, 'read_functional_original', side_effect=OSError()):
            self.rejection('closing-functional-invalid', lambda: HELPER.browser_shutdown_snapshot(
                request, config, worker, lambda: None))


    def test_closing_snapshot_matrix_uses_the_actual_observation_boundary(self):
        import copy
        metadata = dict(st_dev=1, st_ino=2, st_size=10, st_mtime_ns=100)
        image = dict(device=1, inode=2, bytes=10, mtimeNs='100', sha256='a' * 64)
        functional = dict(path='/tmp/cpu/original.json', bytes=20, sha256='b' * 64, completed=True, result='PASS')
        value = dict(schemaVersion='example-functional-result/2', id='cpu-example', completed=True, result='PASS')
        config = dict(id='cpu-example', out='/tmp/cpu/collector.json', _frozenBrowserImage=image, cpuCase='pure')
        request = dict(browser=self.browser, functionalResult=functional, healthy=True)
        def invoke(req=None, output=None, final=None, meta=None, deadline=lambda: None):
            with patch.object(HELPER, 'identity', side_effect=[self.browser, self.browser if final is None else final]), \
                    patch.object(HELPER, 'read_functional_original', return_value=value if output is None else output), \
                    patch.object(HELPER.os, 'stat', return_value=types.SimpleNamespace(**(metadata if meta is None else meta))), \
                    patch.object(HELPER.pathlib.Path, 'iterdir', return_value=[]):
                return HELPER.shutdown_observation('closing-snapshot-unavailable', lambda: HELPER.browser_shutdown_snapshot(
                    request if req is None else req, config, dict(pid=101), deadline))
        self.assertTrue(invoke()['healthy'])
        self.rejection('closing-functional-invalid', lambda: invoke(output=dict(value, id='other')))
        self.rejection('closing-image-unverified', lambda: invoke(meta=dict(metadata, st_ino=3)))
        self.rejection('closing-browser-changed', lambda: invoke(final=dict(self.browser, state='Z')))
        self.rejection('closing-health-failed', lambda: invoke(req=dict(request, healthy=False)))
        for field, replacement in [('completed', False), ('result', 'UNKNOWN')]:
            req = copy.deepcopy(request); req['functionalResult'][field] = replacement
            self.rejection('closing-health-failed', lambda: invoke(req=req, output=dict(value, **{field: replacement})))
        self.rejection('close-budget-expired', lambda: invoke(deadline=lambda: (_ for _ in ()).throw(
            HELPER.ShutdownRejected('close-budget-expired'))))


if __name__ == '__main__':
    unittest.main(verbosity=2)
