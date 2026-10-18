import {test,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const app=readFileSync('app.js','utf8');
function harness(upload){
 const remove=vi.fn(async()=>({}));
 const context={window:{},state:{household:{id:'h'},session:{user:{id:'u'}},supabase:{storage:{from:()=>({upload,remove})}}},growthPhotoDraft:{newPhotos:[{file:{type:'image/jpeg'}}]},GROWTH_PHOTO_BUCKET:'photos',uid:()=> 'id',withAuthRecovery:op=>op(),createGrowthThumbnail:async()=>({thumbnail:true})};
 vm.createContext(context);vm.runInContext(readFileSync('family-data.js','utf8'),context);
 vm.runInContext(app.slice(app.indexOf('async function uploadGrowthPhotos('),app.indexOf('async function saveGrowthEntry(')),context);
 const uploadPhotos = context.uploadGrowthPhotos;
 context.uploadGrowthPhotos = entryId => {
  const client = context.state.supabase, householdId = context.state.household.id, userId = context.state.session.user.id;
  return uploadPhotos(entryId, { client, householdId, userId, photos: [...context.growthPhotoDraft.newPhotos], current: () => context.state.supabase === client && context.state.household.id === householdId && context.state.session.user.id === userId });
 };
 return {...context,remove};
}
test('new photos use paired thumbnails; legacy paths remain unchanged',async()=>{
 const upload=vi.fn(async()=>({})),h=harness(upload);
 expect(await h.uploadGrowthPhotos('entry')).toEqual(['h/entry/id--preview.jpg']);
 expect(upload.mock.calls.map(c=>c[0])).toEqual(['h/entry/id--preview.jpg.thumb.jpg','h/entry/id--preview.jpg']);
 expect(h.window.FAMILY_DATA.photoStoragePaths(['legacy.jpg','h/entry/id--preview.jpg'])).toEqual(['legacy.jpg','h/entry/id--preview.jpg','h/entry/id--preview.jpg.thumb.jpg']);
});
test.each(['returned','thrown'])('thumbnail %s failures still save the full photo',async mode=>{
 const upload=vi.fn().mockImplementationOnce(async()=>{if(mode==='thrown')throw Error('offline');return {error:Error('offline')};}).mockResolvedValue({});
 const h=harness(upload);expect(await h.uploadGrowthPhotos('entry')).toEqual(['h/entry/id.jpg']);
});
test('original upload failure removes both attempted objects',async()=>{
 const h=harness(vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(Error('offline')));
 await expect(h.uploadGrowthPhotos('entry')).rejects.toThrow('offline');
 expect(h.remove).toHaveBeenCalledWith(['h/entry/id--preview.jpg.thumb.jpg','h/entry/id--preview.jpg']);
});
test('switching families during thumbnail preparation cannot upload to the new family',async()=>{
 const upload=vi.fn(),h=harness(upload);h.createGrowthThumbnail=async()=>null;
 const pending=h.uploadGrowthPhotos('entry');h.state.household={id:'other'};
 await expect(pending).rejects.toThrow('Family context changed');expect(upload).not.toHaveBeenCalled();
});
test('a preview upload completing after an account switch cannot upload or clean up in the new account',async()=>{
 let finish;
 const upload=vi.fn(()=>new Promise(resolve=>{finish=resolve;})),h=harness(upload);
 const pending=h.uploadGrowthPhotos('entry');
 await new Promise(resolve=>setTimeout(resolve,0));
 h.state.session={user:{id:'next-user'}};
 finish({});
 await expect(pending).rejects.toThrow('Family context changed');
 expect(upload).toHaveBeenCalledTimes(1);
 expect(h.remove).not.toHaveBeenCalled();
});
