import hashlib,json,pathlib,tempfile,unittest,zipfile
from office_backup import create_backup,verify_bundle
class BackupTests(unittest.TestCase):
 def test_restore_verifies_sources_and_cash_ledger_without_credentials(self):
  with tempfile.TemporaryDirectory() as t:
   root=pathlib.Path(t)/'app';(root/'data').mkdir(parents=True);(root/'doc.txt').write_text('original')
   (root/'token.json').write_text('must not export')
   (root/'data/register.json').write_text(json.dumps({'documents':[{'id':'d','file':'doc.txt','sha256':hashlib.sha256(b'original').hexdigest()}],'payments':[]}))
   r=create_backup(root,pathlib.Path(t)/'backups');self.assertEqual(verify_bundle(r['file'])['documents'],1)
   with zipfile.ZipFile(r['file']) as z:self.assertNotIn('token.json',z.namelist());self.assertEqual(z.read('doc.txt'),b'original')
   with zipfile.ZipFile(r['file'],'a') as z:z.writestr('doc.txt',b'bad')
   with self.assertRaises(ValueError):verify_bundle(r['file'])
 def test_refuses_changed_original(self):
  with tempfile.TemporaryDirectory() as t:
   root=pathlib.Path(t)/'app';(root/'data').mkdir(parents=True);(root/'doc.txt').write_text('changed');(root/'data/register.json').write_text(json.dumps({'documents':[{'file':'doc.txt','sha256':'0'*64}]}))
   with self.assertRaises(ValueError):create_backup(root,pathlib.Path(t)/'backups')
