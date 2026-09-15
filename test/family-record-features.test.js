import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const load = (name,window={}) => {new Function('window',readFileSync(name,'utf8'))(window);return window;};
const {FAMILY_DATA:data}=load('family-data.js');
const {FAMILY_JOURNAL:journal}=load('family-journal.js',{FAMILY_DATA:data});
const {FAMILY_BACKUP_MEDIA:media}=load('family-backup-media.js');
const {FAMILY_SETTINGS_BACKUP:backup}=load('settings-backup.js');
test('pagination reads beyond 1000 rows even with a smaller server cap',async()=>{
 const rows=Array.from({length:1251},(_,id)=>({id}));let calls=0;
 const result=await data.readAll(()=>({order(){return this;},range(from){calls++;return {data:rows.slice(from,from+120),error:null};}}));
 expect(result.data).toEqual(rows);expect(calls).toBe(12);
});
test('pagination discards partial results on failure and context changes',async()=>{
 let count=0;const query=()=>({order(){return this;},range(){return ++count===1?{data:[{id:1}],error:null}:{data:null,error:new Error('offline')};}});
 expect((await data.readAll(query)).data).toBeNull();
 count=0;expect((await data.readAll(query,{isCurrent:()=>count===0})).data).toBeNull();
});
test('pagination fails if server keeps repeating a page',async()=>{
 expect((await data.readAll(()=>({order(){return this;},range(){return {data:[{id:1}],error:null};}}))).error).toBeTruthy();
});
test('report handles missing days, zero values, and cross-midnight sleep',()=>{
 const result=journal.summarize([{date:'2026-09-01',time:'23:30',category:'수면',sleepMinutes:120},{date:'2026-09-02',feedingMl:90},{date:'2026-09-02',feedingMl:0},{date:'2026-09-02',temperature:36.5},{date:'2026-09-02',temperature:37}], '2026-09-02','2026-09-03');
 expect(result.days[0]).toMatchObject({feedingMl:90,feedingCount:2,sleepMinutes:90,temperature:37});
 expect(result.days[1]).toMatchObject({feedingMl:null,sleepMinutes:null,recordCount:0});
 expect(()=>journal.daysBetween('2026-09-03','2026-09-01')).toThrow();
 expect(()=>journal.daysBetween('2026-02-30','2026-03-03')).toThrow();
});
test('report escapes family content and lists measurement dates independently',()=>{
 const summary=journal.summarize([{date:'2026-09-01',weight:6,title:'<img onerror=alert(1)>',note:'<script>x</script>',category:'건강·병원'}],'2026-09-01','2026-09-02');
 const html=journal.reportHtml({name:'<baby>'},summary,'2026-09-01','2026-09-02','<script>x</script>');
 expect(html).not.toContain('<script>');expect(html).toContain('&lt;baby&gt;');expect(html).toContain('6 kg');expect(html).toContain('미기록');
});
test('memory selection includes first moments and photos with month filter',()=>{
 const rows=[{date:'2026-09-01',category:'첫 순간'},{date:'2026-08-01',category:'놀이',photoPaths:['path']},{date:'2026-09-02',category:'수유·이유식'}];
 expect(journal.memories(rows)).toHaveLength(2);expect(journal.memories(rows,'2026-09')).toEqual([rows[0]]);
});
test('photo backup deduplicates originals and validates checksums and references',async()=>{
 const tables={growth_entries:[{id:'a',photo_paths:['home/a']},{id:'b',photo_paths:['home/a']}]};let calls=0;
 const context={mode:'remote',householdId:'home',supabase:{storage:{from:()=>({download:async()=>{calls++;return {data:new Blob(['photo'],{type:'image/jpeg'})};}})}}};
 const photos=await media.collect(tables,context,op=>op(),()=>{},()=>true);
 expect(calls).toBe(1);expect(photos).toHaveLength(1);expect(tables.growth_entries[1].photo_refs).toEqual(tables.growth_entries[0].photo_refs);
 const payload=backup.createBackupPayload('home',{...tables,family_todos:[{id:'a',visibility:'family'},{id:'secret',visibility:'private'}]});payload.photos=photos;
 expect(payload.tables.family_todos).toHaveLength(1);expect(payload.tables.growth_entries[0].photo_paths).toBeUndefined();
 expect((await media.validate(payload)).size).toBe(1);
 await expect(media.validate({...payload,photos:[{...photos[0],data:btoa('corrupt')}]})).rejects.toThrow();
});
test('photo failures never create a silently incomplete backup',async()=>{
 const context={mode:'remote',householdId:'home',supabase:{storage:{from:()=>({download:async()=>({error:new Error('missing')})})}}};
 await expect(media.collect({growth_entries:[{photo_paths:['home/missing']}]},context,op=>op(),()=>{},()=>true)).rejects.toThrow();
 await expect(media.collect({growth_entries:[{photo_paths:['other/a']}]},context,op=>op(),()=>{},()=>true)).rejects.toThrow();
});
test('legacy v2 backup ids remain compatible with original canonicalization',()=>{
 const tables={events:[],growth_entries:[],calendar_members:[],babies:[]};
 const payload={schemaVersion:2,householdFingerprint:backup.householdFingerprint('home'),tables,backupId:backup.createBackupId('home',tables,2)};
 expect(backup.validateBackupPayload(payload,'home').ok).toBe(true);
});
