"""Export invoice contact observations for private admin review; never edits the register.

Usage: python3 scripts/office_contact_export.py REGISTER_JSON PRIVATE_OUTPUT_JSON
The output contains personal contact data. Keep it outside the Git repository.
"""
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path


def strings(values):
    return sorted({str(v).strip() for v in values if v is not None and str(v).strip()})


def values(value):
    return value if isinstance(value, list) else [value] if value else []


def valid_abn(value):
    number = re.sub(r"\s", "", value)
    if not re.fullmatch(r"[0-9]{11}", number):
        return False
    digits = [int(x) for x in number]
    digits[0] -= 1
    return sum(a*b for a, b in zip(digits, [10,1,3,5,7,9,11,13,15,17,19])) % 89 == 0


def export_contacts(register):
    documents = register.get('documents', [])
    suppliers = register.get('suppliers', [])
    if isinstance(suppliers, dict):
        suppliers = list(suppliers.values())
    by_supplier = defaultdict(list)
    for document in documents:
        by_supplier[document.get('supplier_id')].append(document)
    groups = []
    known = set()
    for supplier in suppliers:
        key = supplier['supplier_id']
        known.add(key)
        groups.append((key, supplier, by_supplier.get(key, [])))
    # Unassigned documents remain separate observations, never inferred identities.
    unassigned = [d for d in documents if d.get('supplier_id') not in known]
    for document in unassigned:
        groups.append(('document:'+document['id'], {}, [document]))
    candidates = []
    identity_flag = re.compile(r'supplier|\babn\b|full name|bill.to|buyer|ocr|test|zero|numbers file|name from|handwritten', re.I)
    for key, supplier, related in groups:
        main = related[0] if related else {}
        name = str(supplier.get('name') or main.get('name') or '').strip()
        abn = str(supplier.get('abn') or main.get('abn') or '').strip()
        emails = strings(values(supplier.get('invoice_emails')) + [d.get('email') for d in related])
        phones = strings(values(supplier.get('invoice_phones')) + [d.get('phone') for d in related])
        names = strings([name] + values(supplier.get('aliases')) + [d.get('name') for d in related])
        abns = strings([abn] + [d.get('abn') for d in related])
        issues = strings(f for d in related for f in values(d.get('flags')) if identity_flag.search(str(f)))
        if not name or len(name.split()) < 2 or name.lower().startswith(('unconfirmed', 'unknown')):
            issues.append('Confirm the full supplier name from the original invoice.')
        if not abn or not valid_abn(abn):
            issues.append('Supplier ABN missing or checksum invalid; do not infer a replacement.')
        if re.sub(r'\s', '', abn) == '62687072420':
            issues.append('This is the Still Partners buyer ABN, not a supplier ABN.')
        if len({n.casefold() for n in names}) > 1:
            issues.append('Name variants exist. Confirm whether they identify the same supplier.')
        if len({re.sub(r'\s', '', a) for a in abns}) > 1:
            issues.append('Several supplier ABNs appear in this source group.')
        if len(emails) > 1:
            issues.append('Several email addresses appear. Choose the supplier contact, not the invoice generator.')
        if len(phones) > 1:
            issues.append('Several phone spellings or numbers appear. Confirm the preferred number.')
        if not emails or not phones:
            issues.append('Some contact details are missing. Leave unknown details blank.')
        if any(not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', e) or re.search(r'@(gmai\.com|gmial\.com|gmail\.con)$', e, re.I) for e in emails):
            issues.append('A source email may contain a typo. Check it without silently correcting it.')
        if key.startswith('document:'):
            issues.append('This document was not assigned to a supplier in the local register.')
        if any(d.get('record_type') != 'invoice' for d in related):
            issues.append('Source includes a test or non-invoice record; verify eligibility.')
        refs = []
        for d in sorted(related, key=lambda d: str(d.get('received') or ''), reverse=True):
            url = str(d.get('source') or '')
            if url and url not in {r['url'] for r in refs}:
                refs.append({'documentId':str(d['id']), 'url':url, 'invoiceNumber':str(d.get('invoice_number') or ''), 'workPeriod':str(d.get('work_period') or '')})
            if len(refs) == 3:
                break
        if not refs and supplier.get('source'):
            refs.append({'documentId':key,'url':supplier['source'],'invoiceNumber':'','workPeriod':''})
        data = {'name':name,'abn':abn,'names':names,'abns':abns,'emails':emails,'phones':phones,
                'issues':strings(issues),'documentCount':len(related),
                'documentIds':strings(d['id'] for d in related),'sources':refs}
        candidates.append({'source_system':'mac_invoice_register','source_key':key,'source_data':data})
    abn_names = defaultdict(set)
    for candidate in candidates:
        source = candidate['source_data']
        if source['abn']:
            abn_names[re.sub(r'\s', '', source['abn'])].add(source['name'].casefold())
    for candidate in candidates:
        data = candidate['source_data']
        if data['abn'] and len(abn_names[re.sub(r'\s', '', data['abn'])]) > 1:
            data['issues'] = strings(data['issues'] + ['The same ABN appears under another supplier name. Keep separate until identity is confirmed.'])
        candidate['source_digest'] = hashlib.sha256(json.dumps(data,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
    return {'schema_version':1,'document_count':len(documents),'supplier_groups':len(suppliers),
            'unassigned_documents':len(unassigned),'candidate_count':len(candidates),'rows':candidates}


if __name__ == '__main__':
    source, target = map(Path, sys.argv[1:3])
    contents = source.read_bytes()
    result = export_contacts(json.loads(contents))
    result['register_sha256'] = hashlib.sha256(contents).hexdigest()
    target.write_text(json.dumps(result,ensure_ascii=False,indent=2))
    target.chmod(0o600)
    print(json.dumps({key:value for key,value in result.items() if key != 'rows'}))
