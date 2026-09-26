import { redirect } from "next/navigation";
import {validDate} from "@/lib/office/foundation";
export default async function OperationsPage({searchParams}:{searchParams?:Promise<{from?:string;to?:string}>}) {
 const params=await searchParams;const query=new URLSearchParams();
 if(params?.from&&validDate(params.from))query.set("from",params.from);
 if(params?.to&&validDate(params.to))query.set("to",params.to);
 if(query.size)query.set("view","history");
 redirect("/office"+(query.size?"?"+query.toString():""));
}
