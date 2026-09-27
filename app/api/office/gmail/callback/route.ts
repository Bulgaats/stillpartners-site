import {NextRequest,NextResponse} from 'next/server';
import {getSessionProfile} from '@/lib/auth/session';
import {createServiceRoleSupabaseClient} from '@/lib/supabase/server';
import {gmailConfig} from '@/lib/office/cloud/config';
import {seal,unseal,sameSecret} from '@/lib/office/cloud/crypto';
import {gmailGet,READ_SCOPE} from '@/lib/office/cloud/gmail';
export async function GET(request:NextRequest){
 const result=(value:string)=>{const r=NextResponse.redirect(new URL('/office/connections?'+value,request.url));r.cookies.delete({name:'office-gmail-state',path:'/api/office/gmail'});return r;};
 try{
  const session=await getSessionProfile(),config=gmailConfig();if(!session||session.profile.role!=='admin'||!config.ready)return result('error=access');
  const saved=unseal(request.cookies.get('office-gmail-state')?.value??'',session.userId);
  if(!sameSecret(saved.state,request.nextUrl.searchParams.get('state')??'')||saved.expires<Date.now())return result('error=state');
  const code=request.nextUrl.searchParams.get('code');if(!code)return result('error=consent');
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:process.env.OFFICE_GOOGLE_CLIENT_ID!,client_secret:process.env.OFFICE_GOOGLE_CLIENT_SECRET!,redirect_uri:config.redirect,grant_type:'authorization_code'}),signal:AbortSignal.timeout(15000),cache:'no-store'});
  if(!response.ok)return result('error=connection');
  const token=await response.json();if(!token.refresh_token||!String(token.scope).split(' ').includes(READ_SCOPE)||String(token.scope).split(' ').some(s=>s!==READ_SCOPE))return result('error=scope');
  const profile=await gmailGet(token.access_token,'profile');if(profile.emailAddress?.toLowerCase()!==config.account)return result('error=account');
  const db=createServiceRoleSupabaseClient();if(!db)return result('error=setup');
  const {error}=await db.from('office_cloud_mailboxes').upsert({owner_id:session.userId,account:config.account,encrypted_token:seal({refresh_token:token.refresh_token},session.userId),connected_at:new Date().toISOString()});
  return result(error?'error=save':'connected=1');
 }catch{return result('error=connection');}
}
