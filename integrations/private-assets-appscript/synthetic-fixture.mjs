// Entirely invented fixture. Never replace these values with personal records.
export const syntheticDocument = `2026-10-01 자산과 현금흐름 기록
기록일: 2026-10-01 · 수치 관찰일: 2026-09-30 · 소유자: 가상 사용자 · 통화: 원(KRW)
자산과 앱 표시 합계
원화 입출금
2,000,000
표시잔액
주택청약
4,000,000
표시잔액
외화통장
600,000
원화 평가액
적금
300,000
표시잔액
증권계좌
28,000,000
RP 포함
연금계좌
40,000,000
직전 화면 이월
포함 금융자산 합계
74,900,000
합계
부동산 등록액
250,000,000
시가 미검증
포인트
100,000
현금화 가능 여부 미확인
앱 표시액
162,000,000
차량 제외 등록 범위
부채와 9월 관측 상환
주택담보대출
140,000,000
1,000,000
신용대출
18,000,000
500,000
학자금대출
5,000,000
200,000
자동차 할부
미확인
300,000
합계
163,000,000 + 차량 미확인
2,000,000
상환액 2,000,000원은 9월에 관측한 현금 유출이다.
유동성 및 확인된 예정 결제
RP 평가액 3,000,000원은 인출 가능액이 아니다.
10월 예정 카드 청구는 10/12 가상카드A 400,000원, 10/16 가상카드B 600,000원으로 합계 1,000,000원이다.
확인된 소득 및 자금 이동
8월 월급 실입금 4,800,000원, 9월 5,000,000원에 같은 상환 규모를 적용한다.
회사·팀 정산 입금 합계 12,000,000원은 소득이 아니다.
`;

// Invented monthly observations, deliberately unrelated to the owner's records.
const demoCards=[3000000,4200000,3500000,2800000,3100000,6800000,3900000,4400000,5200000];
const demoRows=demoCards.map((card,i)=>({month:'2026-'+String(i+1).padStart(2,'0'),salary:i===7?4800000:5000000,bonus:i===0?12000000:i===5?2000000:i===6?1000000:0,card,reimbursement:i===5?3000000:0}));
export const syntheticMonthlySection='\n2026-10-01 월별 수입·카드사용 집계\n집계 기간: 2026-01-01 ~ 2026-09-30 · 집계 기록일: 2026-10-01 · 소유자: 가상 사용자 · 통화: KRW\n월\n급여 실입금\n성과급 실입금\n카드 유효사용액\n회사·팀 정산입금\n'+demoRows.map(r=>[r.month,r.salary,r.bonus,r.card,r.reimbursement].join('\n')).join('\n')+'\n월별 검산 합계\n'+['salary','bonus','card','reimbursement'].map(k=>demoRows.reduce((sum,r)=>sum+r[k],0)).join('\n')+'\n월별 집계 끝\n';

export function makeSyntheticProgram(summary) {
  const records=[];
  demoRows.forEach((month,mi)=>{
    for(let i=0;i<8;i++)records.push({id:'demo:card-'+mi+'-'+i,type:'transaction',date:month.month+'-'+String(i+1).padStart(2,'0'),label:['가상 식료품점','가상 카페','가상 교통','가상 회사 행사'][i%4],amount:String(month.card/8),currency:'KRW',basis:'가상 카드 사용일',sourceLocation:'합성 거래 / '+month.month+' / '+i,flow:'expense',status:'active',channel:'card',attribution:i===3?'company':i===2?'unknown':'personal',category:['식료품','식사','교통','행사'][i%4]});
    for(const [key,flow] of [['salary','salary'],['bonus','bonus'],['reimbursement','reimbursement']])if(month[key])records.push({id:'demo:'+key+'-'+mi,type:'transaction',date:month.month+'-21',label:'가상 '+{salary:'급여',bonus:'성과급',reimbursement:'회사 정산'}[key],amount:String(month[key]),currency:'KRW',basis:'가상 실입금',sourceLocation:'합성 입금 / '+month.month+' / '+key,flow,status:'active',channel:'bank',attribution:flow==='reimbursement'?'company':'personal',category:flow==='reimbursement'?'회사 정산':'소득'});
  });
  for(const [kind,rows] of [['asset',summary.assets],['liability',summary.debts]])rows.forEach(row=>records.push({id:row.id,type:'balance',date:summary.asOf,label:row.label,amount:row.amount===null?null:String(row.amount),currency:'KRW',basis:row.basis,sourceLocation:'합성 잔액 / '+row.id,balanceKind:kind}));
  return {initialized:true,records,history:[],historyCount:0,revision:'demo-1',coverage:{start:'2026-01-01',end:summary.asOf},writable:true};
}
