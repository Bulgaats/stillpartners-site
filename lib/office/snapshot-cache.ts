import type {InvoiceSnapshot} from './invoice-snapshot';
// Source snapshots are append-only. Payment events/receipts NEVER use this cache.
const entries=new Map<string,InvoiceSnapshot>();
export function cachedSnapshot(owner:string,digest:string){return entries.get(`${owner}:${digest}`);}
export function rememberSnapshot(owner:string,digest:string,value:InvoiceSnapshot){
 if(entries.size>=4)entries.delete(entries.keys().next().value!);
 entries.set(`${owner}:${digest}`,value);
}
