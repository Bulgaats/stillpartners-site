import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function worker(){
 const handlers:Record<string,(e:any)=>void>={};const fetched:string[]=[];const puts:string[]=[];const deleted:string[]=[];
 const cache={addAll:async()=>{},put:async(r:any)=>{puts.push(r.url)}};
 const context={self:{location:{origin:'https://www.stillpartners.net'},addEventListener:(name:string,fn:any)=>handlers[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},URL,Response,fetch:async(r:any)=>{fetched.push(r.url);return new Response('ok')},caches:{open:async()=>cache,match:async()=>undefined,keys:async()=>['still-partners-v3-cache-reset','another-app'],delete:async(k:string)=>{deleted.push(k)}}};
 vm.runInNewContext(readFileSync('public/sw.js','utf8'),context);return {handlers,fetched,puts,deleted};
}
describe('Office private data stays out of offline cache',()=>{
 it('does not cache authenticated navigation',async()=>{const w=worker();let response:Promise<any>|undefined;w.handlers.fetch({request:{method:'GET',url:'https://www.stillpartners.net/office',mode:'navigate'},respondWith:(p:any)=>response=p});await response;expect(w.fetched).toHaveLength(1);expect(w.puts).toEqual([])});
 it('leaves private API and RSC requests to the network',()=>{const w=worker();for(const path of ['/api/office','/office?_rsc=123'])w.handlers.fetch({request:{method:'GET',url:'https://www.stillpartners.net'+path,mode:'cors'},respondWith:()=>{throw Error('Private request intercepted')}});expect(w.puts).toEqual([])});
 it('removes legacy private caches without deleting unrelated app caches',async()=>{const w=worker();let p:Promise<any>|undefined;w.handlers.activate({waitUntil:(v:any)=>p=v});await p;expect(w.deleted).toEqual(['still-partners-v3-cache-reset'])});
});
