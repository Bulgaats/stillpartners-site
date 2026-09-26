import { describe,it,expect } from 'vitest';
import { gmailSourceUrl,possibleContacts,type ContactSource } from '../lib/office/contact-import';
import type { Contractor } from '../lib/office/foundation';

describe('contact import boundaries',()=>{
  const person:Contractor={id:'one',fullName:'Example Contractor',abn:'12345678901',email:'shared@example.test',phone:'',group:'regular',active:true};
  const source:ContactSource={name:'Different Name',abn:'',emails:['shared@example.test'],phones:[],names:[],abns:[],issues:[],documentCount:1,documentIds:['example'],sources:[]};
  it('returns identity hints without modifying or automatically merging contacts',()=>{
    const original=structuredClone(person);
    expect(possibleContacts(source,[person])).toEqual([person]);
    expect(person).toEqual(original);
    expect(possibleContacts({...source,emails:[],abn:person.abn},[person])).toEqual([person]);
    expect(possibleContacts({...source,emails:[]},[person])).toEqual([]);
  });
  it('only exposes HTTPS Gmail source links',()=>{
    expect(gmailSourceUrl('https://mail.google.com/mail/u/0/#all/example')).toContain('#all/example');
    for(const url of ['javascript:alert(1)','https://mail.google.com.attacker.test/','http://mail.google.com/','https://user:secret@mail.google.com/','file:///etc/passwd'])expect(gmailSourceUrl(url)).toBeNull();
  });
});
