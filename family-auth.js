(() => {
  if (window.FAMILY_AUTH_API) return;

  let refreshPromise = null;
  let refreshUserId = null;

  const isAuthError = (error) => {
    if (!error) return false;
    const status = Number(error.status ?? error.context?.status ?? error.response?.status);
    const code = String(error.code || '').toUpperCase();
    const message = String(error.message || error.details || '');
    return status === 401
      || code === 'PGRST301'
      || /jwt expired|invalid jwt|invalid token|unauthorized|not authenticated/i.test(message);
  };

  const emit = (type, detail = {}) => {
    window.dispatchEvent(new CustomEvent(type, { detail }));
  };

  const refreshSession = async ({ supabase, userId }) => {
    if (!supabase?.auth?.refreshSession) {
      emit('family:auth-expired');
      return false;
    }

    if (!refreshPromise || refreshUserId !== userId) {
      refreshUserId = userId || null;
      refreshPromise = (async () => {
        try {
          const { data, error } = await supabase.auth.refreshSession();
          const session = data?.session;
          if (error || !session || (userId && session.user?.id !== userId)) {
            if (!session || error) emit('family:auth-expired');
            return false;
          }
          emit('family:auth-session-refreshed', { session });
          return true;
        } catch {
          emit('family:auth-expired');
          return false;
        }
      })().finally(() => {
        refreshPromise = null;
        refreshUserId = null;
      });
    }

    return refreshPromise;
  };

  const withRecovery = async (operation, options = {}) => {
    let result;
    try {
      result = await operation();
    } catch (error) {
      if (!isAuthError(error)) throw error;
      result = { data: null, error };
    }
    if (!isAuthError(result?.error)) return result;

    const refreshed = await refreshSession(options);
    if (!refreshed) return result;
    return operation();
  };

  window.FAMILY_AUTH_API = { isAuthError, withRecovery };
})();
