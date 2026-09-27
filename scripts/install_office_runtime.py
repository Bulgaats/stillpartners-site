"""Replace the three interval jobs with one resident coordinator, preserving backups.
Refuses to interrupt in-flight workers. Does not change Gmail's weekly import job.
"""
import datetime as dt,fcntl,os,pathlib,plistlib,shutil,subprocess,sys
LABEL='net.stillpartners.office-runtime'
LEGACY=['net.stillpartners.office-'+name for name in ('assistant','mail','sync')]

def install(root):
 if sys.platform!='darwin':raise RuntimeError('macOS required')
 root=pathlib.Path(root).resolve();domain='gui/'+str(os.getuid());agents=pathlib.Path.home()/'Library/LaunchAgents'
 def launch(*args):return subprocess.run(['/bin/launchctl',*args],stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=15)
 with (root/'data/office-runtime-install.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  for label in [*LEGACY,LABEL]:
   state=launch('print',domain+'/'+label)
   if '\n\tpid = ' in state.stdout:raise RuntimeError('Worker is running; wait for a safe installation window: '+label)
  backup=root/'data/code_backups'/('runtime-'+dt.datetime.now().strftime('%Y%m%d-%H%M%S'));backup.mkdir(parents=True);os.chmod(backup,0o700)
  source=pathlib.Path(__file__).with_name('office_runtime.py');target=root/source.name
  if target.exists():shutil.copy2(target,backup/target.name)
  shutil.copy2(source,target)
  job={'Label':LABEL,'ProgramArguments':[str(root/'.venv/bin/python'),str(target)],'WorkingDirectory':str(root),'RunAtLoad':True,'KeepAlive':True,'ProcessType':'Standard','ThrottleInterval':15,'ExitTimeOut':120,'EnvironmentVariables':{'PATH':'/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin','PYTHONUNBUFFERED':'1','TZ':'Australia/Perth'},'StandardOutPath':str(root/'Logs/office-runtime.log'),'StandardErrorPath':str(root/'Logs/office-runtime-error.log')}
  path=agents/(LABEL+'.plist');moved=[]
  try:
   for label in LEGACY:
    old=agents/(label+'.plist')
    if launch('print',domain+'/'+label).returncode==0:
     result=launch('bootout',domain+'/'+label)
     if result.returncode:raise RuntimeError('Could not stop old timer: '+label)
    if old.exists():shutil.move(old,backup/old.name);moved.append(old)
   if path.exists():shutil.copy2(path,backup/path.name);launch('bootout',domain+'/'+LABEL)
   with path.open('wb') as f:plistlib.dump(job,f)
   for args in [('bootstrap',domain,str(path)),('kickstart',domain+'/'+LABEL)]:
    result=launch(*args)
    if result.returncode:raise RuntimeError('Runtime installation failed: '+result.stderr[:200])
  except Exception:
   launch('bootout',domain+'/'+LABEL)
   if path.exists():path.unlink()
   if (backup/target.name).exists():shutil.copy2(backup/target.name,target)
   if (backup/path.name).exists():
    shutil.copy2(backup/path.name,path);launch('bootstrap',domain,str(path));launch('kickstart',domain+'/'+LABEL)
   for old in moved:shutil.copy2(backup/old.name,old);launch('bootstrap',domain,str(old))
   raise
  print('Resident Office runtime installed; previous timer definitions preserved in '+str(backup))

if __name__=='__main__':install(sys.argv[1])
