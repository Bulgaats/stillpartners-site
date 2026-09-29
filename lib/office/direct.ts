import {z} from 'zod';
import {validDate} from './foundation';

export const directKinds=['mail','message','contacts','documents','invoices','check_invoice','work','company'] as const;
const day=z.string().refine(v=>!v||validDate(v),'Use YYYY-MM-DD');
export const directRequest=z.object({kind:z.enum(directKinds),query:z.string().max(500).default(''),id:z.string().max(200).default(''),from:day.default(''),to:day.default(''),cursor:z.string().max(1000).default('')}).strict().superRefine((v,c)=>{
 if(v.from&&v.to&&v.from>v.to)c.addIssue({code:'custom',message:'The start date must come before the end date.'});
 if(['message','check_invoice'].includes(v.kind)&&!v.id)c.addIssue({code:'custom',message:'Select an exact source.'});
 if(v.kind==='message'&&!/^[a-f0-9]{1,64}$/i.test(v.id))c.addIssue({code:'custom',message:'Invalid email ID.'});
});
export type DirectRequest=z.infer<typeof directRequest>;
export type DirectRow={id:string;title:string;detail:string;source?:string;copy?:string;next?:DirectRequest;files?:{id:string;label:string;url:string}[]};
export type DirectResult={request:DirectRequest;title:string;checkedAt:string;coverage:string;rows:DirectRow[];total:number;nextCursor:string|null;body?:string;bodyFormat?:string;status?:string;issues?:string[]};
export const DIRECT_LABELS:Record<DirectRequest['kind'],string>={mail:'Work email',message:'Email',contacts:'Contractors',documents:'Documents',invoices:'Saved invoices',check_invoice:'Invoice comparison',work:'Work summary',company:'Company records'};

/** Intentionally narrow: ambiguous or multi-action text stays with the model.
 * Explicit controls use the same validated requests; no guessed writes occur. */
export function directFromPrompt(prompt:string):DirectRequest|null{
 const text=prompt.trim();
 const command=/^\/(mail|contacts|documents|invoices|work|company)(?:\s+([^\n]*))?$/i.exec(text);
 if(command)return directRequest.parse({kind:command[1].toLowerCase(),query:command[2]??''});
 const named=/^(?:show|find) (contacts|documents|invoices) (?:for )?([^\n.!?]{1,120})$/i.exec(text);
 if(named&&!/\b(and|then|send|pay|delete|approve)\b/i.test(named[2]))return directRequest.parse({kind:named[1].toLowerCase(),query:named[2]});
 const mongolian=/^([^\n.!?]{1,100}?)(?:-ийн|-ын|ийн|ын) (мэдээллийг|баримтуудыг|инвойсуудыг|сүүлийн инвойсыг) (?:харуул|үзүүл)[.!?]?$/i.exec(text);
 if(mongolian&&!/(тэгээд|бас|илгээ|төл)/i.test(mongolian[1]))return directRequest.parse({kind:mongolian[2]==='мэдээллийг'?'contacts':mongolian[2]==='баримтуудыг'?'documents':'invoices',query:mongolian[1].trim()});
 const exact:Record<string,DirectRequest['kind']>={
  'сүүлийн имэйлүүдийг үзүүл':'mail','сүүлийн имэйлүүдийг харуул':'mail','имэйл шалга':'mail',
  'show latest emails':'mail','latest emails':'mail','контракторуудын бүртгэлийг харуул':'contacts',
  'show contractors':'contacts','show documents':'documents','баримтуудыг харуул':'documents',
  'инвойсуудыг харуул':'invoices','show invoices':'invoices','өнөөдрийн ажлын бүртгэлийг харуул':'work'
 };
 const kind=exact[text.toLocaleLowerCase().replace(/[.!?。]+$/,'')];
 return kind?directRequest.parse({kind}):null;
}

export function directReply(result:DirectResult){return {
 reply:result.title,action:'none' as const,name:'',email:'',phone:'',abn:'',group:'regular' as const,clientId:'',address:'',section:'none' as const,
 direct:result,evidence:{toolCalls:[{tool:'office_'+result.request.kind,ok:true}],totalCalls:1,coverage:result.coverage}
};}
