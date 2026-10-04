import {z} from 'zod';
import {NextResponse} from 'next/server';
import {revalidatePath} from 'next/cache';
import {getSessionProfile} from '@/lib/auth/session';
import {canAccessOperations} from '@/lib/auth/roles';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {daySaveInput,saveDayChanges} from '@/lib/office/day-save';
import {readOfficeDay} from '@/lib/office/day-data';
export const maxDuration=60;
export async function POST(request:Request){
 const started=performance.now();
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Invalid origin'},{status:403});
 const session=await getSessionProfile();
 if(!session||!canAccessOperations(session.profile.role))return NextResponse.json({error:'Operations access required'},{status:403});
 const input=daySaveInput.safeParse(await request.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:input.error.issues[0].message},{status:400});
 const db=await createServerSupabaseClient();
 try{
  const result=await saveDayChanges(db,input.data);
  // Route invalidation does not re-render the entire /office page in this response.
  // Acknowledged mutations stay distinct from a failed read-back.
  if(result.plans.some(p=>p.ok)||result.work.some(w=>w.ok)){revalidatePath('/office');revalidatePath('/operations');}
  let snapshot=null;
  try{snapshot=await readOfficeDay(db,input.data.day,session.profile.role==='admin');}catch{/* Retain receipts; client blocks editing until the day can refresh. */}
  return NextResponse.json({...result,snapshot},{headers:{'Cache-Control':'no-store','Server-Timing':`office-day;dur=${Math.round(performance.now()-started)}`}});
 }catch{return NextResponse.json({error:'Save could not be confirmed. Your drafts are kept. Retry safely.'},{status:503});}
}

export async function GET(request:Request){
 const started=performance.now(),day=new URL(request.url).searchParams.get('day');
 if(!z.string().date().safeParse(day).success)return NextResponse.json({error:'Select a valid day'},{status:400});
 const session=await getSessionProfile();
 if(!session||!canAccessOperations(session.profile.role))return NextResponse.json({error:'Operations access required'},{status:403});
 try{return NextResponse.json(await readOfficeDay(await createServerSupabaseClient(),day!,session.profile.role==='admin'),{headers:{'Cache-Control':'private, no-store','Server-Timing':`office-day;dur=${Math.round(performance.now()-started)}`}});}
 catch{return NextResponse.json({error:'This day could not load. Retry before editing.'},{status:503});}
}
