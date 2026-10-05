import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,test} from 'vitest';
const source=readFileSync('app.js','utf8');
function load(name,end,context){
 const start=source.indexOf(`function ${name}(`);
 expect(start).toBeGreaterThan(-1);
 vm.runInNewContext(`${source.slice(start,source.indexOf(`function ${end}(`,start))}; this.run=${name};`,context);
 return context.run;
}
test('month list includes overlapping ranges, filters members, sorts and does not truncate',()=>{
 const events=[{id:'cross',date:'2026-09-29',endDate:'2026-10-02',member:'엄마'},
  {id:'outside',date:'2026-11-01',member:'엄마'}, {id:'other',date:'2026-10-01',member:'아빠'},
  ...Array.from({length:25},(_,i)=>({id:`event${i}`,date:'2026-10-03',time:'09:00',member:'엄마'}))];
 const state={events,calendarMember:'엄마',viewDate:new Date(2026,9,1)};
 const context={state,dateKey:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
 const select=load('calendarMonthEvents','renderCalendarMonthList',context);
 expect(select().map(e=>e.id)).toEqual(['cross',...events.slice(3).map(e=>e.id)]);
 expect(events).toHaveLength(28);
});
test('growth period is inclusive, combines category/photo and rejects reversed dates',()=>{
 const state={growthFilter:'all',growthCategory:'수유·이유식',growthFrom:'2026-08-02',growthTo:'2026-08-04'};
 const select=load('filterGrowthEntries','renderGrowthFilters',{state,dateKey:()=> '2026-08-04'});
 const entries=[{id:'start',date:'2026-08-02',category:'수유·이유식'},
 {id:'end',date:'2026-08-04',category:'수유·이유식',photoPaths:['photo']},
 {id:'early',date:'2026-08-01',category:'수유·이유식'}, {id:'other',date:'2026-08-03',category:'수면'}];
 expect(select(entries).map(e=>e.id)).toEqual(['start','end']);
 state.growthFilter='photo'; expect(select(entries).map(e=>e.id)).toEqual(['end']);
 state.growthFrom='2026-08-05'; expect(select(entries)).toEqual([]);
});

test('every baby switch clears only record restrictions, including create/archive/restore render paths',()=>{
 const state={activeBabyId:'baby-a',growthFilterBabyId:'baby-a',growthCategory:'수면',growthFrom:'2026-08-02',growthTo:'2026-08-04'};
 const start=source.indexOf('function renderGrowth() {');
 const prefix=source.slice(start,source.indexOf('  const baby = activeBaby();',start));
 const context={state};vm.runInNewContext(`${prefix}};this.render=renderGrowth;`,context);
 context.render();expect(state.growthCategory).toBe('수면');
 state.activeBabyId='baby-b';context.render();
 expect([state.growthCategory,state.growthFrom,state.growthTo]).toEqual(['','','']);
});
test('setting a period preserves a non-today mode in the actual input handler',()=>{
 const state={growthFilter:'photo'};let handler;
 const start=source.indexOf('  $("#growthRecordFilters").addEventListener("change"');
 const script=source.slice(start,source.indexOf('  $("#growthResetFilters")',start));
 const nodes={'#growthRecordFilters':{addEventListener:(_name,fn)=>{handler=fn;}},'#growthCategoryFilter':{value:'수면'},'#growthFrom':{value:'2026-08-01'},'#growthTo':{value:'2026-08-31'}};
 vm.runInNewContext(script,{state,$:selector=>nodes[selector],renderGrowth(){}});
 handler({target:{type:'date'}});expect(state.growthFilter).toBe('photo');
 expect(state.growthCategory).toBe('수면');state.growthFilter='today';handler({target:{type:'date'}});expect(state.growthFilter).toBe('all');
});
