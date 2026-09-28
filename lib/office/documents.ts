import {z} from 'zod';
import {validDate} from './foundation';
export const documentInput=z.object({
 id:z.string().uuid(),expectedVersion:z.number().int().min(0),title:z.string().trim().min(2).max(160),
 entityType:z.enum(['company','contractor','client']),entityId:z.string().uuid().or(z.literal('')),
 category:z.enum(['insurance','licence','white_card','cv','agreement','other']),
 sourceUrl:z.string().max(1000).refine(v=>v===''||safeDocumentUrl(v)!==null,'Use an HTTPS source link'),
 sourceNote:z.string().max(1000),notes:z.string().max(4000),expiresOn:z.string().refine(v=>v===''||validDate(v),'Use a valid expiry date'),
 expiryConfirmed:z.boolean(),status:z.enum(['active','archived'])
}).strict().superRefine((v,c)=>{
 if((v.entityType==='company')!==(v.entityId===''))c.addIssue({code:'custom',message:'Select the related contractor or client.'});
 if(!v.sourceUrl&&!v.sourceNote.trim())c.addIssue({code:'custom',message:'Add its email link or source location.'});
 if(v.expiryConfirmed&&!v.expiresOn)c.addIssue({code:'custom',message:'Enter the date before confirming expiry.'});
});
export type DocumentInput=z.infer<typeof documentInput>;
export type OfficeDocument={id:string;version:number;title:string;entity_type:DocumentInput['entityType'];entity_id:string|null;category:DocumentInput['category'];source_url:string;source_note:string;notes:string;expires_on:string|null;expiry_confirmed:boolean;status:'active'|'archived';updated_at:string};
export function safeDocumentUrl(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function documentExpiry(d:OfficeDocument,today:string){
 if(d.status==='archived'||!d.expires_on)return {status:'none' as const,days:null};
 if(!d.expiry_confirmed)return {status:'unverified' as const,days:null};
 const days=Math.round((Date.parse(d.expires_on+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
 return {status:days<0?'expired' as const:days<=30?'due' as const:'current' as const,days};
}
export function documentDraft(d?:OfficeDocument):DocumentInput{return d?{id:d.id,expectedVersion:d.version,title:d.title,entityType:d.entity_type,entityId:d.entity_id??'',category:d.category,sourceUrl:d.source_url,sourceNote:d.source_note,notes:d.notes,expiresOn:d.expires_on??'',expiryConfirmed:d.expiry_confirmed,status:d.status}:{id:crypto.randomUUID(),expectedVersion:0,title:'',entityType:'company',entityId:'',category:'other',sourceUrl:'',sourceNote:'',notes:'',expiresOn:'',expiryConfirmed:false,status:'active'};}
