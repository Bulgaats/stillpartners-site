"""Install only the source-preserving bridge. Registration and schedule activation are separate."""
import datetime,hashlib,json,os,pathlib,secrets,shutil,sys

def install(root,repo):
 root=pathlib.Path(root);repo=pathlib.Path(repo);path=root/'engine.py';source=path.read_text();changed=source
 if 'def approve(doc_id, fields, reason, expected=None):' not in changed:
  old='def approve(doc_id, fields, reason):\n    with transaction() as state:\n        d=document(state,doc_id)'
  new='def approve(doc_id, fields, reason, expected=None):\n    with transaction() as state:\n        d=document(state,doc_id)\n        if expected is not None and any(d.get(k)!=v for k,v in expected.items()):raise ValueError("Invoice changed during sync; review the current version")'
  if changed.count(old)!=1:raise ValueError('Unexpected approve implementation; inspect before installing')
  changed=changed.replace(old,new)
 if 'def record_payment(doc_id, amount, day, reference, event_id, expected=None):' not in changed:
  old='def record_payment(doc_id, amount, day, reference, event_id):'
  if changed.count(old)!=1:raise ValueError('Unexpected payment implementation')
  changed=changed.replace(old,'def record_payment(doc_id, amount, day, reference, event_id, expected=None):')
  old="        d=document(state,doc_id)\n        if not d.get('approved')"
  if changed.count(old)!=1:raise ValueError('Unexpected payment guard')
  changed=changed.replace(old,"        d=document(state,doc_id)\n        if expected is not None and any(d.get(k)!=v for k,v in expected.items()):raise ValueError('Invoice changed during sync; review the current version')\n        if not d.get('approved')")
 if changed!=source:
  backup=root/'data/code_backups'/datetime.datetime.now().strftime('%Y%m%dT%H%M%S');backup.mkdir(parents=True,exist_ok=True);shutil.copy2(path,backup/'engine.py');path.write_text(changed)
 for name in ['office_mac_sync.py','office_snapshot.py']:shutil.copy2(repo/'scripts'/name,root/name)
 env={}
 for line in (repo/'.env.local').read_text().splitlines():
  if '=' in line and not line.lstrip().startswith('#'):
   k,v=line.split('=',1);env[k.strip()]=v.strip().strip('"').strip("'")
 target=pathlib.Path.home()/'Library/Application Support/Still Partners/office-device.json';target.parent.mkdir(parents=True,exist_ok=True)
 if not target.exists():
  config={'url':env['NEXT_PUBLIC_SUPABASE_URL'],'anon_key':env['NEXT_PUBLIC_SUPABASE_ANON_KEY'],'token':secrets.token_urlsafe(48)}
  fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
  with os.fdopen(fd,'w') as f:json.dump(config,f)
 config=json.loads(target.read_text());os.chmod(target,0o600)
 return {'token_hash':hashlib.sha256(config['token'].encode()).hexdigest(),'installed':True}
if __name__=='__main__':print(json.dumps(install(sys.argv[1],sys.argv[2])))
