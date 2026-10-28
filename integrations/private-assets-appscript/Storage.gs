/** App-created native Doc, kept beside the private source. No broad Docs write scope. */
function setupProgramStorage() {
  assertSession_();
  PropertiesService.getScriptProperties().setProperty('ENABLE_RECORD_WRITES','false');
  const prepared=createProgramDocument_();
  return prepared.ready?initializeProgramLedger_():{placementRequired:true,...prepared};
}

function assertProgramSource_(file,source,email) {
  const p=PropertiesService.getScriptProperties(),folderId=p.getProperty('PROGRAM_FOLDER_ID'),key=p.getProperty('PROGRAM_SETUP_KEY');
  assertPrivateSource_(source,email);assertPrivateSource_(file,email);
  if(!folderId||!key||file.id===source.id||file.isAppAuthorized!==true||file.appProperties?.assetProgramSetup!==key||
      source.parents?.length!==1||source.parents[0]!==folderId||file.parents?.length!==1||file.parents[0]!==folderId)throw new Error('PRIVATE_SOURCE_REQUIRED');
  assertPrivateOwnedFile_(sourceMetadata_(folderId),email,'application/vnd.google-apps.folder');
}

/** Run from the project editor after owner grants drive.file. Creates no financial content. */
function createProgramDocument_() {
  const email=assertSession_(),p=PropertiesService.getScriptProperties(),sourceId=p.getProperty('SOURCE_DOC_ID');
  if(!sourceId||!/^[a-zA-Z0-9_-]+$/.test(sourceId))throw new Error('SOURCE_NOT_CONFIGURED');
  const lock=LockService.getScriptLock();if(!lock.tryLock(3000))throw new Error('WRITE_BUSY');
  try {
    const source=sourceMetadata_(sourceId);assertPrivateSource_(source,email);
    if(source.parents?.length!==1)throw new Error('PRIVATE_SOURCE_REQUIRED');
    const folderId=source.parents[0];assertPrivateOwnedFile_(sourceMetadata_(folderId),email,'application/vnd.google-apps.folder');
    const existingFolder=p.getProperty('PROGRAM_FOLDER_ID');if(existingFolder&&existingFolder!==folderId)throw new Error('PRIVATE_SOURCE_REQUIRED');
    let key=p.getProperty('PROGRAM_SETUP_KEY');
    if(!key){key=Utilities.getUuid();p.setProperties({PROGRAM_SETUP_KEY:key,PROGRAM_FOLDER_ID:folderId});}
    if(!/^[a-f0-9-]{36}$/.test(key))throw new Error('SOURCE_NOT_CONFIGURED');
    let candidateId=p.getProperty('PROGRAM_DOC_ID')||p.getProperty('PROGRAM_CANDIDATE_ID');
    if(!candidateId){
      // Recover a creation whose response was lost, before issuing another create.
      const matches=Drive.Files.list({q:"trashed = false and appProperties has { key='assetProgramSetup' and value='"+key+"' }",fields:'files(id)',pageSize:100}).files||[];
      if(matches.length>1)throw new Error('INVALID_LEDGER');
      candidateId=matches[0]?.id;
      if(!candidateId)candidateId=Drive.Files.create({name:'내 자산 프로그램 원장',mimeType:'application/vnd.google-apps.document',appProperties:{assetProgramSetup:key}},null,{fields:'id',ignoreDefaultVisibility:true}).id;
      if(!candidateId||!/^[a-zA-Z0-9_-]+$/.test(candidateId))throw new Error('SOURCE_NOT_CONFIGURED');
      p.setProperty('PROGRAM_CANDIDATE_ID',candidateId);
    }
    const candidate=sourceMetadata_(candidateId);assertPrivateSource_(candidate,email);
    if(candidateId===sourceId||candidate.isAppAuthorized!==true||candidate.appProperties?.assetProgramSetup!==key)throw new Error('PRIVATE_SOURCE_REQUIRED');
    // The empty app-created Doc must be moved to the verified source folder before initialization.
    return {candidateId,folderId,ready:candidate.parents?.length===1&&candidate.parents[0]===folderId};
  }finally{if(lock.hasLock())lock.releaseLock();}
}

/** Run only after the blank candidate is in the same private Jayden Log folder. */
function initializeProgramLedger_() {
  const email=assertSession_(),p=PropertiesService.getScriptProperties(),sourceId=p.getProperty('SOURCE_DOC_ID'),id=p.getProperty('PROGRAM_CANDIDATE_ID')||p.getProperty('PROGRAM_DOC_ID');
  if(!sourceId||!id||id===sourceId||![sourceId,id].every(v=>/^[a-zA-Z0-9_-]+$/.test(v)))throw new Error('SOURCE_NOT_CONFIGURED');
  const lock=LockService.getScriptLock();if(!lock.tryLock(3000))throw new Error('WRITE_BUSY');
  try {
    const sourceBefore=sourceMetadata_(sourceId),targetBefore=sourceMetadata_(id);assertProgramSource_(targetBefore,sourceBefore,email);
    if(p.getProperty('PROGRAM_DOC_ID')){
      if(p.getProperty('PROGRAM_DOC_ID')!==id)throw new Error('PRIVATE_SOURCE_REQUIRED');
      const sourceDoc=Docs.Documents.get(sourceId,{includeTabsContent:true}),owner=parseDocument_(documentText_(sourceDoc)).owner;
      if(!readLedger_(Docs.Documents.get(id,{includeTabsContent:true}),owner).initialized)throw new Error('INVALID_LEDGER');
      p.setProperties({PROGRAM_WRITES_ENABLED:'true',ENABLE_RECORD_WRITES:'false'});
      return {initialized:true,replayed:true};
    }
    const original=Docs.Documents.get(sourceId,{includeTabsContent:true}),owner=parseDocument_(documentText_(original)).owner,baseline=readLedger_(original,owner);
    if(!baseline.initialized||!baseline.journalText||baseline.journalText.length>900000)throw new Error('INVALID_LEDGER');
    const target=Docs.Documents.get(id,{includeTabsContent:true}),existing=documentText_(target).trim();
    if(existing){
      if(readLedger_(target,owner).journalText!==baseline.journalText)throw new Error('INVALID_LEDGER');
    }else{
      const sourceConfirmed=sourceMetadata_(sourceId);assertPrivateSource_(sourceConfirmed,email);assertProgramSource_(sourceMetadata_(id),sourceConfirmed,email);
      if(sourceConfirmed.modifiedTime!==sourceBefore.modifiedTime)throw new Error('SOURCE_CHANGED');
      const tabId=target.tabs?.[0]?.tabProperties?.tabId;
      if(!target.revisionId)throw new Error('SOURCE_CHANGED');
      Docs.Documents.batchUpdate({writeControl:{requiredRevisionId:target.revisionId},requests:[{insertText:{location:{index:1,...(tabId?{tabId}:{})},text:baseline.journalText}}]},id);
    }
    const copied=Docs.Documents.get(id,{includeTabsContent:true}),state=readLedger_(copied,owner);
    const sourceAfter=sourceMetadata_(sourceId);assertProgramSource_(sourceMetadata_(id),sourceAfter,email);
    if(sourceAfter.modifiedTime!==sourceBefore.modifiedTime||state.journalText!==baseline.journalText)throw new Error('SOURCE_CHANGED');
    p.setProperties({PROGRAM_DOC_ID:id,PROGRAM_WRITES_ENABLED:'true',ENABLE_RECORD_WRITES:'false'});
    return {initialized:true,records:state.records.length};
  }finally{if(lock.hasLock())lock.releaseLock();}
}
