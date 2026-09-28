import {describe,it,expect} from 'vitest';
import {recordDraft,reviewedWorkDraft,companyRecordProposal} from '../lib/office/company-records';

const draft={...recordDraft('work'),id:'8c54d4e9-6e5a-4ac8-9d4a-b52e03caa083',expectedVersion:3,title:'Review source warning',nextAction:'Check invoice details',status:'needs_review' as const,sourceRef:'Synthetic invoice example'};

describe('Owner work-inbox decisions',()=>{
 it('approves without a typed comment while preserving revision and source guards',()=>{
  const result=reviewedWorkDraft(draft,'completed');
  expect(companyRecordProposal.safeParse(result).success).toBe(true);
  expect(result).toMatchObject({id:draft.id,expectedVersion:3,sourceRef:draft.sourceRef,status:'completed'});
  expect(result.outcome).toBe('Owner approved this work item as reviewed and closed it.');
  expect(draft.status).toBe('needs_review');
 });
 it('dismisses reversibly with an audit outcome instead of deleting the record',()=>{
  const result=reviewedWorkDraft(draft,'cancelled');
  expect(companyRecordProposal.safeParse(result).success).toBe(true);
  expect(result.id).toBe(draft.id);expect(result.body).toBe(draft.body);
  expect(result.outcome).toBe('Owner dismissed this work item as not needed.');
 });
 it('preserves an optional owner explanation',()=>{
  expect(reviewedWorkDraft({...draft,outcome:'Duplicate reminder; original case remains open.'},'cancelled').outcome).toBe('Duplicate reminder; original case remains open.');
 });
 it('cannot turn a new task or company memory into a completed work record',()=>{
  expect(()=>reviewedWorkDraft({...draft,id:''},'completed')).toThrow();
  expect(()=>reviewedWorkDraft({...draft,kind:'memory'},'completed')).toThrow();
 });
});
