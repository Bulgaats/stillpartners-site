import hashlib,importlib.util,json,pathlib,sys,tempfile,unittest,uuid
from unittest.mock import patch
# Run on Mac with PYTHONPATH pointing at the installed invoice assistant.
import engine
spec=importlib.util.spec_from_file_location('bridge',pathlib.Path(__file__).resolve().parents[1]/'scripts/office_mac_sync.py');bridge=importlib.util.module_from_spec(spec);spec.loader.exec_module(bridge)
class SyncTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.temp.name);self.addCleanup(self.temp.cleanup)
  self.p1=patch.object(engine,'ROOT',self.root);self.p2=patch.object(engine,'DATA',self.root/'data/register.json');self.p1.start();self.p2.start();self.addCleanup(self.p1.stop);self.addCleanup(self.p2.stop)
  self.file=self.root/'Review/invoice.txt';self.file.parent.mkdir();self.file.write_text('Test invoice original');self.sha=hashlib.sha256(self.file.read_bytes()).hexdigest()
  self.doc=dict(id='d',name='Test Supplier',abn='51824753556',supplier_id='s',invoice_number='I1',issue_date='2026-09-01',work_period='2026-09-01',amount_cents=10000,amount=100,approved=False,currency='AUD',record_type='invoice',duplicate_of='',file='Review/invoice.txt',folder='Review',filename='invoice.txt',sha256=self.sha,flags=[])
  self.cloud=dict(id='d',name='Test Supplier',abn='51824753556',invoiceNumber='I1',issueDate='2026-09-01',workPeriod='2026-09-01',amountCents=10000,currency='AUD',recordType='invoice',duplicateOf='',sourceHash=self.sha)
  engine.atomic_json(engine.DATA,dict(documents=[self.doc],suppliers=[],payments=[],audit=[]))
 def event(self,kind,amount=None,target=None):return dict(id=str(uuid.uuid4()),kind=kind,document_id='d',document=self.cloud.copy(),amount_cents=amount,payment_date='2026-09-25',reason='User confirmed fixture',target_id=target)
 def test_approval_payment_replay_full_copy_and_void(self):
  a=self.event('approve');bridge.apply_event(engine,a);bridge.apply_event(engine,a)
  self.assertEqual(len(engine.load()['audit']),1)
  p=self.event('payment',4000);self.assertEqual(bridge.apply_event(engine,p)['file_state'],'partial');bridge.apply_event(engine,p)
  q=self.event('payment',6000);self.assertEqual(bridge.apply_event(engine,q)['file_state'],'paid_verified');bridge.apply_event(engine,q)
  self.assertEqual(len(engine.load()['payments']),2);self.assertEqual(self.file.read_text(),'Test invoice original')
  v=self.event('void',target=q['id']);self.assertEqual(bridge.apply_event(engine,v)['file_state'],'reversed');bridge.apply_event(engine,v)
  d=engine.document(engine.load(),'d');self.assertEqual(len(list((engine.inside(d['folder'])/'Payment_reversed').iterdir())),1)
 def test_changed_source_blocks_before_approval(self):
  a=self.event('approve');a['document']['sourceHash']='0'*64
  with self.assertRaises(ValueError):bridge.apply_event(engine,a)
  self.assertFalse(engine.load()['documents'][0]['approved'])
 def test_amount_change_blocks_before_payment(self):
  bridge.apply_event(engine,self.event('approve'));p=self.event('payment',10000);p['document']['amountCents']=9999
  with self.assertRaises(ValueError):bridge.apply_event(engine,p)
  self.assertEqual(engine.load()['payments'],[])
 def test_mutation_guard_inside_transaction(self):
  with self.assertRaises(ValueError):engine.approve('d',{},'test',expected={'amount_cents':9999})
if __name__=='__main__':unittest.main()
