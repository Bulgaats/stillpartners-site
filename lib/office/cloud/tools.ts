import {z} from 'zod';
import {createHash} from 'node:crypto';
import {reconcileInvoice} from '../reconciliation';
import {invoiceState,type InvoiceEvent} from '../invoice-events';
import type {OfficeData} from '../foundation';
import type {InvoiceSnapshot} from '../invoice-snapshot';
import {gmailGet,gmailToken,mailView,flattenParts,type GmailPart} from './gmail';
type Row=Record<string,unknown>;
export type ToolResult={data:unknown;content?:Row};
const collection=z.enum(['invoices','contractors','clients','sites','workRecords','agreedRates','contactReviews','companyMemory','workItems','documents','plannedWork']);
const str={type:'string'},num={type:'integer'};
function tool(name:string,description:string,properties:Row){return {type:'function',name,description,strict:true,parameters:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}};}
export const CLOUD_TOOLS=[
 tool('search_company_records','Search authorised records. Follow nextOffset for all matches. Dates and payments include coverage limits.',{collection:{type:'string',enum:collection.options},query:str,offset:num}),
 tool('read_company_record','Read one exact record by ID.',{collection:{type:'string',enum:collection.options},id:str}),
 tool('check_invoice','Compare imported contractor invoice with dated agreed rates and work records. Does not approve or mark paid.',{id:str}),
 tool('search_gmail','Search live work Gmail. Follow nextPageToken. Include self-addressed invoice emails; use explicit date bounds.',{query:str,pageToken:str}),
 tool('read_gmail_message','Read body, headers and attachment manifest; attachment text is not included.',{id:str}),
 tool('read_gmail_attachment','Read a PDF, supported image, text or CSV MIME part including inline images. Unsupported files are explicitly unread.',{messageId:str,partId:str})
];
export function recordPage(rows:Row[],query:string,offset:number){
 const matches=rows.filter(row=>JSON.stringify(row).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 return {total:matches.length,items:matches.slice(offset,offset+30),nextOffset:offset+30<matches.length?offset+30:null};
}
export class CloudTools{
 private token?:string;private attachmentBytes=0;
 constructor(private owner:string,private context:Row,private snapshot:InvoiceSnapshot|null,private events:InvoiceEvent[]){}
 private rows(name:z.infer<typeof collection>):Row[]{
  if(name==='invoices')return (this.snapshot?.documents??[]).map(d=>({...d,currentPayment:invoiceState(d,this.snapshot!.sourceDigest,this.events),snapshotExportedAt:this.snapshot!.exportedAt,paymentEvidence:'Owner-recorded cloud events plus Mac snapshot. Unknown does not mean unpaid.'}));
  const rows=this.context[name];return Array.isArray(rows)?rows as Row[]:[];
 }
 private async mail(path:string,params:Record<string,string>={}){this.token??=await gmailToken(this.owner);return gmailGet(this.token,path,params);}
 async execute(name:string,args:unknown):Promise<ToolResult>{
  if(name==='search_company_records'){
   const a=z.object({collection,query:z.string().max(500),offset:z.number().int().min(0).max(100000)}).strict().parse(args);
   return {data:{...recordPage(this.rows(a.collection),a.query,a.offset),capturedAt:this.context.capturedAt,workRange:this.context.workRange,snapshotExportedAt:this.snapshot?.exportedAt??null}};
  }
  if(name==='read_company_record'){
   const a=z.object({collection,id:z.string().min(1).max(200)}).strict().parse(args);
   return {data:this.rows(a.collection).find(row=>row.id===a.id)??{error:'Record not found in authorised data'}};
  }
  if(name==='check_invoice'){
   const {id}=z.object({id:z.string().min(1).max(200)}).strict().parse(args),doc=this.snapshot?.documents.find(d=>d.id===id);
   if(!doc||!this.snapshot)throw new Error('Imported invoice not found');
   const range=this.context.workRange as {from:string;to:string};
   const data={finance:true,from:range.from,to:range.to,contractors:this.context.contractors,clients:this.context.clients,projects:this.context.sites,entries:this.context.workRecords,rates:this.context.agreedRates} as OfficeData;
   const result=reconcileInvoice(doc,data,this.snapshot.documents);
   if(result.period&&(result.period.from<range.from||result.period.to>range.to))return {data:{status:'review',reason:'Invoice period exceeds available work coverage',workRange:range}};
   return {data:{...result,abnHolder:'Not verified by this cloud runtime',snapshotExportedAt:this.snapshot.exportedAt,workRange:range}};
  }
  const messageId=z.string().regex(/^[a-f0-9]{1,64}$/i);
  if(name==='search_gmail'){
   const a=z.object({query:z.string().min(1).max(1000),pageToken:z.string().max(1000)}).strict().parse(args);
   const result=await this.mail('messages',{q:a.query,maxResults:'50',includeSpamTrash:'true',...(a.pageToken?{pageToken:a.pageToken}:{})});
   return {data:{checkedAt:new Date().toISOString(),query:a.query,messages:result.messages??[],nextPageToken:result.nextPageToken??null,resultSizeEstimate:result.resultSizeEstimate??0,coverage:'This page contains IDs only. Read each message and attachment before claiming invoice contents.'}};
  }
  if(name==='read_gmail_message'){
   const {id}=z.object({id:messageId}).strict().parse(args);
   return {data:mailView(await this.mail('messages/'+id,{format:'full'}))};
  }
  if(name==='read_gmail_attachment'){
   const a=z.object({messageId,partId:z.string().regex(/^[0-9.]{0,40}$/)}).strict().parse(args);
   const message=await this.mail('messages/'+a.messageId,{format:'full'});
   const part=flattenParts(message.payload as GmailPart).find(p=>(p.partId??'')===a.partId);
   if(!part?.body)throw new Error('MIME part not found');
   const mime=part.mimeType??'';
   if(!['application/pdf','image/png','image/jpeg','image/webp','text/plain','text/csv'].includes(mime))return {data:{read:false,reason:'Unsupported attachment format: '+mime,filename:part.filename}};
   if((part.body.size??0)>8*1024*1024)throw new Error('Attachment unread: above 8 MB per-file limit');
   const encoded=part.body.data??(await this.mail('messages/'+a.messageId+'/attachments/'+encodeURIComponent(part.body.attachmentId??''))).data;
   if(typeof encoded!=='string')throw new Error('Attachment data unavailable');
   const bytes=Buffer.from(encoded,'base64url');this.attachmentBytes+=bytes.length;
   if(bytes.length>8*1024*1024||this.attachmentBytes>12*1024*1024)throw new Error('Attachment unread: per-request data limit reached; continue in another request');
   const source='https://mail.google.com/mail/u/0/#all/'+a.messageId;
   const evidence={read:true,source,filename:part.filename??'',partId:a.partId,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,meaning:'Source supplied to model; extraction is not independent verification'};
   if(mime.startsWith('text/'))return {data:{...evidence,text:bytes.toString('utf8').slice(0,60000),truncated:bytes.toString('utf8').length>60000}};
   const url='data:'+mime+';base64,'+bytes.toString('base64');
   return {data:evidence,content:mime==='application/pdf'?{type:'input_file',filename:part.filename||'invoice.pdf',file_data:url}:{type:'input_image',image_url:url,detail:'high'}};
  }
  throw new Error('Unsupported read tool');
 }
}
