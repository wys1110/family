(() => {
  const MAX_NAME_LENGTH = 20;
  const COLOR_HASH = String.fromCharCode(35);
  const memberPalette = () => (typeof MEMBER_COLORS !== 'undefined' && Array.isArray(MEMBER_COLORS) ? MEMBER_COLORS : []);
  const defaultColor = () => memberPalette()[0] || `${COLOR_HASH}65716a`;
  const LOCAL_KEYS = {
    members: 'family-calendar-members-v1',
    archivedMembers: 'family-calendar-members-archived-v1',
    events: 'family-calendar-events-v1',
    growth: 'family-growth-entries-v1',
    babies: 'family-babies-v1',
    imports: 'family-backup-imports-v1',
  };
  const BACKUP_TABLES = ['events', 'growth_entries', 'calendar_members', 'babies'];
  const backupApi = window.FAMILY_SETTINGS_BACKUP || {};

  const normalizeMember = ({ name = '', color } = {}) => {
    const normalizedName = String(name).trim().slice(0, MAX_NAME_LENGTH);
    if (!normalizedName) return null;
    const normalizedColor = /^#[0-9a-f]{6}$/i.test(String(color)) ? String(color).toUpperCase() : defaultColor();
    return { name: normalizedName, color: normalizedColor };
  };
  const hasDuplicateName = (members, name, exceptId = '') => {
    const normalized = String(name).trim().toLocaleLowerCase();
    return members.some((member) => member.id !== exceptId && String(member.name).trim().toLocaleLowerCase() === normalized);
  };
  const archiveDecision = (name, events = []) => ({
    mode: 'archive',
    reason: events.some((event) => event?.member === name) ? 'referenced' : 'unused',
  });
  const scopeRestoreRow = (table, row, context) => {
    const copy = { ...row };
    delete copy.id;
    delete copy.household_id;
    delete copy.created_by;
    delete copy.updated_at;
    delete copy.created_at;
    if (table === 'calendar_members') copy.sort_order = Number.isFinite(copy.sort_order) ? copy.sort_order : 0;
    return { ...copy, household_id: context.householdId, created_by: context.userId };
  };
  const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null);
  const nullable = (value) => value === undefined || value === '' ? null : value;
  const remapBackupTables = (tables, context, createId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`) => {
    const babyIdMap = new Map();
    const babies = (tables.babies || []).map((row) => {
      const id = createId();
      if (row.id) babyIdMap.set(row.id, id);
      return {
        id,
        household_id: context.householdId,
        created_by: context.userId,
        name: row.name,
        birth_date: firstDefined(row.birth_date, row.birthDate),
        birth_time: nullable(firstDefined(row.birth_time, row.birthTime)),
        sex: nullable(row.sex),
        birth_weight_kg: nullable(firstDefined(row.birth_weight_kg, row.birthWeight)),
        birth_height_cm: nullable(firstDefined(row.birth_height_cm, row.birthHeight)),
        archived_at: nullable(row.archived_at),
      };
    });
    const events = (tables.events || []).map((row) => ({
      id: createId(),
      household_id: context.householdId,
      created_by: context.userId,
      title: row.title,
      event_date: firstDefined(row.event_date, row.date),
      event_end_date: firstDefined(row.event_end_date, row.endDate, row.event_date, row.date),
      event_time: nullable(firstDefined(row.event_time, row.time)),
      member: row.member || '가족',
      note: nullable(row.note),
    }));
    const calendarMembers = (tables.calendar_members || []).map((row, index) => ({
      id: createId(),
      household_id: context.householdId,
      created_by: context.userId,
      name: row.name,
      color: row.color || defaultColor(),
      sort_order: Number.isFinite(row.sort_order) ? row.sort_order : index,
      archived_at: nullable(row.archived_at),
    }));
    const growth_entries = (tables.growth_entries || []).map((row) => {
      const sourceBabyId = firstDefined(row.baby_id, row.babyId);
      return {
        id: createId(),
        household_id: context.householdId,
        created_by: context.userId,
        baby_id: sourceBabyId ? (babyIdMap.get(sourceBabyId) || null) : null,
        title: row.title,
        entry_date: firstDefined(row.entry_date, row.date),
        entry_time: nullable(firstDefined(row.entry_time, row.time)),
        category: row.category || '기타',
        height_cm: nullable(firstDefined(row.height_cm, row.height)),
        weight_kg: nullable(firstDefined(row.weight_kg, row.weight)),
        head_cm: nullable(firstDefined(row.head_cm, row.head)),
        feeding_ml: nullable(firstDefined(row.feeding_ml, row.feedingMl)),
        feeding_type: nullable(firstDefined(row.feeding_type, row.feedingType)),
        feeding_side: nullable(firstDefined(row.feeding_side, row.feedingSide)),
        feeding_minutes: nullable(firstDefined(row.feeding_minutes, row.feedingMinutes)),
        sleep_minutes: nullable(firstDefined(row.sleep_minutes, row.sleepMinutes)),
        temperature_c: nullable(firstDefined(row.temperature_c, row.temperature)),
        diaper_kind: nullable(firstDefined(row.diaper_kind, row.diaperKind)),
        note: nullable(row.note),
      };
    });
    return { events, growth_entries, calendar_members: calendarMembers, babies };
  };
  const api = { normalizeMember, hasDuplicateName, archiveDecision, scopeRestoreRow, remapBackupTables };
  window.FAMILY_SETTINGS_MANAGEMENT_API = api;

  if (document.querySelector('[data-settings-family-management-module]')) return;

  const settingsView = document.querySelector('#settingsView');
  if (!settingsView) return;
  settingsView.dataset.settingsFamilyManagementModule = 'ready';

  const demoStorageKey = (key) => window.FAMILY_DEMO?.storageKey?.(key) || key;
  const readJson = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(demoStorageKey(key)) || 'null');
      return value ?? fallback;
    } catch { return fallback; }
  };
  const writeJson = (key, value) => localStorage.setItem(demoStorageKey(key), JSON.stringify(value));
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
  const currentContext = () => {
    if (typeof state === 'undefined') return { mode: 'local', householdId: 'local', session: null, supabase: null };
    const householdId = state.household?.id || 'local';
    const remote = Boolean(state.supabase && state.session && state.household?.id);
    return { mode: remote ? 'remote' : 'local', householdId, session: state.session, supabase: remote ? state.supabase : null };
  };
  const withAuthRecovery = (operation, context) => window.FAMILY_AUTH_API.withRecovery(operation, {
    supabase: context.supabase,
    userId: context.session.user.id,
    isCurrent: () => {
      const current = currentContext();
      return current.mode === 'remote'
        && current.supabase === context.supabase
        && current.session.user.id === context.session.user.id
        && current.householdId === context.householdId;
    },
  });
  const canManage = () => Boolean(window.FAMILY_PERMISSIONS_API?.isOwner?.());
  const ownerOnlyMessage = '가족 관리자만 사용할 수 있어요.';
  const archivedStorageKey = (householdId) => `${LOCAL_KEYS.archivedMembers}:${householdId}`;
  const importedBackupsKey = (householdId) => `${LOCAL_KEYS.imports}:${householdId}`;
  const readArchived = (householdId) => readJson(archivedStorageKey(householdId), []);
  const readImportedBackups = (householdId) => readJson(importedBackupsKey(householdId), []);
  const isArchived = (member, householdId) => Boolean(member?.archived_at) || readArchived(householdId).includes(member?.id || member?.name);
  const activeMembers = (members, householdId) => members.filter((member) => !isArchived(member, householdId));
  const notify = (message) => { if (typeof toast === 'function') toast(message); };
  const refreshApp = () => {
    if (typeof render === 'function') render();
    window.dispatchEvent(new CustomEvent('family:settings-members-changed'));
  };
  const setArchivedLocally = (member, householdId) => {
    const archived = new Set(readArchived(householdId));
    archived.add(member.id || member.name);
    writeJson(archivedStorageKey(householdId), [...archived]);
  };
  const markBackupImportedLocally = (householdId, backupId) => {
    const imported = new Set(readImportedBackups(householdId));
    imported.add(backupId);
    writeJson(importedBackupsKey(householdId), [...imported]);
  };

  const listMembers = () => {
    const context = currentContext();
    const members = context.mode === 'local'
      ? readJson(LOCAL_KEYS.members, typeof state !== 'undefined' ? state.familyMembers : [])
      : (typeof state !== 'undefined' ? state.familyMembers : []);
    return activeMembers(Array.isArray(members) ? members : [], context.householdId);
  };

  const replaceStateMembers = (members, householdId) => {
    if (typeof state === 'undefined') return;
    state.familyMembers = activeMembers(members, householdId).map((member) => ({
      ...member,
      color: normalizeMember(member)?.color || defaultColor(),
    }));
    if (!state.familyMembers.some((member) => member.name === state.quickMember)) {
      state.quickMember = state.familyMembers[0]?.name || '가족';
    }
  };

  const loadMembers = async () => {
    const context = currentContext();
    if (context.mode === 'remote') {
      const { data, error } = await withAuthRecovery(() => context.supabase.from('calendar_members')
        .select('*').eq('household_id', context.householdId).order('sort_order'), context);
      if (error) throw error;
      replaceStateMembers(Array.isArray(data) ? data : [], context.householdId);
      return;
    }
    replaceStateMembers(readJson(LOCAL_KEYS.members, typeof state !== 'undefined' ? state.familyMembers : []), context.householdId);
  };

  const saveMember = async (draft, memberId = '') => {
    const context = currentContext();
    const normalized = normalizeMember(draft);
    if (!normalized) throw new Error('이름을 입력해 주세요.');
    const members = listMembers();
    if (hasDuplicateName(members, normalized.name, memberId)) throw new Error('같은 이름의 구성원이 있어요.');

    if (context.mode === 'remote') {
      if (memberId) {
        const { data, error } = await withAuthRecovery(() => context.supabase.from('calendar_members')
          .update({ name: normalized.name, color: normalized.color, updated_at: new Date().toISOString() })
          .eq('household_id', context.householdId).eq('id', memberId).select().single(), context);
        if (error) throw error;
        replaceStateMembers([...members.filter((member) => member.id !== memberId), data], context.householdId);
      } else {
        const { data, error } = await withAuthRecovery(() => context.supabase.from('calendar_members').insert({
          household_id: context.householdId,
          name: normalized.name,
          color: normalized.color,
          sort_order: members.length,
          created_by: context.session.user.id,
        }).select().single(), context);
        if (error) throw error;
        replaceStateMembers([...members, data], context.householdId);
      }
    } else {
      const current = readJson(LOCAL_KEYS.members, typeof state !== 'undefined' ? state.familyMembers : []);
      const updated = memberId
        ? current.map((member) => member.id === memberId ? { ...member, ...normalized } : member)
        : [...current, { ...normalized, id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, sort_order: current.length }];
      writeJson(LOCAL_KEYS.members, updated);
      replaceStateMembers(updated, context.householdId);
    }
    refreshApp();
  };

  const archiveMember = async (member) => {
    const context = currentContext();
    const decision = archiveDecision(member.name, typeof state !== 'undefined' ? state.events : []);
    if (member.name === '가족' && listMembers().length <= 1) throw new Error('기본 구성원은 보관할 수 없어요.');
    if (!window.confirm(`${member.name} 구성원을 보관할까요?${decision.reason === 'referenced' ? '\n기존 일정은 그대로 유지됩니다.' : ''}`)) return false;
    if (context.mode === 'remote' && member.id) {
      const { error } = await withAuthRecovery(() => context.supabase.from('calendar_members')
        .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('household_id', context.householdId).eq('id', member.id), context);
      if (error) {
        if (!/archived_at|column/i.test(error.message || '')) throw error;
        setArchivedLocally(member, context.householdId);
      }
      replaceStateMembers(listMembers().filter((item) => item.id !== member.id), context.householdId);
    } else {
      setArchivedLocally(member, context.householdId);
      replaceStateMembers(listMembers().filter((item) => item.id !== member.id && item.name !== member.name), context.householdId);
    }
    refreshApp();
    return true;
  };

  const readSharedTables = async (context) => {
    if (context.mode === 'local') {
      return {
        events: readJson(LOCAL_KEYS.events, typeof state !== 'undefined' ? state.events : []),
        growth_entries: readJson(LOCAL_KEYS.growth, typeof state !== 'undefined' ? state.growthEntries : []),
        calendar_members: readJson(LOCAL_KEYS.members, typeof state !== 'undefined' ? state.familyMembers : []),
        babies: readJson(LOCAL_KEYS.babies, typeof state !== 'undefined' ? state.babies : []),
      };
    }
    const results = await Promise.all(BACKUP_TABLES.map(async (table) => {
      const { data, error } = await withAuthRecovery(() => context.supabase.from(table).select('*').eq('household_id', context.householdId), context);
      if (error) throw error;
      return [table, Array.isArray(data) ? data : []];
    }));
    return Object.fromEntries(results);
  };

  const newId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const localEventRow = (row, id) => ({
    ...row,
    id,
    date: row.date || row.event_date || '',
    endDate: row.endDate || row.event_end_date || row.date || row.event_date || '',
    time: row.time ?? row.event_time ?? '',
  });
  const localBabyRow = (row, id) => ({
    ...row,
    id,
    birthDate: row.birthDate || row.birth_date || '',
    birthTime: row.birthTime ?? row.birth_time ?? '',
    birthWeight: row.birthWeight ?? row.birth_weight_kg ?? null,
    birthHeight: row.birthHeight ?? row.birth_height_cm ?? null,
  });
  const localGrowthRow = (row, id, babyId) => ({
    ...row,
    id,
    babyId,
    date: row.date || row.entry_date || '',
    time: row.time ?? row.entry_time ?? '',
    height: row.height ?? row.height_cm ?? null,
    weight: row.weight ?? row.weight_kg ?? null,
    head: row.head ?? row.head_cm ?? null,
    feedingMl: row.feedingMl ?? row.feeding_ml ?? null,
    sleepMinutes: row.sleepMinutes ?? row.sleep_minutes ?? null,
    temperature: row.temperature ?? row.temperature_c ?? null,
    diaperKind: row.diaperKind ?? row.diaper_kind ?? '',
    feedingType: row.feedingType ?? row.feeding_type ?? '',
    feedingSide: row.feedingSide ?? row.feeding_side ?? '',
    feedingMinutes: row.feedingMinutes ?? row.feeding_minutes ?? null,
  });
  const restoreLocal = (tables, context, backupId) => {
    if (typeof state === 'undefined') return { duplicate: false };
    if (backupApi.isDuplicateBackup?.(backupId, readImportedBackups(context.householdId))) return { duplicate: true };
    const babyIdMap = new Map();
    const babies = (tables.babies || []).map((row) => {
      const id = newId();
      if (row.id) babyIdMap.set(row.id, id);
      return localBabyRow(row, id);
    });
    const events = (tables.events || []).map((row) => localEventRow(row, newId()));
    const growth = (tables.growth_entries || []).map((row) => localGrowthRow(row, newId(), babyIdMap.get(row.babyId || row.baby_id) || null));
    const existingNames = new Set(state.familyMembers.map((member) => member.name));
    const members = (tables.calendar_members || []).filter((row) => !existingNames.has(row.name)).map((row) => ({ ...row, id: newId() }));
    state.events.push(...events);
    state.growthEntries.push(...growth);
    state.babies.push(...babies);
    state.familyMembers.push(...members);
    writeJson(LOCAL_KEYS.events, state.events);
    writeJson(LOCAL_KEYS.growth, state.growthEntries);
    writeJson(LOCAL_KEYS.babies, state.babies);
    writeJson(LOCAL_KEYS.members, state.familyMembers);
    markBackupImportedLocally(context.householdId, backupId);
    return { duplicate: false };
  };

  const restoreRemote = async (tables, context, backupId) => {
    const normalizedTables = remapBackupTables(tables, {
      householdId: context.householdId,
      userId: context.session.user.id,
    });
    const { data, error } = await withAuthRecovery(() => context.supabase.rpc('restore_household_backup', {
      target_household_id: context.householdId,
      p_backup_id: backupId,
      p_tables: normalizedTables,
    }), context);
    if (error) {
      if (/restore_household_backup|relation|schema cache|household_backup_imports/i.test(error.message || '')) {
        throw new Error('backup-registry-missing');
      }
      throw error;
    }
    return { duplicate: Boolean(data?.duplicate) };
  };

  const downloadJson = async (card) => {
    const context = currentContext();
    const button = card.querySelector('[data-settings-backup-download]');
    const status = card.querySelector('[data-settings-backup-status]');
    if (!canManage()) {
      status.textContent = ownerOnlyMessage;
      return;
    }
    button.disabled = true;
    status.textContent = '가족 기록을 모으는 중…';
    try {
      const tables = await readSharedTables(context);
      const payload = backupApi.createBackupPayload(context.householdId, tables);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `family-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      status.textContent = 'JSON 백업을 저장했어요.';
      notify('가족 JSON 백업을 저장했어요');
    } catch (error) {
      console.error('가족 JSON 백업 실패', error);
      status.textContent = '백업에 실패했어요. 잠시 후 다시 시도해 주세요.';
      notify('JSON 백업을 만들지 못했어요');
    } finally {
      button.disabled = false;
    }
  };

  const installDataCard = () => {
    const card = document.createElement('section');
    card.className = 'settings-card settings-family-data-card';
    card.dataset.settingsFamilyData = '';
    card.setAttribute('aria-labelledby', 'settingsFamilyDataTitle');
    card.innerHTML = `
      <div class="settings-heading">
        <span class="settings-mark" aria-hidden="true">⇄</span>
        <div><p class="eyebrow">데이터 관리</p><h2 id="settingsFamilyDataTitle">백업과 복원</h2><span>현재 가족 공간의 공유 기록만 안전하게 다룹니다.</span></div>
      </div>
      <div class="settings-family-data-actions">
        <button type="button" data-settings-backup-download>JSON 백업</button>
        <label class="settings-family-file-button">JSON 복원 파일 선택<input type="file" accept="application/json,.json" data-settings-backup-input hidden /></label>
      </div>
      <div class="settings-family-restore-preview" data-settings-restore-preview hidden></div>
      <button type="button" class="settings-family-restore-button" data-settings-backup-restore disabled>검증 후 복원</button>
      <p class="settings-family-data-status" data-settings-backup-status aria-live="polite">Excel 보고서는 아래 내보내기 카드에서 계속 사용할 수 있어요.</p>
    `;
    const backupButton = card.querySelector('[data-settings-backup-download]');
    const input = card.querySelector('[data-settings-backup-input]');
    const restoreButton = card.querySelector('[data-settings-backup-restore]');
    const preview = card.querySelector('[data-settings-restore-preview]');
    let pendingPayload = null;
    const syncPermission = () => {
      const allowed = canManage();
      backupButton.disabled = !allowed;
      input.disabled = !allowed;
      restoreButton.disabled = !allowed || !pendingPayload;
      if (!allowed) card.querySelector('[data-settings-backup-status]').textContent = ownerOnlyMessage;
    };
    backupButton.addEventListener('click', () => downloadJson(card));
    input.addEventListener('change', async () => {
      if (!canManage()) {
        syncPermission();
        return;
      }
      const [file] = input.files || [];
      input.value = '';
      if (!file) return;
      const status = card.querySelector('[data-settings-backup-status]');
      try {
        const payload = JSON.parse(await file.text());
        const result = backupApi.validateBackupPayload(payload, currentContext().householdId);
        if (!result.ok) throw new Error(result.reason);
        pendingPayload = payload;
        const counts = BACKUP_TABLES.map((table) => `${table}: ${(payload.tables[table] || []).length}개`).join(' · ');
        preview.textContent = `복원 대기 · ${counts}`;
        preview.hidden = false;
        restoreButton.disabled = false;
        status.textContent = '파일 검증 완료. 복원 버튼을 누르면 기존 기록에 추가합니다.';
      } catch (error) {
        pendingPayload = null;
        preview.hidden = true;
        restoreButton.disabled = true;
        status.textContent = error.message === 'household-mismatch' ? '다른 가족 공간의 백업 파일이라 복원하지 않았어요.' : '지원하지 않는 백업 파일이에요.';
      }
    });
    restoreButton.addEventListener('click', async () => {
      if (!canManage()) {
        syncPermission();
        return;
      }
      if (!pendingPayload || !window.confirm('기존 기록은 유지하고 백업 기록을 추가할까요?')) return;
      const status = card.querySelector('[data-settings-backup-status]');
      restoreButton.disabled = true;
      try {
        const context = currentContext();
        const backupId = backupApi.getBackupId(pendingPayload, context.householdId);
        const result = context.mode === 'remote'
          ? await restoreRemote(pendingPayload.tables, context, backupId)
          : restoreLocal(pendingPayload.tables, context, backupId);
        pendingPayload = null;
        preview.hidden = true;
        if (result.duplicate) {
          status.textContent = '이 백업은 이미 복원된 기록이에요.';
          notify('이미 복원한 백업이에요');
        } else {
          status.textContent = '복원이 완료됐어요.';
          await loadMembers();
          refreshApp();
          notify('가족 기록을 복원했어요');
        }
      } catch (error) {
        console.error('가족 JSON 복원 실패', error);
        status.textContent = error.message === 'backup-registry-missing'
          ? 'Supabase 마이그레이션 적용 후 복원할 수 있어요.'
          : '복원에 실패했어요. 새 기록 자동 정리를 시도했어요.';
      } finally {
        syncPermission();
      }
    });
    window.addEventListener('familycontextchange', syncPermission);
    syncPermission();
    return card;
  };

  const renderMemberList = (card) => {
    const list = card.querySelector('[data-settings-family-members]');
    const members = listMembers();
    const allowed = canManage();
    card.querySelector('[data-settings-member-count]').textContent = `${members.length}명`;
    list.replaceChildren(...members.map((member) => {
      const row = document.createElement('form');
      row.className = 'settings-family-member-row';
      row.dataset.memberId = member.id || member.name;
      row.innerHTML = `
        <span class="settings-family-member-dot" style="--member-color:${escapeHtml(normalizeMember(member)?.color || defaultColor())}" aria-hidden="true"></span>
        <label><span class="sr-only">구성원 이름</span><input name="memberName" maxlength="${MAX_NAME_LENGTH}" value="${escapeHtml(member.name)}"${allowed ? '' : ' disabled'} /></label>
        <label class="settings-family-color"><span class="sr-only">구성원 색상</span><input name="memberColor" type="color" value="${escapeHtml(normalizeMember(member)?.color || defaultColor())}"${allowed ? '' : ' disabled'} /></label>
        <button type="submit" data-member-save${allowed ? '' : ' disabled'}>저장</button>
        <button type="button" data-member-archive${allowed ? '' : ' disabled'}>보관</button>
      `;
      return row;
    }));
  };

  const installMembersCard = () => {
    const card = document.createElement('section');
    card.className = 'settings-card settings-family-members-card';
    card.dataset.settingsFamilyMembers = '';
    card.setAttribute('aria-labelledby', 'settingsFamilyMembersTitle');
    card.innerHTML = `
      <div class="settings-heading">
        <span class="settings-mark" aria-hidden="true">●</span>
        <div><p class="eyebrow">가족 관리</p><h2 id="settingsFamilyMembersTitle">가족 구성원</h2><span>일정에 표시할 이름과 색상을 관리하세요.</span></div>
        <strong class="settings-family-count" data-settings-member-count>0명</strong>
      </div>
      <div class="settings-family-members-list" data-settings-family-members></div>
      <form class="settings-family-member-add" data-settings-family-member-add>
        <label><span>새 구성원</span><input name="memberName" maxlength="${MAX_NAME_LENGTH}" placeholder="예: 할머니" required /></label>
        <label class="settings-family-color"><span>색상</span><input name="memberColor" type="color" value="${escapeHtml(defaultColor())}" /></label>
        <button type="submit" data-settings-family-member-submit>추가</button>
      </form>
      <p class="settings-family-members-status" data-settings-family-members-status aria-live="polite">기존 일정은 구성원을 보관해도 그대로 남아요.</p>
    `;
    const syncPermission = () => {
      const allowed = canManage();
      card.querySelector('[data-settings-family-member-add]').querySelectorAll('input, button').forEach((control) => { control.disabled = !allowed; });
      if (!allowed) card.querySelector('[data-settings-family-members-status]').textContent = ownerOnlyMessage;
      renderMemberList(card);
    };
    card.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!canManage()) { syncPermission(); return; }
      const form = event.target;
      const isRow = form.matches('[data-member-id]');
      const status = card.querySelector('[data-settings-family-members-status]');
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        await saveMember({ name: form.elements.memberName.value, color: form.elements.memberColor.value }, isRow ? form.dataset.memberId : '');
        status.textContent = isRow ? '구성원을 수정했어요.' : '구성원을 추가했어요.';
        renderMemberList(card);
      } catch (error) {
        status.textContent = error.message || '구성원을 저장하지 못했어요.';
      } finally { submit.disabled = false; }
    });
    card.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-member-archive]');
      if (!button) return;
      if (!canManage()) { syncPermission(); return; }
      const row = button.closest('[data-member-id]');
      const member = listMembers().find((item) => (item.id || item.name) === row?.dataset.memberId);
      if (!member) return;
      const status = card.querySelector('[data-settings-family-members-status]');
      button.disabled = true;
      try { if (await archiveMember(member)) { status.textContent = '구성원을 보관했어요.'; renderMemberList(card); } }
      catch (error) { status.textContent = error.message || '구성원을 보관하지 못했어요.'; button.disabled = false; }
    });
    window.addEventListener('familycontextchange', syncPermission);
    syncPermission();
    return card;
  };

  const maskEmail = (value) => {
    const [name, domain] = String(value || '').split('@');
    if (!domain) return '로그인 계정 확인 필요';
    return `${name.slice(0, 2)}${name.length > 2 ? '••' : '•'}@${domain}`;
  };
  const installSpaceCard = () => {
    const card = document.createElement('section');
    card.className = 'settings-card settings-family-space-card';
    card.dataset.settingsFamilySpace = '';
    card.setAttribute('aria-labelledby', 'settingsFamilySpaceTitle');
    card.innerHTML = `
      <div class="settings-heading">
        <span class="settings-mark" aria-hidden="true">⌂</span>
        <div><p class="eyebrow">가족 공간</p><h2 id="settingsFamilySpaceTitle" data-settings-space-name>현재 공간</h2><span data-settings-space-account>저장 상태를 확인하는 중…</span></div>
      </div>
      <div class="settings-family-space-summary"><span data-settings-space-members>구성원 확인 중</span><span data-settings-space-scope>가족별로 분리 저장</span></div>
      <div class="settings-family-space-actions">
        <button type="button" data-settings-family-invite>초대 링크 공유</button>
        <button type="button" data-settings-family-logout>로그아웃</button>
      </div>
    `;
    const render = () => {
      const context = currentContext();
      const household = typeof state !== 'undefined' ? state.household : null;
      const session = typeof state !== 'undefined' ? state.session : null;
      card.querySelector('[data-settings-space-name]').textContent = household?.name || (context.mode === 'local' ? '이 기기 저장 공간' : '가족 공간');
      card.querySelector('[data-settings-space-account]').textContent = session?.user?.email ? maskEmail(session.user.email) : context.mode === 'local' ? '이 브라우저에만 저장 중' : '로그인 계정 확인 필요';
      card.querySelector('[data-settings-space-members]').textContent = `${listMembers().length}명 구성원`;
      card.querySelector('[data-settings-family-invite]').hidden = context.mode !== 'remote';
      card.querySelector('[data-settings-family-logout]').hidden = !session;
    };
    card.querySelector('[data-settings-family-invite]').addEventListener('click', () => {
      const accountInviteButton = document.querySelector('#accountContent #shareFamilyInvite');
      if (accountInviteButton) accountInviteButton.click();
      else notify('계정 메뉴에서 가족 초대 링크를 열어 주세요');
    });
    card.querySelector('[data-settings-family-logout]').addEventListener('click', () => {
      if (typeof signOutCurrentUser === 'function') signOutCurrentUser(card.querySelector('[data-settings-family-logout]'));
      else document.querySelector('#logoutButton')?.click();
    });
    window.addEventListener('familycontextchange', render);
    window.addEventListener('family:settings-members-changed', render);
    card.render = render;
    return card;
  };

  const install = async () => {
    const membersCard = installMembersCard();
    const spaceCard = installSpaceCard();
    const dataCard = installDataCard();
    const profileCard = settingsView.querySelector('.family-profile-settings');
    const insertAfterProfile = (card) => {
      if (profileCard) profileCard.insertAdjacentElement('afterend', card);
      else settingsView.insertBefore(card, settingsView.firstElementChild);
    };
    insertAfterProfile(membersCard);
    membersCard.insertAdjacentElement('afterend', spaceCard);
    spaceCard.insertAdjacentElement('afterend', dataCard);
    try { await loadMembers(); } catch (error) { console.error('설정 구성원 불러오기 실패', error); }
    renderMemberList(membersCard);
    spaceCard.render?.();
    window.addEventListener('familycontextchange', async () => {
      try { await loadMembers(); } catch (error) { console.error('가족 공간 구성원 동기화 실패', error); }
      renderMemberList(membersCard);
      spaceCard.render?.();
    });
  };

  install();
})();
