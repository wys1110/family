(() => {
  if (window.FAMILY_AUTH_API) return;

  let refreshPromise = null;
  let refreshSupabase = null;
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

  const expired = ({ supabase, userId }) => {
    emit('family:auth-expired', { supabase, userId: userId || null });
    return false;
  };

  const refreshSession = async ({ supabase, userId }) => {
    if (!supabase?.auth?.refreshSession) {
      return expired({ supabase, userId });
    }

    if (!refreshPromise || refreshSupabase !== supabase || refreshUserId !== userId) {
      const flight = (async () => {
        try {
          const { data, error } = await supabase.auth.refreshSession();
          const session = data?.session;
          if (error || !session || (userId && session.user?.id !== userId)) {
            return expired({ supabase, userId });
          }
          emit('family:auth-session-refreshed', { session, supabase });
          return true;
        } catch {
          return expired({ supabase, userId });
        }
      })();
      refreshSupabase = supabase;
      refreshUserId = userId || null;
      refreshPromise = flight;
      flight.then(() => {
        if (refreshPromise !== flight) return;
        refreshPromise = null;
        refreshSupabase = null;
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
    if (typeof options.isCurrent === 'function' && !options.isCurrent()) return result;
    try {
      const retryResult = await operation();
      if (typeof options.isCurrent === 'function' && !options.isCurrent()) return result;
      if (isAuthError(retryResult?.error)) expired(options);
      return retryResult;
    } catch (error) {
      if (typeof options.isCurrent === 'function' && !options.isCurrent()) return result;
      if (!isAuthError(error)) throw error;
      expired(options);
      return { data: null, error };
    }
  };

  window.FAMILY_AUTH_API = { isAuthError, withRecovery };
})();
