import {NextResponse} from 'next/server';
import {randomBytes} from 'node:crypto';
import {getSessionProfile} from '@/lib/auth/session';
import {gmailConfig} from '@/lib/office/cloud/config';
import {seal} from '@/lib/office/cloud/crypto';
import {READ_SCOPE} from '@/lib/office/cloud/gmail';
export async function POST(request:Request){
 const session=await getSessionProfile();
 if(!session||session.profile.role!=='admin')return NextResponse.json({error:'Finance admin access required'},{status:403});
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Invalid origin'},{status:403});
 const config=gmailConfig();if(!config.ready)return NextResponse.redirect(new URL('/office/connections?error=setup',request.url),303);
 const state=randomBytes(32).toString('hex'),url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 Object.entries({client_id:process.env.OFFICE_GOOGLE_CLIENT_ID!,redirect_uri:config.redirect,response_type:'code',scope:READ_SCOPE,access_type:'offline',prompt:'consent',state,login_hint:config.account}).forEach(([k,v])=>url.searchParams.set(k,v));
 const response=NextResponse.redirect(url,303);
 response.cookies.set('office-gmail-state',seal({state,expires:Date.now()+600000},session.userId),{httpOnly:true,secure:true,sameSite:'lax',maxAge:600,path:'/api/office/gmail'});
 return response;
}
