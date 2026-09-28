import json,pathlib,sys,tempfile,types,unittest,uuid
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
import office_assistant_worker as worker
class WorkerBoundaries(unittest.TestCase):
 def test_model_cannot_add_executable_actions(self):
  payload={**{k:'' for k in worker.LIMITS},'action':'none','group':'regular','gstMode':'exclusive','section':'none','contractors':[],'companyRecord':None,'contractorNames':[]}
  self.assertEqual(worker.validate(payload),payload)
  for key,value in [('action','send_email'),('section','https://example.test')]:
   with self.subTest(key=key),self.assertRaises(ValueError):worker.validate({**payload,key:value})
  with self.assertRaises(ValueError):worker.validate({**payload,'command':'anything'})
 def test_multiple_contractors_are_validated_together(self):
  base={**{k:'' for k in worker.LIMITS},'action':'create_contractors','group':'regular','gstMode':'exclusive','section':'contacts'}
  people=[{'name':'Example '+str(i),'email':'','phone':'','abn':'','group':'regular','sourceDocumentIds':[]} for i in range(4)]
  self.assertEqual(len(worker.validate({**base,'contractors':people})['contractors']),4)
  for invalid in [[],people*26,[{**people[0],'sourceDocumentIds':['x']*21}],[{**people[0],'command':'rm'}]]:
   with self.assertRaises(ValueError):worker.validate({**base,'contractors':invalid})
 def test_check_retry_preserves_counts_without_reimport(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);(root/'Reports').mkdir();task=str(uuid.uuid4());calls=[]
   def gmail():calls.append('gmail');return {'completed':'2026-09-26T00:00:00Z','messages_checked':2,'document_ids':['a'],'warnings':['review']}
   fake_gmail=types.SimpleNamespace(sync=gmail);fake_mac=types.SimpleNamespace(sync=lambda *args:{'status':'ok'})
   with patch.dict(sys.modules,{'gmail_sync':fake_gmail,'office_mac_sync':fake_mac}):
    first=worker.check_invoices(root,root/'config',task);second=worker.check_invoices(root,root/'config',task)
   self.assertEqual(calls,['gmail']);self.assertEqual(first,second);self.assertIn('Checked 2',second['reply']);self.assertIn('Office register refreshed',first['reply'])
 def test_failed_publish_is_not_reported_as_refreshed(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);(root/'Reports').mkdir()
   fake_gmail=types.SimpleNamespace(sync=lambda:{'completed':'2026-09-26T00:00:00Z','messages_checked':0,'document_ids':[],'warnings':[]})
   fake_mac=types.SimpleNamespace(sync=lambda *args:{'status':'already_running'})
   with patch.dict(sys.modules,{'gmail_sync':fake_gmail,'office_mac_sync':fake_mac}):result=worker.check_invoices(root,root/'config',str(uuid.uuid4()))
   self.assertIn('update is pending',result['reply']);self.assertNotIn('register refreshed',result['reply'])

 def test_short_names_are_bounded_batch_proposals(self):
  base={**{k:'' for k in worker.LIMITS},'action':'save_contractor_names','group':'regular','gstMode':'exclusive','section':'contacts','contractors':[]}
  person={'workerId':str(uuid.uuid4()),'fullName':'Synthetic Legal Person','shortName':'Example','aliases':['Example One'],'expectedVersion':0}
  self.assertEqual(len(worker.validate({**base,'contractorNames':[person]})['contractorNames']),1)
  for change in [{'workerId':'not-an-id'},{'shortName':''},{'expectedVersion':-1},{'aliases':['a']*21}]:
   with self.assertRaises(ValueError):worker.validate({**base,'contractorNames':[{**person,**change}]})

 def test_company_record_requires_evidence_and_real_dates(self):
  base={**{k:'' for k in worker.LIMITS},'action':'save_company_record','group':'regular','gstMode':'exclusive','section':'work','contractors':[]}
  record={'id':'','expectedVersion':0,'kind':'work','title':'Await supplier reply','body':'','status':'waiting_external','category':'','priority':'normal','dueDate':'2026-09-28','effectiveDate':'','nextAction':'Check matching thread','outcome':'','sourceRef':'Synthetic thread'}
  self.assertEqual(worker.validate({**base,'companyRecord':record})['companyRecord'],record)
  for patch_ in [{'dueDate':'2026-02-30'},{'nextAction':''},{'status':'completed'},{'expectedVersion':-1},{'command':'anything'}]:
   with self.subTest(patch_=patch_),self.assertRaises(ValueError):worker.validate({**base,'companyRecord':{**record,**patch_}})
 def test_memory_retrieval_is_not_bound_to_chat(self):
  import office_knowledge_tools as kt
  k=kt.Knowledge.__new__(kt.Knowledge)
  k.context={'companyMemory':[{'id':'memory1','title':'Approved preference','status':'confirmed','effective_date':'2026-09-27'}],'workItems':[{'id':'work1','title':'Waiting reply','due_date':'2026-09-28'}]}
  self.assertEqual(k.records('companyMemory')[0]['id'],'memory1')
  self.assertEqual(k.records('workItems')[0]['id'],'work1')

if __name__=='__main__':unittest.main()
