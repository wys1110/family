(() => {
  const CHECKED_AT = '2026-08-06';
  const dayMs = 24 * 60 * 60 * 1000;
  const SOURCES = {
    isarangDue: ['임신육아종합포털 아이사랑', 'https://www.childcare.go.kr/?menuno=278'],
    isarangBirthSigns: ['임신육아종합포털 아이사랑', 'https://www.childcare.go.kr/?menuno=267'],
    isarangPostpartum: ['임신육아종합포털 아이사랑', 'https://www.childcare.go.kr/?menuno=275'],
    isarangSupport: ['임신육아종합포털 아이사랑', 'https://www.childcare.go.kr/index.html?menuno=279'],
    isarangWaitlist: ['임신육아종합포털 아이사랑', 'https://www.childcare.go.kr/?menuno=172'],
    moePortal: ['교육부', 'https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=294&boardSeq=101343&lev=0&m=0204'],
    kdcaVaccination: ['질병관리청 예방접종도우미', 'https://nip.kdca.go.kr/irhp/infm/goVcntInfo.do?menuCd=136&menuLv=1'],
    kdcaPregnancyVaccination: ['질병관리청 예방접종도우미', 'https://cert.kdca.go.kr/irhp/infm/goVcntInfo.do?menuCd=134&menuLv=1'],
    nhisExam: ['국민건강보험공단 건강검진 실시기준', 'https://www.nhis.or.kr/lm/lmxsrv/law/lawFullContent.do?SEQ=80&SEQ_HISTORY=595068'],
    kdcaTravel: ['질병관리청 국가건강정보포털', 'https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/gnrlzHealthInfoView.do?cntnts_sn=6257'],
    whoNewborn: ['세계보건기구(WHO)', 'https://www.who.int/tools/your-life-your-health/life-phase/newborns-and-children-under-5-years/caring-for-newborns'],
    katsChildSafety: ['국가기술표준원', 'https://kats.go.kr/content.do?cmsid=499'],
    gov: ['정부24', 'https://www.gov.kr/portal/main'],
  };

  const sourceFields = (source) => ({ sourceName: source[0], sourceUrl: source[1], checkedAt: CHECKED_AT });
  const card = (id, title, phase, category, timing, summary, action, regionScope, source) => ({
    id, title, phase, category, timing, summary, action, regionScope, ...sourceFields(source),
  });

  const cards = [
    card('due-date-set', '예정일 계산·등록', ['prenatal'], '출산 전', '기준일 설정 전', '최근 생리 시작일 등 입력값으로 예정일을 확인하고 담당 의료진의 안내와 함께 사용해요.', '예정일을 확인한 뒤 가이드 설정에 저장', 'national', SOURCES.isarangDue),
    card('prenatal-checkups', '산전 진료 일정 확인', ['prenatal'], '건강·검진', '출산 전', '검사 시기와 항목은 임신 상태에 따라 달라질 수 있어요. 병원에서 받은 다음 예약을 기록해요.', '병원 예약·검사 안내문을 가족 캘린더에 기록', 'national', SOURCES.isarangDue),
    card('pregnancy-vaccination', '임신 중 예방접종 확인', ['prenatal'], '예방접종', '출산 전', '임신부 접종 대상·시기는 현재 예방접종도우미와 의료진 안내를 함께 확인해요.', '접종 전 대상 여부와 금기사항을 의료기관에 확인', 'national', SOURCES.kdcaPregnancyVaccination),
    card('birth-signs', '출산 징후·입원 준비 확인', ['prenatal'], '출산 준비', '출산 임박 시', '출산 징후와 병원 방문 기준은 공식 안내를 읽고 병원의 연락처·입원 지침을 준비해요.', '입원 가방·서류·이동 경로를 확인', 'national', SOURCES.isarangBirthSigns),
    card('prepare-hospital-bag', '입원 가방 점검', ['prenatal'], '준비물', '출산 전 2~4주', '병원에서 요구하는 서류·산모와 아기용품만 먼저 준비해요. 병원별 목록이 우선이에요.', '병원 안내 목록과 대조해 체크', 'national', SOURCES.isarangBirthSigns),
    card('child-product-safety', '아기용품 안전표시 확인', ['prenatal', 'postpartum', 'infant'], '준비물', '구매 전', '제품명보다 사용 연령·안전인증 또는 안전확인 여부를 먼저 확인해요.', '어린이제품 안전정보에서 인증·신고 여부 확인', 'national', SOURCES.katsChildSafety),
    card('newborn-register', '출생 신고·지원 서비스 확인', ['postpartum'], '행정·지원', '출생 후', '출생 신고와 함께 이용 가능한 서비스는 정부24·아이사랑의 현재 안내를 확인해요.', '신고 기한·필요 서류를 관할 기관에 확인', 'national', SOURCES.gov),
    card('postpartum-care', '산후 회복 기간 확인', ['postpartum'], '산후 관리', '출산 후 4~6주', '산욕기와 회복 과정은 개인차가 커요. 이상 증상이나 걱정은 의료기관에 문의해요.', '산후 진료 일정과 도움 받을 사람을 정리', 'national', SOURCES.isarangPostpartum),
    card('newborn-safe-care', '신생아 기본 돌봄 확인', ['postpartum', 'infant'], '신생아', '생후 0~2개월', '손 위생·체온 유지·수유 상태·위험 신호 등 기본 돌봄 원칙을 확인해요.', '위험 신호가 있으면 의료기관에 즉시 문의', 'national', SOURCES.whoNewborn),
    card('newborn-screenings', '신생아 선별검사 확인', ['postpartum'], '건강·검진', '출생 직후', '병원에서 안내하는 신생아 선별검사와 결과 확인 일정을 놓치지 않아요.', '퇴원 서류에서 검사·재검 안내 확인', 'national', SOURCES.whoNewborn),
    card('infant-vaccines', '국가예방접종 일정 확인', ['postpartum', 'infant', 'toddler'], '예방접종', '출생 후', '백신별 대상·접종 기간은 예방접종도우미의 최신 일정과 의료기관 안내를 기준으로 해요.', '아이 예방접종도우미 기록과 다음 접종일 확인', 'national', SOURCES.kdcaVaccination),
    card('infant-health-screening', '영유아 건강검진 시기 확인', ['infant', 'toddler'], '건강·검진', '생후 4~71개월', '검진 대상·시기는 국민건강보험공단의 최신 기준과 검진기관 안내를 확인해요.', '검진표와 문진표를 준비하고 기관 예약', 'national', SOURCES.nhisExam),
    card('feeding-record', '수유·수면·기저귀 기록 시작', ['postpartum', 'infant'], '돌봄 기록', '생후 0~3개월', '기록은 의료진과 상담할 때 참고자료로 활용하고, 기록만으로 상태를 판단하지 않아요.', '성장 탭에 양·시간·특이사항을 간단히 기록', 'national', SOURCES.whoNewborn),
    card('safe-sleep-check', '수면 환경 점검', ['postpartum', 'infant'], '안전', '생후 0~12개월', '수면 환경은 보호자와 의료진이 안내하는 최신 안전 원칙을 확인해요.', '침구·주변 물건·수면 장소를 가족과 점검', 'national', SOURCES.whoNewborn),
    card('home-safety', '월령별 집안 안전 점검', ['infant', 'toddler'], '안전', '움직임이 늘기 전', '기어 다니기·잡고 서기 등 발달 변화에 맞춰 위험 요소를 점검해요.', '전선·작은 물건·문과 서랍을 점검', 'national', SOURCES.katsChildSafety),
    card('travel-medical-check', '여행 전 건강·감염병 확인', ['prenatal', 'postpartum', 'infant', 'toddler'], '여행·외출', '여행 계획 전', '임신 주수·아이 월령·기저질환·목적지에 따라 달라져요. 일반적인 가능/불가 판정은 하지 않아요.', '의료진·항공사·목적지 공식 안내를 확인', 'national', SOURCES.kdcaTravel),
    card('travel-packing', '여행용 기록·위생 준비', ['postpartum', 'infant', 'toddler'], '여행·외출', '여행 전', '예방접종 기록, 복용 중인 약, 보험·응급 연락처, 손 위생 용품을 준비해요.', '목적지 보건 정보와 응급기관을 저장', 'national', SOURCES.kdcaTravel),
    card('local-health-center', '지역 보건소 서비스 확인', ['prenatal', 'postpartum', 'infant', 'toddler'], '지역 서비스', '지역 선택 후', '지역별 임산부·영유아 프로그램과 지원은 시·군·구 보건소 공고가 기준이에요.', '선택 지역 보건소 홈페이지에서 현재 공고 확인', 'regional', SOURCES.gov),
    card('childcare-waitlist', '어린이집 입소대기 신청', ['infant', 'toddler'], '어린이집', '이용 희망 전', '어린이집 입소대기 신청 가능 시설·우선순위·신청 수는 아이사랑의 최신 안내가 기준이에요.', '아이사랑에서 시설·신청 현황 확인', 'national', SOURCES.isarangWaitlist),
    card('childcare-documents', '어린이집 제출 서류 확인', ['infant', 'toddler'], '어린이집', '입소 확정 전', '맞벌이 등 우선순위 증빙과 제출 기한은 시설·공고마다 다를 수 있어요.', '입소 예정 기관에 증빙 서류와 기한 문의', 'national', SOURCES.isarangWaitlist),
    card('kindergarten-application', '유치원 입학 신청 확인', ['toddler'], '유치원', '모집 공고 시', '유치원 입학 신청은 유보통합포털과 교육부의 최신 모집 공고를 확인해요.', '모집 일정·지원 자격·서류를 공고에서 확인', 'national', SOURCES.moePortal),
    card('local-childcare-notice', '지역 보육·교육 공고 확인', ['infant', 'toddler'], '지역 서비스', '매월 확인', '보육료·출산 지원·기관 모집 일정은 지역과 연도에 따라 달라져요.', '지역 선택 후 지자체·교육청 공고 링크 확인', 'regional', SOURCES.gov),
  ];

  const REGIONS = ['전국', '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시', '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도', '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도'];
  const toDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    const [year, month, day] = String(value).split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  };
  const diffDays = (from, to) => Math.round((to.getTime() - from.getTime()) / dayMs);

  const calculatePhase = ({ dueDate = '', birthDate = '', todayKey = '' } = {}) => {
    const today = toDate(todayKey) || new Date();
    const birth = toDate(birthDate);
    if (birth && today >= birth) {
      const dayOffset = diffDays(birth, today);
      const mode = dayOffset <= 42 ? 'postpartum' : dayOffset <= 365 ? 'infant' : 'toddler';
      return { mode, dayOffset, label: `생후 ${dayOffset}일` };
    }
    const due = toDate(dueDate);
    if (!due) return { mode: 'unknown', dayOffset: null, label: '기준일을 설정해 주세요' };
    const dayOffset = diffDays(today, due);
    return {
      mode: 'prenatal',
      dayOffset,
      label: dayOffset >= 0 ? `D-${dayOffset}` : `예정일 후 ${Math.abs(dayOffset)}일`,
    };
  };

  const filterCards = (sourceCards, { phase = 'all', category = 'all', region = {}, hiddenCardIds = [], completedCardIds = [] } = {}) => {
    const hidden = new Set(hiddenCardIds);
    const completed = new Set(completedCardIds);
    const sido = String(region.sido || '').trim();
    const sigungu = String(region.sigungu || '').trim();
    return sourceCards
      .filter((item) => !hidden.has(item.id))
      .filter((item) => phase === 'all' || item.phase.includes(phase))
      .filter((item) => category === 'all' || item.category === category)
      .filter((item) => item.regionScope === 'national' || item.regionScope === 'regional' || item.regionScope === sido || item.regionScope === sigungu)
      .map((item) => ({ ...item, completed: completed.has(item.id) }));
  };

  window.FAMILY_GUIDE_DATA_API = { cards, regions: REGIONS, calculatePhase, filterCards };
})();
