import {redirect} from 'next/navigation';
import {getSessionProfile} from '@/lib/auth/session';
import {createServiceRoleSupabaseClient} from '@/lib/supabase/server';
import {gmailConfig} from '@/lib/office/cloud/config';
import {WorkMail} from '@/components/office/work-mail';
import '@/components/office/ember.css';
export const dynamic='force-dynamic';
export default async function MailPage(){const s=await getSessionProfile();if(!s||s.profile.role!=='admin')redirect('/office');const db=createServiceRoleSupabaseClient();const {data}=db?await db.from('office_cloud_mailboxes').select('account').eq('owner_id',s.userId).maybeSingle():{data:null};return <main className="ember"><div className="ember-shell"><div className="ember-content"><a className="ember-link" href="/office">← Office</a><WorkMail connected={!!data&&gmailConfig().ready}/></div></div></main>;}
