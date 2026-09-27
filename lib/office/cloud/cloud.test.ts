import {describe,it,expect,vi,afterEach} from 'vitest';
import {cloudConfig} from './config';
import {seal,unseal} from './crypto';
import {recordPage,CloudTools,CLOUD_TOOLS} from './tools';
import {mailView} from './gmail';
import {runCloudAssistant} from './runtime';
const answer={reply:'Found the records.',action:'none',name:'',email:'',phone:'',abn:'',group:'regular',clientId:'',address:'',periodStart:'',periodEnd:'',issueDate:'',dueDate:'',gstMode:'exclusive',section:'none',contractors:[],companyRecord:null};
afterEach(()=>vi.unstubAllEnvs());
describe('Cloud boundaries',()=>{
 it('requires explicit activation, a key/model and a finite configured limit',()=>{
  const env={SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',OPENAI_API_KEY:'test',OFFICE_CLOUD_MODEL:'gpt-6-astra',OFFICE_CLOUD_DAILY_REQUESTS:'40'};
  expect(cloudConfig(env).enabled).toBe(false);
  expect(cloudConfig({...env,OFFICE_CLOUD_ENABLED:'true'}).enabled).toBe(true);
  expect(cloudConfig({...env,OFFICE_CLOUD_ENABLED:'true',OFFICE_CLOUD_DAILY_REQUESTS:'NaN'}).enabled).toBe(false);
 });
 it('encrypts tokens, binds them to the owner and rejects tampering',()=>{
  vi.stubEnv('OFFICE_TOKEN_KEY','ab'.repeat(32));const encrypted=seal({refresh_token:'synthetic-token'},'owner-a');
  expect(encrypted).not.toContain('synthetic-token');expect(unseal(encrypted,'owner-a')).toEqual({refresh_token:'synthetic-token'});
  expect(()=>unseal(encrypted,'owner-b')).toThrow();
  const parts=encrypted.split('.');parts[2]=(parts[2][0]==='a'?'b':'a')+parts[2].slice(1);expect(()=>unseal(parts.join('.'),'owner-a')).toThrow();
 });
 it('pages every match with an explicit completion marker',()=>{
  const rows=Array.from({length:61},(_,i)=>({id:String(i),name:'Contractor'}));
  const a=recordPage(rows,'contractor',0),b=recordPage(rows,'contractor',a.nextOffset!),c=recordPage(rows,'contractor',b.nextOffset!);
  expect([...a.items,...b.items,...c.items]).toHaveLength(61);expect(c.nextOffset).toBe(null);
 });
 it('keeps self-addressed email and explicitly unread attachment manifests',()=>{
  const mail=mailView({id:'abc',threadId:'def',internalDate:'1700000000000',payload:{headers:[{name:'From',value:'work@stillpartners.net'},{name:'To',value:'work@stillpartners.net'}],parts:[{partId:'0',mimeType:'text/plain',body:{data:Buffer.from('Invoice attached').toString('base64url')}},{partId:'1',filename:'invoice.pdf',mimeType:'application/pdf',body:{attachmentId:'x',size:200}}]}});
  expect(mail.from).toBe(mail.to);expect(mail.body).toBe('Invoice attached');expect(mail.attachments[0].read).toBe(false);
 });
 it('rejects unsupported or arbitrary write tools',async()=>{
  const tools=new CloudTools('owner',{},null,[]);
  await expect(tools.execute('send_email',{})).rejects.toThrow('Unsupported');
  expect(CLOUD_TOOLS.some(t=>/send|delete|paid/.test(t.name))).toBe(false);
 });
 it('carries tool results forward and validates the final proposal without writing',async()=>{
  const execute=vi.fn().mockResolvedValue({data:{total:1,items:[{id:'one'}],nextOffset:null}});
  const payloads:Record<string,unknown>[]=[];
  const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{payloads.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify(payloads.length===1?{status:'completed',output:[{type:'function_call',name:'search_company_records',arguments:'{"collection":"contractors","query":"","offset":0}',call_id:'call-1'}]}:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answer)}]}]}));}) as unknown as typeof fetch;
  const result=await runCloudAssistant({prompt:'Show contacts',context:{},model:'gpt-6-astra',effort:'xhigh',key:'synthetic',execute,fetcher});
  expect(result.action).toBe('none');expect(execute).toHaveBeenCalledTimes(1);expect(result.evidence.totalCalls).toBe(1);
  expect(payloads.every(p=>p.store===false)).toBe(true);
  expect(JSON.stringify(payloads[1].input)).toContain('function_call_output');expect(payloads[0].model).toBe('gpt-6-astra');
 });
 it('rejects an invalid or incomplete model result',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({status:'incomplete',output:[]}))) as unknown as typeof fetch;
  await expect(runCloudAssistant({prompt:'test',context:{},model:'gpt-6-astra',effort:'xhigh',key:'synthetic',execute:vi.fn(),fetcher})).rejects.toThrow('incomplete');
 });
});
