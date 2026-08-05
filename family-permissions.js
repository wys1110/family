(() => {
  const canManage = (role) => role === 'owner';
  const currentRole = () => typeof state !== 'undefined' ? state.householdRole || null : null;
  const isOwner = () => canManage(currentRole());

  window.FAMILY_PERMISSIONS_API = { canManage, currentRole, isOwner };
})();
