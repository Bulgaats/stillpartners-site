import { z } from "zod";

export const STORAGE_KEY = "sp-daily-service-invoice:v1";
export const HISTORY_KEY = "sp-daily-service-invoice:history:v1";
export const MAX_LINES = 14;
const ascii = (max: number) => z.string().trim().min(1, "Required").max(max).regex(/^[\x20-\x7E]+$/, "Use English / Latin characters for the PDF.");
export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Enter a valid date.");
const money = z.string().regex(/^\d{1,7}(\.\d{1,2})?$/, "Use a positive amount with up to 2 decimals.").refine(v => Number(v) > 0, "Amount must be greater than zero.");
const tonnes = z.union([z.literal(""), z.string().regex(/^\d{1,5}(\.\d{1,3})?$/).refine(v => Number(v) > 0)]);
export const dailyServiceSchema = z.object({
  profile: z.object({
    fullName: ascii(70), abn: z.string().regex(/^\d[\d ]{9,16}\d$/, "Enter the 11-digit ABN.").refine(v => v.replace(/\s/g, "").length === 11, "Enter the 11-digit ABN."),
    phone: ascii(30), email: z.string().email().max(80).regex(/^[\x20-\x7E]+$/, "Use English / Latin characters for the PDF."), bankName: ascii(60),
    bsb: z.string().regex(/^\d{3}[- ]?\d{3}$/, "Enter a 6-digit BSB."), accountNumber: z.string().regex(/^\d{5,12}$/, "Enter 5–12 digits."), gstRegistered: z.boolean()
  }),
  invoiceNumber: ascii(40).regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dots, underscores or hyphens."),
  issueDate: dateString, dueDate: dateString,
  lines: z.array(z.object({id: z.string(), date: dateString, site: ascii(70), description: ascii(100), amount: money, tonnes, pricingMode: z.enum(["daily","tonnage"]).optional()})).min(1).max(MAX_LINES)
}).superRefine((v,ctx)=>{v.lines.forEach((line,i)=>{if(line.pricingMode==="tonnage"&&!line.tonnes)ctx.addIssue({code:"custom",path:["lines",i,"tonnes"],message:"Enter actual tonnes for tonnage pricing."});});}).refine(v => v.dueDate >= v.issueDate, {message:"Due date must not be before issue date.", path:["dueDate"]});
export type DailyServiceInvoice = z.infer<typeof dailyServiceSchema>;
export type ServiceLine = DailyServiceInvoice["lines"][number];
export type SavedServiceInvoice = { savedAt: string; invoice: DailyServiceInvoice };
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
export function blankLine(date = localDate()): ServiceLine {
  return {id: crypto.randomUUID(), date, site:"", description:"Reinforcement subcontract services", amount:"", tonnes:"", pricingMode:"tonnage"};
}
export function newInvoice(profile?: DailyServiceInvoice["profile"]): DailyServiceInvoice {
  const issueDate = localDate();
  const due = new Date(`${issueDate}T12:00:00`); due.setDate(due.getDate()+14);
  return {profile: profile ?? {fullName:"",abn:"",phone:"",email:"",bankName:"",bsb:"",accountNumber:"",gstRegistered:false}, invoiceNumber:`SINV-${issueDate.replaceAll("-", "")}-${crypto.randomUUID().slice(0,6).toUpperCase()}`,issueDate,dueDate:localDate(due),lines:[blankLine(issueDate)]};
}
export function calculateServiceInvoice(invoice: DailyServiceInvoice) {
  // Use explicitly selected pricing only. Never infer production from time. Legacy invoices remain daily charges.
  const subtotalCents = invoice.lines.reduce((sum,line) => sum + lineAmountCents(line), 0);
  const gstCents = invoice.profile.gstRegistered ? Math.round(subtotalCents / 10) : 0;
  const totalTonnesUnits = invoice.lines.reduce((sum,line) => sum + decimalUnits(line.tonnes, 3), 0);
  const dates = invoice.lines.map(line => line.date).filter(date => dateString.safeParse(date).success).sort();
  return {subtotal:subtotalCents/100, gst:gstCents/100, total:(subtotalCents+gstCents)/100, tonnes:totalTonnesUnits/1000, hasTonnes:invoice.lines.some(line=>line.tonnes!==""), periodStart:dates[0]??"",periodEnd:dates.at(-1)??""};
}
export function lineAmountCents(line: ServiceLine) {
  const cents=decimalUnits(line.amount,2);
  return line.pricingMode==="tonnage" ? Number((BigInt(cents)*BigInt(decimalUnits(line.tonnes,3))+BigInt(500))/BigInt(1000)) : cents;
}
export function decimalUnits(value: string, places: number) {
  if (!new RegExp(`^\\d{1,7}(\\.\\d{1,${places}})?$`).test(value)) return 0;
  const [whole, fraction=""] = value.split(".");
  return Number(whole)*10**places + Number(fraction.padEnd(places,"0"));
}
export const moneyText = (value:number) => new Intl.NumberFormat("en-AU", {style:"currency",currency:"AUD"}).format(value);
// Storage is untrusted: tolerate incomplete drafts, reject malformed or oversized objects.
export function restoreDraft(value: unknown): DailyServiceInvoice | null {
  if (!value || typeof value !== "object") return null;
  const v = value as DailyServiceInvoice;
  if (!v.profile || typeof v.profile !== "object" || typeof v.profile.gstRegistered !== "boolean") return null;
  if (!["fullName","abn","phone","email","bankName","bsb","accountNumber"].every(k => typeof v.profile[k as keyof typeof v.profile] === "string" && String(v.profile[k as keyof typeof v.profile]).length <= 200)) return null;
  if (![v.invoiceNumber,v.issueDate,v.dueDate].every(x => typeof x === "string" && x.length <= 100)) return null;
  if (!Array.isArray(v.lines) || !v.lines.length || v.lines.length > MAX_LINES) return null;
  if (!v.lines.every(line => line && (line.pricingMode===undefined||line.pricingMode==="daily"||line.pricingMode==="tonnage") && [line.id,line.date,line.site,line.description,line.amount,line.tonnes].every(x => typeof x === "string" && x.length <= 200))) return null;
  return v;
}
