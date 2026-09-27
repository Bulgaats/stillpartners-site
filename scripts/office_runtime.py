"""One resident coordinator for existing scoped workers; no model or business actions here.

Wall-clock deadlines catch up once after sleep. Each worker keeps its existing
lock, approval checks and replay journal. A failed job never stops other jobs.
"""
import argparse,datetime as dt,fcntl,json,os,pathlib,signal,subprocess,sys,time

JOBS={'assistant':('office_assistant_worker.py',30),'mail':('office_mail_worker.py',60),'sync':('office_mac_sync.py',300)}
def iso(value):return dt.datetime.fromtimestamp(value,dt.timezone.utc).isoformat()

class Runtime:
 def __init__(self,root,clock=time.time,spawn=subprocess.Popen):
  self.root=pathlib.Path(root);self.clock=clock;self.spawn=spawn;self.children={};self.stopping=False
  self.started=iso(clock());self.jobs={key:{'status':'waiting','next_due':0,'runs':0} for key in JOBS}
  try:prior=json.loads((self.root/'Reports/office_runtime_status.json').read_text())
  except (ValueError,OSError):prior={}
  for key,state in self.jobs.items():
   old=prior.get('jobs',{}).get(key,{})
   state['runs']=old.get('runs',0);state['last_success_at']=old.get('last_success_at')
 def tick(self):
  now=self.clock()
  for key,(filename,interval) in JOBS.items():
   state=self.jobs[key];child=self.children.get(key)
   if child is not None:
    code=child.poll()
    if code is None:continue
    self.children.pop(key);state.update(status='ok' if code==0 else 'error',finished_at=iso(now),exit_code=code)
    if code==0:state['last_success_at']=iso(now)
    # Wait a full interval after completion; no tight retry loop after errors.
    state['next_due']=now+interval
   if self.stopping or now<state['next_due']:continue
   try:
    with (self.root/'Logs'/('office-'+key+'.log')).open('a') as log:
     child=self.spawn([sys.executable,str(self.root/filename)],cwd=self.root,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
    self.children[key]=child;state.update(status='running',started_at=iso(now),runs=state['runs']+1)
   except OSError as exc:state.update(status='error',error_type=type(exc).__name__,next_due=now+interval)
  result={'status':'stopping' if self.stopping else 'running','pid':os.getpid(),'started_at':self.started,'heartbeat_at':iso(now),'jobs':self.jobs}
  target=self.root/'Reports/office_runtime_status.json';temp=target.with_suffix('.tmp');temp.write_text(json.dumps(result));os.chmod(temp,0o600);os.replace(temp,target)
  return result

def run(root):
 root=pathlib.Path(root).resolve();(root/'Reports').mkdir(exist_ok=True);(root/'Logs').mkdir(exist_ok=True)
 with (root/'data/office-runtime.lock').open('a') as lock:
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:return
  runtime=Runtime(root)
  def stop(*_):runtime.stopping=True
  signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
  while True:
   try:runtime.tick()
   except (OSError,ValueError) as exc:print(json.dumps({'status':'error','error_type':type(exc).__name__}),flush=True)
   if runtime.stopping and not runtime.children:break
   time.sleep(5)

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--root',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parent)
 run(parser.parse_args().root)
