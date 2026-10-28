/** Owner-only append journal. Actual records belong in the configured Drive Doc. */
function ledgerError_(code) { throw new Error(code); }

function ledgerText_(value, max) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) ledgerError_('INVALID_RECORD');
  return value;
}

function ledgerDate_(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) ledgerError_('INVALID_RECORD');
  const d = new Date(value + 'T00:00:00Z');
  if (isNaN(d.getTime()) || d.toISOString().slice(0,10) !== value) ledgerError_('INVALID_RECORD');
  return value;
}

function ledgerRecord_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) ledgerError_('INVALID_RECORD');
  const id=ledgerText_(input.id,90);
  if (!/^[A-Za-z0-9:_-]+$/.test(id)) ledgerError_('INVALID_RECORD');
  const type=input.type, currency=input.currency;
  if (!['transaction','balance'].includes(type) || !['KRW','USD','EUR'].includes(currency)) ledgerError_('INVALID_RECORD');
  const missing=type==='balance'&&input.amount===null;
  const pattern=currency==='KRW'?/^(0|[1-9]\d{0,11})$/:/^(0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;
  if (!missing && (typeof input.amount!=='string' || !pattern.test(input.amount))) ledgerError_('INVALID_RECORD');
  const record={id,type,date:ledgerDate_(input.date),label:ledgerText_(input.label,120),amount:missing?null:input.amount,currency,basis:ledgerText_(input.basis,160),sourceLocation:ledgerText_(input.sourceLocation,200)};
  if (type==='transaction') {
    if (!['salary','bonus','income','expense','reimbursement','transfer','loan_principal','loan_interest','loan_payment','gift','refund','unclassified_income','unclassified_outflow'].includes(input.flow) || !['active','excluded','cancelled','cashback'].includes(input.status) || !['card','bank','manual'].includes(input.channel) || !['personal','company','household','unknown'].includes(input.attribution)) ledgerError_('INVALID_RECORD');
    Object.assign(record,{flow:input.flow,status:input.status,channel:input.channel,attribution:input.attribution,category:ledgerText_(input.category,50)});
  } else {
    if (!['asset','liability'].includes(input.balanceKind)) ledgerError_('INVALID_RECORD');
    record.balanceKind=input.balanceKind;
  }
  return record;
}

function ledgerParagraphs_(doc) {
  const result=[];
  function content(elements,tabId) {
    (elements||[]).forEach(el=>{
      if(el.paragraph) result.push({text:(el.paragraph.elements||[]).map(p=>p.textRun?.content||'').join(''),index:el.startIndex,tabId});
      if(el.table) (el.table.tableRows||[]).forEach(row=>(row.tableCells||[]).forEach(cell=>content(cell.content,tabId)));
    });
  }
  function tab(t){content(t.documentTab?.body?.content,t.tabProperties?.tabId);(t.childTabs||[]).forEach(tab);}
  if(doc.tabs?.length) doc.tabs.forEach(tab); else content(doc.body?.content,undefined);
  return result;
}

function readLedger_(doc, owner) {
  const paragraphs=ledgerParagraphs_(doc),begin=paragraphs.map((p,i)=>p.text.trim()==='ASSET_LEDGER_BEGIN_V1'?i:-1).filter(i=>i>=0),end=paragraphs.map((p,i)=>p.text.trim()==='ASSET_LEDGER_END_V1'?i:-1).filter(i=>i>=0);
  if (!begin.length && !end.length) return {initialized:false,records:[],history:[],revision:doc.revisionId||null};
  if (begin.length!==1 || end.length!==1 || end[0]<=begin[0] || paragraphs[begin[0]].tabId!==paragraphs[end[0]].tabId) ledgerError_('INVALID_LEDGER');
  const lines=paragraphs.slice(begin[0]+1,end[0]).flatMap(p=>p.text.split('\n')).map(l=>l.trim()).filter(Boolean);
  if (!lines.length || lines.length>20000) ledgerError_('INVALID_LEDGER');
  let header;
  try{header=JSON.parse(lines.shift());}catch(_){ledgerError_('INVALID_LEDGER');}
  if (header.schema!==1 || header.owner!==owner || header.scope!=='personal' || !Number.isInteger(header.seedCount) || header.seedCount<0 || !header.coverage) ledgerError_('INVALID_LEDGER');
  ledgerDate_(header.coverage.start);ledgerDate_(header.coverage.end);
  if(header.coverage.start>header.coverage.end) ledgerError_('INVALID_LEDGER');
  const records=new Map(),history=[],requests=new Map();let seeds=0,sawEvent=false;
  lines.forEach(line=>{
    let item;try{item=JSON.parse(line);}catch(_){ledgerError_('INVALID_LEDGER');}
    if(item.kind==='seed') {
      if(sawEvent)ledgerError_('INVALID_LEDGER');
      const r=ledgerRecord_(item.record);if(records.has(r.id))ledgerError_('INVALID_LEDGER');
      records.set(r.id,r);seeds++;
    } else if(item.kind==='event'||item.kind==='patch') {
      sawEvent=true;
      if(!/^[a-f0-9-]{36}$/.test(item.requestId||'') || requests.has(item.requestId) || item.sequence!==history.length+1 || typeof item.at!=='string' || !/^\d{4}-\d{2}-\d{2}T/.test(item.at))ledgerError_('INVALID_LEDGER');
      let before,after;
      if(item.kind==='patch'){
        before=records.get(item.id);
        if(item.changes!==undefined){
          if(!Array.isArray(item.changes)||!item.changes.length||item.changes.some(c=>!Array.isArray(c)||c.length!==3||typeof c[0]!=='string')||new Set(item.changes.map(c=>c[0])).size!==item.changes.length)ledgerError_('INVALID_LEDGER');
          item={...item,before:Object.fromEntries(item.changes.map(c=>[c[0],c[1]])),after:Object.fromEntries(item.changes.map(c=>[c[0],c[2]]))};
        }
        const keys=Object.keys(item.after||{}),prior=Object.keys(item.before||{});
        const editable=['date','label','amount','currency','basis','flow','status','channel','attribution','category'];
        if(!before||!keys.length||keys.length!==prior.length||keys.some(k=>!editable.includes(k)||!prior.includes(k)||JSON.stringify(before[k])!==JSON.stringify(item.before[k])))ledgerError_('INVALID_LEDGER');
        after=ledgerRecord_({...before,...item.after});
      }else{
        after=ledgerRecord_(item.after);before=records.get(after.id)||null;
        if(JSON.stringify(item.before)!==JSON.stringify(before))ledgerError_('INVALID_LEDGER');
      }
      const event={...item,before,after};
      records.set(after.id,after);history.push(event);requests.set(item.requestId,event);
    } else ledgerError_('INVALID_LEDGER');
  });
  if(seeds!==header.seedCount)ledgerError_('INVALID_LEDGER');
  return {initialized:true,header,records:[...records.values()],history,requests,revision:doc.revisionId||null,journalText:paragraphs.slice(begin[0],end[0]+1).map(p=>p.text.trimEnd()).join('\n')+'\n',endIndex:paragraphs[end[0]].index,tabId:paragraphs[end[0]].tabId};
}

function ledgerView_(doc, owner, activeProgram) {
  const state=readLedger_(doc,owner);
  return {initialized:state.initialized,records:state.records,history:state.history.slice(-100).reverse(),historyCount:state.history.length,revision:state.revision,coverage:state.header?.coverage||null,userEditedIds:[...new Set(state.history.map(e=>e.after.id))],writable:activeProgram===true&&PropertiesService.getScriptProperties().getProperty('PROGRAM_WRITES_ENABLED')==='true'};
}

/** Confirmed KRW observations only. Bank payments never become card consumption. */
function ledgerMonthly_(program) {
  if(!program.initialized)return null;
  const source=program.records.filter(r=>r.type==='transaction'&&r.currency==='KRW');
  const end=source.reduce((last,r)=>r.date>last?r.date:last,program.coverage.end),start=program.coverage.start;
  const serial=month=>Number(month.slice(0,4))*12+Number(month.slice(5,7))-1;
  if(serial(end)-serial(start)>240)ledgerError_('INVALID_LEDGER');
  const rows=[];
  for(let serialMonth=serial(start);serialMonth<=serial(end);serialMonth++){
    const month=Math.floor(serialMonth/12)+'-'+String(serialMonth%12+1).padStart(2,'0'),covered=month>=program.coverage.start.slice(0,7)&&month<=program.coverage.end.slice(0,7);
    const transactions=source.filter(r=>r.date.startsWith(month)&&r.status==='active');
    function sum(select,zeroWhenCovered){const selected=transactions.filter(select);if(!selected.length)return covered&&zeroWhenCovered?0:null;const value=selected.reduce((total,r)=>total+Number(r.amount),0);if(!Number.isSafeInteger(value))ledgerError_('INVALID_LEDGER');return value;}
    rows.push({month,salary:sum(r=>r.flow==='salary',false),bonus:sum(r=>r.flow==='bonus',true),otherIncome:sum(r=>r.flow==='income',true),card:sum(r=>r.channel==='card'&&r.flow==='expense',true),reimbursement:sum(r=>r.flow==='reimbursement',true)});
  }
  return {rows,start,end,fromLedger:true,reconciled:true};
}

/** Analysis reports observations, never gross card use minus reimbursements. */
function ledgerAnalysis_(program) {
  if(!program.initialized)return null;
  const active=program.records.filter(r=>r.type==='transaction'&&r.status==='active');
  const cards=active.filter(r=>r.currency==='KRW'&&r.channel==='card'&&r.flow==='expense');
  const amount=rows=>{const total=rows.reduce((s,r)=>s+Number(r.amount),0);if(!Number.isSafeInteger(total))ledgerError_('INVALID_LEDGER');return total;};
  const observed=rows=>rows.length?amount(rows):null;
  const category=new Map(),merchants=new Map();
  cards.forEach(r=>{
    const name=r.category.replace(/^참고·/,'');
    if(!category.has(name))category.set(name,{label:name,amount:0,count:0,provisional:false});
    const c=category.get(name);c.amount+=Number(r.amount);c.count++;c.provisional=c.provisional||r.category.startsWith('참고·');
    if(!merchants.has(r.label))merchants.set(r.label,{label:r.label,amount:0,count:0});
    const m=merchants.get(r.label);m.amount+=Number(r.amount);m.count++;
  });
  const krw=active.filter(r=>r.currency==='KRW');
  const personal=cards.filter(r=>r.attribution==='personal'),company=cards.filter(r=>r.attribution==='company'),unresolved=cards.filter(r=>r.attribution==='unknown');
  return {
    period:{...program.coverage,start:active.reduce((d,r)=>r.date<d?r.date:d,program.coverage.start),end:active.reduce((d,r)=>r.date>d?r.date:d,program.coverage.end)},currency:'KRW',cardUse:observed(cards),cardCount:cards.length,
    confirmedIncome:observed(krw.filter(r=>['salary','bonus','income'].includes(r.flow))),
    reimbursements:observed(krw.filter(r=>r.flow==='reimbursement')),
    unclassifiedCredits:observed(krw.filter(r=>r.flow==='unclassified_income')),
    personalCard:personal.length?amount(personal):null,companyCard:company.length?amount(company):null,
    unresolvedCard:amount(unresolved),unresolvedCount:unresolved.length,
    categories:[...category.values()].sort((a,b)=>b.amount-a.amount),merchants:[...merchants.values()].sort((a,b)=>b.amount-a.amount).slice(0,12),
    review:unresolved.sort((a,b)=>Number(b.amount)-Number(a.amount)).slice(0,12).map(r=>r.id),
    foreign:active.filter(r=>r.currency!=='KRW'&&r.flow==='expense'),
    netPersonalSpending:null,completeCashflow:false
  };
}

/** A single validated command; no caller-supplied document ID or owner. */
function saveRecord(command) {
  try { return saveRecordForOwner_(command,assertSession_()); }
  catch (_) { return {error:'ACCESS_DENIED'}; }
}

/** Internal only: caller must have authenticated the deploying owner. */
function saveRecordForOwner_(command,email) {
  let lock;
  try {
    if(PropertiesService.getScriptProperties().getProperty('PROGRAM_WRITES_ENABLED')!=='true')return {error:'WRITE_NOT_ENABLED'};
    if(!command || !/^[a-f0-9-]{36}$/.test(command.requestId||'') || typeof command.expectedRevision!=='string')return {error:'INVALID_RECORD'};
    const after=ledgerRecord_(command.record);
    if(after.date>new Date(Date.now()+9*3600*1000).toISOString().slice(0,10))return {error:'INVALID_RECORD'};
    lock=LockService.getScriptLock();if(!lock.tryLock(3000))return {error:'WRITE_BUSY'};
    const properties=PropertiesService.getScriptProperties(),sourceId=properties.getProperty('SOURCE_DOC_ID'),id=properties.getProperty('PROGRAM_DOC_ID');
    if(!id||!sourceId||id===sourceId||![id,sourceId].every(v=>/^[a-zA-Z0-9_-]+$/.test(v)))return {error:'SOURCE_NOT_CONFIGURED'};
    const sourceBefore=sourceMetadata_(sourceId);assertPrivateSource_(sourceBefore,email);
    const beforeMeta=sourceMetadata_(id);assertProgramSource_(beforeMeta,sourceBefore,email);
    const summary=parseDocument_(documentText_(Docs.Documents.get(sourceId,{includeTabsContent:true})));
    const doc=Docs.Documents.get(id,{includeTabsContent:true});
    const state=readLedger_(doc,summary.owner);
    const confirmedMeta=sourceMetadata_(id);assertProgramSource_(confirmedMeta,sourceBefore,email);
    const sourceAfter=sourceMetadata_(sourceId);assertPrivateSource_(sourceAfter,email);
    if(beforeMeta.modifiedTime!==confirmedMeta.modifiedTime||sourceBefore.modifiedTime!==sourceAfter.modifiedTime)return {error:'SOURCE_CHANGED'};
    if(!state.initialized)return {error:'LEDGER_NOT_INITIALIZED'};
    const previousRequest=state.requests.get(command.requestId);
    if(previousRequest){if(JSON.stringify(previousRequest.after)!==JSON.stringify(after))return {error:'REQUEST_CONFLICT'};return {ok:true,replayed:true,revision:state.revision};}
    if(!doc.revisionId || doc.revisionId!==command.expectedRevision)return {error:'SOURCE_CHANGED'};
    if(state.history.length>=10000 || state.records.length>=10000&&!state.records.some(r=>r.id===after.id))return {error:'LEDGER_LIMIT'};
    const before=state.records.find(r=>r.id===after.id)||null;
    if(before && (before.type!==after.type || before.balanceKind!==after.balanceKind || before.sourceLocation!==after.sourceLocation))return {error:'INVALID_RECORD'};
    if(!before && (!after.id.startsWith('manual:') || after.sourceLocation!=='사용자 직접 입력'))return {error:'INVALID_RECORD'};
    const event={kind:before?'patch':'event',requestId:command.requestId,sequence:state.history.length+1,at:new Date().toISOString()};
    if(before){
      const keys=Object.keys(after).filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k]));
      if(!keys.length)return {ok:true,unchanged:true,revision:state.revision};
      Object.assign(event,{id:after.id,changes:keys.map(k=>[k,before[k],after[k]])});
    }else Object.assign(event,{before:null,after});
    const insertion=JSON.stringify(event)+'\n';
    if(documentText_(doc).length+insertion.length>900000)return {error:'LEDGER_LIMIT'};
    const result=Docs.Documents.batchUpdate({writeControl:{requiredRevisionId:doc.revisionId},requests:[{insertText:{location:{index:state.endIndex,...(state.tabId?{tabId:state.tabId}:{})},text:insertion}}]},id);
    const sourceFinal=sourceMetadata_(sourceId);assertPrivateSource_(sourceFinal,email);assertProgramSource_(sourceMetadata_(id),sourceFinal,email);
    return {ok:true,revision:result.writeControl?.requiredRevisionId||null};
  } catch(error) {
    const safe=['ACCESS_DENIED','PRIVATE_SOURCE_REQUIRED','INVALID_RECORD','INVALID_LEDGER'];
    return {error:safe.includes(error.message)?error.message:'SAVE_FAILED'};
  } finally {if(lock?.hasLock())lock.releaseLock();}
}
