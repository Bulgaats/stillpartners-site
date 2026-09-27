export type MacReceipt={event_id:string;status:'applied'|'blocked';file_state:string;message:string;updated_at:string};
export type MacHealth={status:'ok'|'error';last_attempt_at:string;last_success_at:string|null;stage:string|null;error_type:string|null;blocked:number;archive_errors:number;backup_error?:boolean;backup_at?:string|null;backup_off_device?:boolean};
export type MacDevice={id:string;name:string;last_seen:string|null;revoked:boolean;health?:MacHealth|null};
export type MacSync={receipts:MacReceipt[];devices:MacDevice[]};
