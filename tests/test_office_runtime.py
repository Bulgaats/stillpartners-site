import json,pathlib,tempfile,unittest
from unittest.mock import Mock
from office_runtime import Runtime,JOBS
class RuntimeTests(unittest.TestCase):
 def setUp(self):
  t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);self.root=pathlib.Path(t.name)
  for name in ['Reports','Logs']:(self.root/name).mkdir()
  self.now=1000;self.spawn=Mock(side_effect=lambda *a,**k:Mock(poll=Mock(return_value=None)))
  self.r=Runtime(self.root,clock=lambda:self.now,spawn=self.spawn)
 def test_one_child_per_worker_even_after_long_sleep(self):
  self.r.tick();self.assertEqual(self.spawn.call_count,3)
  self.now+=3600;self.r.tick();self.assertEqual(self.spawn.call_count,3)
 def test_failed_worker_does_not_stop_others_or_retry_tightly(self):
  self.r.tick();self.r.children['sync'].poll.return_value=1;self.r.tick()
  self.assertEqual(self.r.jobs['sync']['status'],'error');self.assertEqual(self.spawn.call_count,3)
  self.now+=299;self.r.tick();self.assertEqual(self.spawn.call_count,3)
  self.now+=1;self.r.tick();self.assertEqual(self.spawn.call_count,4)
 def test_sleep_catchup_once_without_backlog_storm(self):
  self.r.tick()
  for c in self.r.children.values():c.poll.return_value=0
  self.r.tick();self.now+=7200;self.r.tick();self.assertEqual(self.spawn.call_count,6)
  self.r.tick();self.assertEqual(self.spawn.call_count,6)
 def test_graceful_stop_does_not_start_new_jobs(self):
  self.r.tick();self.r.stopping=True
  for c in self.r.children.values():c.poll.return_value=0
  self.now+=3600;self.r.tick();self.assertFalse(self.r.children);self.assertEqual(self.spawn.call_count,3)
 def test_spawn_error_is_scoped_and_heartbeat_survives(self):
  self.spawn.side_effect=[OSError('private'),Mock(poll=Mock(return_value=None)),Mock(poll=Mock(return_value=None))]
  result=self.r.tick();self.assertEqual(result['jobs']['assistant']['error_type'],'OSError');self.assertEqual(len(self.r.children),2)
  self.assertNotIn('private',(self.root/'Reports/office_runtime_status.json').read_text())
 def test_restart_preserves_success_and_schedules_safe_worker_replay(self):
  self.r.tick();self.r.children['sync'].poll.return_value=0;self.r.tick()
  restart=Runtime(self.root,clock=lambda:self.now,spawn=self.spawn)
  self.assertEqual(restart.jobs['sync']['last_success_at'],self.r.jobs['sync']['last_success_at'])
  restart.tick();self.assertEqual(len(restart.children),3)
