/** Owner dashboard. No transaction data, email or document ID in source. */
function assertSession_() {
  const active = Session.getActiveUser().getEmail().trim().toLowerCase();
  const effective = Session.getEffectiveUser().getEmail().trim().toLowerCase();
  if (!active || !effective || active !== effective) throw new Error('ACCESS_DENIED');
  return active;
}

function assertPrivateSource_(file, email) {
  assertPrivateOwnedFile_(file,email,'application/vnd.google-apps.document');
}

function assertPrivateOwnedFile_(file, email, mimeType) {
  const owners = file.owners || [];
  const permissions = file.permissions || [];
  if (file.trashed || file.shared !== false || file.driveId ||
      file.mimeType !== mimeType ||
      owners.length !== 1 || String(owners[0].emailAddress).toLowerCase() !== email ||
      !permissions.length || permissions.some(p => p.deleted || p.type !== 'user' ||
        p.role !== 'owner' || String(p.emailAddress).toLowerCase() !== email)) {
    throw new Error('PRIVATE_SOURCE_REQUIRED');
  }
}

function sourceMetadata_(id) {
  return Drive.Files.get(id, { fields: 'id,name,mimeType,trashed,shared,driveId,modifiedTime,parents,isAppAuthorized,appProperties,owners(emailAddress),permissions(type,role,emailAddress,deleted)' });
}

function doGet() {
  try { assertSession_(); }
  catch (_) { return HtmlService.createHtmlOutput('<html lang="ko"><meta name="viewport" content="width=device-width, initial-scale=1"><p>이 화면은 소유자 Google 계정으로만 열 수 있습니다.</p></html>'); }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('내 자산 · 나만 보기')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** Read endpoint. Writes live in Ledger.gs and require explicit activation. */
function getDashboard() {
  try { return getDashboardForOwner_(assertSession_()); }
  catch (_) { return {error:'ACCESS_DENIED'}; }
}

/** Internal only: caller must have authenticated the deploying owner. */
function getDashboardForOwner_(email) {
  try {
    const id = PropertiesService.getScriptProperties().getProperty('SOURCE_DOC_ID');
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return { error: 'SOURCE_NOT_CONFIGURED' };
    const before = sourceMetadata_(id);
    assertPrivateSource_(before, email);
    const doc = Docs.Documents.get(id, { includeTabsContent: true });
    const data = parseDocument_(documentText_(doc));
    const programId=PropertiesService.getScriptProperties().getProperty('PROGRAM_DOC_ID');
    let programBefore=null;
    if(programId){
      if(!/^[a-zA-Z0-9_-]+$/.test(programId)||programId===id)throw new Error('PRIVATE_SOURCE_REQUIRED');
      programBefore=sourceMetadata_(programId);assertProgramSource_(programBefore,before,email);
      data.program=ledgerView_(Docs.Documents.get(programId,{includeTabsContent:true}),data.owner,true);
      const programAfter=sourceMetadata_(programId);assertProgramSource_(programAfter,before,email);
      if(programBefore.modifiedTime!==programAfter.modifiedTime)return {error:'SOURCE_CHANGED'};
      data.program.sourceUrl='https://docs.google.com/document/d/'+programId+'/edit';
    }else data.program = ledgerView_(doc, data.owner,false);
    if(data.program.initialized){
      data.monthly=ledgerMonthly_(data.program);
      data.analysis=ledgerAnalysis_(data.program);
      data.salaries=data.monthly.rows.filter(r=>r.salary!==null).map(r=>({year:Number(r.month.slice(0,4)),month:Number(r.month.slice(5,7)),amount:r.salary,location:'프로그램 원장 / '+r.month+' / 급여'}));
      data.period=data.monthly.start+' ~ '+data.monthly.end;
      const reimbursements=data.monthly.rows.reduce((sum,r)=>sum+(r.reimbursement??0),0);
      data.reimbursements=Number.isSafeInteger(reimbursements)?reimbursements:null;
    }
    const after = sourceMetadata_(id);
    assertPrivateSource_(after, email);
    if (before.modifiedTime !== after.modifiedTime) return { error: 'SOURCE_CHANGED' };
    if(programBefore)assertProgramSource_(programBefore,after,email);
    data.sourceUrl = 'https://docs.google.com/document/d/' + id + '/edit';
    data.sourceModifiedAt = after.modifiedTime;
    data.loadedAt = new Date().toISOString();
    return data;
  } catch (error) {
    const safe = ['ACCESS_DENIED', 'PRIVATE_SOURCE_REQUIRED', 'UNSUPPORTED_DOCUMENT', 'INVALID_LEDGER'];
    return { error: safe.includes(error.message) ? error.message : 'LOAD_FAILED' };
  }
}

function documentText_(doc) {
  const parts = [];
  function content(elements) {
    (elements || []).forEach(el => {
      if (el.paragraph) parts.push((el.paragraph.elements || []).map(p => p.textRun ? p.textRun.content : '').join(''));
      if (el.table) (el.table.tableRows || []).forEach(row => (row.tableCells || []).forEach(cell => content(cell.content)));
    });
  }
  function tab(t) { content(t.documentTab && t.documentTab.body && t.documentTab.body.content); (t.childTabs || []).forEach(tab); }
  if (doc.tabs && doc.tabs.length) doc.tabs.forEach(tab);
  else content(doc.body && doc.body.content);
  return parts.join('\n');
}

/** Deliberately narrow, fail-closed reader for the existing summary document. */
function parseDocument_(text) {
  const headings = [...text.matchAll(/(?:^|\n)(\d{4}-\d{2}-\d{2}) 자산과 현금흐름 기록\s*/g)];
  if (!headings.length) throw new Error('UNSUPPORTED_DOCUMENT');
  const heading = headings[headings.length - 1];
  const section = text.slice(heading.index);
  const metadata = section.match(/기록일:\s*(\d{4}-\d{2}-\d{2})\s*·\s*수치 관찰일:\s*(\d{4}-\d{2}-\d{2})\s*·\s*소유자:\s*([^·\n]+)\s*·\s*통화:\s*원\(KRW\)/);
  if (!metadata || metadata[1] !== heading[1]) throw new Error('UNSUPPORTED_DOCUMENT');
  const issues = [];
  const n = '(?:0|[1-9]\\d{0,2}(?:,\\d{3})+|[1-9]\\d*)';
  const number = raw => { const value = Number(String(raw).replace(/,/g, '')); return Number.isSafeInteger(value) && value >= 0 ? value : null; };
  const area = (start, end) => {
    const from = section.indexOf(start), to = section.indexOf(end, from + start.length);
    return from < 0 || to < 0 ? '' : section.slice(from + start.length, to);
  };
  function read(pattern, input, location, group) {
    const matches = [...input.matchAll(new RegExp(pattern, 'g'))];
    if (matches.length !== 1) { issues.push(location); return null; }
    return number(matches[0][group || 1]);
  }
  const assetText = area('자산과 앱 표시 합계', '부채와');
  const assetLabels = ['원화 입출금', '주택청약', '외화통장', '적금', '증권계좌', '연금계좌'];
  const assets = assetLabels.map((label, i) => ({
    id: 'asset-category-' + i, label,
    amount: read('(?:^|\\n)\\s*' + label + '\\s+(' + n + ')(?=\\s|$)', assetText, '자산과 앱 표시 합계 / ' + label),
    location: '자산과 앱 표시 합계 / ' + label,
    basis: ['표시잔액', '표시잔액', '원화 표시 평가액 · 환율 미확인', '표시잔액', '계좌 평가액 · RP 포함', '직전 화면 값 이월'][i]
  }));
  const declaredAssets = read('(?:^|\\n)\\s*포함 금융자산 합계\\s+(' + n + ')(?=\\s|$)', assetText, '포함 금융자산 합계');
  const debtText = area('부채와', '유동성 및');
  const debtLabels = ['주택담보대출', '신용대출', '학자금대출', '자동차 할부'];
  const debts = debtLabels.map((label, i) => {
    const matches = [...debtText.matchAll(new RegExp('(?:^|\\n)\\s*' + label + '\\s+(' + n + '|미확인)\\s+(' + n + ')(?=\\s|$)', 'g'))];
    const match = matches.length === 1 ? matches[0] : null;
    if (!match) issues.push('부채와 관측 상환 / ' + label);
    return { id: 'debt-category-' + i, label, amount: match && match[1] !== '미확인' ? number(match[1]) : null,
      payment: match ? number(match[2]) : null, location: '부채와 관측 상환 / ' + label,
      basis: i === 2 ? '상세 화면 잔액 · 목록과 차이 확인 필요' : '표시잔액' };
  });
  const total = values => values.length && values.every(v => v !== null) && Number.isSafeInteger(values.reduce((a,b) => a+b,0)) ? values.reduce((a,b) => a+b,0) : null;
  const financialAssets = total(assets.map(a => a.amount));
  const assetReconciled = financialAssets !== null && declaredAssets !== null && financialAssets === declaredAssets;
  if (!assetReconciled) issues.push('금융자산 원본 합계 대조');
  const optionalAmount = (label, input, signed) => {
    const matches = [...input.matchAll(new RegExp('(?:^|\\n)\\s*' + label + '\\s+(' + (signed?'[-−]?':'') + n + ')(?=\\s|$)', 'g'))];
    if(matches.length!==1)return null;
    const value=Number(matches[0][1].replace(/,/g,'').replace('−','-'));
    return Number.isSafeInteger(value)&&(signed||value>=0)?value:null;
  };
  const propertyAmount = optionalAmount('부동산 등록액', assetText);
  const pointsAmount = optionalAmount('포인트', assetText);
  const displayedNet = optionalAmount('앱 표시액', assetText, true);
  const repayment = total(debts.map(d => d.payment));
  const declaredRepayment = read('상환액\\s+(' + n + ')원은', debtText, '관측 상환 합계');
  const repaymentReconciled = repayment !== null && repayment === declaredRepayment;
  if (!repaymentReconciled) issues.push('관측 상환 원본 합계 대조');
  const salaryMatches = [...section.matchAll(new RegExp('(\\d{1,2})월 월급 실입금\\s+(' + n + ')원,\\s*(\\d{1,2})월\\s+(' + n + ')원에', 'g'))];
  const salaries = salaryMatches.length === 1 ? [1,3].map(i => ({ month: Number(salaryMatches[0][i]), amount: number(salaryMatches[0][i + 1]), location: '확인된 소득 및 자금 이동 / 월급 실입금' })) : [];
  if (!salaries.length) issues.push('최근 월급 실입금');
  const liquidity = area('유동성 및 확인된 예정 결제', '확인된 소득 및 자금 이동');
  const rp = read('RP 평가액\\s+(' + n + ')원', liquidity, 'RP 평가액');
  const billSentence = liquidity.match(/(\d{1,2})월 예정 카드 청구는\s+([^\n]+?)으로 합계\s+([\d,]+)원/);
  const bills = billSentence ? [...billSentence[2].matchAll(new RegExp('(\\d{1,2})/(\\d{1,2})\\s+([^\\s,]+)\\s+(' + n + ')원', 'g'))].map((m, i) => ({ id: 'observed-bill-' + i, date: m[1] + '/' + m[2], label: m[3], amount: number(m[4]), location: '유동성 및 확인된 예정 결제 / ' + m[3] })) : [];
  const billsTotal = total(bills.map(b => b.amount));
  const billsReconciled = !!billSentence && billsTotal !== null && billsTotal === number(billSentence[3]);
  if (!billsReconciled) issues.push('예정 결제 원본 합계 대조');
  const reimbursements = read('회사·팀 정산 입금 합계\\s+(' + n + ')원', section, '회사·팀 정산 입금 합계');
  const monthly = parseMonthly_(section, metadata[2], metadata[3].trim());
  if (monthly && !monthly.reconciled) issues.push('월별 집계 범위·중복·합계 대조');
  const knownDebt = total(debts.filter(d => d.amount !== null).map(d => d.amount));
  const gross = total([assetReconciled ? financialAssets : null, propertyAmount, pointsAmount]);
  const valuationReconciled = gross !== null && knownDebt !== null && displayedNet !== null && gross-knownDebt === displayedNet;
  return {
    kind: 'observed-summary', currency: 'KRW', owner: metadata[3].trim(), scope: '개인', recordedAt: metadata[1], asOf: metadata[2],
    period: metadata[2].slice(0,4) + '-01-01 ~ ' + metadata[2],
    assets, financialAssets: assetReconciled ? financialAssets : null, assetReconciled,
    debts, knownDebt, debtIncomplete: debts.some(d => d.amount === null),
    valuation: { property:propertyAmount, points:pointsAmount, gross:valuationReconciled?gross:null, net:valuationReconciled?displayedNet:null, reconciled:valuationReconciled },
    repayment: repaymentReconciled ? repayment : null, repaymentReconciled,
    repaymentPeriod: debtText.match(/(\d{1,2})월 관측 상환/)?.[1] || null,
    salaries, rp, bills, billsMonth:billSentence?Number(billSentence[1]):null, billsTotal: billsReconciled ? billsTotal : null, billsReconciled,
    reimbursements, monthly, issues: [...new Set(issues)]
  };
}

/** Monthly observations are separate from the historical summary sentences. */
function parseMonthly_(section, asOf, owner) {
  const headings = [...section.matchAll(/(?:^|\n)(\d{4}-\d{2}-\d{2}) 월별 수입·카드사용 집계\s*/g)];
  if (!headings.length) return null;
  const block = section.slice(headings.at(-1).index);
  const bad = { rows: [], reconciled: false };
  const meta = block.match(/집계 기간:\s*(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})\s*·\s*집계 기록일:\s*(\d{4}-\d{2}-\d{2})\s*·\s*소유자:\s*([^·\n]+)\s*·\s*통화:\s*KRW(?=\s|·|$)/);
  const stop = block.indexOf('월별 집계 끝');
  if (!meta || stop < 0 || meta[2] !== asOf || meta[4].trim() !== owner || meta[1].slice(0,4) !== asOf.slice(0,4) || !meta[1].endsWith('-01')) return bad;
  const n = '(0|[1-9]\\d{0,2}(?:,\\d{3})+|[1-9]\\d*)';
  const rowPattern = new RegExp('(?:^|\\n)\\s*(\\d{4}-(?:0[1-9]|1[0-2]))\\s+' + [n,n,n,n].join('\\s+') + '(?=\\s|$)', 'g');
  const rows = [...block.slice(0,stop).matchAll(rowPattern)].map(m => ({ month:m[1], salary:Number(m[2].replace(/,/g,'')), bonus:Number(m[3].replace(/,/g,'')), card:Number(m[4].replace(/,/g,'')), reimbursement:Number(m[5].replace(/,/g,'')) }));
  const first = Number(meta[1].slice(5,7)), last = Number(asOf.slice(5,7));
  const keys = ['salary','bonus','card','reimbursement'];
  const declared = block.slice(0,stop).match(new RegExp('월별 검산 합계\\s+' + [n,n,n,n].join('\\s+') + '(?=\\s|$)'));
  if (!declared || first < 1 || last > 12 || first > last || rows.length !== last-first+1) return bad;
  if (!rows.every((r,i) => r.month === asOf.slice(0,4)+'-'+String(first+i).padStart(2,'0') && keys.every(k => Number.isSafeInteger(r[k]) && r[k] >= 0))) return bad;
  if (!keys.every((k,i) => { const sum=rows.reduce((s,r)=>s+r[k],0); return Number.isSafeInteger(sum) && sum === Number(declared[i+1].replace(/,/g,'')); })) return bad;
  return { rows, reconciled:true, start:meta[1], end:meta[2], recordedAt:meta[3] };
}
