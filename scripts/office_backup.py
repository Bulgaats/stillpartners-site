"""Verified, credential-free local recovery bundles. Never delete older backups.
An external destination can be configured; an on-Mac copy is not off-device backup.
"""
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
import zipfile


def sha(data):return hashlib.sha256(data).hexdigest()


def verify_bundle(path):
    with zipfile.ZipFile(path) as z:
        manifest=json.loads(z.read('manifest.json'))
        for name,digest in manifest['files'].items():
            p=Path(name)
            if p.is_absolute() or '..' in p.parts:raise ValueError('Unsafe backup path')
            if sha(z.read(name))!=digest:raise ValueError('Backup checksum mismatch')
        state=json.loads(z.read('data/register.json'))
        for d in state['documents']:
            if sha(z.read(d['file']))!=d['sha256']:raise ValueError('Original source not restored correctly')
    return {'files':len(manifest['files']),'documents':len(state['documents']),'payments':len(state.get('payments',[]))}


def create_backup(root,destination):
    root=Path(root).resolve();destination=Path(destination).expanduser().resolve()
    if destination==root or root in destination.parents:raise ValueError('Backup destination must be outside the application folder')
    destination.mkdir(parents=True,exist_ok=True);os.chmod(destination,0o700)
    stamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    path=destination/('office-recovery-'+stamp+'.zip');temp=path.with_suffix('.pending')
    with (root/'data/register.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        raw=(root/'data/register.json').read_bytes();state=json.loads(raw)
        paths={'data/register.json':raw}
        for d in state['documents']:
            for name in [d.get('file'),(d.get('historical_closure') or {}).get('archive_file')]:
                if not name:continue
                f=(root/name).resolve()
                if root not in f.parents:raise ValueError('Source outside application')
                contents=f.read_bytes()
                if sha(contents)!=d['sha256']:raise ValueError('Source changed; backup refused')
                paths[str(f.relative_to(root))]=contents
        for pattern in ['*.py','data/office_history_policy.json','data/office_cloud_backup.json','data/*journal*.json','Reports/*status.json']:
            for f in root.glob(pattern):
                if f.is_file():paths[str(f.relative_to(root))]=f.read_bytes()
        # Outgoing-mail journals are recovery evidence. Never auto-send after restore.
        for f in (root/'Client_Invoices').rglob('*') if (root/'Client_Invoices').exists() else []:
            if f.is_file():paths[str(f.relative_to(root))]=f.read_bytes()
        with zipfile.ZipFile(temp,'w',zipfile.ZIP_DEFLATED) as z:
            for name,data in paths.items():z.writestr(name,data)
            z.writestr('manifest.json',json.dumps({'created_at':stamp,'files':{n:sha(v) for n,v in paths.items()},'restore_policy':'Restore to a separate folder. Reconnect credentials explicitly; review uncertain send journals before starting workers.'}))
        os.chmod(temp,0o600)
    result=verify_bundle(temp);os.replace(temp,path)
    return {**result,'file':str(path),'sha256':sha(path.read_bytes()),'created_at':dt.datetime.now(dt.timezone.utc).isoformat(),'off_device':destination.stat().st_dev!=root.stat().st_dev}


def daily_backup(root,policy):
    target=root/'Reports/office_backup_status.json'
    try:prior=json.loads(target.read_text())
    except (ValueError,OSError):prior={}
    today=dt.datetime.now(dt.timezone.utc).date().isoformat()
    if str(prior.get('created_at','')).startswith(today) and Path(prior.get('file','')).is_file():return prior
    result=create_backup(root,policy['destination']);temp=target.with_suffix('.tmp');temp.write_text(json.dumps(result));os.chmod(temp,0o600);os.replace(temp,target);return result
