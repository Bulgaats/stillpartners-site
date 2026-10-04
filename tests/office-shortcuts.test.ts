import {describe,it,expect} from 'vitest';
import {officeShortcut} from '../lib/office/direct';
describe('Bobby shared read shortcuts',()=>{
 it('scopes Today to the exact supplied Perth day',()=>{
  expect(officeShortcut('work','2026-10-04')).toMatchObject({kind:'work',from:'2026-10-04',to:'2026-10-04'});
  expect(()=>officeShortcut('work')).toThrow();
 });
 it('keeps live email separate from saved invoice retrieval',()=>{
  expect(officeShortcut('mail').kind).toBe('mail');
  expect(officeShortcut('invoices')).toMatchObject({kind:'invoices',from:'',to:''});
 });
});
