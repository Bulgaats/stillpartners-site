import datetime as dt,pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).parents[1]/'scripts'))
from office_context import from_export,TABLES
class ContextRefresh(unittest.TestCase):
 def source(self):return {'exported_at':'2026-09-29T00:00:00Z','tables':{k:[] for k in TABLES}}
 def test_current_context_keeps_distinct_hours_and_excludes_bank_data(self):
  source=self.source();t=source['tables'];t['workers']=[{'id':'w','full_name':'Synthetic Example','bank_account':'private','email':'example@example.invalid'}]
  t['office_contractor_names']=[{'worker_id':'w','short_name':'Short','aliases':['Nickname'],'version':2}]
  t['work_entries']=[{'id':'e','worker_id':'w','job_id':'j','work_date':'2026-09-28','hours':8}]
  t['office_work_adjustments']=[{'work_entry_id':'e','contractor_hours':10,'client_hours':12,'agreement_note':'Approved exception'}]
  result=from_export(source,{'conversation':['retained'],'unrelated':'retained'},dt.datetime.fromisoformat(source['exported_at']))
  self.assertEqual(result['workRecords'][0]['actualHours'],8);self.assertEqual(result['workRecords'][0]['contractorHours'],10);self.assertEqual(result['workRecords'][0]['clientHours'],12)
  self.assertNotIn('bank_account',str(result));self.assertEqual(result['contractors'][0]['shortName'],'Short');self.assertEqual(result['conversation'],['retained'])
 def test_plans_remain_expectations_with_exact_site_and_blank_hours(self):
  source=self.source();t=source['tables']
  t['workers']=[{'id':'w','full_name':'Synthetic Example'}]
  t['jobs']=[{'id':'j','client_id':'c','site_name':'Synthetic site','location':'Example address'}]
  t['office_site_plans']=[{'id':'p','job_id':'j','work_date':'2026-09-29','reminder_time':'17:00:00','note':''}]
  t['office_site_plan_people']=[{'plan_id':'p','worker_id':'w','active':True}]
  t['work_entries']=[{'id':'other','worker_id':'w','job_id':'elsewhere','work_date':'2026-09-29','hours':8}]
  result=from_export(source,{},dt.datetime.fromisoformat(source['exported_at']))
  self.assertIsNone(result['plannedWork'][0]['people'][0]['hours'])
  t['work_entries'].append({'id':'exact','worker_id':'w','job_id':'j','work_date':'2026-09-29','hours':0})
  result=from_export(source,{},dt.datetime.fromisoformat(source['exported_at']))
  self.assertEqual(result['plannedWork'][0]['people'][0]['hours'],0)
  self.assertEqual(result['plannedWork'][0]['people'][0]['entryId'],'exact')
 def test_incomplete_or_stale_export_is_not_current(self):
  source=self.source();source['tables'].pop('office_rates')
  with self.assertRaises(ValueError):from_export(source,{},dt.datetime.fromisoformat(source['exported_at']))
  source=self.source()
  with self.assertRaises(ValueError):from_export(source,{},dt.datetime(2026,9,30,tzinfo=dt.timezone.utc))
if __name__=='__main__':unittest.main()
