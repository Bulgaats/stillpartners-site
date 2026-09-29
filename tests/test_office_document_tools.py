import base64,hashlib,io,json,pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).parents[1]/'scripts'))
from office_document_tools import read_document

class PrivateDocuments(unittest.TestCase):
 def test_scoped_fetch_and_pagination(self):
  raw=b'x'*17000
  def fetch(req,timeout):
   self.assertEqual(req.full_url,'https://www.stillpartners.net/api/office/documents/device')
   self.assertEqual(json.loads(req.data),{'id':'00000000-0000-4000-8000-000000000001'})
   return io.BytesIO(json.dumps({'filename':'test.txt','mime':'text/plain','bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'data':base64.b64encode(raw).decode()}).encode())
  r=read_document('.', '00000000-0000-4000-8000-000000000001',config={'token':'synthetic'},fetch=fetch)
  self.assertTrue(r['readable']);self.assertEqual(r['nextOffset'],16000);self.assertEqual(len(r['text']),16000)
 def test_rejects_paths_and_integrity_failure(self):
  with self.assertRaises(ValueError):read_document('.', '../private')
  def fetch(req,timeout):return io.BytesIO(json.dumps({'data':'eA==','bytes':1,'sha256':'0'*64}).encode())
  with self.assertRaises(ValueError):read_document('.', '00000000-0000-4000-8000-000000000001',config={'token':'synthetic'},fetch=fetch)
