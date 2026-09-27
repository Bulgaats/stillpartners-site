import json,pathlib,tempfile,unittest,urllib.error
from unittest.mock import patch,MagicMock
import office_mac_sync as sync
class RecoveryTests(unittest.TestCase):
 def test_retry_commit_uses_identical_payload(self):
  response=MagicMock();response.__enter__.return_value.read.return_value=b'{"ok":true}'
  with patch.object(sync.urllib.request,'urlopen',side_effect=[TimeoutError(),response]) as call,patch.object(sync.time,'sleep'):
   result=sync.exchange({'url':'https://wafebkzjotnyfqeloieo.supabase.co','token':'secret','anon_key':'anon'},{'action':'commit','receipts':[]})
   self.assertTrue(result['ok']);self.assertEqual(call.call_args_list[0].args[0].data,call.call_args_list[1].args[0].data)
 def test_unauthorised_is_not_retried(self):
  with patch.object(sync.urllib.request,'urlopen',side_effect=urllib.error.HTTPError('url',401,'no',{},None)) as call:
   with self.assertRaises(urllib.error.HTTPError):sync.exchange({'url':'https://wafebkzjotnyfqeloieo.supabase.co','token':'secret','anon_key':'anon'},{'action':'pull'})
   self.assertEqual(call.call_count,1)
 def test_failure_preserves_last_success_and_safe_error(self):
  with tempfile.TemporaryDirectory() as t:
   root=pathlib.Path(t);sync.write_status(root,{'status':'ok','finished_at':'2026-09-27T01:00:00Z'})
   r=sync.write_status(root,{'status':'error','last_attempt_at':'2026-09-27T01:05:00Z','error_type':'NETWORK_TIMEOUT'})
   self.assertEqual(r['last_success_at'],'2026-09-27T01:00:00Z');self.assertEqual(json.loads((root/'Reports/office_sync_status.json').read_text())['status'],'error')
   self.assertEqual(sync.safe_error(urllib.error.URLError(TimeoutError('private data'))),'NETWORK_TIMEOUT')
