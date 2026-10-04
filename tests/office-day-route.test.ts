import {beforeEach,describe,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({session:vi.fn(),db:vi.fn(),save:vi.fn(),read:vi.fn(),invalidate:vi.fn()}));
vi.mock('@/lib/auth/session',()=>({getSessionProfile:mock.session}));
vi.mock('@/lib/supabase/server',()=>({createServerSupabaseClient:mock.db}));
vi.mock('@/lib/office/day-save',async()=>({...await vi.importActual('@/lib/office/day-save'),saveDayChanges:mock.save}));
vi.mock('@/lib/office/day-data',()=>({readOfficeDay:mock.read}));
vi.mock('next/cache',()=>({revalidatePath:mock.invalidate}));
import {GET,POST} from '../app/api/office/day/route';
const input={day:'2026-10-04',plans:[],work:[]};
function request(origin='https://office.test'){return new Request('https://office.test/api/office/day',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(input)});}
beforeEach(()=>{vi.clearAllMocks();mock.session.mockResolvedValue({profile:{role:'admin'}});mock.db.mockResolvedValue({});mock.save.mockResolvedValue({plans:[],work:[]});mock.read.mockResolvedValue({day:input.day,entries:[],plans:{plans:[]}});});
describe('Daily endpoint authority and receipts',()=>{
 it('denies cross-origin and anonymous changes before writing',async()=>{
  expect((await POST(request('https://elsewhere.test'))).status).toBe(403);
  mock.session.mockResolvedValue(null);expect((await POST(request())).status).toBe(403);expect(mock.save).not.toHaveBeenCalled();
 });
 it('does not expose finance hours to an operations reader',async()=>{
  mock.session.mockResolvedValue({profile:{role:'operations_admin'}});
  const response=await GET(new Request('https://office.test/api/office/day?day=2026-10-04'));
  expect(response.status).toBe(200);expect(mock.read).toHaveBeenCalledWith({},'2026-10-04',false);
  expect(response.headers.get('cache-control')).toContain('no-store');
 });
 it('retains confirmed saves if refreshing the day fails',async()=>{
  mock.save.mockResolvedValue({plans:[{site:'example',ok:true,message:'Saved'}],work:[]});mock.read.mockRejectedValue(new Error('offline'));
  const response=await POST(request());const result=await response.json();
  expect(response.status).toBe(200);expect(result.plans[0].ok).toBe(true);expect(result.snapshot).toBeNull();
  expect(mock.invalidate.mock.calls).toEqual([['/office'],['/operations']]);
 });
});
