import {z} from 'zod';
const row=z.object({actual:z.string().max(12),pay:z.string().max(12),bill:z.string().max(12),note:z.string().max(2000),adjust:z.boolean(),dirty:z.boolean(),expectedUpdatedAt:z.string().nullable()});
const file=z.object({version:z.literal(1),rows:z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}:[a-f0-9-]{36}:[a-f0-9-]{36}$/),row)});
export type WorkDraft=z.infer<typeof row>&{saved?:boolean;error?:string};
export function readWorkDrafts(raw:string|null):Record<string,WorkDraft>{try{const parsed=file.safeParse(JSON.parse(raw??''));return parsed.success?parsed.data.rows:{};}catch{return {};}}
export function writeWorkDrafts(rows:Record<string,WorkDraft>){return JSON.stringify({version:1,rows:Object.fromEntries(Object.entries(rows).filter(([,r])=>r.dirty).map(([key,r])=>[key,row.parse(r)]))});}
