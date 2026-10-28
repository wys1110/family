/** Staged bridge only. Existing MYSELF deployment remains the default. */
function doPost(event) {
  try {
    const owner=authenticateSignedRequest_(event);
    const result=owner.request.action==='dashboard'
      ?getDashboardForOwner_(owner.email)
      :saveRecordForOwner_(owner.request.command,owner.email);
    return signedJson_(result);
  } catch (_) { return signedJson_({error:'ACCESS_DENIED'}); }
}

function signedJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function sameSignature_(actual,expected) {
  let difference=actual.length^expected.length;
  for(let i=0;i<expected.length;i++)difference|=(actual.charCodeAt(i)||0)^expected.charCodeAt(i);
  return difference===0;
}

function authenticateSignedRequest_(event) {
  const properties=PropertiesService.getScriptProperties();
  const secret=properties.getProperty('PRIVATE_ASSETS_HMAC_SECRET');
  if(properties.getProperty('PRIVATE_ASSETS_API_ENABLED')!=='true'||!/^[a-f0-9]{64}$/i.test(secret||''))throw new Error('ACCESS_DENIED');
  const raw=event?.postData?.contents;
  if(typeof raw!=='string'||raw.length>20000||Utilities.newBlob(raw).getBytes().length>20000)throw new Error('ACCESS_DENIED');
  const envelope=JSON.parse(raw);
  if(!envelope||Array.isArray(envelope)||Object.keys(envelope).sort().join(',')!=='request,signature'||typeof envelope.request!=='string'||envelope.request.length>8192||!/^[a-f0-9]{64}$/.test(envelope.signature||''))throw new Error('ACCESS_DENIED');
  const signature=Utilities.computeHmacSha256Signature(envelope.request,secret,Utilities.Charset.UTF_8).map(b=>(b&255).toString(16).padStart(2,'0')).join('');
  if(!sameSignature_(envelope.signature,signature))throw new Error('ACCESS_DENIED');
  const request=JSON.parse(envelope.request),now=Date.now();
  if(!request||Array.isArray(request)||request.v!==1||!Number.isSafeInteger(request.timestamp)||Math.abs(now-request.timestamp)>60000||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(request.nonce||''))throw new Error('ACCESS_DENIED');
  const keys=Object.keys(request).sort().join(',');
  if(request.action==='dashboard'){
    if(keys!=='action,nonce,timestamp,v')throw new Error('ACCESS_DENIED');
  }else if(request.action==='saveRecord'){
    if(keys!=='action,command,nonce,timestamp,v')throw new Error('ACCESS_DENIED');
    const command=request.command;
    if(!command||Array.isArray(command)||Object.keys(command).sort().join(',')!=='expectedRevision,record,requestId'||!/^[a-f0-9-]{36}$/.test(command.requestId||'')||typeof command.expectedRevision!=='string'||!command.expectedRevision||command.expectedRevision.length>200)throw new Error('ACCESS_DENIED');
    ledgerRecord_(command.record);
  }else throw new Error('ACCESS_DENIED');
  // No caller email is accepted. Only the owner under whom this web app executes.
  const email=Session.getEffectiveUser().getEmail().trim().toLowerCase();
  if(!email)throw new Error('ACCESS_DENIED');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(3000))throw new Error('ACCESS_DENIED');
  try {
    const stored=JSON.parse(properties.getProperty('PRIVATE_ASSETS_NONCES')||'{}');
    if(!stored||typeof stored!=='object'||Array.isArray(stored))throw new Error('ACCESS_DENIED');
    const nonces={};
    // Keep each nonce longer than the full acceptance window, including future timestamps.
    for(const key of Object.keys(stored))if(Number.isSafeInteger(stored[key])&&stored[key]>=now-120000)nonces[key]=stored[key];
    if(Object.prototype.hasOwnProperty.call(nonces,request.nonce)||Object.keys(nonces).length>=80)throw new Error('ACCESS_DENIED');
    nonces[request.nonce]=now;
    properties.setProperty('PRIVATE_ASSETS_NONCES',JSON.stringify(nonces));
  } finally { lock.releaseLock(); }
  // Save acquires its own ScriptLock; never hold the replay lock across the call.
  return {email,request};
}
