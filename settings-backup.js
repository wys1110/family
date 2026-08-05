(() => {
  const BACKUP_SCHEMA_VERSION = 1;
  const TABLES = ['events', 'growth_entries', 'calendar_members', 'babies'];
  const OMIT_KEYS = new Set([
    'household_id', 'created_by', 'owner_id', 'user_id', 'access_token',
    'invite_code', 'photo_path', 'photo_paths', 'signed_url', 'private_entries',
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

  const sanitizeValue = (value) => {
    if (Array.isArray(value)) return value.map(sanitizeValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !OMIT_KEYS.has(key))
      .map(([key, child]) => [key, sanitizeValue(child)]));
  };

  const createBackupPayload = (householdId, tables = {}, exportedAt = new Date()) => ({
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date(exportedAt).toISOString(),
    householdFingerprint: householdFingerprint(householdId),
    tables: Object.fromEntries(TABLES.map((table) => [
      table,
      Array.isArray(tables[table]) ? tables[table].map(sanitizeValue) : [],
    ])),
  });

  const validateBackupPayload = (payload, householdId) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, reason: 'invalid-payload' };
    if (payload.schemaVersion !== BACKUP_SCHEMA_VERSION) return { ok: false, reason: 'unsupported-version' };
    if (payload.householdFingerprint !== householdFingerprint(householdId)) return { ok: false, reason: 'household-mismatch' };
    if (!payload.tables || typeof payload.tables !== 'object' || Array.isArray(payload.tables)) return { ok: false, reason: 'invalid-tables' };
    if (Object.keys(payload.tables).some((table) => !TABLES.includes(table))) return { ok: false, reason: 'unknown-table' };
    if (TABLES.some((table) => !Array.isArray(payload.tables[table]))) return { ok: false, reason: 'invalid-table-rows' };
    return { ok: true };
  };

  window.FAMILY_SETTINGS_BACKUP = {
    BACKUP_SCHEMA_VERSION,
    TABLES,
    createBackupPayload,
    householdFingerprint,
    sanitizeValue,
    validateBackupPayload,
  };
})();
