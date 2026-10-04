import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,test} from 'vitest';

const source=readFileSync('travel-data.js','utf8');
const tripId='11111111-1111-4111-8111-111111111111';
const sample={id:tripId,title:'가상 제주',destinationLabel:'제주',startDate:'2026-10-01',endDate:'2026-10-03',revision:4,items:[
 {id:'p1',type:'place',title:'첫 해변',dayIndex:0,order:0,visited:false,place:{name:'해변',lat:33.4,lng:126.5}},
 {id:'n1',type:'note',title:'낮잠 메모',dayIndex:0,order:1,note:'메모 유지'},
 {id:'p2',type:'place',title:'수목원',dayIndex:1,order:0,visited:true,place:{name:'수목원',lat:33.5,lng:126.6}},
 {id:'existing',type:'place',title:'카페',dayIndex:2,order:0,place:{name:'카페',lat:33.6,lng:126.7}},
 {id:'inbox',type:'place',title:'날짜 미정',dayIndex:null,order:0,place:{name:'미정',lat:null,lng:null}},
]};
function load({shared=false,rejectSave=false}={}){
 const store=new Map([['family-travel-v1:test-family',JSON.stringify([sample])]]);
 const saves=[];
 const localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
 const window={FAMILY_APP_STATE:{household:{id:'test-family'}},localStorage,addEventListener:()=>{},dispatchEvent:()=>{},
  FAMILY_TRAVEL_SHARING:shared?{enabled:()=>true,load:async()=>[sample],save:async(values,options)=>{saves.push({values,options});if(rejectSave)throw new Error('저장 충돌');}}:undefined};
 vm.runInNewContext(source,{window,localStorage,CustomEvent:class{},crypto:{randomUUID:()=>tripId}});
 return {api:window.FAMILY_TRAVEL_DATA,store,saves};
}

test('bulk date move appends in itinerary order and preserves notes and existing target places',async()=>{
 const {api,store}=load();
 expect(api.movePlaces).toBeTypeOf('function');
 await api.movePlaces(tripId,['p2','p1','existing','p1'],2);
 const updated=api.getTrip(tripId);
 expect(updated.revision).toBe(5);
 expect(updated.items.filter(item=>item.dayIndex===2).sort((a,b)=>a.order-b.order).map(item=>item.id)).toEqual(['existing','p1','p2']);
 expect(updated.items.find(item=>item.id==='n1')).toMatchObject({dayIndex:0,note:'메모 유지'});
 expect(updated.items.find(item=>item.id==='p1')).toMatchObject({localDate:'2026-10-03',visited:false,place:{lat:33.4,lng:126.5}});
 expect(JSON.parse(store.get('family-travel-v1:test-family'))[0].items.find(item=>item.id==='p2').dayIndex).toBe(2);
 await api.movePlaces(tripId,['p1','p2'],null);
 expect(api.getTrip(tripId).items.filter(item=>item.dayIndex===null).sort((a,b)=>a.order-b.order).map(item=>item.id)).toEqual(['inbox','p1','p2']);
});

test('bulk visited uses an explicit boolean once and leaves unselected places and notes intact',async()=>{
 const {api}=load();
 expect(api.setPlacesVisited).toBeTypeOf('function');
 await api.setPlacesVisited(tripId,['p1','p2'],true);
 expect(api.getTrip(tripId).items.filter(item=>['p1','p2'].includes(item.id)).map(item=>item.visited)).toEqual([true,true]);
 expect(api.getTrip(tripId).revision).toBe(5);
 expect(api.getTrip(tripId).items.find(item=>item.id==='existing').visited).toBe(false);
 await api.setPlacesVisited(tripId,['p1','p2'],false);
 expect(api.getTrip(tripId).items.filter(item=>['p1','p2'].includes(item.id)).map(item=>item.visited)).toEqual([false,false]);
 expect(api.getTrip(tripId).items.find(item=>item.id==='n1')).toMatchObject({dayIndex:0,note:'메모 유지',visited:false});
});

test('an explicit undated move wins over the previously exported local date',async()=>{
 const {api}=load();
 await api.moveItem(tripId,'p1',null);
 expect(api.getTrip(tripId).items.find(item=>item.id==='p1')).toMatchObject({dayIndex:null,localDate:null});
 await api.refresh();
 expect(api.getTrip(tripId).items.find(item=>item.id==='p1')).toMatchObject({dayIndex:null,localDate:null});
});

test('invalid or stale bulk selections never persist partial mutations',async()=>{
 const {api,store}=load();
 expect(api.movePlaces).toBeTypeOf('function');
 const before=store.get('family-travel-v1:test-family');
 for(const ids of [[],['p1','missing'],['n1'],['p1','n1']])await expect(api.movePlaces(tripId,ids,1)).rejects.toThrow();
 for(const day of [-1,3,1.5,'1',undefined])await expect(api.movePlaces(tripId,['p1'],day)).rejects.toThrow();
 await expect(api.setPlacesVisited(tripId,['p1'],'true')).rejects.toThrow();
 expect(store.get('family-travel-v1:test-family')).toBe(before);
 expect(api.getTrip(tripId).revision).toBe(4);
});

test('shared bulk edit saves once with the original revision and rolls back on a rejected save',async()=>{
 const successful=load({shared:true});
 expect(successful.api.movePlaces).toBeTypeOf('function');
 await successful.api.refresh();
 await successful.api.movePlaces(tripId,['p1','p2'],2);
 expect(successful.saves).toHaveLength(1);
 expect(successful.saves[0].options.expectedRevision).toBe(4);
 expect(successful.saves[0].values[0].revision).toBe(5);
 const rejected=load({shared:true,rejectSave:true});
 await rejected.api.refresh();
 const before=rejected.api.getTrip(tripId);
 await expect(rejected.api.setPlacesVisited(tripId,['p1','p2'],true)).rejects.toThrow('저장 충돌');
 expect(rejected.saves).toHaveLength(1);
 expect(rejected.api.getTrip(tripId)).toEqual(before);
});
