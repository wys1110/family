import {test,expect,vi} from 'vitest';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const worker=readFileSync('service-worker.js','utf8');
function request(url,method='GET'){
 const handlers={};const fetch=vi.fn(()=>Promise.resolve({ok:true}));
 const self={location:{origin:'https://family.example'},addEventListener:(name,fn)=>{handlers[name]=fn;}};
 vm.runInNewContext(worker,{self,URL,fetch});
 const respondWith=vi.fn();handlers.fetch({request:{url,method},respondWith});return {fetch,respondWith};
}
test('versioned runtime assets use HTTP cache while each version retains its own URL',()=>{
 for(const version of ['old','new']){
 const url=`https://family.example/motion-system.js?v=${version}`;
 const r=request(url);expect(r.fetch).toHaveBeenCalledWith({url,method:'GET'},{cache:'force-cache'});
 }
});
test('manifest and unversioned code always check the network',()=>{
 for(const url of ['https://family.example/config.js?v=latest','https://family.example/daily-briefing.js'])expect(request(url).fetch.mock.calls[0][1]).toEqual({cache:'no-store'});
});
test('private data, foreign origins and mutations are never handled by the asset cache',()=>{
 for(const [url,method] of [['https://database.example/rest/v1/events?v=1','GET'],['https://family.example/photos/child.jpg?v=1','GET'],['https://family.example/daily-briefing.js?v=1','POST'],['https://family.example/?v=1','GET']])expect(request(url,method).respondWith).not.toHaveBeenCalled();
});
test('initialization starts data loading while modules are still pending',async()=>{
 const app=readFileSync('app.js','utf8');
 const source=app.slice(app.indexOf('async function init()'),app.indexOf('async function waitForWallpaperEditor()'));
 let resolveModules,resolveData;
 const modules=new Promise(r=>resolveModules=r),data=new Promise(r=>resolveData=r);
 const activate=vi.fn(),bootstrapData=vi.fn(async(_attempt,ready)=>{await data;await ready;});
 const state={};const window={dispatchEvent(){},FAMILY_MOTION_API:{activate}};
 const context={state,window,config:{},DEMO_MODE:false,document:{body:{classList:{toggle(){}}}},$:()=>({}),lockMobileZoom(){},bindUi(){},renderDailyVerse(){},updateCareTimerClock(){},setInterval(){},waitForWallpaperEditor:()=>modules,bootstrapData,CustomEvent:class{},console};
 vm.createContext(context);vm.runInContext(source,context);const pending=context.init();
 expect(bootstrapData).toHaveBeenCalledWith(0,modules);expect(activate).not.toHaveBeenCalled();
 resolveData();await Promise.resolve();expect(activate).not.toHaveBeenCalled();resolveModules();await pending;expect(activate).toHaveBeenCalledOnce();
});
