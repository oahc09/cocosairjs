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


if __name__ == '__main__':
    unittest.main(verbosity=2)
