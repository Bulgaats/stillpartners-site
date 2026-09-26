"""Install the approved-mail worker. Google sending consent remains an explicit owner step."""
import datetime as dt,os,pathlib,plistlib,shutil,subprocess,sys
LABEL='net.stillpartners.office-mail'
def install(root):
 if sys.platform!='darwin':raise RuntimeError('macOS required')
 root=pathlib.Path(root).resolve();source=pathlib.Path(__file__).resolve().parent
 gmail=root/'gmail_sync.py';text=gmail.read_text();old="Credentials.from_authorized_user_file(str(TOKEN),SCOPES)";new="Credentials.from_authorized_user_file(str(TOKEN))"
 if old in text:
  backup=root/'data/code_backups'/('gmail-before-send-'+dt.datetime.now().strftime('%Y%m%d-%H%M%S')+'.py');backup.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(gmail,backup)
  text=text.replace(old,new);text=text.replace("    if creds and creds.expired and creds.refresh_token:","    if creds and not creds.has_scopes(SCOPES):raise ValueError('Gmail read permission required. Reconnect with setup.')\n    if creds and creds.expired and creds.refresh_token:")
  gmail.write_text(text)
 elif new not in text:raise RuntimeError('Gmail importer version needs review before installation')
 for name in ('office_mail_worker.py','enable_gmail_send.py'):shutil.copy2(source/name,root/name)
 command=root/'ENABLE_GMAIL_SEND.command'
 command.write_text('#!/bin/bash\ncd -- "$(dirname -- "$0")" || exit 1\n./.venv/bin/python ./enable_gmail_send.py\nread -r -p "Press Return to close..."\n');os.chmod(command,0o700)
 agents=pathlib.Path.home()/'Library/LaunchAgents';agents.mkdir(parents=True,exist_ok=True);logs=root/'Logs';logs.mkdir(exist_ok=True);domain='gui/'+str(os.getuid());path=agents/(LABEL+'.plist')
 job={'Label':LABEL,'ProgramArguments':[str(root/'.venv/bin/python'),str(root/'office_mail_worker.py')],'WorkingDirectory':str(root),'StartInterval':60,'RunAtLoad':True,'ProcessType':'Background','StandardOutPath':str(logs/'office-mail.log'),'StandardErrorPath':str(logs/'office-mail-error.log'),'EnvironmentVariables':{'PATH':'/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin','PYTHONUNBUFFERED':'1','TZ':'Australia/Perth'}}
 result=subprocess.run(['/bin/launchctl','print',domain+'/'+LABEL],stdin=subprocess.DEVNULL,capture_output=True)
 if result.returncode==0:subprocess.run(['/bin/launchctl','bootout',domain+'/'+LABEL],stdin=subprocess.DEVNULL,check=True)
 with path.open('wb') as f:plistlib.dump(job,f)
 subprocess.run(['/bin/launchctl','bootstrap',domain,str(path)],stdin=subprocess.DEVNULL,check=True)
 print('Approved-mail worker installed. No messages send without Google permission and per-email approval.')
if __name__=='__main__':install(sys.argv[1])
