import {beforeEach,describe,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({signIn:vi.fn(),from:vi.fn(),redirect:vi.fn((url:string)=>{throw new Error(url);})}));
vi.mock('next/navigation',()=>({redirect:mock.redirect}));
vi.mock('@/lib/supabase/server',()=>({createServerSupabaseClient:async()=>({auth:{signInWithPassword:mock.signIn},from:mock.from}),createServiceRoleSupabaseClient:()=>({from:mock.from})}));
vi.mock('@/lib/supabase/config',()=>({isSupabaseConfigured:()=>true,supabaseSetupMessage:''}));
vi.mock('@/lib/auth/contractor-link',()=>({completeInternalAuthForUser:vi.fn(),internalAuthFailureMessage:vi.fn()}));
import {login} from '../app/actions/auth';
beforeEach(()=>{vi.clearAllMocks();vi.spyOn(console,'info').mockImplementation(()=>{});});
describe('Login service failures',()=>{
 const input=()=>{const f=new FormData();f.set('email','fixture@example.invalid');f.set('password','fixture-only');return f;};
 it('does not blame credentials or read profiles on HTTP 402',async()=>{
  mock.signIn.mockResolvedValue({data:{},error:{status:402,message:'Usage limit'}});
  await expect(login(input())).rejects.toThrow('auth_service_usage_limit');
  expect(decodeURIComponent(mock.redirect.mock.calls[0][0])).toContain('Your password has not been verified');
  expect(mock.signIn).toHaveBeenCalledTimes(1);expect(mock.from).not.toHaveBeenCalled();
 });
 it('retains invalid-credentials behavior for a credential rejection',async()=>{
  mock.signIn.mockResolvedValue({data:{},error:{status:400,code:'invalid_credentials',message:'Invalid login credentials'}});
  await expect(login(input())).rejects.toThrow('invalid_credentials');expect(mock.from).not.toHaveBeenCalled();
 });
});
