import {describe,it,expect} from 'vitest';
import {macSyncFreshness,type MacSync} from '../lib/office/mac-sync';
const now=Date.parse('2026-09-27T10:00:00Z');
const device=(at:string,revoked=false)=>({id:'test',name:'Test Mac',last_seen:at,revoked,health:{status:'ok' as const,last_success_at:at,last_attempt_at:at,stage:'complete',error_type:null,blocked:0,archive_errors:0}});
describe('Mac freshness does not mistake connectivity for completed work',()=>{
 it('requires a successful sync, not a recent ping',()=>{
  const d=device('2026-09-27T09:30:00Z');d.last_seen='2026-09-27T10:00:00Z';
  expect(macSyncFreshness({devices:[d],receipts:[]},now).stale).toBe(true);
 });
 it('accepts a recent success and ignores revoked devices',()=>{
  expect(macSyncFreshness({devices:[device('2026-09-27T09:56:00Z')],receipts:[]},now).stale).toBe(false);
  expect(macSyncFreshness({devices:[device('2026-09-27T09:56:00Z',true)],receipts:[]},now)).toEqual({linked:false,lastSuccess:null,stale:true});
 });
 it('treats missing or malformed success evidence as stale',()=>{
  expect(macSyncFreshness({devices:[device('not a date')],receipts:[]},now).stale).toBe(true);
  expect(macSyncFreshness({devices:[],receipts:[]} as MacSync,now).stale).toBe(true);
 });
});
