import datetime as dt, json, pathlib, sys, tempfile, unittest
from unittest.mock import Mock,patch
sys.path.insert(0,str(pathlib.Path(__file__).parents[1]/'scripts'))
import office_mail_monitor as monitor
from test_office_mail_tools import message
class MailMonitorTests(unittest.TestCase):
 def result(self):return {'title':'Review source request','summary':'A document was requested.','nextAction':'Review the prepared reply.','preparedReply':'Draft only.','needsAttention':True,'priority':'normal','issues':[]}
 def test_validation_cannot_add_external_actions(self):
  self.assertEqual(monitor.validate(self.result()),self.result())
  for p in [{'send':True},{'needsAttention':'true'},{'priority':'whatever'},{'nextAction':''},{'issues':['a'*251]}]:
   with self.assertRaises(ValueError):monitor.validate({**self.result(),**p})
 def test_all_history_pages_and_replay_dedupe(self):
  reader=Mock();api=reader.service.return_value
  api.users().history().list().execute.side_effect=[{'history':[{'messagesAdded':[{'message':{'id':'ab'}},{'message':{'id':'cd'}}]}],'nextPageToken':'p2','historyId':'12'},{'history':[{'messagesAdded':[{'message':{'id':'cd'}},{'message':{'id':'ef'}}]}],'historyId':'13'}]
  old={'history_id':'10','pending':['aa'],'done':{'ab':'review'}}
  new=monitor.discover(reader,old,'2026-09-29T00:00:00Z',1000)
  self.assertEqual(new['pending'],['aa','cd','ef']);self.assertEqual(new['history_id'],'13');self.assertEqual(old['history_id'],'10')
 def test_failed_history_page_does_not_advance_cursor(self):
  reader=Mock();reader.service().users().history().list().execute.side_effect=[{'history':[],'nextPageToken':'next','historyId':'12'},OSError('network')]
  old={'history_id':'10','pending':['aa'],'done':{}}
  with self.assertRaises(OSError):monitor.discover(reader,old,'2026-09-29T00:00:00Z',1000)
  self.assertEqual(old,{'history_id':'10','pending':['aa'],'done':{}})
 def test_initial_scan_all_pages_and_history_before_list(self):
  reader=Mock();api=reader.service.return_value;api.users().getProfile().execute.return_value={'historyId':'20'}
  api.users().messages().list().execute.side_effect=[{'messages':[{'id':'ab'}],'nextPageToken':'two'},{'messages':[{'id':'cd'}]}]
  result=monitor.discover(reader,{'pending':[],'done':{}},'2026-09-29T00:00:00Z',1790640000)
  self.assertEqual(result['pending'],['ab','cd']);self.assertEqual(result['history_id'],'20')
 def test_history_expiry_recovers_without_skipping_sleep_interval(self):
  reader=Mock();api=reader.service.return_value;err=OSError();err.resp=Mock(status=404)
  api.users().history().list().execute.side_effect=err;api.users().getProfile().execute.return_value={'historyId':'99'}
  api.users().messages().list().execute.return_value={'messages':[{'id':'ab'}]}
  state=monitor.discover(reader,{'history_id':'old','last_discovery':1790640000,'pending':[],'done':{}},'2026-09-29T00:00:00Z',1791244800)
  self.assertTrue(state['history_fallback']);self.assertEqual(state['pending'],['ab'])
 def setup_run(self):
  temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup);root=pathlib.Path(temp.name);(root/'data').mkdir();config=root/'config';config.write_text('{}')
  monitor.atomic(root/'data/office-mail-monitor/state.json',{'pending':['abcd'],'done':{},'history_id':'1','last_discovery':1000})
  reader=Mock();m=message();m['labelIds']=['INBOX'];reader.get.return_value=m
  observation={'message_id':'abcd','thread_id':'efab','received_at':'2026-09-29T00:00:00Z','subject':'Synthetic','result':self.result()}
  analysis=Mock(return_value=observation)
  return root,config,reader,analysis
 def test_failed_publication_retries_cached_preparation_not_model(self):
  root,config,reader,analysis=self.setup_run();calls=[];fail=True
  def publish(c,r):
   nonlocal fail
   calls.append(r['action'])
   if r['action']=='status':return {'enabled':True,'started_at':'2026-09-29T00:00:00Z'}
   if r['action']=='observe' and fail:fail=False;raise OSError('network')
   return {'ok':True}
  with self.assertRaises(OSError):monitor.run(root,config,clock=lambda:1000,reader=reader,publish=publish,analyse_fn=analysis)
  state=json.loads((root/'data/office-mail-monitor/state.json').read_text());self.assertEqual(state['pending'],['abcd']);self.assertNotIn('abcd',state['done'])
  result=monitor.run(root,config,clock=lambda:1121,reader=reader,publish=publish,analyse_fn=analysis)
  self.assertEqual(result['status'],'reviewed');self.assertEqual(analysis.call_count,1);self.assertEqual(reader.get.call_count,1)
 def test_pause_performs_no_mail_read(self):
  root,config,reader,analysis=self.setup_run()
  result=monitor.run(root,config,reader=reader,publish=lambda *_:{'enabled':False},analyse_fn=analysis)
  self.assertEqual(result['status'],'paused');reader.assert_not_called();analysis.assert_not_called()
 def test_one_failed_message_does_not_block_other_pending_mail(self):
  root,config,reader,analysis=self.setup_run();p=root/'data/office-mail-monitor/state.json';state=json.loads(p.read_text());state['pending']+=['bbbb'];monitor.atomic(p,state)
  analysis.side_effect=RuntimeError('AI unavailable')
  publish=lambda c,r:{'enabled':True,'started_at':'2026-09-29T00:00:00Z','ok':True}
  with self.assertRaises(RuntimeError):monitor.run(root,config,clock=lambda:1000,reader=reader,publish=publish,analyse_fn=analysis)
  reader.get.return_value={**message(),'id':'bbbb','labelIds':['INBOX']};analysis.side_effect=None;analysis.return_value={'message_id':'bbbb','thread_id':'efab','received_at':'2026-09-29T00:00:00Z','subject':'Synthetic','result':self.result()}
  result=monitor.run(root,config,clock=lambda:1010,reader=reader,publish=publish,analyse_fn=analysis)
  self.assertEqual(result['status'],'reviewed');self.assertEqual(json.loads(p.read_text())['pending'],['abcd'])
 def test_sent_only_skipped_but_self_addressed_checked(self):
  root,config,reader,analysis=self.setup_run();m=message();m['labelIds']=['SENT'];reader.get.return_value=m
  publish=lambda *_:{'enabled':True,'started_at':'2026-09-29T00:00:00Z','ok':True}
  self.assertEqual(monitor.run(root,config,clock=lambda:1000,reader=reader,publish=publish,analyse_fn=analysis)['status'],'skipped_outgoing');analysis.assert_not_called()
  monitor.atomic(root/'data/office-mail-monitor/state.json',{'pending':['abcd'],'done':{},'history_id':'1','last_discovery':1000})
  m['payload']['headers'].append({'name':'To','value':monitor.ACCOUNT})
  self.assertEqual(monitor.run(root,config,clock=lambda:1000,reader=reader,publish=publish,analyse_fn=analysis)['status'],'reviewed')
if __name__=='__main__':unittest.main()
