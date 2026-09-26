import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('contact_export', Path(__file__).resolve().parents[1] / 'scripts/office_contact_export.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ContactExportTests(unittest.TestCase):
    def test_supplier_identity_conflicts_and_unassigned_documents_stay_separate(self):
        register = {'suppliers':[{'supplier_id':'a','name':'Example One','abn':'12345678901'}, {'supplier_id':'b','name':'Example Two','abn':'12345678901'}],
                    'documents':[{'id':'d1','supplier_id':'a','name':'Example One','sender':'generator@example.test','record_type':'invoice'}, {'id':'d2','supplier_id':None,'record_type':'test'}]}
        result = module.export_contacts(register)
        self.assertEqual(result['candidate_count'],3)
        self.assertEqual(result['unassigned_documents'],1)
        self.assertEqual(result['rows'][0]['source_data']['emails'],[])
        self.assertTrue(any('same ABN' in message for message in result['rows'][0]['source_data']['issues']))
        self.assertEqual(register['documents'][0]['sender'],'generator@example.test')
        self.assertEqual(result, module.export_contacts(register))

    def test_export_omits_payment_bank_and_rates(self):
        result=module.export_contacts({'suppliers':[], 'documents':[{'id':'d1','name':'Example Supplier','abn':'12345678901','email':'supplier@example.test','phone':'0400000000','amount':100,'paid':True,'bank_account':'secret','rate':999}]})
        source=result['rows'][0]['source_data']
        self.assertEqual(source['emails'],['supplier@example.test'])
        for key in ['amount','paid','bank_account','rate']:
            self.assertNotIn(key,source)

if __name__ == '__main__': unittest.main()
