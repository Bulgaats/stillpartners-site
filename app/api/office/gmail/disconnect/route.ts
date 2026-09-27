import {NextResponse} from 'next/server';
import {getSessionProfile} from '@/lib/auth/session';
import {createServiceRoleSupabaseClient} from '@/lib/supabase/server';
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Invalid origin'},{status:403});
 const session=await getSessionProfile();if(!session||session.profile.role!=='admin')return NextResponse.json({error:'Finance admin access required'},{status:403});
 const db=createServiceRoleSupabaseClient();if(!db)return NextResponse.json({error:'Cloud connection unavailable'},{status:503});
 const {error}=await db.from('office_cloud_mailboxes').delete().eq('owner_id',session.userId);
 return NextResponse.redirect(new URL('/office/connections?'+(error?'error=disconnect':'disconnected=1'),request.url),303);
}
