import {z} from 'zod';
export const contractorNameInput=z.object({workerId:z.string().uuid(),fullName:z.string().min(1).max(160),shortName:z.string().trim().min(1).max(80),aliases:z.array(z.string().trim().min(1).max(80)).max(20),expectedVersion:z.number().int().min(0)}).strict();
export type ContractorNameInput=z.infer<typeof contractorNameInput>;
export function nameKey(v:string){return v.trim().replace(/\s+/g,' ').toLocaleLowerCase('en-AU');}
export function resolveContractorName<T extends {id:string;fullName:string;shortName?:string;aliases?:string[]}>(people:T[],query:string){const key=nameKey(query);return key?people.filter(p=>[p.fullName,p.shortName??'',...(p.aliases??[])].some(v=>nameKey(v)===key)):[];}
