export type MacReceipt={event_id:string;status:'applied'|'blocked';file_state:string;message:string;updated_at:string};
export type MacDevice={id:string;name:string;last_seen:string|null;revoked:boolean};
export type MacSync={receipts:MacReceipt[];devices:MacDevice[]};
