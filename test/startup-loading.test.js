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
 const source=app.slice(app.indexOf('async function init()'),app.indexOf('async function waitForCoreModules()'));
 let resolveModules,resolveData;
 const modules=new Promise(r=>resolveModules=r),data=new Promise(r=>resolveData=r);
 const activate=vi.fn(),bootstrapData=vi.fn(async(_attempt,ready)=>{await data;await ready;});
 const state={};const window={dispatchEvent(){},FAMILY_MOTION_API:{activate}};
 const shell={ariaBusy:'true'},status={hidden:false};
 const nodes={'#appShell':shell,'#familyStartupStatus':status,'#demoModeBanner':{},'#simpleNavigation':{}};
 const updateAuthGate=vi.fn();
 const context={state,window,config:{},DEMO_MODE:false,document:{body:{classList:{toggle(){}}}},$:selector=>nodes[selector],lockMobileZoom(){},bindUi(){},renderDailyVerse(){},updateCareTimerClock(){},updateAuthGate,setInterval(){},waitForCoreModules:()=>modules,bootstrapData,CustomEvent:class{},console};
 vm.createContext(context);vm.runInContext(source,context);const pending=context.init();
 expect(bootstrapData).toHaveBeenCalledWith(0,modules);expect(activate).not.toHaveBeenCalled();
 resolveData();await Promise.resolve();
 expect(shell.ariaBusy).toBe('true');expect(status.hidden).toBe(false);
 resolveModules();await pending;
 expect(shell.ariaBusy).toBe('false');expect(status.hidden).toBe(true);
 expect(updateAuthGate).toHaveBeenCalledOnce();expect(activate).toHaveBeenCalledOnce();
});

test('the initial HTML hides the original app shell while the current navigation loads',()=>{
 const html=readFileSync('index.html','utf8');
 expect(html).toMatch(/#appShell\[aria-busy="true"\]\s*\{\s*visibility:\s*hidden/);
 expect(html).toContain('id="appShell" aria-busy="true" inert');
 expect(html).toContain('id="familyStartupStatus" role="status"');
});

function calendarRefreshHarness() {
 const app = readFileSync('app.js', 'utf8');
 const source = app.slice(app.indexOf('function readHouseholdEvents('), app.indexOf('function toRemote('));
 const base = { id: 'event-1', title: '기존 일정', date: '2026-11-19', endDate: '2026-11-19', time: '', member: '아빠', note: '' };
 const row = { id: 'event-2', title: '새 가족 일정', event_date: '2026-11-20', event_end_date: '2026-11-20', event_time: null, member: '아빠', note: null };
 const nodes = { '#calendarView': {}, '#appShell': { ariaBusy: 'false' }, '#eventDialog': { open: false }, '#bulkEventDialog': { open: false } };
 let resolve;
 const order = vi.fn(() => new Promise(ready => { resolve = ready; }));
 const eq = vi.fn(() => ({ order }));
 const from = vi.fn(() => ({ select: () => ({ eq }) }));
 const state = { supabase: { from }, session: { user: { id: 'user-1' } }, household: { id: 'home-1' }, activeView: 'calendar', calendarMember: '아빠', events: [base] };
 const renderCalendar = vi.fn();
 const context = { state, document: { hidden: false }, $: key => nodes[key], DEMO_MODE: false,
  completedBootstrapRequestId: 1, bootstrapRequestId: 1, calendarRefreshRequest: null,
  eventSaveInProgress: false, bulkEventSaveInProgress: false, eventMovePromises: new Map(), dragState: null,
  window: { FAMILY_DATA: { readAll: query => query() } }, normalizeEvent: event => event,
  withAuthRecovery: operation => operation(), renderCalendar, renderHeader() {}, renderAgenda() {}, renderUpcomingEvents() {},
 };
 context.isCurrentBootstrap = (generation, userId) => context.bootstrapRequestId === generation && state.session.user.id === userId;
 vm.createContext(context);
 vm.runInContext(source, context);
 return { context, state, base, row, nodes, eq, from, renderCalendar, resolve: value => resolve(value) };
}

test('calendar refresh reads only the active family, coalesces overlapping requests, and preserves current filters', async () => {
 const h = calendarRefreshHarness();
 const refresh = h.context.refreshCalendarEvents();
 await h.context.refreshCalendarEvents();
 expect(h.from).toHaveBeenCalledExactlyOnceWith('events');
 expect(h.eq).toHaveBeenCalledExactlyOnceWith('household_id', 'home-1');
 const originalRow = { ...h.row, id: h.base.id, title: h.base.title, event_date: h.base.date, event_end_date: h.base.endDate };
 h.resolve({ data: [originalRow, h.row], error: null });
 await refresh;
 expect(h.state.events).toEqual([h.base, expect.objectContaining({ id: 'event-2', member: '아빠', date: '2026-11-20' })]);
 expect(h.state.events[0]).toBe(h.base);
 expect(h.state.calendarMember).toBe('아빠');
 expect(h.renderCalendar).toHaveBeenCalledOnce();
});

test.each([
 ['background tab', h => { h.context.document.hidden = true; }],
 ['another view', h => { h.state.activeView = 'growth'; }],
 ['bootstrap', h => { h.context.bootstrapRequestId += 1; }],
 ['open event editor', h => { h.nodes['#eventDialog'].open = true; }],
 ['ongoing event deletion', h => { h.context.eventSaveInProgress = true; }],
 ['batch add with a dismissed editor', h => { h.context.bulkEventSaveInProgress = true; }],
 ['drag update', h => { h.context.eventMovePromises.set('event-1', Promise.resolve()); }],
])('calendar refresh skips %s', async (_label, makeBusy) => {
 const h = calendarRefreshHarness();
 makeBusy(h);
 await h.context.refreshCalendarEvents();
 expect(h.from).not.toHaveBeenCalled();
});

test.each([
 ['switched family', h => { h.state.household = { id: 'home-2' }; h.context.bootstrapRequestId += 1; }],
 ['event draft opened', h => { h.nodes['#eventDialog'].open = true; }],
 ['local edit finished', h => { h.base.title = '변경된 일정'; }],
 ['local deletion finished', h => { h.state.events = []; }],
 ['local batch add finished', h => { h.state.events.push({ ...h.base, id: 'batch-event' }); }],
])('calendar refresh discards a stale response after a %s', async (_label, invalidate) => {
 const h = calendarRefreshHarness();
 const refresh = h.context.refreshCalendarEvents();
 invalidate(h);
 const current = h.state.events;
 h.resolve({ data: [h.row], error: null });
 await refresh;
 expect(h.state.events).toBe(current);
 expect(h.renderCalendar).not.toHaveBeenCalled();
});
