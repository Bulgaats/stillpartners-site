import {createHash} from 'node:crypto';
export const OFFICE_FILE_LIMIT=3*1024*1024;
export const OFFICE_FILE_BUCKET='office-documents';
export function inspectOfficeFile(bytes:Buffer,filename:string,claimed:string){
 if(!bytes.length||bytes.length>OFFICE_FILE_LIMIT)throw new Error('Use a file up to 3 MB, or keep its original Gmail link.');
 let mime='';
 if(bytes.subarray(0,5).toString()==='%PDF-')mime='application/pdf';
 else if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';
 else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';
 else if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')mime='image/webp';
 else if(claimed==='text/plain'&&/\.txt$/i.test(filename)&&!bytes.includes(0))mime='text/plain';
 if(!mime)throw new Error('Use a PDF, PNG, JPEG, WebP or plain .txt document.');
 return {mime,filename:filename.replace(/[\r\n"\\/\x00-\x1f]/g,'_').slice(0,180)||'document',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export function fileHeaders(mime:string,filename:string,download=false){
 const safe=['application/pdf','image/png','image/jpeg','image/webp','text/plain'].includes(mime);
 return {'Content-Type':safe?mime:'application/octet-stream','Content-Disposition':`${!download&&safe?'inline':'attachment'}; filename="document"; filename*=UTF-8''${encodeURIComponent(filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"};
}
