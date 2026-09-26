import {describe,it,expect} from 'vitest';
import {generateOfficeClientInvoicePdf,generateOfficeWorkSummaryPdf,type OfficeInvoicePdfInput} from '../lib/invoices/pdf';
const input:OfficeInvoicePdfInput={number:'Draft-example',status:'draft',clientName:'Example Client',clientAbn:'',issueDate:'2026-09-26',dueDate:'2026-10-10',periodStart:'2026-09-14',periodEnd:'2026-09-20',subtotalCents:80000,gstCents:8000,totalCents:88000,gstMode:'exclusive',rows:[{workDate:'2026-09-14',siteName:'Example Site',fullName:'Example Person',actualHours:8,clientHours:10}]};
describe('Office invoice and work summary PDFs',()=>{
 it('renders a draft with GST and no invented tonnage',()=>{const text=generateOfficeClientInvoicePdf(input).toString();expect(text).toContain('DRAFT - NOT ISSUED');expect(text).toContain('$880.00');expect(text.toLowerCase()).not.toContain('tonne');});
 it('keeps amounts/rates out of the work summary',()=>{const text=generateOfficeWorkSummaryPdf(input).toString();expect(text).toContain('Actual h');expect(text).toContain('Billable h');expect(text).not.toContain('$');expect(text).not.toContain('800.00');});
 it('paginates long summaries',()=>{const text=generateOfficeWorkSummaryPdf({...input,rows:Array.from({length:70},()=>({...input.rows[0],siteName:'A longer construction site name with several sections'}))}).toString();expect(text).toContain('Page 2');});
 it('preserves unsupported names by refusing a corrupt export',()=>expect(()=>generateOfficeWorkSummaryPdf({...input,rows:[{...input.rows[0],fullName:'Батбаяр'}]})).toThrow('Unicode PDF font'));
});
