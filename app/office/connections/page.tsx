import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getSessionProfile} from '@/lib/auth/session';
import {createServiceRoleSupabaseClient} from '@/lib/supabase/server';
import {cloudConfig,gmailConfig} from '@/lib/office/cloud/config';
export const dynamic='force-dynamic';
export default async function Connections({searchParams}:{searchParams:Promise<{error?:string;connected?:string;disconnected?:string}>}){
 const session=await getSessionProfile();if(!session||session.profile.role!=='admin')redirect('/office');
 const ai=cloudConfig(),gmail=gmailConfig(),db=createServiceRoleSupabaseClient();
 const {data:mail}=db?await db.from('office_cloud_mailboxes').select('account,connected_at').eq('owner_id',session.userId).maybeSingle():{data:null};
 const query=await searchParams;
 return <main style={{maxWidth:720,margin:'auto',padding:'32px 20px'}}><Link href="/office">← Back to Office</Link><h1>Cloud connections</h1>
 <p>Bobby can run on the server while your Mac is off after these connections are activated.</p>
 {query.error&&<p role="alert">Connection was not completed ({query.error}). Your existing Mac connection is unchanged. Check the setup and try again.</p>}
 {query.connected&&<p role="status">Work Gmail connected for read-only access.</p>}
 {query.disconnected&&<p role="status">Cloud Gmail connection removed. Your Mac connection is unchanged.</p>}
 <h2>Cloud assistant: {ai.enabled?'Enabled':'Not activated'}</h2><p>{ai.enabled?'New chats use the configured cloud model. Existing Mac requests keep their original route.':'Requests currently continue using your Mac. Server API access, a model and an owner-approved usage limit must be configured before cloud execution starts.'}</p>
 <p>AI API usage is separate from the Mac Codex login. Set the provider project’s budget before enabling. Never paste keys into chat.</p>
 <h2>Work Gmail: {mail?'Connected':gmail.ready?'Ready to connect':'Setup required'}</h2>
 <p>Connecting permits the hosted Office app to read work@stillpartners.net. A refresh token is encrypted before database storage. Requested email text and supported attachments can be sent to the configured AI service for analysis. Incoming original files remain in Gmail and are filed on your Mac when it reconnects. This connection cannot send, delete or change mail.</p>
 <form method="post" action="/api/office/gmail/connect"><button disabled={!gmail.ready}>{mail?'Reconnect work Gmail':'Connect work Gmail (read only)'}</button></form>
 <form method="post" action="/api/office/gmail/disconnect"><button disabled={!mail}>Disconnect cloud Gmail</button></form>
 <h2>Current delivery scope</h2><p>Cloud chat searches saved company records and invoice metadata. A connected mailbox adds live email reads and supported attachment analysis. Updating the imported invoice register, local filing and approved outgoing email still use the Mac worker. No automatic cloud monitoring is activated by this page.</p>
 </main>;
}
