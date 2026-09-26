export type InvoiceMail={id:string;invoice_id:string;recipient:string;subject:string;body:string;content_digest:string;status:'preview'|'queued'|'sending'|'sent'|'blocked'|'failed'|'unknown'|'cancelled';created_at:string;approved_at:string|null;gmail_id:string|null;message:string|null};
export type MailCapability={ready:boolean;checkedAt?:string|null;device?:string};
