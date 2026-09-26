import { type Contractor } from './foundation';

export type ContactSource = {
  name: string; abn: string; emails: string[]; phones: string[]; names: string[]; abns: string[];
  issues: string[]; documentCount: number; documentIds: string[];
  sources: {documentId: string; url: string; invoiceNumber: string; workPeriod: string}[];
};
export type ContactImport = {
  id: string; status: 'pending'|'created'|'linked'|'dismissed'; sourceKey: string;
  source: ContactSource; workerId: string|null; reviewNote: string;
};
const normalized=(value:string)=>value.trim().replace(/\s+/g,' ').toLowerCase();
export function possibleContacts(source:ContactSource,people:Contractor[]) {
  // Hints only: a shared email or ABN never confirms that two people are identical.
  return people.filter(p=>normalized(p.fullName)===normalized(source.name)
    || (!!source.abn && p.abn.replace(/\s/g,'')===source.abn.replace(/\s/g,''))
    || (!!p.email && source.emails.some(e=>normalized(e)===normalized(p.email))));
}
export function gmailSourceUrl(value:string) {
  try { const url=new URL(value); return url.protocol==='https:' && url.hostname==='mail.google.com' && !url.username && !url.password ? url.href : null; }
  catch {return null;}
}
