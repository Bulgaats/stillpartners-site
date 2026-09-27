import hashlib,json,pathlib,tempfile,unittest
from unittest.mock import patch
import engine
from office_history import eligibility,apply_history,reopen
from office_snapshot import build_snapshot

POLICY={'enabled':True,'cutoff':'2026-09-20','confirmed_at':'2026-09-27T06:05:45Z','owner_confirmation':'Owner confirmed historical accounts settled'}
class HistoryTests(unittest.TestCase):
 def test_date_boundary_and_no_issue_date_substitution(self):
  self.assertIsNotNone(eligibility({'work_period':'14/09/2026 to 20/09/2026'},POLICY))
  self.assertIsNone(eligibility({'work_period':'21/09/2026 to 27/09/2026','issue_date':'2026-09-01','received':'2026-09-01'},POLICY))
  self.assertIsNone(eligibility({'work_period':'20/09/2026 to 21/09/2026'},POLICY))
  self.assertIsNone(eligibility({'work_period':'31/09/2026','received':'2026-09-01'},POLICY))
  self.assertIsNone(eligibility({'issue_date':'2026-09-01'},POLICY))
  self.assertIsNotNone(eligibility({'received':'2026-09-20T15:59:59Z'},POLICY))
  self.assertIsNone(eligibility({'received':'2026-09-20T16:00:00Z'},POLICY))
 def test_explicit_legacy_reference_is_hash_bound_and_never_overrides_new_work(self):
  p={**POLICY,'legacy_references':{'old':'a'*64}}
  d={'id':'old','sha256':'a'*64}
  self.assertTrue(eligibility(d,p)['reference_only'])
  self.assertIsNone(eligibility({**d,'sha256':'b'*64},p))
  self.assertIsNone(eligibility({**d,'work_period':'2026-09-21'},p))
  self.assertIsNone(eligibility({**d,'received':'2026-09-25T00:00:00Z'},p))
 def test_closure_replay_no_cash_change_copy_and_reopen(self):
  with tempfile.TemporaryDirectory() as t,patch.object(engine,'ROOT',pathlib.Path(t)),patch.object(engine,'DATA',pathlib.Path(t)/'data/register.json'):
   root=pathlib.Path(t);(root/'source.txt').write_text('Synthetic source');sha=hashlib.sha256((root/'source.txt').read_bytes()).hexdigest()
   d=dict(id='test',sha256=sha,file='source.txt',filename='source.txt',name='Test Supplier',abn='51824753556',record_type='invoice',amount_cents=10000,work_period='2026-09-20',supplier_id='test')
   engine.atomic_json(engine.DATA,{'account':'work@stillpartners.net','documents':[d],'payments':[],'audit':[]})
   self.assertEqual(apply_history(engine,POLICY)['closed'],1)
   state=engine.load();h=state['documents'][0]['historical_closure'];self.assertEqual(state['payments'],[]);self.assertIsNone(h['payment_date']);self.assertIsNone(h['payment_amount_cents'])
   self.assertEqual(hashlib.sha256((root/h['archive_file']).read_bytes()).hexdigest(),sha)
   before=engine.DATA.read_bytes();self.assertEqual(apply_history(engine,POLICY)['closed'],0);self.assertEqual(before,engine.DATA.read_bytes())
   snapshot=build_snapshot(before);self.assertEqual(snapshot['documents'][0]['historicalClosure']['kind'],'settled');self.assertEqual(snapshot['documents'][0]['paidCents'],0)
   reopen(engine,'test','Owner correction');self.assertEqual(apply_history(engine,POLICY)['closed'],0);self.assertNotIn('historicalClosure',build_snapshot(engine.DATA.read_bytes())['documents'][0])
 def test_duplicate_and_test_sources_are_not_paid(self):
  # References are retained, not promoted into payments or supplier identities.
  with tempfile.TemporaryDirectory() as t,patch.object(engine,'ROOT',pathlib.Path(t)),patch.object(engine,'DATA',pathlib.Path(t)/'data/register.json'):
   root=pathlib.Path(t);(root/'s.txt').write_text('Test');sha=hashlib.sha256((root/'s.txt').read_bytes()).hexdigest()
   d=dict(id='test',sha256=sha,file='s.txt',filename='s.txt',name='Example',record_type='test',amount_cents=0,work_period='2026-09-20')
   engine.atomic_json(engine.DATA,{'documents':[d],'payments':[],'audit':[]});apply_history(engine,POLICY)
   self.assertEqual(engine.load()['documents'][0]['historical_closure']['kind'],'reference')
 def test_changed_source_fails_without_closure(self):
  with tempfile.TemporaryDirectory() as t,patch.object(engine,'ROOT',pathlib.Path(t)),patch.object(engine,'DATA',pathlib.Path(t)/'data/register.json'):
   root=pathlib.Path(t);(root/'s.txt').write_text('Changed');d=dict(id='test',sha256='0'*64,file='s.txt',name='Test',record_type='invoice',amount_cents=100,work_period='2026-09-20')
   engine.atomic_json(engine.DATA,{'documents':[d],'payments':[],'audit':[]});r=apply_history(engine,POLICY)
   self.assertEqual(r['file_errors'],1);self.assertNotIn('historical_closure',engine.load()['documents'][0])
