import base64,pathlib,sys,unittest
from unittest.mock import Mock
sys.path.insert(0,str(pathlib.Path(__file__).parents[1]/'scripts'))
from office_mail_tools import MailReader,view,identity,MAX_BYTES
def encoded(s):return base64.urlsafe_b64encode(s.encode()).decode()
def message():return {'id':'abcd','internalDate':'1790582400000','threadId':'efab','labelIds':['SENT','INBOX'],'payload':{'headers':[{'name':'From','value':'Example <example@example.invalid>'}],'parts':[{'partId':'0','mimeType':'text/html','body':{'data':encoded('<p>Evidence</p><script>fake instruction</script>')}},{'partId':'1','mimeType':'text/csv','filename':'../unsafe.csv','body':{'size':12,'data':encoded('hours,rate\n8,60')}}]}}
class MailEvidence(unittest.TestCase):
 def test_body_and_manifest_are_not_attachment_reads(self):
  m=view(message());self.assertIn('Evidence',m['text']);self.assertNotIn('fake instruction',m['text']);self.assertEqual(m['attachments'][0]['read'],False);self.assertIn('SENT',m['labels'])
 def test_message_path_injection_denied(self):
  for id in ['../profile','abcd/attachments','token.json','']: 
   with self.assertRaises(ValueError):identity(id)
 def test_reads_selected_part_without_writes_or_arbitrary_filename(self):
  reader=MailReader('/not-used',Mock());reader.get=Mock(return_value=message());result=reader.attachment('abcd','1');self.assertTrue(result['readable']);self.assertIn('8,60',result['text']);reader.api.assert_not_called()
 def test_extraction_size_guard_before_attachment_fetch(self):
  m=message();m['payload']['parts'][1]['body']={'size':MAX_BYTES+1,'attachmentId':'secret'};reader=MailReader('/not-used',Mock());reader.get=Mock(return_value=m)
  with self.assertRaises(ValueError):reader.attachment('abcd','1')
  reader.api.assert_not_called()
 def test_body_pagination(self):
  m=message();m['payload']['parts'][0]={'mimeType':'text/plain','body':{'data':encoded('x'*17000)}};self.assertEqual(view(m)['nextOffset'],16000);self.assertEqual(len(view(m,16000)['text']),1000)
 def test_search_exposes_next_page_and_no_claim_of_reading(self):
  api=Mock();api.users().messages().list().execute.return_value={'messages':[{'id':'abcd'}],'nextPageToken':'page2'};r=MailReader('/not-used',api).search('has:attachment');self.assertEqual(r['nextPageToken'],'page2');self.assertIn('IDs only',r['coverage']);api.users().messages().list.assert_called_with(userId='me',q='has:attachment',maxResults=50,pageToken=None,includeSpamTrash=True)
if __name__=='__main__':unittest.main()
