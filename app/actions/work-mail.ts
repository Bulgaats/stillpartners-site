'use server';
import {getSessionProfile} from '@/lib/auth/session';
import {searchHostedMail,readHostedMail} from '@/lib/office/hosted-mail';
async function owner(){const s=await getSessionProfile();if(!s||s.profile.role!=='admin')throw new Error('Finance admin access required');return s.userId;}
export async function searchWorkMail(query:string,pageToken=''){
 return searchHostedMail(await owner(),query,pageToken);
}
export async function readWorkMail(id:string){return readHostedMail(await owner(),id);}
