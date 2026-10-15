#!/usr/bin/env python3
"""Pure CPU protocol tests. No subprocess, signal, subreaper, browser, or tracing is run here."""
import importlib.util
import pathlib
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
        self.stop = dict(self.start, token='private-token', phase='stop', requestId=2)
        self.stop.pop('ok')
        self.stop.pop('eventId')

    def check(self, request=None, peer='default', sequence=1, start='default', rejected=False):
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
                        dict(self.stop, requestId=3), dict(self.stop, runtimeId='runtime-2'),
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
        with patch.object(HELPER.pathlib.Path, 'read_text', side_effect=[first, exited]), \
                patch.object(HELPER.os, 'readlink', return_value='pid:[1]'):
            with self.assertRaisesRegex(RuntimeError, 'tuple changed'):
                HELPER.identity(101)
        for error in [FileNotFoundError(), ProcessLookupError()]:
            with patch.object(HELPER.pathlib.Path, 'read_text', side_effect=error):
                self.assertIsNone(HELPER.identity(101))


if __name__ == '__main__':
    unittest.main(verbosity=2)
