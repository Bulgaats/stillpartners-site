import importlib.util,json,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('snapshot',Path(__file__).resolve().parents[1]/'scripts/office_snapshot.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class SnapshotTests(unittest.TestCase):
 def state(self):
  return dict(account='work@stillpartners.net',documents=[dict(id='one',name='Example Supplier',supplier_id='s1',abn='111',gst=0,tonnage=0,amount_cents=10000,source='https://mail.google.com/mail/u/0/#all/example',filename='/private/document.pdf',file='/private/document.pdf')],payments=[])
 def export(self,s):return m.build_snapshot(json.dumps(s).encode())
 def test_unknown_not_unpaid_and_zero_preserved(self):
  d=self.export(self.state())['documents'][0];self.assertEqual(d['paymentStatus'],'Unknown');self.assertEqual(d['gst'],'0');self.assertEqual(d['tonnage'],'0');self.assertNotIn('file',d);self.assertEqual(d['filename'],'document.pdf')
 def test_voided_payment_excluded_partial_then_full(self):
  s=self.state();s['payments']=[dict(id='p1',document_id='one',amount_cents=3000,date='2026-09-25'),dict(id='void',document_id='one',amount_cents=7000,voided=True)]
  self.assertEqual(self.export(s)['documents'][0]['paymentStatus'],'Part-paid');s['payments'][1]['voided']=False
  self.assertEqual(self.export(s)['documents'][0]['paymentStatus'],'Paid')
 def test_source_and_secret_allowlist(self):
  s=self.state();s['token']='private';s['documents'][0]['source']='https://mail.google.com.evil.example/a';d=self.export(s)
  self.assertEqual(d['documents'][0]['source'],'');self.assertNotIn('token',d)
 def test_reject_wrong_account_duplicate_ids(self):
  s=self.state();s['account']='other@example.test'
  with self.assertRaises(ValueError):self.export(s)
  s=self.state();s['documents']*=2
  with self.assertRaises(ValueError):self.export(s)
 def test_atomic_export_keeps_original_and_private_mode(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);(root/'data').mkdir();source=root/'data/register.json';raw=json.dumps(self.state()).encode();source.write_bytes(raw)
   target=m.export_snapshot(root);self.assertEqual(source.read_bytes(),raw);self.assertEqual(target.stat().st_mode&0o777,0o600);self.assertEqual(len(json.loads(target.read_text())['documents']),1)
if __name__=='__main__':unittest.main()
