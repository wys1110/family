import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

function load() {
  const query={};
  for (const method of ['select','eq','is','or','order','limit','setHeader']) query[method]=vi.fn(()=>query);
  query.then=resolve=>resolve({data:[],error:null});
  const client={from:vi.fn(()=>query),rpc:vi.fn(()=>query)};
  const window={FAMILY_APP_STATE:{supabase:client,session:{user:{id:'owner'},access_token:'owner-token'},household:{id:'home'}}};
  vm.runInNewContext(readFileSync('family-auth.js','utf8'),{window});
  vm.runInNewContext(readFileSync('parenting-history.js','utf8'),{window});
  return {api:window.FAMILY_PARENTING_HISTORY,query,client,state:window.FAMILY_APP_STATE};
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

test('the SDK request keeps the submitting account token and rejects the reply after another login',async()=>{
  const {api,query,client,state}=load();
  let finish;
  query.then=resolve=>{ finish=resolve; };
  const pending=api.enqueue(api.context(),{id:'q',babyId:null,question:'private first question',records:'',messages:[]});
  state.session={user:{id:'other'},access_token:'other-token'};
  state.authGeneration=1;
  await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
  expect(query.setHeader).toHaveBeenCalledWith('Authorization','Bearer owner-token');
  expect(client.rpc).toHaveBeenCalledOnce();
  finish({data:'q',error:null});
  await expect(pending).rejects.toMatchObject({code:'FAMILY_CONTEXT_CHANGED'});
});

test('logging out and in again invalidates the old account epoch, while token refresh keeps the current one',async()=>{
  const {api,query,client,state}=load();
  const previous=api.context();
  state.session=null;
  state.authTransitionPending=true;
  state.authGeneration=1;
  expect(api.context()).toBeNull();
  state.session={user:{id:'owner'},access_token:'new-login-token'};
  state.authGeneration=2;
  expect(api.context()).toBeNull();
  state.authTransitionPending=false;
  await expect(api.status(previous)).rejects.toMatchObject({code:'FAMILY_CONTEXT_CHANGED'});
  expect(client.rpc).not.toHaveBeenCalled();

  const current=api.context();
  state.session={user:{id:'owner'},access_token:'refreshed-token'};
  await api.status(current);
  expect(query.setHeader).toHaveBeenCalledWith('Authorization','Bearer refreshed-token');
});
