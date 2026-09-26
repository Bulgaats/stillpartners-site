"""Install one per-user Office synchronization job; does not change the Gmail schedule."""
import os,pathlib,plistlib,subprocess,sys
LABEL='net.stillpartners.office-sync'
def install(root):
 if sys.platform!='darwin':raise RuntimeError('macOS required')
 root=pathlib.Path(root).resolve();agents=pathlib.Path.home()/'Library/LaunchAgents';agents.mkdir(parents=True,exist_ok=True);logs=root/'Logs';logs.mkdir(exist_ok=True)
 path=agents/(LABEL+'.plist');domain='gui/'+str(os.getuid())
 job={'Label':LABEL,'ProgramArguments':[str(root/'.venv/bin/python'),str(root/'office_mac_sync.py')],'WorkingDirectory':str(root),'StartInterval':300,'RunAtLoad':True,'ProcessType':'Background','StandardOutPath':str(logs/'office-sync.log'),'StandardErrorPath':str(logs/'office-sync-error.log'),'EnvironmentVariables':{'PATH':'/usr/bin:/bin:/usr/sbin:/sbin','PYTHONUNBUFFERED':'1','TZ':'Australia/Perth'}}
 existing=subprocess.run(['/bin/launchctl','print',domain+'/'+LABEL],stdin=subprocess.DEVNULL,capture_output=True)
 if existing.returncode==0:subprocess.run(['/bin/launchctl','bootout',domain+'/'+LABEL],stdin=subprocess.DEVNULL,check=True)
 with path.open('wb') as f:plistlib.dump(job,f)
 subprocess.run(['/bin/launchctl','bootstrap',domain,str(path)],stdin=subprocess.DEVNULL,check=True)
 print('Office sync installed: every 5 minutes while awake, with one job at login.')
if __name__=='__main__':install(sys.argv[1])
