"""Owner-run Google consent; preserves existing login until account and scopes verified."""
import datetime as dt,fcntl,json,os,pathlib,shutil,sys
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from office_mail_worker import AUTH,TOKEN,READ,SEND,ACCOUNT,atomic
def connect(root):
 with (root/'data/gmail_sync.lock').open('a') as lock:
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:raise ValueError('Gmail import is running. Wait for it to finish, then retry.')
  previous=Credentials.from_authorized_user_file(str(TOKEN))
  flow=InstalledAppFlow.from_client_config({'installed':{'client_id':previous.client_id,'client_secret':previous.client_secret,'auth_uri':'https://accounts.google.com/o/oauth2/auth','token_uri':'https://oauth2.googleapis.com/token','redirect_uris':['http://localhost']}},[READ,SEND])
  print('Choose work@stillpartners.net and approve Gmail read and send access. No email is sent by setup.')
  creds=flow.run_local_server(host='localhost',port=0,access_type='offline',prompt='consent',login_hint=ACCOUNT,timeout_seconds=300,authorization_prompt_message='Opening Google authorization in your browser.',success_message='Authorization received. Close this tab and return to Office.')
  if not set([READ,SEND]).issubset(set(creds.granted_scopes or creds.scopes or [])):raise ValueError('Both Gmail read and send permissions are required.')
  api=build('gmail','v1',credentials=creds,cache_discovery=False)
  if api.users().getProfile(userId='me').execute(num_retries=0)['emailAddress'].lower()!=ACCOUNT:raise ValueError('Wrong account. Existing authorization preserved.')
  backup=AUTH/('token-before-send-'+dt.datetime.now().strftime('%Y%m%d-%H%M%S')+'.json');shutil.copy2(TOKEN,backup);os.chmod(backup,0o600)
  atomic(TOKEN,json.loads(creds.to_json()))
  print('Sending permission saved. Every email still needs Approve & send in Office.')
if __name__=='__main__':
 try:connect(pathlib.Path(__file__).resolve().parent)
 except Exception as exc:print('Connection not completed. Existing authorization preserved. Reason: '+type(exc).__name__);sys.exit(1)
