import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test } from 'vitest';

const window={addEventListener:()=>{},FAMILY_APP_STATE:{},localStorage:{getItem:()=>null}};
vm.runInNewContext(readFileSync('travel-data.js','utf8'),{window,localStorage:window.localStorage});
vm.runInNewContext(readFileSync('travel-management.js','utf8'),{window});
const now=new Date('2026-10-03T12:00:00Z');
const trips=[
  {id:'past',title:'제주 여름',destinationLabel:'제주',startDate:'2026-08-01',endDate:'2026-08-03',items:[]},
  {id:'late',title:'Tokyo winter',destinationLabel:'도쿄',startDate:'2026-12-01',endDate:'2026-12-03',items:[]},
  {id:'ongoing',title:'부산 바다',destinationLabel:'부산',startDate:'2026-10-01',endDate:'2026-10-04',items:[]},
  {id:'early',title:'제주 가을',destinationLabel:'제주',startDate:'2026-11-01',endDate:'2026-11-03',items:[]},
  {id:'archived',title:'보관된 제주',destinationLabel:'제주',startDate:'2026-07-01',endDate:'2026-07-03',archivedAt:'2026-08-01',items:[]},
];

test('management finds trips by name or destination, filters archives separately, and prioritizes current/next trips',()=>{
  const api=window.FAMILY_TRAVEL_MANAGEMENT;
  expect(api?.selectTrips).toBeTypeOf('function');
  expect(api.selectTrips(trips,{now}).map(trip=>trip.id)).toEqual(['ongoing','early','late','past']);
  expect(api.selectTrips(trips,{now,query:' 제주 ',filter:'upcoming'}).map(trip=>trip.id)).toEqual(['early']);
  expect(api.selectTrips(trips,{now,query:'tokYO'}).map(trip=>trip.id)).toEqual(['late']);
  expect(api.selectTrips(trips,{now,filter:'archived'}).map(trip=>trip.id)).toEqual(['archived']);
  expect(api.selectTrips(trips,{now,filter:'past'}).map(trip=>trip.id)).toEqual(['past']);
  expect(api.selectTrips(trips,{now,query:'없는 여행'})).toEqual([]);
});

test('management exposes restore for archives, escapes titles and keeps invalid dates out of dated filters',()=>{
  const api=window.FAMILY_TRAVEL_MANAGEMENT;
  expect(api?.render).toBeTypeOf('function');
  const markup=api.render([{...trips[4],title:'<제주>'}],{now,filter:'archived'});
  expect(markup).toContain('&lt;제주&gt;');
  expect(markup).toContain('data-travel-restore="archived"');
  expect(markup).not.toContain('data-travel-open="archived"');
  const invalid={...trips[0],id:'bad',startDate:'2026-02-30'};
  expect(api.selectTrips([invalid],{now,filter:'past'})).toEqual([]);
 expect(api.selectTrips([invalid],{now})).toHaveLength(1);
});

test('archiving and restoring a saved trip preserves its records and history across reloads', async()=>{
 const store=new Map();
 const load=()=>{
  const localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
  const isolated={FAMILY_APP_STATE:{household:{id:'test-family'}},localStorage,addEventListener:()=>{},dispatchEvent:()=>{}};
  vm.runInNewContext(readFileSync('travel-data.js','utf8'),{window:isolated,localStorage,CustomEvent:class{},crypto:{randomUUID:()=> 'test-id'}});
  vm.runInNewContext(readFileSync('travel-management.js','utf8'),{window:isolated});
  return {data:isolated.FAMILY_TRAVEL_DATA,management:isolated.FAMILY_TRAVEL_MANAGEMENT};
 };
 let {data,management}=load();
 const saved=await data.createTrip({title:'제주 기록',destinationLabel:'제주',startDate:'2026-09-01',endDate:'2026-09-03'});
 await data.addNote(saved.id,{title:'첫 바다',dayIndex:0,note:'함께 걸었어요'});
 await data.archiveTrip(saved.id);
 ({data,management}=load());
 expect(management.selectTrips(data.getTrips({includeArchived:true}),{now})).toEqual([]);
 expect(management.selectTrips(data.getTrips({includeArchived:true}),{now,filter:'archived'})).toHaveLength(1);
 expect(data.summarizeTrips(data.getTrips({includeArchived:true}),now).pastTrips).toBe(1);
 await data.restoreTrip(saved.id);
 ({data,management}=load());
 expect(management.selectTrips(data.getTrips({includeArchived:true}),{now,filter:'archived'})).toEqual([]);
 expect(management.selectTrips(data.getTrips(),{now})[0].items[0]).toMatchObject({title:'첫 바다',note:'함께 걸었어요',dayIndex:0});
 expect(data.summarizeTrips(data.getTrips({includeArchived:true}),now).pastTrips).toBe(1);
});
