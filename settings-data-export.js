(() => {
  if (document.documentElement.dataset.settingsDataExportModule === 'ready') return;
  document.documentElement.dataset.settingsDataExportModule = 'ready';

  const SETTINGS_EXPORT_SHEETS = [
    {
      name: '캘린더 가족 일정',
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
      name: '성장 기록 히스토리',
      headers: ['아기 ID', '제목', '기록일', '기록 시간', '분류', '키(cm)', '몸무게(kg)', '머리 둘레(cm)', '수유량(ml)', '수면(분)', '체온(°C)', '기저귀', '수유 유형', '수유 방향', '수유 시간(분)'],
      query: (supabase, householdId) => supabase.from('growth_entries')
        .select('baby_id,title,entry_date,entry_time,category,height_cm,weight_kg,head_cm,feeding_ml,sleep_minutes,temperature_c,diaper_kind,feeding_type,feeding_side,feeding_minutes')
        .eq('household_id', householdId)
        .order('entry_date', { ascending: false }),
      rows: (rows) => rows.map((row) => [
        row.baby_id,
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
  ];

  const escapeXml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;')
    .replace(/"/g, '&quot;');

  const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
  const normalizeCellValue = (value) => {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    return String(value);
  };
  const columnName = (index) => {
    let value = index + 1;
    let result = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      value = Math.floor((value - 1) / 26);
    }
    return result;
  };
  const worksheetCell = (value, reference, styleId = '') => {
    if (isNumber(value)) return `<c r="${reference}"${styleId ? ` s="${styleId}"` : ''}><v>${value}</v></c>`;
    return `<c r="${reference}"${styleId ? ` s="${styleId}"` : ''} t="inlineStr"><is><t xml:space="preserve">${escapeXml(normalizeCellValue(value))}</t></is></c>`;
  };
  const buildWorksheetXml = (sheet) => {
    const headerCells = sheet.headers.map((header, index) => worksheetCell(header, `${columnName(index)}1`, 1)).join('');
    const rows = (sheet.rows || []).map((row, rowIndex) => {
      const rowNumber = rowIndex + 2;
      const cells = row.map((value, columnIndex) => worksheetCell(value, `${columnName(columnIndex)}${rowNumber}`)).join('');
      return `<row r="${rowNumber}">${cells}</row>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData><row r="1">${headerCells}</row>${rows}</sheetData>
</worksheet>`;
  };
  const buildWorkbookXml = (sheets) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets>
</workbook>`;
  const buildWorkbookRelsXml = (sheets) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((sheet, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  const buildContentTypesXml = (sheets) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets.map((sheet, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>`;
  const buildRootRelsXml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const buildStylesXml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const writeUint16 = (view, offset, value) => view.setUint16(offset, value, true);
  const writeUint32 = (view, offset, value) => view.setUint32(offset, value, true);
  const concatBytes = (chunks) => {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    chunks.forEach((chunk) => { result.set(chunk, offset); offset += chunk.length; });
    return result;
  };
  const buildXlsxZip = (sheets = []) => {
    const encoder = new TextEncoder();
    const entries = [
      { name: '[Content_Types].xml', body: buildContentTypesXml(sheets) },
      { name: '_rels/.rels', body: buildRootRelsXml() },
      { name: 'xl/workbook.xml', body: buildWorkbookXml(sheets) },
      { name: 'xl/_rels/workbook.xml.rels', body: buildWorkbookRelsXml(sheets) },
      { name: 'xl/styles.xml', body: buildStylesXml() },
      ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, body: buildWorksheetXml(sheet) })),
    ];
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    entries.forEach((entry) => {
      const nameBytes = encoder.encode(entry.name);
      const dataBytes = encoder.encode(entry.body);
      const checksum = crc32(dataBytes);
      const local = new Uint8Array(30 + nameBytes.length + dataBytes.length);
      const localView = new DataView(local.buffer);
      writeUint32(localView, 0, 0x04034b50);
      writeUint16(localView, 4, 20);
      writeUint16(localView, 6, 0x0800);
      writeUint16(localView, 8, 0);
      writeUint16(localView, 10, 0);
      writeUint16(localView, 12, 0);
      writeUint32(localView, 14, checksum);
      writeUint32(localView, 18, dataBytes.length);
      writeUint32(localView, 22, dataBytes.length);
      writeUint16(localView, 26, nameBytes.length);
      writeUint16(localView, 28, 0);
      local.set(nameBytes, 30);
      local.set(dataBytes, 30 + nameBytes.length);
      localParts.push(local);

      const central = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(central.buffer);
      writeUint32(centralView, 0, 0x02014b50);
      writeUint16(centralView, 4, 20);
      writeUint16(centralView, 6, 20);
      writeUint16(centralView, 8, 0x0800);
      writeUint16(centralView, 10, 0);
      writeUint16(centralView, 12, 0);
      writeUint16(centralView, 14, 0);
      writeUint32(centralView, 16, checksum);
      writeUint32(centralView, 20, dataBytes.length);
      writeUint32(centralView, 24, dataBytes.length);
      writeUint16(centralView, 28, nameBytes.length);
      writeUint16(centralView, 30, 0);
      writeUint16(centralView, 32, 0);
      writeUint16(centralView, 34, 0);
      writeUint16(centralView, 36, 0);
      writeUint32(centralView, 38, 0);
      writeUint32(centralView, 42, offset);
      central.set(nameBytes, 46);
      centralParts.push(central);
      offset += local.length;
    });
    const centralDirectory = concatBytes(centralParts);
    const localFiles = concatBytes(localParts);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    writeUint32(endView, 0, 0x06054b50);
    writeUint16(endView, 4, 0);
    writeUint16(endView, 6, 0);
    writeUint16(endView, 8, entries.length);
    writeUint16(endView, 10, entries.length);
    writeUint32(endView, 12, centralDirectory.length);
    writeUint32(endView, 16, localFiles.length);
    writeUint16(endView, 20, 0);
    return concatBytes([localFiles, centralDirectory, end]);
  };

  const sanitizeExportRow = (row, headers) => headers.map((header) => row?.[header] ?? '');

  window.FAMILY_SETTINGS_EXPORT = { SETTINGS_EXPORT_SHEETS, buildXlsxZip, sanitizeExportRow };

  const getContext = () => {
    if (typeof state === 'undefined' || !state.supabase || !state.session?.user || !state.household?.id) return null;
    return { supabase: state.supabase, householdId: state.household.id, userId: state.session.user.id };
  };
  const canManage = () => Boolean(window.FAMILY_PERMISSIONS_API?.isOwner?.());

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
      <button class="settings-data-export-action" type="button" data-settings-export-download>Excel(.xlsx) 다운로드</button>
      <p class="settings-data-export-status" data-settings-export-status aria-live="polite">파일은 이 브라우저에서만 만들어져요.</p>
    `;
    view.appendChild(card);
    return card;
  };

  const setVisibility = (card) => {
    const ready = Boolean(getContext()) && canManage();
    card.hidden = !ready;
    return ready;
  };

  const readSheet = async (sheet, context) => {
    const { data, error } = await window.FAMILY_AUTH_API.withRecovery(
      () => sheet.query(context.supabase, context.householdId),
      {
        supabase: context.supabase,
        userId: context.userId,
        isCurrent: () => typeof state !== 'undefined'
          && state.supabase === context.supabase
          && state.session?.user?.id === context.userId
          && state.household?.id === context.householdId,
      },
    );
    if (error) throw error;
    return { name: sheet.name, headers: sheet.headers, rows: sheet.rows(Array.isArray(data) ? data : []) };
  };

  const download = async (card) => {
    const context = getContext();
    const downloadButton = card.querySelector('[data-settings-export-download]');
    const status = card.querySelector('[data-settings-export-status]');
    if (!context || !downloadButton) return;
    if (!canManage()) {
      status.textContent = '가족 관리자만 사용할 수 있어요.';
      return;
    }
    downloadButton.disabled = true;
    downloadButton.textContent = '파일을 준비하는 중…';
    status.classList.remove('error');
    status.textContent = '가족 기록을 안전하게 모으고 있어요.';
    try {
      const sheets = await Promise.all(SETTINGS_EXPORT_SHEETS.map((sheet) => readSheet(sheet, context)));
      const workbook = buildXlsxZip(sheets);
      const blob = new Blob([workbook], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `family-data-${date}.xlsx`;
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
      downloadButton.textContent = 'Excel(.xlsx) 다운로드';
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
