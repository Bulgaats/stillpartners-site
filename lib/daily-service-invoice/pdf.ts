import { calculateServiceInvoice, lineAmountCents, dailyServiceSchema, type DailyServiceInvoice } from "./model";

// Small dependency-free, browser-only PDF. Data is never posted to a server.
export function serviceInvoicePdf(input: DailyServiceInvoice): Uint8Array {
  const invoice = dailyServiceSchema.parse(input);
  const totals = calculateServiceInvoice(invoice);
  const rows = [...invoice.lines].sort((a,b) => a.date.localeCompare(b.date));
  const pages: string[] = [];
  const cash = (n:number) => `$${n.toFixed(2)}`;
  for (let offset=0; offset<rows.length; offset+=5) {
    const c:string[]=[];
    const txt = (value:string,x:number,y:number,size=10,bold=false) => c.push(`BT 0.09 0.13 0.20 rg /${bold?"F2":"F1"} ${size} Tf ${x} ${y} Td (${escape(value)}) Tj ET`);
    const line = (y:number) => c.push(`0.78 0.81 0.85 RG 0.5 w 42 ${y} m 553 ${y} l S`);
    const wrap = (value:string,x:number,y:number,limit:number,size=10,bold=false) => { split(value,limit).forEach((s,i)=>txt(s,x,y-i*13,size,bold)); };
    txt(invoice.profile.gstRegistered?"TAX INVOICE":"INVOICE",42,789,27,true);
    txt("Daily subcontract services",42,766,11); line(750);
    txt("FROM",42,730,9,true); txt("BILL TO",320,730,9,true);
    wrap(invoice.profile.fullName,42,712,39,10,true);
    txt(`ABN: ${invoice.profile.abn}`,42,680);
    txt(`Phone: ${invoice.profile.phone}`,42,664);
    wrap(invoice.profile.email,42,648,42,9);
    txt("Still Partners Pty Ltd",320,712,12,true);
    txt("ABN: 62 687 072 420",320,690);
    txt("work@stillpartners.net",320,674);
    txt(`Invoice: ${invoice.invoiceNumber}`,42,593,10,true);
    txt(`Issued: ${date(invoice.issueDate)}`,320,593);
    txt(`Service period: ${date(totals.periodStart)} - ${date(totals.periodEnd)}`,42,574);
    txt(`Due: ${date(invoice.dueDate)}`,320,574);
    txt("Date / project / service",42,536,10,true);txt("Tonnes",419,536,10,true);txt("Charge (AUD)",478,536,10,true);line(525);
    rows.slice(offset,offset+5).forEach((row,i)=>{
      const y=508-i*60;
      txt(date(row.date),42,y,9,true);
      wrap(row.site,113,y,46,9,true);
      wrap(row.description,113,y-26,57,8);
      txt(row.tonnes ? Number(row.tonnes).toFixed(3) : "-",419,y,9);
      txt(cash(lineAmountCents(row)/100),478,y,9);
      if(row.pricingMode==="tonnage") txt(`Rate: ${cash(Number(row.amount))}/t`,419,y-18,8);
      line(y-48);
    });
    const last=offset+5>=rows.length;
    if(last){
      txt("Service charges (excluding GST).",42,206,9);
      if(totals.hasTonnes) txt(`Recorded production: ${totals.tonnes.toFixed(3)} tonnes`,42,190,9);
      txt("Subtotal",360,206);txt(cash(totals.subtotal),478,206);
      txt(invoice.profile.gstRegistered?"GST (10%)":"GST (not registered)",360,187,9);txt(cash(totals.gst),478,187);
      txt("TOTAL AUD",360,163,11,true);txt(cash(totals.total),478,163,11,true);
      line(143); txt("PAYMENT DETAILS",42,123,9,true);
      wrap(`Bank: ${invoice.profile.bankName}`,42,105,65,9);
      txt(`BSB: ${invoice.profile.bsb}    Account: ${invoice.profile.accountNumber}`,42,75,9);
    } else txt("Continued on next page. Invoice total appears on the final page.",42,190,9);
    txt(`Page ${pages.length+1} of ${Math.ceil(rows.length/5)}`,470,35,8);
    pages.push(c.join("\n"));
  }
  const objects=["<< /Type /Catalog /Pages 2 0 R >>",`<< /Type /Pages /Kids [${pages.map((_,i)=>`${5+i*2} 0 R`).join(" ")}] /Count ${pages.length} >>`,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
  pages.forEach((content,i)=>{
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6+i*2} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  let body="%PDF-1.4\n";const offsets=[0];
  objects.forEach((object,i)=>{offsets.push(body.length);body+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const start=body.length;
  body+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return new TextEncoder().encode(body);
}
function escape(s:string) {return s.replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");}
function date(s:string){return s.split("-").reverse().join("/");}
function split(s:string,max:number):string[]{
  const lines:string[]=[];let rest=s;
  while(rest.length>max){let cut=rest.lastIndexOf(" ",max);if(cut<max/2)cut=max;lines.push(rest.slice(0,cut));rest=rest.slice(cut).trimStart();}
  lines.push(rest);return lines;
}
