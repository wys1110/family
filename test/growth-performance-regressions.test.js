import {test,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=name=>readFileSync(name,'utf8');
const dataWindow={};vm.runInNewContext(source('family-data.js'),{window:dataWindow});
test('sleep is split at midnight without changing the original or its edit ID',()=>{
 const window={};vm.runInNewContext(source('family-data.js'),{window});
 const original={id:'sleep-1',category:'수면',date:'2026-09-13',time:'23:00',sleepMinutes:120};
 expect(window.FAMILY_DATA.splitSleepEntries([original])).toEqual([{...original,sleepMinutes:60},{...original,date:'2026-09-14',time:'00:00',sleepMinutes:60}]);
 expect(original.sleepMinutes).toBe(120);
 expect(window.FAMILY_DATA.splitSleepEntries([{...original,date:'2026-02-30'},{...original,sleepMinutes:-1}])).toEqual([]);
 expect(window.FAMILY_DATA.splitSleepEntries([{...original,time:''}])).toEqual([{...original,time:''}]);
});
function deleteHarness(result={data:[{id:'0'}]},storageError=false){
 let click;const button={dataset:{},addEventListener:(_,fn)=>{click=fn;},setAttribute(){},removeAttribute(){}};
 const dialog={close:vi.fn()};const query={delete:vi.fn(function(){return this;}),eq(){return this;},select:vi.fn(()=>result)};
 const supabase={from:vi.fn(()=>query),storage:{from:()=>({remove:async()=>{if(storageError)throw new Error('storage offline');return {};}})}};
 const state={supabase,session:{user:{id:'u'}},household:{id:'h'},growthEntries:Array.from({length:1006},(_,i)=>({id:String(i),babyId:'b',photoPaths:i===0?['h/photo']:[]}))};
 const toast=vi.fn(),renderGrowth=vi.fn(),dispatchEvent=vi.fn();
 vm.runInNewContext(source('growth-delete-sync.js'),{state,document:{querySelector:s=>s==='#deleteGrowthButton'?button:s==='#growthId'?{value:'0'}:dialog},window:{FAMILY_DATA:dataWindow.FAMILY_DATA,confirm:()=>true,FAMILY_AUTH_API:{withRecovery:op=>op()},dispatchEvent},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},toast,renderGrowth,resetGrowthPhotoDraft:vi.fn(),GROWTH_PHOTO_BUCKET:'photos',console:{error(){},warn(){}}});
 return {state,dialog,query,supabase,toast,renderGrowth,dispatchEvent,click:()=>click({preventDefault(){},stopImmediatePropagation(){}})};
}
test('deletion keeps all remaining rows without a capped reload; photo cleanup cannot reverse success',async()=>{
 const h=deleteHarness(undefined,true);await h.click();expect(h.state.growthEntries).toHaveLength(1005);expect(h.state.growthEntries[1004].id).toBe('1005');expect(h.supabase.from).toHaveBeenCalledTimes(1);expect(h.dialog.close).toHaveBeenCalledTimes(1);expect(h.toast).toHaveBeenCalledExactlyOnceWith('성장 기록을 삭제했어요');expect(h.dispatchEvent).toHaveBeenCalledTimes(1);
});
test('a normal successful response from the old household cannot overwrite the new household',async()=>{
 let resolve;const h=deleteHarness(new Promise(r=>resolve=r));const pending=h.click();h.state.household={id:'other'};const other=[{id:'new'}];h.state.growthEntries=other;resolve({data:[{id:'0'}]});await pending;expect(h.state.growthEntries).toBe(other);expect(h.dialog.close).not.toHaveBeenCalled();expect(h.renderGrowth).not.toHaveBeenCalled();
});
test('failed deletion preserves the record and open editor',async()=>{
 const h=deleteHarness({error:new Error('offline')});await h.click();expect(h.state.growthEntries).toHaveLength(1006);expect(h.dialog.close).not.toHaveBeenCalled();expect(h.toast.mock.calls[0][0]).toContain('삭제하지 못');
});
function photoHarness(sign){
 const context={state:{session:{user:{id:'u'}},household:{id:'h'},supabase:{storage:{from:()=>({createSignedUrls:sign})}}},GROWTH_PHOTO_BUCKET:'photos',hydrateGrowthPhotoUrls:()=>{},renderGrowth(){},queueMicrotask(){},document:{addEventListener(){},querySelectorAll:()=>[]},window:{FAMILY_AUTH_API:{withRecovery:op=>op()},addEventListener(){},setTimeout(){},setInterval(){}}};
 vm.createContext(context);vm.runInContext(source('family-data.js'),context);vm.runInContext(source('growth-photo-recovery.js'),context);return context;
}
test('photo URLs are batched and reused; changing families clears the cache',async()=>{
 const sign=vi.fn(async paths=>({data:paths.map(path=>({path,signedUrl:'signed:'+path}))}));const h=photoHarness(sign);const entries=[{photoPaths:Array.from({length:205},(_,i)=>'photo/'+i)}];
 await h.hydrateGrowthPhotoUrls(entries);expect(sign.mock.calls.map(c=>c[0].length)).toEqual([100,100,5]);expect(entries[0].photoUrls).toHaveLength(205);await h.hydrateGrowthPhotoUrls(entries);expect(sign).toHaveBeenCalledTimes(3);h.state.household={id:'other'};await h.hydrateGrowthPhotoUrls(entries);expect(sign).toHaveBeenCalledTimes(6);
});
test('photo refresh never applies a partial batch or a previous family response',async()=>{
 let resolve;const h=photoHarness(()=>new Promise(r=>resolve=r));const entry={photoPaths:['a'],photoUrls:['old']};const pending=h.hydrateGrowthPhotoUrls([entry]);h.state.household={id:'other'};resolve({data:[{path:'a',signedUrl:'new'}]});await pending;expect(entry.photoUrls).toEqual(['old']);
 let calls=0;const broken=photoHarness(async paths=>++calls===1?{data:paths.map(path=>({path,signedUrl:'new'}))}:{error:new Error('offline')});const many={photoPaths:Array.from({length:101},(_,i)=>String(i)),photoUrls:['old']};await expect(broken.hydrateGrowthPhotoUrls([many])).rejects.toThrow('offline');expect(many.photoUrls).toEqual(['old']);
});
