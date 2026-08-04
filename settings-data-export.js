(() => {
  if (document.documentElement.dataset.settingsDataExportModule === 'ready') return;
  document.documentElement.dataset.settingsDataExportModule = 'ready';

  const SETTINGS_EXPORT_SHEETS = [
    {
      name: '가족 그룹',
      headers: ['그룹명', '생성일'],
      query: (supabase, householdId) => supabase.from('households')
        .select('name,created_at')
        .eq('id', householdId)
        .limit(1),
      rows: (rows) => rows.map((row) => [row.name, row.created_at]),
    },
    {
      name: '가족 구성원',
      headers: ['사용자 ID', '역할', '가입일'],
      query: (supabase, householdId) => supabase.from('household_members')
        .select('user_id,role,created_at')
        .eq('household_id', householdId)
        .order('created_at'),
      rows: (rows) => rows.map((row) => [row.user_id, row.role, row.created_at]),
    },
    {
      name: '캘린더 구성원',
      headers: ['이름', '색상', '정렬 순서'],
      query: (supabase, householdId) => supabase.from('calendar_members')
        .select('name,color,sort_order')
        .eq('household_id', householdId)
        .order('sort_order'),
      rows: (rows) => rows.map((row) => [row.name, row.color, row.sort_order]),
    },
    {
      name: '아기 기록',
      headers: ['이름', '생년월일', '출생 시간', '성별', '출생 체중(kg)', '출생 키(cm)'],
      query: (supabase, householdId) => supabase.from('babies')
        .select('name,birth_date,birth_time,sex,birth_weight_kg,birth_height_cm')
        .eq('household_id', householdId)
        .order('birth_date'),
      rows: (rows) => rows.map((row) => [
        row.name,
        row.birth_date,
        row.birth_time,
        row.sex,
        row.birth_weight_kg,
        row.birth_height_cm,
      ]),
    },
    {
      name: '일정',
      headers: ['제목', '시작일', '종료일', '시간', '담당'],
      query: (supabase, householdId) => supabase.from('events')
        .select('title,event_date,event_end_date,event_time,member')
        .eq('household_id', householdId)
        .order('event_date'),
      rows: (rows) => rows.map((row) => [
        row.title,
        row.event_date,
        row.event_end_date,
        row.event_time,
        row.member,
      ]),
    },
    {
      name: '성장 기록',
      headers: ['제목', '기록일', '기록 시간', '분류', '키(cm)', '몸무게(kg)', '머리 둘레(cm)', '수유량(ml)', '수면(분)', '체온(°C)', '기저귀', '수유 유형', '수유 방향', '수유 시간(분)'],
      query: (supabase, householdId) => supabase.from('growth_entries')
        .select('title,entry_date,entry_time,category,height_cm,weight_kg,head_cm,feeding_ml,sleep_minutes,temperature_c,diaper_kind,feeding_type,feeding_side,feeding_minutes')
        .eq('household_id', householdId)
        .order('entry_date', { ascending: false }),
      rows: (rows) => rows.map((row) => [
        row.title,
        row.entry_date,
        row.entry_time,
        row.category,
        row.height_cm,
        row.weight_kg,
        row.head_cm,
        row.feeding_ml,
        row.sleep_minutes,
        row.temperature_c,
        row.diaper_kind,
        row.feeding_type,
        row.feeding_side,
        row.feeding_minutes,
      ]),
    },
    {
      name: '할 일',
      headers: ['제목', '마감일', '담당', '반복', '완료 여부', '완료 시각', '생성일'],
      query: (supabase, householdId) => supabase.from('family_todos')
        .select('title,due_date,assignee,recurrence,completed,completed_at,created_at')
        .eq('household_id', householdId)
        .order('due_date'),
      rows: (rows) => rows.map((row) => [
        row.title,
        row.due_date,
        row.assignee,
        row.recurrence,
        row.completed ? '완료' : '미완료',
        row.completed_at,
        row.created_at,
      ]),
    },
  ];

  const escapeXml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;')
    .replace(/"/g, '&quot;');

  const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
  const cell = (value, header = '') => {
    if (value === null || value === undefined || value === '') return '<Cell><Data ss:Type="String"></Data></Cell>';
    const type = isNumber(value) ? 'Number' : 'String';
    const normalized = type === 'String' && (value instanceof Date || /일|시간|시각|생성일|가입일/.test(header))
      ? new Date(value).toLocaleString('ko-KR')
      : value;
    return `<Cell><Data ss:Type="${type}">${escapeXml(normalized)}</Data></Cell>`;
  };

  const buildSpreadsheetXml = (sheets = []) => `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#E9ECEF" ss:Pattern="Solid"/></Style>
  </Styles>
  ${sheets.map((sheet) => `<Worksheet ss:Name="${escapeXml(sheet.name)}"><Table>
    <Row ss:StyleID="Header">${sheet.headers.map((header) => cell(header)).join('')}</Row>
    ${(sheet.rows || []).map((row) => `<Row>${row.map((value, index) => cell(value, sheet.headers[index])).join('')}</Row>`).join('')}
  </Table></Worksheet>`).join('')}
</Workbook>`;

  const sanitizeExportRow = (row, headers) => headers.map((header) => row?.[header] ?? '');

  window.FAMILY_SETTINGS_EXPORT = { SETTINGS_EXPORT_SHEETS, buildSpreadsheetXml, sanitizeExportRow };

  const getContext = () => {
    if (typeof state === 'undefined' || !state.supabase || !state.session?.user || !state.household?.id) return null;
    return { supabase: state.supabase, householdId: state.household.id };
  };

  const injectStyle = () => {
    if (document.querySelector('style[data-settings-data-export-style]')) return;
    const style = document.createElement('style');
    style.dataset.settingsDataExportStyle = '';
    style.textContent = `
      .settings-data-export-card[hidden] { display: none !important; }
      .settings-data-export-card { margin-top: 16px; }
      .settings-data-export-copy { display: grid; gap: 4px; }
      .settings-data-export-sheets { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0; padding: 0; list-style: none; }
      .settings-data-export-sheets li { padding: 5px 9px; border: 1px solid var(--separator); border-radius: 999px; color: var(--secondary); background: var(--surface-2); font-size: 10px; }
      .settings-data-export-action { width: 100%; min-height: 44px; border: 1px solid var(--separator); border-radius: 12px; color: var(--label); background: var(--surface-2); font: inherit; font-size: 12px; font-weight: 750; }
      .settings-data-export-action:disabled { opacity: .55; }
      .settings-data-export-status { min-height: 1.2em; margin: 10px 0 0; color: var(--secondary); font-size: 10px; }
      .settings-data-export-status.error { color: var(--red); }
    `;
    document.head.appendChild(style);
  };

  const waitForSettingsView = async () => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const view = document.querySelector('#settingsView');
      if (view) return view;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  };

  const createCard = (view) => {
    const existing = view.querySelector('[data-settings-data-export]');
    if (existing) return existing;
    const card = document.createElement('section');
    card.className = 'settings-card settings-data-export-card';
    card.dataset.settingsDataExport = '';
    card.hidden = true;
    card.setAttribute('aria-labelledby', 'settingsDataExportTitle');
    card.innerHTML = `
      <div class="settings-heading">
        <span class="settings-mark" aria-hidden="true">⇩</span>
        <div class="settings-data-export-copy">
          <p class="eyebrow">내 데이터</p>
          <h2 id="settingsDataExportTitle">데이터 내보내기</h2>
          <span>현재 가족 그룹의 공유 기록을 Excel 파일로 저장하세요.</span>
        </div>
      </div>
      <ul class="settings-data-export-sheets" aria-label="내보내는 시트">
        ${SETTINGS_EXPORT_SHEETS.map((sheet) => `<li>${escapeXml(sheet.name)}</li>`).join('')}
      </ul>
      <button class="settings-data-export-action" type="button" data-settings-export-download>Excel(.xls) 다운로드</button>
      <p class="settings-data-export-status" data-settings-export-status aria-live="polite">파일은 이 브라우저에서만 만들어져요.</p>
    `;
    view.appendChild(card);
    return card;
  };

  const setVisibility = (card) => {
    const ready = Boolean(getContext());
    card.hidden = !ready;
    return ready;
  };

  const readSheet = async (sheet, context) => {
    const { data, error } = await sheet.query(context.supabase, context.householdId);
    if (error) throw error;
    return { name: sheet.name, headers: sheet.headers, rows: sheet.rows(Array.isArray(data) ? data : []) };
  };

  const download = async (card) => {
    const context = getContext();
    const downloadButton = card.querySelector('[data-settings-export-download]');
    const status = card.querySelector('[data-settings-export-status]');
    if (!context || !downloadButton) return;
    downloadButton.disabled = true;
    downloadButton.textContent = '파일을 준비하는 중…';
    status.classList.remove('error');
    status.textContent = '가족 기록을 안전하게 모으고 있어요.';
    try {
      const sheets = await Promise.all(SETTINGS_EXPORT_SHEETS.map((sheet) => readSheet(sheet, context)));
      const workbook = buildSpreadsheetXml(sheets);
      const blob = new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `family-data-${date}.xls`;
      anchor.hidden = true;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      status.textContent = `마지막 다운로드 · ${new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date())}`;
      if (typeof toast === 'function') toast('Excel 파일을 저장했어요');
    } catch (error) {
      console.error('Excel 데이터 내보내기 실패', error);
      status.classList.add('error');
      status.textContent = '내보내기에 실패했어요. 잠시 후 다시 시도해 주세요.';
      if (typeof toast === 'function') toast('Excel 파일을 만들지 못했어요');
    } finally {
      downloadButton.disabled = false;
      downloadButton.textContent = 'Excel(.xls) 다운로드';
    }
  };

  const init = async () => {
    const view = await waitForSettingsView();
    if (!view) return;
    injectStyle();
    const card = createCard(view);
    const update = () => setVisibility(card);
    update();
    window.addEventListener('familycontextchange', update);
    card.querySelector('[data-settings-export-download]').addEventListener('click', () => download(card));
  };

  init();
})();
