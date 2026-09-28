"""Versioned install; existing sources, records, credentials and schedules are preserved."""
import datetime as dt,fcntl,hashlib,json,pathlib,shutil,sys

def install(root,repo):
 root=pathlib.Path(root);repo=pathlib.Path(repo)
 names=['office_mac_sync.py','office_snapshot.py','office_history.py','office_backup.py','office_knowledge_tools.py','office_mail_tools.py']
 with (root/'data/office-sync.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  backup=root/'data/code_backups'/('readiness-'+dt.datetime.now().strftime('%Y%m%dT%H%M%S'));backup.mkdir(parents=True)
  for name in names+['engine.py']:
   if (root/name).exists():shutil.copy2(root/name,backup/name)
  path=root/'engine.py';source=path.read_text();changed=source
  if 'def historical_closed(d):' not in changed:
   changed=changed.replace('def payment_status(state,d):',"def historical_closed(d):\n    from office_history import valid_closure\n    return valid_closure(d)\n\ndef payment_status(state,d):")
   changed=changed.replace("    if n:return 'Part-paid'", "    if historical_closed(d):return 'Paid (historical)' if historical_closed(d)['kind']=='settled' else 'Archived source'\n    if n:return 'Part-paid'")
   # Guard all mutation entry points using the same exact-document lookup.
   lines=changed.splitlines();out=[]
   for line in lines:
    out.append(line)
    if line.strip()=='d=document(state,doc_id)':
     indent=line[:len(line)-len(line.lstrip())]
     out.append(indent+"if historical_closed(d):raise ValueError('Historical archive is closed; explicitly reopen it before editing or adding payments')")
   changed='\n'.join(out)+'\n'
   compile(changed,str(path),'exec');tmp=path.with_suffix('.pending');tmp.write_text(changed);tmp.replace(path)
  for name in names:shutil.copy2(repo/'scripts'/name,root/name)
 return {'installed':names,'backup':str(backup),'engine_changed':changed!=source}
if __name__=='__main__':print(json.dumps(install(sys.argv[1],sys.argv[2])))
