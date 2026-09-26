"""Send only owner-approved frozen invoice mail; journal before sending, never auto-resend."""
import argparse,base64,datetime as dt,fcntl,hashlib,json,os,pathlib,re,sys,tempfile,urllib.request,urllib.error,uuid
from email.message import EmailMessage
from email.policy import SMTP
ACCOUNT='work@stillpartners.net'
READ='https://www.googleapis.com/auth/gmail.readonly'
SEND='https://www.googleapis.com/auth/gmail.send'
AUTH=pathlib.Path.home()/'Library/Application Support/StillPartnersInvoiceAssistant'
TOKEN=AUTH/'token.json'
CONFIG=pathlib.Path.home()/'Library/Application Support/Still Partners/office-device.json'
def atomic(path,value):
 path.parent.mkdir(parents=True,exist_ok=True);os.chmod(path.parent,0o700)
 fd,temp=tempfile.mkstemp(prefix='.office-mail-',dir=path.parent)
 try:
  with os.fdopen(fd,'w') as f:json.dump(value,f,ensure_ascii=False,allow_nan=False);f.flush();os.fsync(f.fileno())
  os.replace(temp,path);directory=os.open(path.parent,os.O_RDONLY)
  try:os.fsync(directory)
  finally:os.close(directory)
 finally:
  if os.path.exists(temp):os.unlink(temp)
def exchange(config,request):
 if config['url']!='https://wafebkzjotnyfqeloieo.supabase.co':raise ValueError('Unexpected Office server')
 payload=json.dumps({'p_token':config['token'],'p_request':request},allow_nan=False).encode()
 req=urllib.request.Request(config['url']+'/rest/v1/rpc/office_mail_exchange',data=payload,headers={'Content-Type':'application/json','apikey':config['anon_key'],'Authorization':'Bearer '+config['anon_key']})
 with urllib.request.urlopen(req,timeout=30) as response:return json.load(response)
def scope_ready():
 try:
  from google.oauth2.credentials import Credentials
  return Credentials.from_authorized_user_file(str(TOKEN)).has_scopes([READ,SEND])
 except Exception:return False
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):raise urllib.error.HTTPError(req.full_url,code,'Unexpected Gmail redirect',headers,fp)
def gmail_service():
 from google.oauth2.credentials import Credentials
 from google.auth.transport.requests import Request
 creds=Credentials.from_authorized_user_file(str(TOKEN))
 if not creds.has_scopes([READ,SEND]):raise ValueError('Gmail sending permission required')
 if creds.expired and creds.refresh_token:creds.refresh(Request())
 if not creds.valid:raise ValueError('Gmail authorization unavailable')
 opener=urllib.request.build_opener(NoRedirect())
 def request(path,payload=None):
  data=None if payload is None else json.dumps(payload,allow_nan=False).encode()
  req=urllib.request.Request('https://gmail.googleapis.com/gmail/v1/users/me/'+path,data=data,headers={'Authorization':'Bearer '+creds.token,'Content-Type':'application/json'})
  # One HTTP request, no automatic redirect, transport retry or send-token-refresh retry.
  with opener.open(req,timeout=60) as response:return json.load(response)
 if request('profile').get('emailAddress','').lower()!=ACCOUNT:raise ValueError('Gmail account mismatch')
 return lambda payload:request('messages/send',payload)
def immutable_file(path,data):
 path.parent.mkdir(parents=True,exist_ok=True);os.chmod(path.parent,0o700)
 if path.exists():
  if path.read_bytes()!=data:raise ValueError('Saved attachment differs from approved version')
  return
 with path.open('xb') as f:os.chmod(path,0o600);f.write(data);f.flush();os.fsync(f.fileno())
def message_bytes(job):
 mid=str(uuid.UUID(job['id']))
 for k in ('lease_id','invoice_id','client_id'):uuid.UUID(job[k])
 if not re.fullmatch(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}",job['recipient']):raise ValueError('Invalid approved recipient')
 if not 1<=len(job['subject'])<=200 or '\r' in job['subject'] or '\n' in job['subject'] or not 1<=len(job['body'])<=8000:raise ValueError('Invalid approved message')
 if not re.fullmatch('[a-f0-9]{64}',job['content_digest']):raise ValueError('Missing approval digest')
 parts=job['attachments']
 if len(parts)!=2 or len({a['name'] for a in parts})!=2:raise ValueError('Two distinct PDF attachments required')
 msg=EmailMessage(policy=SMTP);msg['From']=ACCOUNT;msg['To']=job['recipient'];msg['Subject']=job['subject'];msg['Message-ID']='<office-'+mid+'@stillpartners.net>';msg.set_content(job['body']);decoded=[]
 for a in parts:
  if not re.fullmatch(r'[A-Za-z0-9-]+\.pdf',a['name']):raise ValueError('Invalid attachment filename')
  data=base64.b64decode(a['data'],validate=True)
  if not data.startswith(b'%PDF-') or len(data)>2000000 or hashlib.sha256(data).hexdigest()!=a['sha256']:raise ValueError('Attachment checksum mismatch')
  decoded.append((a['name'],data));msg.add_attachment(data,maintype='application',subtype='pdf',filename=a['name'])
 return msg.as_bytes(),decoded
def journal_path(root,job_id):return root/'data/office_mail'/(str(uuid.UUID(job_id))+'.json')
def outcome(job,status,message,gmail_id=None):return {'action':'complete','id':job['id'],'lease_id':job['lease_id'],'status':status,'message':message,'gmail_id':gmail_id}
def archive_sent(record):
 if record['result']['status']!='sent':return
 prepared=pathlib.Path(record['prepared']);sent=prepared.parent.parent/'Sent'/prepared.name
 for path in prepared.iterdir():
  if path.is_file():immutable_file(sent/path.name,path.read_bytes())
def execute_job(root,job,send):
 path=journal_path(root,job['id'])
 if path.exists():
  record=json.loads(path.read_text())
  if record['content_digest']!=job['content_digest']:raise ValueError('Approval ID conflicts with local history')
  if not record.get('result'):record['result']=outcome(job,'unknown','Sending was interrupted. Check Gmail Sent; automatic resend is disabled.');atomic(path,record)
  return record
 record={'id':job['id'],'lease_id':job['lease_id'],'content_digest':job['content_digest'],'acked':False}
 try:
  raw,attachments=message_bytes(job)
  client=re.sub(r'[^A-Za-z0-9._-]+','_',job.get('client_name','Client')).strip('._')[:80] or 'Client'
  prepared=root/'Client_Invoices'/(client+'__'+job['client_id'])/job['invoice_id']/'Prepared'/job['id']
  for name,data in attachments:immutable_file(prepared/name,data)
  immutable_file(prepared/'approved-message.eml',raw);record['prepared']=str(prepared)
 except Exception:
  record['result']=outcome(job,'blocked','Approved email or attachment could not be verified on Mac. Review before preparing a new preview.');atomic(path,record);return record
 record['attempt_started']=dt.datetime.now(dt.timezone.utc).isoformat();atomic(path,record)
 try:
  response=send({'raw':base64.urlsafe_b64encode(raw).decode()});gmail_id=response.get('id')
  if not isinstance(gmail_id,str) or not re.fullmatch('[A-Za-z0-9_-]{1,200}',gmail_id):raise ValueError('No Gmail confirmation')
  record['result']=outcome(job,'sent','Gmail confirmed sending this exact approved email.',gmail_id)
 except Exception as exc:
  definite=getattr(exc,'code',getattr(getattr(exc,'resp',None),'status',None)) in (400,401,403,404,405,413,429)
  record['result']=outcome(job,'failed' if definite else 'unknown','Gmail rejected this request. Review the connection before preparing a new preview.' if definite else 'Delivery could not be confirmed. Check Gmail Sent; automatic resend is disabled.')
 atomic(path,record);return record
def acknowledge(config,path,record):
 archive_sent(record);response=exchange(config,record['result'])
 record['acked']=True;record['cloud_ack']='confirmed' if response.get('ok') else 'already_final_or_review';atomic(path,record)
def run(root,config_path=CONFIG):
 config=json.loads(config_path.read_text());folder=root/'data/office_mail';folder.mkdir(parents=True,exist_ok=True);os.chmod(folder,0o700)
 with (root/'data/office-mail.lock').open('a') as lock:
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:return {'status':'already_running'}
  for path in sorted(folder.glob('*.json')):
   record=json.loads(path.read_text())
   if record.get('acked'):continue
   if not record.get('result'):record['result']=outcome(record,'unknown','Mac restarted during sending. Check Gmail Sent; automatic resend is disabled.');atomic(path,record)
   acknowledge(config,path,record)
  ready=scope_ready();job=exchange(config,{'action':'claim','can_send':ready})
  if not job:return {'status':'idle','send_permission':ready}
  try:api=gmail_service()
  except Exception:
   record={'id':job['id'],'lease_id':job['lease_id'],'content_digest':job['content_digest'],'acked':False,'result':outcome(job,'blocked','Reconnect the correct Gmail account with sending permission before preparing a new preview.')};atomic(journal_path(root,job['id']),record)
  else:record=execute_job(root,job,api)
  acknowledge(config,journal_path(root,job['id']),record);return {'status':record['result']['status']}
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--root',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parent);parser.add_argument('--config',type=pathlib.Path,default=CONFIG);args=parser.parse_args()
 try:print(json.dumps(run(args.root,args.config)))
 except Exception as exc:print(json.dumps({'status':'error','error_type':type(exc).__name__,'message':'Mail worker paused. No automatic resend; check Office email status.'}));sys.exit(1)
