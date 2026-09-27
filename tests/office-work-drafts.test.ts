import {describe,it,expect} from 'vitest';
import {readWorkDrafts,writeWorkDrafts} from '../lib/office/work-drafts';
const key='2026-09-28:00000000-0000-0000-0000-000000000001:00000000-0000-0000-0000-000000000002';
const row={actual:'8',pay:'8',bill:'10',note:'Client agreed minimum',adjust:true,dirty:true,expectedUpdatedAt:'2026-09-27T01:00:00Z'};
describe('Phone work recovery',()=>{
 it('retains entered hours and the original concurrency version across reload',()=>expect(readWorkDrafts(writeWorkDrafts({[key]:row}))[key]).toEqual(row));
 it('does not resubmit rows whose save was confirmed',()=>expect(readWorkDrafts(writeWorkDrafts({[key]:{...row,dirty:false,saved:true}}))).toEqual({}));
 it('rejects damaged or foreign storage formats',()=>{expect(readWorkDrafts('{')).toEqual({});expect(readWorkDrafts(JSON.stringify({version:2,rows:{[key]:row}}))).toEqual({});});
});
