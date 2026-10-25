import {describe,it,expect,vi} from 'vitest';
import {RefreshGate} from '../lib/office/refresh-gate';
import {cachedSnapshot,rememberSnapshot} from '../lib/office/snapshot-cache';
import {measuredFetch} from '../lib/office/egress-fetch';
import {readFileSync} from 'node:fs';
describe('usage reductions',()=>{
 it('serializes overlap and performs a trailing read for changes during a request',async()=>{
  let release!:()=>void;let concurrent=0,max=0,calls=0;
  const read=async()=>{calls++;max=Math.max(max,++concurrent);if(calls===1)await new Promise<void>(r=>release=r);concurrent--;};
  const gate=new RefreshGate();const first=gate.run(read);const second=gate.run(read);gate.run(read);release();await Promise.all([first,second]);
  expect(calls).toBe(2);expect(max).toBe(1);
 });
 it('snapshot reuse is owner/digest scoped; a corrected digest misses',()=>{
  const snapshot={documents:[]} as any;rememberSnapshot('owner','v1',snapshot);
  expect(cachedSnapshot('owner','v1')).toBe(snapshot);expect(cachedSnapshot('other','v1')).toBeUndefined();expect(cachedSnapshot('owner','v2')).toBeUndefined();
 });
 it('counts consumed bytes without logging query, token or payload',async()=>{
  const sink=vi.fn();const base=vi.fn().mockResolvedValue(new Response('private body'));
  const fetcher=measuredFetch(base,sink);const response=await fetcher('https://example.invalid/rest/v1/office_invoice_snapshots?private=secret');
  expect(sink).not.toHaveBeenCalled();expect(await response.text()).toBe('private body');
  expect(sink).toHaveBeenCalledWith({endpoint:'office_invoice_snapshots',status:200,bytes:12});expect(JSON.stringify(sink.mock.calls)).not.toContain('secret');
 });
 it('has no idle chat interval or full snapshot count read',()=>{
  const chat=readFileSync('components/office/assistant-chat.tsx','utf8');expect(chat).not.toContain('setInterval');expect(chat).toContain('if(!active)return');
  const action=readFileSync('app/actions/assistant.ts','utf8');expect(action).not.toContain("select('exported_at,payload')");expect(action).toContain('documentCount:null');
 });
});
