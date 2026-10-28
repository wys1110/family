import { test } from 'vitest';
import {createHmac,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {syntheticDocument} from '../integrations/private-assets-appscript/synthetic-fixture.mjs';
const source=['Code.gs','Ledger.gs','Storage.gs'].map(f=>readFileSync(new URL('../integrations/private-assets-appscript/'+f,import.meta.url),'utf8')).join('\n');
const email='owner@example.invalid',requestId='10000000-0000-4000-8000-000000000001';
const card=()=>({id:'card:demo-1',type:'transaction',date:'2026-01-01',label:'가상 식료품',amount:'10000',currency:'KRW',basis:'카드 사용일',sourceLocation:'합성 원본 / 1',flow:'expense',status:'active',channel:'card',attribution:'unknown',category:'식료품'});
const header={schema:1,owner:'가상 사용자',scope:'personal',seedCount:1,coverage:{start:'2026-01-01',end:'2026-09-30'}};
const journal=()=>['ASSET_LEDGER_BEGIN_V1',JSON.stringify(header),JSON.stringify({kind:'seed',record:card()}),'ASSET_LEDGER_END_V1',''].join('\n');
function asDoc(text,revision='r1'){
  let index=1;
  return {revisionId:revision,tabs:[{tabProperties:{tabId:'t.demo'},documentTab:{body:{content:text.match(/[^\n]*\n|[^\n]+$/g).map(text=>{const startIndex=index;index+=text.length;return {startIndex,endIndex:index,paragraph:{elements:[{textRun:{content:text}}]}};})}}}]};
}
function runtime({enabled=true,active=email,shared=false,text=syntheticDocument+journal(),metadataHook,batchHook}={}){
  let doc=asDoc(text),originalDoc=asDoc(text,'original-r1'),reads=0,writes=0,metaReads=0,released=false;
  const properties={SOURCE_DOC_ID:'synthetic_source',PROGRAM_DOC_ID:'synthetic_doc',PROGRAM_FOLDER_ID:'synthetic_folder',PROGRAM_SETUP_KEY:'10000000-0000-4000-8000-000000000009',PROGRAM_WRITES_ENABLED:enabled?'true':'false'};
  const privateFile=id=>({id,mimeType:id==='synthetic_folder'?'application/vnd.google-apps.folder':'application/vnd.google-apps.document',shared,trashed:false,parents:['synthetic_folder'],isAppAuthorized:id==='synthetic_doc',appProperties:{assetProgramSetup:properties.PROGRAM_SETUP_KEY},modifiedTime:id==='synthetic_source'?'original-r1':doc.revisionId,owners:[{emailAddress:email}],permissions:[{type:'user',role:'owner',emailAddress:email}]});
  const lock={tryLock:()=>true,hasLock:()=>true,releaseLock:()=>{released=true;}};
  const context=vm.createContext({Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>email})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]})},LockService:{getScriptLock:()=>lock},Drive:{Files:{get:id=>metadataHook?metadataHook(++metaReads,privateFile(id),id,writes):(metaReads++,privateFile(id))}},Docs:{Documents:{get:id=>{reads++;return JSON.parse(JSON.stringify(id==='synthetic_source'?originalDoc:doc));},batchUpdate:(request,id)=>{writes++;if(batchHook)return batchHook(request,id);assert.equal(id,'synthetic_doc');assert.equal(request.writeControl.requiredRevisionId,doc.revisionId);const insertion=request.requests[0].insertText;assert.equal(insertion.location.tabId,'t.demo');const old=context.documentText_(doc);const raw=doc.tabs[0].documentTab.body.content.map(p=>p.paragraph.elements[0].textRun.content).join('');const i=insertion.location.index-1;assert.ok(raw.slice(i).startsWith('ASSET_LEDGER_END_V1'));text=raw.slice(0,i)+insertion.text+raw.slice(i);assert.ok(old.includes('ASSET_LEDGER_END_V1'));doc=asDoc(text,'r'+(writes+1));return {writeControl:{requiredRevisionId:doc.revisionId}};}}}});
  vm.runInContext(source,context);
  const plain=f=>(...args)=>JSON.parse(JSON.stringify(context[f](...args)));
  return {save:plain('saveRecord'),read:()=>plain('readLedger_')(doc,'가상 사용자'),validate:plain('ledgerRecord_'),dashboard:plain('getDashboard'),context,counts:()=>({reads,writes,metaReads,released}),setText:t=>{doc=asDoc(t);},text:()=>text,originalText:()=>context.documentText_(originalDoc)};
}
test('journal seeds preserve their identity and missing balance amounts stay unknown',()=>{
  const r=runtime();assert.equal(r.read().records.length,1);assert.equal(r.read().history.length,0);
  const balance={id:'balance:demo',type:'balance',date:'2026-01-01',label:'가상 대출',amount:null,currency:'KRW',basis:'잔여 원금 미확인',sourceLocation:'합성 원본 / 2',balanceKind:'liability'};
  assert.equal(r.validate(balance).amount,null);
});
test('save, reload and edit preserve the original seed and before/after history',()=>{
  const r=runtime(),record={...card(),attribution:'company'};
  assert.deepEqual(r.save({requestId,expectedRevision:'r1',record}),{ok:true,revision:'r2'});
  const state=r.read();assert.equal(state.records[0].attribution,'company');assert.equal(state.history.length,1);assert.equal(state.history[0].before.attribution,'unknown');
  assert.ok(r.text().includes(JSON.stringify({kind:'seed',record:card()})));assert.equal(r.counts().released,true);
});
test('identical retry is idempotent even with the original revision; changed retry is rejected',()=>{
  const r=runtime(),record={...card(),attribution:'personal'};
  r.save({requestId,expectedRevision:'r1',record});
  assert.equal(r.save({requestId,expectedRevision:'r1',record}).replayed,true);
  assert.equal(r.save({requestId,expectedRevision:'r1',record:{...record,amount:'20000'}}).error,'REQUEST_CONFLICT');assert.equal(r.counts().writes,1);
});
test('stale revision does not overwrite a newer edit',()=>{
  const r=runtime();assert.equal(r.save({requestId,expectedRevision:'old',record:card()}).error,'SOURCE_CHANGED');assert.equal(r.counts().writes,0);
});
test('disabled writes, anonymous users and shared sources cannot mutate or expose records',()=>{
  for(const [options,error] of [[{enabled:false},'WRITE_NOT_ENABLED'],[{active:''},'ACCESS_DENIED'],[{active:'another@example.invalid'},'ACCESS_DENIED'],[{shared:true},'PRIVATE_SOURCE_REQUIRED']]){
    const r=runtime(options);assert.equal(r.save({requestId,expectedRevision:'r1',record:card()}).error,error);assert.equal(r.counts().writes,0);assert.equal(r.counts().reads,0);
  }
});
test('sharing changes during a read or after a write are rechecked',()=>{
  for(const afterWrite of [false,true]){
    const r=runtime({metadataHook:(n,file,id,writes)=>({...file,shared:afterWrite?writes>0:n>=2})});
    assert.equal(r.save({requestId,expectedRevision:'r1',record:{...card(),attribution:'personal'}}).error,'PRIVATE_SOURCE_REQUIRED');assert.equal(r.counts().writes,afterWrite?1:0);
  }
});
test('manual inserts require new manual identities and a disclosed source',()=>{
  const r=runtime();
  assert.equal(r.save({requestId,expectedRevision:'r1',record:{...card(),id:'other'}}).error,'INVALID_RECORD');
  const record={...card(),id:'manual:10000000-0000-4000-8000-000000000002',sourceLocation:'사용자 직접 입력'};
  assert.equal(r.save({requestId,expectedRevision:'r1',record}).ok,true);assert.equal(r.read().records.length,2);assert.equal(r.read().history[0].before,null);
});
test('invalid dates, imprecise currency amounts and unknown enums fail before any write',()=>{
  const r=runtime();
  for(const patch of [{date:'2026-02-30'},{date:'9999-01-01'},{amount:'1e3'},{amount:'-1'},{amount:'1.50'},{amount:1000},{currency:'XYZ'},{label:'bad\nlabel'},{flow:'buy_stock'},{status:'pending'}]){
    assert.equal(r.save({requestId,expectedRevision:'r1',record:{...card(),...patch}}).error,'INVALID_RECORD');
  }
  assert.equal(r.counts().writes,0);assert.equal(r.validate({...card(),currency:'USD',amount:'6.50'}).amount,'6.50');
});
test('an edit cannot silently replace the record type or original provenance',()=>{
  const r=runtime();assert.equal(r.save({requestId,expectedRevision:'r1',record:{...card(),sourceLocation:'different source'}}).error,'INVALID_RECORD');
  assert.equal(r.counts().writes,0);
});
test('duplicate seeds, broken markers, wrong owner and seed count discrepancies fail closed',()=>{
  for(const raw of [journal().replace('ASSET_LEDGER_END_V1',''),journal().replace(JSON.stringify(header),JSON.stringify({...header,owner:'another owner'})),journal().replace(JSON.stringify(header),JSON.stringify({...header,seedCount:2})),journal().replace('ASSET_LEDGER_END_V1',JSON.stringify({kind:'seed',record:card()})+'\nASSET_LEDGER_END_V1')]){
    assert.throws(()=>runtime({text:syntheticDocument+raw}).read(),/INVALID_LEDGER/);
  }
});
test('a document without a journal is uninitialized rather than an empty confirmed ledger',()=>{
  const r=runtime({text:syntheticDocument});assert.equal(r.read().initialized,false);assert.equal(r.save({requestId,expectedRevision:'r1',record:card()}).error,'LEDGER_NOT_INITIALIZED');
});
test('API failures reveal no private error messages and always release the lock',()=>{
  const r=runtime({batchHook:()=>{throw new Error('sensitive body from provider');}});
  assert.deepEqual(r.save({requestId,expectedRevision:'r1',record:{...card(),attribution:'personal'}}),{error:'SAVE_FAILED'});assert.equal(r.counts().released,true);
});
test('monthly program projection separates non-income receipts, foreign currency and internal transfers',()=>{
  const r=runtime();
  const record=(id,flow,amount,currency='KRW',channel='bank')=>({...card(),id,flow,amount,currency,channel});
  const p={initialized:true,coverage:{start:'2026-01-01',end:'2026-01-26'},records:[record('s','salary','1000000'),record('b','bonus','200000'),record('i','income','50000'),record('re','reimbursement','900000'),record('t','transfer','700000'),record('n','unclassified_income','50000'),record('u','expense','6500.00','USD'),record('l','loan_principal','100000'),record('c','expense','30000','KRW','card'),{...record('x','expense','500000','KRW','card'),status:'cancelled'}]};
  const m=JSON.parse(JSON.stringify(r.context.ledgerMonthly_(p)));
  assert.equal(m.rows[0].salary,1000000);assert.equal(m.rows[0].bonus,200000);assert.equal(m.rows[0].otherIncome,50000);assert.equal(m.rows[0].card,30000);assert.equal(m.rows[0].reimbursement,900000);
});
test('later observed months keep unobserved salary and cards unknown; edits update the projection',()=>{
  const r=runtime(),p={initialized:true,coverage:{start:'2026-01-01',end:'2026-01-26'},records:[card(),{...card(),id:'later',date:'2026-03-01',channel:'bank',flow:'salary',amount:'2000000'}]};
  let m=JSON.parse(JSON.stringify(r.context.ledgerMonthly_(p)));
  assert.equal(m.rows[1].card,null);assert.equal(m.rows[1].salary,null);assert.equal(m.rows[2].card,null);assert.equal(m.rows[2].salary,2000000);
  p.records[1].amount='2500000';m=JSON.parse(JSON.stringify(r.context.ledgerMonthly_(p)));assert.equal(m.rows[2].salary,2500000);
});
test('analysis never calls gross card usage minus reimbursement personal consumption',()=>{
  const r=runtime(),records=[card(),{...card(),id:'reimbursement',channel:'bank',flow:'reimbursement',amount:'10000',attribution:'company'},{...card(),id:'cancelled',amount:'50000',status:'cancelled'},{...card(),id:'usd',channel:'bank',currency:'USD',amount:'6.50'}];
  const a=JSON.parse(JSON.stringify(r.context.ledgerAnalysis_({initialized:true,records,coverage:header.coverage})));
  assert.equal(a.cardUse,10000);assert.equal(a.reimbursements,10000);assert.equal(a.personalCard,null);assert.equal(a.unresolvedCard,10000);assert.equal(a.netPersonalSpending,null);assert.equal(a.foreign.length,1);
  assert.equal(a.categories.reduce((sum,r)=>sum+r.amount,0),a.cardUse);assert.equal(a.completeCashflow,false);
});
test('analysis distinguishes absent verified income from a verified zero amount',()=>{
  const r=runtime(),program={initialized:true,records:[card()],coverage:header.coverage};
  assert.equal(r.context.ledgerAnalysis_(program).confirmedIncome,null);
  program.records.push({...card(),id:'zero-salary',channel:'bank',flow:'salary',amount:'0'});assert.equal(r.context.ledgerAnalysis_(program).confirmedIncome,0);
});

test('updates store a compact field delta while replay exposes the complete before/after record',()=>{
  const r=runtime(),original=r.originalText();r.save({requestId,expectedRevision:'r1',record:{...card(),attribution:'company'}});
  const event=JSON.parse(r.text().split('\n').find(line=>line.startsWith('{"kind":"patch"')));
  assert.deepEqual(event.changes,[['attribution','unknown','company']]);assert.equal(event.id,card().id);
  assert.ok(JSON.stringify(event).length<350);assert.equal(r.read().history[0].before.label,card().label);assert.equal(r.originalText(),original);
});
test('legacy full events and new compact patches replay in order without resetting history',()=>{
  const after={...card(),attribution:'personal'},event={kind:'event',requestId:'10000000-0000-4000-8000-000000000003',sequence:1,at:'2026-09-01T00:00:00.000Z',before:card(),after};
  const raw=syntheticDocument+journal().replace('ASSET_LEDGER_END_V1',JSON.stringify(event)+'\nASSET_LEDGER_END_V1');
  const r=runtime({text:raw});r.save({requestId,expectedRevision:'r1',record:{...after,category:'직접 확인 식료품'}});
  assert.equal(r.read().history.length,2);assert.equal(r.read().history[1].before.attribution,'personal');assert.equal(r.read().records[0].category,'직접 확인 식료품');
});
test('tampered compact deltas, immutable keys and unknown target IDs are rejected',()=>{
  const patch={kind:'patch',requestId,sequence:1,at:'2026-09-01T00:00:00.000Z',id:card().id,before:{attribution:'unknown'},after:{attribution:'personal'}};
  for(const item of [{...patch,before:{attribution:'company'}},{...patch,id:'unknown'},{...patch,before:{sourceLocation:card().sourceLocation},after:{sourceLocation:'changed'}},{...patch,after:{}}]){
    const raw=syntheticDocument+journal().replace('ASSET_LEDGER_END_V1',JSON.stringify(item)+'\nASSET_LEDGER_END_V1');
    assert.throws(()=>runtime({text:raw}).read(),/INVALID_LEDGER/);
  }
});
test('an unchanged save creates no revision or invented modification history',()=>{
  const r=runtime();assert.equal(r.save({requestId,expectedRevision:'r1',record:card()}).unchanged,true);assert.equal(r.counts().writes,0);assert.equal(r.read().history.length,0);
});
test('a document approaching the character guard is left untouched',()=>{
  const r=runtime({text:syntheticDocument+'\n'+'x'.repeat(900000)+'\n'+journal()});
  assert.equal(r.save({requestId,expectedRevision:'r1',record:{...card(),attribution:'personal'}}).error,'LEDGER_LIMIT');assert.equal(r.counts().writes,0);
});

// The signed API is tested against the same staged ledger, never a real Drive file.
const signedSource=readFileSync(new URL('../integrations/private-assets-appscript/SignedApi.gs',import.meta.url),'utf8');
const hmacSecret='cd'.repeat(32);
function signedRuntime(options={}){
  const r=runtime(options),context=r.context,base=context.PropertiesService.getScriptProperties();
  const properties={PRIVATE_ASSETS_HMAC_SECRET:hmacSecret,PRIVATE_ASSETS_API_ENABLED:'true'};
  let locked=false,acquisitions=0,releases=0;
  context.PropertiesService={getScriptProperties:()=>({getProperty:k=>Object.hasOwn(properties,k)?properties[k]:base.getProperty(k),setProperty:(k,v)=>{properties[k]=v;}})};
  context.LockService={getScriptLock:()=>({tryLock:()=>{if(locked||options.lockBusy)return false;locked=true;acquisitions++;return true;},hasLock:()=>locked,releaseLock:()=>{assert.equal(locked,true);locked=false;releases++;}})};
  context.Utilities={Charset:{UTF_8:'UTF-8'},newBlob:raw=>({getBytes:()=>[...Buffer.from(raw)]}),computeHmacSha256Signature:(raw,secret)=>[...createHmac('sha256',secret).update(raw).digest()]};
  context.ContentService={MimeType:{JSON:'application/json'},createTextOutput:text=>({setMimeType:()=>({getContent:()=>text})})};
  vm.runInContext(signedSource,context);
  const payload=(patch={})=>({v:1,action:'dashboard',timestamp:Date.now(),nonce:randomUUID(),...patch});
  const envelope=(body,key=hmacSecret)=>{const request=JSON.stringify(body);return {request,signature:createHmac('sha256',key).update(request).digest('hex')};};
  const post=value=>JSON.parse(context.doPost({postData:{contents:JSON.stringify(value)}}).getContent());
  return {...r,properties,payload,envelope,post,locks:()=>({locked,acquisitions,releases})};
}

test('signed owner dashboard works without an active browser session, while old wrappers remain protected',()=>{
  const r=signedRuntime({active:''});
  assert.equal(r.dashboard().error,'ACCESS_DENIED');
  const result=r.post(r.envelope(r.payload()));
  assert.equal(result.program.records.length,1);assert.equal(result.program.records[0].label,card().label);
  assert.deepEqual(r.locks(),{locked:false,acquisitions:1,releases:1});
});
test('unsigned, tampered, wrong-secret, stale and future requests cannot read Drive',()=>{
  const r=signedRuntime();
  const valid=r.envelope(r.payload());
  const tampered={...valid,request:valid.request.replace('dashboard','saveRecord')};
  for(const envelope of [{},tampered,{...valid,signature:'0'.repeat(64)},r.envelope(r.payload(),'ef'.repeat(32)),r.envelope(r.payload({timestamp:Date.now()-61000})),r.envelope(r.payload({timestamp:Date.now()+61000}))])assert.deepEqual(r.post(envelope),{error:'ACCESS_DENIED'});
  assert.equal(r.counts().reads,0);assert.equal(r.locks().acquisitions,0);
});
test('disabled or malformed secret configuration fails closed before reading Drive',()=>{
  for(const patch of [{PRIVATE_ASSETS_API_ENABLED:'false'},{PRIVATE_ASSETS_HMAC_SECRET:''},{PRIVATE_ASSETS_HMAC_SECRET:'short'}]){
    const r=signedRuntime();Object.assign(r.properties,patch);
    assert.deepEqual(r.post(r.envelope(r.payload())),{error:'ACCESS_DENIED'});assert.equal(r.counts().reads,0);
  }
});
test('caller emails, document IDs, unsupported actions and malformed command envelopes are rejected',()=>{
  const r=signedRuntime();
  for(const patch of [{email:'other@example.invalid'},{sourceDocId:'other'},{action:'initialize'},{action:'saveRecord',command:{}},{action:'saveRecord',command:{requestId,expectedRevision:'r1',record:card(),email:'other@example.invalid'}}])assert.deepEqual(r.post(r.envelope(r.payload(patch))),{error:'ACCESS_DENIED'});
  assert.equal(r.counts().reads,0);
});
test('nonce consumption is persistent and locked; replay never rereads Drive',()=>{
  const r=signedRuntime(),envelope=r.envelope(r.payload());
  assert.ok(r.post(envelope).program);const reads=r.counts().reads;
  assert.deepEqual(r.post(envelope),{error:'ACCESS_DENIED'});assert.equal(r.counts().reads,reads);
  assert.equal(Object.keys(JSON.parse(r.properties.PRIVATE_ASSETS_NONCES)).length,1);
  assert.deepEqual(r.locks(),{locked:false,acquisitions:2,releases:2});
});
test('nonce lock contention and corrupt nonce state fail closed',()=>{
  const busy=signedRuntime({lockBusy:true});assert.deepEqual(busy.post(busy.envelope(busy.payload())),{error:'ACCESS_DENIED'});assert.equal(busy.counts().reads,0);
  const corrupt=signedRuntime();corrupt.properties.PRIVATE_ASSETS_NONCES='not-json';assert.deepEqual(corrupt.post(corrupt.envelope(corrupt.payload())),{error:'ACCESS_DENIED'});assert.equal(corrupt.counts().reads,0);assert.equal(corrupt.locks().locked,false);
});
test('nonce expiry cleanup preserves replay protection and bounded capacity fails closed',()=>{
  const r=signedRuntime();r.properties.PRIVATE_ASSETS_NONCES=JSON.stringify({[randomUUID()]:Date.now()-121000});assert.ok(r.post(r.envelope(r.payload())).program);assert.equal(Object.keys(JSON.parse(r.properties.PRIVATE_ASSETS_NONCES)).length,1);
  const full=signedRuntime();full.properties.PRIVATE_ASSETS_NONCES=JSON.stringify(Object.fromEntries(Array.from({length:80},()=>[randomUUID(),Date.now()])));assert.deepEqual(full.post(full.envelope(full.payload())),{error:'ACCESS_DENIED'});assert.equal(full.counts().reads,0);
});
test('signed writes release replay lock before taking write lock, preserve idempotency and revision conflicts',()=>{
  const r=signedRuntime({active:''}),record={...card(),attribution:'personal'},command={requestId,expectedRevision:'r1',record};
  const save=()=>r.post(r.envelope(r.payload({action:'saveRecord',command})));
  assert.deepEqual(save(),{ok:true,revision:'r2'});assert.equal(r.counts().writes,1);
  assert.deepEqual(save(),{ok:true,replayed:true,revision:'r2'});assert.equal(r.counts().writes,1);
  assert.deepEqual(r.post(r.envelope(r.payload({action:'saveRecord',command:{...command,requestId:randomUUID(),record:{...record,category:'다른 가상 분류'}}}))),{error:'SOURCE_CHANGED'});
  assert.equal(r.counts().writes,1);assert.equal(r.locks().locked,false);assert.equal(r.locks().acquisitions,6);assert.equal(r.locks().releases,6);
});
test('signed writes retain private-file checks and never return provider exception text',()=>{
  const shared=signedRuntime({shared:true});assert.deepEqual(shared.post(shared.envelope(shared.payload())),{error:'PRIVATE_SOURCE_REQUIRED'});
  const failure=signedRuntime({batchHook:()=>{throw new Error('private token and document text');}});
  assert.deepEqual(failure.post(failure.envelope(failure.payload({action:'saveRecord',command:{requestId,expectedRevision:'r1',record:{...card(),attribution:'personal'}}}))),{error:'SAVE_FAILED'});assert.equal(failure.locks().locked,false);
});
test('signed envelope is bounded before parsing and old MYSELF manifest remains unchanged',()=>{
  const r=signedRuntime();assert.deepEqual(r.post({request:'x'.repeat(20001),signature:'0'.repeat(64)}),{error:'ACCESS_DENIED'});assert.equal(r.counts().reads,0);
  const manifest=JSON.parse(readFileSync(new URL('../integrations/private-assets-appscript/appsscript.json',import.meta.url),'utf8'));assert.equal(manifest.webapp.access,'MYSELF');assert.equal(manifest.webapp.executeAs,'USER_DEPLOYING');
  assert.ok(readFileSync(new URL('../integrations/private-assets-appscript/Index.html',import.meta.url),'utf8').includes('google.script.run'));
});
