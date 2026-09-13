(() => {
  const BACKUP_SCHEMA_VERSION = 3;
  const LEGACY_SCHEMA_VERSION = 1;
  const SUPPORTED_SCHEMA_VERSIONS = [LEGACY_SCHEMA_VERSION, 2, BACKUP_SCHEMA_VERSION];
  const TABLES = ['events', 'growth_entries', 'calendar_members', 'babies', 'family_todos'];
  const OMIT_KEYS = new Set([
    'household_id', 'created_by', 'owner_id', 'user_id', 'access_token',
    'invite_code', 'photo_path', 'photo_paths', 'photoPaths', 'photoUrls', 'signed_url', 'private_entries', 'createdBy',
  ]);

  const hash = (value) => {
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (const character of String(value)) {
      const code = character.charCodeAt(0);
      first ^= code;
      first = Math.imul(first, 0x01000193) >>> 0;
      second ^= code + 0x9e3779b9;
      second = Math.imul(second, 0x85ebca6b) >>> 0;
    }
    return `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`;
  };

  const householdFingerprint = (householdId) => `hh-${hash(householdId)}`;

  const sanitizeValue = (value, version = BACKUP_SCHEMA_VERSION) => {
    if (Array.isArray(value)) return value.map(child => sanitizeValue(child, version));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !OMIT_KEYS.has(key) || (version < 3 && ['photoPaths','photoUrls','createdBy'].includes(key)))
      .map(([key, child]) => [key, sanitizeValue(child, version)]));
  };

  const stableStringify = (value) => {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  };

  const canonicalTables = (tables = {}, version = BACKUP_SCHEMA_VERSION) => Object.fromEntries(TABLES.filter((table) => version >= 3 || table !== 'family_todos').map((table) => [
    table,
    (Array.isArray(tables[table]) ? tables[table] : [])
      .filter((row) => table !== 'family_todos' || row.visibility === 'family')
      .map(row => sanitizeValue(row, version))
      .sort((left, right) => {
        const first = stableStringify(left);
        const second = stableStringify(right);
        return first === second ? 0 : first < second ? -1 : 1;
      }),
  ]));

  const createBackupId = (householdId, tables = {}, schemaVersion = BACKUP_SCHEMA_VERSION) =>
    `bk-${hash(`${householdFingerprint(householdId)}|${schemaVersion}|${stableStringify(canonicalTables(tables, schemaVersion))}`)}`;

  const isDuplicateBackup = (id, importedIds = []) => Boolean(id) && importedIds.includes(id);

  const createBackupPayload = (householdId, tables = {}, exportedAt = new Date()) => ({
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date(exportedAt).toISOString(),
    householdFingerprint: householdFingerprint(householdId),
    backupId: createBackupId(householdId, tables),
    tables: canonicalTables(tables),
    photos: [],
  });

  const validateBackupPayload = (payload, householdId) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, reason: 'invalid-payload' };
    if (!SUPPORTED_SCHEMA_VERSIONS.includes(payload.schemaVersion)) return { ok: false, reason: 'unsupported-version' };
    if (payload.householdFingerprint !== householdFingerprint(householdId)) return { ok: false, reason: 'household-mismatch' };
    if (!payload.tables || typeof payload.tables !== 'object' || Array.isArray(payload.tables)) return { ok: false, reason: 'invalid-tables' };
    if (Object.keys(payload.tables).some((table) => !TABLES.includes(table))) return { ok: false, reason: 'unknown-table' };
    if (TABLES.filter((table) => payload.schemaVersion >= 3 || table !== 'family_todos').some((table) => !Array.isArray(payload.tables[table]))) return { ok: false, reason: 'invalid-table-rows' };
    if (payload.schemaVersion >= 3 && (payload.tables.family_todos.some((row) => row.visibility !== 'family') || !Array.isArray(payload.photos))) return { ok: false, reason: 'invalid-extras' };
    if (payload.backupId && payload.backupId !== createBackupId(householdId, payload.tables, payload.schemaVersion)) return { ok: false, reason: 'invalid-backup-id' };
    return { ok: true };
  };

  const getBackupId = (payload, householdId) => payload?.backupId || createBackupId(householdId, payload?.tables, payload?.schemaVersion || LEGACY_SCHEMA_VERSION);

  window.FAMILY_SETTINGS_BACKUP = {
    BACKUP_SCHEMA_VERSION,
    LEGACY_SCHEMA_VERSION,
    SUPPORTED_SCHEMA_VERSIONS,
    TABLES,
    stableStringify,
    canonicalTables,
    createBackupId,
    createBackupPayload,
    householdFingerprint,
    getBackupId,
    isDuplicateBackup,
    sanitizeValue,
    validateBackupPayload,
  };
})();
