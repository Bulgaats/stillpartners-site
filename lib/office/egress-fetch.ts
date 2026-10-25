/** Count streamed response bytes without copying/retaining payloads or logging URLs. */
export function measuredFetch(base:typeof fetch, report:(m:{endpoint:string;status:number;bytes:number})=>void):typeof fetch {
 return async(input,init)=>{
  const response=await base(input,init);
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  const match=url.pathname.match(/^\/rest\/v1\/(?:rpc\/)?([a-z_]+)$/);
  const endpoint=match?.[1]?.startsWith('office_')?match[1]:'other';
  if(endpoint==='other'||!response.body)return response;
  let bytes=0;
  const body=response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
   transform(chunk,controller){bytes+=chunk.byteLength;controller.enqueue(chunk);},
   flush(){report({endpoint,status:response.status,bytes});}
  }));
  return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
 };
}
