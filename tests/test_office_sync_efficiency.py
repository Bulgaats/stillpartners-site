import datetime as dt
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

import office_mac_sync as sync
from office_backup import current_daily_backup


class EfficiencyTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
  self.root=pathlib.Path(self.temp.name);(self.root/'data').mkdir();(self.root/'Reports').mkdir()
  self.snapshot={'sourceDigest':'a'*64,'documents':[]}
  self.path=self.root/'Reports/Office_snapshot.json';self.path.write_text(json.dumps(self.snapshot))

 def run_sync(self,response,fail_commit=False):
  calls=[]
  def exchange(config,request,**kwargs):
   calls.append(request)
   if request['action']=='pull':return response
   if fail_commit and request['action']=='commit':raise TimeoutError()
   return {'ok':True}
  with patch.object(sync,'exchange',side_effect=exchange):
   result=sync.sync_locked(self.root,{},None,lambda root:self.path)
  return result,calls

 def test_unchanged_source_skips_upload_but_reports_health(self):
  result,calls=self.run_sync({'events':[],'sourceDigest':'a'*64})
  self.assertFalse(result['snapshot_uploaded']);self.assertEqual([c['action'] for c in calls],['pull','health'])

 def test_new_source_and_old_server_both_upload(self):
  for response in [{'events':[],'sourceDigest':'b'*64},{'events':[]}]:
   with self.subTest(response=response):
    result,calls=self.run_sync(response)
    self.assertTrue(result['snapshot_uploaded']);self.assertEqual(calls[1]['snapshot'],self.snapshot)

 def test_unchanged_source_still_commits_applied_and_blocked_receipts(self):
  for status in ['applied','blocked']:
   receipt={'event_id':'test-event','status':status,'file_state':status}
   with self.subTest(status=status),patch.object(sync,'apply_event',return_value=receipt):
    result,calls=self.run_sync({'events':[{'id':'test-event'}],'sourceDigest':'a'*64})
    self.assertTrue(result['snapshot_uploaded']);self.assertEqual(calls[1]['receipts'],[receipt])

 def test_uncertain_commit_recovery_uses_server_digest(self):
  with self.assertRaises(TimeoutError):self.run_sync({'events':[]},fail_commit=True)
  self.assertEqual(json.loads((self.root/'Reports/office_sync_status.json').read_text())['status'],'error')
  result,calls=self.run_sync({'events':[],'sourceDigest':'a'*64})
  self.assertEqual(result['status'],'ok');self.assertEqual([c['action'] for c in calls],['pull','health'])

 def backup_status(self,days=0):
  bundle=self.root/'backup.zip';bundle.write_bytes(b'synthetic existing bundle')
  record={'file':str(bundle),'created_at':(dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=days)).isoformat(),'off_device':False}
  (self.root/'Reports/office_backup_status.json').write_text(json.dumps(record))
  return record

 def test_current_backup_skips_cloud_download_and_bundle_recreation(self):
  prior=self.backup_status();(self.root/'data/office_backup_policy.json').write_text('{"destination":"unused"}')
  with patch('office_backup.daily_backup',side_effect=AssertionError('Existing bundle should be reused')):
   result,calls=self.run_sync({'events':[],'sourceDigest':'a'*64})
  self.assertEqual(result['backup_at'],prior['created_at']);self.assertEqual([c['action'] for c in calls],['pull','health'])

 def test_missing_or_stale_bundle_requires_daily_backup(self):
  self.assertIsNone(current_daily_backup(self.root))
  self.backup_status(days=-1);self.assertIsNone(current_daily_backup(self.root))
  self.backup_status();(self.root/'backup.zip').unlink();self.assertIsNone(current_daily_backup(self.root))

 def test_malformed_status_does_not_skip_backup(self):
  for content in ['not json','[]','{"file":null}']:
   (self.root/'Reports/office_backup_status.json').write_text(content)
   self.assertIsNone(current_daily_backup(self.root))

 def test_due_backup_still_fetches_metadata_before_building_bundle(self):
  (self.root/'data/office_backup_policy.json').write_text('{"destination":"unused"}')
  with patch('office_backup.daily_backup',return_value={'created_at':'synthetic','off_device':False}) as build:
   result,calls=self.run_sync({'events':[],'sourceDigest':'a'*64})
  self.assertEqual([c['action'] for c in calls],['pull','backup','health']);build.assert_called_once()
  self.assertEqual(json.loads((self.root/'data/office_cloud_backup.json').read_text()),{'ok':True})
  self.assertEqual(result['backup_at'],'synthetic')


if __name__=='__main__':unittest.main()
