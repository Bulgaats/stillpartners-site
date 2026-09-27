import {after,NextResponse} from 'next/server';
import {z} from 'zod';
import {getSessionProfile} from '@/lib/auth/session';
import {cloudConfig} from '@/lib/office/cloud/config';
import {processCloudTask} from '@/lib/office/cloud/dispatch';
export const maxDuration=300;
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Invalid origin'},{status:403});
 const session=await getSessionProfile();if(!session||session.profile.role!=='admin')return NextResponse.json({error:'Finance admin access required'},{status:403});
 const body=z.object({id:z.string().uuid()}).safeParse(await request.json().catch(()=>null));if(!body.success)return NextResponse.json({error:'Invalid request'},{status:400});
 if(!cloudConfig().enabled)return NextResponse.json({error:'Cloud execution is not activated; see Cloud connections'},{status:503});
 after(async()=>{try{await processCloudTask(session.userId,body.data.id);}catch{/* Leave durable queue available for recovery; do not log secrets. */}});
 return NextResponse.json({accepted:true},{status:202});
}
