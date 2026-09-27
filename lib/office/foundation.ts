import type { ContactImport } from './contact-import';
export type Contractor = {
  id: string; fullName: string; phone: string; email: string; abn: string;
  group: "regular" | "occasional"; active: boolean;
};
export type OfficeRate = {
  id: string; workerId: string; clientId: string | null; kind: "contractor" | "client";
  hourlyRateCents: number; effectiveFrom: string; agreementNote: string; voidedAt: string | null;
};
export type OfficeEntry = {
  id: string; workerId: string; jobId: string; workDate: string; actualHours: number;
  contractorHours: number | null; clientHours: number | null; agreementNote: string;
  locked: boolean; updatedAt: string;
};
export type OfficeData = {
  finance: boolean; from: string; to: string; viewerId?:string;
  contractors: Contractor[];
  clients: {id: string; name: string; active: boolean}[];
  projects: {id: string; clientId: string; name: string; active: boolean}[];
  entries: OfficeEntry[]; rates: OfficeRate[]; contactImports?: ContactImport[];
};

export function contactText(person: Contractor) {
  return `Full Name: ${person.fullName}\nPhone: ${person.phone || "Not provided"}\nEmail: ${person.email || "Not provided"}`;
}
export function directory(people: Contractor[], query = "") {
  const term=query.trim().toLocaleLowerCase();
  return people.filter(p=>`${p.fullName} ${p.phone} ${p.email} ${p.abn}`.toLocaleLowerCase().includes(term))
    .sort((a,b)=>Number(b.active)-Number(a.active) || Number(a.group==="occasional")-Number(b.group==="occasional") || a.fullName.localeCompare(b.fullName,"en-AU"));
}
export function effectiveRate(rates: OfficeRate[], workerId: string, clientId: string, kind: OfficeRate["kind"], day: string) {
  const candidates=rates.filter(r=>!r.voidedAt && r.workerId===workerId && r.kind===kind && r.effectiveFrom<=day && (r.clientId===clientId || (kind==="contractor" && r.clientId===null)));
  // A client-specific agreement takes precedence over the contractor's base rate.
  return candidates.sort((a,b)=>Number(b.clientId===clientId)-Number(a.clientId===clientId) || b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
}
export function hoursAmountCents(hours: number, rateCents: number) {
  if (!Number.isFinite(hours) || hours<0 || hours>24 || Math.abs(hours*100-Math.round(hours*100))>1e-7 || !Number.isSafeInteger(rateCents) || rateCents<=0) throw new Error("Invalid hours or hourly rate");
  return Math.round(Math.round(hours*100)*rateCents/100);
}
export function validAbn(input: string) {
  const abn=input.replace(/\s/g,"");
  if(!/^\d{11}$/.test(abn))return false;
  const digits=abn.split("").map(Number);digits[0]-=1;
  return digits.reduce((sum,value,index)=>sum+value*[10,1,3,5,7,9,11,13,15,17,19][index],0)%89===0;
}
export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value+"T00:00:00Z")) && new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value;
}
