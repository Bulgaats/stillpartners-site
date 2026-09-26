import json,pathlib,sys,tempfile,unittest
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
from office_knowledge_tools import Knowledge,parse_registry,registry_lookup,BUYER_ABN,day
def document(id,**extra):
 return dict(id=id,name='Example Person',abn='51824753556',email='example@example.test',phone='0400000000',invoice_number='INV-'+id,received='2026-09-25T20:00:00Z',record_type='invoice',amount_cents=60000,gst='0',currency='AUD',tonnage='1',supplier_id='s',sha256=id*64,flags=[],**extra)
class KnowledgeTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.temp.name);(self.root/'data').mkdir()
 def tearDown(self):self.temp.cleanup()
 def knowledge(self,docs,context=None):
  (self.root/'data/register.json').write_text(json.dumps({'account':'work@stillpartners.net','documents':docs,'payments':[]}))
  return Knowledge(self.root,context or {})
 def test_invoice_metadata_is_retrievable_not_just_a_count(self):
  k=self.knowledge([document('a')]);r=k.call('read_company_record',{'collection':'invoices','id':'a'})
  self.assertEqual(r['record']['name'],'Example Person');self.assertEqual(r['record']['email'],'example@example.test');self.assertEqual(r['record']['tonnage'],'1')
 def test_duplicates_reused_numbers_and_identity_conflicts_remain_visible(self):
  a=document('a');b={**a,'id':'b','duplicate_of':'a'}
  c={**a,'id':'c','sha256':'c'*64};d={**a,'id':'d','name':'Another Person'}
  rows=self.knowledge([a,b,c,d]).search({'collection':'suppliers'})['records']
  self.assertEqual(len(rows),2)
  s=next(r for r in rows if r['fullName']=='Example Person')
  self.assertEqual(s['documentCount'],3);self.assertEqual(s['distinctNonDuplicateDocuments'],2);self.assertTrue(s['reviewRequired']);self.assertTrue(any('Reused invoice' in x for x in s['issues']))
 def test_buyer_abn_is_never_a_supplier(self):
  self.assertEqual(self.knowledge([{**document('a'),'abn':BUYER_ABN}]).search({'collection':'suppliers'})['total'],0)
 def test_perth_date_filters_paginate_and_report_unknown_dates(self):
  docs=[document(str(i)) for i in range(5)]+[{**document('x'),'received':'unknown'}]
  k=self.knowledge(docs);q={'collection':'invoices','from':'2026-09-26','to':'2026-09-26','limit':2}
  first=k.search(q);self.assertEqual(first['total'],5);self.assertEqual(first['nextOffset'],2);self.assertEqual(first['excludedUnknownDate'],1)
  self.assertEqual(k.search({**q,'offset':4})['nextOffset'],None)
  self.assertEqual(day('2026-09-25T20:00:00Z'),'2026-09-26')
 def test_rejects_arbitrary_tools_arguments_and_path_traversal(self):
  k=self.knowledge([document('a')])
  for name,args in [('run_command',{}),('search_company_records',{'collection':'invoices','sql':'delete'}),('read_company_record',{'collection':'invoices','id':'../../token.json'})]:
   with self.assertRaises(ValueError):k.call(name,args)
  with self.assertRaises(ValueError):k.read_source('a',0)
 def test_source_hash_is_checked_before_reading(self):
  import hashlib
  source=self.root/'invoice.txt';source.write_text('Synthetic invoice evidence only.')
  d={**document('a'),'file':'invoice.txt','sha256':hashlib.sha256(source.read_bytes()).hexdigest()}
  k=self.knowledge([d]);self.assertTrue(k.read_source('a',0)['readable'])
  source.write_text('Changed source')
  with self.assertRaises(ValueError):k.read_source('a',0)
 def test_source_cannot_escape_the_invoice_root(self):
  import hashlib
  outside=self.root.parent/('synthetic-outside-'+self.root.name+'.txt');outside.write_text('Outside scope')
  try:
   d={**document('a'),'file':str(outside),'sha256':hashlib.sha256(outside.read_bytes()).hexdigest()}
   with self.assertRaises(ValueError):self.knowledge([d]).read_source('a',0)
  finally:outside.unlink()
 def test_blank_scanned_pdf_is_not_claimed_readable(self):
  import hashlib
  from pypdf import PdfWriter
  source=self.root/'scan.pdf';writer=PdfWriter();writer.add_blank_page(width=100,height=100);writer.write(source)
  d={**document('a'),'file':'scan.pdf','sha256':hashlib.sha256(source.read_bytes()).hexdigest()}
  self.assertFalse(self.knowledge([d]).read_source('a',0)['readable'])
 def test_unreadable_source_is_not_labelled_successful_evidence(self):
  import io
  from office_knowledge_tools import serve
  self.knowledge([document('a')])
  context=self.root/'context.json';context.write_text('{}');audit=self.root/'audit.jsonl'
  request={'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'read_invoice_source','arguments':{'documentId':'a'}}}
  with patch('sys.stdin',io.StringIO(json.dumps(request)+'\n')),patch('sys.stdout',io.StringIO()),patch.object(Knowledge,'read_source',return_value={'readable':False,'issue':'Needs OCR'}):
   serve(self.root,context,audit)
  self.assertFalse(json.loads(audit.read_text())['ok'])
 def test_tonnage_from_other_source_is_flagged(self):
  k=self.knowledge([{**document('a'),'tonnage_source_sha256':'b'*64}])
  self.assertIn('different source hash',' '.join(k.docs[0]['flags']))
 def test_abn_checksum_does_not_confirm_the_holder(self):
  cache={'51824753556':{'entityName':'AUSTRALIAN TAXATION OFFICE','abnStatus':'Active from 01 Nov 1999','checkedAt':'2026-09-27T00:00:00Z'}}
  r=registry_lookup('51824753556','Example Person',cache);self.assertFalse(r['registeredHolderMatch']);self.assertEqual(r['status'],'review')
  r=registry_lookup('51824753556','Australian Taxation Office',cache);self.assertTrue(r['registeredHolderMatch'])
 def test_registry_parser_requires_the_requested_abn_and_named_fields(self):
  html='<title>Current details for ABN 51 824 753 556</title><table><tr><th>Entity name:</th><td>Example Company</td></tr><tr><th>ABN status:</th><td>Active from 01 Nov 1999</td></tr></table>'
  self.assertEqual(parse_registry(html,'51824753556')['entityName'],'Example Company')
  with self.assertRaises(ValueError):parse_registry(html,'11111111111')
  with self.assertRaises(ValueError):parse_registry('<title>Error</title>','51824753556')
 def test_registry_failure_is_unverified_not_a_false_match(self):
  with patch('urllib.request.urlopen',side_effect=OSError('offline')):
   r=registry_lookup('51824753556','Example Person',{})
  self.assertFalse(r['registeredHolderMatch']);self.assertIsNone(r['checkedAt']);self.assertEqual(r['status'],'review')
if __name__=='__main__':unittest.main()
