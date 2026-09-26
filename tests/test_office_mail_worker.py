import base64,copy,email,email.policy,hashlib,json,pathlib,sys,tempfile,unittest,uuid
from unittest.mock import Mock,patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
import office_mail_worker as w
def job():
 pdf=b'%PDF-1.4 Synthetic fixture'
 return {**{k:str(uuid.uuid4()) for k in ('id','lease_id','invoice_id','client_id')},'client_name':'Example Client','recipient':'billing@example.test','subject':'Invoice for review','body':'Approved message','content_digest':'a'*64,'attachments':[{'name':name,'data':base64.b64encode(pdf).decode(),'sha256':hashlib.sha256(pdf).hexdigest()} for name in ('SP-TEST.pdf','SP-TEST-summary.pdf')]}
class ApprovedMailTests(unittest.TestCase):
 def setUp(self):self.temp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.temp.name);self.addCleanup(self.temp.cleanup)
 def test_success_and_replay_send_once_and_preserve_exact_content(self):
  j=job();send=Mock(return_value={'id':'gmail-confirmation'})
  a=w.execute_job(self.root,j,send);b=w.execute_job(self.root,j,send)
  self.assertEqual(a['result']['status'],'sent');self.assertEqual(a,b);send.assert_called_once()
  msg=email.message_from_bytes(base64.urlsafe_b64decode(send.call_args.args[0]['raw']),policy=email.policy.default)
  self.assertEqual(msg['To'],j['recipient']);self.assertEqual(msg['From'],w.ACCOUNT);self.assertEqual(msg['Subject'],j['subject'])
  self.assertEqual([p.get_filename() for p in msg.iter_attachments()],['SP-TEST.pdf','SP-TEST-summary.pdf'])
  w.archive_sent(a)
  self.assertEqual(len(list((self.root/'Client_Invoices').rglob('Sent/*/*.pdf'))),2)
 def test_ambiguous_timeout_is_never_resent(self):
  j=job();send=Mock(side_effect=TimeoutError())
  self.assertEqual(w.execute_job(self.root,j,send)['result']['status'],'unknown')
  self.assertEqual(w.execute_job(self.root,j,send)['result']['status'],'unknown');send.assert_called_once()
 def test_restart_after_attempt_does_not_send(self):
  j=job();p=w.journal_path(self.root,j['id']);w.atomic(p,{'id':j['id'],'lease_id':j['lease_id'],'content_digest':j['content_digest'],'attempt_started':'fixture','acked':False})
  send=Mock();self.assertEqual(w.execute_job(self.root,j,send)['result']['status'],'unknown');send.assert_not_called()
 def test_modified_attachment_or_header_blocks_before_send(self):
  for mutation in ('hash','path','recipient','subject'):
   j=job()
   if mutation=='hash':j['attachments'][0]['sha256']='b'*64
   if mutation=='path':j['attachments'][0]['name']='../unsafe.pdf'
   if mutation=='recipient':j['recipient']='a@example.test,other@example.test'
   if mutation=='subject':j['subject']='Invoice\nBcc: other@example.test'
   send=Mock();self.assertEqual(w.execute_job(self.root,j,send)['result']['status'],'blocked');send.assert_not_called()
 def test_confirmed_rejection_is_distinct_from_uncertain_delivery(self):
  class Rejected(Exception):resp=type('Response',(),{'status':403})()
  send=Mock(side_effect=Rejected());self.assertEqual(w.execute_job(self.root,job(),send)['result']['status'],'failed')
 def test_http_error_classification(self):
  from urllib.error import HTTPError
  for code,status in ((400,'failed'),(403,'failed'),(503,'unknown')):
   sender=Mock(side_effect=HTTPError('https://gmail.googleapis.com/',code,'Synthetic fixture',{},None))
   self.assertEqual(w.execute_job(self.root,job(),sender)['result']['status'],status);sender.assert_called_once()
 def test_cloud_ack_failure_recovers_without_resending(self):
  j=job();send=Mock(return_value={'id':'gmail-confirmation'});r=w.execute_job(self.root,j,send);p=w.journal_path(self.root,j['id'])
  with patch.object(w,'exchange',side_effect=TimeoutError()),self.assertRaises(TimeoutError):w.acknowledge({},p,r)
  with patch.object(w,'exchange',return_value={'ok':True}):w.acknowledge({},p,json.loads(p.read_text()))
  self.assertTrue(json.loads(p.read_text())['acked']);w.execute_job(self.root,j,send);send.assert_called_once()
 def test_no_permission_never_builds_gmail_sender(self):
  (self.root/'data').mkdir();config=self.root/'config.json';config.write_text('{}')
  with patch.object(w,'scope_ready',return_value=False),patch.object(w,'exchange',return_value={}) as exchange,patch.object(w,'gmail_service') as gmail:
   self.assertEqual(w.run(self.root,config),{'status':'idle','send_permission':False});gmail.assert_not_called();exchange.assert_called_once_with({}, {'action':'claim','can_send':False})
if __name__=='__main__':unittest.main()
