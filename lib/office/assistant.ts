import {z} from 'zod';
export const assistantResponse=z.object({reply:z.string().max(8000),action:z.enum(['none','create_client','create_contractor','create_site']),name:z.string().max(160),email:z.string().max(254),phone:z.string().max(40),abn:z.string().max(32),group:z.enum(['regular','occasional']),clientId:z.string().max(36),address:z.string().max(240),section:z.enum(['today','contacts','clients','sites','contractor-invoices','history','none'])});
export type AssistantResponse=z.infer<typeof assistantResponse>;
export type AssistantTask={id:string;prompt:string;status:'queued'|'running'|'done'|'error';response:unknown;created_at:string;applied_id:string|null};
