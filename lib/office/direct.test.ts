import {describe,it,expect} from 'vitest';
import {directFromPrompt,directRequest,directReply} from './direct';
import {inspectOfficeFile,fileHeaders} from './document-files';
describe('Mac-independent read routing',()=>{
 it('routes exact read requests and aliases without treating a multi-action request as completed',()=>{
  expect(directFromPrompt('сүүлийн имэйлүүдийг үзүүл')?.kind).toBe('mail');
  expect(directFromPrompt('Example-ийн сүүлийн инвойсыг харуул')?.query).toBe('Example');
  expect(directFromPrompt('/invoices Example Person')?.kind).toBe('invoices');
  expect(directFromPrompt('show invoices for Example')?.query).toBe('Example');
  expect(directFromPrompt('show invoices and pay them')).toBeNull();
  expect(directFromPrompt('Check my email then send a reply')).toBeNull();
 });
 it('rejects invalid or reversed dates and arbitrary read targets',()=>{
  for(const v of [{kind:'work',from:'2026-02-30'},{kind:'work',from:'2026-09-30',to:'2026-09-01'},{kind:'message',id:'https://private.invalid'},{kind:'pay',id:'x'}])expect(directRequest.safeParse(v).success).toBe(false);
 });
 it('all direct results are read-only with no apply-able proposal',()=>{const r=directReply({request:directRequest.parse({kind:'work'}),title:'Test',rows:[],total:0,nextCursor:null,checkedAt:'now',coverage:'test'});expect(r.action).toBe('none');});
});
describe('private file handling',()=>{
 it('sniffs bytes rather than trusting the submitted filename or MIME',()=>{
  expect(()=>inspectOfficeFile(Buffer.from('<script>bad</script>'),'fake.pdf','application/pdf')).toThrow();
  expect(inspectOfficeFile(Buffer.from('%PDF-1.7\nsynthetic'),'test.pdf','text/html').mime).toBe('application/pdf');
  expect(inspectOfficeFile(Buffer.from('synthetic'),'note.txt','text/plain').sha256).toHaveLength(64);
 });
 it('rejects oversized/empty copies and never serves active HTML inline',()=>{
  expect(()=>inspectOfficeFile(Buffer.alloc(3*1024*1024+1),'big.pdf','application/pdf')).toThrow();
  expect(()=>inspectOfficeFile(Buffer.alloc(0),'empty.txt','text/plain')).toThrow();
  expect(fileHeaders('text/html','test.html')['Content-Disposition']).toContain('attachment;');
  expect(fileHeaders('application/pdf','safe.pdf')['Cache-Control']).toBe('private, no-store');
  expect(fileHeaders('application/pdf','safe.pdf')['Content-Security-Policy']).toContain('sandbox');
 });
});
