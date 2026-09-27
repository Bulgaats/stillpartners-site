export function cloudConfig(env:NodeJS.ProcessEnv=process.env){
 const daily=Number(env.OFFICE_CLOUD_DAILY_REQUESTS);
 const missing=['OPENAI_API_KEY','OFFICE_CLOUD_MODEL','OFFICE_CLOUD_DAILY_REQUESTS','SUPABASE_SERVICE_ROLE_KEY'].filter(k=>!env[k]);
 if(!Number.isInteger(daily)||daily<1||daily>500)missing.push('valid daily request limit (1–500)');
 return {enabled:env.OFFICE_CLOUD_ENABLED==='true'&&missing.length===0,missing,model:env.OFFICE_CLOUD_MODEL??'',daily,effort:env.OFFICE_CLOUD_REASONING??'xhigh'};
}
export function gmailConfig(env:NodeJS.ProcessEnv=process.env){
 const missing=['OFFICE_GOOGLE_CLIENT_ID','OFFICE_GOOGLE_CLIENT_SECRET','OFFICE_TOKEN_KEY'].filter(k=>!env[k]);
 if(!/^[a-f0-9]{64}$/i.test(env.OFFICE_TOKEN_KEY??''))missing.push('32-byte encryption key');
 return {ready:missing.length===0,missing,redirect:'https://www.stillpartners.net/api/office/gmail/callback',account:'work@stillpartners.net'};
}
