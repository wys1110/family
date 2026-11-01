import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

function load() {
  const query={};
  for (const method of ['select','eq','is','or','order','limit']) query[method]=vi.fn(()=>query);
  query.then=resolve=>resolve({data:[],error:null});
  const client={from:vi.fn(()=>query)};
  const window={FAMILY_APP_STATE:{supabase:client,session:{user:{id:'owner'}},household:{id:'home'}},FAMILY_AUTH_API:{withRecovery:operation=>operation()}};
  vm.runInNewContext(readFileSync('parenting-history.js','utf8'),{window});
  return {api:window.FAMILY_PARENTING_HISTORY,query};
}

test('older history keeps author, household and child scope and orders timestamp ties by ID',async()=>{
  const {api,query}=load();
  const before={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',created_at:'2026-11-01T12:34:56.123456+00:00'};
  await api.list(api.context(),'baby',before);
  expect(query.eq.mock.calls).toEqual([['household_id','home'],['created_by','owner'],['baby_id','baby']]);
  expect(query.or).toHaveBeenCalledWith(`created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`);
  expect(query.order.mock.calls).toEqual([['created_at',{ascending:false}],['id',{ascending:false}]]);
  expect(query.limit).toHaveBeenCalledWith(20);
});

test('no-child history stays scoped and invalid cursors never become raw filters',async()=>{
  const {api,query}=load();await api.list(api.context(),null);
  expect(query.is).toHaveBeenCalledWith('baby_id',null);expect(query.or).not.toHaveBeenCalled();
  for (const before of [{id:'bad),id.gt.0',created_at:'2026-11-01'}, {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',created_at:'bad),id.gt.0'}]) {
    await expect(api.list(api.context(),null,before)).rejects.toThrow('대화');
  }
  expect(query.or).not.toHaveBeenCalled();
});
