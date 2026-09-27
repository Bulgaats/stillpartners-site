"""Install the scoped Office chat worker without changing invoice/Gmail sync jobs."""
import os,pathlib,plistlib,shutil,subprocess,sys
LABEL='net.stillpartners.office-assistant'
def install(root):
 if sys.platform!='darwin':raise RuntimeError('macOS required')
 if (pathlib.Path.home()/'Library/LaunchAgents/net.stillpartners.office-runtime.plist').exists():raise RuntimeError('Resident Office runtime is installed. Do not reinstall a competing interval timer; update the scoped worker and keep the existing runtime.')
 root=pathlib.Path(root).resolve();source=pathlib.Path(__file__).resolve().parent/'office_assistant_worker.py'
 shutil.copy2(source,root/'office_assistant_worker.py')
 agents=pathlib.Path.home()/'Library/LaunchAgents';agents.mkdir(parents=True,exist_ok=True);logs=root/'Logs';logs.mkdir(exist_ok=True)
 path=agents/(LABEL+'.plist');domain='gui/'+str(os.getuid())
 job={'Label':LABEL,'ProgramArguments':[str(root/'.venv/bin/python'),str(root/'office_assistant_worker.py')],'WorkingDirectory':str(root),'StartInterval':30,'RunAtLoad':True,'ProcessType':'Background','StandardOutPath':str(logs/'office-assistant.log'),'StandardErrorPath':str(logs/'office-assistant-error.log'),'EnvironmentVariables':{'PATH':'/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin','PYTHONUNBUFFERED':'1','TZ':'Australia/Perth'}}
 exists=subprocess.run(['/bin/launchctl','print',domain+'/'+LABEL],stdin=subprocess.DEVNULL,capture_output=True)
 if exists.returncode==0:subprocess.run(['/bin/launchctl','bootout',domain+'/'+LABEL],stdin=subprocess.DEVNULL,check=True)
 with path.open('wb') as f:plistlib.dump(job,f)
 subprocess.run(['/bin/launchctl','bootstrap',domain,str(path)],stdin=subprocess.DEVNULL,check=True)
 print('Office chat worker installed. Requests wait while the Mac is asleep/offline.')
if __name__=='__main__':install(sys.argv[1])
